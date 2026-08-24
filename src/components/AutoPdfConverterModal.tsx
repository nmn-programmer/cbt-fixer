import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { fetchWithGeminiFallback } from '../utils/geminiKeyManager';
import { BlueprintSectionRange, QuestionType } from '../types/cbt';
import {
  FileText,
  UploadCloud,
  X,
  Wand2,
  CheckCircle2,
  Loader2,
  Sparkles,
  Settings,
  Check,
  BookOpen,
  Layers,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Sliders,
  ChevronRight,
  HelpCircle,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import { generateId } from '../utils/constants';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface QuestionDetection {
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

const DEFAULT_PRESET_RANGES: BlueprintSectionRange[] = [
  {
    id: generateId(),
    subjectName: 'Physics',
    sectionName: 'Physics - Section 1',
    fromQNo: 1,
    toQNo: 8,
    type: 'mcq',
    marks: { cm: 4, im: -1, pm: 0, max: 4 },
  },
  {
    id: generateId(),
    subjectName: 'Chemistry',
    sectionName: 'Chemistry - Section 1',
    fromQNo: 9,
    toQNo: 16,
    type: 'mcq',
    marks: { cm: 4, im: -1, pm: 0, max: 4 },
  },
  {
    id: generateId(),
    subjectName: 'Mathematics',
    sectionName: 'Mathematics - Section 1',
    fromQNo: 17,
    toQNo: 24,
    type: 'mcq',
    marks: { cm: 4, im: -1, pm: 0, max: 4 },
  },
];

const PRESETS = [
  {
    id: '3sub_24q',
    name: '3-Subjects (24 Qs)',
    desc: 'Physics (1–8), Chemistry (9–16), Maths (17–24) • 8 Qs Each',
    ranges: DEFAULT_PRESET_RANGES,
  },
  {
    id: 'jee_main',
    name: 'JEE Main (75 Qs)',
    desc: 'Physics (1–25), Chemistry (26–50), Maths (51–75)',
    ranges: [
      { id: generateId(), subjectName: 'Physics', sectionName: 'Physics (MCQ)', fromQNo: 1, toQNo: 20, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Physics', sectionName: 'Physics (NAT)', fromQNo: 21, toQNo: 25, type: 'nat' as QuestionType, marks: { cm: 4, im: 0, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Chemistry', sectionName: 'Chemistry (MCQ)', fromQNo: 26, toQNo: 45, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Chemistry', sectionName: 'Chemistry (NAT)', fromQNo: 46, toQNo: 50, type: 'nat' as QuestionType, marks: { cm: 4, im: 0, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Mathematics', sectionName: 'Mathematics (MCQ)', fromQNo: 51, toQNo: 70, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Mathematics', sectionName: 'Mathematics (NAT)', fromQNo: 71, toQNo: 75, type: 'nat' as QuestionType, marks: { cm: 4, im: 0, pm: 0, max: 4 } },
    ],
  },
  {
    id: 'neet',
    name: 'NEET (180 Qs)',
    desc: 'Physics (1–45), Chemistry (46–90), Botany (91–135), Zoology (136–180)',
    ranges: [
      { id: generateId(), subjectName: 'Physics', sectionName: 'Physics', fromQNo: 1, toQNo: 45, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Chemistry', sectionName: 'Chemistry', fromQNo: 46, toQNo: 90, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Botany', sectionName: 'Botany', fromQNo: 91, toQNo: 135, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
      { id: generateId(), subjectName: 'Zoology', sectionName: 'Zoology', fromQNo: 136, toQNo: 180, type: 'mcq' as QuestionType, marks: { cm: 4, im: -1, pm: 0, max: 4 } },
    ],
  },
];

export const AutoPdfConverterModal: React.FC = () => {
  const {
    isPdfConverterModalOpen,
    setPdfConverterModalOpen,
    addArchive,
    geminiApiKey,
    addToast,
    refreshUsageMetrics,
    startBackgroundTask,
    updateBackgroundTask,
    minimizeBackgroundTask,
    completeBackgroundTask,
    enableDoublePassRescan,
    setEnableDoublePassRescan,
  } = useCbtStore();

  const [step, setStep] = useState<'upload' | 'pages' | 'blueprint' | 'processing'>('upload');
  const [file, setFile] = useState<File | null>(null);

  // Page selection & thumbnails
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [thumbnails, setThumbnails] = useState<{ url: string; index: number }[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [hasAnswerKey, setHasAnswerKey] = useState(true);
  const [extractEnglishOnly, setExtractEnglishOnly] = useState(false);
  const [handleSplitQuestions, setHandleSplitQuestions] = useState(true);

  // Blueprint & Range Controls
  const [blueprintRanges, setBlueprintRanges] = useState<BlueprintSectionRange[]>(DEFAULT_PRESET_RANGES);
  const [testTitle, setTestTitle] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [totalMarks, setTotalMarks] = useState<number>(96);
  const [isScanningInstructions, setIsScanningInstructions] = useState(false);
  const [instructionsScanStatus, setInstructionsScanStatus] = useState('');
  const [instructionMarkingSummary, setInstructionMarkingSummary] = useState<string>('');
  const [hasInstructedMarkingScheme, setHasInstructedMarkingScheme] = useState<boolean>(false);
  const [defaultMarkingScheme, setDefaultMarkingScheme] = useState<{ cm: number; im: number; pm?: number; max?: number }>({ cm: 4, im: -1, pm: 0, max: 4 });

  // Processing state
  const [status, setStatus] = useState<string>('');
  const [percent, setPercent] = useState<number>(0);
  const [progressDetail, setProgressDetail] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [activeBatchInfo, setActiveBatchInfo] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: any;
    if (isProcessing) {
      setElapsedSec(0);
      timer = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isProcessing]);

  if (!isPdfConverterModalOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setTestTitle(selected.name.replace(/\.pdf$/i, ''));
      setError('');
      setPercent(0);
      setStatus('');
      setProgressDetail('');
      setStep('pages');
      setIsLoadingThumbnails(true);

      try {
        const arrayBuffer = await selected.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            pdfWorkerUrl ||
            `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdfDoc.numPages;

        const generatedThumbnails = [];
        const initialSelected = new Set<number>();

        for (let i = 1; i <= numPages; i++) {
          initialSelected.add(i);
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 0.25 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport } as any).promise;
            generatedThumbnails.push({
              url: canvas.toDataURL('image/jpeg', 0.6),
              index: i,
            });
          }
        }
        setThumbnails(generatedThumbnails);
        setSelectedPages(initialSelected);
      } catch (err: any) {
        console.error('Thumbnail generation error', err);
        setError('Failed to load PDF preview: ' + err.message);
      } finally {
        setIsLoadingThumbnails(false);
      }
    }
  };

  const handleAddRange = () => {
    const lastRange = blueprintRanges[blueprintRanges.length - 1];
    const nextStart = lastRange ? lastRange.toQNo + 1 : 1;
    const newRange: BlueprintSectionRange = {
      id: generateId(),
      subjectName: lastRange?.subjectName || 'Physics',
      sectionName: `Section ${blueprintRanges.length + 1}`,
      fromQNo: nextStart,
      toQNo: nextStart + 7,
      type: 'mcq',
      marks: { cm: 4, im: -1, pm: 0, max: 4 },
    };
    setBlueprintRanges([...blueprintRanges, newRange]);
  };

  const handleUpdateRange = (id: string, updates: Partial<BlueprintSectionRange>) => {
    setBlueprintRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleDeleteRange = (id: string) => {
    setBlueprintRanges((prev) => prev.filter((r) => r.id !== id));
  };

  // AI Scan Instructions Page from the uploaded PDF (typically Page 1)
  const handleScanInstructionsFromPdf = async () => {
    if (!file) return;
    try {
      setIsScanningInstructions(true);
      setInstructionsScanStatus('Rendering instruction page...');

      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          pdfWorkerUrl ||
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      }
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context error');

      await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
      const base64Image = canvas.toDataURL('image/jpeg', 0.9);

      setInstructionsScanStatus('Analyzing General Instructions & question ranges with Gemini Vision...');

      const res = await fetchWithGeminiFallback(
        '/api/extract-test-blueprint',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.testTitle) setTestTitle(data.testTitle);
      if (data.durationMinutes) setDurationMinutes(data.durationMinutes);
      if (data.totalMarks) setTotalMarks(data.totalMarks);
      if (data.markingSchemeSummary) setInstructionMarkingSummary(data.markingSchemeSummary);
      if (data.hasInstructedMarkingScheme) setHasInstructedMarkingScheme(true);
      if (data.defaultMarkingScheme) {
        setDefaultMarkingScheme({
          cm: Number(data.defaultMarkingScheme.cm) || 4,
          im: Number(data.defaultMarkingScheme.im) || -1,
          pm: Number(data.defaultMarkingScheme.pm) || 0,
          max: Number(data.defaultMarkingScheme.max) || 4,
        });
      }

      if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
        const newRanges: BlueprintSectionRange[] = data.sections.map((s: any) => ({
          id: generateId(),
          subjectName: s.subjectName || 'General',
          sectionName: s.sectionName || `${s.subjectName} Section`,
          fromQNo: Number(s.fromQNo) || 1,
          toQNo: Number(s.toQNo) || Number(s.fromQNo) || 1,
          type: (s.type || 'mcq').toLowerCase() as QuestionType,
          marks: {
            cm: Number(s.marks?.cm) || 4,
            im: Number(s.marks?.im) || -1,
            pm: Number(s.marks?.pm) || 0,
            max: Number(s.marks?.max) || 4,
          },
        }));

        setBlueprintRanges(newRanges.sort((a, b) => a.fromQNo - b.fromQNo));
      }
    } catch (err: any) {
      console.error('Scan instructions error:', err);
      alert(`AI Extraction: ${err.message}`);
    } finally {
      setIsScanningInstructions(false);
      setInstructionsScanStatus('');
    }
  };

  // Main Conversion Process using the User Blueprint
  const processPDF = async () => {
    if (!file) return;
    setStep('processing');
    setIsProcessing(true);
    setError('');
    setPercent(2);

    try {
      setStatus('Reading PDF file buffer...');
      setProgressDetail('Loading document buffer into memory...');
      const arrayBuffer = await file.arrayBuffer();

      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          pdfWorkerUrl ||
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      }

      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;
      if (numPages === 0) throw new Error('PDF has no readable pages');

      const base64Images: string[] = [];
      const canvasImages: HTMLCanvasElement[] = [];

      const pagesToProcess: number[] = Array.from<number>(selectedPages).sort((a, b) => a - b);
      if (pagesToProcess.length === 0) throw new Error('No pages selected for processing');

      setStatus(`Rendering ${pagesToProcess.length} selected pages at ultra-crisp resolution...`);
      setPercent(5);

      startBackgroundTask({
        id: 'pdf_converter',
        title: `Converting: ${testTitle || file.name}`,
        statusText: `Rendering ${pagesToProcess.length} pages...`,
        percent: 5,
        modalType: 'pdf_converter',
      });

      for (let i = 0; i < pagesToProcess.length; i++) {
        const pageNum = pagesToProcess[i];
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Crisp 2.0x scale

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context null');

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport } as any).promise;

        const base64ForAi = canvas.toDataURL('image/jpeg', 0.85);
        base64Images.push(base64ForAi);
        canvasImages.push(canvas);

        const pagePercent = Math.min(35, Math.round(5 + ((i + 1) / pagesToProcess.length) * 30));
        setPercent(pagePercent);
        setProgressDetail(`Rendered page ${pageNum} (${i + 1}/${pagesToProcess.length})`);
        updateBackgroundTask({
          percent: pagePercent,
          statusText: `Rendering page ${pageNum} (${i + 1}/${pagesToProcess.length})...`,
        });
      }

      // Chunk pages into 2-page batches for fast, reliable extraction
      const BATCH_SIZE = 2;
      const totalBatches = Math.ceil(pagesToProcess.length / BATCH_SIZE);
      const allExtractedQuestions: QuestionDetection[] = [];
      const allAnswerKeys: any[] = [];

      const passStatusMsg = enableDoublePassRescan
        ? 'AI Multimodal Vision double-pass rescan reading questions in sequence...'
        : 'AI Multimodal Vision reading questions in sequence...';
      setStatus(passStatusMsg);
      setPercent(36);
      updateBackgroundTask({ percent: 36, statusText: passStatusMsg });

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const startPage = batchIdx * BATCH_SIZE;
        const endPage = Math.min(pagesToProcess.length, startPage + BATCH_SIZE);
        const chunkImages = base64Images.slice(startPage, endPage);

        const batchStartPercent = Math.round(36 + (batchIdx / totalBatches) * 39);
        const batchEndPercent = Math.round(36 + ((batchIdx + 1) / totalBatches) * 39);

        const realStartPage = pagesToProcess[startPage];
        const realEndPage = pagesToProcess[endPage - 1];

        const batchStatus = `Gemini AI layout analysis & rescan (Pages ${realStartPage}-${realEndPage})...`;
        setActiveBatchInfo(`Batch ${batchIdx + 1}/${totalBatches} (Pages ${realStartPage}-${realEndPage})`);
        setStatus(batchStatus);

        setPercent(batchStartPercent);
        setProgressDetail(`Parsing column layouts & question sequence for Pages ${realStartPage}-${realEndPage}...`);
        updateBackgroundTask({
          percent: batchStartPercent,
          statusText: `Batch ${batchIdx + 1}/${totalBatches}: ${batchStatus}`,
        });

        try {
          const res = await fetchWithGeminiFallback(
            '/api/extract-pdf-structure',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                images: chunkImages,
                pageOffset: startPage,
                options: {
                  hasAnswerKey,
                  extractEnglishOnly,
                  enableDoublePass: enableDoublePassRescan,
                },
              }),
            },
            addToast,
            refreshUsageMetrics
          );

          setPercent(batchEndPercent);

          if (res.ok) {
            const batchResponse = await res.json();
            if (batchResponse.questions && Array.isArray(batchResponse.questions)) {
              allExtractedQuestions.push(...batchResponse.questions);
            }
            if (batchResponse.answerKeys && Array.isArray(batchResponse.answerKeys)) {
              allAnswerKeys.push(...batchResponse.answerKeys);
            }
          }
        } catch (batchErr) {
          console.warn(`Batch ${batchIdx + 1} extraction error:`, batchErr);
        }
      }

      setActiveBatchInfo('');
      setPercent(76);
      setStatus('Resolving question continuations & option completeness...');

      // Pre-pass: Sort and resolve split-question continuations and orphaned option blocks
      allExtractedQuestions.sort((a, b) => (a.qNo || 0) - (b.qNo || 0));

      const resolvedQuestions: QuestionDetection[] = [];
      const orphanMap = new Map<number, QuestionDetection[]>();

      for (let i = 0; i < allExtractedQuestions.length; i++) {
        const item = allExtractedQuestions[i];
        if (!item) continue;

        // If explicitly flagged as orphan continuation or targeted to continue previous question
        if (item.isOrphanContinuation || (item.continuationForQNo && item.continuationForQNo !== item.qNo)) {
          const targetQNo =
            item.continuationForQNo ||
            (resolvedQuestions.length > 0 ? resolvedQuestions[resolvedQuestions.length - 1].qNo : null);
          if (targetQNo) {
            const list = orphanMap.get(targetQNo) || [];
            list.push(item);
            orphanMap.set(targetQNo, list);
            continue; // Do not add as standalone question
          }
        }
        resolvedQuestions.push(item);
      }

      // Merge orphaned parts into target questions
      resolvedQuestions.forEach((q, idx) => {
        const qNo = q.qNo || idx + 1;
        const orphans = orphanMap.get(qNo);
        if (orphans && orphans.length > 0) {
          q.isSplit = true;
          if (!q.splitParts || q.splitParts.length === 0) {
            q.splitParts = [{ pageIndex: q.pageIndex, box: q.box, partIndex: 1 }];
          }
          orphans.forEach((orphan) => {
            q.splitParts!.push({
              pageIndex: orphan.pageIndex,
              box: orphan.box,
              partIndex: q.splitParts!.length + 1,
            });
          });
        }

        // Cross-check: If MCQ question is incomplete (< 3 options found or flagged 'split') and next item is continuation
        if (
          handleSplitQuestions &&
          (q.completeness === 'split' || (q.type === 'mcq' && q.optionsFound && q.optionsFound.length < 3)) &&
          idx + 1 < resolvedQuestions.length
        ) {
          const nextItem = resolvedQuestions[idx + 1];
          // If next item has no distinct Q-number or has continuation flag or starts at top of next column
          if (nextItem && (!nextItem.qNo || nextItem.isOrphanContinuation || nextItem.box[0] < 0.25)) {
            if (!q.splitParts || q.splitParts.length === 0) {
              q.splitParts = [{ pageIndex: q.pageIndex, box: q.box, partIndex: 1 }];
            }
            q.splitParts.push({
              pageIndex: nextItem.pageIndex,
              box: nextItem.box,
              partIndex: q.splitParts.length + 1,
            });
            q.isSplit = true;
            resolvedQuestions.splice(idx + 1, 1);
          }
        }
      });

      setStatus('Cropping questions and allocating strictly via Blueprint Ranges...');

      // Build CBT Archive object with instructed marking scheme
      const newArchive: any = {
        id: generateId(),
        fileName: file.name.replace(/\.pdf$/i, '') + '_CBT_Package.zip',
        title: testTitle || file.name.replace(/\.pdf$/i, ''),
        format: 'pdfCropper',
        rawFiles: new Map(),
        lastModified: Date.now(),
        isDirty: true,
        subjects: [] as any[],
        metadata: {
          testTitle: testTitle || file.name.replace(/\.pdf$/i, ''),
          sourcePdfName: file.name,
          durationMinutes,
          totalMarks,
          markingScheme: {
            correct: defaultMarkingScheme.cm,
            incorrect: defaultMarkingScheme.im,
            partial: defaultMarkingScheme.pm || 0,
            blank: 0,
          },
          hasInstructedMarkingScheme,
          instructionMarkingSummary,
          createdAt: new Date().toISOString(),
        },
      };

      // Store source document PDF directly in rawFiles for seamless visual re-cropping!
      newArchive.rawFiles.set('source_document.pdf', {
        blob: file,
        url: URL.createObjectURL(file),
        size: file.size,
      });

      // Helper function to crop a box on a canvas
      const cropBoxFromCanvas = (pageIndex: number, boxCoords: [number, number, number, number]) => {
        const pIdx = typeof pageIndex === 'number' ? Math.max(0, Math.min(canvasImages.length - 1, pageIndex)) : 0;
        const canvas = canvasImages[pIdx] || canvasImages[0];
        if (!canvas) return null;

        let [ymin, xmin, ymax, xmax] = boxCoords;
        ymin = Math.max(0, Math.min(0.98, Number(ymin) || 0));
        xmin = Math.max(0, Math.min(0.98, Number(xmin) || 0));
        ymax = Math.max(ymin + 0.02, Math.min(1, Number(ymax) || 1));
        xmax = Math.max(xmin + 0.05, Math.min(1, Number(xmax) || 1));

        const pxYmin = Math.floor(ymin * canvas.height);
        const pxXmin = Math.floor(xmin * canvas.width);
        const pxHeight = Math.ceil((ymax - ymin) * canvas.height);
        const pxWidth = Math.ceil((xmax - xmin) * canvas.width);

        const pad = 8;
        const cropY = Math.max(0, pxYmin - pad);
        const cropX = Math.max(0, pxXmin - pad);
        const cropW = Math.min(canvas.width - cropX, Math.max(20, pxWidth + pad * 2));
        const cropH = Math.min(canvas.height - cropY, Math.max(20, pxHeight + pad * 2));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.fillStyle = '#ffffff';
          cropCtx.fillRect(0, 0, cropW, cropH);
          cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        }

        const dataUrl = cropCanvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/png' });
        const blobUrl = URL.createObjectURL(blob);

        return { blob, blobUrl, cropCanvas, cropX, cropY, cropW, cropH, pIdx };
      };

      // Helper to vertically stitch multi-part crops into one unified composite image
      const createStitchedComposite = (cropList: { cropCanvas: HTMLCanvasElement }[]) => {
        if (cropList.length === 0) return null;
        if (cropList.length === 1) {
          const c = cropList[0].cropCanvas;
          const dataUrl = c.toDataURL('image/png');
          const byteString = atob(dataUrl.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: 'image/png' });
          return { blob, blobUrl: URL.createObjectURL(blob) };
        }

        const gap = 12;
        const maxWidth = Math.max(...cropList.map((c) => c.cropCanvas.width));
        const totalHeight =
          cropList.reduce((acc, c) => acc + c.cropCanvas.height, 0) + (cropList.length - 1) * gap;

        const stitchedCanvas = document.createElement('canvas');
        stitchedCanvas.width = maxWidth;
        stitchedCanvas.height = totalHeight;
        const sCtx = stitchedCanvas.getContext('2d');
        if (!sCtx) return null;

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, maxWidth, totalHeight);

        let currentY = 0;
        cropList.forEach((c, idx) => {
          sCtx.drawImage(c.cropCanvas, 0, currentY);
          currentY += c.cropCanvas.height;

          if (idx < cropList.length - 1) {
            sCtx.save();
            sCtx.strokeStyle = '#e2e8f0';
            sCtx.lineWidth = 1.5;
            sCtx.setLineDash([4, 4]);
            sCtx.beginPath();
            sCtx.moveTo(16, currentY + gap / 2);
            sCtx.lineTo(maxWidth - 16, currentY + gap / 2);
            sCtx.stroke();
            sCtx.restore();
            currentY += gap;
          }
        });

        const dataUrl = stitchedCanvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: 'image/png' });
        return { blob, blobUrl: URL.createObjectURL(blob) };
      };

      // Group into subjects and sections strictly matching the Blueprint ranges
      const subjectMap = new Map<string, any>();
      const totalQuestions = resolvedQuestions.length;

      for (let qIdx = 0; qIdx < totalQuestions; qIdx++) {
        const q = resolvedQuestions[qIdx];
        if (!q || !q.box || !Array.isArray(q.box) || q.box.length < 4) continue;

        const cropPercent = Math.min(95, Math.round(76 + ((qIdx + 1) / totalQuestions) * 20));
        setPercent(cropPercent);
        setProgressDetail(`Cropping & sequencing question ${qIdx + 1} of ${totalQuestions}`);

        const questionNum = q.qNo || qIdx + 1;
        const qNoStr = String(questionNum);

        // Find Blueprint range match for this question number!
        const matchedRange = blueprintRanges.find(
          (r) => questionNum >= r.fromQNo && questionNum <= r.toQNo
        );

        const subjName = matchedRange?.subjectName || q.subject || 'General';
        const secName = matchedRange?.sectionName || `${subjName} - Section 1`;
        const qType = matchedRange?.type || (q.type ? q.type.toLowerCase() : 'mcq');
        const marks = matchedRange?.marks || { cm: 4, im: -1, pm: 0, max: 4 };

        // Ensure subject exists
        if (!subjectMap.has(subjName)) {
          subjectMap.set(subjName, {
            id: generateId(),
            name: subjName,
            sections: [],
          });
        }
        const subject = subjectMap.get(subjName);

        // Ensure section exists
        let section = subject.sections.find((s: any) => s.name === secName);
        if (!section) {
          section = {
            id: generateId(),
            name: secName,
            type: qType,
            marks: { correct: marks.cm, incorrect: marks.im, blank: 0 },
            questions: [],
          };
          subject.sections.push(section);
        }

        const imageAttachments: any[] = [];
        const pdfDataParts: any[] = [];
        const harvestedCrops: { cropCanvas: HTMLCanvasElement }[] = [];

        // Check if question is split across columns or pages
        if (handleSplitQuestions && q.isSplit && q.splitParts && q.splitParts.length > 0) {
          q.splitParts.forEach((part, partIdx) => {
            const cropResult = cropBoxFromCanvas(part.pageIndex, part.box as any);
            if (cropResult) {
              harvestedCrops.push({ cropCanvas: cropResult.cropCanvas });
              const partNum = partIdx + 1;
              const partImgName = `${subjName}_${qType}_Q${qNoStr}_p${partNum}.png`;
              newArchive.rawFiles.set(partImgName, {
                blob: cropResult.blob,
                url: cropResult.blobUrl,
                size: cropResult.blob.size,
              });

              imageAttachments.push({
                id: generateId(),
                partIndex: partNum,
                fileName: partImgName,
                blobUrl: cropResult.blobUrl,
                rawBlob: cropResult.blob,
              });

              pdfDataParts.push({
                filename: partImgName,
                pageNumber: pagesToProcess[cropResult.pIdx] || 1,
                bounds: [part.box[1], part.box[0], part.box[3] - part.box[1], part.box[2] - part.box[0]],
              });
            }
          });

          // Generate composite stitched image combining all parts into the primary question image file
          const stitchedResult = createStitchedComposite(harvestedCrops);
          if (stitchedResult) {
            const primaryImgName = `${subjName}_${qType}_Q${qNoStr}.png`;
            newArchive.rawFiles.set(primaryImgName, {
              blob: stitchedResult.blob,
              url: stitchedResult.blobUrl,
              size: stitchedResult.blob.size,
            });
          }
        } else {
          // Standard single bounding box
          const cropResult = cropBoxFromCanvas(q.pageIndex, q.box);
          if (cropResult) {
            const imgName = `${subjName}_${qType}_Q${qNoStr}.png`;
            newArchive.rawFiles.set(imgName, {
              blob: cropResult.blob,
              url: cropResult.blobUrl,
              size: cropResult.blob.size,
            });

            imageAttachments.push({
              id: generateId(),
              partIndex: 1,
              fileName: imgName,
              blobUrl: cropResult.blobUrl,
              rawBlob: cropResult.blob,
            });

            pdfDataParts.push({
              filename: imgName,
              pageNumber: pagesToProcess[cropResult.pIdx] || 1,
              bounds: [q.box[1], q.box[0], q.box[3] - q.box[1], q.box[2] - q.box[0]],
            });
          }
        }

        const newQuestion = {
          id: generateId(),
          key: qNoStr,
          que: questionNum,
          type: qType,
          marks: {
            cm: marks.cm,
            im: marks.im,
            pm: marks.pm || 0,
            max: marks.max || 4,
          },
          answerOptions: '',
          isSplitQuestion: Boolean(q.isSplit && q.splitParts && q.splitParts.length > 1),
          pdfData: pdfDataParts,
          images: imageAttachments,
        };

        section.questions.push(newQuestion);
      }

      newArchive.subjects = Array.from(subjectMap.values());

      // Match extracted answer keys if found
      if (allAnswerKeys.length > 0) {
        allAnswerKeys.forEach((keyEntry: any) => {
          if (!keyEntry || keyEntry.qNo == null) return;
          const qNoStr = String(keyEntry.qNo);
          for (const sub of newArchive.subjects) {
            for (const sec of sub.sections) {
              const qInfo = sec.questions.find((qq: any) => qq.key === qNoStr);
              if (qInfo) {
                qInfo.answerOptions = keyEntry.answer;
              }
            }
          }
        });
      }

      setPercent(100);
      setStatus('Conversion Complete!');
      setProgressDetail('Importing structured test booklet into CBT Studio workspace...');
      completeBackgroundTask('PDF booklet converted & imported into CBT Studio workspace successfully!');

      setTimeout(() => {
        addArchive(newArchive, true);
        setPdfConverterModalOpen(false);
      }, 600);
    } catch (err: any) {
      console.error('Error during PDF conversion:', err);
      setError(err.message || 'An error occurred during PDF conversion.');
      setStep('pages');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="auto-pdf-converter-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm select-none animate-fade-in"
    >
      <div
        id="auto-pdf-converter-container"
        className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-tight">
                  Auto PDF → CBT Test Creator
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Blueprint-Driven
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Crop questions sequentially and allocate subjects strictly from test instructions.
              </p>
            </div>
          </div>
          <button
            onClick={() => !isProcessing && setPdfConverterModalOpen(false)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-300 transition-colors"
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        {!isProcessing && file && (
          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep('pages')}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  step === 'pages'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>1. Pages & Settings</span>
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />

              <button
                onClick={() => setStep('blueprint')}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  step === 'blueprint'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>2. Instructions & Subject Ranges ({blueprintRanges.length} Ranges)</span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline-block truncate max-w-[200px]">
              {file.name}
            </span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* STEP 0: Upload PDF */}
          {step === 'upload' && !file && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-800/30 hover:bg-indigo-950/20 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[300px]"
            >
              <UploadCloud className="w-14 h-14 text-indigo-400 mb-4 animate-bounce" />
              <h3 className="text-base font-bold text-slate-200">Upload Test Paper PDF</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-md leading-relaxed">
                Upload your question paper. The system will crop questions in sequence, handle split
                columns, and assign subjects strictly matching your booklet instructions.
              </p>
              <div className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors">
                Select PDF File
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />
            </div>
          )}

          {/* STEP 1: Page Selection & Layout Options */}
          {step === 'pages' && file && !isProcessing && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Left Config Panel */}
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="w-8 h-8 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-center text-rose-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        setStep('upload');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Change PDF
                    </button>
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 break-all leading-tight">
                    {file.name}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {thumbnails.length} Pages
                  </p>
                </div>

                <div className="space-y-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                  <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-indigo-400" /> Layout & Sequence Options
                  </h3>

                  <label className="flex items-start gap-2 cursor-pointer group bg-indigo-950/30 border border-indigo-800/40 p-2.5 rounded-xl">
                    <input
                      type="checkbox"
                      checked={enableDoublePassRescan}
                      onChange={(e) => setEnableDoublePassRescan(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                    />
                    <div>
                      <span className="text-xs font-bold text-indigo-300 group-hover:text-indigo-200 transition-colors flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        High Accuracy Mode (Double-Pass Verification Rescan)
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 leading-normal">
                        Executes an AI audit rescan pass to detect skipped question numbers, fix misread options, and ensure 100% extraction precision.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={handleSplitQuestions}
                      onChange={(e) => setHandleSplitQuestions(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                        Split-Question & Multi-Column Slicing
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Detects questions continuing across columns or pages and stitches them sequentially.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={hasAnswerKey}
                      onChange={(e) => setHasAnswerKey(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                        Auto-Extract Answer Key Table
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Scans tables at the end for correct answers.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={extractEnglishOnly}
                      onChange={(e) => setExtractEnglishOnly(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                        Extract English Only (Bilingual)
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Extracts only English version for Hindi/English papers.
                      </span>
                    </div>
                  </label>

                  {/* Fast Scan Instructions Trigger */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      onClick={async () => {
                        await handleScanInstructionsFromPdf();
                        setStep('blueprint');
                      }}
                      disabled={isScanningInstructions}
                      className="w-full py-2 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/60 text-purple-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isScanningInstructions ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isScanningInstructions
                          ? 'Scanning Instructions...'
                          : 'Auto-Detect Blueprint (Page 1)'}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setStep('blueprint')}
                  disabled={selectedPages.size === 0}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex justify-center items-center gap-2"
                >
                  <span>Configure Instructions & Ranges</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Right Page Thumbnails Panel */}
              <div className="md:col-span-2 border border-slate-800 bg-slate-950 rounded-xl overflow-hidden flex flex-col max-h-[420px]">
                <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Select Pages to Crop ({selectedPages.size}/{thumbnails.length})
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPages(new Set(thumbnails.map((t) => t.index)))}
                      className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedPages(new Set())}
                      className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                  {isLoadingThumbnails ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                      <span className="text-xs">Generating thumbnails...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                      {thumbnails.map((thumb) => {
                        const isSelected = selectedPages.has(thumb.index);
                        return (
                          <div
                            key={thumb.index}
                            onClick={() => {
                              const next = new Set(selectedPages);
                              if (next.has(thumb.index)) next.delete(thumb.index);
                              else next.add(thumb.index);
                              setSelectedPages(next);
                            }}
                            className={`relative aspect-[1/1.4] rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                              isSelected
                                ? 'border-indigo-500 shadow-md shadow-indigo-500/20'
                                : 'border-slate-800 hover:border-slate-700 opacity-60'
                            }`}
                          >
                            <img
                              src={thumb.url}
                              alt={`Page ${thumb.index}`}
                              referrerPolicy="no-referrer"
                              className={`w-full h-full object-contain bg-white transition-all ${
                                !isSelected && 'grayscale-[40%]'
                              }`}
                            />
                            <div className="absolute top-1.5 left-1.5 bg-slate-950/90 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                              Pg {thumb.index}
                            </div>
                            <div
                              className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${
                                isSelected
                                  ? 'bg-indigo-500 border-indigo-500 text-white'
                                  : 'border-slate-400/50 bg-slate-900/50 text-transparent'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Instructions & Subject Ranges Blueprint */}
          {step === 'blueprint' && file && !isProcessing && (
            <div className="space-y-4">
              {/* Presets & Scan Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Presets:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setBlueprintRanges(
                            p.ranges.map((r) => ({ ...r, id: generateId() }))
                          );
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleScanInstructionsFromPdf}
                  disabled={isScanningInstructions}
                  className="px-3.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isScanningInstructions ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isScanningInstructions
                      ? 'Analyzing Page 1...'
                      : 'Auto-Scan Instructions (AI)'}
                  </span>
                </button>
              </div>

              {/* Instructed Marking Scheme Info Badge */}
              {hasInstructedMarkingScheme && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-start gap-2.5 text-xs text-emerald-200">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-300">
                        Instructed Booklet Marking Scheme Active
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/30">
                        +{defaultMarkingScheme.cm} / {defaultMarkingScheme.im}
                      </span>
                    </div>
                    {instructionMarkingSummary && (
                      <p className="text-[11px] text-emerald-300/80 mt-1 leading-relaxed">
                        {instructionMarkingSummary}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Test Meta Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    Test Booklet Title
                  </label>
                  <input
                    type="text"
                    value={testTitle}
                    onChange={(e) => setTestTitle(e.target.value)}
                    placeholder="Test Title"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    Total Test Marks
                  </label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value) || 96)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none"
                  />
                </div>
              </div>

              {/* Range Cards */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {blueprintRanges.map((range, index) => (
                  <div
                    key={range.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={range.subjectName}
                        onChange={(e) =>
                          handleUpdateRange(range.id, { subjectName: e.target.value })
                        }
                        placeholder="Subject (Physics)"
                        className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-100 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={range.sectionName}
                        onChange={(e) =>
                          handleUpdateRange(range.id, { sectionName: e.target.value })
                        }
                        placeholder="Section Name"
                        className="w-36 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">Q.</span>
                        <input
                          type="number"
                          value={range.fromQNo}
                          onChange={(e) =>
                            handleUpdateRange(range.id, {
                              fromQNo: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-10 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono font-bold text-indigo-400"
                        />
                        <span className="text-slate-500 font-bold">-</span>
                        <input
                          type="number"
                          value={range.toQNo}
                          onChange={(e) =>
                            handleUpdateRange(range.id, {
                              toQNo: Math.max(range.fromQNo, Number(e.target.value) || 1),
                            })
                          }
                          className="w-10 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono font-bold text-indigo-400"
                        />
                      </div>

                      <select
                        value={range.type}
                        onChange={(e) =>
                          handleUpdateRange(range.id, {
                            type: e.target.value as QuestionType,
                          })
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="mcq">MCQ</option>
                        <option value="msq">MSQ</option>
                        <option value="nat">NAT</option>
                        <option value="msm">MSM</option>
                      </select>

                      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-emerald-400 font-bold">+</span>
                        <input
                          type="number"
                          value={range.marks.cm}
                          onChange={(e) =>
                            handleUpdateRange(range.id, {
                              marks: { ...range.marks, cm: Number(e.target.value) || 4 },
                            })
                          }
                          className="w-7 bg-slate-950 border border-slate-700 rounded text-center text-xs text-emerald-400 font-mono"
                        />
                        <span className="text-[10px] text-rose-400 font-bold">/</span>
                        <input
                          type="number"
                          value={range.marks.im}
                          onChange={(e) =>
                            handleUpdateRange(range.id, {
                              marks: { ...range.marks, im: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-7 bg-slate-950 border border-slate-700 rounded text-center text-xs text-rose-400 font-mono"
                        />
                      </div>

                      <button
                        onClick={() => handleDeleteRange(range.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleAddRange}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Next Section Range</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStep('pages')}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Back to Pages
                  </button>
                  <button
                    onClick={processPDF}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Run Sequential Extraction & Crop</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Active Processing State */}
          {step === 'processing' && isProcessing && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 shadow-inner">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-indigo-400 min-w-0">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-100 block truncate">
                      {status}
                    </span>
                    {activeBatchInfo && (
                      <span className="text-[11px] text-indigo-300 font-mono block">
                        {activeBatchInfo} • Time Elapsed: <strong>{elapsedSec}s</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xl font-black text-indigo-400 font-mono tracking-tight mr-1">
                    {percent}%
                  </span>
                  <button
                    onClick={minimizeBackgroundTask}
                    className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                    title="Minimize window into floating draggable widget"
                  >
                    <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Run in Background</span>
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-3 p-0.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-300 relative"
                  style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                />
              </div>

              {/* Detail message */}
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-xs font-mono text-indigo-300 flex items-center justify-between">
                <span className="truncate">{progressDetail}</span>
                <span className="shrink-0 text-slate-500 text-[10px]">{elapsedSec}s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
