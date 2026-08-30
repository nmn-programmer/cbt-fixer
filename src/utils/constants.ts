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
    id: 'jee_adv_msq_tiered_std',
    name: 'JEE Adv MSQ Tiered (+4/+3/+2/+1, -2)',
    description: '+4 all correct, +3 (3 of 4), +2 (2 of 3/4), +1 (1 of 2/3/4), -2 wrong, 0 unattempted',
    type: 'msq',
    marks: {
      cm: 4,
      im: -2,
      pm: 1,
      max: 4,
      partialTiers: { threeCorrect: 3, twoCorrect: 2, oneCorrect: 1 },
      schemeType: 'jee_adv_msq',
    },
  },
  {
    id: 'jee_adv_msq_tiered_mod',
    name: 'JEE Adv MSQ Tiered (+4/+3/+2/+1, -1)',
    description: '+4 all correct, +3/+2/+1 partial, -1 negative, 0 unattempted',
    type: 'msq',
    marks: {
      cm: 4,
      im: -1,
      pm: 1,
      max: 4,
      partialTiers: { threeCorrect: 3, twoCorrect: 2, oneCorrect: 1 },
      schemeType: 'jee_adv_msq',
    },
  },
  {
    id: 'jee_adv_mcq',
    name: 'JEE Advanced Single Correct (+3/-1)',
    description: '+3 for correct, -1 for incorrect',
    type: 'mcq',
    marks: { cm: 3, im: -1, pm: 0, max: 3, schemeType: 'jee_adv_single' },
  },
  {
    id: 'jee_adv_nat',
    name: 'JEE Advanced Non-Negative NAT (+4/0)',
    description: '+4 for correct, 0 for incorrect (Non-negative)',
    type: 'nat',
    marks: { cm: 4, im: 0, pm: 0, max: 4, schemeType: 'jee_adv_nat' },
  },
  {
    id: 'jee_adv_nat_neg',
    name: 'JEE Advanced Negative NAT (+3/-1)',
    description: '+3 for correct, -1 for incorrect',
    type: 'nat',
    marks: { cm: 3, im: -1, pm: 0, max: 3, schemeType: 'custom' },
  },
  {
    id: 'jee_adv_matrix',
    name: 'JEE Advanced Matrix Match (MSM)',
    description: '+3 full (+1 per row), -1 incorrect, max 12',
    type: 'msm',
    marks: { cm: 3, im: -1, pm: 1, max: 12, schemeType: 'custom' },
  },
  {
    id: 'jee_main_mcq',
    name: 'JEE Main Single Choice (+4/-1)',
    description: '+4 for correct, -1 for incorrect',
    type: 'mcq',
    marks: { cm: 4, im: -1, pm: 0, max: 4, schemeType: 'jee_main' },
  },
  {
    id: 'jee_main_nat',
    name: 'JEE Main Numerical (+4/-1)',
    description: '+4 for correct, -1 for incorrect',
    type: 'nat',
    marks: { cm: 4, im: -1, pm: 0, max: 4, schemeType: 'jee_main' },
  },
  {
    id: 'bitsat_mcq',
    name: 'BITSAT Single Choice (+3/-1)',
    description: '+3 for correct, -1 for incorrect',
    type: 'mcq',
    marks: { cm: 3, im: -1, pm: 0, max: 3, schemeType: 'custom' },
  },
  {
    id: 'dpp_standard',
    name: 'Standard DPP Practice (+4/0)',
    description: '+4 for correct, no negative marking',
    type: 'mcq',
    marks: { cm: 4, im: 0, pm: 0, max: 4, schemeType: 'custom' },
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
