import { MarksScheme } from './cbt';

export interface BoxCoord {
  ymin: number; // 0..1 normalized
  xmin: number; // 0..1 normalized
  ymax: number; // 0..1 normalized
  xmax: number; // 0..1 normalized
}

export type CropperMode = 'box' | 'line';
export type ViewMode = 'crop' | 'edit' | 'preview';
export type ColumnSnapMode = 'auto' | 'left' | 'right' | 'full' | 'freeform';

export interface ManualCroppedPart {
  id: string;
  partIndex: number; // 1, 2, ...
  page: number; // 1-based page number
  box: BoxCoord;
  blob?: Blob;
  previewUrl?: string;
  width?: number;
  height?: number;
}

export interface ManualCroppedQuestion {
  id: string;
  que: number;
  subject: string;
  section: string;
  type: 'mcq' | 'msq' | 'nat' | 'msm';
  answerOptions: string; // e.g. "4", "1,2,3", "5.25", "A->P,Q; B->R"
  marks: MarksScheme;
  parts: ManualCroppedPart[];
  stitchedPreviewUrl?: string;
  stitchedBlob?: Blob;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CropperSessionDraft {
  id: string;
  pdfFileName: string;
  totalPages: number;
  questions: Array<{
    id: string;
    que: number;
    subject: string;
    section: string;
    type: 'mcq' | 'msq' | 'nat' | 'msm';
    answerOptions: string;
    marks: MarksScheme;
    parts: Array<{
      id: string;
      partIndex: number;
      page: number;
      box: BoxCoord;
    }>;
    notes?: string;
    createdAt: number;
  }>;
  lastPage: number;
  lastSubject: string;
  lastSection: string;
  lastType: 'mcq' | 'msq' | 'nat' | 'msm';
  lastAnswerOptions: string;
  lastMarks: MarksScheme;
  timestamp: number;
}
