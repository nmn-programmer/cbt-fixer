import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import {
  fetchWithGeminiFallback,
  ratePaceDelay,
  getOrchestratedKeyPool,
  calculateExponentialBackoffWithJitter,
} from '../utils/geminiKeyManager';
import JSZip from 'jszip';
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
  Activity,
  Scissors,
  RotateCcw,
  Cpu,
  Upload,
} from 'lucide-react';
import { generateId } from '../utils/constants';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import {
  AiProcessingMonitorModal,
  emitWorkerLog,
  PagePartitionState,
} from './AiProcessingMonitorModal';
import {
  saveConversionCheckpoint,
  getConversionCheckpoint,
  deleteConversionCheckpoint,
  ConversionCheckpointData,
} from '../utils/indexedDB';
import {
  FleetStrategy,
  TriageResult,
  FleetConfiguration,
  runDocumentTriage,
  allocateSwarmFleet,
  auditDiagramBounds,
  planDynamicPageBatches,
  runParallelDoubleScanAudit,
  purgeDraftImageArtifacts,
  getCachedTaskResult,
  setCachedTaskResult,
  getTaskCacheKey,
} from '../utils/amasOrchestrator';
import {
  reconcileGroundTruthKeys,
  identifyMissingQuestionPages,
  StreamingProducerConsumerMerger,
  ReconciliationReport,
  AnswerKeyEntry,
} from '../utils/streamingMerger';

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
  const [instructionPageNum, setInstructionPageNum] = useState<number>(1);
  const [answerKeyMode, setAnswerKeyMode] = useState<'auto' | 'separate_file' | 'selected_pages'>('auto');
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [answerKeySelectedPages, setAnswerKeySelectedPages] = useState<Set<number>>(new Set());
  const [streamBStatus, setStreamBStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [streamBCount, setStreamBCount] = useState<number>(0);
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [liveStreamingCount, setLiveStreamingCount] = useState<number>(0);
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

  // AI Monitor & Checkpoint states
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [pagePartitions, setPagePartitions] = useState<PagePartitionState[]>([]);
  const [existingCheckpoint, setExistingCheckpoint] = useState<ConversionCheckpointData | null>(null);
  const [resumedQuestions, setResumedQuestions] = useState<any[]>([]);
  const [resumedAnswerKeys, setResumedAnswerKeys] = useState<any[]>([]);

  // AMAS Swarm Fleet & Triage states
  const [fleetStrategy, setFleetStrategy] = useState<FleetStrategy>('autopilot');
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [customWorkers, setCustomWorkers] = useState<number>(2);
  const [customAuditors, setCustomAuditors] = useState<number>(1);
  const [showCustomSliders, setShowCustomSliders] = useState<boolean>(false);
  const [cachedResultAvailable, setCachedResultAvailable] = useState<boolean>(false);

  // Compute allocated fleet dynamically
  const allocatedFleet = useMemo<FleetConfiguration>(() => {
    return allocateSwarmFleet(fleetStrategy, triageResult, {
      workers: customWorkers,
      auditors: customAuditors,
      managers: 1,
      totalPages: selectedPages.size,
    });
  }, [fleetStrategy, triageResult, customWorkers, customAuditors, selectedPages.size]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResumeFromCheckpoint = () => {
    if (!existingCheckpoint) return;
    const completedSet = new Set(existingCheckpoint.completedPages);
    setResumedQuestions(existingCheckpoint.extractedQuestions || []);
    setResumedAnswerKeys(existingCheckpoint.answerKeys || []);
    setSelectedPages((prev) => {
      const remaining = new Set<number>();
      thumbnails.forEach((t) => {
        if (!completedSet.has(t.index)) {
          remaining.add(t.index);
        }
      });
      return remaining;
    });
    addToast({
      title: 'Checkpoint Restored',
      description: `Loaded ${existingCheckpoint.completedPages.length} completed pages. Only remaining pages will be processed.`,
      type: 'success',
    });
  };

  const handleDiscardCheckpoint = async () => {
    if (file) {
      const chkId = 'checkpoint_' + file.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      await deleteConversionCheckpoint(chkId);
    }
    setExistingCheckpoint(null);
    setResumedQuestions([]);
    setResumedAnswerKeys([]);
  };

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
      setTestTitle(selected.name.replace(/\.(pdf|zip)$/i, ''));
      setError('');
      setPercent(0);
      setStatus('');
      setProgressDetail('');
      setStep('pages');
      setIsLoadingThumbnails(true);

      try {
        const isZip = selected.name.toLowerCase().endsWith('.zip') || selected.type.includes('zip');
        let pdfDataBuffer: ArrayBuffer | null = null;
        const generatedThumbnails: { url: string; index: number }[] = [];
        const initialSelected = new Set<number>();

        if (isZip) {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(selected);
          
          // Check if ZIP contains an embedded PDF
          const pdfEntryName = Object.keys(loadedZip.files).find(
            (fn) => fn.toLowerCase().endsWith('.pdf') && !loadedZip.files[fn].dir
          );

          if (pdfEntryName) {
            pdfDataBuffer = await loadedZip.files[pdfEntryName].async('arraybuffer');
          } else {
            // ZIP contains image files (e.g. page_1.png, page_2.jpg)
            const imgEntries = Object.entries(loadedZip.files)
              .filter(([fn, entry]) => !entry.dir && /\.(png|jpe?g|webp|bmp)$/i.test(fn))
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            if (imgEntries.length === 0) {
              throw new Error('ZIP archive contains no readable PDF or image pages.');
            }

            for (let i = 0; i < imgEntries.length; i++) {
              const [, entry] = imgEntries[i];
              const imgBlob = await entry.async('blob');
              const imgUrl = URL.createObjectURL(imgBlob);

              const imgElem = new Image();
              imgElem.src = imgUrl;
              await new Promise((res) => { imgElem.onload = res; imgElem.onerror = res; });

              const thumbCanvas = document.createElement('canvas');
              const scale = 0.25;
              thumbCanvas.width = Math.max(100, Math.round(imgElem.naturalWidth * scale));
              thumbCanvas.height = Math.max(140, Math.round(imgElem.naturalHeight * scale));
              const tCtx = thumbCanvas.getContext('2d');
              if (tCtx) {
                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
                tCtx.drawImage(imgElem, 0, 0, thumbCanvas.width, thumbCanvas.height);
              }

              const pageIdx = i + 1;
              initialSelected.add(pageIdx);
              generatedThumbnails.push({
                url: thumbCanvas.toDataURL('image/jpeg', 0.6),
                index: pageIdx,
              });
            }

            setThumbnails(generatedThumbnails);
            setSelectedPages(initialSelected);
            setIsLoadingThumbnails(false);
            return;
          }
        } else {
          pdfDataBuffer = await selected.arrayBuffer();
        }

        if (pdfDataBuffer) {
          const pdfjsLib = await getPdfjsLib();
          const pdfDoc = await pdfjsLib.getDocument({ data: pdfDataBuffer }).promise;
          const numPages = pdfDoc.numPages;

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
        }

        // Trigger AMAS Layer 1 Scout Triage
        if (generatedThumbnails.length > 0) {
          setIsTriageLoading(true);
          runDocumentTriage(null, generatedThumbnails.length)
            .then((tr) => {
              setTriageResult(tr);
              setIsTriageLoading(false);
            })
            .catch(() => setIsTriageLoading(false));
        }

        // Check for task execution cache to prevent redundant API calls
        const pagesList = Array.from(initialSelected).sort((a, b) => a - b);
        const cacheKey = getTaskCacheKey(selected.name, selected.size, pagesList, blueprintRanges, {
          hasAnswerKey,
          extractEnglishOnly,
          enableDoublePass: enableDoublePassRescan,
          fleetStrategy,
        });
        const cached = getCachedTaskResult(cacheKey);
        if (cached && cached.questions && cached.questions.length > 0) {
          setCachedResultAvailable(true);
        } else {
          setCachedResultAvailable(false);
        }

        // Check for existing conversion checkpoints in IndexedDB
        const chkId = 'checkpoint_' + selected.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const savedChk = await getConversionCheckpoint(chkId);
        if (savedChk && savedChk.completedPages && savedChk.completedPages.length > 0) {
          setExistingCheckpoint(savedChk);
          addToast({
            title: 'Saved Progress Available',
            description: `A previous conversion checkpoint with ${savedChk.completedPages.length} completed pages was found for this document.`,
            type: 'info',
          });
        } else {
          setExistingCheckpoint(null);
        }
      } catch (err: any) {
        console.error('Thumbnail generation error', err);
        setError('Failed to load document preview: ' + err.message);
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

  // AI Scan Instructions Page from the uploaded PDF/ZIP (Page 1 or user-selected page)
  const handleScanInstructionsFromPdf = async (targetPageNum?: number) => {
    if (!file) return;
    const pageToScan = Math.max(1, targetPageNum || instructionPageNum || 1);
    try {
      setIsScanningInstructions(true);
      setInstructionsScanStatus(`Rendering instruction page ${pageToScan}...`);

      let base64Image = '';
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip');

      if (isZip) {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        const pdfEntryName = Object.keys(loadedZip.files).find(
          (fn) => fn.toLowerCase().endsWith('.pdf') && !loadedZip.files[fn].dir
        );

        if (pdfEntryName) {
          const pdfBuf = await loadedZip.files[pdfEntryName].async('arraybuffer');
          const pdfjsLib = await getPdfjsLib();
          const pdfDoc = await pdfjsLib.getDocument({ data: pdfBuf }).promise;
          const validPageNum = Math.min(pageToScan, pdfDoc.numPages);
          const page = await pdfDoc.getPage(validPageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context error');
          await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
          base64Image = canvas.toDataURL('image/jpeg', 0.85);
        } else {
          const imgEntries = Object.entries(loadedZip.files)
            .filter(([fn, entry]) => !entry.dir && /\.(png|jpe?g|webp|bmp)$/i.test(fn))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

          if (imgEntries.length > 0) {
            const validIdx = Math.min(pageToScan - 1, imgEntries.length - 1);
            const targetBlob = await imgEntries[validIdx][1].async('blob');
            base64Image = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(targetBlob);
            });
          }
        }
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await getPdfjsLib();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const validPageNum = Math.min(pageToScan, pdfDoc.numPages);
        const page = await pdfDoc.getPage(validPageNum);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context error');

        await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
        base64Image = canvas.toDataURL('image/jpeg', 0.85);
      }

      if (!base64Image) throw new Error(`Unable to render page ${pageToScan} for blueprint extraction`);

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
      console.warn('Scan instructions notice:', err?.message || err);
      addToast({
        title: 'Instruction Scan Notice',
        description: err.message || 'Unable to parse instruction blueprint.',
        type: 'warning',
      });
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
      setStatus('Reading document buffer...');
      setProgressDetail('Loading document into memory...');

      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip');
      let pdfDoc: any = null;
      let zipImageEntries: [string, any][] = [];

      if (isZip) {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        const pdfEntryName = Object.keys(loadedZip.files).find(
          (fn) => fn.toLowerCase().endsWith('.pdf') && !loadedZip.files[fn].dir
        );
        if (pdfEntryName) {
          const pdfBuf = await loadedZip.files[pdfEntryName].async('arraybuffer');
          const pdfjsLib = await getPdfjsLib();
          pdfDoc = await pdfjsLib.getDocument({ data: pdfBuf }).promise;
        } else {
          zipImageEntries = Object.entries(loadedZip.files)
            .filter(([fn, entry]) => !entry.dir && /\.(png|jpe?g|webp|bmp)$/i.test(fn))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        }
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await getPdfjsLib();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      }

      const base64Images: string[] = [];
      const canvasImages: HTMLCanvasElement[] = [];

      const pagesToProcess: number[] = Array.from<number>(selectedPages).sort((a, b) => a - b);
      if (pagesToProcess.length === 0) throw new Error('No pages selected for processing');

      setStatus(`Rendering ${pagesToProcess.length} selected pages...`);
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
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context null');

        if (pdfDoc) {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // 2.0x scale (150 DPI) for optimal balance of math clarity & speed

          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);

          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: context, viewport } as any).promise;
        } else if (zipImageEntries.length > 0) {
          const entry = zipImageEntries[pageNum - 1];
          if (entry) {
            const imgBlob = await entry[1].async('blob');
            const imgUrl = URL.createObjectURL(imgBlob);
            const imgElem = new Image();
            imgElem.src = imgUrl;
            await new Promise((res) => { imgElem.onload = res; imgElem.onerror = res; });

            canvas.width = imgElem.naturalWidth;
            canvas.height = imgElem.naturalHeight;
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(imgElem, 0, 0);
          }
        }

        // Create downscaled canvas for Pass 1 AI Layout Pass (max 1200px width @ 0.72 JPEG)
        // This cuts input token payload from ~200k down to ~25k tokens per batch, preventing 429 RESOURCE_EXHAUSTED errors
        let base64ForAi = '';
        const MAX_AI_WIDTH = 1200;
        if (canvas.width > MAX_AI_WIDTH) {
          const scaledCanvas = document.createElement('canvas');
          const scaleFactor = MAX_AI_WIDTH / canvas.width;
          scaledCanvas.width = MAX_AI_WIDTH;
          scaledCanvas.height = Math.round(canvas.height * scaleFactor);
          const scaledCtx = scaledCanvas.getContext('2d');
          if (scaledCtx) {
            scaledCtx.imageSmoothingEnabled = true;
            scaledCtx.imageSmoothingQuality = 'high';
            scaledCtx.fillStyle = '#ffffff';
            scaledCtx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
            scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
            base64ForAi = scaledCanvas.toDataURL('image/jpeg', 0.72);
          } else {
            base64ForAi = canvas.toDataURL('image/jpeg', 0.72);
          }
        } else {
          base64ForAi = canvas.toDataURL('image/jpeg', 0.72);
        }

        base64Images.push(base64ForAi);
        canvasImages.push(canvas); // Keep original 300 DPI native canvas for high-res bounding box cropping

        const pagePercent = Math.min(35, Math.round(5 + ((i + 1) / pagesToProcess.length) * 30));
        setPercent(pagePercent);
        setProgressDetail(`Rendered page ${pageNum} (${i + 1}/${pagesToProcess.length})`);
        updateBackgroundTask({
          percent: pagePercent,
          statusText: `Rendering page ${pageNum} (${i + 1}/${pagesToProcess.length})...`,
        });
      }

      // Chunk pages into batches based on Swarm Fleet configuration
      const allExtractedQuestions: QuestionDetection[] = [];
      const allAnswerKeys: any[] = [];
      const checkpointId = 'checkpoint_' + file.name.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Compute Task Deduplication Cache Key to prevent redundant API calls
      const taskCacheKey = getTaskCacheKey(
        file.name,
        file.size,
        pagesToProcess,
        blueprintRanges,
        {
          hasAnswerKey,
          extractEnglishOnly,
          enableDoublePass: enableDoublePassRescan,
          fleetStrategy,
        }
      );

      // Check Task Execution Cache
      const cachedResult = getCachedTaskResult(taskCacheKey);
      let isCachedRecall = false;

      if (cachedResult && cachedResult.questions && cachedResult.questions.length > 0) {
        isCachedRecall = true;
        allExtractedQuestions.push(...cachedResult.questions);
        if (cachedResult.answerKeys) {
          allAnswerKeys.push(...cachedResult.answerKeys);
        }

        emitWorkerLog({
          workerId: 'orchestrator',
          workerLabel: 'Deduplication Cache',
          level: 'success',
          message: `Zero-API Recall: Restored ${cachedResult.questions.length} questions from task cache. 100% of redundant API calls eliminated!`,
        });

        addToast({
          title: 'Zero-API Cache Recall',
          description: `Loaded ${cachedResult.questions.length} questions from prior extraction. Preserved quota limits!`,
          type: 'success',
        });
      }

      // Layer 1: Document Scout Triage if not already evaluated
      let activeTriage = triageResult;
      if (!isCachedRecall && !activeTriage && canvasImages.length > 0) {
        setStatus('AMAS Layer 1: Running Scout Triage & Complexity Classifier...');
        activeTriage = await runDocumentTriage(canvasImages[0], pagesToProcess.length);
        setTriageResult(activeTriage);
      }

      // Layer 2: Dynamic Fleet Allocation
      const swarmFleet = allocateSwarmFleet(fleetStrategy, activeTriage, {
        workers: customWorkers,
        auditors: customAuditors,
        managers: 1,
        totalPages: pagesToProcess.length,
      });

      // Phase 0: Global Blueprint Manifest Assembly (Scout Directive Agent)
      const globalManifest = {
        testTitle: testTitle || file.name,
        durationMinutes,
        totalMarks,
        totalExpectedQuestions: blueprintRanges.length > 0 ? Math.max(...blueprintRanges.map((r) => r.toQNo)) : 90,
        sections: blueprintRanges,
        instructionMarkingSummary,
        defaultMarkingScheme,
      };

      emitWorkerLog({
        workerId: 'orchestrator',
        workerLabel: 'Scout Directive Agent',
        level: 'info',
        message: `Global Blueprint Manifest Active: ${globalManifest.totalExpectedQuestions} questions target across ${globalManifest.sections.length} section range(s).`,
      });

      const dynamicBatchPlans = planDynamicPageBatches(pagesToProcess, swarmFleet);
      const totalBatches = dynamicBatchPlans.length;

      const initialPartitions: PagePartitionState[] = pagesToProcess.map((p, idx) => {
        const plan =
          dynamicBatchPlans.find((bp) => idx >= bp.startPageIndex && idx < bp.endPageIndex) ||
          dynamicBatchPlans[0];
        const assignedWorker = plan ? plan.assignedWorker : swarmFleet.manager;
        return {
          pageNumber: p,
          assignedWorkerId: assignedWorker.id,
          assignedWorkerLabel: `${assignedWorker.roleTitle} (${assignedWorker.label})`,
          status: isCachedRecall ? 'done' : 'pending',
          retryAttempt: 0,
        };
      });
      setPagePartitions(initialPartitions);

      emitWorkerLog({
        workerId: 'orchestrator',
        workerLabel: 'AMAS Fleet Allocator',
        level: 'info',
        message: `Swarm Mode [${swarmFleet.strategy.toUpperCase()}]: Allocated ${swarmFleet.workers.length} Layout Workers, ${swarmFleet.auditors.length} Diagram Auditors, 1 Consensus Manager (${swarmFleet.manager.label}) with ${swarmFleet.ratePacingMs}ms pacing.`,
      });

      // Stream B: Parallel Answer Key Extractor Worker Stream
      let streamBPromise: Promise<any[]> | null = null;
      if (!isCachedRecall && hasAnswerKey) {
        setStreamBStatus('running');
        emitWorkerLog({
          workerId: 'stream_b_answer_key',
          workerLabel: 'Stream B: Answer Key Extractor',
          level: 'info',
          message: `Stream B Active: Launching parallel Answer Key Extraction Stream (${answerKeyMode.toUpperCase()} mode)...`,
        });

        streamBPromise = (async () => {
          try {
            const akImages: string[] = [];
            if (answerKeyMode === 'separate_file' && answerKeyFile) {
              const pdfjsLib = await getPdfjsLib();
              const akBuf = await answerKeyFile.arrayBuffer();
              const akDoc = await pdfjsLib.getDocument({ data: akBuf }).promise;
              for (let p = 1; p <= Math.min(5, akDoc.numPages); p++) {
                const page = await akDoc.getPage(p);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  await page.render({ canvasContext: ctx, viewport } as any).promise;
                  akImages.push(canvas.toDataURL('image/jpeg', 0.72));
                }
              }
            } else if (answerKeyMode === 'selected_pages' && answerKeySelectedPages.size > 0 && pdfDoc) {
              for (const pNum of Array.from(answerKeySelectedPages)) {
                const page = await pdfDoc.getPage(pNum);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  await page.render({ canvasContext: ctx, viewport } as any).promise;
                  akImages.push(canvas.toDataURL('image/jpeg', 0.72));
                }
              }
            }

            if (akImages.length > 0) {
              const res = await fetchWithGeminiFallback(
                '/api/extract-answer-key',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ images: akImages, manifest: globalManifest }),
                },
                addToast,
                refreshUsageMetrics
              );

              if (res.ok) {
                const data = await res.json();
                const keys = data.answerKeys || [];
                setStreamBCount(keys.length);
                setStreamBStatus('done');
                emitWorkerLog({
                  workerId: 'stream_b_answer_key',
                  workerLabel: 'Stream B: Answer Key Extractor',
                  level: 'success',
                  message: `Stream B completed: Extracted ${keys.length} answer keys in parallel.`,
                });
                return keys;
              }
            }
          } catch (err: any) {
            console.warn('[Stream B] Parallel answer key extraction notice:', err);
            setStreamBStatus('error');
            emitWorkerLog({
              workerId: 'stream_b_answer_key',
              workerLabel: 'Stream B: Answer Key Extractor',
              level: 'warning',
              message: `Stream B notice: ${err.message || 'Falling back to main document answer key extraction.'}`,
            });
          }
          return [];
        })();
      }

      // Restore resumed questions if available
      if (!isCachedRecall && resumedQuestions.length > 0) {
        allExtractedQuestions.push(...resumedQuestions);
        emitWorkerLog({
          workerId: 'orchestrator',
          workerLabel: 'Orchestrator',
          level: 'info',
          message: `Incorporated ${resumedQuestions.length} pre-extracted questions from saved checkpoint.`,
        });
      }
      if (!isCachedRecall && resumedAnswerKeys.length > 0) {
        allAnswerKeys.push(...resumedAnswerKeys);
      }

      if (!isCachedRecall) {
        const passStatusMsg = enableDoublePassRescan
          ? 'AI Multimodal Swarm double-pass rescan reading questions in sequence...'
          : 'AI Multimodal Swarm reading questions in sequence...';
        setStatus(passStatusMsg);
        setPercent(36);
        updateBackgroundTask({ percent: 36, statusText: passStatusMsg });

        let lastBatchError = '';
        const streamingMerger = new StreamingProducerConsumerMerger(handleSplitQuestions);

        // Map batch plans to parallel dispatch promises
        const batchPromises = dynamicBatchPlans.map(async (plan, batchIdx) => {
          // Stagger the request dispatch to spread the network/API load beautifully
          const staggerDelayMs = batchIdx * (swarmFleet.workers.length > 1 ? 150 : swarmFleet.ratePacingMs);
          if (staggerDelayMs > 0) {
            await new Promise((r) => setTimeout(r, staggerDelayMs));
          }

          const startPage = plan.startPageIndex;
          const endPage = plan.endPageIndex;
          const chunkImages = base64Images.slice(startPage, endPage);

          const realStartPage = plan.pageNumbers[0];
          const realEndPage = plan.pageNumbers[plan.pageNumbers.length - 1];
          const assignedWorker = plan.assignedWorker;

          emitWorkerLog({
            workerId: assignedWorker.id,
            workerLabel: assignedWorker.label,
            level: 'info',
            pageNumber: realStartPage,
            message: `Dispatching Batch ${batchIdx + 1}/${totalBatches} (Pages ${realStartPage}-${realEndPage}) to ${assignedWorker.roleTitle} (${assignedWorker.label})...`,
          });

          setPagePartitions((prev) =>
            prev.map((p) =>
              p.pageNumber >= realStartPage && p.pageNumber <= realEndPage
                ? { ...p, status: 'processing' }
                : p
            )
          );

          let batchSuccess = false;
          let retryAttempt = 0;
          const MAX_BATCH_RETRIES = 2;
          let batchQuestions: any[] = [];
          let batchKeys: any[] = [];

          while (!batchSuccess && retryAttempt <= MAX_BATCH_RETRIES) {
            try {
              // Pass X-Preferred-Key in the request headers to force the geminiKeyManager 
              // to route this request strictly to the assigned worker's specific key!
              const res = await fetchWithGeminiFallback(
                '/api/extract-pdf-structure',
                {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'X-Preferred-Key': assignedWorker.key
                  },
                  body: JSON.stringify({
                    images: chunkImages,
                    pageOffset: startPage,
                    options: {
                      hasAnswerKey,
                      extractEnglishOnly,
                      enableDoublePass: enableDoublePassRescan,
                      manifest: globalManifest,
                    },
                  }),
                },
                addToast,
                refreshUsageMetrics
              );

              if (res.ok) {
                const batchResponse = await res.json();
                batchQuestions = batchResponse.questions && Array.isArray(batchResponse.questions)
                  ? batchResponse.questions
                  : [];
                batchKeys = batchResponse.answerKeys && Array.isArray(batchResponse.answerKeys)
                  ? batchResponse.answerKeys
                  : [];

                setPagePartitions((prev) =>
                  prev.map((p) =>
                    p.pageNumber >= realStartPage && p.pageNumber <= realEndPage
                      ? { ...p, status: 'done', detectedQuestionsCount: batchQuestions.length }
                      : p
                  )
                );

                emitWorkerLog({
                  workerId: assignedWorker.id,
                  workerLabel: assignedWorker.label,
                  level: 'success',
                  pageNumber: realStartPage,
                  message: `Batch ${batchIdx + 1} completed: +${batchQuestions.length} items extracted on ${assignedWorker.label}.`,
                });

                batchSuccess = true;
              } else {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
              }
            } catch (batchErr: any) {
              retryAttempt++;
              const errMsg = batchErr?.message || `Batch ${batchIdx + 1} failed`;
              if (retryAttempt <= MAX_BATCH_RETRIES) {
                const backoffMs = calculateExponentialBackoffWithJitter(retryAttempt);
                emitWorkerLog({
                  workerId: assignedWorker.id,
                  workerLabel: assignedWorker.label,
                  level: 'warning',
                  pageNumber: realStartPage,
                  message: `Rate limit / warning on ${assignedWorker.label} (${errMsg}). Backing off ${backoffMs}ms before retry ${retryAttempt}/${MAX_BATCH_RETRIES}...`,
                });

                setPagePartitions((prev) =>
                  prev.map((p) =>
                    p.pageNumber >= realStartPage && p.pageNumber <= realEndPage
                      ? { ...p, status: 'backoff', retryAttempt, backoffRemainingMs: backoffMs }
                      : p
                  )
                );

                await new Promise((r) => setTimeout(r, backoffMs));
              } else {
                emitWorkerLog({
                  workerId: assignedWorker.id,
                  workerLabel: assignedWorker.label,
                  level: 'error',
                  pageNumber: realStartPage,
                  message: `Batch ${batchIdx + 1} failed after ${MAX_BATCH_RETRIES} retries: ${errMsg}`,
                });
                setPagePartitions((prev) =>
                  prev.map((p) =>
                    p.pageNumber >= realStartPage && p.pageNumber <= realEndPage
                      ? { ...p, status: 'error', errorMessage: errMsg }
                      : p
                  )
                );
                throw new Error(`Batch ${batchIdx + 1} extraction failed: ${errMsg}`);
              }
            }
          }

          return { batchIdx, questions: batchQuestions, answerKeys: batchKeys, plan };
        });

        setStatus('Executing parallel swarm extraction across API keys...');
        setPercent(45);
        setActiveBatchInfo(`Processing ${totalBatches} batches in parallel...`);

        const results = await Promise.all(batchPromises);

        // Sort results by batch index to guarantee strict sequential integrity before merging
        results.sort((a, b) => a.batchIdx - b.batchIdx);

        // Push results to the streaming merger in strict sequential order
        results.forEach((res, idx) => {
          const isLastBatch = idx === results.length - 1;
          allExtractedQuestions.push(...res.questions);
          allAnswerKeys.push(...res.answerKeys);

          const mergeRes = streamingMerger.pushBatch(res.questions, isLastBatch);
          setLiveStreamingCount(streamingMerger.getConfirmedQuestions().length);
        });

        // Save final consolidated recovery checkpoint to IndexedDB
        const completedPagesList = Array.from(
          new Set([
            ...(existingCheckpoint?.completedPages || []),
            ...pagesToProcess,
          ])
        );
        await saveConversionCheckpoint({
          id: checkpointId,
          fileName: file.name,
          testTitle: testTitle || file.name,
          totalPages: thumbnails.length,
          completedPages: completedPagesList,
          extractedQuestions: allExtractedQuestions,
          answerKeys: allAnswerKeys,
          timestamp: Date.now(),
        });

        if (allExtractedQuestions.length === 0) {
          throw new Error(
            lastBatchError ||
              'No questions were detected across the selected pages. Please verify your Gemini API Key in Settings and ensure the document contains clear printed questions.'
          );
        }

        // Await parallel Stream B Answer Key Extraction results if active
        if (streamBPromise) {
          const parallelKeys = await streamBPromise;
          if (parallelKeys && parallelKeys.length > 0) {
            allAnswerKeys.push(...parallelKeys);
          }
        }

        // Phase 2: Ground-Truth Reconciliation Pass
        const questionsToReconcile =
          streamingMerger.getConfirmedQuestions().length > 0
            ? streamingMerger.getConfirmedQuestions()
            : allExtractedQuestions;

        const { reconciledQuestions: finalReconciled, report: reconReport } = reconcileGroundTruthKeys(
          questionsToReconcile,
          allAnswerKeys,
          blueprintRanges
        );
        setReconciliationReport(reconReport);

        emitWorkerLog({
          workerId: swarmFleet.manager.id,
          workerLabel: swarmFleet.manager.label,
          level: 'success',
          message: `Ground-Truth Reconciliation Complete: ${reconReport.matchedKeysCount}/${reconReport.totalExpectedKeys || reconReport.totalExtractedQuestions} keys matched (${reconReport.precisionScorePercent}% Precision). Missing Gaps: ${reconReport.missingGaps.length > 0 ? reconReport.missingGaps.join(', ') : 'None'}. NAT Validated: ${reconReport.natValidatedCount}.`,
        });

        // Replace questions pool with reconciled questions
        allExtractedQuestions.length = 0;
        allExtractedQuestions.push(...finalReconciled);

        // Phase 3: Ground-Truth Discrepancy Pinpoint Auto-Rescan
        if (reconReport.missingGaps.length > 0 && pdfDoc) {
          emitWorkerLog({
            workerId: swarmFleet.manager.id,
            workerLabel: swarmFleet.manager.label,
            level: 'warning',
            message: `Phase 3 Ground-Truth Auto-Rescan: Pinpointing missing gap(s) Q${reconReport.missingGaps.join(', Q')}...`,
          });

          const missingTargets = identifyMissingQuestionPages(
            reconReport.missingGaps,
            finalReconciled,
            pdfDoc.numPages
          );

          const candidatePagesToRescan = Array.from(
            new Set(missingTargets.flatMap((t) => t.candidatePageIndices))
          );

          const recoveredQuestions: QuestionDetection[] = [];

          for (const pageIdx of candidatePagesToRescan) {
            const pageNum = pageIdx + 1;
            try {
              const page = await pdfDoc.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport } as any).promise;
                const pageImg = canvas.toDataURL('image/jpeg', 0.85);

                const targetQNosForPage = missingTargets
                  .filter((t) => t.candidatePageIndices.includes(pageIdx))
                  .map((t) => t.qNo);

                const rescanRes = await fetchWithGeminiFallback(
                  '/api/extract-pdf-structure',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      images: [pageImg],
                      pageOffset: pageIdx,
                      options: {
                        hasAnswerKey: false,
                        manifest: globalManifest,
                        targetQNos: targetQNosForPage,
                        enableDoublePass: false,
                      },
                    }),
                  },
                  addToast,
                  refreshUsageMetrics
                );

                if (rescanRes.ok) {
                  const rescanData = await rescanRes.json();
                  const found = rescanData.questions || [];
                  if (found.length > 0) {
                    recoveredQuestions.push(...found);
                  }
                }
              }
            } catch (rescanErr: any) {
              console.warn(`[Phase 3 Pinpoint Rescan] Page ${pageNum} error:`, rescanErr);
            }
          }

          if (recoveredQuestions.length > 0) {
            streamingMerger.pushBatch(recoveredQuestions, true);
            const updatedReconciled = streamingMerger.getConfirmedQuestions();

            const { reconciledQuestions: updatedFinal, report: updatedReport } = reconcileGroundTruthKeys(
              updatedReconciled,
              allAnswerKeys,
              blueprintRanges
            );

            setReconciliationReport(updatedReport);
            allExtractedQuestions.length = 0;
            allExtractedQuestions.push(...updatedFinal);

            emitWorkerLog({
              workerId: swarmFleet.manager.id,
              workerLabel: swarmFleet.manager.label,
              level: 'success',
              message: `Phase 3 Ground-Truth Auto-Rescan Successful: Recovered ${recoveredQuestions.length} missing question(s)! Precision Score updated to ${updatedReport.precisionScorePercent}% (${updatedReport.matchedKeysCount}/${updatedReport.totalExpectedKeys || updatedReport.totalExtractedQuestions} keys matched).`,
            });
          }
        }

        // Cache task execution result for future instant zero-API recalls
        setCachedTaskResult(taskCacheKey, {
          questions: allExtractedQuestions,
          answerKeys: allAnswerKeys,
        });

        // Layer 3: Diagram Auditor pass for complex questions if auditors allocated
        if (swarmFleet.auditors.length > 0 && canvasImages.length > 0) {
          const auditor = swarmFleet.auditors[0];
          setStatus('AMAS Layer 3: Diagram Auditor refining bounding boxes...');
          emitWorkerLog({
            workerId: auditor.id,
            workerLabel: auditor.label,
            level: 'info',
            message: `Auditor (${auditor.label}) auditing bounding boxes for complex math formulas and diagram alignments...`,
          });

          for (let i = 0; i < Math.min(allExtractedQuestions.length, 8); i++) {
            const q = allExtractedQuestions[i];
            if (q.box && canvasImages[q.pageIndex]) {
              try {
                const refinedBox = await auditDiagramBounds(canvasImages[q.pageIndex], q.box, auditor.key);
                if (refinedBox) {
                  q.box = refinedBox;
                }
              } catch (auditErr) {
                // Non-fatal, continue
              }
            }
          }
        }
      }

      setActiveBatchInfo('');
      setPercent(76);
      setStatus('Resolving question continuations & option completeness via Consensus Manager...');

      emitWorkerLog({
        workerId: swarmFleet.manager.id,
        workerLabel: swarmFleet.manager.label,
        level: 'info',
        message: `Consensus Manager (${swarmFleet.manager.label}) sequencing ${allExtractedQuestions.length} extracted question blocks into blueprint subjects...`,
      });

      // Pre-pass: Sort and resolve split-question continuations and orphaned option blocks
      // Step 1: Sort all extracted blocks into physical 2-column reading order:
      // Page 0 -> Page 1 -> Page 2...
      // Within page: Left Column (xmin < 0.49) first, then Right Column (xmin >= 0.49).
      // Within column: Top to Bottom (ymin).
      allExtractedQuestions.sort((a, b) => {
        const pA = a.pageIndex ?? 0;
        const pB = b.pageIndex ?? 0;
        if (pA !== pB) return pA - pB;

        const colA = (a.box && a.box[1] >= 0.49) ? 1 : 0;
        const colB = (b.box && b.box[1] >= 0.49) ? 1 : 0;
        if (colA !== colB) return colA - colB;

        const yA = a.box ? a.box[0] : 0;
        const yB = b.box ? b.box[0] : 0;
        return yA - yB;
      });

      // Step 2: Intelligent Orphan Continuation Detection & Multi-Part Stitching
      const resolvedQuestions: QuestionDetection[] = [];

      for (let i = 0; i < allExtractedQuestions.length; i++) {
        const item = allExtractedQuestions[i];
        if (!item || !item.box || item.box.length < 4) continue;

        const prevQ = resolvedQuestions.length > 0 ? resolvedQuestions[resolvedQuestions.length - 1] : null;

        // Check if this item is an orphan continuation:
        // 1. Explicitly flagged as isOrphanContinuation: true OR continuationForQNo matching prevQ.qNo
        // 2. Or: has no valid qNo (e.g. 0, null, or same qNo as prevQ) and is situated near the top of the column/page (ymin < 0.38)
        // 3. Or: prevQ is an MCQ with completeness === 'split' or fewer than 3 options detected, AND this item is at the top of next column/page.
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
          handleSplitQuestions &&
          (prevQ.completeness === 'split' || prevQ.isSplit || (prevQ.type === 'mcq' && (!prevQ.optionsFound || prevQ.optionsFound.length < 3))) &&
          item.box[0] < 0.38 &&
          (!item.qNo || item.qNo === prevQ.qNo || (item.optionsFound && item.optionsFound.length >= 1))
        );

        if (prevQ && (isExplicitOrphan || isUnnumberedTopContinuation || isSplitPredecessorNeedsOptions)) {
          console.log(`[Split Assembler] Merging continuation box from Page ${item.pageIndex + 1} into Question Q${prevQ.qNo}`);
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
          continue; // Merged into previous question, do not create duplicate question entry
        }

        // If item itself is already marked isSplit with splitParts, ensure part 1 is valid
        if (item.isSplit && item.splitParts && item.splitParts.length > 0) {
          if (!item.splitParts.some(p => p.pageIndex === item.pageIndex)) {
            item.splitParts.unshift({ pageIndex: item.pageIndex, box: item.box, partIndex: 1 });
          }
        }

        resolvedQuestions.push(item);
      }

      // Step 3: Final sequential numbering fix for any missing / zero Q-numbers
      let nextExpectedQ = 1;
      resolvedQuestions.forEach((q) => {
        if (!q.qNo || q.qNo <= 0) {
          q.qNo = nextExpectedQ;
        } else {
          nextExpectedQ = q.qNo;
        }
        nextExpectedQ++;
      });

      // Strict Numerical Sorting Enforcement
      resolvedQuestions.sort((a, b) => a.qNo - b.qNo);

      // Execute Strict Parallel Double-Scan Verification Protocol across active keys
      const doubleScanResults = runParallelDoubleScanAudit(
        resolvedQuestions.map((q) => ({
          qNo: q.qNo,
          subject: q.subject,
          box: q.box,
          pageIndex: q.pageIndex,
          optionsFound: q.optionsFound,
          completeness: q.completeness,
          isSplit: q.isSplit,
        })),
        swarmFleet
      );

      const doubleScanMap = new Map<number, any>();
      doubleScanResults.forEach((r) => doubleScanMap.set(r.qNo, r));

      let totalVerified = 0;
      let totalRepaired = 0;
      let totalFlagged = 0;

      resolvedQuestions.forEach((q) => {
        const audit = doubleScanMap.get(q.qNo);
        if (audit) {
          if (audit.doubleScanStatus === 'repaired') {
            q.box = audit.box; // Auto-expanded bounding box (+20px padding)
            totalRepaired++;
          } else if (audit.doubleScanStatus === 'flagged') {
            totalFlagged++;
          } else {
            totalVerified++;
          }
          (q as any).doubleScanStatus = audit.doubleScanStatus;
          (q as any).hasExtractionWarning = audit.hasExtractionWarning;
          (q as any).warningReason = audit.warningReason;
        }
      });

      emitWorkerLog({
        workerId: swarmFleet.manager.id,
        workerLabel: swarmFleet.manager.label,
        level: totalFlagged > 0 ? 'warning' : 'success',
        message: `Strict Double-Scan Audit Complete: ${totalVerified} Verified, ${totalRepaired} Auto-Repaired (+20px boundary expansion), ${totalFlagged} Flagged ("Needs Manual Image Review").`,
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

      // Helper function to crop a box on a canvas with column-aware padding & zero-clipping safeguards
      const cropBoxFromCanvas = (pageIndex: number, boxCoords: [number, number, number, number]) => {
        const pIdx = typeof pageIndex === 'number' ? Math.max(0, Math.min(canvasImages.length - 1, pageIndex)) : 0;
        const canvas = canvasImages[pIdx] || canvasImages[0];
        if (!canvas) return null;

        let [ymin, xmin, ymax, xmax] = boxCoords;
        ymin = Math.max(0, Math.min(0.98, Number(ymin) || 0));
        xmin = Math.max(0, Math.min(0.98, Number(xmin) || 0));
        ymax = Math.max(ymin + 0.02, Math.min(1, Number(ymax) || 1));
        xmax = Math.max(xmin + 0.04, Math.min(1, Number(xmax) || 1));

        // 3-Line Structural Anchor Lock (Left Margin, Center Divider, Right Margin)
        // Check if question spans full-width (banners, multi-column tables, wide physics/chem diagrams)
        const isFullWidthSpan = xmin < 0.25 && xmax > 0.70;
        const isLeftCol = !isFullWidthSpan && xmin < 0.48;
        const isRightCol = !isFullWidthSpan && xmin >= 0.48;

        // Apply strict 3-Line Structural Boundaries
        if (isLeftCol) {
          // Lock X_MIN to Left Margin Line (~0.032) to enclose Q-numbers, Lock X_MAX right at Center Divider (~0.490)
          xmin = Math.min(xmin, 0.032);
          xmax = Math.min(Math.max(xmax, 0.465), 0.492);
        } else if (isRightCol) {
          // Lock X_MIN right after Center Divider (~0.508), Lock X_MAX to Right Margin Line (~0.968)
          xmin = Math.max(Math.min(xmin, 0.528), 0.508);
          xmax = Math.max(xmax, 0.968);
        } else if (isFullWidthSpan) {
          // Lock X_MIN to Left Margin Line (~0.032), Lock X_MAX to Right Margin Line (~0.968)
          xmin = Math.min(xmin, 0.032);
          xmax = Math.max(xmax, 0.968);
        }

        const pxYmin = Math.floor(ymin * canvas.height);
        const pxXmin = Math.floor(xmin * canvas.width);
        const pxHeight = Math.ceil((ymax - ymin) * canvas.height);
        const pxWidth = Math.ceil((xmax - xmin) * canvas.width);

        // Safe asymmetric padding: Top 12px, Bottom 22px (prevents cutting bottom options/subscripts), Left 16px, Right 14px
        const padT = 12;
        const padB = 22;
        const padL = 16;
        const padR = 14;

        let cropY = Math.max(0, pxYmin - padT);
        let cropX = Math.max(0, pxXmin - padL);
        let cropW = Math.min(canvas.width - cropX, Math.max(30, pxWidth + padL + padR));
        let cropH = Math.min(canvas.height - cropY, Math.max(30, pxHeight + padT + padB));

        // Prevent cross-column bleeding across the central vertical divider line (unless full-width)
        if (!isFullWidthSpan) {
          if (isLeftCol) {
            const maxRightPx = Math.floor(canvas.width * 0.495);
            if (cropX + cropW > maxRightPx) {
              cropW = Math.max(30, maxRightPx - cropX);
            }
          } else if (isRightCol) {
            const minLeftPx = Math.floor(canvas.width * 0.505);
            if (cropX < minLeftPx) {
              const diff = minLeftPx - cropX;
              cropX = minLeftPx;
              cropW = Math.max(30, cropW - diff);
            }
          }
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.imageSmoothingEnabled = true;
          cropCtx.imageSmoothingQuality = 'high';
          cropCtx.fillStyle = '#ffffff';
          cropCtx.fillRect(0, 0, cropW, cropH);
          cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

          // Smooth tone-curve background whitening (preserves anti-aliased font edges & boosts dark ink)
          const imgData = cropCtx.getImageData(0, 0, cropW, cropH);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const avg = (r + g + b) / 3;

            if (avg > 218) {
              const factor = Math.min(1, (avg - 218) / 37);
              data[i] = Math.round(r + (255 - r) * factor);
              data[i + 1] = Math.round(g + (255 - g) * factor);
              data[i + 2] = Math.round(b + (255 - b) * factor);
            } else if (avg < 140) {
              const boost = 0.84;
              data[i] = Math.round(r * boost);
              data[i + 1] = Math.round(g * boost);
              data[i + 2] = Math.round(b * boost);
            }
          }
          cropCtx.putImageData(imgData, 0, 0);
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

        const gap = 16;
        const maxWidth = Math.max(...cropList.map((c) => c.cropCanvas.width));
        const totalHeight =
          cropList.reduce((acc, c) => acc + c.cropCanvas.height, 0) + (cropList.length - 1) * gap;

        const stitchedCanvas = document.createElement('canvas');
        stitchedCanvas.width = maxWidth;
        stitchedCanvas.height = totalHeight;
        const sCtx = stitchedCanvas.getContext('2d');
        if (!sCtx) return null;

        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, maxWidth, totalHeight);

        let currentY = 0;
        cropList.forEach((c, idx) => {
          sCtx.drawImage(c.cropCanvas, 0, currentY);
          currentY += c.cropCanvas.height;

          if (idx < cropList.length - 1) {
            sCtx.save();
            sCtx.strokeStyle = '#cbd5e1';
            sCtx.lineWidth = 1.5;
            sCtx.setLineDash([5, 5]);
            sCtx.beginPath();
            sCtx.moveTo(20, currentY + gap / 2);
            sCtx.lineTo(maxWidth - 20, currentY + gap / 2);
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

              const pNum = pagesToProcess[cropResult.pIdx] || 1;
              const yminVal = part.box[0];
              const xminVal = part.box[1];
              const ymaxVal = part.box[2];
              const xmaxVal = part.box[3];

              pdfDataParts.push({
                filename: partImgName,
                page: pNum,
                pageNumber: pNum,
                ymin: yminVal,
                xmin: xminVal,
                ymax: ymaxVal,
                xmax: xmaxVal,
                x1: Math.round(xminVal * 1000),
                y1: Math.round(yminVal * 1000),
                x2: Math.round(xmaxVal * 1000),
                y2: Math.round(ymaxVal * 1000),
                bounds: [xminVal, yminVal, xmaxVal - xminVal, ymaxVal - yminVal],
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

            const pNum = pagesToProcess[cropResult.pIdx] || 1;
            const yminVal = q.box[0];
            const xminVal = q.box[1];
            const ymaxVal = q.box[2];
            const xmaxVal = q.box[3];

            pdfDataParts.push({
              filename: imgName,
              page: pNum,
              pageNumber: pNum,
              ymin: yminVal,
              xmin: xminVal,
              ymax: ymaxVal,
              xmax: xmaxVal,
              x1: Math.round(xminVal * 1000),
              y1: Math.round(yminVal * 1000),
              x2: Math.round(xmaxVal * 1000),
              y2: Math.round(ymaxVal * 1000),
              bounds: [xminVal, yminVal, xmaxVal - xminVal, ymaxVal - yminVal],
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
          doubleScanStatus: (q as any).doubleScanStatus || 'verified',
          hasExtractionWarning: (q as any).hasExtractionWarning || false,
          warningReason: (q as any).warningReason || undefined,
          isFlagged: (q as any).doubleScanStatus === 'flagged',
        };

        section.questions.push(newQuestion);
      }

      newArchive.subjects = Array.from(subjectMap.values());

      // Garbage Collection Pass: Purge intermediate draft & scratch crop image files
      newArchive.rawFiles = purgeDraftImageArtifacts(newArchive.rawFiles);

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

      // Clean up saved checkpoint upon full completion
      await deleteConversionCheckpoint(checkpointId);
      setExistingCheckpoint(null);

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
          <div className="flex items-center gap-2">
            <button
              id="auto-converter-fleet-btn"
              onClick={() => setIsMonitorModalOpen(true)}
              className="px-2.5 py-1.5 bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 hover:text-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="AI Multi-Key Fleet & Activity Monitor"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              <span className="hidden sm:inline">AI Monitor</span>
            </button>
            <button
              onClick={() => !isProcessing && setPdfConverterModalOpen(false)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-300 transition-colors"
              disabled={isProcessing}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
              <h3 className="text-base font-bold text-slate-200">Upload Test Paper (PDF or Image ZIP)</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-md leading-relaxed">
                Upload your question paper as a PDF or a ZIP archive of scanned page images. The AI will detect layout, resolve split
                columns, and extract questions sequentially strictly matching your blueprint.
              </p>
              <div className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md transition-colors">
                Select PDF or ZIP File
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,application/pdf,.zip,application/zip,application/x-zip-compressed"
                className="hidden"
              />
            </div>
          )}

          {/* STEP 1: Page Selection & Layout Options */}
          {step === 'pages' && file && !isProcessing && (
            <div className="space-y-4">
              {/* Checkpoint Recovery Banner */}
              {existingCheckpoint && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg text-amber-300 shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                        <span>Saved Conversion Checkpoint Available</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-mono">
                          {existingCheckpoint.completedPages.length} Pages Saved
                        </span>
                      </h4>
                      <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                        Found previous progress for this test paper with {existingCheckpoint.completedPages.length} of {existingCheckpoint.totalPages} pages already converted ({existingCheckpoint.extractedQuestions.length} questions extracted).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    <button
                      onClick={handleResumeFromCheckpoint}
                      className="flex-1 sm:flex-none px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Resume Checkpoint</span>
                    </button>
                    <button
                      onClick={handleDiscardCheckpoint}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                      title="Discard checkpoint and start fresh from page 1"
                    >
                      Start Fresh
                    </button>
                  </div>
                </div>
              )}

              {/* AMAS Swarm Strategy & Multi-Agent Fleet Control Bar */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                      <Cpu className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-200">
                          Adaptive Multi-Agent Swarm (AMAS) Fleet Strategy
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.2 bg-indigo-900/50 text-indigo-300 rounded font-semibold border border-indigo-700/50">
                          Smart Role Balancing
                        </span>
                        {cachedResultAvailable && (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded-full font-bold border border-emerald-500/40 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-emerald-400" /> Zero-API Cache Hit
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Controls key allocation, concurrency, and rate-pacing to conserve API quota limits.
                      </p>
                    </div>
                  </div>

                  {/* Scout Triage Status */}
                  {triageResult && (
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-300 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Scout: <strong>{triageResult.archetype}</strong></span>
                      <span className="text-slate-500">|</span>
                      <span className="text-indigo-300">{triageResult.estimatedRPM} RPM</span>
                    </div>
                  )}
                </div>

                {/* Strategy Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      id: 'autopilot' as FleetStrategy,
                      name: '🧠 AI Autopilot',
                      tagline: 'Self-Optimizing',
                      desc: 'Auto-allocates workers & auditors from Scout triage complexity.',
                      badgeColor: 'text-indigo-400 border-indigo-800 bg-indigo-950/40',
                    },
                    {
                      id: 'eco' as FleetStrategy,
                      name: '🌱 Eco Saver',
                      tagline: 'Quota Protection',
                      desc: '1 Worker + 1200ms pacing. Preserves free-tier 15 RPM limits.',
                      badgeColor: 'text-emerald-400 border-emerald-800 bg-emerald-950/40',
                    },
                    {
                      id: 'balanced' as FleetStrategy,
                      name: '⚡ Balanced',
                      tagline: 'Standard CBT',
                      desc: '2 Workers + 1 Auditor with 600ms pacing for optimal throughput.',
                      badgeColor: 'text-amber-400 border-amber-800 bg-amber-950/40',
                    },
                    {
                      id: 'turbo' as FleetStrategy,
                      name: '🚀 Turbo Swarm',
                      tagline: 'Max Speed',
                      desc: 'Multi-worker concurrency with 300ms pacing for fastest turnaround.',
                      badgeColor: 'text-rose-400 border-rose-800 bg-rose-950/40',
                    },
                  ].map((strat) => {
                    const isSelected = fleetStrategy === strat.id && !showCustomSliders;
                    return (
                      <button
                        key={strat.id}
                        type="button"
                        onClick={() => {
                          setFleetStrategy(strat.id);
                          setShowCustomSliders(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500 shadow-md'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200">{strat.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${strat.badgeColor}`}
                          >
                            {strat.tagline}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{strat.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Fleet Toggle and Sliders */}
                <div className="pt-2 border-t border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomSliders(!showCustomSliders)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                        showCustomSliders
                          ? 'bg-purple-950 border-purple-600 text-purple-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3 text-purple-400" />
                      <span>{showCustomSliders ? 'Custom Swarm Active' : 'Configure Custom Swarm'}</span>
                    </button>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span>Active Allocation:</span>
                      <span className="text-indigo-300 font-bold">
                        {allocatedFleet.workers.length} Worker(s)
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-purple-300 font-bold">
                        {allocatedFleet.auditors.length} Auditor(s)
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-emerald-300 font-bold">
                        1 Manager ({allocatedFleet.manager.label})
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    Pacing: <strong className="text-slate-300">{allocatedFleet.ratePacingMs}ms</strong>
                  </span>
                </div>

                {showCustomSliders && (
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in text-xs">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-semibold">Layout Extraction Workers</span>
                        <span className="font-mono text-indigo-400 font-bold">{customWorkers} Keys</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={customWorkers}
                        onChange={(e) => {
                          setCustomWorkers(Number(e.target.value));
                          setFleetStrategy('custom');
                        }}
                        className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Parallel workers processing 2-page chunks simultaneously.
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-semibold">Diagram & Math Auditors</span>
                        <span className="font-mono text-purple-400 font-bold">{customAuditors} Keys</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        value={customAuditors}
                        onChange={(e) => {
                          setCustomAuditors(Number(e.target.value));
                          setFleetStrategy('custom');
                        }}
                        className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Dedicated keys auditing bounding boxes for formulas and diagrams.
                      </span>
                    </div>
                  </div>
                )}
              </div>

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

                  <div className="space-y-2 border-t border-slate-800/80 pt-2">
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={hasAnswerKey}
                        onChange={(e) => setHasAnswerKey(e.target.checked)}
                        className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                          Dual-Stream Answer Key Worker
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Runs Stream B in parallel to extract official answer keys & NAT decimal values.
                        </span>
                      </div>
                    </label>

                    {hasAnswerKey && (
                      <div className="ml-6 space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs">
                        <div className="text-[11px] font-bold text-slate-300">Answer Key Source:</div>
                        <div className="flex flex-col gap-1.5 text-[11px] text-slate-300">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="akMode"
                              checked={answerKeyMode === 'auto'}
                              onChange={() => setAnswerKeyMode('auto')}
                              className="accent-indigo-500"
                            />
                            <span>Auto-detect in booklet pages</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="akMode"
                              checked={answerKeyMode === 'separate_file'}
                              onChange={() => setAnswerKeyMode('separate_file')}
                              className="accent-indigo-500"
                            />
                            <span>Upload separate Answer Key PDF/Image</span>
                          </label>
                          {answerKeyMode === 'separate_file' && (
                            <div className="mt-1 pl-4">
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 rounded text-indigo-300 font-medium text-[11px] transition-colors">
                                <Upload className="w-3 h-3" />
                                <span>{answerKeyFile ? answerKeyFile.name : 'Choose Answer Key File...'}</span>
                                <input
                                  type="file"
                                  accept=".pdf,image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      setAnswerKeyFile(e.target.files[0]);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="akMode"
                              checked={answerKeyMode === 'selected_pages'}
                              onChange={() => setAnswerKeyMode('selected_pages')}
                              className="accent-indigo-500"
                            />
                            <span>Select specific document pages ({answerKeySelectedPages.size} selected)</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

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

                  {/* Phase 0 Scout: Fast Instruction Directive Trigger */}
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Instruction Page:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">Page</span>
                        <input
                          type="number"
                          min={1}
                          max={thumbnails.length || 100}
                          value={instructionPageNum}
                          onChange={(e) => setInstructionPageNum(Math.max(1, Number(e.target.value)))}
                          className="w-12 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs text-center font-bold text-indigo-300"
                        />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await handleScanInstructionsFromPdf(instructionPageNum);
                        setStep('blueprint');
                      }}
                      disabled={isScanningInstructions}
                      className="w-full py-2 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/60 text-purple-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isScanningInstructions ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      )}
                      <span>
                        {isScanningInstructions
                          ? `Scanning Page ${instructionPageNum}...`
                          : `Auto-Detect Blueprint (Page ${instructionPageNum})`}
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

              {/* Swarm Fleet Summary Recap */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">
                        Fleet Swarm [{fleetStrategy.toUpperCase()}]:
                      </span>
                      <span className="text-indigo-400 font-semibold">
                        {allocatedFleet.workers.length} Worker(s)
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-purple-400 font-semibold">
                        {allocatedFleet.auditors.length} Auditor(s)
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-emerald-400 font-semibold">
                        1 Manager ({allocatedFleet.manager.label})
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Batch Pacing: {allocatedFleet.ratePacingMs}ms • Batch Size: {allocatedFleet.batchSize} pages • Auto-Deduplication Cache Active
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsMonitorModalOpen(true)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto transition-colors"
                >
                  <Activity className="w-3 h-3 text-purple-400" />
                  <span>Inspect Swarm Topology</span>
                </button>
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

          {/* STEP 3: Active Processing State & Error Fallback */}
          {step === 'processing' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 shadow-inner">
              {isProcessing ? (
                <>
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
                        onClick={() => setIsMonitorModalOpen(true)}
                        className="px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                        title="Open real-time AI Fleet & Key Monitor"
                      >
                        <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        <span className="hidden sm:inline">AI Monitor</span>
                      </button>
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

                  {/* Phase 2: Live Incremental Streaming & Ground-Truth Reconciliation Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                          <Layers className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Producer-Consumer Streaming Queue
                          </div>
                          <div className="text-xs font-bold text-slate-200 mt-0.5">
                            {liveStreamingCount} Questions Confirmed & Merged
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Live Stream
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Ground-Truth Reconciliation
                          </div>
                          <div className="text-xs font-bold text-slate-200 mt-0.5">
                            {reconciliationReport ? (
                              <span>
                                {reconciliationReport.matchedKeysCount}/{reconciliationReport.totalExpectedKeys || reconciliationReport.totalExtractedQuestions} Keys Matched ({reconciliationReport.precisionScorePercent}%)
                              </span>
                            ) : (
                              <span className="text-slate-400">Reconciling Stream A & Stream B...</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {reconciliationReport ? `${reconciliationReport.precisionScorePercent}% Precision` : 'Cross-Checking'}
                      </span>
                    </div>
                  </div>
                </>
              ) : error ? (
                <div className="space-y-4 py-2">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                    <div className="space-y-1 min-w-0">
                      <h4 className="text-sm font-bold text-rose-200">Extraction Notice</h4>
                      <p className="text-xs text-rose-300/90 leading-relaxed break-words">{error}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => setStep('pages')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Back to Page Selection
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                        className="px-4 py-2 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Settings & API Keys</span>
                      </button>
                      <button
                        onClick={processPDF}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Retry Extraction</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Real-time AI Key & Worker Monitor Modal */}
      <AiProcessingMonitorModal
        isOpen={isMonitorModalOpen}
        onClose={() => setIsMonitorModalOpen(false)}
        isLiveProcessing={isProcessing}
        pagePartitions={pagePartitions}
        activePhase={status}
        fleetConfig={allocatedFleet}
        triageResult={triageResult}
        fleetStrategy={fleetStrategy}
      />
    </div>
  );
};
