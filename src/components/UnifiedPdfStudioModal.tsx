import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import {
  BoxCoord,
  CropperMode,
  ViewMode,
  ColumnSnapMode,
  ManualCroppedPart,
  ManualCroppedQuestion,
} from '../types/manualCropper';
import {
  renderCropBoxToBlob,
  detectContentBoundsInCanvas,
  snapBoxToHorizontalWhitespaceValleys,
  stitchBlobsVertically,
  getTextInBoxFromPdfPage,
} from '../utils/cropperImageUtils';
import { sanitizeBox } from '../utils/manualCropperSession';
import { buildImageFileName, MARKING_PRESETS } from '../utils/constants';
import { QuestionData, SubjectData, SectionData, PdfDataPart, MarksScheme } from '../types/cbt';
import { PrecisionLoupe } from './manualCropper/PrecisionLoupe';
import { LiveCroppedPreviewModal } from './manualCropper/LiveCroppedPreviewModal';
import { ManualCropperHelpAccordions } from './manualCropper/ManualCropperHelpAccordions';
import { BottomQuestionTimeline } from './manualCropper/BottomQuestionTimeline';
import { MarkingSchemeModal, MarkingScopeConfig } from './manualCropper/MarkingSchemeModal';
import { LineCropperOverlay } from './manualCropper/LineCropperOverlay';
import { AnswerKeyInputBar } from './manualCropper/AnswerKeyInputBar';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Eye,
  Crop,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Scissors,
  Plus,
  RefreshCw,
  Sliders,
  Grid,
  Magnet,
  HelpCircle,
  FileText,
  UploadCloud,
  Check,
  Tag,
  Crosshair,
  Move,
  Info,
  Download,
  Trash2,
  Edit3,
  Columns,
  Split,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Copy,
  Scan,
  Wand2,
  Loader2,
  ArrowRight,
  Award,
  CornerDownLeft,
  BookOpen,
} from 'lucide-react';

const PRESET_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'Logical Reasoning',
  'General Knowledge',
  'English / Verbal Ability',
  'Computer Science',
  'Aptitude',
];

const PRESET_SECTIONS = [
  'Section A',
  'Section B',
  'Section 1',
  'Section 2',
  'Mandatory',
  'Optional / Numerical',
  'Part 1',
  'Part 2',
];

interface QuestionBoxItem {
  questionId: string;
  que: number;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  type: string;
  answerOptions: string;
  marks: MarksScheme;
  partIndex: number;
  totalParts: number;
  pageNumber: number;
  box: BoxCoord;
  isSplit: boolean;
  status: 'valid' | 'split' | 'overlap' | 'anomaly';
  warningText?: string;
}

export const UnifiedPdfStudioModal: React.FC = () => {
  const {
    isPdfStudioOpen,
    closePdfStudio,
    pdfStudioTarget,
    archives,
    activeArchiveId,
    applyCroppedImage,
    updateQuestion,
    applyMarkingSchemeWithScope,
    addToast,
    attachSourcePdfToArchive,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Studio Mode: default to 'precision' (Manual Precision Cropper)
  const [studioMode, setStudioMode] = useState<'layout' | 'precision'>('precision');

  // Precision Cropper Sub-Mode: 'crop' (Cropping Mode - default) vs 'edit' (Edit Mode)
  const [precisionSubMode, setPrecisionSubMode] = useState<'crop' | 'edit'>('crop');

  // Cropping Tool: 'box' vs 'line' (Horizontal/Vertical line based cropper)
  const [cropToolType, setCropToolType] = useState<'box' | 'line'>('box');
  const [lineColumnMode, setLineColumnMode] = useState<'double' | 'single'>('double');

  // Marking Scheme Modal Open State
  const [isMarkingModalOpen, setIsMarkingModalOpen] = useState<boolean>(false);

  // Mandatory Subject validation & custom field toggles
  const [subjectError, setSubjectError] = useState<boolean>(false);
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(false);
  const [isCustomSection, setIsCustomSection] = useState<boolean>(false);

  // PDF Document & Page State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [renderingPage, setRenderingPage] = useState<boolean>(false);

  // Zoom & Canvas Viewport
  const [scale, setScale] = useState<number>(0.75);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Visual Guides & Guardrails Toggles
  const [show4LineGrid, setShow4LineGrid] = useState<boolean>(true);
  const [enableMagneticSnapping, setEnableMagneticSnapping] = useState<boolean>(true);
  const [detectUnmappedGaps, setDetectUnmappedGaps] = useState<boolean>(true);
  const [autoWhiten, setAutoWhiten] = useState<boolean>(true);
  const [enableLoupe, setEnableLoupe] = useState<boolean>(false);

  // Cropper Specific Options
  const [cropperMode, setCropperMode] = useState<CropperMode>('box');
  const [columnSnap, setColumnSnap] = useState<ColumnSnapMode>('auto');

  // Selected Target in Layout Mode
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedPartIndex, setSelectedPartIndex] = useState<number>(1);
  const [hoveredQId, setHoveredQId] = useState<string | null>(null);

  // Active Interactive Box
  const [activeBox, setActiveBox] = useState<BoxCoord>({ ymin: 0.1, xmin: 0.035, ymax: 0.35, xmax: 0.49 });
  const [isDrawingNewBox, setIsDrawingNewBox] = useState<boolean>(false);
  const [drawStartPos, setDrawStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Undo Stack for Line Cropper
  const [lineCutHistory, setLineCutHistory] = useState<Array<{ box: BoxCoord; questionNumber: number }>>([]);

  // Box Dragging & Resizing State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null); // 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragInitialBox, setDragInitialBox] = useState<BoxCoord | null>(null);
  const [isSavingCrop, setIsSavingCrop] = useState<boolean>(false);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Multi-Part Box (Box B for split questions across cols/pages)
  const [boxB, setBoxB] = useState<BoxCoord | null>(null);
  const [pageB, setPageB] = useState<number>(1);
  const [activePartIndexCrop, setActivePartIndexCrop] = useState<1 | 2>(1);
  const [isMultiPart, setIsMultiPart] = useState<boolean>(false);
  const [stitchGap, setStitchGap] = useState<number>(12);

  // Precision Loupe Magnifier State
  const [loupeVisible, setLoupeVisible] = useState<boolean>(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [loupeLabel, setLoupeLabel] = useState<string>('2.5x Loupe');

  // Line Cropper state
  const [lineCropperStep, setLineCropperStep] = useState<'idle' | 'top_set'>('idle');
  const [lineTopY, setLineTopY] = useState<number>(0);
  const [hoverY, setHoverY] = useState<number | null>(null);

  // Question Form State (for Precision Cropper Mode)
  const [subjectName, setSubjectName] = useState<string>('');
  const [sectionName, setSectionName] = useState<string>('');
  const [questionNumber, setQuestionNumber] = useState<number | ''>('');
  const [questionType, setQuestionType] = useState<'mcq' | 'msq' | 'nat' | 'msm'>('mcq');
  const [answerOptions, setAnswerOptions] = useState<string>('4');
  const [targetOperation, setTargetOperation] = useState<'replace_part' | 'add_part' | 'new_question'>('replace_part');
  const [marksScheme, setMarksScheme] = useState<MarksScheme>({
    cm: 4,
    im: -1,
    pm: 0,
    max: 4,
    partialTiers: { threeCorrect: 3, twoCorrect: 2, oneCorrect: 1 },
    schemeType: 'jee_main',
  });

  // Previews & Modals
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [peekedText, setPeekedText] = useState<string>('');
  const [isPeekingText, setIsPeekingText] = useState<boolean>(false);

  // DOM Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const currentRenderTaskRef = useRef<any>(null);
  const pdfPageObjRef = useRef<any>(null);

  // 1. Auto-Hydrate PDF from activeArchive rawFiles
  useEffect(() => {
    if (isPdfStudioOpen && activeArchive) {
      if (pdfStudioTarget?.mode) {
        setStudioMode(pdfStudioTarget.mode);
      } else {
        setStudioMode('precision');
      }
      if (pdfStudioTarget?.pageNumber) {
        setCurrentPage(pdfStudioTarget.pageNumber);
      }
      if (pdfStudioTarget?.questionId) {
        setSelectedQuestionId(pdfStudioTarget.questionId);
        setSelectedPartIndex(pdfStudioTarget.partIndex || 1);
        setPrecisionSubMode('edit');
      }
      if (pdfStudioTarget?.cropMode) {
        setTargetOperation(pdfStudioTarget.cropMode === 'stitch' ? 'add_part' : pdfStudioTarget.cropMode);
      }

      // Compute next available question number
      let maxQ = 0;
      activeArchive.subjects.forEach((s) => {
        s.sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            if (q.que > maxQ) maxQ = q.que;
          });
        });
      });
      const nextQ = maxQ > 0 ? maxQ + 1 : 1;

      if (pdfStudioTarget?.defaultQNo) {
        setQuestionNumber(pdfStudioTarget.defaultQNo);
      } else if (questionNumber === '') {
        setQuestionNumber(nextQ);
      }

      // Default subject and section if empty
      if (!subjectName) {
        const firstSub = activeArchive.subjects[0]?.name || 'Physics';
        setSubjectName(firstSub);
      }
      if (!sectionName) {
        const firstSec = activeArchive.subjects[0]?.sections[0]?.name || 'Section 1';
        setSectionName(firstSec);
      }

      if (!pdfDoc) {
        let candidateEntry: { blob: Blob; url: string; size: number } | undefined =
          activeArchive.rawFiles.get('source_document.pdf');
        let candidateName = activeArchive.metadata?.sourcePdfName || 'source_document.pdf';

        if (!candidateEntry) {
          for (const [key, val] of activeArchive.rawFiles.entries()) {
            if (key.toLowerCase().endsWith('.pdf') && val?.blob) {
              candidateEntry = val;
              candidateName = key;
              break;
            }
          }
        }

        if (candidateEntry && candidateEntry.blob) {
          loadPdfFromBlob(candidateEntry.blob, candidateName);
        }
      }
    }
  }, [isPdfStudioOpen, activeArchive, pdfStudioTarget]);

  // Load PDF into PDF.js
  const loadPdfFromBlob = async (blob: Blob, name: string) => {
    setLoadingDoc(true);
    setPdfFileName(name);
    try {
      const pdfjsLib = await getPdfjsLib();
      const arrayBuffer = await blob.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const loadedDoc = await loadingTask.promise;
      setPdfDoc(loadedDoc);
      setTotalPages(loadedDoc.numPages);
      if (!pdfStudioTarget?.pageNumber) {
        setCurrentPage(1);
      }
    } catch (err: any) {
      console.error('[Unified PDF Studio] Error loading PDF:', err);
      addToast({
        title: 'PDF Load Failed',
        description: err.message || 'Could not load PDF document',
        type: 'error',
      });
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (activeArchive) {
        attachSourcePdfToArchive(activeArchive.id, f);
      }
      loadPdfFromBlob(f, f.name);
    }
  };

  // 2. Extract all questions across the entire archive for the bottom timeline
  const allArchiveQuestions: ManualCroppedQuestion[] = useMemo(() => {
    if (!activeArchive) return [];
    const list: ManualCroppedQuestion[] = [];

    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          const parts: ManualCroppedPart[] = (q.pdfData || []).map((p: any, idx: number) => {
            const imgMeta = q.images?.[idx];
            const rawEntry = imgMeta ? activeArchive.rawFiles.get(imgMeta.fileName) : undefined;
            const url = rawEntry?.url || imgMeta?.blobUrl || '';
            return {
              id: imgMeta?.id || `${q.id}-${idx + 1}`,
              partIndex: idx + 1,
              page: p.pageNumber || p.page || 1,
              box: {
                ymin: p.ymin ?? p.y1 ?? 0.1,
                xmin: p.xmin ?? p.x1 ?? 0.05,
                ymax: p.ymax ?? p.y2 ?? 0.4,
                xmax: p.xmax ?? p.x2 ?? 0.95,
              },
              previewUrl: url,
            };
          });

          const firstImgMeta = q.images?.[0];
          const firstRaw = firstImgMeta ? activeArchive.rawFiles.get(firstImgMeta.fileName) : undefined;
          const mainUrl = firstRaw?.url || firstImgMeta?.blobUrl || '';

          list.push({
            id: q.id,
            que: q.que,
            subject: sub.name,
            section: sec.name,
            type: q.type as any,
            answerOptions: q.answerOptions || '4',
            marks: q.marks || MARKING_PRESETS[0].marks,
            parts: parts.length > 0 ? parts : [
              {
                id: `${q.id}-1`,
                partIndex: 1,
                page: 1,
                box: { ymin: 0.1, xmin: 0.035, ymax: 0.4, xmax: 0.49 },
                previewUrl: mainUrl,
              },
            ],
            stitchedPreviewUrl: mainUrl,
            createdAt: Date.now(),
          });
        });
      });
    });

    return list.sort((a, b) => a.que - b.que);
  }, [activeArchive]);

  // Available subjects (Preset + Archive existing)
  const availableSubjects = useMemo(() => {
    const list = new Set<string>();
    if (activeArchive) {
      activeArchive.subjects.forEach((s) => list.add(s.name));
    }
    PRESET_SUBJECTS.forEach((s) => list.add(s));
    return Array.from(list);
  }, [activeArchive]);

  // Available sections for chosen subject (Preset + Archive existing)
  const availableSections = useMemo(() => {
    const list = new Set<string>();
    if (activeArchive) {
      const matchingSub = activeArchive.subjects.find((s) => s.name === subjectName);
      if (matchingSub) {
        matchingSub.sections.forEach((sec) => list.add(sec.name));
      }
    }
    PRESET_SECTIONS.forEach((s) => list.add(s));
    return Array.from(list);
  }, [activeArchive, subjectName]);

  // 2b. Extract and Classify all question boxes on the CURRENT page
  const pageBoxes: QuestionBoxItem[] = useMemo(() => {
    if (!activeArchive) return [];
    const items: QuestionBoxItem[] = [];

    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          if (q.pdfData && Array.isArray(q.pdfData)) {
            q.pdfData.forEach((part: PdfDataPart, pIdx: number) => {
              const pNum = part.pageNumber || part.page || 1;
              if (pNum === currentPage) {
                const rawYmin = part.ymin !== undefined ? part.ymin : part.y1 !== undefined ? part.y1 : 0.1;
                const rawXmin = part.xmin !== undefined ? part.xmin : part.x1 !== undefined ? part.x1 : 0.05;
                const rawYmax = part.ymax !== undefined ? part.ymax : part.y2 !== undefined ? part.y2 : 0.4;
                const rawXmax = part.xmax !== undefined ? part.xmax : part.x2 !== undefined ? part.x2 : 0.95;

                const box: BoxCoord = {
                  ymin: Math.max(0, Math.min(0.98, rawYmin)),
                  xmin: Math.max(0, Math.min(0.98, rawXmin)),
                  ymax: Math.min(1.0, Math.max(rawYmin + 0.02, rawYmax)),
                  xmax: Math.min(1.0, Math.max(rawXmin + 0.02, rawXmax)),
                };

                const isSplit = (q.pdfData?.length || 0) > 1;
                let status: QuestionBoxItem['status'] = isSplit ? 'split' : 'valid';

                items.push({
                  questionId: q.id,
                  que: q.que,
                  subjectId: sub.id,
                  subjectName: sub.name,
                  sectionId: sec.id,
                  sectionName: sec.name,
                  type: q.type,
                  answerOptions: q.answerOptions,
                  marks: q.marks,
                  partIndex: pIdx + 1,
                  totalParts: q.pdfData.length,
                  pageNumber: pNum,
                  box,
                  isSplit,
                  status,
                });
              }
            });
          }
        });
      });
    });

    // Check for collisions / overlaps on the same page
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].box;
        const b = items[j].box;
        const xOverlap = Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin));
        const yOverlap = Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
        if (xOverlap > 0.05 && yOverlap > 0.03) {
          items[i].status = 'overlap';
          items[i].warningText = `Overlaps with Q.${items[j].que}`;
          items[j].status = 'overlap';
          items[j].warningText = `Overlaps with Q.${items[i].que}`;
        }
      }
    }

    return items;
  }, [activeArchive, currentPage]);

  // Sync active editing box when selected question changes
  useEffect(() => {
    if (selectedQuestionId) {
      const match = pageBoxes.find(
        (b) => b.questionId === selectedQuestionId && b.partIndex === selectedPartIndex
      );
      if (match) {
        setActiveBox({ ...match.box });
        setSubjectName(match.subjectName);
        setSectionName(match.sectionName);
        setQuestionNumber(match.que);
        setQuestionType(match.type as any);
        setAnswerOptions(match.answerOptions || '4');
        setMarksScheme(match.marks || MARKING_PRESETS[0].marks);
      }
    }
  }, [selectedQuestionId, selectedPartIndex, pageBoxes]);

  // 3. Render High-DPI PDF page on canvas
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;

    const renderPage = async () => {
      setRenderingPage(true);
      try {
        if (currentRenderTaskRef.current) {
          try {
            currentRenderTaskRef.current.cancel();
          } catch (e) {}
        }

        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;
        pdfPageObjRef.current = page;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        currentRenderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('[Unified PDF Studio] Canvas render error:', err);
        }
      } finally {
        if (!isCancelled) {
          setRenderingPage(false);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, currentPage, scale]);

  // 4. Whitespace and Gap Detection Algorithms
  const unmappedGaps = useMemo(() => {
    if (!detectUnmappedGaps || pageBoxes.length === 0) return [];

    const gaps: Array<{ ymin: number; xmin: number; ymax: number; xmax: number; column: 'left' | 'right' | 'full' }> = [];
    const minGapHeight = 0.06;

    // Check Left Column (x: 0.035 to 0.490)
    const leftBoxes = pageBoxes
      .filter((b) => b.box.xmin < 0.45)
      .map((b) => b.box)
      .sort((a, b) => a.ymin - b.ymin);

    let curYLeft = 0.08;
    for (const b of leftBoxes) {
      if (b.ymin - curYLeft > minGapHeight) {
        gaps.push({ ymin: curYLeft, xmin: 0.035, ymax: b.ymin, xmax: 0.49, column: 'left' });
      }
      curYLeft = Math.max(curYLeft, b.ymax);
    }
    if (0.94 - curYLeft > minGapHeight) {
      gaps.push({ ymin: curYLeft, xmin: 0.035, ymax: 0.94, xmax: 0.49, column: 'left' });
    }

    // Check Right Column (x: 0.508 to 0.965)
    const rightBoxes = pageBoxes
      .filter((b) => b.box.xmax > 0.55)
      .map((b) => b.box)
      .sort((a, b) => a.ymin - b.ymin);

    let curYRight = 0.08;
    for (const b of rightBoxes) {
      if (b.ymin - curYRight > minGapHeight) {
        gaps.push({ ymin: curYRight, xmin: 0.508, ymax: b.ymin, xmax: 0.965, column: 'right' });
      }
      curYRight = Math.max(curYRight, b.ymax);
    }
    if (0.94 - curYRight > minGapHeight) {
      gaps.push({ ymin: curYRight, xmin: 0.508, ymax: 0.94, xmax: 0.965, column: 'right' });
    }

    return gaps;
  }, [pageBoxes, detectUnmappedGaps]);

  // Handle Box Drag & Resize
  const handleMouseDownOnCanvas = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayContainerRef.current) return;
    const rect = overlayContainerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // In Precision Mode or when drawing a new box
    if (cropperMode === 'box' && e.shiftKey) {
      setIsDrawingNewBox(true);
      setDrawStartPos({ x: clickX, y: clickY });
      setActiveBox({ ymin: clickY, xmin: clickX, ymax: clickY + 0.01, xmax: clickX + 0.01 });
      return;
    }

    // Check if clicked inside a question box in layout mode
    if (studioMode === 'layout') {
      const clickedItem = pageBoxes.find(
        (item) =>
          clickX >= item.box.xmin &&
          clickX <= item.box.xmax &&
          clickY >= item.box.ymin &&
          clickY <= item.box.ymax
      );

      if (clickedItem) {
        setSelectedQuestionId(clickedItem.questionId);
        setSelectedPartIndex(clickedItem.partIndex);
        setActiveBox({ ...clickedItem.box });
      } else {
        setSelectedQuestionId(null);
      }
    }
  };

  const handleHandleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragHandle(handle);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragInitialBox({ ...activeBox });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!overlayContainerRef.current) return;
      const rect = overlayContainerRef.current.getBoundingClientRect();
      const currentNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const currentNormY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      // Update Loupe position
      if (enableLoupe) {
        setLoupeVisible(true);
        setLoupePos({ x: e.clientX, y: e.clientY });
      }

      // Drawing new box with Shift + Drag
      if (isDrawingNewBox) {
        const xmin = Math.min(drawStartPos.x, currentNormX);
        const xmax = Math.max(drawStartPos.x, currentNormX);
        const ymin = Math.min(drawStartPos.y, currentNormY);
        const ymax = Math.max(drawStartPos.y, currentNormY);
        setActiveBox({ xmin, xmax, ymin, ymax });
        return;
      }

      // Dragging or resizing active box
      if (isDragging && dragInitialBox && dragHandle) {
        const dx = (e.clientX - dragStartPos.x) / rect.width;
        const dy = (e.clientY - dragStartPos.y) / rect.height;

        let newBox = { ...dragInitialBox };

        if (dragHandle === 'move') {
          const width = dragInitialBox.xmax - dragInitialBox.xmin;
          const height = dragInitialBox.ymax - dragInitialBox.ymin;
          let nx = Math.max(0, Math.min(1 - width, dragInitialBox.xmin + dx));
          let ny = Math.max(0, Math.min(1 - height, dragInitialBox.ymin + dy));

          // 4-Line Grid Snapping for Column movement
          if (enableMagneticSnapping) {
            if (Math.abs(nx - 0.035) < 0.02) nx = 0.035;
            if (Math.abs(nx + width - 0.49) < 0.02) nx = 0.49 - width;
            if (Math.abs(nx - 0.508) < 0.02) nx = 0.508;
            if (Math.abs(nx + width - 0.965) < 0.02) nx = 0.965 - width;
          }

          newBox.xmin = nx;
          newBox.xmax = nx + width;
          newBox.ymin = ny;
          newBox.ymax = ny + height;
        } else {
          if (dragHandle.includes('w')) {
            newBox.xmin = Math.min(newBox.xmax - 0.02, Math.max(0, dragInitialBox.xmin + dx));
            if (enableMagneticSnapping && Math.abs(newBox.xmin - 0.035) < 0.015) newBox.xmin = 0.035;
            if (enableMagneticSnapping && Math.abs(newBox.xmin - 0.508) < 0.015) newBox.xmin = 0.508;
          }
          if (dragHandle.includes('e')) {
            newBox.xmax = Math.max(newBox.xmin + 0.02, Math.min(1, dragInitialBox.xmax + dx));
            if (enableMagneticSnapping && Math.abs(newBox.xmax - 0.49) < 0.015) newBox.xmax = 0.49;
            if (enableMagneticSnapping && Math.abs(newBox.xmax - 0.965) < 0.015) newBox.xmax = 0.965;
          }
          if (dragHandle.includes('n')) {
            newBox.ymin = Math.min(newBox.ymax - 0.02, Math.max(0, dragInitialBox.ymin + dy));
          }
          if (dragHandle.includes('s')) {
            newBox.ymax = Math.max(newBox.ymin + 0.02, Math.min(1, dragInitialBox.ymax + dy));
          }
        }

        setActiveBox(newBox);
      }
    },
    [
      isDragging,
      dragInitialBox,
      dragHandle,
      dragStartPos,
      enableMagneticSnapping,
      isDrawingNewBox,
      drawStartPos,
      enableLoupe,
    ]
  );

  const handleMouseUp = () => {
    if (isDragging || isDrawingNewBox) {
      setIsDragging(false);
      setIsDrawingNewBox(false);
      setDragHandle(null);

      // Perform Magnetic Whitespace Valley Snap if enabled
      if (enableMagneticSnapping && canvasRef.current) {
        try {
          const snapped = snapBoxToHorizontalWhitespaceValleys(canvasRef.current, activeBox);
          setActiveBox(snapped);
        } catch (e) {}
      }
    }
  };

  // Undo Last Line Cut for Line Cropper Mode
  const handleUndoLineCut = () => {
    if (lineCutHistory.length === 0) {
      addToast({ title: 'Undo', description: 'No line cuts in history', type: 'info' });
      return;
    }
    const last = lineCutHistory[lineCutHistory.length - 1];
    setLineCutHistory((prev) => prev.slice(0, -1));
    setActiveBox(last.box);
    setQuestionNumber(last.questionNumber);
    addToast({
      title: 'Line Cut Undone',
      description: `Restored Q.${last.questionNumber} line position`,
      type: 'info',
    });
  };

  // 5. Apply / Commit Crop to Active Question with Auto-Continuation
  const handleApplyCropAndAdvance = async (advanceQuestion: boolean = true) => {
    if (!subjectName || !subjectName.trim()) {
      setSubjectError(true);
      addToast({
        title: 'Subject Required',
        description: 'Subject selection is mandatory before saving a question.',
        type: 'warning',
      });
      return;
    }
    setSubjectError(false);

    if (!canvasRef.current) return;
    setIsSavingCrop(true);

    try {
      const blob = await renderCropBoxToBlob(canvasRef.current, activeBox, {
        autoWhiten,
      });

      if (!blob) throw new Error('Failed to generate image slice from canvas');

      const coordPart: PdfDataPart = {
        page: currentPage,
        pageNumber: currentPage,
        x1: Number(activeBox.xmin.toFixed(4)),
        y1: Number(activeBox.ymin.toFixed(4)),
        x2: Number(activeBox.xmax.toFixed(4)),
        y2: Number(activeBox.ymax.toFixed(4)),
        ymin: Number(activeBox.ymin.toFixed(4)),
        xmin: Number(activeBox.xmin.toFixed(4)),
        ymax: Number(activeBox.ymax.toFixed(4)),
        xmax: Number(activeBox.xmax.toFixed(4)),
        bounds: [
          Number(activeBox.xmin.toFixed(4)),
          Number(activeBox.ymin.toFixed(4)),
          Number(activeBox.xmax.toFixed(4)),
          Number(activeBox.ymax.toFixed(4)),
        ],
      };

      const currentQNum = Number(questionNumber) || 1;
      const targetSecName = sectionName.trim() || 'Section 1';

      if (precisionSubMode === 'edit' && selectedQuestionId) {
        // Edit mode: update existing question image slice and metadata
        await applyCroppedImage({
          questionId: selectedQuestionId,
          partIndex: selectedPartIndex,
          mode: 'replace_part',
          blob,
          pdfCoords: coordPart,
          newQuestionProps: {
            que: currentQNum,
            type: questionType,
            answerOptions,
            correctAnswer: answerOptions,
            marks: marksScheme,
          },
        });

        // Also update store question metadata
        updateQuestion(selectedQuestionId, {
          que: currentQNum,
          type: questionType,
          answerOptions,
          correctAnswer: answerOptions,
          marks: marksScheme,
        });

        addToast({
          title: 'Question Updated',
          description: `Updated Q.${currentQNum} on Page ${currentPage}`,
          type: 'success',
        });
      } else {
        // Cropping Mode: create new question
        await applyCroppedImage({
          mode: 'new_question',
          blob,
          pdfCoords: coordPart,
          newQuestionProps: {
            que: currentQNum,
            type: questionType,
            answerOptions,
            correctAnswer: answerOptions,
            marks: marksScheme,
          },
          subjectId: subjectName.trim(),
          sectionId: targetSecName,
        });

        if (advanceQuestion) {
          const nextQ = currentQNum + 1;
          setQuestionNumber(nextQ);
          setAnswerOptions(''); // ready for next answer key!
          setTargetOperation('new_question');

          // Advance activeBox down slightly on page
          const boxHeight = activeBox.ymax - activeBox.ymin;
          const nextYmin = Math.min(0.85, activeBox.ymax + 0.015);
          const nextYmax = Math.min(0.99, nextYmin + boxHeight);
          setActiveBox((b) => ({
            ...b,
            ymin: nextYmin,
            ymax: nextYmax,
          }));

          addToast({
            title: `Q.${currentQNum} Saved`,
            description: `Saved to ${subjectName.trim()} > ${targetSecName}! Auto-advanced to Q.${nextQ}`,
            type: 'success',
          });
        } else {
          addToast({
            title: `Q.${currentQNum} Saved`,
            description: `Saved to ${subjectName.trim()} > ${targetSecName}`,
            type: 'success',
          });
        }
      }

      // Generate Live Preview URL
      const previewUrl = URL.createObjectURL(blob);
      setLivePreviewUrl(previewUrl);
    } catch (err: any) {
      console.error('[Unified PDF Studio] Apply crop error:', err);
      addToast({
        title: 'Crop Failed',
        description: err.message || 'Could not commit cropped image',
        type: 'error',
      });
    } finally {
      setIsSavingCrop(false);
    }
  };

  const handleApplyCrop = () => handleApplyCropAndAdvance(false);

  // 1-Click Gap to Question Creator
  const handleCreateQuestionFromGap = (gap: { ymin: number; xmin: number; ymax: number; xmax: number }) => {
    setActiveBox({ ...gap });
    setStudioMode('precision');
    setTargetOperation('new_question');
    const nextQNo = pageBoxes.length > 0 ? Math.max(...pageBoxes.map((b) => b.que)) + 1 : 1;
    setQuestionNumber(nextQNo);
    addToast({
      title: 'Gap Selected',
      description: `Loaded unmapped gap box. Ready to crop as Q.${nextQNo}`,
      type: 'info',
    });
  };

  // 6. Global Keyboard Shortcuts Listener
  useEffect(() => {
    if (!isPdfStudioOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter shortcut to save and auto-advance to next question number!
      if (e.key === 'Enter') {
        if (document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        handleApplyCropAndAdvance(true);
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleApplyCropAndAdvance(false);
        return;
      }

      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'Escape') {
        closePdfStudio();
        return;
      }

      // Column presets
      if (e.key === '1') {
        setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.49 }));
        addToast({ title: 'Column Preset', description: 'Snapped to Left Column (0.035 - 0.490)', type: 'info' });
        return;
      }
      if (e.key === '2') {
        setActiveBox((b) => ({ ...b, xmin: 0.508, xmax: 0.965 }));
        addToast({ title: 'Column Preset', description: 'Snapped to Right Column (0.508 - 0.965)', type: 'info' });
        return;
      }
      if (e.key === '3') {
        setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.965 }));
        addToast({ title: 'Column Preset', description: 'Snapped to Full Width', type: 'info' });
        return;
      }

      // Whitespace Valley snap
      if (e.key.toLowerCase() === 's' && !e.ctrlKey) {
        if (canvasRef.current) {
          const snapped = snapBoxToHorizontalWhitespaceValleys(canvasRef.current, activeBox);
          setActiveBox(snapped);
          addToast({ title: 'Whitespace Valley Snapped', description: 'Boundaries aligned to whitespace', type: 'info' });
        }
        return;
      }

      // Toggles
      if (e.key.toLowerCase() === 'w') {
        setAutoWhiten((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === 'l') {
        setEnableLoupe((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        setShow4LineGrid((v) => !v);
        return;
      }

      // Paging
      if (e.key === '[' || e.key === 'PageUp') {
        setCurrentPage((p) => Math.max(1, p - 1));
        return;
      }
      if (e.key === ']' || e.key === 'PageDown') {
        setCurrentPage((p) => Math.min(totalPages || 1, p + 1));
        return;
      }

      // Arrow keys for nudging
      const nudge = e.altKey ? 0.001 : e.shiftKey ? 0.02 : 0.005;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveBox((b) => ({ ...b, ymin: Math.max(0, b.ymin - nudge), ymax: Math.max(b.ymin + 0.01, b.ymax - nudge) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveBox((b) => ({ ...b, ymin: Math.min(1 - 0.01, b.ymin + nudge), ymax: Math.min(1, b.ymax + nudge) }));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveBox((b) => ({ ...b, xmin: Math.max(0, b.xmin - nudge), xmax: Math.max(b.xmin + 0.01, b.xmax - nudge) }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveBox((b) => ({ ...b, xmin: Math.min(1 - 0.01, b.xmin + nudge), xmax: Math.min(1, b.xmax + nudge) }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPdfStudioOpen, totalPages, activeBox, handleApplyCrop, closePdfStudio, addToast]);

  if (!isPdfStudioOpen) return null;

  return (
    <div
      id="unified-pdf-studio-modal"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-slate-100 backdrop-blur-md select-none animate-fadeIn"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 1. TOP HEADER & STUDIO WORKBENCH TOOLBAR */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 shrink-0">
        {/* Left Title & Document Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Unified PDF Precision Studio
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                  {studioMode === 'layout' ? 'Layout Audit Mode' : 'Precision Cropper Mode'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[280px]">
                {pdfFileName || 'source_document.pdf'} • Page {currentPage} of {totalPages || 1}
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Mode Switcher Pill */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
            <button
              onClick={() => setStudioMode('layout')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                studioMode === 'layout'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Layout & Boundary Audit</span>
            </button>
            <button
              onClick={() => setStudioMode('precision')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                studioMode === 'precision'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Precision Cropper</span>
            </button>
          </div>
        </div>

        {/* Center Page Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || loadingDoc}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 disabled:opacity-40"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 text-xs font-semibold">
            <span className="text-slate-400">Page</span>
            <input
              type="number"
              min={1}
              max={totalPages || 1}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                  setCurrentPage(val);
                }
              }}
              className="w-12 px-1.5 py-1 text-center bg-slate-950 border border-slate-700 rounded-md text-white font-mono"
            />
            <span className="text-slate-400">/ {totalPages || 1}</span>
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || loadingDoc}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 disabled:opacity-40"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Studio Tool Toggles & Zoom */}
        <div className="flex items-center gap-2">
          {/* 4-Line Grid Toggle */}
          <button
            onClick={() => setShow4LineGrid((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              show4LineGrid
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle 2-Column 4-Line Grid Guidelines (x: 0.035, 0.490, 0.508, 0.965)"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">4-Line Grid</span>
          </button>

          {/* Magnetic Whitespace Snapping */}
          <button
            onClick={() => setEnableMagneticSnapping((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              enableMagneticSnapping
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Magnetic Whitespace Snapping (prevents cutting text lines)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-Snap</span>
          </button>

          {/* Unmapped Gaps Detector */}
          <button
            onClick={() => setDetectUnmappedGaps((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              detectUnmappedGaps
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Highlight unmapped page areas and missing diagrams"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Gaps</span>
          </button>

          {/* Precision Loupe Toggle */}
          <button
            onClick={() => setEnableLoupe((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              enableLoupe
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle Precision Loupe Magnifier Glass"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Loupe</span>
          </button>

          {/* Marking Scheme Studio Trigger */}
          <button
            onClick={() => setIsMarkingModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900 transition-all shadow-sm"
            title="Configure Marking Scheme (+cm, -im) for question, range, subject, or entire paper"
          >
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Marking Scheme</span>
            <span className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-200 font-mono">
              +{marksScheme.cm}/{marksScheme.im}
            </span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5 text-xs">
            <button
              onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
              className="p-1 hover:text-white text-slate-400"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono px-1.5 text-slate-300 text-[11px]">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1 hover:text-white text-slate-400"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Close Studio */}
          <button
            onClick={closePdfStudio}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close Studio (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN DUAL-PANE WORKBENCH */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT / CENTER: INTERACTIVE VECTOR PDF STAGE */}
        <div className="flex-1 relative overflow-auto bg-slate-950/90 flex justify-center p-6 shadow-inner custom-scrollbar">
          {loadingDoc ? (
            <div className="flex flex-col items-center justify-center m-auto text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <span className="text-sm font-semibold text-slate-200">Loading High-DPI Vector Document...</span>
            </div>
          ) : !pdfDoc ? (
            /* Upload Fallback if Document Genuinely Missing */
            <div className="flex flex-col items-center justify-center m-auto max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Attach Source PDF Document</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload the original question paper PDF to enable live boundary auditing, layout inspection, and precision re-cropping.
                </p>
              </div>
              <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>Browse PDF File</span>
                <input type="file" accept="application/pdf" onChange={handleManualUpload} className="hidden" />
              </label>
            </div>
          ) : (
            /* ACTIVE PDF CANVAS CONTAINER & VECTOR OVERLAYS */
            <div
              ref={overlayContainerRef}
              onMouseDown={handleMouseDownOnCanvas}
              className="relative inline-block select-none shadow-2xl rounded-lg overflow-visible my-auto transition-all"
              style={{
                width: canvasDimensions.width > 0 ? `${canvasDimensions.width}px` : (canvasRef.current?.width ? `${canvasRef.current.width}px` : 'auto'),
                height: canvasDimensions.height > 0 ? `${canvasDimensions.height}px` : (canvasRef.current?.height ? `${canvasRef.current.height}px` : 'auto'),
                minWidth: canvasDimensions.width > 0 ? `${canvasDimensions.width}px` : undefined,
                minHeight: canvasDimensions.height > 0 ? `${canvasDimensions.height}px` : undefined,
              }}
            >
              <canvas ref={canvasRef} className="block rounded-lg shadow-2xl border border-slate-800" />

              {/* 4-LINE GRID VERTICAL GUIDELINES */}
              {show4LineGrid && (
                <div className="absolute inset-0 pointer-events-none z-10">
                  {/* Left Column Left Boundary (x: 0.035) */}
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-cyan-500/60"
                    style={{ left: '3.5%' }}
                  >
                    <span className="absolute top-2 -left-3 text-[9px] font-mono text-cyan-400 bg-slate-950/80 px-1 rounded">
                      L1 (0.035)
                    </span>
                  </div>
                  {/* Left Column Right Boundary (x: 0.490) */}
                  <div
                    className="absolute top-0 bottom-0 border-r border-dashed border-cyan-500/60"
                    style={{ left: '49.0%' }}
                  >
                    <span className="absolute top-2 -left-3 text-[9px] font-mono text-cyan-400 bg-slate-950/80 px-1 rounded">
                      L2 (0.490)
                    </span>
                  </div>
                  {/* Right Column Left Boundary (x: 0.508) */}
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-blue-500/60"
                    style={{ left: '50.8%' }}
                  >
                    <span className="absolute top-2 -left-3 text-[9px] font-mono text-blue-400 bg-slate-950/80 px-1 rounded">
                      R1 (0.508)
                    </span>
                  </div>
                  {/* Right Column Right Boundary (x: 0.965) */}
                  <div
                    className="absolute top-0 bottom-0 border-r border-dashed border-blue-500/60"
                    style={{ left: '96.5%' }}
                  >
                    <span className="absolute top-2 -left-3 text-[9px] font-mono text-blue-400 bg-slate-950/80 px-1 rounded">
                      R2 (0.965)
                    </span>
                  </div>
                </div>
              )}

              {/* UNMAPPED GAP BOXES (AMBER DASHED) */}
              {detectUnmappedGaps &&
                unmappedGaps.map((gap, idx) => (
                  <div
                    key={`gap-${idx}`}
                    className="absolute border border-dashed border-amber-500/60 bg-amber-500/10 rounded group cursor-pointer transition-all hover:bg-amber-500/20 z-15"
                    style={{
                      left: `${gap.xmin * 100}%`,
                      top: `${gap.ymin * 100}%`,
                      width: `${(gap.xmax - gap.xmin) * 100}%`,
                      height: `${(gap.ymax - gap.ymin) * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateQuestionFromGap(gap);
                    }}
                  >
                    <div className="absolute top-1 left-1 opacity-80 group-hover:opacity-100 transition-opacity bg-amber-950/90 text-amber-300 font-bold text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 flex items-center gap-1 shadow">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>Unmapped Gap ({gap.column}) • Click to Crop</span>
                    </div>
                  </div>
                ))}

              {/* ALL QUESTION BOUNDING BOXES (ON CURRENT PAGE - PAST CROPPED REGIONS & EDIT TARGETS) */}
              {pageBoxes.map((item) => {
                const isSelected = selectedQuestionId === item.questionId && selectedPartIndex === item.partIndex;
                const isEditMode = precisionSubMode === 'edit';

                let borderStyle = isEditMode
                  ? 'border-purple-500/80 bg-purple-500/15 text-purple-200 cursor-pointer hover:bg-purple-500/30 hover:border-purple-300'
                  : 'border-emerald-500/70 bg-emerald-500/10 text-emerald-300 pointer-events-auto hover:bg-emerald-500/20';

                if (item.status === 'split') {
                  borderStyle = 'border-yellow-500/80 bg-yellow-500/15 text-yellow-300';
                }
                if (item.status === 'overlap') {
                  borderStyle = 'border-red-500 bg-red-500/25 text-red-300 animate-pulse';
                }
                if (isSelected && isEditMode) {
                  borderStyle = 'border-purple-400 bg-purple-500/25 text-white ring-2 ring-purple-400 shadow-xl shadow-purple-500/20';
                }

                return (
                  <div
                    key={`${item.questionId}-${item.partIndex}`}
                    onMouseEnter={() => setHoveredQId(item.questionId)}
                    onMouseLeave={() => setHoveredQId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedQuestionId(item.questionId);
                      setSelectedPartIndex(item.partIndex);
                      setActiveBox({ ...item.box });
                      setSubjectName(item.subjectName);
                      setSectionName(item.sectionName);
                      setQuestionNumber(item.que);
                      setQuestionType(item.type as any);
                      setAnswerOptions(item.answerOptions || '');
                      setMarksScheme(item.marks || MARKING_PRESETS[0].marks);
                      if (!isEditMode) {
                        setPrecisionSubMode('edit');
                        setTargetOperation('replace_part');
                        addToast({
                          title: `Selected Q.${item.que}`,
                          description: 'Switched to Edit Mode for this question.',
                          type: 'info',
                        });
                      }
                    }}
                    className={`absolute border-2 rounded-lg transition-all z-20 ${borderStyle}`}
                    style={{
                      left: `${item.box.xmin * 100}%`,
                      top: `${item.box.ymin * 100}%`,
                      width: `${(item.box.xmax - item.box.xmin) * 100}%`,
                      height: `${(item.box.ymax - item.box.ymin) * 100}%`,
                    }}
                    title={`Q.${item.que} (${item.subjectName} > ${item.sectionName}) - Click to inspect/edit`}
                  >
                    {/* Floating Question Tag Badge */}
                    <div
                      className={`absolute -top-5 left-0 px-2 py-0.5 rounded text-[10px] font-bold shadow flex items-center gap-1.5 whitespace-nowrap ${
                        isSelected && isEditMode
                          ? 'bg-purple-600 text-white ring-1 ring-purple-300'
                          : isEditMode
                          ? 'bg-purple-950/90 text-purple-200 border border-purple-700/60'
                          : 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60'
                      }`}
                    >
                      <span className="font-mono">Q.{item.que}</span>
                      <span className="text-[9px] opacity-75 font-normal">({item.subjectName})</span>
                      <span className="text-[9px] px-1 rounded bg-black/40 font-mono uppercase">{item.type}</span>
                      {item.answerOptions && (
                        <span className="text-[9px] px-1 rounded bg-emerald-600/60 text-emerald-100 font-mono">
                          Ans: {item.answerOptions}
                        </span>
                      )}
                      {item.isSplit && <span className="text-[9px] opacity-80">(Part {item.partIndex})</span>}
                      {item.status === 'overlap' && (
                        <span className="text-[9px] text-red-400 font-normal">⚠️ Overlap</span>
                      )}
                      {isEditMode && <span className="text-[9px] opacity-75">✏️ edit</span>}
                    </div>

                    {/* Bottom Right Past Question Badge */}
                    {!isEditMode && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-emerald-950/90 border border-emerald-600/50 rounded text-[9px] font-semibold text-emerald-300 pointer-events-none opacity-90 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        <span>Cropped</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* LINE-BASED CROPPER OVERLAY */}
              {cropToolType === 'line' && (
                <LineCropperOverlay
                  activeBox={activeBox}
                  onChangeBox={(newBox) => setActiveBox(newBox)}
                  containerWidth={canvasDimensions.width || canvasRef.current?.width || 800}
                  containerHeight={canvasDimensions.height || canvasRef.current?.height || 1100}
                  questionNumber={Number(questionNumber) || 1}
                  onApplyCrop={() => handleApplyCropAndAdvance(true)}
                  onUndoLineCut={handleUndoLineCut}
                  columnMode={lineColumnMode}
                  onColumnModeChange={(mode) => setLineColumnMode(mode)}
                  onSetColumnPreset={(preset) => {
                    if (preset === 'left') {
                      setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.49 }));
                      addToast({ title: 'Column Preset', description: 'Left Column (0.035 - 0.49)', type: 'info' });
                    } else if (preset === 'right') {
                      setActiveBox((b) => ({ ...b, xmin: 0.508, xmax: 0.965 }));
                      addToast({ title: 'Column Preset', description: 'Right Column (0.508 - 0.965)', type: 'info' });
                    } else {
                      setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.965 }));
                      addToast({ title: 'Column Preset', description: 'Full Width (0.035 - 0.965)', type: 'info' });
                    }
                  }}
                />
              )}

              {/* ACTIVE SELECTION RESIZABLE CROP BOX (BOX CROPPER MODE) */}
              {cropToolType === 'box' && (
                <div
                  className="absolute border-2 border-indigo-400 bg-indigo-500/20 rounded shadow-xl pointer-events-auto z-30 ring-2 ring-indigo-400/40"
                  style={{
                    left: `${activeBox.xmin * 100}%`,
                    top: `${activeBox.ymin * 100}%`,
                    width: `${(activeBox.xmax - activeBox.xmin) * 100}%`,
                    height: `${(activeBox.ymax - activeBox.ymin) * 100}%`,
                  }}
                >
                  {/* 8-Point Interactive Resizing Handles */}
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => {
                    let handleClasses = 'absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-xs shadow-md z-40';
                    let posStyle: React.CSSProperties = {};

                    if (handle === 'nw') posStyle = { top: -6, left: -6, cursor: 'nwse-resize' };
                    if (handle === 'n') posStyle = { top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
                    if (handle === 'ne') posStyle = { top: -6, right: -6, cursor: 'nesw-resize' };
                    if (handle === 'e') posStyle = { top: '50%', right: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' };
                    if (handle === 'se') posStyle = { bottom: -6, right: -6, cursor: 'nwse-resize' };
                    if (handle === 's') posStyle = { bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
                    if (handle === 'sw') posStyle = { bottom: -6, left: -6, cursor: 'nesw-resize' };
                    if (handle === 'w') posStyle = { top: '50%', left: -6, transform: 'translateY(-50%)', cursor: 'ew-resize' };

                    return (
                      <div
                        key={handle}
                        onMouseDown={(e) => handleHandleMouseDown(e, handle)}
                        className={handleClasses}
                        style={posStyle}
                      />
                    );
                  })}

                  {/* Move Center Anchor */}
                  <div
                    onMouseDown={(e) => handleHandleMouseDown(e, 'move')}
                    className="absolute inset-0 cursor-move flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <div className="px-2 py-1 bg-indigo-950/90 text-indigo-200 text-[10px] font-bold rounded border border-indigo-500/40 flex items-center gap-1 shadow-lg">
                      <Move className="w-3 h-3" />
                      <span>Drag to Reposition</span>
                    </div>
                  </div>

                  {/* In-Canvas Floating HUD Bar */}
                  <div className="absolute -top-9 right-0 flex items-center gap-1 bg-slate-900/95 border border-slate-700 rounded-lg p-1 shadow-2xl z-50">
                    <button
                      onClick={() => {
                        if (canvasRef.current) {
                          const snapped = snapBoxToHorizontalWhitespaceValleys(canvasRef.current, activeBox);
                          setActiveBox(snapped);
                          addToast({ title: 'Snapped', description: 'Boundaries snapped to whitespace valleys', type: 'info' });
                        }
                      }}
                      className="p-1 hover:bg-slate-800 text-emerald-400 rounded"
                      title="Smart Whitespace Snap"
                    >
                      <Magnet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setStudioMode('precision')}
                      className="p-1 hover:bg-slate-800 text-indigo-400 rounded"
                      title="Open in Precision Mode"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleApplyCropAndAdvance(true)}
                      disabled={isSavingCrop}
                      className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded shadow"
                      title="Save & Advance to next question (Enter)"
                    >
                      {isSavingCrop ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span>Save & Next</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Precision Loupe Magnifier Overlay */}
          {enableLoupe && loupeVisible && canvasRef.current && (
            <PrecisionLoupe
              visible={loupeVisible}
              pos={loupePos}
              canvasRef={canvasRef}
              zoomLevel={3.0}
              label={loupeLabel}
            />
          )}
        </div>

        {/* RIGHT SIDEBAR: DYNAMIC WORKBENCH PANEL */}
        <aside className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          {studioMode === 'layout' ? (
            /* LAYOUT AUDIT WORKBENCH */
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Page {currentPage} Layout Summary
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {pageBoxes.length} Questions
                </span>
              </div>

              {/* Metric Badges */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-emerald-400 text-base">{pageBoxes.filter((b) => b.status === 'valid').length}</div>
                  <div className="text-[10px] text-slate-400">Valid</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-yellow-400 text-base">{pageBoxes.filter((b) => b.status === 'split').length}</div>
                  <div className="text-[10px] text-slate-400">Multi-part</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-red-400 text-base">{pageBoxes.filter((b) => b.status === 'overlap').length}</div>
                  <div className="text-[10px] text-slate-400">Collisions</div>
                </div>
              </div>

              {/* Questions List on Current Page */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">Questions on this Page</h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {pageBoxes.map((b) => {
                    const isSelected = selectedQuestionId === b.questionId;
                    return (
                      <div
                        key={`${b.questionId}-${b.partIndex}`}
                        onClick={() => {
                          setSelectedQuestionId(b.questionId);
                          setSelectedPartIndex(b.partIndex);
                          setActiveBox({ ...b.box });
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-950/60 border-purple-500/60 text-purple-200'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">
                            Q.{b.que} • {b.subjectName}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                            {b.type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {b.sectionName} {b.isSplit && `• Part ${b.partIndex}/${b.totalParts}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Unmapped Gaps List */}
              {unmappedGaps.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Unmapped Area Gaps ({unmappedGaps.length})
                  </h4>
                  <div className="space-y-1.5">
                    {unmappedGaps.map((gap, gIdx) => (
                      <button
                        key={`gap-btn-${gIdx}`}
                        onClick={() => handleCreateQuestionFromGap(gap)}
                        className="w-full p-2 text-left rounded-xl bg-amber-950/30 hover:bg-amber-950/60 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between transition-colors"
                      >
                        <span>
                          {gap.column.toUpperCase()} Column Gap (y: {gap.ymin.toFixed(2)} → {gap.ymax.toFixed(2)})
                        </span>
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PRECISION CROPPER WORKBENCH */
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Crop className="w-3.5 h-3.5 text-indigo-400" />
                  Precision Cropper Tools
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {((activeBox.xmax - activeBox.xmin) * 100).toFixed(0)}% × {((activeBox.ymax - activeBox.ymin) * 100).toFixed(0)}%
                </span>
              </div>

              {/* Sub-Mode Switcher: Cropping vs Edit */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cropper Mode</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setPrecisionSubMode('crop');
                      setTargetOperation('new_question');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      precisionSubMode === 'crop'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Cropping Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrecisionSubMode('edit');
                      setTargetOperation('replace_part');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      precisionSubMode === 'edit'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Mode ({pageBoxes.length})</span>
                  </button>
                </div>
              </div>

              {/* Tool Style: Box vs Line Cropper */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tool Style</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCropToolType('box')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      cropToolType === 'box'
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Box Cropper</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropToolType('line')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      cropToolType === 'line'
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Line-Based</span>
                  </button>
                </div>
              </div>

              {/* Column Quick Snaps */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Column Preset</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    onClick={() => setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.49 }))}
                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300"
                  >
                    Left Col
                  </button>
                  <button
                    onClick={() => setActiveBox((b) => ({ ...b, xmin: 0.508, xmax: 0.965 }))}
                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300"
                  >
                    Right Col
                  </button>
                  <button
                    onClick={() => setActiveBox((b) => ({ ...b, xmin: 0.035, xmax: 0.965 }))}
                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300"
                  >
                    Full Width
                  </button>
                </div>
              </div>

              {/* Marking Scheme Quick Bar */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Marking Scheme</span>
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                    <span>+{marksScheme.cm}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-rose-400">{marksScheme.im}</span>
                    {marksScheme.schemeType && (
                      <span className="text-[10px] text-slate-400 font-normal capitalize">({marksScheme.schemeType.replace('_', ' ')})</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMarkingModalOpen(true)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 transition-all"
                >
                  <Award className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Configure...</span>
                </button>
              </div>

              {/* Mandatory Subject & Optional Section Form */}
              <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                {/* Subject */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                      <span>Subject</span>
                      <span className="text-rose-400 text-xs">*</span>
                      <span className="text-[9px] font-normal text-rose-400/80">(Mandatory)</span>
                    </label>
                    {!isCustomSubject ? (
                      <button
                        type="button"
                        onClick={() => setIsCustomSubject(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        + Custom
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCustomSubject(false)}
                        className="text-[10px] text-slate-400 hover:text-slate-300 font-medium"
                      >
                        ← Preset List
                      </button>
                    )}
                  </div>

                  {isCustomSubject ? (
                    <input
                      type="text"
                      value={subjectName}
                      onChange={(e) => {
                        setSubjectName(e.target.value);
                        if (e.target.value.trim()) setSubjectError(false);
                      }}
                      placeholder="Type custom subject name..."
                      className={`w-full px-2.5 py-1.5 bg-slate-950 rounded-lg text-xs text-white font-medium border ${
                        subjectError ? 'border-rose-500 ring-1 ring-rose-500/50' : 'border-slate-800 focus:border-indigo-500'
                      }`}
                    />
                  ) : (
                    <select
                      value={subjectName}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSubject(true);
                        } else {
                          setSubjectName(e.target.value);
                          if (e.target.value.trim()) setSubjectError(false);
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 bg-slate-950 rounded-lg text-xs text-white font-medium border ${
                        subjectError ? 'border-rose-500 ring-1 ring-rose-500/50' : 'border-slate-800 focus:border-indigo-500'
                      }`}
                    >
                      <option value="" disabled>-- Select Subject (Mandatory) --</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                      <option value="__custom__">+ Add Custom Subject...</option>
                    </select>
                  )}

                  {subjectError && (
                    <p className="text-[10px] text-rose-400 flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Subject is mandatory before saving.
                    </p>
                  )}
                </div>

                {/* Section (Optional) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                      <span>Section</span>
                      <span className="text-[9px] font-normal text-slate-500">(Optional)</span>
                    </label>
                    {!isCustomSection ? (
                      <button
                        type="button"
                        onClick={() => setIsCustomSection(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        + Custom
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCustomSection(false)}
                        className="text-[10px] text-slate-400 hover:text-slate-300 font-medium"
                      >
                        ← Preset List
                      </button>
                    )}
                  </div>

                  {isCustomSection ? (
                    <input
                      type="text"
                      value={sectionName}
                      onChange={(e) => setSectionName(e.target.value)}
                      placeholder="Section 1"
                      className="w-full px-2.5 py-1.5 bg-slate-950 rounded-lg text-xs text-white font-medium border border-slate-800 focus:border-indigo-500"
                    />
                  ) : (
                    <select
                      value={sectionName}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSection(true);
                        } else {
                          setSectionName(e.target.value);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 rounded-lg text-xs text-white font-medium border border-slate-800 focus:border-indigo-500"
                    >
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                      <option value="__custom__">+ Add Custom Section...</option>
                    </select>
                  )}
                </div>

                {/* Question Number & Operation */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Question Number</label>
                    <input
                      type="number"
                      min={1}
                      value={questionNumber}
                      onChange={(e) => setQuestionNumber(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-xs"
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Target Action</label>
                    <select
                      value={targetOperation}
                      onChange={(e) => setTargetOperation(e.target.value as any)}
                      className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs font-medium"
                    >
                      <option value="new_question">New Question</option>
                      <option value="replace_part">Replace Image</option>
                      <option value="add_part">Append Part</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Answer Key Input Bar */}
              <div className="pt-2 border-t border-slate-800">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Question Type & Answer Key
                </label>
                <AnswerKeyInputBar
                  questionType={questionType}
                  answerValue={answerOptions}
                  onChangeAnswer={(ans) => setAnswerOptions(ans)}
                  onChangeType={(type) => setQuestionType(type)}
                />
              </div>

              {/* Live Preview Thumbnail Box */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Live Crop Preview</span>
                  </label>
                  <button
                    onClick={async () => {
                      if (!pdfPageObjRef.current) return;
                      setIsPeekingText(true);
                      try {
                        const txt = await getTextInBoxFromPdfPage(pdfPageObjRef.current, activeBox);
                        setPeekedText(txt || '(No selectable text layer found in this box)');
                      } catch (e: any) {
                        setPeekedText('Text extraction error');
                      } finally {
                        setIsPeekingText(false);
                      }
                    }}
                    disabled={isPeekingText}
                    className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30"
                    title="Peek selectable OCR text in active bounding box"
                  >
                    {isPeekingText ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scan className="w-3 h-3" />}
                    <span>Peek OCR Text</span>
                  </button>
                </div>

                {peekedText && (
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-mono max-h-24 overflow-y-auto relative">
                    <p className="line-clamp-4">{peekedText}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(peekedText);
                        addToast({ title: 'Copied', description: 'OCR text copied to clipboard', type: 'info' });
                      }}
                      className="absolute top-1 right-1 p-1 bg-slate-800 text-slate-300 hover:text-white rounded"
                      title="Copy text"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Whiten and Quality Controls */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoWhiten}
                    onChange={(e) => setAutoWhiten(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>✨ Auto-Whiten Scanner Background</span>
                </label>
              </div>

              {/* Commit / Save Actions */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => handleApplyCropAndAdvance(true)}
                  disabled={isSavingCrop}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  title="Save current question crop and advance to next question number (Enter)"
                >
                  {isSavingCrop ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerDownLeft className="w-4 h-4" />}
                  <span>
                    {precisionSubMode === 'edit'
                      ? `Update Q.${questionNumber || ''} (Enter ↵)`
                      : `Save & Next Question (Enter ↵)`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyCropAndAdvance(false)}
                  disabled={isSavingCrop}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  title="Save current question crop and stay on current question number"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Only (Stay on Q.{questionNumber || ''})</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 3. BOTTOM QUESTION TIMELINE RIBBON */}
      {activeArchive && (
        <div className="bg-slate-900/90 border-t border-slate-800 p-2 shrink-0">
          <BottomQuestionTimeline
            questions={allArchiveQuestions}
            activeQuestionId={selectedQuestionId}
            onSelectQuestion={(q) => {
              setSelectedQuestionId(q.id);
              setSelectedPartIndex(1);
              const firstPart = q.parts[0];
              if (firstPart) {
                if (firstPart.page && firstPart.page !== currentPage) {
                  setCurrentPage(firstPart.page);
                }
                setActiveBox({ ...firstPart.box });
              }
              setSubjectName(q.subject);
              setSectionName(q.section);
              setQuestionNumber(q.que);
              setQuestionType(q.type);
              setAnswerOptions(q.answerOptions);
              setMarksScheme(q.marks);
            }}
            onDeleteQuestion={() => {}}
            onDuplicateQuestion={() => {}}
          />
        </div>
      )}

      {/* 4. MARKING SCHEME CONFIGURATION MODAL */}
      <MarkingSchemeModal
        isOpen={isMarkingModalOpen}
        onClose={() => setIsMarkingModalOpen(false)}
        activeArchive={activeArchive}
        subjects={activeArchive?.subjects || []}
        activeQuestionId={selectedQuestionId || undefined}
        activeQuestionNumber={typeof questionNumber === 'number' ? questionNumber : undefined}
        activeSubjectId={activeArchive?.subjects?.find((s) => s.name === subjectName)?.id}
        activeSectionId={activeArchive?.subjects
          ?.find((s) => s.name === subjectName)
          ?.sections?.find((sec) => sec.name === sectionName)?.id}
        currentScheme={marksScheme}
        onApply={(scheme, scope) => {
          applyMarkingSchemeWithScope(scheme, scope);
          setMarksScheme(scheme);
          addToast({
            title: 'Marking Scheme Applied',
            description: `Applied +${scheme.cm} / ${scheme.im} scheme across ${scope.type.replace('_', ' ')}`,
            type: 'success',
          });
        }}
      />
    </div>
  );
};
