import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import {
  BoxCoord,
  CropperMode,
  ViewMode,
  ColumnSnapMode,
  ManualCroppedPart,
  ManualCroppedQuestion,
  CropperSessionDraft,
} from '../types/manualCropper';
import {
  saveCropperSessionDraft,
  loadCropperSessionDraft,
  clearCropperSessionDraft,
  exportCoordinatesJson,
  importCoordinatesJson,
  sanitizeBox,
} from '../utils/manualCropperSession';
import {
  detectContentBoundsInCanvas,
  renderCropBoxToBlob,
  stitchBlobsVertically,
  getTextInBoxFromPdfPage,
} from '../utils/cropperImageUtils';
import { ManualCropperHelpAccordions } from './manualCropper/ManualCropperHelpAccordions';
import { BottomQuestionTimeline } from './manualCropper/BottomQuestionTimeline';
import { LiveCroppedPreviewModal } from './manualCropper/LiveCroppedPreviewModal';
import { PrecisionLoupe } from './manualCropper/PrecisionLoupe';
import { BatchProcessingProgressModal } from './manualCropper/BatchProcessingProgressModal';
import { MARKING_PRESETS } from '../utils/constants';
import { MarksScheme, QuestionData, SectionData, SubjectData } from '../types/cbt';
import {
  Crop,
  X,
  UploadCloud,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Layers,
  Scissors,
  Split,
  Plus,
  RefreshCw,
  Eye,
  Sliders,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  HelpCircle,
  Columns,
  Undo2,
  Redo2,
  Download,
  Settings,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FolderOpen,
  Trash2,
  Copy,
  Info,
  Scan,
  Wand2,
  Crosshair,
} from 'lucide-react';

export function extractBoxFromPdfDataPart(part: any): BoxCoord | null {
  if (!part) return null;
  return sanitizeBox(part);
}

function uid(): string {
  return 'cbt-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
}

export const PdfRecropModal: React.FC = () => {
  const {
    isPdfRecropModalOpen,
    closePdfRecrop,
    recropTarget,
    archives,
    activeArchiveId,
    applyCroppedImage,
    addArchive,
    addToast,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // PDF Document & Page State
  const [pdfFile, setPdfFile] = useState<File | Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageThumbnails, setPageThumbnails] = useState<{ url: string; page: number }[]>([]);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState<boolean>(false);
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [renderingPage, setRenderingPage] = useState<boolean>(false);

  // Modes & View (Pattern mode completely removed)
  const [cropperMode, setCropperMode] = useState<CropperMode>('box');
  const [viewMode, setViewMode] = useState<ViewMode>('crop');
  const [columnSnap, setColumnSnap] = useState<ColumnSnapMode>('auto');

  // Canvas Viewport & Pan/Zoom
  const [scale, setScale] = useState<number>(1.5);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Cropping Boxes
  const [boxA, setBoxA] = useState<BoxCoord>({ ymin: 0.1, xmin: 0.05, ymax: 0.4, xmax: 0.95 });
  const [boxB, setBoxB] = useState<BoxCoord | null>(null);
  const [pageB, setPageB] = useState<number>(1);
  const [activePartIndex, setActivePartIndex] = useState<1 | 2>(1);
  const [isMultiPart, setIsMultiPart] = useState<boolean>(false);
  const [stitchGap, setStitchGap] = useState<number>(12);

  // Line Cropper state
  const [lineCropperStep, setLineCropperStep] = useState<'idle' | 'top_set'>('idle');
  const [lineTopY, setLineTopY] = useState<number>(0);
  const [hoverY, setHoverY] = useState<number | null>(null);

  // Precision Loupe Magnifier State
  const [loupeVisible, setLoupeVisible] = useState<boolean>(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [loupeLabel, setLoupeLabel] = useState<string>('2.5x Loupe');

  // Text layer peek
  const [peekedText, setPeekedText] = useState<string>('');
  const [isPeekingText, setIsPeekingText] = useState<boolean>(false);

  // Mouse Dragging for Box Cropper
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialBox, setInitialBox] = useState<BoxCoord>({ ymin: 0, xmin: 0, ymax: 0, xmax: 0 });

  // Question Details Form (starts clean for user to define!)
  const [subjectName, setSubjectName] = useState<string>('');
  const [sectionName, setSectionName] = useState<string>('');
  const [questionNumber, setQuestionNumber] = useState<number | ''>('');
  const [questionType, setQuestionType] = useState<'mcq' | 'msq' | 'nat' | 'msm'>('mcq');
  const [answerOptions, setAnswerOptions] = useState<string>('4');
  const [autoIncrementQNo, setAutoIncrementQNo] = useState<boolean>(true);

  // Marking Scheme with JEE Advanced Tiered Partial Marking
  const [marksScheme, setMarksScheme] = useState<MarksScheme>({
    cm: 4,
    im: -1,
    pm: 0,
    max: 4,
    partialTiers: { threeCorrect: 3, twoCorrect: 2, oneCorrect: 1 },
    schemeType: 'jee_main',
  });

  // Collapsible Accordions on Left Panel
  const [isQuestionDetailsOpen, setIsQuestionDetailsOpen] = useState<boolean>(true);
  const [isMarkingSchemeOpen, setIsMarkingSchemeOpen] = useState<boolean>(false);
  const [isCoordinatesOpen, setIsCoordinatesOpen] = useState<boolean>(false);

  // Cropped Questions Collection & History
  const [croppedQuestions, setCroppedQuestions] = useState<ManualCroppedQuestion[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [historyPast, setHistoryPast] = useState<ManualCroppedQuestion[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<ManualCroppedQuestion[][]>([]);

  // Live Previews & Enhancements
  const [autoWhiten, setAutoWhiten] = useState<boolean>(true);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);

  // Batch Export Modal State (for smooth 100+ question exports)
  const [batchProgress, setBatchProgress] = useState<{
    isOpen: boolean;
    total: number;
    completed: number;
    currentTask: string;
  }>({
    isOpen: false,
    total: 0,
    completed: 0,
    currentTask: '',
  });

  // Autocomplete Suggestions
  const subjectSuggestions = useMemo(() => {
    const set = new Set<string>(['Physics', 'Chemistry', 'Mathematics', 'Biology']);
    croppedQuestions.forEach((q) => {
      if (q.subject) set.add(q.subject);
    });
    if (activeArchive) {
      activeArchive.subjects.forEach((s) => set.add(s.name));
    }
    return Array.from(set);
  }, [croppedQuestions, activeArchive]);

  const sectionSuggestions = useMemo(() => {
    const set = new Set<string>([
      'Section 1 (MCQ)',
      'Section 2 (MSQ)',
      'Section 3 (NAT)',
      'Section 1',
      'Section 2',
    ]);
    croppedQuestions.forEach((q) => {
      if (q.section) set.add(q.section);
    });
    if (activeArchive) {
      activeArchive.subjects.forEach((s) => s.sections.forEach((sec) => set.add(sec.name)));
    }
    return Array.from(set);
  }, [croppedQuestions, activeArchive]);

  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfPageObjRef = useRef<any>(null);
  const currentRenderTaskRef = useRef<any>(null);

  // Check if active target is from parent Question Editor
  const isTargetRecrop = Boolean(recropTarget && recropTarget.questionId);

  // Populate active target when opened
  useEffect(() => {
    if (recropTarget && activeArchive) {
      let foundQ: QuestionData | undefined;
      let foundSub: SubjectData | undefined;
      let foundSec: SectionData | undefined;

      for (const s of activeArchive.subjects) {
        for (const sec of s.sections) {
          const q = sec.questions.find((item) => item.id === recropTarget.questionId);
          if (q) {
            foundQ = q;
            foundSub = s;
            foundSec = sec;
            break;
          }
        }
        if (foundQ) break;
      }

      if (foundQ) {
        setSubjectName(foundSub?.name || '');
        setSectionName(foundSec?.name || '');
        setQuestionNumber(foundQ.que);
        setQuestionType(foundQ.type || 'mcq');
        setAnswerOptions(foundQ.answerOptions || '4');
        if (foundQ.marks) setMarksScheme(foundQ.marks);

        const pIdx = recropTarget.partIndex || 1;
        if (pIdx === 2) {
          setIsMultiPart(true);
          setActivePartIndex(2);
        } else {
          setActivePartIndex(1);
        }

        const dataPart = foundQ.pdfData?.[pIdx - 1];
        if (dataPart) {
          const parsedBox = extractBoxFromPdfDataPart(dataPart);
          if (parsedBox) {
            if (pIdx === 2) {
              setBoxB(parsedBox);
              if (dataPart.page) setPageB(dataPart.page);
            } else {
              setBoxA(parsedBox);
              if (dataPart.page) setCurrentPage(dataPart.page);
            }
          }
        }
      }
    }
  }, [recropTarget, activeArchive]);

  // Load PDF file
  const handlePdfUpload = async (file: File) => {
    setLoadingDoc(true);
    setPdfFile(file);
    setPdfFileName(file.name);

    try {
      const pdfjsLib = await getPdfjsLib();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const loadedDoc = await loadingTask.promise;

      setPdfDoc(loadedDoc);
      setTotalPages(loadedDoc.numPages);
      setCurrentPage(1);

      // Check for saved local draft
      const draft = loadCropperSessionDraft();
      if (draft && draft.pdfFileName === file.name && draft.questions.length > 0) {
        setCroppedQuestions(draft.questions as any);
        if (draft.lastPage) setCurrentPage(draft.lastPage);
        if (draft.lastSubject) setSubjectName(draft.lastSubject);
        if (draft.lastSection) setSectionName(draft.lastSection);
        if (draft.lastType) setQuestionType(draft.lastType);
        if (draft.lastMarks) setMarksScheme(draft.lastMarks);
        addToast({
          title: 'Session Restored',
          description: `Restored session draft with ${draft.questions.length} cropped questions.`,
          type: 'info',
        });
      }

      addToast({
        title: 'PDF Loaded',
        description: `Loaded "${file.name}" (${loadedDoc.numPages} pages)`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error loading PDF:', err);
      addToast({
        title: 'Load Failed',
        description: `Failed to load PDF: ${err.message || 'Corrupted file'}`,
        type: 'error',
      });
    } finally {
      setLoadingDoc(false);
    }
  };

  // Render PDF page onto canvas with clean task cancellation for 100+ page PDFs
  const renderPdfPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      // Cancel any ongoing render task immediately to prevent lag / collision
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation errors
        }
      }

      setRenderingPage(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        pdfPageObjRef.current = page;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const viewport = page.getViewport({ scale: scale * 1.5 }); // render high-res
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        currentRenderTaskRef.current = renderTask;

        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      } finally {
        setRenderingPage(false);
      }
    },
    [pdfDoc, scale]
  );

  useEffect(() => {
    if (pdfDoc) {
      renderPdfPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale, renderPdfPage]);

  // Current active box pointer
  const activeBox = activePartIndex === 2 && boxB ? boxB : boxA;
  const setActiveBox = (newBox: BoxCoord) => {
    if (activePartIndex === 2) {
      setBoxB(newBox);
    } else {
      setBoxA(newBox);
    }
  };

  // Smart Whitespace Auto-Trim
  const handleSmartTrim = () => {
    if (!canvasRef.current) return;
    const trimmed = detectContentBoundsInCanvas(canvasRef.current, activeBox);
    setActiveBox(trimmed);
    addToast({
      title: 'Smart Trim Applied',
      description: 'Snapped bounding box to content borders.',
      type: 'success',
    });
  };

  // Instant Text Layer Peek
  const handlePeekText = async () => {
    if (!pdfPageObjRef.current) return;
    setIsPeekingText(true);
    try {
      const text = await getTextInBoxFromPdfPage(pdfPageObjRef.current, activeBox);
      setPeekedText(text);

      // Auto-detect question number if starts with "Q." or "1." or "Question"
      const matchQ = text.match(/(?:question|q\.?|que\.?)\s*(\d+)/i) || text.match(/^(\d+)[.\s)]/);
      if (matchQ && matchQ[1]) {
        const detectedQ = parseInt(matchQ[1], 10);
        if (!isNaN(detectedQ)) {
          setQuestionNumber(detectedQ);
          addToast({
            title: 'Number Detected',
            description: `Detected Q#${detectedQ} in box text snippet.`,
            type: 'info',
          });
        }
      }
    } catch {
      setPeekedText('');
    } finally {
      setIsPeekingText(false);
    }
  };

  // Column Snapping Logic
  const applyColumnSnap = (mode: ColumnSnapMode) => {
    setColumnSnap(mode);
    if (mode === 'left') {
      setActiveBox({ ...activeBox, xmin: 0.04, xmax: 0.49 });
    } else if (mode === 'right') {
      setActiveBox({ ...activeBox, xmin: 0.51, xmax: 0.96 });
    } else if (mode === 'full') {
      setActiveBox({ ...activeBox, xmin: 0.04, xmax: 0.96 });
    }
  };

  // Preset marking scheme applier
  const handleApplyPreset = (presetId: string) => {
    const preset = MARKING_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setMarksScheme(preset.marks);
      setQuestionType(preset.type);
      addToast({
        title: 'Preset Applied',
        description: `Applied ${preset.name}`,
        type: 'info',
      });
    }
  };

  // Record history state for Undo/Redo
  const pushHistory = (newQuestions: ManualCroppedQuestion[]) => {
    setHistoryPast((prev) => [...prev.slice(-20), croppedQuestions]);
    setHistoryFuture([]);
    setCroppedQuestions(newQuestions);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryFuture((prev) => [croppedQuestions, ...prev]);
    setHistoryPast((prev) => prev.slice(0, -1));
    setCroppedQuestions(previous);
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryPast((prev) => [...prev, croppedQuestions]);
    setHistoryFuture((prev) => prev.slice(1));
    setCroppedQuestions(next);
  };

  // Save/Update Question in collection
  const handleSaveQuestion = async () => {
    if (!canvasRef.current) return;

    try {
      const part1Blob = await renderCropBoxToBlob(canvasRef.current, boxA, { autoWhiten });
      const part1Url = URL.createObjectURL(part1Blob);

      const parts: ManualCroppedPart[] = [
        {
          id: uid(),
          partIndex: 1,
          page: currentPage,
          box: boxA,
          blob: part1Blob,
          previewUrl: part1Url,
        },
      ];

      let stitchedBlob: Blob = part1Blob;
      let stitchedUrl: string = part1Url;

      if (isMultiPart && boxB) {
        let part2Blob: Blob;
        if (pageB === currentPage) {
          part2Blob = await renderCropBoxToBlob(canvasRef.current, boxB, { autoWhiten });
        } else if (pdfDoc) {
          // Render page B on offscreen canvas
          const pageBObj = await pdfDoc.getPage(pageB);
          const offCanvas = document.createElement('canvas');
          const offCtx = offCanvas.getContext('2d');
          const viewport = pageBObj.getViewport({ scale: scale * 1.5 });
          offCanvas.width = viewport.width;
          offCanvas.height = viewport.height;
          await pageBObj.render({ canvasContext: offCtx, viewport }).promise;
          part2Blob = await renderCropBoxToBlob(offCanvas, boxB, { autoWhiten });
        } else {
          part2Blob = part1Blob;
        }

        const part2Url = URL.createObjectURL(part2Blob);
        parts.push({
          id: uid(),
          partIndex: 2,
          page: pageB,
          box: boxB,
          blob: part2Blob,
          previewUrl: part2Url,
        });

        const stitched = await stitchBlobsVertically([part1Blob, part2Blob], stitchGap);
        stitchedBlob = stitched.blob;
        stitchedUrl = stitched.url;
      }

      const qNo = typeof questionNumber === 'number' && questionNumber > 0 ? questionNumber : croppedQuestions.length + 1;

      const newQ: ManualCroppedQuestion = {
        id: editingQuestionId || uid(),
        que: qNo,
        subject: subjectName || 'Subject 1',
        section: sectionName || 'Section 1',
        type: questionType,
        answerOptions: answerOptions || '4',
        marks: marksScheme,
        parts,
        stitchedPreviewUrl: stitchedUrl,
        stitchedBlob,
        createdAt: Date.now(),
      };

      let updatedList: ManualCroppedQuestion[];
      if (editingQuestionId) {
        updatedList = croppedQuestions.map((q) => (q.id === editingQuestionId ? newQ : q));
        setEditingQuestionId(null);
        addToast({
          title: 'Question Updated',
          description: `Updated Question #${qNo}`,
          type: 'success',
        });
      } else {
        updatedList = [...croppedQuestions, newQ];
        addToast({
          title: 'Question Saved',
          description: `Saved Question #${qNo}`,
          type: 'success',
        });
      }

      pushHistory(updatedList);

      // Auto-increment question number for fast sequential scanning
      if (autoIncrementQNo) {
        setQuestionNumber(qNo + 1);
      }

      // Reset Box B for next crop
      setIsMultiPart(false);
      setBoxB(null);
      setActivePartIndex(1);
    } catch (err: any) {
      console.error('Failed to save crop:', err);
      addToast({
        title: 'Save Failed',
        description: `Failed to save crop: ${err.message}`,
        type: 'error',
      });
    }
  };

  // Direct Apply to Active Recrop Target
  const handleApplyToActiveTarget = async () => {
    if (!recropTarget || !canvasRef.current) return;

    try {
      const activePartBox = activePartIndex === 2 && boxB ? boxB : boxA;
      const croppedBlob = await renderCropBoxToBlob(canvasRef.current, activePartBox, { autoWhiten });

      await applyCroppedImage({
        questionId: recropTarget.questionId,
        partIndex: recropTarget.partIndex,
        mode: recropTarget.mode || 'replace_part',
        blob: croppedBlob,
        sectionId: recropTarget.sectionId,
        subjectId: recropTarget.subjectId,
        newQuestionProps: {
          que: typeof questionNumber === 'number' ? questionNumber : undefined,
          type: questionType,
          answerOptions: answerOptions,
          marks: marksScheme,
        },
        pdfCoords: {
          page: currentPage,
          x1: activePartBox.xmin,
          y1: activePartBox.ymin,
          x2: activePartBox.xmax,
          y2: activePartBox.ymax,
        },
      });

      addToast({
        title: 'Crop Applied',
        description: `Applied crop directly to question.`,
        type: 'success',
      });

      closePdfRecrop();
    } catch (err: any) {
      console.error('Failed to apply recrop:', err);
      addToast({
        title: 'Apply Failed',
        description: `Failed to apply recrop: ${err.message}`,
        type: 'error',
      });
    }
  };

  // Export All Cropped Questions into CBT Archive (Async Batch processing for 100+ questions)
  const handleExportAllToArchive = async () => {
    if (croppedQuestions.length === 0) {
      addToast({
        title: 'No Questions',
        description: 'No questions have been cropped yet.',
        type: 'error',
      });
      return;
    }

    setBatchProgress({
      isOpen: true,
      total: croppedQuestions.length,
      completed: 0,
      currentTask: 'Organizing subjects & sections...',
    });

    try {
      // Group questions by Subject -> Section
      const subjectsMap = new Map<string, Map<string, ManualCroppedQuestion[]>>();

      for (const q of croppedQuestions) {
        const subName = q.subject || 'Default Subject';
        const secName = q.section || 'Default Section';

        if (!subjectsMap.has(subName)) {
          subjectsMap.set(subName, new Map());
        }
        const secMap = subjectsMap.get(subName)!;
        if (!secMap.has(secName)) {
          secMap.set(secName, []);
        }
        secMap.get(secName)!.push(q);
      }

      const subjects: SubjectData[] = [];
      let processedCount = 0;

      for (const [subName, secMap] of subjectsMap.entries()) {
        const sections: SectionData[] = [];

        for (const [secName, qList] of secMap.entries()) {
          const questions: QuestionData[] = [];

          for (const q of qList) {
            setBatchProgress((prev) => ({
              ...prev,
              completed: processedCount,
              currentTask: `Processing Q#${q.que} (${subName} · ${secName})...`,
            }));

            // Non-blocking yield to browser main thread
            await new Promise((r) => setTimeout(r, 8));

            const images = q.parts.map((p, idx) => ({
              id: p.id,
              partIndex: p.partIndex || idx + 1,
              fileName: `${secName}__--__${q.que}__--__${p.partIndex || idx + 1}.png`,
              blobUrl: p.previewUrl || (p.blob ? URL.createObjectURL(p.blob) : ''),
              rawBlob: p.blob,
              mimeType: 'image/png',
            }));

            questions.push({
              id: q.id,
              key: String(q.que),
              que: q.que,
              type: q.type,
              marks: q.marks,
              answerOptions: q.answerOptions,
              images,
              pdfData: q.parts.map((p) => ({
                page: p.page,
                x1: p.box.xmin,
                y1: p.box.ymin,
                x2: p.box.xmax,
                y2: p.box.ymax,
              })),
            });

            processedCount++;
          }

          sections.push({
            id: uid(),
            name: secName,
            questions: questions.sort((a, b) => a.que - b.que),
          });
        }

        subjects.push({
          id: uid(),
          name: subName,
          sections,
        });
      }

      const archiveTitle = pdfFileName.replace(/\.pdf$/i, '') || 'Cropped Test Paper';

      const rawFiles = new Map<string, { blob: Blob; url: string; size: number }>();
      for (const q of croppedQuestions) {
        for (const p of q.parts) {
          if (p.blob) {
            const fileName = `${q.section}__--__${q.que}__--__${p.partIndex || 1}.png`;
            rawFiles.set(fileName, {
              blob: p.blob,
              url: p.previewUrl || URL.createObjectURL(p.blob),
              size: p.blob.size,
            });
          }
        }
      }

      addArchive({
        id: uid(),
        fileName: pdfFileName || `${archiveTitle}.zip`,
        title: archiveTitle,
        format: 'pdfCropper',
        subjects,
        rawFiles,
        lastModified: Date.now(),
        metadata: {
          testTitle: archiveTitle,
          generatedBy: 'CBT Test Maker Studio',
        },
      });

      addToast({
        title: 'Export Complete',
        description: `Successfully created CBT Archive with ${croppedQuestions.length} questions!`,
        type: 'success',
      });

      setBatchProgress({ isOpen: false, total: 0, completed: 0, currentTask: '' });
      closePdfRecrop();
    } catch (err: any) {
      console.error('Batch export failed:', err);
      addToast({
        title: 'Export Failed',
        description: `Batch export failed: ${err.message}`,
        type: 'error',
      });
      setBatchProgress({ isOpen: false, total: 0, completed: 0, currentTask: '' });
    }
  };

  // Canvas Mouse / Touch Handlers with Precision Loupe
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.button === 1 || e.shiftKey) {
      // Middle click or Shift+drag: Pan viewport
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (cropperMode === 'line') {
      const normY = Math.max(0, Math.min(1, y / rect.height));
      if (lineCropperStep === 'idle') {
        setLineTopY(normY);
        setLineCropperStep('top_set');
        addToast({
          title: 'Top Line Set',
          description: 'Click below to complete question crop.',
          type: 'info',
        });
      } else {
        const top = Math.min(lineTopY, normY);
        const bottom = Math.max(lineTopY, normY);
        setActiveBox({
          ymin: top,
          ymax: bottom,
          xmin: columnSnap === 'left' ? 0.04 : columnSnap === 'right' ? 0.51 : 0.04,
          xmax: columnSnap === 'left' ? 0.49 : columnSnap === 'right' ? 0.96 : 0.96,
        });
        setLineCropperStep('idle');
      }
      return;
    }

    // Box Cropper
    const normX = Math.max(0, Math.min(1, x / rect.width));
    const normY = Math.max(0, Math.min(1, y / rect.height));

    const handle = getHandleAtPos(normX, normY, activeBox);

    setDragMode(handle);
    setDragStart({ x: normX, y: normY });
    setInitialBox({ ...activeBox });
    setIsDrawing(true);
    setLoupeVisible(true);
    setLoupePos({ x, y });
    setLoupeLabel(handle ? `Handle: ${handle.toUpperCase()}` : 'Draw Box');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (cropperMode === 'line') {
      setHoverY(Math.max(0, Math.min(1, y / rect.height)));
      return;
    }

    if (!isDrawing) return;

    const normX = Math.max(0, Math.min(1, x / rect.width));
    const normY = Math.max(0, Math.min(1, y / rect.height));

    setLoupePos({ x, y });

    const dx = normX - dragStart.x;
    const dy = normY - dragStart.y;

    if (!dragMode) {
      // Drawing new box from scratch
      const xmin = Math.min(dragStart.x, normX);
      const xmax = Math.max(dragStart.x, normX);
      const ymin = Math.min(dragStart.y, normY);
      const ymax = Math.max(dragStart.y, normY);
      setActiveBox({ xmin, xmax, ymin, ymax });
    } else if (dragMode === 'move') {
      const w = initialBox.xmax - initialBox.xmin;
      const h = initialBox.ymax - initialBox.ymin;
      let newXmin = Math.max(0, Math.min(1 - w, initialBox.xmin + dx));
      let newYmin = Math.max(0, Math.min(1 - h, initialBox.ymin + dy));
      setActiveBox({
        xmin: newXmin,
        xmax: newXmin + w,
        ymin: newYmin,
        ymax: newYmin + h,
      });
    } else {
      // Resizing box handles
      const nextBox = { ...initialBox };
      if (dragMode.includes('n')) nextBox.ymin = Math.min(initialBox.ymax - 0.01, initialBox.ymin + dy);
      if (dragMode.includes('s')) nextBox.ymax = Math.max(initialBox.ymin + 0.01, initialBox.ymax + dy);
      if (dragMode.includes('w')) nextBox.xmin = Math.min(initialBox.xmax - 0.01, initialBox.xmin + dx);
      if (dragMode.includes('e')) nextBox.xmax = Math.max(initialBox.xmin + 0.01, initialBox.xmax + dx);
      setActiveBox(nextBox);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setIsPanning(false);
    setDragMode(null);
    setLoupeVisible(false);
  };

  function getHandleAtPos(x: number, y: number, b: BoxCoord): string | null {
    const threshold = 0.025;
    const nearLeft = Math.abs(x - b.xmin) < threshold;
    const nearRight = Math.abs(x - b.xmax) < threshold;
    const nearTop = Math.abs(y - b.ymin) < threshold;
    const nearBottom = Math.abs(y - b.ymax) < threshold;

    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop && x >= b.xmin && x <= b.xmax) return 'n';
    if (nearBottom && x >= b.xmin && x <= b.xmax) return 's';
    if (nearLeft && y >= b.ymin && y <= b.ymax) return 'w';
    if (nearRight && y >= b.ymin && y <= b.ymax) return 'e';
    if (x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax) return 'move';
    return null;
  }

  if (!isPdfRecropModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
            <Crop className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
              <span>Test Maker & Precision PDF Cropper</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700/50 text-indigo-300 font-mono">
                Studio v2.0
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">
              {pdfFileName ? `${pdfFileName} (${totalPages} pages)` : 'Load a question paper PDF to begin cropping'}
            </p>
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="hidden md:flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setCropperMode('box')}
            className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
              cropperMode === 'box'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Box Mode</span>
          </button>
          <button
            onClick={() => setCropperMode('line')}
            className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
              cropperMode === 'line'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Line Split Mode</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {isTargetRecrop && (
            <button
              onClick={handleApplyToActiveTarget}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white rounded-lg shadow-lg flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Close</span>
            </button>
          )}

          {croppedQuestions.length > 0 && !isTargetRecrop && (
            <button
              onClick={handleExportAllToArchive}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white rounded-lg shadow-lg flex items-center gap-1.5 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Export Test ({croppedQuestions.length})</span>
            </button>
          )}

          <button
            onClick={closePdfRecrop}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Target Recrop Notice Banner */}
      {isTargetRecrop && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>
              Active Recrop Target: <strong>Question #{questionNumber || recropTarget?.defaultQNo || '?'}</strong> ({subjectName || 'Subject'} · {sectionName || 'Section'}) — Part {recropTarget?.partIndex || 1}
            </span>
          </div>
          <span className="text-[10px] bg-amber-900/80 px-2 py-0.5 rounded border border-amber-700 font-mono">
            Direct Update Mode
          </span>
        </div>
      )}

      {/* Main Studio Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Side: Question Configuration Drawer */}
        <div className="w-full md:w-80 lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4">
          {/* Question Sequence & Metadata */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Question Index</span>
              </span>
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoIncrementQNo}
                  onChange={(e) => setAutoIncrementQNo(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 text-[10px]"
                />
                <span>Auto-Inc Q#</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 font-medium mb-1">Question #</label>
                <input
                  type="number"
                  value={questionNumber}
                  onChange={(e) => setQuestionNumber(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  placeholder="Auto (1, 2...)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-medium mb-1">Question Type</label>
                <select
                  value={questionType}
                  onChange={(e) => {
                    const t = e.target.value as any;
                    setQuestionType(t);
                    if (t === 'msq') {
                      setMarksScheme({
                        cm: 4,
                        im: -2,
                        pm: 1,
                        max: 4,
                        partialTiers: { threeCorrect: 3, twoCorrect: 2, oneCorrect: 1 },
                        schemeType: 'jee_adv_msq',
                      });
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                >
                  <option value="mcq">MCQ (Single)</option>
                  <option value="msq">MSQ (JEE Advanced Multi)</option>
                  <option value="nat">NAT (Numerical)</option>
                  <option value="msm">MSM (Matrix Match)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 font-medium mb-1">Subject</label>
                <input
                  type="text"
                  list="subjects-list"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="e.g. Physics"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <datalist id="subjects-list">
                  {subjectSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-medium mb-1">Section</label>
                <input
                  type="text"
                  list="sections-list"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder="e.g. Section 1"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <datalist id="sections-list">
                  {sectionSuggestions.map((sec) => (
                    <option key={sec} value={sec} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* JEE Advanced Marking Scheme & Presets */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Marking Scheme</span>
              </span>

              {/* Quick Presets Dropdown */}
              <select
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="bg-slate-900 text-[10px] border border-slate-700 rounded px-2 py-0.5 text-slate-300 font-semibold"
                defaultValue=""
              >
                <option value="" disabled>
                  Apply Preset...
                </option>
                {MARKING_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-emerald-400 font-bold block mb-0.5">+ Correct</span>
                <input
                  type="number"
                  value={marksScheme.cm}
                  onChange={(e) => setMarksScheme({ ...marksScheme, cm: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-center"
                />
              </div>
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-rose-400 font-bold block mb-0.5">- Incorrect</span>
                <input
                  type="number"
                  value={marksScheme.im}
                  onChange={(e) => setMarksScheme({ ...marksScheme, im: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-center"
                />
              </div>
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-purple-400 font-bold block mb-0.5">Partial</span>
                <input
                  type="number"
                  value={marksScheme.pm ?? 0}
                  onChange={(e) => setMarksScheme({ ...marksScheme, pm: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-center"
                />
              </div>
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-blue-400 font-bold block mb-0.5">Max</span>
                <input
                  type="number"
                  value={marksScheme.max ?? 4}
                  onChange={(e) => setMarksScheme({ ...marksScheme, max: parseFloat(e.target.value) || 4 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-center"
                />
              </div>
            </div>

            {/* JEE Advanced MSQ Tiered Partial Rules Box */}
            {questionType === 'msq' && (
              <div className="bg-purple-950/40 p-2.5 rounded-lg border border-purple-500/30 text-[11px] space-y-1.5">
                <div className="font-semibold text-purple-300 flex items-center justify-between">
                  <span>JEE Adv Partial Tiers:</span>
                  <span className="font-mono text-[10px] text-purple-400">Dynamic</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
                  <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">3 of 4</span>
                    <span className="text-emerald-400 font-bold">+{marksScheme.partialTiers?.threeCorrect ?? 3}</span>
                  </div>
                  <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">2 of 3/4</span>
                    <span className="text-emerald-400 font-bold">+{marksScheme.partialTiers?.twoCorrect ?? 2}</span>
                  </div>
                  <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">1 of 2/3/4</span>
                    <span className="text-emerald-400 font-bold">+{marksScheme.partialTiers?.oneCorrect ?? 1}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Precision Tools & Alignment */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
              <span>Smart Alignment & OCR</span>
            </span>

            {/* Smart Whitespace Trim & OCR */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSmartTrim}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                title="Auto-snaps crop box to the ink/equation boundaries"
              >
                <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Smart Auto-Trim</span>
              </button>

              <button
                onClick={handlePeekText}
                disabled={isPeekingText}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                title="Reads text from PDF layer under this box"
              >
                <Scan className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isPeekingText ? 'Peeking...' : 'Peek Text / Q#'}</span>
              </button>
            </div>

            {/* Column Snap Presets */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-medium block">Column Rulers:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => applyColumnSnap('left')}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono"
                >
                  Left (50%)
                </button>
                <button
                  onClick={() => applyColumnSnap('right')}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono"
                >
                  Right (50%)
                </button>
                <button
                  onClick={() => applyColumnSnap('full')}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono"
                >
                  Full (100%)
                </button>
              </div>
            </div>

            {/* Multi-part Question Splitter */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                onClick={() => {
                  if (!isMultiPart) {
                    setIsMultiPart(true);
                    setBoxB({ ...boxA, ymin: boxA.ymax + 0.02, ymax: Math.min(1, boxA.ymax + 0.3) });
                    setActivePartIndex(2);
                    setPageB(currentPage);
                  } else {
                    setIsMultiPart(false);
                    setBoxB(null);
                    setActivePartIndex(1);
                  }
                }}
                className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  isMultiPart
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-slate-900 text-purple-300 border border-purple-500/30 hover:bg-slate-850'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>{isMultiPart ? 'Multi-Part Active (Part 1 + 2)' : '+ Add Part 2 (Multi-Page Split)'}</span>
              </button>
            </div>
          </div>

          {/* Action Button: Save / Update Question */}
          <div className="pt-2">
            <button
              onClick={handleSaveQuestion}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all shadow-emerald-950/50"
            >
              <Check className="w-4 h-4" />
              <span>{editingQuestionId ? 'Update Question Crop' : 'Save Question Crop (Enter)'}</span>
            </button>
          </div>
        </div>

        {/* Center: PDF Canvas Viewport with Precision Loupe */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {/* Canvas Top Bar: Page Nav & Zoom */}
          <div className="h-11 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-10">
            {/* Page Nav */}
            <div className="flex items-center gap-2 text-xs">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-slate-300">
                Page {currentPage} / {totalPages || 1}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setScale((s) => Math.max(0.8, s - 0.2))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-slate-400">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setScale(1.5);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Reset View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* History Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                disabled={historyPast.length === 0}
                onClick={handleUndo}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={historyFuture.length === 0}
                onClick={handleRedo}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Canvas Viewport */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="flex-1 overflow-auto flex items-center justify-center p-6 bg-slate-950 cursor-crosshair relative"
          >
            {!pdfFile ? (
              /* Empty Dropzone State */
              <label className="max-w-md w-full p-8 rounded-2xl border-2 border-dashed border-indigo-500/40 bg-slate-900/60 hover:bg-slate-900 text-center flex flex-col items-center gap-3 cursor-pointer transition-all">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Upload Question Paper PDF</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select any JEE / NEET / Board exam PDF to crop questions interactively
                  </p>
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handlePdfUpload(e.target.files[0]);
                  }}
                  className="hidden"
                />
              </label>
            ) : (
              <div
                className="relative bg-white shadow-2xl transition-transform"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                }}
              >
                {/* PDF Rendered Canvas */}
                <canvas ref={canvasRef} className="block shadow-xl rounded-sm" />

                {/* Box A Overlay */}
                <div
                  className={`absolute border-2 pointer-events-none transition-all ${
                    activePartIndex === 1
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg'
                      : 'border-slate-500/80 bg-slate-500/10'
                  }`}
                  style={{
                    left: `${boxA.xmin * 100}%`,
                    top: `${boxA.ymin * 100}%`,
                    width: `${(boxA.xmax - boxA.xmin) * 100}%`,
                    height: `${(boxA.ymax - boxA.ymin) * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 bg-indigo-600 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                    Box A (Part 1)
                  </span>
                </div>

                {/* Box B Overlay (Multi-Part) */}
                {isMultiPart && boxB && (
                  <div
                    className={`absolute border-2 pointer-events-none transition-all ${
                      activePartIndex === 2
                        ? 'border-purple-500 bg-purple-500/10 shadow-lg'
                        : 'border-slate-500/80 bg-slate-500/10'
                    }`}
                    style={{
                      left: `${boxB.xmin * 100}%`,
                      top: `${boxB.ymin * 100}%`,
                      width: `${(boxB.xmax - boxB.xmin) * 100}%`,
                      height: `${(boxB.ymax - boxB.ymin) * 100}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-purple-600 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                      Box B (Part 2)
                    </span>
                  </div>
                )}

                {/* Line Cropper Hover / Step Guideline */}
                {cropperMode === 'line' && hoverY !== null && (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-dashed border-rose-500 pointer-events-none z-20"
                    style={{ top: `${hoverY * 100}%` }}
                  />
                )}
              </div>
            )}

            {/* Precision 2.5x Magnifying Loupe */}
            <PrecisionLoupe
              visible={loupeVisible}
              sourceCanvas={canvasRef.current}
              cursorX={loupePos.x}
              cursorY={loupePos.y}
              containerWidth={containerRef.current?.clientWidth || 800}
              containerHeight={containerRef.current?.clientHeight || 600}
              zoom={2.5}
              diameter={130}
              label={loupeLabel}
            />
          </div>

          {/* Bottom Cropped Questions Timeline */}
          <BottomQuestionTimeline
            questions={croppedQuestions}
            activeQuestionId={editingQuestionId}
            onSelectQuestion={(q) => {
              setEditingQuestionId(q.id);
              setQuestionNumber(q.que);
              setSubjectName(q.subject);
              setSectionName(q.section);
              setQuestionType(q.type);
              setAnswerOptions(q.answerOptions);
              setMarksScheme(q.marks);
              if (q.parts[0]) {
                setBoxA(q.parts[0].box);
                setCurrentPage(q.parts[0].page);
              }
              if (q.parts[1]) {
                setIsMultiPart(true);
                setBoxB(q.parts[1].box);
                setPageB(q.parts[1].page);
              } else {
                setIsMultiPart(false);
                setBoxB(null);
              }
            }}
            onDeleteQuestion={(id) => {
              const updated = croppedQuestions.filter((q) => q.id !== id);
              pushHistory(updated);
              if (editingQuestionId === id) setEditingQuestionId(null);
            }}
            onDuplicateQuestion={(q) => {
              const dup: ManualCroppedQuestion = {
                ...q,
                id: uid(),
                que: croppedQuestions.length + 1,
                createdAt: Date.now(),
              };
              pushHistory([...croppedQuestions, dup]);
            }}
          />
        </div>
      </div>

      {/* Batch Export Progress Modal */}
      <BatchProcessingProgressModal
        isOpen={batchProgress.isOpen}
        total={batchProgress.total}
        completed={batchProgress.completed}
        currentTaskName={batchProgress.currentTask}
      />
    </div>
  );
};
