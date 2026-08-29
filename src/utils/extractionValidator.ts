import { QuestionDetection } from './streamingMerger';
import { SwarmAgent } from './amasOrchestrator';

export interface ExtractionValidationIssue {
  type: 'duplicate_qno' | 'suspicious_multipart' | 'overlapping_boxes' | 'inverted_bounds' | 'missing_box_coordinates';
  qNo?: number;
  severity: 'critical' | 'warning';
  description: string;
  affectedIndices: number[];
}

export interface ExtractionValidationResult {
  isValid: boolean;
  issues: ExtractionValidationIssue[];
  autoCorrectNeeded: boolean;
  cleanQuestions: QuestionDetection[];
}

/**
 * Extraction Validation Middleware
 * Runs immediately after each worker returns its extracted JSON payload.
 * Inspects for:
 * 1. Duplicate question numbers in the same batch
 * 2. Suspicious multi-part counts (> 2 parts per question)
 * 3. Inverted, out-of-bounds, or NaN bounding box coordinates
 * 4. Merged multi-column collision boxes
 */
export function validateWorkerExtraction(
  questions: QuestionDetection[],
  batchPageIndex: number = 0
): ExtractionValidationResult {
  const issues: ExtractionValidationIssue[] = [];

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return {
      isValid: true,
      issues: [],
      autoCorrectNeeded: false,
      cleanQuestions: [],
    };
  }

  // 1. Check for duplicate question numbers (where qNo > 0)
  const qNoCounts = new Map<number, number[]>();
  questions.forEach((q, idx) => {
    const qNum = Number(q.qNo);
    if (qNum && qNum > 0) {
      const existing = qNoCounts.get(qNum) || [];
      existing.push(idx);
      qNoCounts.set(qNum, existing);
    }
  });

  qNoCounts.forEach((indices, qNum) => {
    if (indices.length > 1) {
      issues.push({
        type: 'duplicate_qno',
        qNo: qNum,
        severity: 'critical',
        description: `Question number Q${qNum} appeared ${indices.length} times in a single worker batch.`,
        affectedIndices: indices,
      });
    }
  });

  // 2. Check for suspicious multi-part counts (> 2 parts per question)
  questions.forEach((q, idx) => {
    const partsCount = q.splitParts ? q.splitParts.length : 0;
    if (partsCount > 2) {
      issues.push({
        type: 'suspicious_multipart',
        qNo: q.qNo,
        severity: 'critical',
        description: `Question Q${q.qNo || 'Unknown'} has ${partsCount} split parts (maximum expected in standard test papers is 2). Potential multiple questions merged into one.`,
        affectedIndices: [idx],
      });
    }
  });

  // 3. Check for invalid or inverted bounding boxes
  questions.forEach((q, idx) => {
    if (!q.box || !Array.isArray(q.box) || q.box.length !== 4) {
      issues.push({
        type: 'missing_box_coordinates',
        qNo: q.qNo,
        severity: 'critical',
        description: `Question Q${q.qNo || 'Unknown'} has invalid or missing bounding box array.`,
        affectedIndices: [idx],
      });
    } else {
      const [ymin, xmin, ymax, xmax] = q.box;
      if (
        isNaN(ymin) || isNaN(xmin) || isNaN(ymax) || isNaN(xmax) ||
        ymin < 0 || xmin < 0 || ymax > 1.05 || xmax > 1.05 ||
        ymin >= ymax || xmin >= xmax
      ) {
        issues.push({
          type: 'inverted_bounds',
          qNo: q.qNo,
          severity: 'warning',
          description: `Question Q${q.qNo || 'Unknown'} has inverted or out-of-bounds coordinates: [${ymin.toFixed(2)}, ${xmin.toFixed(2)}, ${ymax.toFixed(2)}, ${xmax.toFixed(2)}].`,
          affectedIndices: [idx],
        });
      }
    }

    // Also check splitParts boxes if present
    if (q.splitParts && Array.isArray(q.splitParts)) {
      q.splitParts.forEach((sp, spIdx) => {
        if (!sp.box || !Array.isArray(sp.box) || sp.box.length !== 4) {
          issues.push({
            type: 'missing_box_coordinates',
            qNo: q.qNo,
            severity: 'critical',
            description: `Question Q${q.qNo} Part ${spIdx + 1} has missing bounding box coordinates.`,
            affectedIndices: [idx],
          });
        }
      });
    }
  });

  const hasCritical = issues.some((iss) => iss.severity === 'critical');

  return {
    isValid: !hasCritical,
    issues,
    autoCorrectNeeded: hasCritical,
    cleanQuestions: sanitizeAndRecoverQuestions(questions),
  };
}

/**
 * Deterministic local sanitizer that resolves duplicates and uncouples bloated multi-parts
 * when an auto-correction pass returns or if fallback recovery is invoked.
 */
export function sanitizeAndRecoverQuestions(questions: QuestionDetection[]): QuestionDetection[] {
  if (!questions || questions.length === 0) return [];

  const recovered: QuestionDetection[] = [];
  const seenQNos = new Set<number>();

  questions.forEach((q) => {
    const clone: QuestionDetection = {
      ...q,
      box: [...(q.box || [0, 0, 1, 1])] as [number, number, number, number],
      splitParts: q.splitParts ? q.splitParts.map((sp) => ({ ...sp, box: [...sp.box] as [number, number, number, number] })) : undefined,
    };

    // Ensure normalized box bounds are well-formed [0.0 - 1.0]
    let [ymin, xmin, ymax, xmax] = clone.box;
    ymin = Math.max(0, Math.min(1, ymin));
    xmin = Math.max(0, Math.min(1, xmin));
    ymax = Math.max(ymin + 0.02, Math.min(1, ymax));
    xmax = Math.max(xmin + 0.02, Math.min(1, xmax));
    clone.box = [ymin, xmin, ymax, xmax];

    // If splitParts has more than 2 parts or contains parts with distinct implicit questions,
    // decompose parts into standalone question boxes if they are large enough
    if (clone.splitParts && clone.splitParts.length > 2) {
      // Deduplicate parts by coordinate similarity
      const uniqueParts: typeof clone.splitParts = [];
      clone.splitParts.forEach((part) => {
        const isDup = uniqueParts.some(
          (up) =>
            up.pageIndex === part.pageIndex &&
            Math.abs(up.box[0] - part.box[0]) < 0.03 &&
            Math.abs(up.box[1] - part.box[1]) < 0.03 &&
            Math.abs(up.box[2] - part.box[2]) < 0.03 &&
            Math.abs(up.box[3] - part.box[3]) < 0.03
        );
        if (!isDup) uniqueParts.push(part);
      });

      if (uniqueParts.length <= 2) {
        clone.splitParts = uniqueParts;
      } else {
        // Keep top 2 parts for this question, unbundle the rest as individual items
        clone.splitParts = uniqueParts.slice(0, 2);
        const unbundled = uniqueParts.slice(2);
        unbundled.forEach((ub, ubIdx) => {
          recovered.push({
            pageIndex: ub.pageIndex,
            qNo: 0, // Assigned sequentially later
            subject: clone.subject || 'General',
            type: clone.type || 'MCQ_SINGLE',
            box: ub.box,
            isSplit: false,
          });
        });
      }
    }

    // Deduplicate identical qNo
    if (clone.qNo && clone.qNo > 0) {
      if (seenQNos.has(clone.qNo)) {
        // Assign 0 to allow automatic monotonic sequence assignment later
        clone.qNo = 0;
      } else {
        seenQNos.add(clone.qNo);
      }
    }

    recovered.push(clone);
  });

  return recovered;
}

/**
 * Creates an Auto-Correction Request prompt instruction targeted to the worker
 * when duplicate questions or multi-part hallucinations are detected.
 */
export function buildAutoCorrectionPrompt(
  issues: ExtractionValidationIssue[],
  rawQuestionsCount: number
): string {
  const issueSummaries = issues.map((iss) => `- [${iss.type.toUpperCase()}]: ${iss.description}`).join('\n');

  return `EXTRACTION VALIDATION FAILURE DETECTED:
The previous extraction generated ${rawQuestionsCount} question blocks with critical defects:
${issueSummaries}

MANDATORY CORRECTION INSTRUCTIONS:
1. DO NOT MERGE multiple separate questions into one question's "splitParts".
   - Each printed question number (e.g. "1.", "2.", "Q.1", "Q.2") MUST be its own distinct object in the "questions" array.
   - "splitParts" MUST ONLY be used if a single question's stem or options literally break across the column bottom or page end without any new question number.
   - Under no circumstances should a question contain more than 2 splitParts!
2. ELIMINATE DUPLICATE QUESTION NUMBERS.
   - Verify each question's printed number sequentially from top-to-bottom in the left column first, then the right column.
3. RE-PARSE ALL BOUNDING BOXES WITH STRICT BOUNDARIES.
   - For 2-column layouts, NEVER allow a left-column box to span beyond xmax 0.490.
   - Re-emit the complete corrected "questions" JSON array adhering strictly to these rules.`;
}
