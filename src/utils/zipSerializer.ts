import JSZip from 'jszip';
import {
  ArchiveFormat,
  QuestionData,
  QuestionPaperArchive,
  SectionData,
  SubjectData,
} from '../types/cbt';
import { buildImageFileName } from './constants';

export interface ExportOptions {
  format?: 'pdfCropper' | 'ultimate' | 'dataJsonOnly' | 'imageBundleOnly';
  sanitizeFilenames?: boolean;
  stripOrphanedImages?: boolean;
  autoRenumberSequentially?: boolean;
  compressionLevel?: number; // 0-9
}

/**
 * Serializes the in-memory QuestionPaperArchive into a strictly validated ZIP file.
 */
export async function serializeZipArchive(
  archive: QuestionPaperArchive,
  options: ExportOptions = {}
): Promise<{ blob: Blob; fileName: string; stats: { totalQuestions: number; totalImages: number; byteSize: number } }> {
  const {
    format = archive.format === 'ultimate' ? 'ultimate' : 'pdfCropper',
    sanitizeFilenames = true,
    stripOrphanedImages = true,
    autoRenumberSequentially = false,
  } = options;

  const zip = new JSZip();
  let totalQuestions = 0;
  let totalImages = 0;

  // Build sanitized subjects tree
  const sanitizedSubjects = prepareSubjectsForExport(archive.subjects, autoRenumberSequentially);

  if (format === 'ultimate') {
    // Ultimate ZIP: Nested subject folders (e.g. Physics/data.json + images)
    for (const subject of sanitizedSubjects) {
      const subjectFolder = zip.folder(subject.name) || zip;
      const subjectPdfCropperData: Record<string, Record<string, any>> = {};
      subjectPdfCropperData[subject.name] = {};

      for (const section of subject.sections) {
        subjectPdfCropperData[subject.name][section.name] = {};

        for (const q of section.questions) {
          totalQuestions++;
          const qObj = serializeQuestion(q, section.name, sanitizeFilenames);
          subjectPdfCropperData[subject.name][section.name][q.key] = qObj;

          // Add images for this question
          for (let i = 0; i < q.images.length; i++) {
            const img = q.images[i];
            const partIdx = i + 1;
            const ext = getFileExtension(img.fileName) || 'png';
            const targetFileName = sanitizeFilenames
              ? buildImageFileName(section.name, q.que, partIdx, ext)
              : img.fileName;

            const binaryData = await getImageBinary(img, archive);
            if (binaryData) {
              subjectFolder.file(targetFileName, binaryData);
              totalImages++;
            }
          }
        }
      }

      const subjectJson = {
        testConfig: {
          pdfFileHash: archive.metadata.pdfFileHash || '',
          additionalData: archive.metadata.additionalData || {},
        },
        pdfCropperData: subjectPdfCropperData,
        appVersion: archive.metadata.appVersion || '2.5.0',
        generatedBy: 'pdfCropperPage',
      };

      subjectFolder.file('data.json', JSON.stringify(subjectJson, null, 2));
    }
  } else {
    // Standard pdfCropper format: root data.json + root images
    const pdfCropperData: Record<string, Record<string, Record<string, any>>> = {};

    for (const subject of sanitizedSubjects) {
      pdfCropperData[subject.name] = {};

      for (const section of subject.sections) {
        pdfCropperData[subject.name][section.name] = {};

        for (const q of section.questions) {
          totalQuestions++;
          const qObj = serializeQuestion(q, section.name, sanitizeFilenames);
          pdfCropperData[subject.name][section.name][q.key] = qObj;

          // Add images for this question
          for (let i = 0; i < q.images.length; i++) {
            const img = q.images[i];
            const partIdx = i + 1;
            const ext = getFileExtension(img.fileName) || 'png';
            const targetFileName = sanitizeFilenames
              ? buildImageFileName(section.name, q.que, partIdx, ext)
              : img.fileName;

            const binaryData = await getImageBinary(img, archive);
            if (binaryData) {
              zip.file(targetFileName, binaryData);
              totalImages++;
            }
          }
        }
      }
    }

    // Include orphaned images only if not stripped
    if (!stripOrphanedImages) {
      const referencedNames = new Set<string>();
      for (const sub of sanitizedSubjects) {
        for (const sec of sub.sections) {
          for (const q of sec.questions) {
            q.images.forEach((img) => referencedNames.add(img.fileName));
          }
        }
      }

      for (const [path, entry] of archive.rawFiles.entries()) {
        const baseName = path.split('/').pop() || path;
        if (!referencedNames.has(baseName) && !path.endsWith('.json')) {
          zip.file(path, entry.blob);
          totalImages++;
        }
      }
    }

    // Always bundle raw source PDF and Answer Key files if available
    let hasPdfBundled = false;
    let hasAnswerKeyBundled = false;

    for (const [path, entry] of archive.rawFiles.entries()) {
      const lower = path.toLowerCase();
      if (lower.endsWith('.pdf')) {
        zip.file('source_document.pdf', entry.blob);
        if (path !== 'source_document.pdf') {
          zip.file(path, entry.blob);
        }
        hasPdfBundled = true;
      } else if (lower.includes('answer_key') || lower.includes('answerkey')) {
        const keyName = lower.endsWith('.json') ? 'answer_key.json' : 'answer_key.pdf';
        zip.file(keyName, entry.blob);
        hasAnswerKeyBundled = true;
      }
    }

    const studioManifest = {
      appVersion: archive.metadata.appVersion || '2.6.0',
      title: archive.title,
      createdAt: new Date().toISOString(),
      sourcePdfName: archive.metadata.sourcePdfName || 'source_document.pdf',
      hasSourcePdf: hasPdfBundled,
      hasAnswerKey: hasAnswerKeyBundled,
      testConfig: {
        pdfFileHash: archive.metadata.pdfFileHash || '',
        additionalData: archive.metadata.additionalData || {},
      },
      pdfCropperData,
    };

    const rootJson = {
      testConfig: {
        pdfFileHash: archive.metadata.pdfFileHash || '',
        additionalData: archive.metadata.additionalData || {},
      },
      pdfCropperData,
      appVersion: archive.metadata.appVersion || '2.6.0',
      generatedBy: 'pdfCropperPage',
    };

    zip.file('data.json', JSON.stringify(rootJson, null, 2));
    zip.file('studio_manifest.json', JSON.stringify(studioManifest, null, 2));
  }

  // Generate binary ZIP Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: options.compressionLevel || 6 },
  });

  const exportBaseName = archive.fileName.replace(/\.zip$/i, '');
  const outFileName = `${exportBaseName}_sanitized.zip`;

  return {
    blob,
    fileName: outFileName,
    stats: {
      totalQuestions,
      totalImages,
      byteSize: blob.size,
    },
  };
}

/**
 * Exports strictly formatted standalone data.json
 */
export function serializeDataJson(
  archive: QuestionPaperArchive,
  autoRenumber: boolean = false
): { jsonString: string; blob: Blob; fileName: string } {
  const sanitizedSubjects = prepareSubjectsForExport(archive.subjects, autoRenumber);
  const pdfCropperData: Record<string, Record<string, Record<string, any>>> = {};

  for (const subject of sanitizedSubjects) {
    pdfCropperData[subject.name] = {};
    for (const section of subject.sections) {
      pdfCropperData[subject.name][section.name] = {};
      for (const q of section.questions) {
        pdfCropperData[subject.name][section.name][q.key] = serializeQuestion(
          q,
          section.name,
          true
        );
      }
    }
  }

  const rootJson = {
    testConfig: {
      pdfFileHash: archive.metadata.pdfFileHash || '',
      additionalData: archive.metadata.additionalData || {},
    },
    pdfCropperData,
    appVersion: archive.metadata.appVersion || '2.5.0',
    generatedBy: 'pdfCropperPage',
  };

  const jsonString = JSON.stringify(rootJson, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const fileName = `${archive.title || 'cbt_paper'}_data.json`;

  return { jsonString, blob, fileName };
}

function serializeQuestion(
  q: QuestionData,
  _sectionName: string,
  _sanitizeFilenames: boolean
): any {
  // Build pdfData with exact requested coordinates structure: page, x1, x2, y1, y2
  const pdfData = q.pdfData.map((part) => {
    const pPage = part.page ?? part.pageNumber ?? 1;
    const x1 = part.x1 ?? (part.xmin !== undefined ? Math.round(part.xmin * 1000) : 0);
    const y1 = part.y1 ?? (part.ymin !== undefined ? Math.round(part.ymin * 1000) : 0);
    const x2 = part.x2 ?? (part.xmax !== undefined ? Math.round(part.xmax * 1000) : 1000);
    const y2 = part.y2 ?? (part.ymax !== undefined ? Math.round(part.ymax * 1000) : 1000);

    const xmin = part.xmin !== undefined ? part.xmin : x1 / 1000;
    const ymin = part.ymin !== undefined ? part.ymin : y1 / 1000;
    const xmax = part.xmax !== undefined ? part.xmax : x2 / 1000;
    const ymax = part.ymax !== undefined ? part.ymax : y2 / 1000;

    return {
      page: pPage,
      pageNumber: pPage,
      x1,
      y1,
      x2,
      y2,
      ymin,
      xmin,
      ymax,
      xmax,
      bounds: part.bounds || [xmin, ymin, Math.max(0.01, xmax - xmin), Math.max(0.01, ymax - ymin)],
    };
  });

  const questionObj: Record<string, any> = {
    que: q.que,
    type: q.type,
    marks: {
      cm: q.marks.cm,
      im: q.marks.im,
      ...(q.marks.pm !== undefined && q.marks.pm !== 0 ? { pm: q.marks.pm } : {}),
      ...(q.marks.max !== undefined ? { max: q.marks.max } : {}),
    },
    pdfData,
  };

  if (q.answerOptions && q.answerOptions.trim() !== '') {
    questionObj.answerOptions = q.answerOptions.trim();
  }

  return questionObj;
}

async function getImageBinary(
  img: any,
  archive: QuestionPaperArchive
): Promise<Blob | ArrayBuffer | null> {
  if (img.rawBlob) {
    return img.rawBlob;
  }
  if (archive.rawFiles.has(img.fileName)) {
    return archive.rawFiles.get(img.fileName)!.blob;
  }
  const validatedPath = `validated_final/${img.fileName}`;
  if (archive.rawFiles.has(validatedPath)) {
    return archive.rawFiles.get(validatedPath)!.blob;
  }
  // Try fetching blobUrl
  if (img.blobUrl && img.blobUrl.startsWith('blob:')) {
    try {
      const resp = await fetch(img.blobUrl);
      return await resp.blob();
    } catch {
      return null;
    }
  }
  return null;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'png';
}

function prepareSubjectsForExport(
  subjects: SubjectData[],
  autoRenumber: boolean
): SubjectData[] {
  return subjects.map((sub) => ({
    ...sub,
    sections: sub.sections.map((sec) => {
      // Force strict numerical sorting by q.que
      const sortedQuestions = [...sec.questions].sort((a, b) => a.que - b.que);
      let qNumCounter = 1;
      return {
        ...sec,
        questions: sortedQuestions.map((q) => {
          const effectiveQNum = autoRenumber ? qNumCounter++ : q.que;
          return {
            ...q,
            que: effectiveQNum,
            key: String(effectiveQNum),
          };
        }),
      };
    }),
  }));
}
