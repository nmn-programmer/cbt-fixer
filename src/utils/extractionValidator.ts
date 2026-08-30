import { QuestionDetection } from './intelligentCvSplitter';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  qNo: number;
  pageIndex: number;
  type:
    | 'duplicate_qno'
    | 'bad_bbox'
    | 'inverted_bbox'
    | 'micro_box'
    | 'out_of_bounds'
    | 'overlapping_boxes'
    | 'sequence_gap'
    | 'missing_metadata'
    | 'orphan_options';
  message: string;
  suggestedFix?: string;
}

export interface PageValidationReport {
  pageIndex: number;
  totalDetections: number;
  isValid: boolean;
  score: number; // 0 - 100
  criticalCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  autoCorrectPrompt?: string;
}

/**
 * Calculates 2D Intersection over Union (IoU) between two normalized bounding boxes [ymin, xmin, ymax, xmax].
 */
export function calculateBoxIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): number {
  const [yMinA, xMinA, yMaxA, xMaxA] = boxA;
  const [yMinB, xMinB, yMaxB, xMaxB] = boxB;

  const y1 = Math.max(yMinA, yMinB);
  const x1 = Math.max(xMinA, xMinB);
  const y2 = Math.min(yMaxA, yMaxB);
  const x2 = Math.min(xMaxA, xMaxB);

  const interH = Math.max(0, y2 - y1);
  const interW = Math.max(0, x2 - x1);
  const interArea = interH * interW;

  if (interArea <= 0) return 0;

  const areaA = Math.max(0, yMaxA - yMinA) * Math.max(0, xMaxA - xMinA);
  const areaB = Math.max(0, yMaxB - yMinB) * Math.max(0, xMaxB - xMinB);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Validates question detections for a single page or document chunk.
 * Detects duplicate question numbers, bad/degenerate bounding boxes, severe overlaps,
 * missing options, and sequence gaps.
 */
export function validatePageDetections(
  detections: QuestionDetection[],
  pageIndex: number,
  expectedBlueprintRanges?: Array<{ fromQNo: number; toQNo: number; subjectName?: string }>
): PageValidationReport {
  const issues: ValidationIssue[] = [];

  if (!detections || detections.length === 0) {
    return {
      pageIndex,
      totalDetections: 0,
      isValid: true,
      score: 100,
      criticalCount: 0,
      warningCount: 0,
      issues: [],
    };
  }

  const seenQNos = new Map<number, number>(); // qNo -> count

  // 1. Check each question bounding box and metadata
  detections.forEach((q, idx) => {
    const qNo = q.qNo || idx + 1;
    seenQNos.set(qNo, (seenQNos.get(qNo) || 0) + 1);

    if (!q.box || !Array.isArray(q.box) || q.box.length !== 4) {
      issues.push({
        severity: 'critical',
        qNo,
        pageIndex,
        type: 'bad_bbox',
        message: `Question Q${qNo} has missing or malformed bounding box.`,
        suggestedFix: 'Re-estimate bounding box from adjacent questions or trigger Pass 2 rescan.',
      });
      return;
    }

    const [ymin, xmin, ymax, xmax] = q.box;

    // Check inverted coordinates
    if (ymin >= ymax || xmin >= xmax) {
      issues.push({
        severity: 'critical',
        qNo,
        pageIndex,
        type: 'inverted_bbox',
        message: `Question Q${qNo} has inverted bounding box coordinates [${ymin.toFixed(2)}, ${xmin.toFixed(2)}, ${ymax.toFixed(2)}, ${xmax.toFixed(2)}].`,
        suggestedFix: 'Invert or sort coordinate pairs [Math.min(ymin, ymax), Math.min(xmin, xmax), ...].',
      });
    }

    // Check out-of-bounds coordinates
    if (ymin < 0 || xmin < 0 || ymax > 1.05 || xmax > 1.05) {
      issues.push({
        severity: 'warning',
        qNo,
        pageIndex,
        type: 'out_of_bounds',
        message: `Question Q${qNo} coordinates extend outside page canvas boundaries [0.0, 1.0].`,
        suggestedFix: 'Clamp coordinates strictly to [0.01, 0.99].',
      });
    }

    // Check micro-box (degenerate detection where Flash only marked the Q label)
    const height = Math.abs(ymax - ymin);
    const width = Math.abs(xmax - xmin);
    const area = height * width;

    if (height < 0.02 || width < 0.05 || area < 0.002) {
      issues.push({
        severity: 'critical',
        qNo,
        pageIndex,
        type: 'micro_box',
        message: `Question Q${qNo} bounding box is too small (height: ${(height * 100).toFixed(1)}%, area: ${(area * 100).toFixed(2)}%). Attached diagram/options may have been cut off.`,
        suggestedFix: 'Extend vertical boundary downward to bridge to next question label or column end.',
      });
    }

    // Check MCQ options completeness
    if (q.type === 'mcq' && (!q.optionsFound || q.optionsFound.length === 0)) {
      issues.push({
        severity: 'info',
        qNo,
        pageIndex,
        type: 'missing_metadata',
        message: `Question Q${qNo} is classified as MCQ but no options (A, B, C, D) were detected.`,
        suggestedFix: 'Check for options continuation in next column or adjust bottom boundary.',
      });
    }
  });

  // 2. Check for duplicate question numbers on the same page
  seenQNos.forEach((count, qNo) => {
    if (count > 1) {
      issues.push({
        severity: 'critical',
        qNo,
        pageIndex,
        type: 'duplicate_qno',
        message: `Duplicate question number Q${qNo} detected ${count} times on page ${pageIndex}.`,
        suggestedFix: 'Merge split parts or re-number consecutive items.',
      });
    }
  });

  // 3. Check for severe overlapping bounding boxes between distinct questions in the same column
  for (let i = 0; i < detections.length; i++) {
    for (let j = i + 1; j < detections.length; j++) {
      const qA = detections[i];
      const qB = detections[j];
      if (!qA.box || !qB.box) continue;

      const iou = calculateBoxIoU(qA.box, qB.box);
      if (iou > 0.40) {
        issues.push({
          severity: 'warning',
          qNo: qA.qNo,
          pageIndex,
          type: 'overlapping_boxes',
          message: `Questions Q${qA.qNo} and Q${qB.qNo} have high spatial overlap (IoU: ${(iou * 100).toFixed(1)}%).`,
          suggestedFix: 'Split overlapping vertical space at the divider or question label line.',
        });
      }
    }
  }

  // 4. Sequence gap audit against sorted detections
  const sortedQNos = Array.from(new Set(detections.map((q) => q.qNo).filter(Boolean))).sort((a, b) => a - b);
  for (let i = 0; i < sortedQNos.length - 1; i++) {
    const curr = sortedQNos[i];
    const next = sortedQNos[i + 1];
    if (next - curr > 1 && next - curr <= 3) {
      for (let g = curr + 1; g < next; g++) {
        issues.push({
          severity: 'warning',
          qNo: g,
          pageIndex,
          type: 'sequence_gap',
          message: `Question sequence skipped: Q${g} is missing between Q${curr} and Q${next} on page ${pageIndex}.`,
          suggestedFix: `Targeted rescan specifically for Q${g} on page ${pageIndex}.`,
        });
      }
    }
  }

  // Calculate QA Quality Score (0 to 100)
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  let score = 100 - criticalCount * 25 - warningCount * 10 - infoCount * 3;
  score = Math.max(0, Math.min(100, score));

  const report: PageValidationReport = {
    pageIndex,
    totalDetections: detections.length,
    isValid: criticalCount === 0,
    score,
    criticalCount,
    warningCount,
    issues,
  };

  if (criticalCount > 0 || warningCount > 0) {
    report.autoCorrectPrompt = generateAutoCorrectionPrompt(report, pageIndex);
  }

  return report;
}

/**
 * Generates an optimized, targeted Gemini prompt to repair any identified detection defects.
 */
export function generateAutoCorrectionPrompt(report: PageValidationReport, pageIndex: number): string {
  const missingQNos = report.issues
    .filter((i) => i.type === 'sequence_gap')
    .map((i) => `Q${i.qNo}`);

  const microBoxQNos = report.issues
    .filter((i) => i.type === 'micro_box')
    .map((i) => `Q${i.qNo}`);

  const overlapQNos = report.issues
    .filter((i) => i.type === 'overlapping_boxes')
    .map((i) => `Q${i.qNo}`);

  const lines: string[] = [
    `PASS 2 QA AUTO-CORRECTION PROMPT FOR PAGE ${pageIndex}:`,
    `Initial QA Score: ${report.score}/100. Target defects to rectify:`,
  ];

  if (missingQNos.length > 0) {
    lines.push(`- MISSING QUESTIONS TO LOCATE: Specifically search for skipped questions: [${missingQNos.join(', ')}].`);
  }
  if (microBoxQNos.length > 0) {
    lines.push(`- BOUNDARY EXTENSION: Questions [${microBoxQNos.join(', ')}] were truncated prematurely. Enclose full diagrams, math expressions, and options (A-D).`);
  }
  if (overlapQNos.length > 0) {
    lines.push(`- OVERLAP RESOLUTION: Clarify separation for questions [${overlapQNos.join(', ')}].`);
  }

  lines.push('Output complete normalized bounding boxes [ymin, xmin, ymax, xmax] between 0.0 and 1.0 with verified question metadata.');
  return lines.join('\n');
}

/**
 * Automatically fixes common geometry and metadata defects in detected bounding boxes.
 */
export function sanitizeAndAutoFixDetections(
  detections: QuestionDetection[],
  pageIndex: number
): QuestionDetection[] {
  if (!detections || detections.length === 0) return [];

  return detections.map((q, idx) => {
    const qCopy = { ...q, pageIndex: q.pageIndex || pageIndex };

    if (!qCopy.box || !Array.isArray(qCopy.box) || qCopy.box.length !== 4) {
      return qCopy;
    }

    let [ymin, xmin, ymax, xmax] = qCopy.box;

    // Fix inverted coordinates
    if (ymin > ymax) {
      const tmp = ymin;
      ymin = ymax;
      ymax = tmp;
    }
    if (xmin > xmax) {
      const tmp = xmin;
      xmin = xmax;
      xmax = tmp;
    }

    // Clamp to page boundaries
    ymin = Math.max(0.01, Math.min(0.98, ymin));
    xmin = Math.max(0.01, Math.min(0.98, xmin));
    ymax = Math.max(ymin + 0.02, Math.min(0.99, ymax));
    xmax = Math.max(xmin + 0.05, Math.min(0.99, xmax));

    // Ensure minimum height (prevent micro-box)
    if (ymax - ymin < 0.04) {
      ymax = Math.min(0.99, ymin + 0.08);
    }

    qCopy.box = [ymin, xmin, ymax, xmax];
    return qCopy;
  });
}
