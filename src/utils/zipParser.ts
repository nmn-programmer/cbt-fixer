import JSZip from 'jszip';
import {
  ArchiveFormat,
  ImageAttachment,
  MarksScheme,
  PdfDataPart,
  QuestionData,
  QuestionPaperArchive,
  QuestionType,
  SectionData,
  SubjectData,
} from '../types/cbt';
import {
  buildImageFileName,
  generateId,
  parseImageFileName,
  SUPPORTED_IMAGE_EXTENSIONS,
} from './constants';

export interface ParseResult {
  archive: QuestionPaperArchive;
  warnings: string[];
}

/**
 * Parses raw JSON structure into unified QuestionPaperArchive.
 * Handles both Standard pdfCropper data, Ultimate structure, DPP, and QuessBank.
 */
export async function parseZipArchive(
  file: File | Blob,
  fileName: string = 'archive.zip'
): Promise<ParseResult> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const rawFilesMap = new Map<string, { blob: Blob; url: string; size: number }>();
  const warnings: string[] = [];

  // 1. Extract all binary files into memory blobs
  for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
    if (zipEntry.dir) continue;
    const arrayBuffer = await zipEntry.async('arraybuffer');
    const ext = relativePath.split('.').pop()?.toLowerCase() || '';
    let mimeType = 'application/octet-stream';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    } else if (ext === 'json') {
      mimeType = 'application/json';
    }

    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    rawFilesMap.set(relativePath, { blob, url, size: arrayBuffer.byteLength });
  }

  // 2. Identify JSON descriptors in the archive
  const jsonPaths = Array.from(rawFilesMap.keys()).filter((p) => p.endsWith('.json'));

  if (jsonPaths.length === 0) {
    // No data.json found; reconstruct from image naming scheme!
    return reconstructArchiveFromImageFiles(rawFilesMap, fileName, warnings);
  }

  // Check if it's an Ultimate ZIP (e.g. Physics/data.json, Chemistry/data.json)
  const isUltimateWithNestedJson = jsonPaths.some((p) => p.includes('/') && p.endsWith('data.json'));

  if (isUltimateWithNestedJson && !jsonPaths.includes('data.json')) {
    return parseUltimateNestedZip(rawFilesMap, jsonPaths, fileName, warnings);
  }

  // Look for root data.json
  const rootJsonPath = jsonPaths.find((p) => p === 'data.json' || !p.includes('/')) || jsonPaths[0];
  const rootJsonEntry = rawFilesMap.get(rootJsonPath);

  if (!rootJsonEntry) {
    throw new Error(`Unable to read ${rootJsonPath} in archive.`);
  }

  const jsonText = await rootJsonEntry.blob.text();
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err: any) {
    throw new Error(`Invalid JSON in ${rootJsonPath}: ${err.message}`);
  }

  // Detect Schema Format
  let format: ArchiveFormat = 'pdfCropper';
  if (parsedJson.testData) {
    format = 'quessbank';
  } else if (parsedJson.pdfCropperData) {
    // Check if sections contain "DPP"
    const firstSubject = Object.values(parsedJson.pdfCropperData)[0] as any;
    if (firstSubject && Object.keys(firstSubject).some((sec) => sec.toLowerCase().includes('dpp'))) {
      format = 'dpp';
    } else if (Object.keys(parsedJson.pdfCropperData).length > 2) {
      format = 'ultimate';
    }
  }

  // Normalize subjects and questions
  const subjects: SubjectData[] = [];
  const rawPdfData = parsedJson.pdfCropperData || parsedJson.testData || parsedJson.subjects || {};

  for (const [subjectName, sectionsObj] of Object.entries<any>(rawPdfData)) {
    if (typeof sectionsObj !== 'object' || sectionsObj === null) continue;

    const sections: SectionData[] = [];

    for (const [sectionName, questionsObj] of Object.entries<any>(sectionsObj)) {
      if (typeof questionsObj !== 'object' || questionsObj === null) continue;

      const questions: QuestionData[] = [];

      for (const [qKey, qVal] of Object.entries<any>(questionsObj)) {
        if (!qVal || typeof qVal !== 'object') continue;

        const qNumber = typeof qVal.que === 'number' ? qVal.que : parseInt(qKey, 10) || 1;
        const qType: QuestionType = normalizeQuestionType(qVal.type);
        const marks: MarksScheme = normalizeMarksScheme(qVal.marks, qType);
        const answerOptions: string = normalizeAnswerOptions(qVal.answerOptions);

        const pdfDataParts: PdfDataPart[] = Array.isArray(qVal.pdfData)
          ? qVal.pdfData.map((part: any, idx: number) => {
              const pPage = part.page ?? part.pageNumber ?? part.pageIndex ?? 1;
              return {
                ...part,
                page: pPage,
                pageNumber: pPage,
                x1: part.x1 ?? (part.xmin !== undefined ? Math.round(part.xmin * 1000) : 0),
                y1: part.y1 ?? (part.ymin !== undefined ? Math.round(part.ymin * 1000) : 0),
                x2: part.x2 ?? (part.xmax !== undefined ? Math.round(part.xmax * 1000) : 1000),
                y2: part.y2 ?? (part.ymax !== undefined ? Math.round(part.ymax * 1000) : 1000),
                filename:
                  part.filename ||
                  buildImageFileName(sectionName, qNumber, idx + 1, 'png'),
              };
            })
          : [];

        // Match images in archive
        const images: ImageAttachment[] = [];
        const expectedCount = Math.max(pdfDataParts.length, 1);

        for (let partIdx = 1; partIdx <= expectedCount; partIdx++) {
          const matchedImage = findMatchingImageInArchive(
            rawFilesMap,
            sectionName,
            qNumber,
            partIdx,
            subjectName
          );

          if (matchedImage) {
            images.push({
              id: generateId(),
              partIndex: partIdx,
              fileName: matchedImage.fileName,
              blobUrl: matchedImage.url,
              rawBlob: matchedImage.blob,
              mimeType: matchedImage.blob.type,
              sizeBytes: matchedImage.size,
            });
          }
        }

        // If no pdfData was provided, synthesize part 1 if an image was found
        if (pdfDataParts.length === 0 && images.length > 0) {
          images.forEach((_, idx) => {
            pdfDataParts.push({
              page: 1,
              x1: 0,
              y1: 0,
              x2: 100,
              y2: 100,
              filename: buildImageFileName(sectionName, qNumber, idx + 1, 'png'),
            });
          });
        }

        questions.push({
          id: generateId(),
          key: qKey,
          que: qNumber,
          type: qType,
          marks,
          answerOptions,
          isSplitQuestion: Boolean(qVal.isSplitQuestion || images.length > 1),
          pdfData: pdfDataParts,
          images,
          notes: qVal.notes || '',
          isFlagged: false,
        });
      }

      // Sort questions by question number
      questions.sort((a, b) => a.que - b.que);

      sections.push({
        id: generateId(),
        name: sectionName,
        questions,
      });
    }

    subjects.push({
      id: generateId(),
      name: subjectName,
      sections,
    });
  }

  const archive: QuestionPaperArchive = {
    id: generateId(),
    fileName,
    title: parsedJson.testConfig?.title || parsedJson.metadata?.testTitle || fileName.replace(/\.[^/.]+$/, ''),
    format,
    metadata: {
      pdfFileHash: parsedJson.testConfig?.pdfFileHash || parsedJson.metadata?.pdfFileHash || '',
      additionalData: parsedJson.testConfig?.additionalData || parsedJson.metadata?.additionalData || {},
      appVersion: parsedJson.appVersion || '2.6.0',
      generatedBy: parsedJson.generatedBy || 'pdfCropperPage',
      testTitle: parsedJson.testConfig?.title || parsedJson.metadata?.testTitle || '',
      durationMinutes: parsedJson.metadata?.durationMinutes || parsedJson.durationMinutes,
      totalMarks: parsedJson.metadata?.totalMarks || parsedJson.totalMarks,
      markingScheme: parsedJson.metadata?.markingScheme || parsedJson.markingScheme,
      instructionMarkingSummary: parsedJson.metadata?.instructionMarkingSummary || parsedJson.instructionMarkingSummary,
      hasInstructedMarkingScheme: Boolean(
        parsedJson.metadata?.hasInstructedMarkingScheme || parsedJson.hasInstructedMarkingScheme || parsedJson.metadata?.markingScheme
      ),
      createdAt: parsedJson.metadata?.createdAt || new Date().toISOString(),
    },
    subjects,
    rawFiles: rawFilesMap,
    isDirty: false,
    lastModified: Date.now(),
  };

  return { archive, warnings };
}

/**
 * Parser for Ultimate ZIPs that contain nested subject folders (e.g. Physics/data.json)
 */
async function parseUltimateNestedZip(
  rawFilesMap: Map<string, { blob: Blob; url: string; size: number }>,
  jsonPaths: string[],
  fileName: string,
  warnings: string[]
): Promise<ParseResult> {
  const subjects: SubjectData[] = [];

  for (const jsonPath of jsonPaths) {
    const parts = jsonPath.split('/');
    const subjectFolder = parts[0];
    const fileEntry = rawFilesMap.get(jsonPath);
    if (!fileEntry) continue;

    try {
      const text = await fileEntry.blob.text();
      const parsed = JSON.parse(text);
      const dataObj = parsed.pdfCropperData || parsed.testData || parsed;

      for (const [subName, sectionsObj] of Object.entries<any>(dataObj)) {
        const effectiveSubName = subName || subjectFolder;
        const sections: SectionData[] = [];

        for (const [secName, questionsObj] of Object.entries<any>(sectionsObj)) {
          if (typeof questionsObj !== 'object' || !questionsObj) continue;
          const questions: QuestionData[] = [];

          for (const [qKey, qVal] of Object.entries<any>(questionsObj)) {
            if (!qVal) continue;
            const qNumber = typeof qVal.que === 'number' ? qVal.que : parseInt(qKey, 10) || 1;
            const qType = normalizeQuestionType(qVal.type);
            const marks = normalizeMarksScheme(qVal.marks, qType);
            const answerOptions = normalizeAnswerOptions(qVal.answerOptions);

            const pdfDataParts: PdfDataPart[] = Array.isArray(qVal.pdfData)
              ? qVal.pdfData.map((part: any, idx: number) => {
                  const pPage = part.page ?? part.pageNumber ?? part.pageIndex ?? 1;
                  return {
                    ...part,
                    page: pPage,
                    pageNumber: pPage,
                    x1: part.x1 ?? (part.xmin !== undefined ? Math.round(part.xmin * 1000) : 0),
                    y1: part.y1 ?? (part.ymin !== undefined ? Math.round(part.ymin * 1000) : 0),
                    x2: part.x2 ?? (part.xmax !== undefined ? Math.round(part.xmax * 1000) : 1000),
                    y2: part.y2 ?? (part.ymax !== undefined ? Math.round(part.ymax * 1000) : 1000),
                    filename:
                      part.filename ||
                      buildImageFileName(secName, qNumber, idx + 1, 'png'),
                  };
                })
              : [];

            const images: ImageAttachment[] = [];
            const expectedCount = Math.max(pdfDataParts.length, 1);

            for (let partIdx = 1; partIdx <= expectedCount; partIdx++) {
              const matched = findMatchingImageInArchive(
                rawFilesMap,
                secName,
                qNumber,
                partIdx,
                effectiveSubName
              );
              if (matched) {
                images.push({
                  id: generateId(),
                  partIndex: partIdx,
                  fileName: matched.fileName,
                  blobUrl: matched.url,
                  rawBlob: matched.blob,
                  mimeType: matched.blob.type,
                  sizeBytes: matched.size,
                });
              }
            }

            questions.push({
              id: generateId(),
              key: qKey,
              que: qNumber,
              type: qType,
              marks,
              answerOptions,
              pdfData: pdfDataParts,
              images,
              notes: qVal.notes || '',
              isFlagged: false,
            });
          }

          questions.sort((a, b) => a.que - b.que);
          sections.push({
            id: generateId(),
            name: secName,
            questions,
          });
        }

        subjects.push({
          id: generateId(),
          name: effectiveSubName,
          sections,
        });
      }
    } catch (e: any) {
      warnings.push(`Error parsing ${jsonPath}: ${e.message}`);
    }
  }

  const archive: QuestionPaperArchive = {
    id: generateId(),
    fileName,
    title: fileName.replace(/\.[^/.]+$/, ''),
    format: 'ultimate',
    metadata: {
      appVersion: '2.6.0',
      generatedBy: 'pdfCropperPage',
      createdAt: new Date().toISOString(),
    },
    subjects,
    rawFiles: rawFilesMap,
    isDirty: false,
    lastModified: Date.now(),
  };

  return { archive, warnings };
}

/**
 * Reconstructs archive structure from raw image files when no data.json is present
 */
function reconstructArchiveFromImageFiles(
  rawFilesMap: Map<string, { blob: Blob; url: string; size: number }>,
  fileName: string,
  warnings: string[]
): ParseResult {
  warnings.push('No data.json found. Reconstructed paper structure from image filename syntax.');
  const sectionsMap = new Map<string, Map<number, { parts: { partNum: number; file: any; path: string }[] }>>();

  for (const [path, entry] of rawFilesMap.entries()) {
    const baseName = path.split('/').pop() || path;
    const parsed = parseImageFileName(baseName);
    if (!parsed.isValid || !parsed.sectionName || parsed.questionNumber === undefined) {
      continue;
    }

    if (!sectionsMap.has(parsed.sectionName)) {
      sectionsMap.set(parsed.sectionName, new Map());
    }

    const secQMap = sectionsMap.get(parsed.sectionName)!;
    if (!secQMap.has(parsed.questionNumber)) {
      secQMap.set(parsed.questionNumber, { parts: [] });
    }

    secQMap.get(parsed.questionNumber)!.parts.push({
      partNum: parsed.partNumber || 1,
      file: entry,
      path: baseName,
    });
  }

  const sections: SectionData[] = [];

  for (const [secName, qMap] of sectionsMap.entries()) {
    const questions: QuestionData[] = [];
    for (const [qNum, data] of qMap.entries()) {
      data.parts.sort((a, b) => a.partNum - b.partNum);
      const images: ImageAttachment[] = data.parts.map((p, idx) => ({
        id: generateId(),
        partIndex: idx + 1,
        fileName: p.path,
        blobUrl: p.file.url,
        rawBlob: p.file.blob,
        mimeType: p.file.blob.type,
        sizeBytes: p.file.size,
      }));

      const pdfData: PdfDataPart[] = images.map((img) => ({
        page: 1,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        filename: img.fileName,
      }));

      questions.push({
        id: generateId(),
        key: `${qNum}`,
        que: qNum,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
        answerOptions: '',
        pdfData,
        images,
      });
    }

    questions.sort((a, b) => a.que - b.que);
    sections.push({
      id: generateId(),
      name: secName,
      questions,
    });
  }

  const defaultSubject: SubjectData = {
    id: generateId(),
    name: 'General',
    sections,
  };

  const archive: QuestionPaperArchive = {
    id: generateId(),
    fileName,
    title: fileName.replace(/\.[^/.]+$/, ''),
    format: 'custom',
    metadata: {
      appVersion: '2.6.0',
      generatedBy: 'autoReconstruct',
      createdAt: new Date().toISOString(),
    },
    subjects: [defaultSubject],
    rawFiles: rawFilesMap,
    isDirty: true,
    lastModified: Date.now(),
  };

  return { archive, warnings };
}

/**
 * Searches the archive for an image matching the section, question number, and part number
 */
function findMatchingImageInArchive(
  rawFilesMap: Map<string, { blob: Blob; url: string; size: number }>,
  sectionName: string,
  questionNumber: number,
  partNumber: number,
  subjectName?: string
): { fileName: string; url: string; blob: Blob; size: number } | null {
  // Strategy 1: Standard delimiter format: SectionName__--__QNo__--__PartNo.ext
  for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
    const targetName = buildImageFileName(sectionName, questionNumber, partNumber, ext);
    
    // Check direct match
    if (rawFilesMap.has(targetName)) {
      const item = rawFilesMap.get(targetName)!;
      return { fileName: targetName, ...item };
    }

    // Check with subject prefix
    if (subjectName) {
      const nestedPath = `${subjectName}/${targetName}`;
      if (rawFilesMap.has(nestedPath)) {
        const item = rawFilesMap.get(nestedPath)!;
        return { fileName: targetName, ...item };
      }
    }

    // Check inside 'images/' folder (QuessBank)
    const imgPath = `images/${targetName}`;
    if (rawFilesMap.has(imgPath)) {
      const item = rawFilesMap.get(imgPath)!;
      return { fileName: targetName, ...item };
    }
  }

  // Strategy 2: Scan all files with fuzzy delimiter match
  for (const [path, item] of rawFilesMap.entries()) {
    const baseName = path.split('/').pop() || path;
    const parsed = parseImageFileName(baseName);
    if (
      parsed.isValid &&
      parsed.questionNumber === questionNumber &&
      parsed.partNumber === partNumber &&
      (parsed.sectionName?.toLowerCase() === sectionName.toLowerCase() ||
        sectionName.toLowerCase().includes(parsed.sectionName?.toLowerCase() || ''))
    ) {
      return { fileName: baseName, ...item };
    }
  }

  // Strategy 3: Check for AI-generated naming patterns (e.g. Physics_mcq_Q1.png, Chemistry_nat_Q25_p2.png, Q1.png)
  const aiPattern1 = new RegExp(`_Q?${questionNumber}(_p?${partNumber})?\\.(${SUPPORTED_IMAGE_EXTENSIONS.join('|')})$`, 'i');
  const aiPattern2 = new RegExp(`(^|[^0-9a-zA-Z])Q?${questionNumber}(_|-|p)(${partNumber})?\\.(${SUPPORTED_IMAGE_EXTENSIONS.join('|')})$`, 'i');

  for (const [path, item] of rawFilesMap.entries()) {
    const baseName = path.split('/').pop() || path;
    if (aiPattern1.test(baseName) || aiPattern2.test(baseName)) {
      // If subject name is specified, prefer files containing the subject name
      if (!subjectName || baseName.toLowerCase().includes(subjectName.toLowerCase()) || rawFilesMap.size <= 100) {
        return { fileName: baseName, ...item };
      }
    }
  }

  // Strategy 4: Generic partial pattern if standard not matched
  const partialPattern = new RegExp(`(^|[^0-9])${questionNumber}(_|-)(${partNumber})\\.(${SUPPORTED_IMAGE_EXTENSIONS.join('|')})$`, 'i');
  for (const [path, item] of rawFilesMap.entries()) {
    const baseName = path.split('/').pop() || path;
    if (partialPattern.test(baseName)) {
      return { fileName: baseName, ...item };
    }
  }

  return null;
}

function normalizeQuestionType(type: any): QuestionType {
  if (!type) return 'mcq';
  const t = String(type).toLowerCase().trim();
  if (t === 'msq' || t === 'multi' || t === 'multiple') return 'msq';
  if (t === 'nat' || t === 'numerical' || t === 'num' || t === 'integer') return 'nat';
  if (t === 'msm' || t === 'matrix' || t === 'match' || t === 'matrix_match') return 'msm';
  return 'mcq';
}

function normalizeMarksScheme(marks: any, type: QuestionType): MarksScheme {
  if (typeof marks === 'object' && marks !== null) {
    return {
      cm: typeof marks.cm === 'number' ? marks.cm : 4,
      im: typeof marks.im === 'number' ? marks.im : -1,
      pm: typeof marks.pm === 'number' ? marks.pm : (type === 'msq' ? 1 : 0),
      max: typeof marks.max === 'number' ? marks.max : (type === 'msm' ? 12 : 4),
    };
  }
  return {
    cm: 4,
    im: -1,
    pm: type === 'msq' ? 1 : 0,
    max: type === 'msm' ? 12 : 4,
  };
}

function normalizeAnswerOptions(ans: any): string {
  if (ans === undefined || ans === null) return '';
  if (typeof ans === 'string') return ans.trim();
  if (Array.isArray(ans)) return ans.join(',');
  return String(ans).trim();
}
