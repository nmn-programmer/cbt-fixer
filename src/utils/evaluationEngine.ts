import { MarksScheme, QuestionData, QuestionType, SubjectData } from '../types/cbt';

export type QuestionAttemptStatus = 'full_correct' | 'partial_correct' | 'incorrect' | 'unattempted';

export interface EvaluatedQuestionResult {
  questionId: string;
  que: number;
  type: QuestionType;
  subjectName: string;
  sectionName: string;
  userAnswer: string;
  officialAnswer: string;
  normalizedUserOptions: string[];
  normalizedOfficialOptions: string[];
  status: QuestionAttemptStatus;
  marksAwarded: number;
  maxMarks: number;
  marksScheme: MarksScheme;
  partialTierText?: string;
  explanation: string;
}

export interface SubjectAnalytics {
  subjectName: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  partial: number;
  incorrect: number;
  unattempted: number;
  score: number;
  maxScore: number;
  accuracy: number;
}

export interface PaperEvaluationReport {
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  totalQuestions: number;
  attemptedCount: number;
  fullCorrectCount: number;
  partialCorrectCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  accuracy: number;
  subjectAnalytics: SubjectAnalytics[];
  results: EvaluatedQuestionResult[];
}

/**
 * Normalizes option strings into sorted arrays of 1-based indices (e.g. "A, C" -> ["1", "3"], "1,2,4" -> ["1", "2", "4"])
 */
export function normalizeOptionList(ansStr: string | undefined): string[] {
  if (!ansStr) return [];
  const clean = ansStr.trim().toUpperCase();
  if (!clean) return [];

  // Split by comma, semicolon, space, or slashes
  const tokens = clean.split(/[,;\s/]+/).filter(Boolean);
  const set = new Set<string>();

  for (const token of tokens) {
    if (token === 'A' || token === '1') set.add('1');
    else if (token === 'B' || token === '2') set.add('2');
    else if (token === 'C' || token === '3') set.add('3');
    else if (token === 'D' || token === '4') set.add('4');
    else if (token === 'E' || token === '5') set.add('5');
    else if (token === 'F' || token === '6') set.add('6');
    else if (!isNaN(Number(token))) set.add(token);
    else set.add(token);
  }

  return Array.from(set).sort();
}

/**
 * Converts normalized indices back to letter string (e.g. ["1", "3"] -> "A, C")
 */
export function optionsToLetters(options: string[]): string {
  const map: Record<string, string> = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
    '4': 'D',
    '5': 'E',
    '6': 'F',
  };
  return options.map((opt) => map[opt] || opt).join(', ');
}

/**
 * Evaluates a single question with rigorous JEE Advanced grading logic including tiered partial marks.
 */
export function evaluateQuestion(
  question: QuestionData,
  userAnswerRaw: string | undefined,
  subjectName: string = '',
  sectionName: string = ''
): EvaluatedQuestionResult {
  const qType = question.type;
  const marks = question.marks || { cm: 4, im: -1, pm: 0, max: 4 };
  const maxMarks = marks.max || marks.cm || 4;
  const userAns = (userAnswerRaw || '').trim();
  const officialAns = (question.answerOptions || '').trim();

  // If unattempted
  if (!userAns) {
    return {
      questionId: question.id,
      que: question.que,
      type: qType,
      subjectName,
      sectionName,
      userAnswer: '',
      officialAnswer: officialAns,
      normalizedUserOptions: [],
      normalizedOfficialOptions: normalizeOptionList(officialAns),
      status: 'unattempted',
      marksAwarded: 0,
      maxMarks,
      marksScheme: marks,
      explanation: 'Question was unattempted. Zero marks awarded.',
    };
  }

  // 1. Multiple Select Questions (MSQ) - JEE Advanced Tiered Evaluation
  if (qType === 'msq') {
    const userOpts = normalizeOptionList(userAns);
    const officialOpts = normalizeOptionList(officialAns);

    if (userOpts.length === 0) {
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: [],
        normalizedOfficialOptions: officialOpts,
        status: 'unattempted',
        marksAwarded: 0,
        maxMarks,
        marksScheme: marks,
        explanation: 'No options were chosen. Zero marks awarded.',
      };
    }

    // Check for any wrong options chosen
    const wrongOptionsChosen = userOpts.filter((opt) => !officialOpts.includes(opt));
    const correctOptionsChosen = userOpts.filter((opt) => officialOpts.includes(opt));

    if (wrongOptionsChosen.length > 0) {
      // Negative marking
      const im = marks.im !== undefined ? marks.im : -2;
      const wrongLetters = optionsToLetters(wrongOptionsChosen);
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: userOpts,
        normalizedOfficialOptions: officialOpts,
        status: 'incorrect',
        marksAwarded: im,
        maxMarks,
        marksScheme: marks,
        explanation: `Incorrect option (${wrongLetters}) chosen. Negative marking (${im >= 0 ? '+' : ''}${im}) applied.`,
      };
    }

    // All chosen options are correct!
    if (correctOptionsChosen.length === officialOpts.length) {
      // Full marks!
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: userOpts,
        normalizedOfficialOptions: officialOpts,
        status: 'full_correct',
        marksAwarded: marks.cm,
        maxMarks,
        marksScheme: marks,
        explanation: `Full Marks (+${marks.cm}): All correct options (${optionsToLetters(officialOpts)}) chosen with zero errors.`,
      };
    }

    // Partial marks awarded according to JEE Advanced tiered rules
    const k = correctOptionsChosen.length;
    const n = officialOpts.length;
    let partialMarksAwarded = 0;
    let tierText = '';

    const tiers = marks.partialTiers;

    if (tiers) {
      if (n === 4 && k === 3) {
        partialMarksAwarded = tiers.threeCorrect ?? 3;
        tierText = `+${partialMarksAwarded} (3 of 4 correct)`;
      } else if (n >= 3 && k === 2) {
        partialMarksAwarded = tiers.twoCorrect ?? 2;
        tierText = `+${partialMarksAwarded} (2 of ${n} correct)`;
      } else if (n >= 2 && k === 1) {
        partialMarksAwarded = tiers.oneCorrect ?? 1;
        tierText = `+${partialMarksAwarded} (1 of ${n} correct)`;
      } else {
        partialMarksAwarded = k * (marks.pm ?? 1);
        tierText = `+${partialMarksAwarded} (${k} options partial)`;
      }
    } else if (marks.pm !== undefined && marks.pm > 0) {
      partialMarksAwarded = Math.min(k * marks.pm, marks.cm);
      tierText = `+${partialMarksAwarded} (${k} × ${marks.pm})`;
    } else {
      // Standard default JEE Advanced partial matrix (+3, +2, +1)
      if (n === 4 && k === 3) {
        partialMarksAwarded = 3;
        tierText = '+3 (3 of 4 correct)';
      } else if (n >= 3 && k === 2) {
        partialMarksAwarded = 2;
        tierText = `+2 (2 of ${n} correct)`;
      } else if (n >= 2 && k === 1) {
        partialMarksAwarded = 1;
        tierText = `+1 (1 of ${n} correct)`;
      } else {
        partialMarksAwarded = k;
        tierText = `+${k} (partial)`;
      }
    }

    return {
      questionId: question.id,
      que: question.que,
      type: qType,
      subjectName,
      sectionName,
      userAnswer: userAns,
      officialAnswer: officialAns,
      normalizedUserOptions: userOpts,
      normalizedOfficialOptions: officialOpts,
      status: 'partial_correct',
      marksAwarded: partialMarksAwarded,
      maxMarks,
      marksScheme: marks,
      partialTierText: tierText,
      explanation: `Partial Marks (${tierText}): Selected ${optionsToLetters(correctOptionsChosen)} out of ${optionsToLetters(officialOpts)} without any incorrect options.`,
    };
  }

  // 2. Single Correct MCQ
  if (qType === 'mcq') {
    const userOpts = normalizeOptionList(userAns);
    const officialOpts = normalizeOptionList(officialAns);

    const userSelected = userOpts[0] || userAns;
    const officialSelected = officialOpts[0] || officialAns;

    if (userSelected === officialSelected) {
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: userOpts,
        normalizedOfficialOptions: officialOpts,
        status: 'full_correct',
        marksAwarded: marks.cm,
        maxMarks,
        marksScheme: marks,
        explanation: `Correct option selected (+${marks.cm}).`,
      };
    } else {
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: userOpts,
        normalizedOfficialOptions: officialOpts,
        status: 'incorrect',
        marksAwarded: marks.im,
        maxMarks,
        marksScheme: marks,
        explanation: `Incorrect option selected. Correct answer was ${optionsToLetters(officialOpts) || officialAns}. Negative (${marks.im}) applied.`,
      };
    }
  }

  // 3. Numerical Answer Type (NAT)
  if (qType === 'nat') {
    const userNum = parseFloat(userAns);
    const officialNum = parseFloat(officialAns);

    let isCorrect = false;

    if (officialAns.includes('to') || officialAns.includes('-') && !officialAns.startsWith('-')) {
      const parts = officialAns.split(/to|-/).map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n));
      if (parts.length === 2) {
        const min = Math.min(parts[0], parts[1]);
        const max = Math.max(parts[0], parts[1]);
        if (!isNaN(userNum) && userNum >= min - 1e-4 && userNum <= max + 1e-4) {
          isCorrect = true;
        }
      }
    } else if (!isNaN(userNum) && !isNaN(officialNum)) {
      if (Math.abs(userNum - officialNum) < 1e-4) {
        isCorrect = true;
      }
    } else if (userAns.trim().toLowerCase() === officialAns.trim().toLowerCase()) {
      isCorrect = true;
    }

    if (isCorrect) {
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: [],
        normalizedOfficialOptions: [],
        status: 'full_correct',
        marksAwarded: marks.cm,
        maxMarks,
        marksScheme: marks,
        explanation: `Correct numerical value (+${marks.cm}).`,
      };
    } else {
      return {
        questionId: question.id,
        que: question.que,
        type: qType,
        subjectName,
        sectionName,
        userAnswer: userAns,
        officialAnswer: officialAns,
        normalizedUserOptions: [],
        normalizedOfficialOptions: [],
        status: 'incorrect',
        marksAwarded: marks.im,
        maxMarks,
        marksScheme: marks,
        explanation: `Incorrect numerical value. Expected: ${officialAns}.`,
      };
    }
  }

  // 4. Matrix Match (MSM) / Custom
  const isMatch = userAns.trim().toLowerCase() === officialAns.trim().toLowerCase();
  if (isMatch) {
    return {
      questionId: question.id,
      que: question.que,
      type: qType,
      subjectName,
      sectionName,
      userAnswer: userAns,
      officialAnswer: officialAns,
      normalizedUserOptions: [],
      normalizedOfficialOptions: [],
      status: 'full_correct',
      marksAwarded: marks.cm,
      maxMarks,
      marksScheme: marks,
      explanation: `Matrix matches correctly (+${marks.cm}).`,
    };
  } else {
    return {
      questionId: question.id,
      que: question.que,
      type: qType,
      subjectName,
      sectionName,
      userAnswer: userAns,
      officialAnswer: officialAns,
      normalizedUserOptions: [],
      normalizedOfficialOptions: [],
      status: 'incorrect',
      marksAwarded: marks.im,
      maxMarks,
      marksScheme: marks,
      explanation: `Matrix match mismatch. Expected: ${officialAns}.`,
    };
  }
}

/**
 * Evaluates the entire paper and computes comprehensive JEE Advanced score report.
 */
export function evaluateWholePaper(
  subjects: SubjectData[],
  userAnswers: Record<string, string>
): PaperEvaluationReport {
  const results: EvaluatedQuestionResult[] = [];
  const subjectMap = new Map<string, SubjectAnalytics>();

  let totalScore = 0;
  let maxPossibleScore = 0;
  let attemptedCount = 0;
  let fullCorrectCount = 0;
  let partialCorrectCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  for (const subj of subjects) {
    if (!subjectMap.has(subj.name)) {
      subjectMap.set(subj.name, {
        subjectName: subj.name,
        totalQuestions: 0,
        attempted: 0,
        correct: 0,
        partial: 0,
        incorrect: 0,
        unattempted: 0,
        score: 0,
        maxScore: 0,
        accuracy: 0,
      });
    }

    const sAnalytics = subjectMap.get(subj.name)!;

    for (const sec of subj.sections) {
      for (const q of sec.questions) {
        const userAns = userAnswers[q.id];
        const res = evaluateQuestion(q, userAns, subj.name, sec.name);
        results.push(res);

        sAnalytics.totalQuestions += 1;
        sAnalytics.maxScore += res.maxMarks;
        sAnalytics.score += res.marksAwarded;
        totalScore += res.marksAwarded;
        maxPossibleScore += res.maxMarks;

        if (res.status === 'full_correct') {
          sAnalytics.correct += 1;
          sAnalytics.attempted += 1;
          fullCorrectCount += 1;
          attemptedCount += 1;
        } else if (res.status === 'partial_correct') {
          sAnalytics.partial += 1;
          sAnalytics.attempted += 1;
          partialCorrectCount += 1;
          attemptedCount += 1;
        } else if (res.status === 'incorrect') {
          sAnalytics.incorrect += 1;
          sAnalytics.attempted += 1;
          incorrectCount += 1;
          attemptedCount += 1;
        } else {
          sAnalytics.unattempted += 1;
          unattemptedCount += 1;
        }
      }
    }
  }

  // Calculate accuracies
  const subjectAnalytics: SubjectAnalytics[] = [];
  for (const [, s] of subjectMap) {
    const attempted = s.attempted;
    s.accuracy = attempted > 0 ? Math.round(((s.correct + s.partial * 0.5) / attempted) * 100) : 0;
    subjectAnalytics.push(s);
  }

  const percentage = maxPossibleScore > 0 ? Math.round((Math.max(0, totalScore) / maxPossibleScore) * 1000) / 10 : 0;
  const overallAccuracy = attemptedCount > 0 ? Math.round(((fullCorrectCount + partialCorrectCount * 0.5) / attemptedCount) * 100) : 0;

  return {
    totalScore,
    maxPossibleScore,
    percentage,
    totalQuestions: results.length,
    attemptedCount,
    fullCorrectCount,
    partialCorrectCount,
    incorrectCount,
    unattemptedCount,
    accuracy: overallAccuracy,
    subjectAnalytics,
    results,
  };
}
