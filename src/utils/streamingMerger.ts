import { BlueprintSectionRange, QuestionData, QuestionType } from '../types/cbt';

export interface QuestionDetection {
  pageIndex: number;
  qNo: number;
  subject: string;
  type: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized
  isSplit?: boolean;
  completeness?: 'complete' | 'split' | 'continuation_only';
  optionsFound?: string[];
  isOrphanContinuation?: boolean;
  continuationForQNo?: number | null;
  splitParts?: {
    pageIndex: number;
    box: [number, number, number, number];
    partLabel?: string;
    partIndex?: number;
  }[];
}

export interface AnswerKeyEntry {
  qNo: number;
  answer: string;
  natValue?: number;
  subject?: string;
  type?: string;
}

export interface ReconciliationReport {
  totalExpectedKeys: number;
  totalExtractedQuestions: number;
  matchedKeysCount: number;
  missingGaps: number[];
  natValidatedCount: number;
  precisionScorePercent: number;
  discrepancies: {
    qNo: number;
    issueType: 'missing_question' | 'type_mismatch' | 'unmatched_key' | 'nat_value_attached';
    details: string;
  }[];
}

/**
 * Ground-Truth Reconciliation Engine
 * Reconciles extracted question blocks against official answer key entries (Stream B).
 * Automatically applies options, NAT numeric values, detects missing question gaps,
 * and generates diagnostic accuracy reports.
 */
export function identifyMissingQuestionPages(
  missingGaps: number[],
  questions: QuestionDetection[],
  totalPages: number = 1
): { qNo: number; candidatePageIndices: number[] }[] {
  if (!missingGaps || missingGaps.length === 0) return [];

  const qMap = new Map<number, QuestionDetection>();
  questions.forEach((q) => qMap.set(q.qNo, q));

  const sortedExistingQNos = Array.from(qMap.keys()).sort((a, b) => a - b);

  return missingGaps.map((missingQ) => {
    let lowerQ = -1;
    let upperQ = -1;

    for (const qNo of sortedExistingQNos) {
      if (qNo < missingQ) lowerQ = qNo;
      if (qNo > missingQ && upperQ === -1) upperQ = qNo;
    }

    const pages = new Set<number>();
    if (lowerQ !== -1 && qMap.has(lowerQ)) {
      pages.add(qMap.get(lowerQ)!.pageIndex);
    }
    if (upperQ !== -1 && qMap.has(upperQ)) {
      pages.add(qMap.get(upperQ)!.pageIndex);
    }

    // Fallback if no surrounding questions found
    if (pages.size === 0) {
      // Estimate based on ratio missingQ / maxQ
      const estRatio = missingQ / Math.max(1, missingQ + 10);
      const estPage = Math.min(totalPages - 1, Math.max(0, Math.floor(estRatio * totalPages)));
      pages.add(estPage);
    }

    return {
      qNo: missingQ,
      candidatePageIndices: Array.from(pages).sort((a, b) => a - b),
    };
  });
}

export function reconcileGroundTruthKeys(
  questions: QuestionDetection[],
  answerKeys: AnswerKeyEntry[],
  blueprintRanges?: BlueprintSectionRange[]
): {
  reconciledQuestions: QuestionDetection[];
  report: ReconciliationReport;
} {
  const keyMap = new Map<number, AnswerKeyEntry>();
  answerKeys.forEach((ak) => {
    if (ak && ak.qNo != null) {
      keyMap.set(Number(ak.qNo), ak);
    }
  });

  const report: ReconciliationReport = {
    totalExpectedKeys: keyMap.size,
    totalExtractedQuestions: questions.length,
    matchedKeysCount: 0,
    missingGaps: [],
    natValidatedCount: 0,
    precisionScorePercent: 100,
    discrepancies: [],
  };

  if (questions.length === 0) {
    return { reconciledQuestions: questions, report };
  }

  // Find range of question numbers present in ground truth keyMap
  const expectedQNos = Array.from(keyMap.keys()).sort((a, b) => a - b);
  const maxExpectedQ = expectedQNos.length > 0 ? Math.max(...expectedQNos) : Math.max(...questions.map((q) => q.qNo || 0));

  const extractedQNosSet = new Set(questions.map((q) => q.qNo));

  // Identify Missing Question Gaps
  if (expectedQNos.length > 0) {
    for (const expectedQ of expectedQNos) {
      if (!extractedQNosSet.has(expectedQ)) {
        report.missingGaps.push(expectedQ);
        report.discrepancies.push({
          qNo: expectedQ,
          issueType: 'missing_question',
          details: `Question Q${expectedQ} present in ground-truth answer key but missing in visual page scans.`,
        });
      }
    }
  }

  // Process & Attach Ground Truth Attributes
  const reconciledQuestions = questions.map((q) => {
    const qCopy = { ...q };
    const ak = keyMap.get(qCopy.qNo);

    if (ak) {
      report.matchedKeysCount++;

      // Check for type match with blueprint / answer key
      if (ak.type && qCopy.type && ak.type.toLowerCase() !== qCopy.type.toLowerCase()) {
        report.discrepancies.push({
          qNo: qCopy.qNo,
          issueType: 'type_mismatch',
          details: `Visual scan categorized Q${qCopy.qNo} as [${qCopy.type}], but Answer Key indicates [${ak.type}]. Corrected to [${ak.type}].`,
        });
        qCopy.type = ak.type.toLowerCase();
      }

      // Check NAT numerical values
      if (ak.natValue != null || (ak.answer && !isNaN(Number(ak.answer.trim())))) {
        const val = ak.natValue != null ? ak.natValue : Number(ak.answer.trim());
        report.natValidatedCount++;
        qCopy.type = 'nat';
        report.discrepancies.push({
          qNo: qCopy.qNo,
          issueType: 'nat_value_attached',
          details: `Q${qCopy.qNo} verified as Numerical/NAT with ground-truth value = ${val}`,
        });
      }
    }

    return qCopy;
  });

  // Calculate Precision Score Percent
  const maxPossible = Math.max(1, Math.max(report.totalExpectedKeys, report.totalExtractedQuestions));
  const precisionRatio = report.matchedKeysCount / maxPossible;
  report.precisionScorePercent = Math.min(100, Math.max(0, Math.round(precisionRatio * 100)));

  return { reconciledQuestions, report };
}

/**
  * Incremental Streaming Merger with Pending Boundary Buffer
  * Manages real-time producer-consumer queue for streaming page batches.
  */
export class StreamingProducerConsumerMerger {
  private pendingBoundaryBuffer: QuestionDetection[] = [];
  private confirmedQuestions: QuestionDetection[] = [];
  private handleSplitQuestions: boolean = true;

  constructor(handleSplitQuestions: boolean = true) {
    this.handleSplitQuestions = handleSplitQuestions;
  }

  /**
    * Push a newly extracted batch of questions from worker streams.
    * Resolves cross-page boundaries with the pending buffer and returns confirmed questions.
    */
  public pushBatch(
    newQuestions: QuestionDetection[],
    isLastBatch: boolean = false
  ): {
    newlyConfirmed: QuestionDetection[];
    pendingBufferCount: number;
  } {
    if (!newQuestions || newQuestions.length === 0) {
      if (isLastBatch) {
        const flushed = [...this.pendingBoundaryBuffer];
        this.pendingBoundaryBuffer = [];
        this.confirmedQuestions.push(...flushed);
        return { newlyConfirmed: flushed, pendingBufferCount: 0 };
      }
      return { newlyConfirmed: [], pendingBufferCount: this.pendingBoundaryBuffer.length };
    }

    // Sort incoming batch questions in physical 2-column reading order:
    // Page -> Column (Left/Right) -> Top-to-Bottom
    const sortedNew = [...newQuestions].sort((a, b) => {
      const pA = a.pageIndex ?? 0;
      const pB = b.pageIndex ?? 0;
      if (pA !== pB) return pA - pB;

      const colA = a.box && a.box[1] >= 0.49 ? 1 : 0;
      const colB = b.box && b.box[1] >= 0.49 ? 1 : 0;
      if (colA !== colB) return colA - colB;

      const yA = a.box ? a.box[0] : 0;
      const yB = b.box ? b.box[0] : 0;
      return yA - yB;
    });

    const combinedPool = [...this.pendingBoundaryBuffer, ...sortedNew];
    this.pendingBoundaryBuffer = [];

    const currentResolvedBatch: QuestionDetection[] = [];

    for (let i = 0; i < combinedPool.length; i++) {
      const item = combinedPool[i];
      if (!item || !item.box || item.box.length < 4) continue;

      const prevQ =
        currentResolvedBatch.length > 0
          ? currentResolvedBatch[currentResolvedBatch.length - 1]
          : this.confirmedQuestions.length > 0
          ? this.confirmedQuestions[this.confirmedQuestions.length - 1]
          : null;

      // Check if item is an orphan continuation from previous page/batch boundary
      const isExplicitOrphan = Boolean(
        item.isOrphanContinuation ||
          (item.continuationForQNo && prevQ && item.continuationForQNo === prevQ.qNo)
      );

      const isUnnumberedTopContinuation = Boolean(
        prevQ &&
          (!item.qNo || item.qNo === 0 || item.qNo === prevQ.qNo) &&
          item.box[0] < 0.38
      );

      const isSplitPredecessorNeedsOptions = Boolean(
        prevQ &&
          this.handleSplitQuestions &&
          (prevQ.completeness === 'split' ||
            prevQ.isSplit ||
            (prevQ.type === 'mcq' && (!prevQ.optionsFound || prevQ.optionsFound.length < 3))) &&
          item.box[0] < 0.38 &&
          (!item.qNo || item.qNo === prevQ.qNo || (item.optionsFound && item.optionsFound.length >= 1))
      );

      if (prevQ && (isExplicitOrphan || isUnnumberedTopContinuation || isSplitPredecessorNeedsOptions)) {
        // Stitch continuation into prevQ
        prevQ.isSplit = true;
        if (!prevQ.splitParts || prevQ.splitParts.length === 0) {
          prevQ.splitParts = [{ pageIndex: prevQ.pageIndex, box: prevQ.box, partIndex: 1 }];
        }

        if (item.splitParts && item.splitParts.length > 0) {
          item.splitParts.forEach((sp) => {
            prevQ.splitParts!.push({
              pageIndex: sp.pageIndex,
              box: sp.box,
              partIndex: prevQ.splitParts!.length + 1,
            });
          });
        } else {
          prevQ.splitParts.push({
            pageIndex: item.pageIndex,
            box: item.box,
            partIndex: prevQ.splitParts!.length + 1,
          });
        }

        if (item.optionsFound && item.optionsFound.length > 0) {
          const combined = Array.from(new Set([...(prevQ.optionsFound || []), ...item.optionsFound]));
          prevQ.optionsFound = combined;
        }
        prevQ.completeness = 'complete';
        continue;
      }

      currentResolvedBatch.push(item);
    }

    // Boundary Retention Logic:
    // If not last batch, hold the trailing item in pendingBoundaryBuffer if it appears near page/column bottom
    let newlyConfirmed: QuestionDetection[] = [];

    if (!isLastBatch && currentResolvedBatch.length > 0) {
      const trailingItem = currentResolvedBatch[currentResolvedBatch.length - 1];
      const isTrailingAtBottom = trailingItem.box[2] > 0.65 || trailingItem.completeness === 'split';

      if (isTrailingAtBottom) {
        this.pendingBoundaryBuffer = [trailingItem];
        newlyConfirmed = currentResolvedBatch.slice(0, -1);
      } else {
        newlyConfirmed = currentResolvedBatch;
      }
    } else {
      newlyConfirmed = currentResolvedBatch;
      this.pendingBoundaryBuffer = [];
    }

    this.confirmedQuestions.push(...newlyConfirmed);

    return {
      newlyConfirmed,
      pendingBufferCount: this.pendingBoundaryBuffer.length,
    };
  }

  public getConfirmedQuestions(): QuestionDetection[] {
    return this.confirmedQuestions;
  }

  public getPendingBuffer(): QuestionDetection[] {
    return this.pendingBoundaryBuffer;
  }
}
