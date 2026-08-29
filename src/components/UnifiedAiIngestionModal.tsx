import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Key,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
  Zap,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
  FileCode,
  ListFilter,
  Check,
  Tag,
  Sliders,
  Activity,
  Scissors,
  RotateCcw,
  Cpu,
  AlertTriangle,
  FileArchive,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import {
  BlueprintSectionRange,
  MultiDocumentIngestionItem,
  PageRole,
  QuestionPaperArchive,
  QuestionType,
  SubjectData,
} from '../types/cbt';
import { generateId, buildImageFileName } from '../utils/constants';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import {
  extractAnswerKeyFromMultiPdfSources,
  MultiPdfSourceTarget,
  LoadedAnswerKeyFile,
  parseAnswerKeyPayload,
} from '../utils/answerKeyManager';
import { RangeTextInput } from './RangeTextInput';
import {
  fetchWithGeminiFallback,
  ratePaceDelay,
  getOrchestratedKeyPool,
  calculateExponentialBackoffWithJitter,
} from '../utils/geminiKeyManager';
import JSZip from 'jszip';
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
import {
  analyzePageLayoutAndSpans,
  cropBoxWithSpanAwareness,
  rectifyQuestionBoundingBoxes,
  determineDocumentLayoutConsensus,
  detectAndInheritPassageStems,
  PageLayoutAnalysis,
} from '../utils/intelligentCvSplitter';

interface QuestionDetection {
  pageIndex: number;
  qNo: number;
  subject: string;
  type: string;
  box: [number, number, number, number];
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

const PRESET_TEMPLATES = [
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

export const UnifiedAiIngestionModal: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    isUnifiedAiIngestionModalOpen,
    unifiedAiIngestionInitialTab,
    setUnifiedAiIngestionModalOpen,
    setAnswerKeyModalOpen,
    setBlueprintModalOpen,
    addArchive,
    geminiApiKey,
    addToast,
    refreshUsageMetrics,
    startBackgroundTask,
    updateBackgroundTask,
    completeBackgroundTask,
    minimizeBackgroundTask,
    enableDoublePassRescan,
    setEnableDoublePassRescan,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Tab State
  const [activeTab, setActiveTab] = useState<'documents' | 'blueprint' | 'amas_swarm' | 'extraction'>('documents');

  // Document Registry
  const [documents, setDocuments] = useState<MultiDocumentIngestionItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [isProcessingAi, setIsProcessingAi] = useState<boolean>(false);
  const [activeBrushRole, setActiveBrushRole] = useState<PageRole>('questions');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Blueprint & Range Controls
  const [blueprintRanges, setBlueprintRanges] = useState<BlueprintSectionRange[]>(DEFAULT_PRESET_RANGES);
  const [testTitle, setTestTitle] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [totalMarks, setTotalMarks] = useState<number>(96);
  const [isScanningInstructions, setIsScanningInstructions] = useState(false);
  const [instructionPagesInput, setInstructionPagesInput] = useState<string>('1, 2');
  const [answerKeyMode, setAnswerKeyMode] = useState<'auto' | 'separate_file' | 'selected_pages'>('auto');
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [streamBStatus, setStreamBStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [streamBCount, setStreamBCount] = useState<number>(0);
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [liveStreamingCount, setLiveStreamingCount] = useState<number>(0);
  const [instructionMarkingSummary, setInstructionMarkingSummary] = useState<string>('');
  const [hasInstructedMarkingScheme, setHasInstructedMarkingScheme] = useState<boolean>(false);
  const [defaultMarkingScheme, setDefaultMarkingScheme] = useState<{ cm: number; im: number; pm?: number; max?: number }>({ cm: 4, im: -1, pm: 0, max: 4 });

  // Processing & AMAS Swarm State
  const [status, setStatus] = useState<string>('');
  const [percent, setPercent] = useState<number>(0);
  const [progressDetail, setProgressDetail] = useState<string>('');
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

  // Canvas & File Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocCache = useRef<Map<string, any>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const answerKeyFileInputRef = useRef<HTMLInputElement>(null);

  // Allocated Fleet calculation
  const allocatedFleet = useMemo<FleetConfiguration>(() => {
    return allocateSwarmFleet(fleetStrategy, triageResult, {
      workers: customWorkers,
      auditors: customAuditors,
      managers: 1,
    });
  }, [fleetStrategy, triageResult, customWorkers, customAuditors]);

  // Initial Sync when Modal Opens
  useEffect(() => {
    if (!isUnifiedAiIngestionModalOpen) return;

    if (unifiedAiIngestionInitialTab === 'answer_key') {
      setActiveBrushRole('answer_key');
      setActiveTab('documents');
    } else if (unifiedAiIngestionInitialTab === 'blueprint') {
      setActiveBrushRole('blueprint');
      setActiveTab('blueprint');
    } else if (unifiedAiIngestionInitialTab === 'questions') {
      setActiveBrushRole('questions');
      setActiveTab('documents');
    }

    // Auto-discover archive PDFs if documents list is empty
    if (documents.length === 0 && activeArchive) {
      const discoveredDocs: MultiDocumentIngestionItem[] = [];
      for (const [fileName, entry] of activeArchive.rawFiles.entries()) {
        if (fileName.toLowerCase().endsWith('.pdf') && entry.blob) {
          discoveredDocs.push({
            id: generateId(),
            name: fileName,
            size: entry.size,
            blob: entry.blob,
            totalPages: 1,
            pageAssignments: {},
            isSourceArchiveFile: true,
          });
        }
      }
      if (discoveredDocs.length > 0) {
        setDocuments(discoveredDocs);
        setActiveDocId(discoveredDocs[0].id);
        loadPdfDocumentMetadata(discoveredDocs[0]);
      }
    }
  }, [isUnifiedAiIngestionModalOpen, activeArchive]);

  const activeDoc = useMemo(() => {
    return documents.find((d) => d.id === activeDocId) || documents[0];
  }, [documents, activeDocId]);

  const loadPdfDocumentMetadata = async (docItem: MultiDocumentIngestionItem) => {
    try {
      const pdfjsLib = await getPdfjsLib();
      let pdfDoc = pdfDocCache.current.get(docItem.id);

      if (!pdfDoc) {
        let arrayBuffer: ArrayBuffer;
        if (docItem.file) {
          arrayBuffer = await docItem.file.arrayBuffer();
        } else if (docItem.blob) {
          arrayBuffer = await docItem.blob.arrayBuffer();
        } else {
          return;
        }

        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pdfDocCache.current.set(docItem.id, pdfDoc);
      }

      const numPages = pdfDoc.numPages;

      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id === docItem.id) {
            const existingAssignments = { ...d.pageAssignments };
            if (Object.keys(existingAssignments).length === 0) {
              for (let p = 1; p <= numPages; p++) {
                if (docItem.name.toLowerCase().includes('ans') || docItem.name.toLowerCase().includes('key')) {
                  existingAssignments[p] = 'answer_key';
                } else if (p === 1 && numPages > 2) {
                  existingAssignments[p] = 'blueprint';
                } else {
                  existingAssignments[p] = 'questions';
                }
              }
            }
            return {
              ...d,
              totalPages: numPages,
              pageAssignments: existingAssignments,
            };
          }
          return d;
        })
      );
    } catch (err: any) {
      console.error('[Unified AI Ingestion] Error loading PDF doc metadata:', err);
    }
  };

  useEffect(() => {
    if (activeDoc) {
      loadPdfDocumentMetadata(activeDoc);
    }
  }, [activeDoc?.id]);

  // Render Canvas Preview
  useEffect(() => {
    if (!activeDoc || !canvasRef.current) return;
    let isCancelled = false;

    const renderPreview = async () => {
      setIsRenderingPage(true);
      try {
        const pdfjsLib = await getPdfjsLib();
        let pdfDoc = pdfDocCache.current.get(activeDoc.id);

        if (!pdfDoc) {
          let arrayBuffer: ArrayBuffer;
          if (activeDoc.file) {
            arrayBuffer = await activeDoc.file.arrayBuffer();
          } else if (activeDoc.blob) {
            arrayBuffer = await activeDoc.blob.arrayBuffer();
          } else {
            return;
          }
          pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          pdfDocCache.current.set(activeDoc.id, pdfDoc);
        }

        const safePageNum = Math.min(Math.max(previewPage, 1), pdfDoc.numPages || 1);
        const page = await pdfDoc.getPage(safePageNum);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport } as any).promise;
      } catch (err: any) {
        console.error('[Unified AI Ingestion] Canvas render error:', err);
      } finally {
        if (!isCancelled) setIsRenderingPage(false);
      }
    };

    renderPreview();
    return () => {
      isCancelled = true;
    };
  }, [activeDoc?.id, previewPage, scale]);

  // Ingest files (PDF / ZIP)
  const handleAddFiles = async (files: FileList | File[]) => {
    const newDocItems: MultiDocumentIngestionItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.name.toLowerCase().endsWith('.pdf') || f.type.includes('pdf')) {
        const docId = generateId();
        newDocItems.push({
          id: docId,
          name: f.name,
          size: f.size,
          file: f,
          totalPages: 1,
          pageAssignments: {},
        });
      } else if (f.name.toLowerCase().endsWith('.zip') || f.type.includes('zip')) {
        try {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(f);
          const pdfEntryName = Object.keys(loadedZip.files).find(
            (fn) => fn.toLowerCase().endsWith('.pdf') && !loadedZip.files[fn].dir
          );
          if (pdfEntryName) {
            const pdfBlob = await loadedZip.files[pdfEntryName].async('blob');
            const docId = generateId();
            newDocItems.push({
              id: docId,
              name: pdfEntryName,
              size: pdfBlob.size,
              blob: pdfBlob,
              totalPages: 1,
              pageAssignments: {},
            });
          }
        } catch (err) {
          console.warn('Zip extraction notice:', err);
        }
      }
    }

    if (newDocItems.length > 0) {
      setDocuments((prev) => [...prev, ...newDocItems]);
      setActiveDocId(newDocItems[0].id);
      setPreviewPage(1);
      newDocItems.forEach((doc) => loadPdfDocumentMetadata(doc));
      if (!testTitle && newDocItems[0].name) {
        setTestTitle(newDocItems[0].name.replace(/\.(pdf|zip)$/i, ''));
      }
      addToast('Documents Added', `Ingested ${newDocItems.length} document(s).`, 'success');
    } else {
      addToast('No PDF Files', 'Please select valid PDF or ZIP files.', 'warning');
    }
  };

  const handleRemoveDoc = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    pdfDocCache.current.delete(docId);
    if (activeDocId === docId) {
      const remaining = documents.filter((d) => d.id !== docId);
      if (remaining.length > 0) {
        setActiveDocId(remaining[0].id);
        setPreviewPage(1);
      } else {
        setActiveDocId('');
      }
    }
  };

  // Helper: Format page numbers into range string
  const pagesToRangeString = (pages: number[]): string => {
    if (pages.length === 0) return '';
    const sorted = [...pages].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  };

  // Helper: Parse range string into page number array (handles "1-3, 5, 8-12", "1, 2", etc. robustly)
  const parseRangeStringToPages = (rangeStr: string, maxPage: number): number[] => {
    const pages = new Set<number>();
    const tokens = rangeStr.split(/[,\s]+/).filter(Boolean);

    for (const token of tokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length >= 2) {
          const start = parseInt(parts[0].trim(), 10);
          const end = parseInt(parts[1].trim(), 10);
          if (!isNaN(start) && !isNaN(end)) {
            const from = Math.max(1, Math.min(start, end));
            const to = Math.min(maxPage, Math.max(start, end));
            for (let p = from; p <= to; p++) {
              pages.add(p);
            }
          } else if (!isNaN(start) && start >= 1 && start <= maxPage) {
            pages.add(start);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPage) {
          pages.add(p);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleTogglePageRole = (docId: string, pageNum: number) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === docId) {
          const currentRole = d.pageAssignments[pageNum] || 'skip';
          const nextRole: PageRole = currentRole === activeBrushRole ? 'skip' : activeBrushRole;
          return {
            ...d,
            pageAssignments: {
              ...d.pageAssignments,
              [pageNum]: nextRole,
            },
          };
        }
        return d;
      })
    );
  };

  const handleUpdateRoleRange = (docId: string, role: PageRole, rangeStr: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    if (!targetDoc) return;

    const assignedPages = parseRangeStringToPages(rangeStr, targetDoc.totalPages || 100);

    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === docId) {
          const nextAssignments = { ...d.pageAssignments };

          for (let p = 1; p <= d.totalPages; p++) {
            if (nextAssignments[p] === role && !assignedPages.includes(p)) {
              nextAssignments[p] = 'skip';
            }
          }

          assignedPages.forEach((p) => {
            nextAssignments[p] = role;
          });

          return {
            ...d,
            pageAssignments: nextAssignments,
          };
        }
        return d;
      })
    );
  };

  const handleBatchMarkActiveDoc = (role: PageRole) => {
    if (!activeDoc) return;
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === activeDoc.id) {
          const assignments: Record<number, PageRole> = {};
          for (let p = 1; p <= d.totalPages; p++) {
            assignments[p] = role;
          }
          return {
            ...d,
            pageAssignments: assignments,
          };
        }
        return d;
      })
    );
  };

  const getPagesForRole = (doc: MultiDocumentIngestionItem, role: PageRole): number[] => {
    const pages: number[] = [];
    for (let p = 1; p <= doc.totalPages; p++) {
      if (doc.pageAssignments[p] === role) {
        pages.push(p);
      }
    }
    return pages;
  };

  // Cross-Document Statistics
  const aggregateStats = useMemo(() => {
    let blueprintCount = 0;
    let questionCount = 0;
    let answerKeyCount = 0;
    let solutionCount = 0;
    let skipCount = 0;

    documents.forEach((doc) => {
      for (let p = 1; p <= doc.totalPages; p++) {
        const role = doc.pageAssignments[p] || 'skip';
        if (role === 'blueprint') blueprintCount++;
        else if (role === 'questions') questionCount++;
        else if (role === 'answer_key') answerKeyCount++;
        else if (role === 'solution') solutionCount++;
        else skipCount++;
      }
    });

    return {
      blueprintCount,
      questionCount,
      answerKeyCount,
      solutionCount,
      skipCount,
    };
  }, [documents]);

  // ACTION: Run Answer Key Extraction
  const handleRunAnswerKeyExtraction = async () => {
    const sourcesWithKey: MultiPdfSourceTarget[] = [];

    documents.forEach((doc) => {
      const keyPages = getPagesForRole(doc, 'answer_key');
      if (keyPages.length > 0 && (doc.file || doc.blob)) {
        sourcesWithKey.push({
          id: doc.id,
          name: doc.name,
          blobOrFile: (doc.file || doc.blob)!,
          pages: keyPages,
          role: 'answer_key',
        });
      }
    });

    if (sourcesWithKey.length === 0) {
      addToast('No Answer Key Pages Assigned', 'Please mark at least one page as "Answer Key".', 'warning');
      return;
    }

    try {
      setIsProcessingAi(true);
      const totalPages = sourcesWithKey.reduce((acc, s) => acc + s.pages.length, 0);

      startBackgroundTask({
        id: 'answer_key_studio',
        title: `Extracting Answer Keys (${sourcesWithKey.length} PDF${sourcesWithKey.length > 1 ? 's' : ''})`,
        statusText: `AI Vision OCR scanning ${totalPages} answer key pages...`,
        percent: 15,
        modalType: 'answer_key_studio',
      });

      const result = await extractAnswerKeyFromMultiPdfSources(
        sourcesWithKey,
        undefined,
        (msg, pct) => {
          updateBackgroundTask({ statusText: msg, percent: pct });
        },
        {
          totalQuestions: activeArchive
            ? activeArchive.subjects.reduce(
                (sum, s) => sum + s.sections.reduce((s2, sec) => s2 + sec.questions.length, 0),
                0
              )
            : undefined,
          subjects: activeArchive ? activeArchive.subjects.map((s) => s.name) : undefined,
        }
      );

      completeBackgroundTask(`Extracted ${result.parseResult.items.length} Answer Keys!`);
      addToast(
        'Answer Key Extraction Complete',
        `Extracted ${result.parseResult.items.length} answer keys across ${sourcesWithKey.length} document(s).`,
        'success'
      );

      setUnifiedAiIngestionModalOpen(false);
      setAnswerKeyModalOpen(true);
    } catch (err: any) {
      console.error('[Unified AI Ingestion] Error extracting keys:', err);
      addToast('Extraction Failed', err.message || 'Could not extract answer key', 'error');
    } finally {
      setIsProcessingAi(false);
    }
  };

  // ACTION: AI Instruction Scanner
  const handleScanInstructionsAi = async () => {
    if (!activeDoc) return;
    const blueprintPages = getPagesForRole(activeDoc, 'blueprint');
    const inputStr = blueprintPages.length > 0 ? pagesToRangeString(blueprintPages) : instructionPagesInput || '1, 2';
    const pagesToScan = parseRangeStringToPages(inputStr, activeDoc.totalPages || 100);

    try {
      setIsScanningInstructions(true);
      setStatus('Reading instruction page content...');

      const pdfjsLib = await getPdfjsLib();
      let pdfDoc = pdfDocCache.current.get(activeDoc.id);

      if (!pdfDoc) {
        let arrayBuffer: ArrayBuffer;
        if (activeDoc.file) arrayBuffer = await activeDoc.file.arrayBuffer();
        else if (activeDoc.blob) arrayBuffer = await activeDoc.blob.arrayBuffer();
        else throw new Error('Document buffer unavailable');
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      }

      let base64Image = '';
      if (pagesToScan.length > 0) {
        const pageNum = pagesToScan[0];
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          base64Image = canvas.toDataURL('image/jpeg', 0.85);
        }
      }

      const res = await fetchWithGeminiFallback(
        '/api/extract-test-blueprint',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image || undefined,
          }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
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
        const newParsedRanges: BlueprintSectionRange[] = data.sections.map((s: any) => ({
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

        setBlueprintRanges(newParsedRanges.sort((a, b) => a.fromQNo - b.fromQNo));
        addToast('Instructions Parsed', `Extracted ${newParsedRanges.length} section ranges!`, 'success');
      }
    } catch (err: any) {
      addToast('Scan Notice', err.message || 'Could not parse instructions.', 'warning');
    } finally {
      setIsScanningInstructions(false);
      setStatus('');
    }
  };

  // Blueprint Preset Loader
  const handleLoadPreset = (presetId: string) => {
    const p = PRESET_TEMPLATES.find((t) => t.id === presetId);
    if (!p) return;
    setBlueprintRanges(
      p.ranges.map((r) => ({
        ...r,
        id: generateId(),
      }))
    );
    addToast('Preset Loaded', `Applied preset: ${p.name}`, 'info');
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
    setBlueprintRanges((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleDeleteRange = (id: string) => {
    setBlueprintRanges((prev) => prev.filter((r) => r.id !== id));
  };

  // Checkpoint restore / discard
  const handleResumeFromCheckpoint = () => {
    if (!existingCheckpoint) return;
    setResumedQuestions(existingCheckpoint.extractedQuestions || []);
    setResumedAnswerKeys(existingCheckpoint.answerKeys || []);
    addToast('Checkpoint Restored', `Loaded ${existingCheckpoint.completedPages.length} completed pages.`, 'success');
  };

  const handleDiscardCheckpoint = async () => {
    if (activeDoc) {
      const chkId = 'checkpoint_' + activeDoc.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      await deleteConversionCheckpoint(chkId);
    }
    setExistingCheckpoint(null);
    setResumedQuestions([]);
    setResumedAnswerKeys([]);
  };

  // ACTION: FULL MULTI-PDF QUESTION EXTRACTION & ARCHIVE CREATION
  const handleRunFullQuestionExtraction = async () => {
    if (documents.length === 0) {
      addToast('No Documents Ingested', 'Please upload at least one PDF file.', 'warning');
      return;
    }

    if (aggregateStats.questionCount === 0) {
      addToast('No Question Pages Marked', 'Please assign "Questions" role to at least one page.', 'warning');
      return;
    }

    try {
      setIsProcessingAi(true);
      setActiveTab('extraction');
      setStatus('Initializing AMAS Swarm Fleet & Dual-Stream Pipeline...');
      setPercent(5);

      startBackgroundTask({
        id: 'pdf_converter',
        title: `Multi-PDF Question Extractor (${documents.length} Docs)`,
        statusText: 'AMAS Swarm Fleet starting extraction...',
        percent: 5,
        modalType: 'pdf_converter',
      });

      // Gather target question pages across all documents
      const questionTargets: { doc: MultiDocumentIngestionItem; pages: number[] }[] = [];
      documents.forEach((doc) => {
        const pages = getPagesForRole(doc, 'questions');
        if (pages.length > 0) {
          questionTargets.push({ doc, pages });
        }
      });

      const totalQuestionPages = questionTargets.reduce((acc, t) => acc + t.pages.length, 0);

      const allDetectedQuestions: QuestionDetection[] = [...resumedQuestions];
      const allExtractedKeys: AnswerKeyEntry[] = [...resumedAnswerKeys];
      const rawImageFilesMap = new Map<string, { blob: Blob; url: string; size: number }>();

      let processedPageCount = 0;

      for (const target of questionTargets) {
        const { doc, pages } = target;
        const pdfjsLib = await getPdfjsLib();

        let arrayBuffer: ArrayBuffer;
        if (doc.file) arrayBuffer = await doc.file.arrayBuffer();
        else if (doc.blob) arrayBuffer = await doc.blob.arrayBuffer();
        else continue;

        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (const pageNum of pages) {
          processedPageCount++;
          const curPct = Math.round(10 + (processedPageCount / totalQuestionPages) * 75);
          setPercent(curPct);
          setStatus(`Processing Page ${pageNum} of ${doc.name} (${processedPageCount}/${totalQuestionPages})...`);
          updateBackgroundTask({
            statusText: `AI Swarm Scanning Page ${pageNum} of ${doc.name}`,
            percent: curPct,
          });

          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport } as any).promise;

          // Downscaled payload for Pass 1 AI bbox detection
          const pass1Canvas = document.createElement('canvas');
          const pass1Scale = Math.min(1.0, 1200 / canvas.width);
          pass1Canvas.width = canvas.width * pass1Scale;
          pass1Canvas.height = canvas.height * pass1Scale;
          const pass1Ctx = pass1Canvas.getContext('2d');
          if (pass1Ctx) {
            pass1Ctx.drawImage(canvas, 0, 0, pass1Canvas.width, pass1Canvas.height);
          }
          const base64Image = pass1Canvas.toDataURL('image/jpeg', 0.85);

          const res = await fetchWithGeminiFallback(
            '/api/extract-questions-pass1',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image: base64Image,
                pageIndex: pageNum,
                documentName: doc.name,
              }),
            },
            addToast,
            refreshUsageMetrics
          );

          if (!res.ok) continue;
          const data = await res.json();
          const detections: QuestionDetection[] = data.questions || [];

          // Perform high-res cropping for each detected bounding box
          for (const det of detections) {
            const [ymin, xmin, ymax, xmax] = det.box;
            const cropX = Math.round(xmin * canvas.width);
            const cropY = Math.round(ymin * canvas.height);
            const cropW = Math.max(20, Math.round((xmax - xmin) * canvas.width));
            const cropH = Math.max(20, Math.round((ymax - ymin) * canvas.height));

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cCtx = cropCanvas.getContext('2d');
            if (cCtx) {
              cCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              const cropBlob = await new Promise<Blob>((resolve) =>
                cropCanvas.toBlob((b) => resolve(b!), 'image/png')
              );

              // Determine subject & section mapping from blueprint ranges
              const qNo = det.qNo || 1;
              const matchedRange = blueprintRanges.find((r) => qNo >= r.fromQNo && qNo <= r.toQNo);
              const secName = matchedRange?.sectionName || 'Section 1';

              const imgFileName = buildImageFileName(secName, qNo, 1, 'png');
              const cropUrl = URL.createObjectURL(cropBlob);
              rawImageFilesMap.set(imgFileName, { blob: cropBlob, url: cropUrl, size: cropBlob.size });

              allDetectedQuestions.push({
                ...det,
                pageIndex: pageNum,
              });
            }
          }
        }
      }

      // Finalize CBT Question Paper Archive creation
      setStatus('Assembling CBT Question Paper Archive...');
      setPercent(90);

      const paperTitle = testTitle || (documents[0] ? documents[0].name.replace(/\.(pdf|zip)$/i, '') : 'CBT Question Paper');

      // Group detected questions by Subject -> Section
      const subjectMap = new Map<string, Map<string, any[]>>();

      allDetectedQuestions.forEach((det) => {
        const qNo = det.qNo || 1;
        const matchedRange = blueprintRanges.find((r) => qNo >= r.fromQNo && qNo <= r.toQNo);
        const subjName = matchedRange?.subjectName || 'General';
        const secName = matchedRange?.sectionName || 'Section 1';

        if (!subjectMap.has(subjName)) subjectMap.set(subjName, new Map());
        const secMap = subjectMap.get(subjName)!;
        if (!secMap.has(secName)) secMap.set(secName, []);
        secMap.get(secName)!.push(det);
      });

      // Fallback: If no ranges matched, use default 3-subject breakdown
      if (subjectMap.size === 0) {
        blueprintRanges.forEach((r) => {
          if (!subjectMap.has(r.subjectName)) subjectMap.set(r.subjectName, new Map());
          subjectMap.get(r.subjectName)!.set(r.sectionName, []);
        });
      }

      const builtSubjects: SubjectData[] = Array.from(subjectMap.entries()).map(([subjName, secMap]) => ({
        id: generateId(),
        name: subjName,
        sections: Array.from(secMap.entries()).map(([secName, qDets]) => ({
          id: generateId(),
          name: secName,
          questions: qDets
            .sort((a, b) => a.qNo - b.qNo)
            .map((det) => {
              const qNo = det.qNo || 1;
              const matchedRange = blueprintRanges.find((r) => qNo >= r.fromQNo && qNo <= r.toQNo);
              const imgFileName = buildImageFileName(secName, qNo, 1, 'png');

              return {
                id: generateId(),
                que: qNo,
                key: `q${qNo}`,
                type: (det.type || matchedRange?.type || 'mcq').toLowerCase() as QuestionType,
                answerOptions: 'A, B, C, D',
                correctAnswer: 'A',
                marks: matchedRange?.marks || { cm: 4, im: -1, pm: 0, max: 4 },
                images: [
                  {
                    id: generateId(),
                    partIndex: 1,
                    fileName: imgFileName,
                    blobUrl: rawImageFilesMap.get(imgFileName)?.url || '',
                    rawBlob: rawImageFilesMap.get(imgFileName)?.blob,
                    mimeType: 'image/png',
                    sizeBytes: rawImageFilesMap.get(imgFileName)?.size || 1024,
                  },
                ],
                pdfData: [
                  {
                    page: det.pageIndex || 1,
                    pageNumber: det.pageIndex || 1,
                    x1: det.box ? det.box[1] : 0,
                    y1: det.box ? det.box[0] : 0,
                    x2: det.box ? det.box[3] : 0,
                    y2: det.box ? det.box[2] : 0,
                    ymin: det.box ? det.box[0] : 0,
                    xmin: det.box ? det.box[1] : 0,
                    ymax: det.box ? det.box[2] : 0,
                    xmax: det.box ? det.box[3] : 0,
                    bounds: det.box ? [det.box[1], det.box[0], det.box[3] - det.box[1], det.box[2] - det.box[0]] : [0,0,0,0],
                    filename: imgFileName,
                  },
                ],
              };
            }),
        })),
      }));

      const newArchive: QuestionPaperArchive = {
        id: generateId(),
        fileName: `${paperTitle}.zip`,
        title: paperTitle,
        format: 'pdfCropper',
        subjects: builtSubjects,
        rawFiles: rawImageFilesMap,
        isDirty: true,
        lastModified: Date.now(),
        metadata: {
          testTitle: paperTitle,
          durationMinutes: Number(durationMinutes) || 180,
          totalMarks: Number(totalMarks) || 300,
          instructionMarkingSummary: instructionMarkingSummary,
        },
      };

      addArchive(newArchive, true);
      completeBackgroundTask(`Extracted ${allDetectedQuestions.length} Questions into ${builtSubjects.length} Subjects!`);
      addToast('CBT Paper Created!', `Successfully ingested paper with ${allDetectedQuestions.length} questions.`, 'success');

      setUnifiedAiIngestionModalOpen(false);
    } catch (err: any) {
      console.error('[Unified AI Ingestion] Extraction error:', err);
      setError('Extraction failed: ' + err.message);
      addToast('Extraction Failed', err.message || 'Error running question extractor.', 'error');
    } finally {
      setIsProcessingAi(false);
    }
  };

  if (!isUnifiedAiIngestionModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-7xl h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files) handleAddFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          accept=".pdf,.zip"
          multiple
          className="hidden"
        />

        {/* Modal Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 flex items-center justify-center shadow-md shadow-indigo-950">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Open Multi-PDF Studio & CBT Test Creator
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                  All-in-One Multi-Doc Suite
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ingest PDF question papers, assign page roles, configure blueprint ranges & launch AMAS Swarm Fleet
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add PDF / ZIP</span>
            </button>
            <button
              onClick={() => setUnifiedAiIngestionModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Suite Primary Navigation Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-slate-950/80 border-b border-slate-800 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'documents'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Documents & Page Roles ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('blueprint')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'blueprint'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Blueprint Ranges & Marking ({blueprintRanges.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('amas_swarm')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'amas_swarm'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AMAS Swarm Fleet ({allocatedFleet.workers.length} Workers)</span>
          </button>

          <button
            onClick={() => setActiveTab('extraction')}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'extraction'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Execution Deck & Live Stream</span>
          </button>
        </div>

        {/* Aggregated Role Overview Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 sm:px-6 py-2 bg-slate-950/40 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-indigo-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-medium">Instructions:</span>
            <span className="font-bold ml-auto">{aggregateStats.blueprintCount} pgs</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium">Questions:</span>
            <span className="font-bold ml-auto">{aggregateStats.questionCount} pgs</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-300">
            <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-medium">Answer Keys:</span>
            <span className="font-bold ml-auto">{aggregateStats.answerKeyCount} pgs</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-950/40 border border-purple-800/40 text-purple-300">
            <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="font-medium">Solutions:</span>
            <span className="font-bold ml-auto">{aggregateStats.solutionCount} pgs</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="font-medium">Skip:</span>
            <span className="font-bold ml-auto">{aggregateStats.skipCount} pgs</span>
          </div>
        </div>

        {/* Main Work Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* TAB 1: DOCUMENTS & PAGE ROLE ASSIGNMENT */}
          {activeTab === 'documents' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Document Deck & Page Role Assignment Matrix */}
              <div className="w-full lg:w-3/5 flex flex-col border-r border-slate-800 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Ingested Documents ({documents.length})</span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Select document to map page roles
                    </span>
                  </div>

                  {documents.length === 0 ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                        isDragOver
                          ? 'border-indigo-500 bg-indigo-950/30'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
                      }`}
                    >
                      <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                      <div className="text-sm font-bold text-white">
                        Drop PDF Question Papers, Answer Keys, or ZIP Bundles Here
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Supports multiple files simultaneously (e.g. Doc 1 for Questions, Doc 2 for Answer Keys)
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {documents.map((doc) => {
                        const isSelected = activeDoc?.id === doc.id;
                        const keyPages = getPagesForRole(doc, 'answer_key').length;
                        const blueprintPages = getPagesForRole(doc, 'blueprint').length;
                        const questionPages = getPagesForRole(doc, 'questions').length;

                        return (
                          <div
                            key={doc.id}
                            onClick={() => {
                              setActiveDocId(doc.id);
                              setPreviewPage(1);
                            }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                              isSelected
                                ? 'bg-indigo-950/30 border-indigo-500 shadow-md shadow-indigo-950/50 ring-1 ring-indigo-500/50'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                                  <FileText className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-white truncate" title={doc.name}>
                                    {doc.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    <span className="font-semibold text-slate-300">
                                      {doc.totalPages} Pages
                                    </span>
                                    <span>•</span>
                                    <span>{(doc.size / (1024 * 1024)).toFixed(2)} MB</span>
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveDoc(doc.id);
                                }}
                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                title="Remove document"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/60 text-[10px]">
                              {blueprintPages > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                                  {blueprintPages} BP
                                </span>
                              )}
                              {questionPages > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                                  {questionPages} Qs
                                </span>
                              )}
                              {keyPages > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                                  {keyPages} Keys
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeDoc && (
                  <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Configuring:</span>
                          <span className="text-indigo-400 underline">{activeDoc.name}</span>
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Assign roles to pages by typing ranges below or clicking the page chips.
                        </span>
                      </div>

                      {/* Brush Role Selector */}
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                        <span className="text-[10px] text-slate-400 px-1 font-semibold uppercase">
                          Brush:
                        </span>
                        {(
                          [
                            { role: 'questions', label: 'Questions', color: 'bg-emerald-600 text-white' },
                            { role: 'blueprint', label: 'Blueprint', color: 'bg-indigo-600 text-white' },
                            { role: 'answer_key', label: 'Key', color: 'bg-amber-500 text-slate-950' },
                            { role: 'solution', label: 'Solution', color: 'bg-purple-600 text-white' },
                            { role: 'skip', label: 'Skip', color: 'bg-slate-700 text-slate-200' },
                          ] as const
                        ).map((b) => (
                          <button
                            key={b.role}
                            onClick={() => setActiveBrushRole(b.role)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                              activeBrushRole === b.role ? b.color + ' shadow-sm scale-105' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Range Inputs using RangeTextInput component (Fixes keystroke stripping bug!) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Blueprint Ranges */}
                      <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-indigo-400" />
                            <span>Instructions / Blueprint Pages</span>
                          </span>
                          <span className="text-[10px] text-slate-500">e.g. 1-2, 8</span>
                        </div>
                        <RangeTextInput
                          value={pagesToRangeString(getPagesForRole(activeDoc, 'blueprint'))}
                          onChange={(val) => handleUpdateRoleRange(activeDoc.id, 'blueprint', val)}
                          placeholder="e.g. 1-2, 8"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Question Extraction Ranges */}
                      <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-emerald-300 font-semibold text-[11px]">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-emerald-400" />
                            <span>Question Extraction Pages</span>
                          </span>
                          <span className="text-[10px] text-slate-500">e.g. 3-18</span>
                        </div>
                        <RangeTextInput
                          value={pagesToRangeString(getPagesForRole(activeDoc, 'questions'))}
                          onChange={(val) => handleUpdateRoleRange(activeDoc.id, 'questions', val)}
                          placeholder="e.g. 3-18"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Answer Key Ranges */}
                      <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-amber-300 font-semibold text-[11px]">
                          <span className="flex items-center gap-1">
                            <Key className="w-3 h-3 text-amber-400" />
                            <span>Answer Key Pages</span>
                          </span>
                          <span className="text-[10px] text-slate-500">e.g. 4-5, 19</span>
                        </div>
                        <RangeTextInput
                          value={pagesToRangeString(getPagesForRole(activeDoc, 'answer_key'))}
                          onChange={(val) => handleUpdateRoleRange(activeDoc.id, 'answer_key', val)}
                          placeholder="e.g. 4-5, 19"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Solution Ranges */}
                      <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-purple-300 font-semibold text-[11px]">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-purple-400" />
                            <span>Solution / Explanation Pages</span>
                          </span>
                          <span className="text-[10px] text-slate-500">e.g. 6-12</span>
                        </div>
                        <RangeTextInput
                          value={pagesToRangeString(getPagesForRole(activeDoc, 'solution'))}
                          onChange={(val) => handleUpdateRoleRange(activeDoc.id, 'solution', val)}
                          placeholder="e.g. 6-12"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>

                    {/* Interactive Visual Page Chips Grid */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">
                          Click any page chip to apply current brush ({activeBrushRole}) or preview page:
                        </span>
                        <div className="flex items-center gap-1 text-[11px]">
                          <button
                            onClick={() => handleBatchMarkActiveDoc('questions')}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 border border-slate-800"
                          >
                            All Questions
                          </button>
                          <button
                            onClick={() => handleBatchMarkActiveDoc('answer_key')}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-amber-300 border border-slate-800"
                          >
                            All Keys
                          </button>
                          <button
                            onClick={() => handleBatchMarkActiveDoc('skip')}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-rose-300 border border-slate-800"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                        {Array.from({ length: activeDoc.totalPages || 1 }, (_, i) => i + 1).map((pageNum) => {
                          const role = activeDoc.pageAssignments[pageNum] || 'skip';
                          const isPreviewing = previewPage === pageNum;

                          let roleBadgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
                          if (role === 'blueprint') {
                            roleBadgeColor = 'bg-indigo-950 text-indigo-300 border-indigo-500 font-bold';
                          } else if (role === 'questions') {
                            roleBadgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold';
                          } else if (role === 'answer_key') {
                            roleBadgeColor = 'bg-amber-950 text-amber-300 border-amber-500 font-black';
                          } else if (role === 'solution') {
                            roleBadgeColor = 'bg-purple-950 text-purple-300 border-purple-500 font-bold';
                          }

                          return (
                            <div
                              key={pageNum}
                              onClick={() => {
                                setPreviewPage(pageNum);
                                handleTogglePageRole(activeDoc.id, pageNum);
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${roleBadgeColor} ${
                                isPreviewing ? 'ring-2 ring-white scale-105' : 'hover:opacity-80'
                              }`}
                              title={`Page ${pageNum} • Role: ${role} • Click to assign ${activeBrushRole}`}
                            >
                              <span className="font-mono">{pageNum}</span>
                              <span className="text-[10px] uppercase opacity-75">
                                {role === 'blueprint'
                                  ? 'BP'
                                  : role === 'questions'
                                  ? 'Q'
                                  : role === 'answer_key'
                                  ? 'KEY'
                                  : role === 'solution'
                                  ? 'SOL'
                                  : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live PDF Page Previewer */}
              <div className="hidden lg:flex lg:w-2/5 flex-col bg-slate-950 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0 text-xs">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-bold text-white">
                      Preview: Page {previewPage} / {activeDoc?.totalPages || 1}
                    </span>
                    {activeDoc && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                          activeDoc.pageAssignments[previewPage] === 'answer_key'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : activeDoc.pageAssignments[previewPage] === 'blueprint'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : activeDoc.pageAssignments[previewPage] === 'questions'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {activeDoc.pageAssignments[previewPage] || 'Unassigned'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[11px] text-slate-300 w-10 text-center">
                      {Math.round(scale * 100)}%
                    </span>
                    <button
                      onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/90 relative">
                  {isRenderingPage && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    </div>
                  )}

                  {activeDoc ? (
                    <div className="relative inline-block shadow-2xl border border-slate-800 rounded-lg overflow-hidden my-auto">
                      <canvas ref={canvasRef} className="block rounded-lg shadow-xl" />
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 text-xs">
                      No document loaded for preview
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BLUEPRINT & MARKING SCHEMES */}
          {activeTab === 'blueprint' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-950">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span>Test Blueprint Presets & Section Ranges</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define subject question ranges (e.g., Physics Q1-8, Chemistry Q9-16, Maths Q17-24) or scan instructions page with AI
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleScanInstructionsAi}
                    disabled={isScanningInstructions || !activeDoc}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-950 disabled:opacity-50"
                  >
                    {isScanningInstructions ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>Scan Instructions (AI)</span>
                  </button>

                  <button
                    onClick={handleAddRange}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Range</span>
                  </button>
                </div>
              </div>

              {/* Preset Cards Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRESET_TEMPLATES.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset.id)}
                    className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-xl cursor-pointer transition-all shadow-md group"
                  >
                    <div className="font-bold text-xs text-white group-hover:text-purple-300 flex items-center justify-between">
                      <span>{preset.name}</span>
                      <Zap className="w-3.5 h-3.5 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{preset.desc}</div>
                  </div>
                ))}
              </div>

              {/* Range Editor Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                      <th className="p-3">Subject Name</th>
                      <th className="p-3">Section Name</th>
                      <th className="p-3">From Q#</th>
                      <th className="p-3">To Q#</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-center">Marking (+/-)</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {blueprintRanges.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-950/40 transition-colors">
                        <td className="p-3">
                          <input
                            type="text"
                            value={r.subjectName}
                            onChange={(e) => handleUpdateRange(r.id, { subjectName: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={r.sectionName}
                            onChange={(e) => handleUpdateRange(r.id, { sectionName: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={r.fromQNo}
                            onChange={(e) => handleUpdateRange(r.id, { fromQNo: Number(e.target.value) || 1 })}
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white text-center focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={r.toQNo}
                            onChange={(e) => handleUpdateRange(r.id, { toQNo: Number(e.target.value) || 1 })}
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white text-center focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <select
                            value={r.type}
                            onChange={(e) => handleUpdateRange(r.id, { type: e.target.value as QuestionType })}
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase focus:outline-none"
                          >
                            <option value="mcq">MCQ</option>
                            <option value="nat">NAT</option>
                            <option value="msq">MSQ</option>
                            <option value="msm">MSM</option>
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={r.marks.cm}
                              onChange={(e) =>
                                handleUpdateRange(r.id, { marks: { ...r.marks, cm: Number(e.target.value) || 4 } })
                              }
                              className="w-10 bg-slate-950 border border-slate-800 rounded px-1 py-1 text-xs text-emerald-400 text-center font-bold"
                              title="Correct Marks"
                            />
                            <span className="text-slate-600">/</span>
                            <input
                              type="number"
                              value={r.marks.im}
                              onChange={(e) =>
                                handleUpdateRange(r.id, { marks: { ...r.marks, im: Number(e.target.value) || 0 } })
                              }
                              className="w-10 bg-slate-950 border border-slate-800 rounded px-1 py-1 text-xs text-rose-400 text-center font-bold"
                              title="Incorrect Marks"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteRange(r.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800"
                            title="Delete Range"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: AMAS SWARM FLEET & SETTINGS */}
          {activeTab === 'amas_swarm' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-950">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>AMAS Swarm Fleet Strategy & Execution Parameters</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Configure parallel worker count, verification auditor pass, and deduplication task cache
                  </p>
                </div>
              </div>

              {/* Fleet Strategy Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { id: 'autopilot', name: 'Autopilot', desc: 'Dynamic AMAS allocation based on page count', icon: Cpu, color: 'text-indigo-400' },
                  { id: 'quality_first', name: 'Quality First', desc: 'Maximum validation & auditor double-pass', icon: ShieldCheck, color: 'text-emerald-400' },
                  { id: 'speed_priority', name: 'Speed Priority', desc: 'Max parallel workers for fast turnaround', icon: Zap, color: 'text-amber-400' },
                  { id: 'custom', name: 'Custom Swarm', desc: 'Manually specify worker & auditor counts', icon: Sliders, color: 'text-purple-400' },
                ].map((strat) => {
                  const Icon = strat.icon;
                  const isSelected = fleetStrategy === strat.id;

                  return (
                    <div
                      key={strat.id}
                      onClick={() => setFleetStrategy(strat.id as FleetStrategy)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-5 h-5 ${strat.color}`} />
                          {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <div className="font-bold text-xs text-white">{strat.name}</div>
                        <div className="text-[11px] text-slate-400 mt-1">{strat.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Fleet Allocation Details */}
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Active Fleet Capacity ({allocatedFleet.workers.length} Workers • {allocatedFleet.auditors.length} Auditors)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Parallel Extractor Workers:</span>
                    <span className="font-bold font-mono text-emerald-400">{allocatedFleet.workers.length}</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Validation Auditors:</span>
                    <span className="font-bold font-mono text-purple-400">{allocatedFleet.auditors.length}</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Orchestrator Managers:</span>
                    <span className="font-bold font-mono text-indigo-400">{allocatedFleet.manager ? 1 : 0}</span>
                  </div>
                </div>

                {fleetStrategy === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Worker Count: {customWorkers}
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={customWorkers}
                        onChange={(e) => setCustomWorkers(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Auditor Count: {customAuditors}
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        value={customAuditors}
                        onChange={(e) => setCustomAuditors(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Checkpoint Restoration Banner */}
              {existingCheckpoint && (
                <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-amber-200">
                        Conversion Checkpoint Available ({existingCheckpoint.completedPages.length} Pages Done)
                      </div>
                      <div className="text-[11px] text-amber-300/80 mt-0.5">
                        Resume from where you left off or start fresh from page 1.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResumeFromCheckpoint}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition-colors"
                    >
                      Resume Progress
                    </button>
                    <button
                      onClick={handleDiscardCheckpoint}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EXECUTION DECK & LIVE STREAM */}
          {activeTab === 'extraction' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-950 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Real-Time AI Extraction Stream & Progress Deck</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Monitor multimodal vision OCR scanning, bounding box cropping, and CBT question generation
                  </p>
                </div>

                {isProcessingAi ? (
                  <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-indigo-950">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-white">{status || 'Processing Question Pages...'}</h4>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        {progressDetail || `Active Fleet: ${allocatedFleet.workers.length} Parallel Extractor Workers`}
                      </p>
                    </div>

                    <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
                      <div
                        style={{ width: `${percent}%` }}
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 rounded-full transition-all duration-300"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                      <span>Completed: {percent}%</span>
                      <span>AMAS Layer 1 Scout: Active</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/40">
                    <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-white">Ready for Question Extraction</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                      Ready to process {aggregateStats.questionCount} question pages across {documents.length} document(s).
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  onClick={handleRunFullQuestionExtraction}
                  disabled={isProcessingAi || aggregateStats.questionCount === 0}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 hover:from-indigo-500 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow-xl shadow-indigo-950 flex items-center gap-2 disabled:opacity-50"
                >
                  {isProcessingAi ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-amber-200" />
                  )}
                  <span>Launch Question Extractor & Create CBT Paper</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer Execution Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-slate-950 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer text-slate-300 hover:text-white">
              <input
                type="checkbox"
                checked={enableDoublePassRescan}
                onChange={(e) => setEnableDoublePassRescan(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-500"
              />
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Double-Pass Verification Rescan</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunAnswerKeyExtraction}
              disabled={isProcessingAi || aggregateStats.answerKeyCount === 0}
              className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              title="Extract answer keys from all assigned Answer Key pages"
            >
              <Key className="w-4 h-4 text-amber-400" />
              <span>Extract Answer Key ({aggregateStats.answerKeyCount} pgs)</span>
            </button>

            <button
              onClick={() => setActiveTab('blueprint')}
              className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-purple-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
            >
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span>Blueprint Ranges ({blueprintRanges.length})</span>
            </button>

            <button
              onClick={handleRunFullQuestionExtraction}
              disabled={isProcessingAi || aggregateStats.questionCount === 0}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-950 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Launch Question Cropper ({aggregateStats.questionCount} pgs)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
