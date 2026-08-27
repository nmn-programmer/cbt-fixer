import { CropperSessionDraft, ManualCroppedQuestion, BoxCoord } from '../types/manualCropper';

const SESSION_STORAGE_KEY = 'cbt_manual_cropper_draft_v1';

export function saveCropperSessionDraft(draft: CropperSessionDraft): void {
  try {
    const serialized = JSON.stringify(draft);
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch (err) {
    console.warn('Failed to save manual cropper draft to localStorage:', err);
  }
}

export function loadCropperSessionDraft(): CropperSessionDraft | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.questions)) {
      return parsed as CropperSessionDraft;
    }
  } catch (err) {
    console.warn('Failed to read manual cropper draft from localStorage:', err);
  }
  return null;
}

export function clearCropperSessionDraft(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear manual cropper draft:', err);
  }
}

export function exportCoordinatesJson(draft: CropperSessionDraft): string {
  return JSON.stringify(draft, null, 2);
}

export function importCoordinatesJson(jsonStr: string): CropperSessionDraft | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && (Array.isArray(parsed.questions) || Array.isArray(parsed.crops) || Array.isArray(parsed.data))) {
      const questionsList = parsed.questions || parsed.crops || parsed.data || [];
      const sanitizedQuestions = questionsList.map((q: any, idx: number) => {
        const que = Number(q.que || q.qNumber || q.questionNumber || q.qNo || idx + 1);
        const subject = q.subject || q.subjectName || '';
        const section = q.section || q.sectionName || '';
        const type = (['mcq', 'msq', 'nat', 'msm'].includes(q.type) ? q.type : 'mcq') as any;
        const answerOptions = String(q.answerOptions || q.options || q.optionsCount || '4');
        const marks = {
          cm: Number(q.marks?.cm ?? q.correctMarks ?? 4),
          im: Number(q.marks?.im ?? q.incorrectMarks ?? -1),
          pm: Number(q.marks?.pm ?? q.partialMarks ?? 0),
          max: Number(q.marks?.max ?? 4)
        };
        
        let parts: any[] = [];
        if (Array.isArray(q.parts) && q.parts.length > 0) {
          parts = q.parts.map((p: any, pIdx: number) => ({
            id: p.id || `p-${idx}-${pIdx}`,
            partIndex: p.partIndex || pIdx + 1,
            page: Number(p.page || p.pageNumber || 1),
            box: sanitizeBox(p.box || p.bounds || p)
          }));
        } else if (q.box || q.bounds || q.ymin !== undefined) {
          parts = [{
            id: `p-${idx}-1`,
            partIndex: 1,
            page: Number(q.page || q.pageNumber || 1),
            box: sanitizeBox(q.box || q.bounds || q)
          }];
        }

        return {
          id: q.id || `crop-q-${Date.now()}-${idx}`,
          que,
          subject,
          section,
          type,
          answerOptions,
          marks,
          parts,
          notes: q.notes || '',
          createdAt: q.createdAt || Date.now()
        };
      });

      return {
        id: parsed.id || `session-${Date.now()}`,
        pdfFileName: parsed.pdfFileName || parsed.fileName || 'Imported_Coordinates.pdf',
        totalPages: Number(parsed.totalPages || 1),
        questions: sanitizedQuestions,
        lastPage: Number(parsed.lastPage || 1),
        lastSubject: parsed.lastSubject || '',
        lastSection: parsed.lastSection || '',
        lastType: parsed.lastType || 'mcq',
        lastAnswerOptions: parsed.lastAnswerOptions || '4',
        lastMarks: parsed.lastMarks || { cm: 4, im: -1, pm: 0, max: 4 },
        timestamp: Date.now()
      };
    }
  } catch (err) {
    console.error('Error importing coordinates JSON:', err);
  }
  return null;
}

export function sanitizeBox(boxInput: any): BoxCoord {
  let ymin = 0.1, xmin = 0.05, ymax = 0.4, xmax = 0.95;
  if (!boxInput) return { ymin, xmin, ymax, xmax };

  if (Array.isArray(boxInput) && boxInput.length === 4) {
    const [b0, b1, b2, b3] = boxInput.map(v => Number(v) || 0);
    if (b2 <= 1 && b3 <= 1 && b0 + b2 <= 1.05 && b1 + b3 <= 1.05) {
      xmin = b0; ymin = b1; xmax = b0 + b2; ymax = b1 + b3;
    } else {
      xmin = Math.min(b0, b2); xmax = Math.max(b0, b2);
      ymin = Math.min(b1, b3); ymax = Math.max(b1, b3);
    }
  } else if (typeof boxInput === 'object') {
    ymin = Number(boxInput.ymin ?? boxInput.y1 ?? 0.1);
    xmin = Number(boxInput.xmin ?? boxInput.x1 ?? 0.05);
    ymax = Number(boxInput.ymax ?? boxInput.y2 ?? 0.4);
    xmax = Number(boxInput.xmax ?? boxInput.x2 ?? 0.95);
  }

  // Normalize if > 1 (e.g. 1000 scale)
  if (Math.max(ymin, xmin, ymax, xmax) > 100) {
    ymin /= 1000; xmin /= 1000; ymax /= 1000; xmax /= 1000;
  } else if (Math.max(ymin, xmin, ymax, xmax) > 1.05) {
    ymin /= 100; xmin /= 100; ymax /= 100; xmax /= 100;
  }

  ymin = Math.max(0, Math.min(0.99, ymin));
  xmin = Math.max(0, Math.min(0.99, xmin));
  ymax = Math.max(ymin + 0.01, Math.min(1, ymax));
  xmax = Math.max(xmin + 0.01, Math.min(1, xmax));

  return { ymin, xmin, ymax, xmax };
}
