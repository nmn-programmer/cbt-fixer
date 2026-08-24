import {
  DiagnosticCode,
  DiagnosticIssue,
  DiagnosticSeverity,
  QuestionData,
  QuestionPaperArchive,
  SectionData,
  SubjectData,
} from '../types/cbt';
import {
  buildImageFileName,
  DELIMITER,
  generateId,
  parseImageFileName,
} from './constants';

/**
 * Runs hyper-precise linting rules across an archive and returns a list of DiagnosticIssues.
 */
export function runDiagnostics(archive: QuestionPaperArchive): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const referencedImageNames = new Set<string>();

  // 1. Inspect all subjects, sections, questions
  for (const subject of archive.subjects) {
    for (const section of subject.sections) {
      if (section.questions.length === 0) {
        issues.push({
          id: generateId(),
          code: 'EMPTY_SECTION',
          severity: 'warning',
          title: 'Empty Section',
          message: `Section contains no questions.`,
          location: {
            archiveId: archive.id,
            archiveName: archive.fileName,
            subjectId: subject.id,
            subjectName: subject.name,
            sectionId: section.id,
            sectionName: section.name,
          },
          autoFixable: false,
        });
        continue;
      }

      // Check Question Numbering & Duplicates within Section
      const qNumMap = new Map<number, QuestionData[]>();
      const sortedQuestions = [...section.questions].sort((a, b) => a.que - b.que);

      for (const q of section.questions) {
        if (!qNumMap.has(q.que)) {
          qNumMap.set(q.que, []);
        }
        qNumMap.get(q.que)!.push(q);

        // Check for Missing Image Parts
        const expectedParts = Math.max(q.pdfData.length, q.images.length, 1);
        if (q.images.length === 0 && q.pdfData.length === 0) {
          issues.push({
            id: generateId(),
            code: 'NO_IMAGE_PARTS',
            severity: 'error',
            title: 'No Image Parts',
            message: `Question Q${q.que} has no image attachments or pdfData slices attached.`,
            location: {
              archiveId: archive.id,
              archiveName: archive.fileName,
              subjectId: subject.id,
              subjectName: subject.name,
              sectionId: section.id,
              sectionName: section.name,
              questionId: q.id,
              questionKey: q.key,
              questionNumber: q.que,
            },
            autoFixable: false,
          });
        }

        // Validate each declared image/pdfData part
        for (let pIdx = 0; pIdx < expectedParts; pIdx++) {
          const partNum = pIdx + 1;
          const expectedFileName = buildImageFileName(section.name, q.que, partNum, 'png');
          const hasImage = q.images.some((img) => img.partIndex === partNum);

          if (!hasImage) {
            issues.push({
              id: generateId(),
              code: 'MISSING_IMAGE_PART',
              severity: 'error',
              title: 'Missing Image Part',
              message: `Missing expected image file: ${expectedFileName} declared in pdfData (Part ${partNum} of ${expectedParts}).`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: q.id,
                questionKey: q.key,
                questionNumber: q.que,
                partIndex: partNum,
                expectedFileName,
              },
              autoFixable: false,
            });
          }
        }

        // Track referenced images
        q.images.forEach((img) => {
          referencedImageNames.add(img.fileName);
          const parsed = parseImageFileName(img.fileName);
          if (!parsed.isValid) {
            issues.push({
              id: generateId(),
              code: 'MALFORMED_FILENAME',
              severity: 'error',
              title: 'Malformed Filename Syntax',
              message: `Image filename "${img.fileName}" does not follow delimiter syntax <Section>__--__<QNo>__--__<PartNo>.<ext>.`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: q.id,
                questionKey: q.key,
                questionNumber: q.que,
                partIndex: img.partIndex,
                actualFileName: img.fileName,
                expectedFileName: buildImageFileName(section.name, q.que, img.partIndex, 'png'),
              },
              autoFixable: true,
              autoFixAction: 'Rename image to match standard syntax',
            });
          }
        });

        // Check Marking Scheme Anomalies
        if (q.type === 'msq') {
          if (q.marks.pm === undefined || q.marks.pm === 0) {
            issues.push({
              id: generateId(),
              code: 'MARKING_ANOMALY',
              severity: 'warning',
              title: 'MSQ Marking Scheme Anomaly',
              message: `Question type is "msq" but partial mark (pm) is missing or 0. JEE Advanced MSQs typically reward partial marks (+1).`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: q.id,
                questionKey: q.key,
                questionNumber: q.que,
              },
              autoFixable: true,
              autoFixAction: 'Set default MSQ scheme (+4, -2, pm: 1)',
            });
          }
          if (q.marks.im >= 0) {
            issues.push({
              id: generateId(),
              code: 'MARKING_ANOMALY',
              severity: 'warning',
              title: 'MSQ Negative Marking Missing',
              message: `Question type is "msq" but incorrect marks (im) is non-negative (${q.marks.im}). Standard is -2.`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: q.id,
                questionKey: q.key,
                questionNumber: q.que,
              },
              autoFixable: true,
              autoFixAction: 'Set negative mark to -2',
            });
          }
        } else if (q.type === 'nat') {
          if (q.marks.im !== 0 && q.marks.im !== -1) {
            issues.push({
              id: generateId(),
              code: 'MARKING_ANOMALY',
              severity: 'info',
              title: 'NAT Marking Scheme Note',
              message: `Numerical NAT question has incorrect marks: ${q.marks.im}. Ensure this matches exam type (0 for JEE Adv, -1 for JEE Main).`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: q.id,
                questionKey: q.key,
                questionNumber: q.que,
              },
              autoFixable: false,
            });
          }
        }

        // Check Answer Options Validity
        if (!q.answerOptions || q.answerOptions.trim() === '') {
          issues.push({
            id: generateId(),
            code: 'INVALID_ANSWER_KEY',
            severity: 'warning',
            title: 'Empty Answer Key',
            message: `Question Q${q.que} has no answer key defined.`,
            location: {
              archiveId: archive.id,
              archiveName: archive.fileName,
              subjectId: subject.id,
              subjectName: subject.name,
              sectionId: section.id,
              sectionName: section.name,
              questionId: q.id,
              questionKey: q.key,
              questionNumber: q.que,
            },
            autoFixable: false,
          });
        }
      }

      // Check for Duplicate Question Numbers in Section
      for (const [qNum, list] of qNumMap.entries()) {
        if (list.length > 1) {
          const keys = list.map((item) => `"${item.key}"`).join(', ');
          issues.push({
            id: generateId(),
            code: 'DUPLICATE_QUESTION_INDEX',
            severity: 'warning',
            title: 'Duplicate Question Index',
            message: `Duplicate question index que: ${qNum} found for ${list.length} questions (keys: ${keys}).`,
            location: {
              archiveId: archive.id,
              archiveName: archive.fileName,
              subjectId: subject.id,
              subjectName: subject.name,
              sectionId: section.id,
              sectionName: section.name,
              questionNumber: qNum,
            },
            autoFixable: true,
            autoFixAction: 'Auto-renumber section sequentially',
          });
        }
      }

      // Check Non-Sequential Question Numbering
      for (let i = 0; i < sortedQuestions.length; i++) {
        const expectedQNum = i + 1;
        const currentQ = sortedQuestions[i];

        if (i > 0) {
          const prevQ = sortedQuestions[i - 1];
          if (currentQ.que > prevQ.que + 1) {
            const missing = prevQ.que + 1;
            issues.push({
              id: generateId(),
              code: 'NON_SEQUENTIAL_NUMBERING',
              severity: 'warning',
              title: 'Non-Sequential Question Numbering',
              message: `Numbering jumps from Q${prevQ.que} to Q${currentQ.que} (Q${missing} missing in sequence).`,
              location: {
                archiveId: archive.id,
                archiveName: archive.fileName,
                subjectId: subject.id,
                subjectName: subject.name,
                sectionId: section.id,
                sectionName: section.name,
                questionId: currentQ.id,
                questionKey: currentQ.key,
                questionNumber: currentQ.que,
              },
              autoFixable: true,
              autoFixAction: 'Renumber entire section sequentially (1..N)',
            });
            break; // Report first gap per section
          }
        }
      }
    }
  }

  // 2. Check for Orphaned Images in Archive Binary Map
  for (const [path, entry] of archive.rawFiles.entries()) {
    if (path.endsWith('.json') || path.endsWith('.DS_Store')) continue;
    const baseName = path.split('/').pop() || path;

    if (!referencedImageNames.has(baseName) && !referencedImageNames.has(path)) {
      issues.push({
        id: generateId(),
        code: 'ORPHANED_IMAGE',
        severity: 'error',
        title: 'Orphaned / Unlinked Image in ZIP',
        message: `Image "${path}" exists in ZIP archive but is not indexed or referenced in data.json.`,
        location: {
          archiveId: archive.id,
          archiveName: archive.fileName,
          actualFileName: path,
        },
        autoFixable: true,
        autoFixAction: 'Prune orphaned file from archive',
      });
    }
  }

  return issues;
}

/**
 * 1-Click Auto-Fixer: Renumber all questions in a section or paper sequentially from 1 to N.
 */
export function autoFixRenumberSection(
  archive: QuestionPaperArchive,
  sectionId?: string
): QuestionPaperArchive {
  const updatedSubjects = archive.subjects.map((sub) => ({
    ...sub,
    sections: sub.sections.map((sec) => {
      if (sectionId && sec.id !== sectionId) return sec;

      let counter = 1;
      const updatedQuestions = sec.questions.map((q) => {
        const newQue = counter++;
        const newKey = String(newQue);

        // Update pdfData filenames and image filenames
        const updatedImages = q.images.map((img) => {
          const ext = img.fileName.split('.').pop() || 'png';
          const newFileName = buildImageFileName(sec.name, newQue, img.partIndex, ext);
          return { ...img, fileName: newFileName };
        });

        const updatedPdfData = q.pdfData.map((part, idx) => {
          const ext = part.filename ? part.filename.split('.').pop() || 'png' : 'png';
          return {
            ...part,
            filename: buildImageFileName(sec.name, newQue, idx + 1, ext),
          };
        });

        return {
          ...q,
          que: newQue,
          key: newKey,
          images: updatedImages,
          pdfData: updatedPdfData,
        };
      });

      return { ...sec, questions: updatedQuestions };
    }),
  }));

  return {
    ...archive,
    subjects: updatedSubjects,
    isDirty: true,
    lastModified: Date.now(),
  };
}

/**
 * 1-Click Auto-Fixer: Prune all orphaned image binaries from the archive.
 */
export function autoFixPruneOrphanedImages(archive: QuestionPaperArchive): QuestionPaperArchive {
  const referencedNames = new Set<string>();

  archive.subjects.forEach((sub) => {
    sub.sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        q.images.forEach((img) => referencedNames.add(img.fileName));
      });
    });
  });

  const updatedRawFiles = new Map(archive.rawFiles);

  for (const [path] of archive.rawFiles.entries()) {
    if (path.endsWith('.json')) continue;
    const baseName = path.split('/').pop() || path;
    if (!referencedNames.has(baseName) && !referencedNames.has(path)) {
      updatedRawFiles.delete(path);
    }
  }

  return {
    ...archive,
    rawFiles: updatedRawFiles,
    isDirty: true,
    lastModified: Date.now(),
  };
}

/**
 * 1-Click Auto-Fixer: Standardize all image filenames to match delimiter syntax.
 */
export function autoFixStandardizeFilenames(archive: QuestionPaperArchive): QuestionPaperArchive {
  const updatedSubjects = archive.subjects.map((sub) => ({
    ...sub,
    sections: sub.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => {
        const updatedImages = q.images.map((img, idx) => {
          const partIndex = idx + 1;
          const ext = img.fileName.split('.').pop() || 'png';
          const standardName = buildImageFileName(sec.name, q.que, partIndex, ext);
          return { ...img, partIndex, fileName: standardName };
        });

        const updatedPdfData = q.pdfData.map((part, idx) => {
          const partIndex = idx + 1;
          const ext = part.filename ? part.filename.split('.').pop() || 'png' : 'png';
          const standardName = buildImageFileName(sec.name, q.que, partIndex, ext);
          return { ...part, filename: standardName };
        });

        return {
          ...q,
          images: updatedImages,
          pdfData: updatedPdfData,
        };
      }),
    })),
  }));

  return {
    ...archive,
    subjects: updatedSubjects,
    isDirty: true,
    lastModified: Date.now(),
  };
}

/**
 * 1-Click Auto-Fixer: Fix marking schemes across archive.
 */
export function autoFixMarkingSchemes(archive: QuestionPaperArchive): QuestionPaperArchive {
  const updatedSubjects = archive.subjects.map((sub) => ({
    ...sub,
    sections: sub.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => {
        if (q.type === 'msq') {
          return {
            ...q,
            marks: {
              cm: q.marks.cm || 4,
              im: q.marks.im > 0 ? -2 : q.marks.im || -2,
              pm: q.marks.pm || 1,
              max: q.marks.max || 4,
            },
          };
        }
        if (q.type === 'msm') {
          return {
            ...q,
            marks: {
              cm: q.marks.cm || 3,
              im: q.marks.im || -1,
              pm: q.marks.pm || 1,
              max: q.marks.max || 12,
            },
          };
        }
        return q;
      }),
    })),
  }));

  return {
    ...archive,
    subjects: updatedSubjects,
    isDirty: true,
    lastModified: Date.now(),
  };
}
