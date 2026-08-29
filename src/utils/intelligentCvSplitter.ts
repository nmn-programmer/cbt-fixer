/**
 * Intelligent Computer Vision Layout, Gutter & Span Analyzer
 * 
 * Provides deterministic CV pre-processing and post-processing:
 * 1. Multi-Column Gutter Detection with Full-Width Diagram Span Protection.
 * 2. Luminance-Safe High-Pass Whitening (preserving faint graph gridlines, circuit dashed strokes).
 * 3. Automatic Comprehension / Passage Context Inheritance for linked questions (JEE / NEET).
 */

export interface SpanningBand {
  ymin: number; // 0.0 to 1.0
  ymax: number; // 0.0 to 1.0
  reason: 'diagram_span' | 'table_span' | 'header_span';
}

export interface PageLayoutAnalysis {
  isTwoColumn: boolean;
  gutterX: number; // Normalized center x (e.g. 0.50)
  gutterWidth: number; // Normalized width (e.g. 0.03)
  spanningBands: SpanningBand[];
  contentDensity: number;
}

/**
 * Deterministic Computer Vision scan of a page canvas to detect 2-column gutters
 * and identify full-width spanning diagrams that cross the central gutter.
 */
export function analyzePageLayoutAndSpans(canvas: HTMLCanvasElement): PageLayoutAnalysis {
  const width = canvas.width;
  const height = canvas.height;
  const defaultAnalysis: PageLayoutAnalysis = {
    isTwoColumn: false,
    gutterX: 0.5,
    gutterWidth: 0.03,
    spanningBands: [],
    contentDensity: 0.5,
  };

  if (!width || !height) return defaultAnalysis;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultAnalysis;

  try {
    // 1. Analyze Vertical Gutter Strip (47% to 53% width)
    const gutterLeftPx = Math.floor(width * 0.47);
    const gutterWidthPx = Math.max(10, Math.floor(width * 0.06));
    const gutterImgData = ctx.getImageData(gutterLeftPx, 0, gutterWidthPx, height);
    const data = gutterImgData.data;

    const numRows = 40; // Split into 40 horizontal vertical-slices of 2.5% height each
    const rowHeight = Math.floor(height / numRows);
    const rowDarkCounts = new Array(numRows).fill(0);
    const rowTotalPixels = rowHeight * gutterWidthPx;

    for (let y = 0; y < height; y++) {
      const rowIndex = Math.min(numRows - 1, Math.floor(y / rowHeight));
      for (let x = 0; x < gutterWidthPx; x++) {
        const idx = (y * gutterWidthPx + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance < 190) {
          rowDarkCounts[rowIndex]++;
        }
      }
    }

    // Determine if gutter is predominantly clean white or has thin vertical line
    let totalDarkInGutter = 0;
    let whiteGutterRows = 0;
    const spanningBands: SpanningBand[] = [];

    rowDarkCounts.forEach((count, rIdx) => {
      const ratio = count / Math.max(1, rowTotalPixels);
      totalDarkInGutter += count;
      const ymin = rIdx / numRows;
      const ymax = (rIdx + 1) / numRows;

      if (ratio < 0.06) {
        whiteGutterRows++;
      } else if (ratio > 0.12) {
        // Significant dark pixels crossing through the center gutter -> Diagram or Table Span!
        spanningBands.push({
          ymin: Math.max(0, ymin - 0.01),
          ymax: Math.min(1.0, ymax + 0.01),
          reason: ymin < 0.15 ? 'header_span' : 'diagram_span',
        });
      }
    });

    // Merge adjacent spanning bands
    const mergedSpans: SpanningBand[] = [];
    spanningBands.forEach((span) => {
      if (mergedSpans.length === 0) {
        mergedSpans.push({ ...span });
      } else {
        const last = mergedSpans[mergedSpans.length - 1];
        if (span.ymin <= last.ymax + 0.03) {
          last.ymax = Math.max(last.ymax, span.ymax);
        } else {
          mergedSpans.push({ ...span });
        }
      }
    });

    const isTwoColumn = whiteGutterRows >= numRows * 0.55;

    return {
      isTwoColumn,
      gutterX: 0.5,
      gutterWidth: 0.03,
      spanningBands: mergedSpans,
      contentDensity: totalDarkInGutter / (height * gutterWidthPx),
    };
  } catch (e) {
    console.warn('[CV Layout Analyzer] Error during canvas layout scan:', e);
    return defaultAnalysis;
  }
}

/**
 * High-Pass Luminance-Preserving Background Whitening
 * Cleans scanner yellowish/gray backgrounds (RGB > 235) while strictly protecting:
 * - Faint coordinate axes and graph gridlines (RGB 160–235)
 * - Dashed lines in circuit schematics
 * - Subscript letters, exponents, and small math roots
 * - Deepens dark ink (RGB < 140) by 15% for crisp contrast
 */
export function applyLuminancePreservingWhitening(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const avg = (r + g + b) / 3;

      if (avg > 232) {
        // Snap near-white scanner paper to absolute #FFFFFF
        const factor = Math.min(1, (avg - 232) / 23);
        data[i] = Math.round(r + (255 - r) * factor);
        data[i + 1] = Math.round(g + (255 - g) * factor);
        data[i + 2] = Math.round(b + (255 - b) * factor);
      } else if (avg > 160 && avg <= 232) {
        // High-precision transition zone: Preserve graph coordinate gridlines and dashed lines!
        // Only apply a mild 5% lightening to keep gridlines legible
        const mildFactor = 0.05 * ((avg - 160) / 72);
        data[i] = Math.min(255, Math.round(r + (255 - r) * mildFactor));
        data[i + 1] = Math.min(255, Math.round(g + (255 - g) * mildFactor));
        data[i + 2] = Math.min(255, Math.round(b + (255 - b) * mildFactor));
      } else if (avg < 135) {
        // Boost dark ink contrast for razor-sharp typography in CBT player
        const boost = 0.85;
        data[i] = Math.round(r * boost);
        data[i + 1] = Math.round(g * boost);
        data[i + 2] = Math.round(b * boost);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.warn('[Luminance Whitening] Whitening notice:', err);
  }
}

/**
 * Intelligent Column & Span-Aware Bounding Box Cropper (4-Line Grid Protocol)
 * Crops a high-resolution canvas with asymmetric padding, strict column snapping, and tone whitening.
 */
export function cropBoxWithSpanAwareness(
  canvas: HTMLCanvasElement,
  boxCoords: [number, number, number, number],
  spanningBands: SpanningBand[] = [],
  isTwoColumn: boolean = true
): {
  blob: Blob;
  blobUrl: string;
  cropCanvas: HTMLCanvasElement;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
} | null {
  if (!canvas || !boxCoords || boxCoords.length < 4) return null;

  let [ymin, xmin, ymax, xmax] = boxCoords;
  ymin = Math.max(0, Math.min(0.98, Number(ymin) || 0));
  xmin = Math.max(0, Math.min(0.98, Number(xmin) || 0));
  ymax = Math.max(ymin + 0.02, Math.min(1, Number(ymax) || 1));
  xmax = Math.max(xmin + 0.04, Math.min(1, Number(xmax) || 1));

  // Robust column classification in 2-column papers using 4-Line Grid Strategy
  const xCenter = (xmin + xmax) / 2;
  const isGenuinelyFullWidth = !isTwoColumn || (xmin < 0.10 && xmax > 0.88);

  let isLeftCol = false;
  let isRightCol = false;

  if (isGenuinelyFullWidth) {
    xmin = Math.min(xmin, 0.035);
    xmax = Math.max(xmax, 0.965);
  } else if (xCenter < 0.50 || (xmin < 0.45 && xmax < 0.60)) {
    // 4-Line Grid: Definite Left Column Question (Lines: x=0.035 and x=0.490)
    isLeftCol = true;
    xmin = Math.min(xmin, 0.035);
    xmax = Math.min(Math.max(xmax, 0.46), 0.490);
  } else {
    // 4-Line Grid: Definite Right Column Question (Lines: x=0.508 and x=0.965)
    isRightCol = true;
    xmin = Math.max(Math.min(xmin, 0.53), 0.508);
    xmax = Math.max(xmax, 0.965);
  }

  const pxYmin = Math.floor(ymin * canvas.height);
  const pxXmin = Math.floor(xmin * canvas.width);
  const pxHeight = Math.ceil((ymax - ymin) * canvas.height);
  const pxWidth = Math.ceil((xmax - xmin) * canvas.width);

  // Asymmetric padding: Top 8px, Bottom 14px, Left 12px, Right 12px
  const padT = 8;
  const padB = 14;
  const padL = 12;
  const padR = 12;

  let cropY = Math.max(0, pxYmin - padT);
  let cropX = Math.max(0, pxXmin - padL);
  let cropW = Math.min(canvas.width - cropX, Math.max(30, pxWidth + padL + padR));
  let cropH = Math.min(canvas.height - cropY, Math.max(30, pxHeight + padT + padB));

  // Protect vertical divider line boundary if in left or right column
  if (isLeftCol) {
    const maxRightPx = Math.floor(canvas.width * 0.492);
    if (cropX + cropW > maxRightPx) {
      cropW = Math.max(30, maxRightPx - cropX);
    }
  } else if (isRightCol) {
    const minLeftPx = Math.floor(canvas.width * 0.508);
    if (cropX < minLeftPx) {
      const diff = minLeftPx - cropX;
      cropX = minLeftPx;
      cropW = Math.max(30, cropW - diff);
    }
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cropCtx) return null;

  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = 'high';
  cropCtx.fillStyle = '#ffffff';
  cropCtx.fillRect(0, 0, cropW, cropH);
  cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Apply luminance-preserving whitening
  applyLuminancePreservingWhitening(cropCtx, cropW, cropH);

  const dataUrl = cropCanvas.toDataURL('image/png');
  const byteString = atob(dataUrl.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: 'image/png' });
  const blobUrl = URL.createObjectURL(blob);

  return { blob, blobUrl, cropCanvas, cropX, cropY, cropW, cropH };
}

/**
 * Document-Level Layout Consensus Evaluator
 * Computes whether the entire test paper is predominantly 2-column.
 * Prevents sparse ending pages (e.g., Q71-Q75) from overriding global column bounds.
 */
export function determineDocumentLayoutConsensus(pageLayouts: PageLayoutAnalysis[]): boolean {
  if (!pageLayouts || pageLayouts.length === 0) return true;
  let twoColPagesCount = 0;
  pageLayouts.forEach((layout) => {
    if (layout.isTwoColumn) twoColPagesCount++;
  });
  // If at least 30% of pages are 2-column, the document is considered 2-column paper
  return (twoColPagesCount / pageLayouts.length) >= 0.30;
}

/**
 * 4-Line Grid Layout Rectifier
 * Uses 4 imaginary grid lines (Left Column: x=0.035, x=0.490; Right Column: x=0.508, x=0.965)
 * and horizontal question boundary lines (ymin of next question = ymax of current question)
 * to guarantee that Question 1 on left column never includes Question 2 below it or Questions on the right column.
 */
export function rectifyQuestionBoundingBoxes(
  questions: any[],
  isTwoColumn: boolean = true
): any[] {
  if (!questions || questions.length === 0) return [];

  // Group questions by page index
  const pageMap = new Map<number, any[]>();
  questions.forEach((q) => {
    const pIdx = Number(q.pageIndex) || 0;
    const list = pageMap.get(pIdx) || [];
    list.push(q);
    pageMap.set(pIdx, list);
  });

  const rectifiedAll: any[] = [];

  pageMap.forEach((pageQuestions, pIdx) => {
    if (!isTwoColumn) {
      // Single-column: sort vertically and clamp ymax to next question's ymin
      // DO NOT force xmin/xmax to full width if the box is explicitly left or right column!
      const sorted = [...pageQuestions].sort((a, b) => (a.box?.[0] || 0) - (b.box?.[0] || 0));
      sorted.forEach((q, idx) => {
        const qCopy = { ...q, box: [...(q.box || [0, 0, 1, 1])] };
        const xmin = qCopy.box[1];
        const xmax = qCopy.box[3];
        const xCenter = (xmin + xmax) / 2;

        if (xmin < 0.10 && xmax > 0.85) {
          qCopy.box[1] = 0.035;
          qCopy.box[3] = 0.965;
        } else if (xCenter < 0.50 || (xmin < 0.45 && xmax < 0.58)) {
          qCopy.box[1] = 0.035;
          qCopy.box[3] = Math.min(xmax, 0.490);
        } else {
          qCopy.box[1] = Math.max(xmin, 0.508);
          qCopy.box[3] = 0.965;
        }

        if (idx < sorted.length - 1) {
          const nextYmin = sorted[idx + 1].box?.[0] || 1;
          qCopy.box[2] = Math.min(qCopy.box[2], Math.max(qCopy.box[0] + 0.03, nextYmin - 0.005));
        }
        rectifiedAll.push(qCopy);
      });
      return;
    }

    // 2-Column 4-Line Grid Rectification
    const leftCol: any[] = [];
    const rightCol: any[] = [];
    const fullWidth: any[] = [];

    pageQuestions.forEach((q) => {
      const box = q.box || [0, 0, 1, 1];
      const xCenter = (box[1] + box[3]) / 2;
      const isFull = box[1] < 0.10 && box[3] > 0.88;

      if (isFull) {
        fullWidth.push(q);
      } else if (xCenter < 0.50 || (box[1] < 0.45 && box[3] < 0.60)) {
        leftCol.push(q);
      } else {
        rightCol.push(q);
      }
    });

    // Sort column questions strictly by vertical ymin
    leftCol.sort((a, b) => (a.box?.[0] || 0) - (b.box?.[0] || 0));
    rightCol.sort((a, b) => (a.box?.[0] || 0) - (b.box?.[0] || 0));

    // Rectify Left Column (Vertical lines: xmin=0.035, xmax=0.490)
    leftCol.forEach((q, idx) => {
      const qCopy = { ...q, box: [...(q.box || [0, 0, 1, 1])] };
      qCopy.box[1] = 0.035; // 4-line grid left line
      qCopy.box[3] = 0.490; // 4-line grid center divider left

      // Horizontal line snapping: ymax cannot extend into next question in left column
      if (idx < leftCol.length - 1) {
        const nextYmin = leftCol[idx + 1].box?.[0] || 1;
        qCopy.box[2] = Math.min(qCopy.box[2], Math.max(qCopy.box[0] + 0.03, nextYmin - 0.005));
      } else if (qCopy.isSplit) {
        // Last question in column before split wrap
        qCopy.box[2] = Math.min(0.96, Math.max(qCopy.box[2], 0.92));
      }

      // If splitParts exist, snap their boxes to their respective columns
      if (qCopy.splitParts && Array.isArray(qCopy.splitParts)) {
        qCopy.splitParts = qCopy.splitParts.map((sp: any, spIdx: number) => {
          const spBox = [...(sp.box || [0, 0, 1, 1])];
          const spCenter = (spBox[1] + spBox[3]) / 2;
          if (spCenter < 0.50 || spIdx === 0) {
            spBox[1] = 0.035;
            spBox[3] = 0.490;
          } else {
            spBox[1] = 0.508;
            spBox[3] = 0.965;
            // If there are questions in right column following Part 2, cap Part 2's ymax
            if (rightCol.length > 0) {
              const firstRightQYmin = rightCol[0].box?.[0] || 1;
              spBox[2] = Math.min(spBox[2], Math.max(spBox[0] + 0.03, firstRightQYmin - 0.005));
            }
          }
          return { ...sp, box: spBox };
        });
      }

      rectifiedAll.push(qCopy);
    });

    // Rectify Right Column (Vertical lines: xmin=0.508, xmax=0.965)
    rightCol.forEach((q, idx) => {
      const qCopy = { ...q, box: [...(q.box || [0, 0, 1, 1])] };
      qCopy.box[1] = 0.508; // 4-line grid center divider right
      qCopy.box[3] = 0.965; // 4-line grid right line

      // Horizontal line snapping: ymax cannot extend into next question in right column
      if (idx < rightCol.length - 1) {
        const nextYmin = rightCol[idx + 1].box?.[0] || 1;
        qCopy.box[2] = Math.min(qCopy.box[2], Math.max(qCopy.box[0] + 0.03, nextYmin - 0.005));
      }

      // If splitParts exist in right column
      if (qCopy.splitParts && Array.isArray(qCopy.splitParts)) {
        qCopy.splitParts = qCopy.splitParts.map((sp: any) => {
          const spBox = [...(sp.box || [0, 0, 1, 1])];
          spBox[1] = 0.508;
          spBox[3] = 0.965;
          return { ...sp, box: spBox };
        });
      }

      rectifiedAll.push(qCopy);
    });

    // Full width questions
    fullWidth.forEach((q) => {
      const qCopy = { ...q, box: [...(q.box || [0, 0, 1, 1])] };
      qCopy.box[1] = 0.035;
      qCopy.box[3] = 0.965;
      rectifiedAll.push(qCopy);
    });
  });

  return rectifiedAll;
}

/**
 * Comprehension Passage & Linked Stem Inheritor
 * 
 * Inspects questions for linked passage references (e.g. "Paragraph for Questions 23 to 25",
 * "Read the passage and answer Q.14-Q.16").
 * Ensures that if a shared passage stem exists, it is inherited by all linked questions
 * so aspirants always see the context passage on every related question card.
 */
export interface PassageGroup {
  fromQNo: number;
  toQNo: number;
  stemPageIndex: number;
  stemBox: [number, number, number, number];
  passageTitle?: string;
}

export function detectAndInheritPassageStems(
  questions: any[]
): { questions: any[]; detectedPassagesCount: number } {
  if (!questions || questions.length === 0) {
    return { questions, detectedPassagesCount: 0 };
  }

  const passageGroups: PassageGroup[] = [];

  // Identify questions with passage/paragraph headers
  questions.forEach((q) => {
    if (!q) return;
    const textContext = (q.passageContext || q.subject || q.type || '').toLowerCase();
    
    // Check if question itself contains linked passage indicator
    const match = textContext.match(/(?:passage|paragraph|questions?|q\.?)\s*(?:for\s+)?(\d+)\s*(?:to|-|–)\s*(\d+)/i);
    if (match && match[1] && match[2]) {
      const fromQNo = parseInt(match[1], 10);
      const toQNo = parseInt(match[2], 10);
      if (fromQNo > 0 && toQNo >= fromQNo && toQNo - fromQNo <= 10) {
        passageGroups.push({
          fromQNo,
          toQNo,
          stemPageIndex: q.pageIndex ?? 0,
          stemBox: q.box,
          passageTitle: `Passage for Q.${fromQNo} to Q.${toQNo}`,
        });
      }
    }
  });

  if (passageGroups.length === 0) {
    return { questions, detectedPassagesCount: 0 };
  }

  // Attach passage stem to all child questions within the range
  const updatedQuestions = questions.map((q) => {
    const qNo = q.qNo || 0;
    const matchingPassage = passageGroups.find((p) => qNo >= p.fromQNo && qNo <= p.toQNo);

    if (matchingPassage && qNo !== matchingPassage.fromQNo) {
      // Inherit passage stem as Part 1 if not already present
      const qCopy = { ...q };
      if (!qCopy.splitParts || qCopy.splitParts.length === 0) {
        qCopy.isSplit = true;
        qCopy.splitParts = [
          {
            pageIndex: matchingPassage.stemPageIndex,
            box: matchingPassage.stemBox,
            partLabel: matchingPassage.passageTitle || 'Context Passage',
            partIndex: 1,
          },
          {
            pageIndex: q.pageIndex,
            box: q.box,
            partLabel: `Question ${qNo}`,
            partIndex: 2,
          },
        ];
      }
      return qCopy;
    }
    return q;
  });

  return {
    questions: updatedQuestions,
    detectedPassagesCount: passageGroups.length,
  };
}
