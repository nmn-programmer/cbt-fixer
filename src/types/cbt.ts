export type QuestionType = 'mcq' | 'msq' | 'nat' | 'msm';

export interface PartialTiersScheme {
  threeCorrect?: number; // e.g. +3 if all 4 options are correct and 3 are chosen
  twoCorrect?: number;   // e.g. +2 if 3 or 4 options are correct and 2 are chosen
  oneCorrect?: number;   // e.g. +1 if 2, 3, or 4 options are correct and 1 is chosen
}

export interface MarksScheme {
  cm: number;      // Correct Marks (e.g. 3 or 4)
  im: number;      // Incorrect Marks (e.g. -1 or -2)
  pm?: number;     // Partial Marks per option (e.g. 1 for MSQ)
  max?: number;    // Maximum question marks (e.g. 4 or 12 for matrix)
  partialTiers?: PartialTiersScheme; // JEE Advanced tiered partial marks
  schemeType?: 'jee_main' | 'jee_adv_msq' | 'jee_adv_single' | 'jee_adv_nat' | 'custom';
}

export interface PdfDataPart {
  page: number;
  pageNumber?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  xmin?: number;
  ymin?: number;
  xmax?: number;
  ymax?: number;
  bounds?: number[];
  filename?: string; // e.g. "Chemistry Section 2__--__6__--__1.png"
}

export interface ImageAttachment {
  id: string;
  partIndex: number; // 1-based (1, 2, ...)
  fileName: string;
  blobUrl: string;
  rawBlob?: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  isOrphaned?: boolean;
}

export interface QuestionData {
  id: string;            // unique internal identifier
  key: string;           // key in data.json (e.g. "1", "q1", "2_dup")
  que: number;           // question sequence number (e.g. 1, 2, ...)
  type: QuestionType;
  marks: MarksScheme;
  answerOptions: string; // e.g. "4", "1,2,3", "5.25", "A->P,Q; B->R"
  isSplitQuestion?: boolean;
  pdfData: PdfDataPart[];
  images: ImageAttachment[];
  notes?: string;
  isFlagged?: boolean;
  hasExtractionWarning?: boolean;
  warningReason?: string;
  doubleScanStatus?: 'verified' | 'repaired' | 'flagged';
}

export interface SectionData {
  id: string;
  name: string;          // e.g. "Section 1", "DPP 1", "Physics Section 1"
  questions: QuestionData[];
}

export interface SubjectData {
  id: string;
  name: string;          // e.g. "Physics", "Chemistry", "Mathematics", "Biology"
  sections: SectionData[];
}

export type ArchiveFormat = 'pdfCropper' | 'ultimate' | 'dpp' | 'quessbank' | 'custom';

export interface BlueprintSectionRange {
  id: string;
  subjectName: string;         // e.g. "Physics", "Chemistry", "Mathematics", "Biology"
  sectionName: string;         // e.g. "Section 1", "Section 1 (MCQ)", "Section 2 (NAT)"
  fromQNo: number;             // e.g. 1
  toQNo: number;               // e.g. 8
  type: QuestionType;          // 'mcq' | 'msq' | 'nat' | 'msm'
  marks: MarksScheme;          // { cm: 4, im: -1, pm?: 1, max?: 4 }
}

export interface TestPaperBlueprint {
  testTitle?: string;
  durationMinutes?: number;
  totalMarks?: number;
  instructionPageNum?: number;
  instructionSummary?: string;
  rawInstructionText?: string;
  markingSchemeSummary?: string;
  hasInstructedMarkingScheme?: boolean;
  defaultMarkingScheme?: { cm: number; im: number; pm?: number; max?: number };
  sections: BlueprintSectionRange[];
}

export interface ArchiveMetadata {
  pdfFileHash?: string;
  sourcePdfName?: string;
  additionalData?: Record<string, unknown>;
  appVersion?: string;
  generatedBy?: string;
  schemaVersion?: string;
  testTitle?: string;
  durationMinutes?: number;
  totalMarks?: number;
  markingScheme?: {
    correct?: number;
    incorrect?: number;
    partial?: number;
    blank?: number;
    correctMarks?: number;
    negativeMarks?: number;
    partialMarks?: number;
    type?: string;
  };
  hasInstructedMarkingScheme?: boolean;
  instructionMarkingSummary?: string;
  createdAt?: string;
}

export interface QuestionPaperArchive {
  id: string;
  fileName: string;
  title: string;
  format: ArchiveFormat;
  metadata: ArchiveMetadata;
  subjects: SubjectData[];
  rawFiles: Map<string, { blob: Blob; url: string; size: number }>;
  isDirty?: boolean;
  lastModified: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'MISSING_IMAGE_PART'
  | 'ORPHANED_IMAGE'
  | 'MALFORMED_FILENAME'
  | 'DUPLICATE_QUESTION_INDEX'
  | 'NON_SEQUENTIAL_NUMBERING'
  | 'MARKING_ANOMALY'
  | 'INVALID_ANSWER_KEY'
  | 'ANSWER_TYPE_MISMATCH'
  | 'INSTRUCTED_MARKING_MISMATCH'
  | 'SPLIT_PART_INCOMPLETE'
  | 'UNANSWERED_QUESTION_IN_KEY'
  | 'LEGACY_FORMAT_DETECTED'
  | 'EMPTY_SECTION'
  | 'NO_IMAGE_PARTS';

export interface DiagnosticLocation {
  archiveId: string;
  archiveName: string;
  subjectId?: string;
  subjectName?: string;
  sectionId?: string;
  sectionName?: string;
  questionId?: string;
  questionKey?: string;
  questionNumber?: number;
  partIndex?: number;
  expectedFileName?: string;
  actualFileName?: string;
}

export interface DiagnosticIssue {
  id: string;
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  location: DiagnosticLocation;
  autoFixable: boolean;
  autoFixAction?: string;
}
