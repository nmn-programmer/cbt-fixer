import { MarksScheme, QuestionType } from '../types/cbt';

export const DELIMITER = '__--__';

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

export interface MarkingPreset {
  id: string;
  name: string;
  description: string;
  type: QuestionType;
  marks: MarksScheme;
}

export const MARKING_PRESETS: MarkingPreset[] = [
  {
    id: 'jee_main_mcq',
    name: 'JEE Main Single Choice (MCQ)',
    description: '+4 for correct, -1 for incorrect',
    type: 'mcq',
    marks: { cm: 4, im: -1, pm: 0, max: 4 },
  },
  {
    id: 'jee_main_nat',
    name: 'JEE Main Numerical (NAT)',
    description: '+4 for correct, -1 for incorrect (or 0)',
    type: 'nat',
    marks: { cm: 4, im: -1, pm: 0, max: 4 },
  },
  {
    id: 'jee_adv_mcq',
    name: 'JEE Advanced Single Correct',
    description: '+3 for correct, -1 for incorrect',
    type: 'mcq',
    marks: { cm: 3, im: -1, pm: 0, max: 3 },
  },
  {
    id: 'jee_adv_msq',
    name: 'JEE Advanced One or More Correct (MSQ)',
    description: '+4 full, +1 partial per correct option, -2 incorrect',
    type: 'msq',
    marks: { cm: 4, im: -2, pm: 1, max: 4 },
  },
  {
    id: 'jee_adv_nat',
    name: 'JEE Advanced Non-Negative NAT',
    description: '+4 for correct, 0 for incorrect',
    type: 'nat',
    marks: { cm: 4, im: 0, pm: 0, max: 4 },
  },
  {
    id: 'jee_adv_matrix',
    name: 'JEE Advanced Matrix Match (MSM)',
    description: '+3 full (+1 per row), -1 incorrect, max 12',
    type: 'msm',
    marks: { cm: 3, im: -1, pm: 1, max: 12 },
  },
  {
    id: 'dpp_standard',
    name: 'Standard DPP Practice (+4 / 0)',
    description: '+4 for correct, no negative marking',
    type: 'mcq',
    marks: { cm: 4, im: 0, pm: 0, max: 4 },
  },
];

/**
 * Standardize filename syntax according to pdfCropper specification:
 * <SectionName>__--__<QNo>__--__<PartNo>.<extension>
 */
export function buildImageFileName(
  sectionName: string,
  questionNumber: number | string,
  partNumber: number | string,
  extension: string = 'png'
): string {
  // Clean section name if needed
  const cleanSec = sectionName.trim();
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return `${cleanSec}${DELIMITER}${questionNumber}${DELIMITER}${partNumber}.${ext}`;
}

/**
 * Parse a filename according to the delimiter syntax
 */
export function parseImageFileName(fileName: string): {
  isValid: boolean;
  sectionName?: string;
  questionNumber?: number;
  partNumber?: number;
  extension?: string;
} {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return { isValid: false };
  }
  const ext = fileName.substring(lastDot + 1).toLowerCase();
  const baseName = fileName.substring(0, lastDot);

  if (!baseName.includes(DELIMITER)) {
    return { isValid: false, extension: ext };
  }

  const parts = baseName.split(DELIMITER);
  if (parts.length < 3) {
    return { isValid: false, extension: ext };
  }

  const sectionName = parts[0];
  const qNum = parseInt(parts[1], 10);
  const partNum = parseInt(parts[2], 10);

  if (isNaN(qNum) || isNaN(partNum)) {
    return { isValid: false, sectionName, extension: ext };
  }

  return {
    isValid: true,
    sectionName,
    questionNumber: qNum,
    partNumber: partNum,
    extension: ext,
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
