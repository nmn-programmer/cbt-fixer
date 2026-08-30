import { MarksScheme, QuestionData, QuestionPaperArchive, QuestionType, SubjectData } from '../types/cbt';
import { generateId } from './constants';
import { fetchWithGeminiFallback } from './geminiKeyManager';
import { getPdfjsLib } from './pdfWorkerConfig';

/**
 * Standard Answer Key Entry representing a single question's answer in the official format.
 */
export interface OfficialAnswerEntry {
  correctOption?: string;      // e.g. "D", "A", "B", "C", "4", "1"
  correctOptions?: string;     // e.g. "A,C", "A,B,D", "1,3"
  correctAnswer?: string;      // e.g. "40", "5", "36", "4.50"
  [key: string]: any;
}

export interface OfficialAnswerKeySchema {
  sections: Record<string, Record<string, OfficialAnswerEntry>>;
}

export interface NormalizedAnswerItem {
  sectionName: string;
  questionNumber: number;
  questionKey: string;
  rawAnswer: string;
  normalizedAnswer: string; // standard CBT format (e.g. "4" for D, "1,3" for A,C, "40" for NAT)
  letterAnswer: string;     // standard Letter format (e.g. "D" for 4, "A,C" for 1,3, "40" for NAT)
  inferredType: QuestionType;
  rawEntry: OfficialAnswerEntry | string | any;
}

export interface AnswerKeyParseResult {
  isValid: boolean;
  format: 'official_sections' | 'flat_sections' | 'flat_questions' | 'csv' | 'unknown';
  items: NormalizedAnswerItem[];
  sectionsMap: Record<string, NormalizedAnswerItem[]>;
  totalQuestions: number;
  error?: string;
  warnings: string[];
}

export interface LoadedAnswerKeyFile {
  id: string;
  name: string;
  size: number;
  content: string;
  parseResult: AnswerKeyParseResult;
  enabled: boolean;
  uploadedAt: number;
}

export type MatchConfidence = 'exact' | 'section_fuzzy' | 'global_qnum' | 'sequential' | 'unmatched';

export interface QuestionMatchResult {
  id: string;
  questionId: string;
  questionNumber: number;
  subjectName: string;
  sectionName: string;
  currentType: QuestionType;
  proposedType: QuestionType;
  currentAnswer: string;
  proposedAnswer: string;
  proposedLetterAnswer: string;
  confidence: MatchConfidence;
  matchScore: number; // 0 - 100
  matchReason: string;
  status: 'matched' | 'type_changed' | 'answer_updated' | 'already_matches' | 'unmatched_key' | 'unmatched_paper';
  isIncluded: boolean;
}

export interface ClassificationReport {
  matches: QuestionMatchResult[];
  unmatchedKeyEntries: NormalizedAnswerItem[];
  unmatchedPaperQuestions: { subjectName: string; sectionName: string; question: QuestionData }[];
  totalPaperQuestions: number;
  totalKeyEntries: number;
  matchedCount: number;
  typeChangedCount: number;
  answerUpdatedCount: number;
  unmatchedCount: number;
}

/**
 * Converts a Letter option (A, B, C, D) to standard 1-based index ('1', '2', '3', '4').
 */
export function letterToOptionIndex(letter: string): string {
  if (!letter) return '';
  const trimmed = letter.trim().toUpperCase();
  if (['1', '2', '3', '4', '5', '6'].includes(trimmed)) return trimmed;
  if (trimmed === 'A') return '1';
  if (trimmed === 'B') return '2';
  if (trimmed === 'C') return '3';
  if (trimmed === 'D') return '4';
  if (trimmed === 'E') return '5';
  if (trimmed === 'F') return '6';
  return trimmed;
}

/**
 * Converts a standard 1-based index ('1', '2', '3', '4') to Letter ('A', 'B', 'C', 'D').
 */
export function optionIndexToLetter(opt: string): string {
  if (!opt) return '';
  const trimmed = opt.trim();
  if (trimmed === '1') return 'A';
  if (trimmed === '2') return 'B';
  if (trimmed === '3') return 'C';
  if (trimmed === '4') return 'D';
  if (trimmed === '5') return 'E';
  if (trimmed === '6') return 'F';
  if (/^[A-Z]$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

/**
 * Converts comma-separated letters to option indices e.g. "A,C" -> "1,3"
 */
export function letterListToOptionIndices(listStr: string): string {
  if (!listStr) return '';
  const parts = listStr.split(',').map((p) => p.trim());
  return parts.map((p) => letterToOptionIndex(p)).filter(Boolean).join(',');
}

/**
 * Converts comma-separated option indices to letters e.g. "1,3" -> "A,C"
 */
export function optionIndicesToLetters(listStr: string): string {
  if (!listStr) return '';
  const parts = listStr.split(',').map((p) => p.trim());
  return parts.map((p) => optionIndexToLetter(p)).filter(Boolean).join(',');
}

/**
 * Parses any Answer Key payload (JSON string, JS Object, CSV text) into normalized items.
 */
export function parseAnswerKeyPayload(input: string | object): AnswerKeyParseResult {
  const warnings: string[] = [];
  const items: NormalizedAnswerItem[] = [];
  const sectionsMap: Record<string, NormalizedAnswerItem[]> = {};

  if (!input) {
    return {
      isValid: false,
      format: 'unknown',
      items: [],
      sectionsMap: {},
      totalQuestions: 0,
      error: 'Empty answer key payload provided.',
      warnings: [],
    };
  }

  let parsedObj: any = input;
  let isJson = false;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedObj = JSON.parse(trimmed);
        isJson = true;
      } catch (err: any) {
        // Not valid JSON, attempt CSV/TSV parsing
        return parseCsvAnswerKey(trimmed);
      }
    } else {
      return parseCsvAnswerKey(trimmed);
    }
  } else {
    isJson = true;
  }

  // Detect Schema Format
  // 1. Official Format: { "sections": { "P1 · Physics": { "1": { "correctOption": "D" } } } }
  if (parsedObj && typeof parsedObj === 'object' && parsedObj.sections && typeof parsedObj.sections === 'object') {
    for (const [secName, qMap] of Object.entries<any>(parsedObj.sections)) {
      if (!qMap || typeof qMap !== 'object') continue;
      sectionsMap[secName] = [];

      for (const [qKey, qVal] of Object.entries<any>(qMap)) {
        const qNum = parseInt(qKey.replace(/\D/g, ''), 10) || parseInt(qKey, 10) || 1;
        const normalized = extractAnswerFromVal(secName, qNum, qKey, qVal);
        items.push(normalized);
        sectionsMap[secName].push(normalized);
      }
    }

    return {
      isValid: items.length > 0,
      format: 'official_sections',
      items,
      sectionsMap,
      totalQuestions: items.length,
      warnings,
    };
  }

  // 2. Direct Sections Dictionary: { "Physics": { "1": "D" }, "Chemistry": { "18": "B" } }
  if (parsedObj && typeof parsedObj === 'object' && !Array.isArray(parsedObj)) {
    const firstVal = Object.values(parsedObj)[0] as any;
    if (firstVal && typeof firstVal === 'object' && !firstVal.correctOption && !firstVal.correctOptions && !firstVal.correctAnswer) {
      for (const [secName, qMap] of Object.entries<any>(parsedObj)) {
        if (!qMap || typeof qMap !== 'object') continue;
        sectionsMap[secName] = [];

        for (const [qKey, qVal] of Object.entries<any>(qMap)) {
          const qNum = parseInt(qKey.replace(/\D/g, ''), 10) || parseInt(qKey, 10) || 1;
          const normalized = extractAnswerFromVal(secName, qNum, qKey, qVal);
          items.push(normalized);
          sectionsMap[secName].push(normalized);
        }
      }

      return {
        isValid: items.length > 0,
        format: 'flat_sections',
        items,
        sectionsMap,
        totalQuestions: items.length,
        warnings,
      };
    }

    // 3. Flat Question Dictionary: { "1": "D", "5": "A,C", "8": "40" }
    const defaultSection = 'General Section';
    sectionsMap[defaultSection] = [];

    for (const [qKey, qVal] of Object.entries<any>(parsedObj)) {
      const qNum = parseInt(qKey.replace(/\D/g, ''), 10) || parseInt(qKey, 10) || 1;
      const normalized = extractAnswerFromVal(defaultSection, qNum, qKey, qVal);
      items.push(normalized);
      sectionsMap[defaultSection].push(normalized);
    }

    return {
      isValid: items.length > 0,
      format: 'flat_questions',
      items,
      sectionsMap,
      totalQuestions: items.length,
      warnings,
    };
  }

  // 4. Array Format: [ { q: 1, answer: "D", section: "Physics" } ]
  if (Array.isArray(parsedObj)) {
    for (const entry of parsedObj) {
      if (!entry || typeof entry !== 'object') continue;
      const secName = entry.section || entry.sectionName || entry.subject || 'General Section';
      const qNum = entry.q ?? entry.que ?? entry.questionNumber ?? entry.question ?? 1;
      const qKey = String(qNum);
      const normalized = extractAnswerFromVal(secName, qNum, qKey, entry.answer ?? entry);
      items.push(normalized);
      if (!sectionsMap[secName]) sectionsMap[secName] = [];
      sectionsMap[secName].push(normalized);
    }

    return {
      isValid: items.length > 0,
      format: 'flat_sections',
      items,
      sectionsMap,
      totalQuestions: items.length,
      warnings,
    };
  }

  return {
    isValid: false,
    format: 'unknown',
    items: [],
    sectionsMap: {},
    totalQuestions: 0,
    error: 'Unrecognized answer key structure. Please check JSON syntax or format.',
    warnings,
  };
}

/**
 * Parses raw CSV or TSV string into normalized answer key items.
 */
function parseCsvAnswerKey(csvText: string): AnswerKeyParseResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const items: NormalizedAnswerItem[] = [];
  const sectionsMap: Record<string, NormalizedAnswerItem[]> = {};
  const warnings: string[] = [];

  let currentSection = 'General Section';

  for (const line of lines) {
    // Check if line is a section header like "# Physics" or "[Section 1]"
    if (line.startsWith('#') || (line.startsWith('[') && line.endsWith(']'))) {
      currentSection = line.replace(/^[#\[\s]+|[\]\s]+$/g, '').trim();
      continue;
    }

    // Split by comma, tab, or semicolon
    const parts = line.split(/[\t,;]+/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) continue;

    // Detect if first column is section name e.g. "Physics, 1, D"
    let qNum = 1;
    let rawAns = '';
    let secName = currentSection;

    if (parts.length >= 3 && isNaN(parseInt(parts[0], 10))) {
      secName = parts[0];
      qNum = parseInt(parts[1], 10) || 1;
      rawAns = parts[2];
    } else {
      qNum = parseInt(parts[0], 10) || 1;
      rawAns = parts[1];
    }

    if (!rawAns) continue;

    const normalized = extractAnswerFromVal(secName, qNum, String(qNum), rawAns);
    items.push(normalized);
    if (!sectionsMap[secName]) sectionsMap[secName] = [];
    sectionsMap[secName].push(normalized);
  }

  return {
    isValid: items.length > 0,
    format: 'csv',
    items,
    sectionsMap,
    totalQuestions: items.length,
    warnings,
  };
}

export interface QuestionTypeContext {
  sectionName?: string;
  existingQuestionType?: string;
  hasOptions?: boolean;
  numOptions?: number;
  explicitType?: string;
  natValue?: number | null;
}

export interface ReconciledAnswerResult {
  reconciledType: 'mcq' | 'msq' | 'nat' | 'msm';
  normalizedAnswer: string;
  letterAnswer: string;
  isNat: boolean;
  natNumericValue?: number;
}

/**
 * Authoritative Question Type & Answer Reconciliation Engine (Audit 6.1 / 6.5 / 8.2 / 8.3)
 * Centralizes type inference so 5-choice MCQs, letter answers, and numerical questions
 * are consistently resolved without silent corruption.
 */
export function reconcileQuestionTypeAndAnswer(
  rawAnswerInput: string | number,
  context: QuestionTypeContext = {}
): ReconciledAnswerResult {
  const rawAnswer = String(rawAnswerInput ?? '').trim();
  const secName = (context.sectionName || '').toLowerCase();
  const existingType = (context.existingQuestionType || '').toLowerCase();
  const explicitType = (context.explicitType || '').toLowerCase();

  // 1. Check explicit type signal
  let inferred: 'mcq' | 'msq' | 'nat' | 'msm' = 'mcq';
  if (['mcq', 'msq', 'nat', 'msm'].includes(explicitType)) {
    inferred = explicitType as any;
  } else if (['mcq', 'msq', 'nat', 'msm'].includes(existingType)) {
    inferred = existingType as any;
  }

  // 2. Section name context clues
  const isNatSection = (
    secName.includes('numerical') ||
    secName.includes('integer') ||
    secName.includes('nat') ||
    secName.includes('value type') ||
    secName.includes('section b') ||
    secName.includes('part b') ||
    secName.includes('non-mcq')
  ) && !secName.includes('mcq') && !secName.includes('single') && !secName.includes('multiple choice');

  const isMcqSection = (
    secName.includes('single correct') ||
    secName.includes('multiple choice') ||
    secName.includes('one correct') ||
    secName.includes('mcq') ||
    secName.includes('section a') ||
    secName.includes('part a')
  );

  const isMsqSection = secName.includes('multiple correct') || secName.includes('one or more') || secName.includes('msq');
  const isMsmSection = secName.includes('matrix') || secName.includes('matching') || secName.includes('column match');

  // 3. Inspect rawAnswer format
  const hasCommaOrSemi = rawAnswer.includes(',') || rawAnswer.includes(';');
  const isMultiLetter = rawAnswer.length > 1 && /^[A-H]{2,}$/i.test(rawAnswer);
  const isMatrixMatch = rawAnswer.includes('->') || rawAnswer.includes('=') || /^[P-S]->/i.test(rawAnswer);

  const isPureNumber = rawAnswer !== '' && !isNaN(Number(rawAnswer));
  const numVal = isPureNumber ? Number(rawAnswer) : undefined;
  const isDecimal = isPureNumber && rawAnswer.includes('.');
  const isNegative = isPureNumber && Number(rawAnswer) < 0;
  // Option digits 1-8 (supports 4, 5, 6, and 8 option exams without false NAT corruption)
  const isOptionDigit = ['1', '2', '3', '4', '5', '6', '7', '8'].includes(rawAnswer);

  if (isMatrixMatch || isMsmSection) {
    inferred = 'msm';
  } else if (hasCommaOrSemi || isMultiLetter || isMsqSection) {
    inferred = 'msq';
  } else if (context.natValue != null || isDecimal || isNegative || (isPureNumber && !isOptionDigit)) {
    // Definite NAT: decimal (3.14), negative (-4), or integer > 8 (e.g. 24, 150)
    inferred = 'nat';
  } else if (isPureNumber && isOptionDigit) {
    // Ambiguous single digit ("1"-"8")
    if (explicitType === 'nat' || (isNatSection && !context.hasOptions)) {
      inferred = 'nat';
    } else {
      // Default: It is an MCQ single-choice option index!
      inferred = 'mcq';
    }
  } else if (/^[A-H]$/i.test(rawAnswer)) {
    // Single letter A-H is definitely MCQ
    inferred = 'mcq';
  }

  // Format Letter vs Index
  let letterAnswer = rawAnswer;
  let normalizedAnswer = rawAnswer;

  if (inferred === 'mcq') {
    letterAnswer = optionIndexToLetter(rawAnswer);
    normalizedAnswer = letterToOptionIndex(rawAnswer);
  } else if (inferred === 'msq') {
    letterAnswer = optionIndicesToLetters(rawAnswer);
    normalizedAnswer = letterListToOptionIndices(rawAnswer);
  }

  return {
    reconciledType: inferred,
    normalizedAnswer,
    letterAnswer,
    isNat: inferred === 'nat',
    natNumericValue: inferred === 'nat' && isPureNumber ? numVal : (context.natValue ?? undefined),
  };
}

/**
 * Extracts and normalizes question answer, letters, and inferred question type from raw object/string.
 */
function extractAnswerFromVal(
  sectionName: string,
  questionNumber: number,
  questionKey: string,
  val: any
): NormalizedAnswerItem {
  let rawAnswer = '';
  let explicitType: string | undefined;

  if (typeof val === 'string' || typeof val === 'number') {
    rawAnswer = String(val).trim();
  } else if (val && typeof val === 'object') {
    if (val.correctOption !== undefined) {
      rawAnswer = String(val.correctOption).trim();
      explicitType = 'mcq';
    } else if (val.correctOptions !== undefined) {
      rawAnswer = Array.isArray(val.correctOptions)
        ? val.correctOptions.join(',')
        : String(val.correctOptions).trim();
      explicitType = 'msq';
    } else if (val.correctAnswer !== undefined) {
      rawAnswer = String(val.correctAnswer).trim();
      explicitType = 'nat';
    } else if (val.answer !== undefined) {
      rawAnswer = String(val.answer).trim();
    } else if (val.opt !== undefined) {
      rawAnswer = String(val.opt).trim();
    }
  }

  const rec = reconcileQuestionTypeAndAnswer(rawAnswer, {
    sectionName,
    explicitType,
  });

  return {
    sectionName,
    questionNumber,
    questionKey,
    rawAnswer,
    normalizedAnswer: rec.normalizedAnswer,
    letterAnswer: rec.letterAnswer,
    inferredType: rec.reconciledType,
    rawEntry: val,
  };
}

/**
 * Intelligent Question Classifier & Auto-Matcher
 * Matches parsed Answer Key entries with Questions in the active QuestionPaperArchive.
 */
export function classifyAndMatchAnswerKey(
  archive: QuestionPaperArchive,
  answerKeyResult: AnswerKeyParseResult
): ClassificationReport {
  const matches: QuestionMatchResult[] = [];
  const matchedKeyIndices = new Set<number>();
  const matchedQuestionIds = new Set<string>();

  // Flatten all questions in the paper with location info
  const allPaperQuestions: {
    subject: SubjectData;
    section: { id: string; name: string };
    question: QuestionData;
  }[] = [];

  for (const sub of archive.subjects) {
    for (const sec of sub.sections) {
      for (const q of sec.questions) {
        allPaperQuestions.push({
          subject: sub,
          section: sec,
          question: q,
        });
      }
    }
  }

  // Phase 1: Exact Section Name & Question Number Match
  answerKeyResult.items.forEach((item, keyIdx) => {
    const exactMatch = allPaperQuestions.find(
      (pq) =>
        !matchedQuestionIds.has(pq.question.id) &&
        pq.question.que === item.questionNumber &&
        (pq.section.name.trim().toLowerCase() === item.sectionName.trim().toLowerCase() ||
          pq.subject.name.trim().toLowerCase() === item.sectionName.trim().toLowerCase())
    );

    if (exactMatch) {
      matchedKeyIndices.add(keyIdx);
      matchedQuestionIds.add(exactMatch.question.id);

      // Blueprint & NAT Preservation Guard:
      // If the question is in a NAT section or is already a NAT question, preserve NAT type and raw numerical answer
      const isPaperNat = exactMatch.question.type === 'nat' || exactMatch.section.name.toLowerCase().includes('numerical') || exactMatch.section.name.toLowerCase().includes('nat');
      const finalProposedType = isPaperNat && item.inferredType === 'mcq' ? 'nat' : item.inferredType;
      const finalProposedAnswer = isPaperNat ? item.rawAnswer : item.normalizedAnswer;
      const finalLetterAnswer = isPaperNat ? item.rawAnswer : item.letterAnswer;

      const isTypeChanged = exactMatch.question.type !== finalProposedType;
      const isAnswerChanged =
        exactMatch.question.answerOptions !== finalProposedAnswer &&
        exactMatch.question.answerOptions !== finalLetterAnswer;

      let status: QuestionMatchResult['status'] = 'already_matches';
      if (isTypeChanged) status = 'type_changed';
      else if (isAnswerChanged) status = 'answer_updated';

      matches.push({
        id: generateId(),
        questionId: exactMatch.question.id,
        questionNumber: exactMatch.question.que,
        subjectName: exactMatch.subject.name,
        sectionName: exactMatch.section.name,
        currentType: exactMatch.question.type,
        proposedType: finalProposedType,
        currentAnswer: exactMatch.question.answerOptions,
        proposedAnswer: finalProposedAnswer,
        proposedLetterAnswer: finalLetterAnswer,
        confidence: 'exact',
        matchScore: 100,
        matchReason: `Exact match on Section "${item.sectionName}" and Question #${item.questionNumber}`,
        status,
        isIncluded: true,
      });
    }
  });

  // Phase 2: Section Fuzzy Match (e.g. "P1 · Chemistry" -> "Chemistry Section 1" or "Chemistry")
  answerKeyResult.items.forEach((item, keyIdx) => {
    if (matchedKeyIndices.has(keyIdx)) return;

    const fuzzyMatch = allPaperQuestions.find((pq) => {
      if (matchedQuestionIds.has(pq.question.id)) return false;
      if (pq.question.que !== item.questionNumber) return false;

      const normKeySec = item.sectionName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normPaperSec = pq.section.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normPaperSub = pq.subject.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      return (
        normKeySec.includes(normPaperSub) ||
        normPaperSub.includes(normKeySec) ||
        normKeySec.includes(normPaperSec) ||
        normPaperSec.includes(normKeySec)
      );
    });

    if (fuzzyMatch) {
      matchedKeyIndices.add(keyIdx);
      matchedQuestionIds.add(fuzzyMatch.question.id);

      const isPaperNat = fuzzyMatch.question.type === 'nat' || fuzzyMatch.section.name.toLowerCase().includes('numerical') || fuzzyMatch.section.name.toLowerCase().includes('nat');
      const finalProposedType = isPaperNat && item.inferredType === 'mcq' ? 'nat' : item.inferredType;
      const finalProposedAnswer = isPaperNat ? item.rawAnswer : item.normalizedAnswer;
      const finalLetterAnswer = isPaperNat ? item.rawAnswer : item.letterAnswer;

      const isTypeChanged = fuzzyMatch.question.type !== finalProposedType;
      const isAnswerChanged =
        fuzzyMatch.question.answerOptions !== finalProposedAnswer &&
        fuzzyMatch.question.answerOptions !== finalLetterAnswer;

      let status: QuestionMatchResult['status'] = 'already_matches';
      if (isTypeChanged) status = 'type_changed';
      else if (isAnswerChanged) status = 'answer_updated';

      matches.push({
        id: generateId(),
        questionId: fuzzyMatch.question.id,
        questionNumber: fuzzyMatch.question.que,
        subjectName: fuzzyMatch.subject.name,
        sectionName: fuzzyMatch.section.name,
        currentType: fuzzyMatch.question.type,
        proposedType: finalProposedType,
        currentAnswer: fuzzyMatch.question.answerOptions,
        proposedAnswer: finalProposedAnswer,
        proposedLetterAnswer: finalLetterAnswer,
        confidence: 'section_fuzzy',
        matchScore: 92,
        matchReason: `Fuzzy section match ("${item.sectionName}" ~ "${fuzzyMatch.section.name}") for Q#${item.questionNumber}`,
        status,
        isIncluded: true,
      });
    }
  });

  // Phase 3: Global Unique Question Number Match
  answerKeyResult.items.forEach((item, keyIdx) => {
    if (matchedKeyIndices.has(keyIdx)) return;

    const globalQMatches = allPaperQuestions.filter(
      (pq) => !matchedQuestionIds.has(pq.question.id) && pq.question.que === item.questionNumber
    );

    if (globalQMatches.length === 1) {
      const qMatch = globalQMatches[0];
      matchedKeyIndices.add(keyIdx);
      matchedQuestionIds.add(qMatch.question.id);

      const isPaperNat = qMatch.question.type === 'nat' || qMatch.section.name.toLowerCase().includes('numerical') || qMatch.section.name.toLowerCase().includes('nat');
      const finalProposedType = isPaperNat && item.inferredType === 'mcq' ? 'nat' : item.inferredType;
      const finalProposedAnswer = isPaperNat ? item.rawAnswer : item.normalizedAnswer;
      const finalLetterAnswer = isPaperNat ? item.rawAnswer : item.letterAnswer;

      const isTypeChanged = qMatch.question.type !== finalProposedType;
      const isAnswerChanged =
        qMatch.question.answerOptions !== finalProposedAnswer &&
        qMatch.question.answerOptions !== finalLetterAnswer;

      let status: QuestionMatchResult['status'] = 'already_matches';
      if (isTypeChanged) status = 'type_changed';
      else if (isAnswerChanged) status = 'answer_updated';

      matches.push({
        id: generateId(),
        questionId: qMatch.question.id,
        questionNumber: qMatch.question.que,
        subjectName: qMatch.subject.name,
        sectionName: qMatch.section.name,
        currentType: qMatch.question.type,
        proposedType: finalProposedType,
        currentAnswer: qMatch.question.answerOptions,
        proposedAnswer: finalProposedAnswer,
        proposedLetterAnswer: finalLetterAnswer,
        confidence: 'global_qnum',
        matchScore: 85,
        matchReason: `Global Question #${item.questionNumber} unique index match`,
        status,
        isIncluded: true,
      });
    }
  });

  // Collect unmatched
  const unmatchedKeyEntries = answerKeyResult.items.filter((_, idx) => !matchedKeyIndices.has(idx));
  const unmatchedPaperQuestions = allPaperQuestions
    .filter((pq) => !matchedQuestionIds.has(pq.question.id))
    .map((pq) => ({
      subjectName: pq.subject.name,
      sectionName: pq.section.name,
      question: pq.question,
    }));

  // Sort matches by question number
  matches.sort((a, b) => a.questionNumber - b.questionNumber);

  return {
    matches,
    unmatchedKeyEntries,
    unmatchedPaperQuestions,
    totalPaperQuestions: allPaperQuestions.length,
    totalKeyEntries: answerKeyResult.items.length,
    matchedCount: matches.length,
    typeChangedCount: matches.filter((m) => m.status === 'type_changed').length,
    answerUpdatedCount: matches.filter((m) => m.status === 'answer_updated').length,
    unmatchedCount: unmatchedPaperQuestions.length + unmatchedKeyEntries.length,
  };
}

/**
 * Applies verified Answer Key classifications to the active QuestionPaperArchive.
 */
export function applyClassificationToArchive(
  archive: QuestionPaperArchive,
  report: ClassificationReport,
  updateMarksSchemes: boolean = true
): QuestionPaperArchive {
  const matchMap = new Map<string, QuestionMatchResult>();
  report.matches.forEach((m) => {
    if (m.isIncluded) {
      matchMap.set(m.questionId, m);
    }
  });

  const updatedSubjects = archive.subjects.map((sub) => ({
    ...sub,
    sections: sub.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => {
        const match = matchMap.get(q.id);
        if (!match) return q;

        let updatedMarks: MarksScheme = { ...q.marks };
        if (updateMarksSchemes && q.type !== match.proposedType) {
          if (match.proposedType === 'msq') {
            updatedMarks = { cm: 4, im: -2, pm: 1, max: 4 };
          } else if (match.proposedType === 'nat') {
            updatedMarks = { cm: 4, im: 0, pm: 0, max: 4 };
          } else if (match.proposedType === 'msm') {
            updatedMarks = { cm: 3, im: -1, pm: 1, max: 12 };
          } else {
            updatedMarks = { cm: 3, im: -1, pm: 0, max: 3 };
          }
        }

        return {
          ...q,
          type: match.proposedType,
          answerOptions: match.proposedAnswer,
          marks: updatedMarks,
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
 * Generates the Official Answer Key JSON string from an active QuestionPaperArchive
 * strictly adhering to the schema:
 * {
 *   "sections": {
 *     "P1 · Chemistry": {
 *       "18": { "correctOption": "B" },
 *       "22": { "correctOptions": "A,B,D" },
 *       "25": { "correctAnswer": "3" }
 *     }
 *   }
 * }
 */
export function generateOfficialAnswerKeyJson(
  archive: QuestionPaperArchive,
  sectionPrefix: string = ''
): string {
  const output: OfficialAnswerKeySchema = {
    sections: {},
  };

  for (const subject of archive.subjects) {
    for (const section of subject.sections) {
      // Build standard section display name (e.g. "P1 · Physics" or "Chemistry Section 1")
      let sectionKey = section.name;
      if (sectionPrefix) {
        sectionKey = `${sectionPrefix} · ${subject.name}`;
      }

      if (!output.sections[sectionKey]) {
        output.sections[sectionKey] = {};
      }

      for (const q of section.questions) {
        const qKey = String(q.que);
        const ans = q.answerOptions ? q.answerOptions.trim() : '';

        if (q.type === 'mcq') {
          const letter = optionIndexToLetter(ans) || ans || 'A';
          output.sections[sectionKey][qKey] = { correctOption: letter };
        } else if (q.type === 'msq') {
          const letters = optionIndicesToLetters(ans) || ans || 'A,B';
          output.sections[sectionKey][qKey] = { correctOptions: letters };
        } else if (q.type === 'nat') {
          output.sections[sectionKey][qKey] = { correctAnswer: ans || '0' };
        } else {
          output.sections[sectionKey][qKey] = { correctOption: ans || 'A' };
        }
      }
    }
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Generates CSV representation of the active paper's answer key.
 */
export function generateAnswerKeyCsv(archive: QuestionPaperArchive): string {
  const rows: string[] = ['Subject,Section,Question Number,Type,Answer (Letter),Answer (Index),Marks (+cm/-im)'];

  for (const subject of archive.subjects) {
    for (const section of subject.sections) {
      for (const q of section.questions) {
        const letterAns = q.type === 'mcq'
          ? optionIndexToLetter(q.answerOptions)
          : q.type === 'msq'
          ? optionIndicesToLetters(q.answerOptions)
          : q.answerOptions;

        rows.push(
          `"${subject.name}","${section.name}",${q.que},"${q.type.toUpperCase()}","${letterAns}","${q.answerOptions}","+${q.marks.cm}/${q.marks.im}"`
        );
      }
    }
  }

  return rows.join('\n');
}

/**
 * Merges multiple LoadedAnswerKeyFile objects into a single cohesive AnswerKeyParseResult and official JSON.
 */
export function mergeMultipleAnswerKeys(
  files: LoadedAnswerKeyFile[]
): { parseResult: AnswerKeyParseResult; mergedJson: string } {
  const activeFiles = files.filter((f) => f.enabled);

  if (activeFiles.length === 0) {
    return {
      parseResult: {
        isValid: false,
        format: 'unknown',
        items: [],
        sectionsMap: {},
        totalQuestions: 0,
        warnings: ['No active answer key files selected.'],
      },
      mergedJson: '',
    };
  }

  // Combined official sections structure
  const mergedSections: Record<string, Record<string, OfficialAnswerEntry>> = {};
  const warnings: string[] = [];
  const allItems: NormalizedAnswerItem[] = [];
  const sectionsMap: Record<string, NormalizedAnswerItem[]> = {};

  // Process each file in order (later files can augment or update earlier files)
  for (const file of activeFiles) {
    if (!file.parseResult.isValid) continue;

    for (const item of file.parseResult.items) {
      const secName = item.sectionName || 'General Section';
      const qKey = String(item.questionNumber);

      if (!mergedSections[secName]) {
        mergedSections[secName] = {};
      }

      if (!sectionsMap[secName]) {
        sectionsMap[secName] = [];
      }

      // Build official entry
      let entry: OfficialAnswerEntry = {};
      if (item.inferredType === 'mcq') {
        entry = { correctOption: item.letterAnswer || 'A' };
      } else if (item.inferredType === 'msq') {
        entry = { correctOptions: item.letterAnswer || 'A,B' };
      } else if (item.inferredType === 'nat') {
        entry = { correctAnswer: item.rawAnswer || '0' };
      } else {
        entry = { correctOption: item.letterAnswer || 'A' };
      }

      mergedSections[secName][qKey] = entry;

      // Remove previous duplicate if existing in allItems / sectionsMap
      const existingItemIdx = allItems.findIndex(
        (i) => i.sectionName.toLowerCase() === secName.toLowerCase() && i.questionNumber === item.questionNumber
      );
      if (existingItemIdx >= 0) {
        allItems[existingItemIdx] = item;
      } else {
        allItems.push(item);
      }

      const existingSecIdx = sectionsMap[secName].findIndex((i) => i.questionNumber === item.questionNumber);
      if (existingSecIdx >= 0) {
        sectionsMap[secName][existingSecIdx] = item;
      } else {
        sectionsMap[secName].push(item);
      }
    }
  }

  // Sort items by question number
  allItems.sort((a, b) => a.questionNumber - b.questionNumber);
  for (const secKey of Object.keys(sectionsMap)) {
    sectionsMap[secKey].sort((a, b) => a.questionNumber - b.questionNumber);
  }

  const mergedJson = JSON.stringify({ sections: mergedSections }, null, 2);

  return {
    parseResult: {
      isValid: allItems.length > 0,
      format: 'official_sections',
      items: allItems,
      sectionsMap,
      totalQuestions: allItems.length,
      warnings,
    },
    mergedJson,
  };
}

/**
 * Official JEE Sample Answer Key matching the exact JSON attached by the user.
 */
export const SAMPLE_OFFICIAL_ANSWER_KEY: OfficialAnswerKeySchema = {
  sections: {
    "P1 · Physics": {
      "1": { "correctOption": "D" },
      "2": { "correctOption": "D" },
      "3": { "correctOption": "A" },
      "4": { "correctOption": "C" },
      "5": { "correctOptions": "A,C" },
      "6": { "correctOptions": "A,B,D" },
      "7": { "correctOptions": "A,B,C" },
      "8": { "correctAnswer": "40" },
      "9": { "correctAnswer": "5" },
      "10": { "correctAnswer": "36" },
      "11": { "correctAnswer": "15" },
      "12": { "correctAnswer": "5" },
      "13": { "correctAnswer": "5" },
      "14": { "correctOption": "D" },
      "15": { "correctOption": "A" },
      "16": { "correctOption": "A" },
      "17": { "correctOption": "A" }
    },
    "P1 · Chemistry": {
      "18": { "correctOption": "B" },
      "19": { "correctOption": "C" },
      "20": { "correctOption": "B" },
      "21": { "correctOption": "D" },
      "22": { "correctOptions": "A,B,D" },
      "23": { "correctOptions": "A,D" },
      "24": { "correctOptions": "C,D" },
      "25": { "correctAnswer": "3" },
      "26": { "correctAnswer": "15" },
      "27": { "correctAnswer": "64" },
      "28": { "correctAnswer": "6" },
      "29": { "correctAnswer": "18" },
      "30": { "correctAnswer": "0" },
      "31": { "correctOption": "A" },
      "32": { "correctOption": "A" },
      "33": { "correctOption": "A" },
      "34": { "correctOption": "D" }
    },
    "P1 · Mathematics": {
      "35": { "correctOption": "D" },
      "36": { "correctOption": "A" },
      "37": { "correctOption": "A" },
      "38": { "correctOption": "B" },
      "39": { "correctOptions": "A,C" },
      "40": { "correctOptions": "A,B,C,D" },
      "41": { "correctOptions": "A,B,C" },
      "42": { "correctAnswer": "5" },
      "43": { "correctAnswer": "400" },
      "44": { "correctAnswer": "0" },
      "45": { "correctAnswer": "5" },
      "46": { "correctAnswer": "20" },
      "47": { "correctAnswer": "1" },
      "48": { "correctOption": "A" },
      "49": { "correctOption": "A" },
      "50": { "correctOption": "C" },
      "51": { "correctOption": "C" }
    }
  }
};

/**
 * Calls AI endpoint to extract and verify Answer Key from base64 page images of an Answer Key PDF.
 */
export async function extractAnswerKeyFromPdfImages(
  images: string[],
  geminiApiKey?: string,
  context?: { totalQuestions?: number; subjects?: string[] },
  enableDoublePass: boolean = true
): Promise<{ parseResult: AnswerKeyParseResult; rawResponse: any }> {
  if (!images || images.length === 0) {
    throw new Error('No images provided for Answer Key extraction.');
  }

  const res = await fetchWithGeminiFallback('/api/extract-answer-key-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, context, options: { enableDoublePass } }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to extract answer key' }));
    throw new Error(err.error || 'Failed to extract answer key from PDF');
  }

  const data = await res.json();
  const rawAnswers = data.answers || [];

  const items: NormalizedAnswerItem[] = [];
  const sectionsMap: Record<string, NormalizedAnswerItem[]> = {};

  rawAnswers.forEach((ans: any) => {
    const qNum = typeof ans.qNo === 'number' ? ans.qNo : parseInt(ans.qNo, 10) || 1;
    const secName = ans.subject ? ans.subject : 'General Key';
    const rawVal = ans.answer || '';
    const normVal = ans.normalizedAnswer || (ans.inferredType === 'mcq' ? letterToOptionIndex(rawVal) : rawVal);
    const letterVal = ans.letterAnswer || (ans.inferredType === 'mcq' ? optionIndexToLetter(normVal) : rawVal);
    const type: QuestionType = ['mcq', 'msq', 'nat', 'msm'].includes(ans.inferredType)
      ? ans.inferredType
      : inferTypeFromAnswerString(rawVal);

    const item: NormalizedAnswerItem = {
      sectionName: secName,
      questionNumber: qNum,
      questionKey: String(qNum),
      rawAnswer: rawVal,
      normalizedAnswer: normVal,
      letterAnswer: letterVal,
      inferredType: type,
      rawEntry: ans,
    };

    items.push(item);
    if (!sectionsMap[secName]) sectionsMap[secName] = [];
    sectionsMap[secName].push(item);
  });

  items.sort((a, b) => a.questionNumber - b.questionNumber);
  Object.keys(sectionsMap).forEach((k) => sectionsMap[k].sort((a, b) => a.questionNumber - b.questionNumber));

  const parseResult: AnswerKeyParseResult = {
    isValid: items.length > 0,
    format: 'flat_sections',
    items,
    sectionsMap,
    totalQuestions: items.length,
    warnings: [],
  };

  return { parseResult, rawResponse: data };
}

/**
 * Infers standard QuestionType from an answer string.
 */
export function inferTypeFromAnswerString(ansStr: string): QuestionType {
  if (!ansStr) return 'mcq';
  const trimmed = ansStr.trim();
  if (trimmed.includes('->') || trimmed.includes('→') || /[A-D]\s*[-:]\s*[P-T]/i.test(trimmed)) {
    return 'msm';
  }
  if (trimmed.includes(',') || /[A-D]{2,}/i.test(trimmed)) {
    return 'msq';
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed) && !['1', '2', '3', '4'].includes(trimmed)) {
    return 'nat';
  }
  return 'mcq';
}

/**
 * Renders an Answer Key PDF File and extracts answer keys via AI.
 * Supports optional selectedPages (1-indexed array of page numbers).
 */
export async function extractAnswerKeyFromPdfFile(
  file: File | Blob,
  geminiApiKey?: string,
  onProgress?: (msg: string, percent: number) => void,
  context?: { totalQuestions?: number; subjects?: string[]; selectedPages?: number[] }
): Promise<{ parseResult: AnswerKeyParseResult; rawResponse: any; pageImages: string[] }> {
  onProgress?.('Rendering Answer Key PDF pages...', 20);

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfjsLib();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let targetPages: number[] = [];
  if (context?.selectedPages && context.selectedPages.length > 0) {
    targetPages = context.selectedPages.filter((p) => p >= 1 && p <= pdfDoc.numPages);
  }
  if (targetPages.length === 0) {
    const numPages = Math.min(pdfDoc.numPages, 10);
    targetPages = Array.from({ length: numPages }, (_, i) => i + 1);
  }

  const pageImages: string[] = [];
  for (let idx = 0; idx < targetPages.length; idx++) {
    const pageNum = targetPages[idx];
    onProgress?.(`Rendering page ${pageNum} (${idx + 1}/${targetPages.length})...`, 20 + Math.round(((idx + 1) / targetPages.length) * 35));
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      pageImages.push(canvas.toDataURL('image/jpeg', 0.85));
    }
  }

  onProgress?.('AI analyzing answer tables and question types...', 65);
  const result = await extractAnswerKeyFromPdfImages(pageImages, geminiApiKey, context);
  onProgress?.(`Extracted ${result.parseResult.items.length} answer keys!`, 100);

  return {
    parseResult: result.parseResult,
    rawResponse: result.rawResponse,
    pageImages,
  };
}

export interface MultiPdfSourceTarget {
  id: string;
  name: string;
  blobOrFile: Blob | File;
  pages: number[];
  role: 'blueprint' | 'questions' | 'answer_key' | 'solution';
}

/**
 * Extracts Answer Key from multiple PDF sources with arbitrary page-specific ranges.
 */
export async function extractAnswerKeyFromMultiPdfSources(
  sources: MultiPdfSourceTarget[],
  geminiApiKey?: string,
  onProgress?: (msg: string, percent: number) => void,
  context?: { totalQuestions?: number; subjects?: string[] }
): Promise<{ parseResult: AnswerKeyParseResult; rawResponse: any; pageImages: string[] }> {
  const answerKeySources = sources.filter((s) => s.role === 'answer_key' && s.pages.length > 0);
  if (answerKeySources.length === 0) {
    throw new Error('No answer key pages assigned across the uploaded documents.');
  }

  const pdfjsLib = await getPdfjsLib();
  const allPageImages: string[] = [];
  let currentStep = 0;
  const totalPagesToRender = answerKeySources.reduce((acc, s) => acc + s.pages.length, 0);

  for (const src of answerKeySources) {
    const arrayBuffer = await src.blobOrFile.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (const pageNum of src.pages) {
      if (pageNum < 1 || pageNum > pdfDoc.numPages) continue;
      currentStep++;
      onProgress?.(
        `Rendering [${src.name}] Page ${pageNum} (${currentStep}/${totalPagesToRender})...`,
        15 + Math.round((currentStep / totalPagesToRender) * 45)
      );

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport } as any).promise;
        allPageImages.push(canvas.toDataURL('image/jpeg', 0.85));
      }
    }
  }

  onProgress?.('AI analyzing answer tables across all selected pages...', 70);
  const result = await extractAnswerKeyFromPdfImages(allPageImages, geminiApiKey, context);
  onProgress?.(`Successfully extracted ${result.parseResult.items.length} answer keys!`, 100);

  return {
    parseResult: result.parseResult,
    rawResponse: result.rawResponse,
    pageImages: allPageImages,
  };
}

/**
 * Subject-specific sample answer keys (for multi-file demonstration).
 */
export const SAMPLE_MULTI_SUBJECT_KEYS: { name: string; content: string }[] = [
  {
    name: 'Physics_AnswerKey_P1.json',
    content: JSON.stringify(
      {
        sections: {
          'P1 · Physics': SAMPLE_OFFICIAL_ANSWER_KEY.sections['P1 · Physics'],
        },
      },
      null,
      2
    ),
  },
  {
    name: 'Chemistry_AnswerKey_P1.json',
    content: JSON.stringify(
      {
        sections: {
          'P1 · Chemistry': SAMPLE_OFFICIAL_ANSWER_KEY.sections['P1 · Chemistry'],
        },
      },
      null,
      2
    ),
  },
  {
    name: 'Mathematics_AnswerKey_P1.json',
    content: JSON.stringify(
      {
        sections: {
          'P1 · Mathematics': SAMPLE_OFFICIAL_ANSWER_KEY.sections['P1 · Mathematics'],
        },
      },
      null,
      2
    ),
  },
];

