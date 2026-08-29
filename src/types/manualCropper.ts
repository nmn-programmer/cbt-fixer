import { MarksScheme } from './cbt';

export interface BoxCoord {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export type CropperMode = 'box' | 'line' | 'multi';
export type ViewMode = 'layout' | 'precision';
export type ColumnSnapMode = 'auto' | 'left' | 'right' | 'full';

export interface ManualCroppedPart {
  id: string;
  partIndex: number;
  page: number;
  box: BoxCoord;
  previewUrl: string;
}

export interface ManualCroppedQuestion {
  id: string;
  que: number;
  subject: string;
  section: string;
  type: 'mcq' | 'msq' | 'nat' | 'msm' | string;
  answerOptions: string;
  marks: MarksScheme;
  parts: ManualCroppedPart[];
  stitchedPreviewUrl?: string;
  createdAt?: number;
}
