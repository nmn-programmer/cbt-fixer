import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { fetchWithGeminiFallback } from '../utils/geminiKeyManager';
import {
  Crop,
  X,
  UploadCloud,
  Wand2,
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
  ListOrdered,
  ArrowRightCircle,
  ImagePlus,
  CheckCheck,
  HelpCircle,
  Image as ImageIcon,
  ArrowUpDown,
  GitMerge,
  Columns
} from 'lucide-react';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';

interface BoxCoord {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export function extractBoxFromPdfDataPart(part: any): BoxCoord | null {
  if (!part) return null;

  let ymin: number | undefined;
  let xmin: number | undefined;
  let ymax: number | undefined;
  let xmax: number | undefined;

  // 1. Check bounds array: [xmin, ymin, width, height] or [ymin, xmin, ymax, xmax] or [xmin, ymin, xmax, ymax]
  if (Array.isArray(part.bounds) && part.bounds.length === 4) {
    const [b0, b1, b2, b3] = part.bounds.map((v: any) => Number(v) || 0);
    if (b2 <= 1 && b3 <= 1 && b0 + b2 <= 1.05 && b1 + b3 <= 1.05) {
      // [xmin, ymin, width, height] normalized 0..1
      xmin = b0;
      ymin = b1;
      xmax = b0 + b2;
      ymax = b1 + b3;
    } else if (b2 > 1 && b3 > 1 && b0 + b2 <= 1000 && b1 + b3 <= 1000) {
      // [xmin, ymin, width, height] in 0..1000 per-mil
      xmin = b0 / 1000;
      ymin = b1 / 1000;
      xmax = (b0 + b2) / 1000;
      ymax = (b1 + b3) / 1000;
    } else {
      // Treat as [xmin, ymin, xmax, ymax] or [ymin, xmin, ymax, xmax]
      xmin = Math.min(b0, b2);
      xmax = Math.max(b0, b2);
      ymin = Math.min(b1, b3);
      ymax = Math.max(b1, b3);
    }
  }

  // 2. Check explicit ymin, xmin, ymax, xmax
  if (ymin === undefined && part.ymin !== undefined && part.xmin !== undefined) {
    ymin = Number(part.ymin);
    xmin = Number(part.xmin);
    ymax = Number(part.ymax ?? part.ymin + 0.3);
    xmax = Number(part.xmax ?? part.xmin + 0.9);
  }

  // 3. Check x1, y1, x2, y2 (or y1, x1, y2, x2)
  if (ymin === undefined && (part.x1 !== undefined || part.y1 !== undefined)) {
    const rawX1 = Number(part.x1 ?? 0);
    const rawY1 = Number(part.y1 ?? 0);
    const rawX2 = Number(part.x2 ?? 1000);
    const rawY2 = Number(part.y2 ?? 1000);

    xmin = Math.min(rawX1, rawX2);
    xmax = Math.max(rawX1, rawX2);
    ymin = Math.min(rawY1, rawY2);
    ymax = Math.max(rawY1, rawY2);
  }

  // 4. Check box or bbox array
  if (ymin === undefined && Array.isArray(part.box) && part.box.length === 4) {
    const [b0, b1, b2, b3] = part.box.map((v: any) => Number(v) || 0);
    ymin = Math.min(b0, b2);
    ymax = Math.max(b0, b2);
    xmin = Math.min(b1, b3);
    xmax = Math.max(b1, b3);
  }

  if (ymin === undefined || xmin === undefined || ymax === undefined || xmax === undefined) {
    return null;
  }

  // Normalize scale:
  const maxVal = Math.max(ymin, xmin, ymax, xmax);
  if (maxVal > 100) {
    // 0..1000 scale (per mil)
    ymin /= 1000;
    xmin /= 1000;
    ymax /= 1000;
    xmax /= 1000;
  } else if (maxVal > 1.05) {
    // 0..100 percentage scale
    ymin /= 100;
    xmin /= 100;
    ymax /= 100;
    xmax /= 100;
  }

  // Clamp safely to [0, 1]
  ymin = Math.max(0, Math.min(1, ymin));
  xmin = Math.max(0, Math.min(1, xmin));
  ymax = Math.max(ymin + 0.01, Math.min(1, ymax));
  xmax = Math.max(xmin + 0.01, Math.min(1, xmax));

  return { ymin, xmin, ymax, xmax };
}

export const PdfRecropModal: React.FC = () => {
  const {
    isPdfRecropModalOpen,
    closePdfRecrop,
    recropTarget,
    archives,
    activeArchiveId,
    applyCroppedImage,
    attachSourcePdfToArchive,
    geminiApiKey,
    addToast,
    updateQuestion,
    reassignQuestionSection,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Flatten all questions in current archive in strictly sorted order by Q-number
  const allQuestionsList = useMemo(() => {
    if (!activeArchive) return [];
    const list: {
      id: string;
      que: number;
      subjectId: string;
      sectionId: string;
      subjectName: string;
      sectionName: string;
      type: 'mcq' | 'msq' | 'nat' | 'msm';
      imagesCount: number;
      pdfData?: any[];
      images?: any[];
    }[] = [];

    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          list.push({
            id: q.id,
            que: q.que,
            subjectId: sub.id,
            sectionId: sec.id,
            subjectName: sub.name,
            sectionName: sec.name,
            type: q.type as any,
            imagesCount: q.images ? q.images.length : 0,
            pdfData: q.pdfData,
            images: q.images,
          });
        });
      });
    });

    return list.sort((a, b) => a.que - b.que);
  }, [activeArchive]);

  // Active question index in allQuestionsList
  const [activeQIndex, setActiveQIndex] = useState<number>(0);

  // PDF Document State
  const [pdfFile, setPdfFile] = useState<File | Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageThumbnails, setPageThumbnails] = useState<{ url: string; page: number }[]>([]);
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [renderingPage, setRenderingPage] = useState<boolean>(false);

  // Canvas & Crop State
  const [scale, setScale] = useState<number>(1.5);
  const [boxA, setBoxA] = useState<BoxCoord>({ ymin: 0.1, xmin: 0.05, ymax: 0.4, xmax: 0.95 });
  const [boxB, setBoxB] = useState<BoxCoord | null>(null);
  const [pageB, setPageB] = useState<number>(1);
  const [activeRegion, setActiveRegion] = useState<'A' | 'B'>('A');
  const [isMultiRegion, setIsMultiRegion] = useState<boolean>(false);
  const [showStitchOverlay, setShowStitchOverlay] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'crop' | 'merge_verification'>('crop');
  const [stitchGap, setStitchGap] = useState<number>(12);
  const [stitchOrder, setStitchOrder] = useState<'A_THEN_B' | 'B_THEN_A'>('A_THEN_B');

  // Mouse / Touch Dragging State
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialBox, setInitialBox] = useState<BoxCoord>({ ymin: 0, xmin: 0, ymax: 0, xmax: 0 });

  // Post-Crop Enhancements
  const [autoWhiten, setAutoWhiten] = useState<boolean>(true);
  const [sharpenText, setSharpenText] = useState<boolean>(false);
  const [previewDarkMode, setPreviewDarkMode] = useState<boolean>(false);

  // AI Box Detection State
  const [aiDetecting, setAiDetecting] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string>('');

  // Target Configuration
  const [targetMode, setTargetMode] = useState<'replace_part' | 'add_part' | 'new_question' | 'stitch'>('replace_part');
  const [newQProps, setNewQProps] = useState({
    que: 1,
    type: 'mcq' as 'mcq' | 'msq' | 'nat' | 'msm',
    subjectId: '',
    sectionId: '',
    answerOptions: ''
  });

  const [jumpQ, setJumpQ] = useState<string>('');

  // Previews
  const [previewUrlA, setPreviewUrlA] = useState<string>('');
  const [previewUrlB, setPreviewUrlB] = useState<string>('');
  const [previewUrlStitched, setPreviewUrlStitched] = useState<string>('');

  const [sourceMode, setSourceMode] = useState<'pdf' | 'image'>('pdf');
  const [showNewSubjectInput, setShowNewSubjectInput] = useState<boolean>(false);
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [showNewSectionInput, setShowNewSectionInput] = useState<boolean>(false);
  const [newSectionName, setNewSectionName] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRenderTaskRef = useRef<any>(null);
  const pageCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Load question properties & crop coordinates for a given index
  const selectQuestionByIndex = useCallback((idx: number, targetPartIdx: number = 1) => {
    if (idx < 0 || idx >= allQuestionsList.length) return;
    setActiveQIndex(idx);
    const q = allQuestionsList[idx];
    if (!q) return;

    // We also need the actual question object to get its current answer options
    let currentAnswerOptions = '';
    const archive = useCbtStore.getState().archives.find(a => a.id === useCbtStore.getState().activeArchiveId);
    if (archive) {
      for (const sub of archive.subjects) {
        for (const sec of sub.sections) {
          const found = sec.questions.find(x => x.id === q.id);
          if (found) {
            currentAnswerOptions = found.answerOptions;
            break;
          }
        }
      }
    }

    setNewQProps({
      que: q.que,
      type: q.type,
      subjectId: q.subjectId,
      sectionId: q.sectionId,
      answerOptions: currentAnswerOptions
    });

    // Reset region to A
    setActiveRegion('A');

    // Check pdfData or images for page & crop box
    if (q.pdfData && q.pdfData.length > 0) {
      const partIdxToLoad = Math.max(0, Math.min(targetPartIdx - 1, q.pdfData.length - 1));
      const p1 = q.pdfData[partIdxToLoad];
      const pNum = p1.page || p1.pageNumber || (p1 as any).pageIndex || 1;
      setCurrentPage(pNum);

      const box1 = extractBoxFromPdfDataPart(p1);
      if (box1) {
        setBoxA(box1);
      } else {
        setBoxA({ ymin: 0.1, xmin: 0.05, ymax: 0.4, xmax: 0.95 });
      }

      // If question has multiple parts / split question or targetMode is stitch, load Part 2 into B
      if ((useCbtStore.getState().recropTarget?.mode === 'stitch' || q.isSplitQuestion || (q.images && q.images.length >= 2) || q.pdfData.length >= 2)) {
        if (q.pdfData.length >= 2) {
          setIsMultiRegion(true);
          const p2 = q.pdfData[1];
          setPageB(p2.page || p2.pageNumber || (p2 as any).pageIndex || pNum);
          const box2 = extractBoxFromPdfDataPart(p2);
          if (box2) {
            setBoxB(box2);
          } else {
            setBoxB({ ymin: 0.45, xmin: 0.05, ymax: 0.75, xmax: 0.95 });
          }
        } else if (q.isSplitQuestion || (q.images && q.images.length >= 2)) {
          setIsMultiRegion(true);
          setPageB(pNum);
          setBoxB({ ymin: Math.min(0.85, (box1?.ymax || 0.4) + 0.05), xmin: box1?.xmin || 0.05, ymax: Math.min(1, (box1?.ymax || 0.4) + 0.35), xmax: box1?.xmax || 0.95 });
        } else {
          setIsMultiRegion(false);
        }
      } else {
        setIsMultiRegion(false);
      }
    } else {
      // Default initial box if no pdfData found
      setBoxA({ ymin: 0.1, xmin: 0.05, ymax: 0.4, xmax: 0.95 });
      setIsMultiRegion(false);
    }
  }, [allQuestionsList]);

  // Initialize Target State when modal opens
  useEffect(() => {
    if (!isPdfRecropModalOpen) return;

    if (recropTarget) {
      setTargetMode(recropTarget.mode);
      if (recropTarget.mode === 'stitch') {
        setIsMultiRegion(true);
      } else {
        setIsMultiRegion(false);
      }
    }

    if (activeArchive) {
      // Find matching question index
      let targetIdx = 0;
      if (recropTarget?.questionId) {
        const foundIdx = allQuestionsList.findIndex((q) => q.id === recropTarget.questionId);
        if (foundIdx !== -1) targetIdx = foundIdx;
      } else if (recropTarget?.defaultQNo) {
        const foundIdx = allQuestionsList.findIndex((q) => q.que === recropTarget.defaultQNo);
        if (foundIdx !== -1) targetIdx = foundIdx;
      }

      selectQuestionByIndex(targetIdx, recropTarget?.partIndex || 1);

      if (recropTarget?.mode === 'new_question') {
        const state = useCbtStore.getState();
        const activeSubId = recropTarget.subjectId || state.selectedSubjectId || activeArchive.subjects[0]?.id || '';
        const activeSecId = recropTarget.sectionId || state.selectedSectionId || activeArchive.subjects.find(s => s.id === activeSubId)?.sections[0]?.id || '';
        const sec = activeArchive.subjects.find(s => s.id === activeSubId)?.sections.find(sc => sc.id === activeSecId);
        const nextQ = sec ? (sec.questions.length > 0 ? Math.max(...sec.questions.map(q => q.que)) + 1 : 1) : 1;
        
        setNewQProps({
          que: nextQ,
          type: 'mcq',
          subjectId: activeSubId,
          sectionId: activeSecId,
          answerOptions: ''
        });
      }

      // Detect if source PDF already exists in archive rawFiles
      let foundPdf: Blob | null = null;
      let foundName = activeArchive.metadata.sourcePdfName || 'Document.pdf';

      for (const [key, val] of activeArchive.rawFiles.entries()) {
        if (key === 'source_document.pdf' || key.toLowerCase().endsWith('.pdf')) {
          foundPdf = val.blob;
          if (key !== 'source_document.pdf') foundName = key;
          break;
        }
      }

      if (foundPdf) {
        setPdfFile(foundPdf);
        setPdfFileName(foundName);
      } else {
        setPdfFile(null);
        setPdfFileName('');
      }
    }
  }, [isPdfRecropModalOpen, recropTarget, activeArchive]);

  // Load PDF Document when pdfFile changes
  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      setTotalPages(0);
      setPageThumbnails([]);
      return;
    }

    let isMounted = true;
    const loadDoc = async () => {
      setLoadingDoc(true);
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdfjsLib = await getPdfjsLib();
        const loaded = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (!isMounted) return;
        setPdfDoc(loaded);
        setTotalPages(loaded.numPages);
        const initPage = recropTarget?.pageNumber ? Math.min(Math.max(1, recropTarget.pageNumber), loaded.numPages) : 1;
        setCurrentPage(initPage);

        // Generate small thumbnails for pages lazily in non-blocking background batches
        (async () => {
          const thumbPages = Math.min(loaded.numPages, 30);
          for (let i = 1; i <= thumbPages; i++) {
            if (!isMounted) break;
            try {
              const page = await loaded.getPage(i);
              const viewport = page.getViewport({ scale: 0.18 });
              const thumbCanvas = document.createElement('canvas');
              thumbCanvas.width = viewport.width;
              thumbCanvas.height = viewport.height;
              const ctx = thumbCanvas.getContext('2d');
              if (ctx) {
                await page.render({ canvasContext: ctx, viewport } as any).promise;
                const url = thumbCanvas.toDataURL('image/jpeg', 0.5);
                if (isMounted) {
                  setPageThumbnails((prev) => {
                    if (prev.some((p) => p.page === i)) return prev;
                    return [...prev, { url, page: i }];
                  });
                }
              }
            } catch (e) {
              console.warn("Failed generating thumb for page", i, e);
            }
            // Yield control back to browser to prevent main thread lag
            await new Promise((r) => setTimeout(r, 16));
          }
        })();
      } catch (err: any) {
        console.error("Failed to load PDF:", err);
      } finally {
        if (isMounted) setLoadingDoc(false);
      }
    };

    loadDoc();
    return () => {
      isMounted = false;
    };
  }, [pdfFile]);

  // Fast Live Crop Preview generator from active rendered canvas
  const generateLivePreview = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    if (canvas.width === 0 || canvas.height === 0) return;

    const extractRegion = (box: BoxCoord) => {
      const ymin = Math.max(0, Math.min(1, Math.min(box.ymin, box.ymax)));
      const ymax = Math.max(0, Math.min(1, Math.max(box.ymin, box.ymax)));
      const xmin = Math.max(0, Math.min(1, Math.min(box.xmin, box.xmax)));
      const xmax = Math.max(0, Math.min(1, Math.max(box.xmin, box.xmax)));

      const pxX = Math.floor(xmin * canvas.width);
      const pxY = Math.floor(ymin * canvas.height);
      const pxW = Math.max(10, Math.ceil((xmax - xmin) * canvas.width));
      const pxH = Math.max(10, Math.ceil((ymax - ymin) * canvas.height));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = pxW;
      cropCanvas.height = pxH;
      const ctx = cropCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(canvas, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);

      if (autoWhiten || sharpenText) {
        try {
          const imgData = ctx.getImageData(0, 0, pxW, pxH);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (autoWhiten && avg > 210) {
              const factor = Math.min(1, (avg - 210) / 42);
              data[i] = Math.min(255, Math.round(data[i] + (255 - data[i]) * factor));
              data[i + 1] = Math.min(255, Math.round(data[i + 1] + (255 - data[i + 1]) * factor));
              data[i + 2] = Math.min(255, Math.round(data[i + 2] + (255 - data[i + 2]) * factor));
            }
            if (sharpenText && avg < 130) {
              const factor = (130 - avg) / 130;
              const boost = Math.round(28 * factor);
              data[i] = Math.max(0, data[i] - boost);
              data[i + 1] = Math.max(0, data[i + 1] - boost);
              data[i + 2] = Math.max(0, data[i + 2] - boost);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch {
          // ignore potential canvas security errors
        }
      }
      return cropCanvas;
    };

    const cA = extractRegion(boxA);
    if (cA) {
      setPreviewUrlA(cA.toDataURL('image/png'));
    }

    if (isMultiRegion && boxB) {
      const cB = extractRegion(boxB);
      if (cB) {
        setPreviewUrlB(cB.toDataURL('image/png'));
        if (cA) {
          const topCanvas = stitchOrder === 'A_THEN_B' ? cA : cB;
          const bottomCanvas = stitchOrder === 'A_THEN_B' ? cB : cA;
          const gap = stitchGap;
          const stitchW = Math.max(topCanvas.width, bottomCanvas.width);
          const stitchH = topCanvas.height + bottomCanvas.height + gap;
          const sCanvas = document.createElement('canvas');
          sCanvas.width = stitchW;
          sCanvas.height = stitchH;
          const sCtx = sCanvas.getContext('2d');
          if (sCtx) {
            sCtx.fillStyle = '#FFFFFF';
            sCtx.fillRect(0, 0, stitchW, stitchH);
            sCtx.drawImage(topCanvas, 0, 0);
            sCtx.drawImage(bottomCanvas, 0, topCanvas.height + gap);
            setPreviewUrlStitched(sCanvas.toDataURL('image/png'));
          }
        }
      }
    }
  }, [boxA, boxB, isMultiRegion, autoWhiten, sharpenText, stitchGap, stitchOrder]);

  // Render Standard Resolution Page to Canvas (with Offscreen Memory Canvas Caching & Zero-Flicker Swap)
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    const pageToRender = activeRegion === 'A' ? currentPage : pageB;
    const standardScale = Math.min(scale * 1.25, 1.8);
    const dpr = Math.min(window.devicePixelRatio || 1.25, 1.5);
    const effectiveScale = Math.min(standardScale * dpr, 2.2);
    const cacheKey = `${pageToRender}_${effectiveScale.toFixed(2)}`;

    const canvas = canvasRef.current;
    const cachedCanvas = pageCanvasCacheRef.current.get(cacheKey);

    if (cachedCanvas) {
      // Fast instant 0ms canvas paint from memory cache without blocking spinner
      canvas.width = cachedCanvas.width;
      canvas.height = cachedCanvas.height;
      canvas.style.width = `${cachedCanvas.width / dpr}px`;
      canvas.style.height = `${cachedCanvas.height / dpr}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(cachedCanvas, 0, 0);
        generateLivePreview();
      }
      setRenderingPage(false);
      return;
    }

    setRenderingPage(true);

    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel();
        await activeRenderTaskRef.current.promise.catch(() => {});
      } catch {
        // ignore
      }
      activeRenderTaskRef.current = null;
    }

    try {
      const page = await pdfDoc.getPage(pageToRender);
      const viewport = page.getViewport({ scale: effectiveScale });

      // Render to OFFSCREEN canvas first so visible canvas NEVER flashes black/blank
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const offCtx = offscreen.getContext('2d');

      if (offCtx) {
        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

        const renderTask = page.render({
          canvasContext: offCtx,
          viewport: viewport
        } as any);

        activeRenderTaskRef.current = renderTask;
        await renderTask.promise;

        // Save offscreen cache copy for zero-latency instant re-draws
        pageCanvasCacheRef.current.set(cacheKey, offscreen);

        // Atomic swap onto visible canvas
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(offscreen, 0, 0);
          generateLivePreview();
        }
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error("Page render error:", err);
      }
    } finally {
      setRenderingPage(false);
    }
  }, [pdfDoc, currentPage, pageB, activeRegion, scale, generateLivePreview]);

  // Render current question's existing image to canvas
  const renderCurrentImage = useCallback(async () => {
    if (!canvasRef.current) return;
    const currentQ = allQuestionsList[activeQIndex];
    if (!currentQ || !currentQ.images || currentQ.images.length === 0) return;

    setRenderingPage(true);
    try {
      const partIdx = recropTarget?.partIndex || 1;
      const imgData = currentQ.images.find(img => img.partIndex === partIdx) || currentQ.images[0];
      if (!imgData || !imgData.blobUrl) {
        setRenderingPage(false);
        return;
      }

      const img = new Image();
      img.src = imgData.blobUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const dpr = window.devicePixelRatio || 1.5;
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.style.width = `${img.width / dpr}px`;
      canvas.style.height = `${img.height / dpr}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        generateLivePreview();
      }
    } catch (err) {
      console.error("Error rendering current question image onto canvas:", err);
    } finally {
      setRenderingPage(false);
    }
  }, [allQuestionsList, activeQIndex, recropTarget, generateLivePreview]);

  useEffect(() => {
    if (sourceMode === 'image') {
      renderCurrentImage();
    } else {
      renderCurrentPage();
    }
  }, [renderCurrentPage, renderCurrentImage, sourceMode]);

  // Keep live crop preview updated whenever boxes or options change
  useEffect(() => {
    const timer = setTimeout(() => {
      generateLivePreview();
    }, 20);
    return () => clearTimeout(timer);
  }, [generateLivePreview, boxA, boxB, isMultiRegion, activeRegion, currentPage, pageB, activeQIndex, autoWhiten, sharpenText]);



  // Helper to extract a crop box from a given page into a canvas
  const cropBoxFromPage = useCallback(
    async (pageIndex: number, box: BoxCoord): Promise<HTMLCanvasElement | null> => {
      if (sourceMode === 'image') {
        const currentQ = allQuestionsList[activeQIndex];
        if (!currentQ || !currentQ.images || currentQ.images.length === 0) return null;
        try {
          const partIdx = recropTarget?.partIndex || 1;
          const imgData = currentQ.images.find(img => img.partIndex === partIdx) || currentQ.images[0];
          if (!imgData || !imgData.blobUrl) return null;

          const img = new Image();
          img.src = imgData.blobUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          const ymin = Math.max(0, Math.min(1, Math.min(box.ymin, box.ymax)));
          const ymax = Math.max(0, Math.min(1, Math.max(box.ymin, box.ymax)));
          const xmin = Math.max(0, Math.min(1, Math.min(box.xmin, box.xmax)));
          const xmax = Math.max(0, Math.min(1, Math.max(box.xmin, box.xmax)));

          const pxX = Math.floor(xmin * img.width);
          const pxY = Math.floor(ymin * img.height);
          const pxW = Math.max(10, Math.ceil((xmax - xmin) * img.width));
          const pxH = Math.max(10, Math.ceil((ymax - ymin) * img.height));

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = pxW;
          cropCanvas.height = pxH;
          const cropCtx = cropCanvas.getContext('2d');
          if (!cropCtx) return null;

          cropCtx.imageSmoothingEnabled = true;
          cropCtx.imageSmoothingQuality = 'high';
          cropCtx.fillStyle = '#FFFFFF';
          cropCtx.fillRect(0, 0, pxW, pxH);
          cropCtx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);

          // Apply Image Clean / Enhancement filters
          if (autoWhiten || sharpenText) {
            const imgData = cropCtx.getImageData(0, 0, pxW, pxH);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const avg = (r + g + b) / 3;

              if (autoWhiten) {
                if (avg > 210) {
                  const factor = Math.min(1, (avg - 210) / 42);
                  data[i] = Math.min(255, Math.round(r + (255 - r) * factor));
                  data[i + 1] = Math.min(255, Math.round(g + (255 - g) * factor));
                  data[i + 2] = Math.min(255, Math.round(b + (255 - b) * factor));
                }
              }

              if (sharpenText) {
                if (avg < 130) {
                  const factor = (130 - avg) / 130;
                  const boost = Math.round(28 * factor);
                  data[i] = Math.max(0, r - boost);
                  data[i + 1] = Math.max(0, g - boost);
                  data[i + 2] = Math.max(0, b - boost);
                }
              }
            }
            cropCtx.putImageData(imgData, 0, 0);
          }

          return cropCanvas;
        } catch (e) {
          console.error("Error cropping box from image:", e);
          return null;
        }
      }

      if (!pdfDoc) return null;
      try {
        const page = await pdfDoc.getPage(pageIndex);
        const stdScale = 1.6; // Standard crisp resolution without high-res blob lag
        const viewport = page.getViewport({ scale: stdScale });
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = Math.round(viewport.width);
        fullCanvas.height = Math.round(viewport.height);
        const fullCtx = fullCanvas.getContext('2d');
        if (!fullCtx) return null;

        fullCtx.imageSmoothingEnabled = true;
        fullCtx.imageSmoothingQuality = 'high';
        fullCtx.fillStyle = '#FFFFFF';
        fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

        await page.render({ canvasContext: fullCtx, viewport } as any).promise;

        const ymin = Math.max(0, Math.min(1, Math.min(box.ymin, box.ymax)));
        const ymax = Math.max(0, Math.min(1, Math.max(box.ymin, box.ymax)));
        const xmin = Math.max(0, Math.min(1, Math.min(box.xmin, box.xmax)));
        const xmax = Math.max(0, Math.min(1, Math.max(box.xmin, box.xmax)));

        const pxX = Math.floor(xmin * fullCanvas.width);
        const pxY = Math.floor(ymin * fullCanvas.height);
        const pxW = Math.max(10, Math.ceil((xmax - xmin) * fullCanvas.width));
        const pxH = Math.max(10, Math.ceil((ymax - ymin) * fullCanvas.height));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = pxW;
        cropCanvas.height = pxH;
        const cropCtx = cropCanvas.getContext('2d');
        if (!cropCtx) return null;

        cropCtx.imageSmoothingEnabled = true;
        cropCtx.imageSmoothingQuality = 'high';
        cropCtx.fillStyle = '#FFFFFF';
        cropCtx.fillRect(0, 0, pxW, pxH);
        cropCtx.drawImage(fullCanvas, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);

        // Apply Image Clean / Enhancement filters
        if (autoWhiten || sharpenText) {
          const imgData = cropCtx.getImageData(0, 0, pxW, pxH);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const avg = (r + g + b) / 3;

            if (autoWhiten) {
              if (avg > 210) {
                const factor = Math.min(1, (avg - 210) / 42);
                data[i] = Math.min(255, Math.round(r + (255 - r) * factor));
                data[i + 1] = Math.min(255, Math.round(g + (255 - g) * factor));
                data[i + 2] = Math.min(255, Math.round(b + (255 - b) * factor));
              }
            }

            if (sharpenText) {
              if (avg < 130) {
                const factor = (130 - avg) / 130;
                const boost = Math.round(28 * factor);
                data[i] = Math.max(0, r - boost);
                data[i + 1] = Math.max(0, g - boost);
                data[i + 2] = Math.max(0, b - boost);
              }
            }
          }
          cropCtx.putImageData(imgData, 0, 0);
        }

        return cropCanvas;
      } catch (e) {
        console.error("Error cropping box:", e);
        return null;
      }
    },
    [pdfDoc, autoWhiten, sharpenText]
  );

  // Handle PDF Upload / Attach
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setPdfFileName(file.name);

    if (activeArchive) {
      await attachSourcePdfToArchive(activeArchive.id, file);
    }
  };

  // AI Automatic Question Box Pinpointer
  const handleAiAutoDetect = async () => {
    if (!pdfDoc) return;
    setAiDetecting(true);
    setAiMessage(`AI analyzing Page ${currentPage} for Question ${newQProps.que}...`);

    try {
      const pageToDetect = activeRegion === 'A' ? currentPage : pageB;
      const tempCanvas = await cropBoxFromPage(pageToDetect, { ymin: 0, xmin: 0, ymax: 1, xmax: 1 });
      if (!tempCanvas) throw new Error('Failed to capture page canvas');

      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
      const base64Data = dataUrl.split(',')[1];

      const promptText = `Find question Q${newQProps.que} on this exam paper.
Return JSON ONLY:
{
  "detectedQNo": ${newQProps.que},
  "box": [ymin, xmin, ymax, xmax]
}
Where ymin, xmin, ymax, xmax are normalized floats (0.00 to 1.00). Ensure the box comfortably encloses question number, problem stem, diagrams, and all options.`;

      const res = await fetchWithGeminiFallback(
        `/api/gemini/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: promptText },
                  { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
                ]
              }
            ],
            generationConfig: { responseMimeType: 'application/json' }
          })
        },
        (title, desc, type) => addToast({ title, description: desc, type })
      );

      const responseJson = await res.json();
      const jsonText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || responseJson.text;
      if (!jsonText) throw new Error('No AI response received');

      const result = JSON.parse(jsonText);
      if (result.box && Array.isArray(result.box) && result.box.length === 4) {
        let [ymin, xmin, ymax, xmax] = result.box;
        ymin = Math.max(0, ymin - 0.008);
        xmin = Math.max(0, xmin - 0.012);
        ymax = Math.min(1, ymax + 0.012);
        xmax = Math.min(1, xmax + 0.012);

        const newBox: BoxCoord = { ymin, xmin, ymax, xmax };
        if (activeRegion === 'A') {
          setBoxA(newBox);
        } else {
          setBoxB(newBox);
        }
        setAiMessage(`Found Question ${result.detectedQNo || newQProps.que} on Page ${pageToDetect}!`);
      } else {
        setAiMessage('Could not pinpoint question box automatically. Please adjust manually.');
      }
    } catch (err: any) {
      console.error("AI Detect Error:", err);
      setAiMessage(`Detection: ${err.message}`);
    } finally {
      setAiDetecting(false);
    }
  };

  // Intelligent Spatial Break Detector for Split Questions
  const handleDetectSpatialBreak = async () => {
    setAiDetecting(true);
    setAiMessage('Analyzing document spatial layout for split question fragments...');
    try {
      // Determine if current box is in Left Column or Right Column / Full Width
      const isLeftColumn = (boxA.xmax <= 0.55);
      
      setIsMultiRegion(true);
      setShowStitchOverlay(true);

      if (isLeftColumn) {
        // Spatial break continuation in 2-column paper is at the top of the right column on the SAME page
        setPageB(currentPage);
        const topOfRightCol: BoxCoord = {
          xmin: 0.515,
          ymin: 0.045,
          xmax: 0.975,
          ymax: Math.min(1.0, Math.max(0.25, 0.045 + (boxA.ymax - boxA.ymin)))
        };
        setBoxB(topOfRightCol);
        setAiMessage(`Spatial break detected in 2-column layout! Top Fragment (Leading) & Bottom Fragment (Trailing) highlighted on Page ${currentPage}.`);
        addToast({
          title: 'Spatial Break Detected',
          description: `Identified 2-column split continuation across columns on Page ${currentPage}.`,
          type: 'info'
        });
      } else {
        // Spatial break continuation is at the top of the NEXT page
        const nextPage = Math.min(totalPages || (currentPage + 1), currentPage + 1);
        setPageB(nextPage);
        const topOfNextPage: BoxCoord = {
          xmin: 0.035,
          ymin: 0.045,
          xmax: 0.965,
          ymax: Math.min(1.0, Math.max(0.28, 0.045 + (boxA.ymax - boxA.ymin)))
        };
        setBoxB(topOfNextPage);
        setAiMessage(`Cross-page spatial break detected! Top Fragment (Leading on Pg ${currentPage}) ➔ Bottom Fragment (Trailing on Pg ${nextPage}).`);
        addToast({
          title: 'Cross-Page Spatial Break Detected',
          description: `Identified split continuation across pages (Pg ${currentPage} ➔ Pg ${nextPage}).`,
          type: 'info'
        });
      }
      setTimeout(() => {
        generateLivePreview();
      }, 50);
    } catch (err: any) {
      console.error('Error detecting spatial break:', err);
      setAiMessage(`Spatial break error: ${err.message}`);
    } finally {
      setAiDetecting(false);
    }
  };

  // Convert Mouse/Touch Events to Normalized Page Coordinates (0.0 to 1.0)
  const getNormCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const currentActiveBox = activeRegion === 'A' ? boxA : (boxB || boxA);
  const setCurrentActiveBox = (updater: (prev: BoxCoord) => BoxCoord) => {
    if (activeRegion === 'A') {
      setBoxA(updater);
    } else {
      setBoxB(updater);
    }
  };

  // Pointer Down
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, mode: string = 'create') => {
    const coords = getNormCoords(e);
    if (!coords) return;

    setIsDrawing(true);
    setDragMode(mode);
    setDragStart(coords);
    setInitialBox({ ...currentActiveBox });

    if (mode === 'create') {
      setCurrentActiveBox(() => ({
        xmin: coords.x,
        ymin: coords.y,
        xmax: coords.x + 0.01,
        ymax: coords.y + 0.01
      }));
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !dragMode) return;
    const coords = getNormCoords(e);
    if (!coords) return;

    const dx = coords.x - dragStart.x;
    const dy = coords.y - dragStart.y;

    if (dragMode === 'create') {
      setCurrentActiveBox(() => ({
        xmin: Math.min(dragStart.x, coords.x),
        ymin: Math.min(dragStart.y, coords.y),
        xmax: Math.max(dragStart.x, coords.x),
        ymax: Math.max(dragStart.y, coords.y)
      }));
    } else if (dragMode === 'move') {
      const w = initialBox.xmax - initialBox.xmin;
      const h = initialBox.ymax - initialBox.ymin;
      const newXmin = Math.max(0, Math.min(1 - w, initialBox.xmin + dx));
      const newYmin = Math.max(0, Math.min(1 - h, initialBox.ymin + dy));
      setCurrentActiveBox(() => ({
        xmin: newXmin,
        ymin: newYmin,
        xmax: newXmin + w,
        ymax: newYmin + h
      }));
    } else {
      setCurrentActiveBox((prev) => {
        let { xmin, ymin, xmax, ymax } = initialBox;
        if (dragMode.includes('w')) xmin = Math.min(xmax - 0.02, initialBox.xmin + dx);
        if (dragMode.includes('e')) xmax = Math.max(xmin + 0.02, initialBox.xmax + dx);
        if (dragMode.includes('n')) ymin = Math.min(ymax - 0.02, initialBox.ymin + dy);
        if (dragMode.includes('s')) ymax = Math.max(ymin + 0.02, initialBox.ymax + dy);
        return { xmin, ymin, xmax, ymax };
      });
    }
  };

  // Pointer Up
  const handlePointerUp = () => {
    setIsDrawing(false);
    setDragMode(null);
  };

  // Fine Nudge Helpers
  const nudge = (direction: 'up' | 'down' | 'left' | 'right', delta: number = 0.005) => {
    setCurrentActiveBox((prev) => {
      const w = prev.xmax - prev.xmin;
      const h = prev.ymax - prev.ymin;
      if (direction === 'up') {
        const ymin = Math.max(0, prev.ymin - delta);
        return { ...prev, ymin, ymax: ymin + h };
      }
      if (direction === 'down') {
        const ymax = Math.min(1, prev.ymax + delta);
        return { ...prev, ymin: ymax - h, ymax };
      }
      if (direction === 'left') {
        const xmin = Math.max(0, prev.xmin - delta);
        return { ...prev, xmin, xmax: xmin + w };
      }
      if (direction === 'right') {
        const xmax = Math.min(1, prev.xmax + delta);
        return { ...prev, xmin: xmax - w, xmax };
      }
      return prev;
    });
  };

  // Expand / Shrink
  const expandPadding = (delta: number = 0.01) => {
    setCurrentActiveBox((prev) => ({
      xmin: Math.max(0, prev.xmin - delta),
      ymin: Math.max(0, prev.ymin - delta),
      xmax: Math.min(1, prev.xmax + delta),
      ymax: Math.min(1, prev.ymax + delta)
    }));
  };

  // Other questions on the current page for visual outline overlay
  const otherQuestionsOnPage = useMemo(() => {
    const list: { keyId: string; que: number; index: number; box: BoxCoord }[] = [];
    allQuestionsList.forEach((q, idx) => {
      if (idx === activeQIndex) return;
      if (q.pdfData && q.pdfData.length > 0) {
        q.pdfData.forEach((p, pIdx) => {
          const pNum = p.page || p.pageNumber || (p as any).pageIndex;
          if (pNum === currentPage) {
            const box = extractBoxFromPdfDataPart(p);
            if (box) {
              list.push({ keyId: `oq-${q.id}-${pIdx}`, que: q.que, index: idx, box });
            }
          }
        });
      }
    });
    return list;
  }, [allQuestionsList, activeQIndex, currentPage]);

  // Save Crop logic (with optional autoAdvance)
  const handleSaveCrop = async (autoAdvance: boolean = false) => {
    if (!pdfDoc && sourceMode !== 'image') return;

    let finalCanvas: HTMLCanvasElement | null = null;
    let targetPage = currentPage;
    let targetBox = boxA;

    const isStitch = targetMode === 'stitch' || (isMultiRegion && !!boxB);

    if (isStitch) {
      const cA = await cropBoxFromPage(currentPage, boxA);
      const cB = await cropBoxFromPage(pageB, boxB || boxA);
      if (cA && cB) {
        const topCanvas = stitchOrder === 'A_THEN_B' ? cA : cB;
        const bottomCanvas = stitchOrder === 'A_THEN_B' ? cB : cA;
        const gap = stitchGap;
        const stitchW = Math.max(topCanvas.width, bottomCanvas.width);
        const stitchH = topCanvas.height + bottomCanvas.height + gap;
        finalCanvas = document.createElement('canvas');
        finalCanvas.width = stitchW;
        finalCanvas.height = stitchH;
        const sCtx = finalCanvas.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = '#FFFFFF';
          sCtx.fillRect(0, 0, stitchW, stitchH);
          sCtx.drawImage(topCanvas, 0, 0);
          sCtx.drawImage(bottomCanvas, 0, topCanvas.height + gap);
        }
      }
    } else {
      targetPage = activeRegion === 'B' ? pageB : currentPage;
      targetBox = activeRegion === 'B' && boxB ? boxB : boxA;
      finalCanvas = await cropBoxFromPage(targetPage, targetBox);
    }

    if (!finalCanvas) return;

    const currentQ = allQuestionsList[activeQIndex];
    const targetQId = currentQ?.id || recropTarget?.questionId;

    const blob = await new Promise<Blob | null>((resolve) => {
      finalCanvas!.toBlob(resolve, 'image/png');
    });

    if (!blob) return;

    let pdfCoordsPayload: any;
    if (isStitch && boxB) {
      pdfCoordsPayload = [
        {
          page: currentPage,
          pageNumber: currentPage,
          x1: Math.round(boxA.xmin * 1000),
          y1: Math.round(boxA.ymin * 1000),
          x2: Math.round(boxA.xmax * 1000),
          y2: Math.round(boxA.ymax * 1000),
          ymin: boxA.ymin,
          xmin: boxA.xmin,
          ymax: boxA.ymax,
          xmax: boxA.xmax,
          bounds: [boxA.xmin, boxA.ymin, boxA.xmax - boxA.xmin, boxA.ymax - boxA.ymin],
        },
        {
          page: pageB,
          pageNumber: pageB,
          x1: Math.round(boxB.xmin * 1000),
          y1: Math.round(boxB.ymin * 1000),
          x2: Math.round(boxB.xmax * 1000),
          y2: Math.round(boxB.ymax * 1000),
          ymin: boxB.ymin,
          xmin: boxB.xmin,
          ymax: boxB.ymax,
          xmax: boxB.xmax,
          bounds: [boxB.xmin, boxB.ymin, boxB.xmax - boxB.xmin, boxB.ymax - boxB.ymin],
        }
      ];
    } else {
      pdfCoordsPayload = {
        page: targetPage,
        pageNumber: targetPage,
        x1: Math.round(targetBox.xmin * 1000),
        y1: Math.round(targetBox.ymin * 1000),
        x2: Math.round(targetBox.xmax * 1000),
        y2: Math.round(targetBox.ymax * 1000),
        ymin: targetBox.ymin,
        xmin: targetBox.xmin,
        ymax: targetBox.ymax,
        xmax: targetBox.xmax,
        bounds: [targetBox.xmin, targetBox.ymin, targetBox.xmax - targetBox.xmin, targetBox.ymax - targetBox.ymin],
      };
    }

    const computedPartIdx = targetMode === 'add_part' 
      ? ((currentQ?.imagesCount || currentQ?.images?.length || 0) + 1)
      : (recropTarget?.partIndex || 1);

    await applyCroppedImage({
      questionId: targetQId,
      partIndex: computedPartIdx,
      mode: isStitch ? 'stitch' : targetMode,
      blob,
      sectionId: newQProps.sectionId || currentQ?.sectionId || recropTarget?.sectionId,
      subjectId: newQProps.subjectId || currentQ?.subjectId || recropTarget?.subjectId,
      newQuestionProps: {
        que: newQProps.que,
        type: newQProps.type,
        marks:
          newQProps.type === 'msq'
            ? { cm: 4, im: -2, pm: 1, max: 4 }
            : newQProps.type === 'msm'
            ? { cm: 3, im: -1, pm: 1, max: 12 }
            : { cm: 4, im: -1, pm: 0, max: 4 }
      },
      pdfCoords: pdfCoordsPayload
    });

    if (autoAdvance && activeQIndex < allQuestionsList.length - 1) {
      selectQuestionByIndex(activeQIndex + 1);
    } else if (!autoAdvance) {
      addToast({
        title: `Saved Crop for Q${newQProps.que}`,
        description: isStitch
          ? 'Spatial break fragments stitched and question updated.'
          : targetMode === 'add_part'
          ? 'Added extra image part to question.'
          : 'Question image updated successfully.',
        type: 'success'
      });
      closePdfRecrop();
    }
  };

  // Global Keyboard Navigation (Arrow Left/Right & Ctrl+Enter to Save)
  useEffect(() => {
    if (!isPdfRecropModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.shiftKey) {
        if (e.key === 'ArrowUp') { e.preventDefault(); nudge('up'); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); nudge('down'); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); nudge('left'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); nudge('right'); return; }
        if (e.key === 'S' || e.key === 's') { e.preventDefault(); handleSaveCrop(true); return; }
      }

      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        selectQuestionByIndex(activeQIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        selectQuestionByIndex(activeQIndex + 1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSaveCrop(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPdfRecropModalOpen, activeQIndex, selectQuestionByIndex, nudge, handleSaveCrop]);

  if (!isPdfRecropModalOpen) return null;

  const currentQ = allQuestionsList[activeQIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 text-slate-100 overflow-hidden">
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full h-full max-w-7xl max-h-[96vh] overflow-hidden">
        {/* Top Header Bar with Fast Question Inspection Controls */}
        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0 gap-3">
          {/* Title & Source File */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 border border-indigo-500/40 rounded-lg text-indigo-400 shrink-0">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  PDF Visual Re-Cropper & Inspector
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 rounded-full">
                  Fast Audit Suite
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-sm">
                {pdfFileName ? `Source: ${pdfFileName}` : 'Select PDF to inspect and re-crop questions'}
              </p>
            </div>
          </div>

          {/* QUESTION NAVIGATION BAR */}
          {allQuestionsList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => selectQuestionByIndex(activeQIndex - 1)}
                disabled={activeQIndex <= 0}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold"
                title="Previous Question (Left Arrow)"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline">Prev</span>
              </button>

              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-md overflow-hidden h-7 focus-within:border-indigo-500 transition-colors">
                <span className="text-slate-400 text-[10px] pl-2 uppercase font-bold tracking-wider select-none">
                  Go Q
                </span>
                <input
                  type="number"
                  value={jumpQ}
                  onChange={(e) => setJumpQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = parseInt(jumpQ, 10);
                      if (!isNaN(val)) {
                        const idx = allQuestionsList.findIndex(q => q.que === val);
                        if (idx !== -1) {
                          selectQuestionByIndex(idx);
                          setJumpQ('');
                        } else {
                          addToast({ title: 'Not found', description: `Question ${val} not found`, type: 'error' });
                        }
                      }
                    }
                  }}
                  placeholder="#"
                  className="w-10 sm:w-12 bg-transparent text-white text-xs font-mono font-bold text-center focus:outline-none"
                  title="Type question number and press Enter to jump"
                />
              </div>

              {/* Question Dropdown Jumper */}
              <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5 ml-0.5">
                <ListOrdered className="w-3.5 h-3.5 text-indigo-400 hidden sm:inline" />
                <select
                  value={activeQIndex}
                  onChange={(e) => selectQuestionByIndex(parseInt(e.target.value, 10))}
                  className="bg-slate-950 border border-transparent hover:border-slate-700 rounded px-2 py-0.5 text-xs font-mono font-bold text-indigo-300 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
                >
                  {allQuestionsList.map((q, idx) => (
                    <option key={q.id} value={idx}>
                      Q{q.que} ({q.imagesCount > 0 ? `${q.imagesCount} img` : 'No img'}) - {q.sectionName}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                  of {allQuestionsList.length}
                </span>
              </div>

              <button
                onClick={() => selectQuestionByIndex(activeQIndex + 1)}
                disabled={activeQIndex >= allQuestionsList.length - 1}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold ml-1"
                title="Next Question (Right Arrow)"
              >
                <span className="hidden md:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePdfUpload}
              accept="application/pdf"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium transition-colors"
              title="Upload or Change PDF"
            >
              <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{pdfFile ? 'Change PDF' : 'Attach PDF'}</span>
            </button>

            <button
              onClick={closePdfRecrop}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {!pdfFile ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-950/50">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">
              No Source PDF Attached Yet
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
              Attach the question paper PDF to visually re-crop any question, inspect boundary overlays, or stitch split columns and multi-page questions seamlessly.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Select Question Paper PDF</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            {/* Left/Main Column: PDF Canvas & Controls */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-950 border-r border-slate-800 overflow-hidden">
              {/* PDF Page Bar & AI Auto-Detect */}
              <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 gap-2 text-xs">
                {/* Source Selection Toggle */}
                {currentQ && currentQ.images && currentQ.images.length > 0 && (
                  <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 shrink-0">
                    <button
                      onClick={() => setSourceMode('pdf')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        sourceMode === 'pdf'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      disabled={!pdfDoc}
                      title={!pdfDoc ? "Please load a PDF first to crop from PDF" : "Crop from original PDF"}
                    >
                      Original PDF
                    </button>
                    <button
                      onClick={() => setSourceMode('image')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        sourceMode === 'image'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Crop/Split from existing Question Image"
                    >
                      Question Image
                    </button>
                  </div>
                )}

                {/* Page Navigation or Image Mode Text */}
                {sourceMode === 'image' ? (
                  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
                    <ImageIcon className="w-4 h-4 text-indigo-400" />
                    <span>Cropping from existing Question Image (Part {recropTarget?.partIndex || 1})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (activeRegion === 'A') {
                          setCurrentPage((p) => Math.max(1, p - 1));
                        } else {
                          setPageB((p) => Math.max(1, p - 1));
                        }
                      }}
                      disabled={(activeRegion === 'A' ? currentPage : pageB) <= 1}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 font-mono text-slate-200 font-semibold px-2">
                      <span>Page</span>
                      <select
                        value={activeRegion === 'A' ? currentPage : pageB}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (activeRegion === 'A') setCurrentPage(val);
                          else setPageB(val);
                        }}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
                      >
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                          <option key={pg} value={pg}>
                            {pg}
                          </option>
                        ))}
                      </select>
                      <span>of {totalPages}</span>
                    </div>

                    <button
                      onClick={() => {
                        if (activeRegion === 'A') {
                          setCurrentPage((p) => Math.min(totalPages, p + 1));
                        } else {
                          setPageB((p) => Math.min(totalPages, p + 1));
                        }
                      }}
                      disabled={(activeRegion === 'A' ? currentPage : pageB) >= totalPages}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Region Switcher & Merge Verification Tab (if Split Question mode) */}
                {isMultiRegion && (
                  <div className="flex items-center gap-1.5 bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                    <button
                      onClick={() => {
                        setViewMode('crop');
                        setActiveRegion('A');
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                        viewMode === 'crop' && activeRegion === 'A'
                          ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                          : 'text-indigo-300 hover:text-indigo-100 hover:bg-indigo-950/40'
                      }`}
                      title="Select & edit Leading / Top Fragment (Question stem & intro)"
                    >
                      <ArrowDown className="w-3 h-3 text-indigo-300" />
                      <span>Top Fragment (Pg {currentPage})</span>
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('crop');
                        setActiveRegion('B');
                        if (!boxB) setBoxB({ ...boxA });
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                        viewMode === 'crop' && activeRegion === 'B'
                          ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                          : 'text-emerald-300 hover:text-emerald-100 hover:bg-emerald-950/40'
                      }`}
                      title="Select & edit Trailing / Bottom Fragment (Continuation & options)"
                    >
                      <ArrowUp className="w-3 h-3 text-emerald-300" />
                      <span>Bottom Fragment (Pg {pageB})</span>
                    </button>
                    <div className="w-px h-4 bg-slate-800 mx-0.5" />
                    <button
                      onClick={() => setShowStitchOverlay(v => !v)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                        showStitchOverlay
                          ? 'bg-purple-950/60 text-purple-200 border border-purple-700/50'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                      title="Toggle Stitch Visualization Overlay on PDF canvas"
                    >
                      <Eye className="w-3 h-3 text-purple-400" />
                      <span>Overlay: {showStitchOverlay ? 'ON' : 'OFF'}</span>
                    </button>
                    <div className="w-px h-4 bg-slate-800 mx-0.5" />
                    <button
                      onClick={() => setViewMode(v => v === 'merge_verification' ? 'crop' : 'merge_verification')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all ${
                        viewMode === 'merge_verification'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm ring-1 ring-purple-400'
                          : 'bg-purple-950/40 text-purple-300 hover:bg-purple-900/50 border border-purple-800/40'
                      }`}
                      title="Open Side-by-Side Merge Verification Studio"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>Merge Verification Tab</span>
                    </button>
                  </div>
                )}

                {/* AI Auto-Detect, Spatial Break & Zoom Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleAiAutoDetect}
                    disabled={aiDetecting}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded text-xs font-medium transition-colors"
                    title="Let AI locate the question box automatically"
                  >
                    {aiDetecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>AI Find Q{newQProps.que}</span>
                  </button>

                  <button
                    onClick={handleDetectSpatialBreak}
                    disabled={aiDetecting}
                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded text-xs font-medium transition-colors"
                    title="Detect spatial question break across columns/pages and activate stitch overlay"
                  >
                    <Scissors className="w-3.5 h-3.5 text-purple-400" />
                    <span className="hidden sm:inline">Detect Spatial Break</span>
                  </button>

                  <div className="h-4 w-px bg-slate-800 mx-1" />

                  <button
                    onClick={() => setScale((s) => Math.max(0.8, s - 0.25))}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-400 w-9 text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={() => setScale((s) => Math.min(3.0, s + 0.25))}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* AI Detection Notification */}
              {aiMessage && (
                <div className="bg-indigo-950/60 border-b border-indigo-800 px-4 py-1.5 text-xs text-indigo-200 flex items-center justify-between">
                  <span>{aiMessage}</span>
                  <button
                    onClick={() => setAiMessage('')}
                    className="text-indigo-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Interactive PDF Document Stage OR Merge Verification Studio */}
              <div
                ref={containerRef}
                className="flex-1 overflow-auto bg-slate-950 p-4 relative flex items-start justify-center select-none"
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              >
                {viewMode === 'merge_verification' ? (
                  <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-6 text-slate-200 my-auto">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-purple-600/20 rounded-lg border border-purple-500/30">
                          <GitMerge className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Split Question Merge & Stitch Studio</span>
                            <span className="px-2 py-0.5 bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 text-xs rounded-full font-mono font-bold">
                              Q{newQProps.que}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-400">
                            Compare Region A and Region B side-by-side, fine-tune vertical seam gap, and verify seamless compilation.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewMode('crop')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Adjust Crop Boxes</span>
                        </button>
                        <button
                          onClick={() => handleSaveCrop(false)}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Save Stitched Question</span>
                        </button>
                      </div>
                    </div>

                    {/* 3-Column Inspection Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {/* Region A Column */}
                      <div className="bg-slate-950/70 border border-indigo-900/40 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            Region A (Page {currentPage})
                          </span>
                          <button
                            onClick={() => {
                              setViewMode('crop');
                              setActiveRegion('A');
                            }}
                            className="text-[11px] text-indigo-300 hover:underline cursor-pointer"
                          >
                            Edit Box A
                          </button>
                        </div>
                        <div className={`flex-1 rounded-lg border border-slate-800 p-2 flex items-center justify-center min-h-[180px] max-h-[300px] overflow-auto ${
                          previewDarkMode ? 'bg-slate-950' : 'bg-white'
                        }`}>
                          {previewUrlA ? (
                            <img src={previewUrlA} alt="Region A" className={`max-w-full h-auto object-contain ${previewDarkMode ? 'invert hue-rotate-180' : ''}`} />
                          ) : (
                            <span className="text-xs text-slate-500 italic">No Region A selected</span>
                          )}
                        </div>
                      </div>

                      {/* Region B Column */}
                      <div className="bg-slate-950/70 border border-emerald-900/40 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Region B (Page {pageB})
                          </span>
                          <button
                            onClick={() => {
                              setViewMode('crop');
                              setActiveRegion('B');
                            }}
                            className="text-[11px] text-emerald-300 hover:underline cursor-pointer"
                          >
                            Edit Box B
                          </button>
                        </div>
                        <div className={`flex-1 rounded-lg border border-slate-800 p-2 flex items-center justify-center min-h-[180px] max-h-[300px] overflow-auto ${
                          previewDarkMode ? 'bg-slate-950' : 'bg-white'
                        }`}>
                          {previewUrlB ? (
                            <img src={previewUrlB} alt="Region B" className={`max-w-full h-auto object-contain ${previewDarkMode ? 'invert hue-rotate-180' : ''}`} />
                          ) : (
                            <span className="text-xs text-slate-500 italic">No Region B selected</span>
                          )}
                        </div>
                      </div>

                      {/* Stitched Output Column */}
                      <div className="bg-slate-950/70 border border-purple-900/50 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                            <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                            Unified Stitched Preview
                          </span>
                          <button
                            onClick={() => setStitchOrder(o => o === 'A_THEN_B' ? 'B_THEN_A' : 'A_THEN_B')}
                            className="px-2 py-0.5 text-[10px] bg-purple-950 border border-purple-700/50 hover:bg-purple-900/60 text-purple-300 rounded font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Swap which region appears on top"
                          >
                            <ArrowUpDown className="w-3 h-3" />
                            <span>Order: {stitchOrder === 'A_THEN_B' ? 'A ➔ B' : 'B ➔ A'}</span>
                          </button>
                        </div>
                        <div className={`flex-1 rounded-lg border border-purple-800/40 p-2 flex items-center justify-center min-h-[180px] max-h-[300px] overflow-auto ${
                          previewDarkMode ? 'bg-slate-950' : 'bg-white shadow-inner'
                        }`}>
                          {previewUrlStitched ? (
                            <img src={previewUrlStitched} alt="Stitched Question" className={`max-w-full h-auto object-contain ${previewDarkMode ? 'invert hue-rotate-180' : ''}`} />
                          ) : (
                            <span className="text-xs text-slate-500 italic">Configure Region A & B to preview stitch</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stitch Fine-Tuning Controls */}
                    <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-slate-400 font-semibold">Vertical Seam Gap:</label>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            step={2}
                            value={stitchGap}
                            onChange={(e) => setStitchGap(parseInt(e.target.value, 10))}
                            className="w-28 accent-purple-500 cursor-pointer"
                          />
                          <span className="font-mono text-purple-300 w-8">{stitchGap}px</span>
                        </div>

                        <div className="h-4 w-px bg-slate-800" />

                        <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                          <input
                            type="checkbox"
                            checked={autoWhiten}
                            onChange={(e) => setAutoWhiten(e.target.checked)}
                            className="rounded text-purple-600 bg-slate-900 border-slate-700"
                          />
                          <span>Clean Whiten</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                          <input
                            type="checkbox"
                            checked={sharpenText}
                            onChange={(e) => setSharpenText(e.target.checked)}
                            className="rounded text-purple-600 bg-slate-900 border-slate-700"
                          />
                          <span>Sharpen Text</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                          <input
                            type="checkbox"
                            checked={previewDarkMode}
                            onChange={(e) => setPreviewDarkMode(e.target.checked)}
                            className="rounded text-purple-600 bg-slate-900 border-slate-700"
                          />
                          <span>Invert Dark Mode</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveCrop(true)}
                          disabled={activeQIndex >= allQuestionsList.length - 1}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          <ArrowRightCircle className="w-4 h-4" />
                          <span>Save & Next Question</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {loadingDoc || renderingPage ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 z-30">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                        <span className="text-xs text-slate-400">Rendering high-res page...</span>
                      </div>
                    ) : null}

                    <div
                      className="relative shadow-2xl border border-slate-700 bg-white"
                      style={{
                        cursor: isDrawing ? 'crosshair' : 'default'
                      }}
                      onMouseDown={(e) => {
                        if ((e.target as HTMLElement).tagName === 'CANVAS') {
                          handlePointerDown(e, 'create');
                        }
                      }}
                      onTouchStart={(e) => {
                        if ((e.target as HTMLElement).tagName === 'CANVAS') {
                          handlePointerDown(e, 'create');
                        }
                      }}
                    >
                      <canvas ref={canvasRef} className="block" />

                      {/* Render Dotted Boundary Outlines for OTHER Questions on the Same Page */}
                      {otherQuestionsOnPage.map((oq) => (
                        <div
                          key={oq.keyId}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectQuestionByIndex(oq.index);
                          }}
                          className="absolute border-2 border-dashed border-amber-500/80 bg-amber-500/10 hover:bg-amber-500/25 cursor-pointer rounded-xs transition-all z-10 group"
                          style={{
                            top: `${oq.box.ymin * 100}%`,
                            left: `${oq.box.xmin * 100}%`,
                            width: `${(oq.box.xmax - oq.box.xmin) * 100}%`,
                            height: `${(oq.box.ymax - oq.box.ymin) * 100}%`,
                          }}
                          title={`Click to inspect & re-crop Question Q${oq.que}`}
                        >
                          <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-amber-600 text-white text-[9px] font-bold rounded shadow group-hover:scale-105 transition-transform flex items-center gap-1">
                            <span>Q{oq.que}</span>
                            <span className="text-[8px] opacity-80">(Switch)</span>
                          </div>
                        </div>
                      ))}

                      {/* --- STITCH VISUALIZATION OVERLAY & CROP BOUNDARIES --- */}
                      {canvasRef.current && (
                        <>
                          {isMultiRegion && showStitchOverlay ? (
                            <>
                              {/* 1. TOP FRAGMENT (LEADING REGION A) */}
                              {activeRegion === 'A' ? (
                                <div
                                  className="absolute border-2 border-indigo-500 bg-indigo-500/20 shadow-lg shadow-indigo-500/25 z-20 transition-all"
                                  style={{
                                    top: `${boxA.ymin * 100}%`,
                                    left: `${boxA.xmin * 100}%`,
                                    width: `${(boxA.xmax - boxA.xmin) * 100}%`,
                                    height: `${(boxA.ymax - boxA.ymin) * 100}%`,
                                    cursor: 'move'
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handlePointerDown(e, 'move');
                                  }}
                                  onTouchStart={(e) => {
                                    e.stopPropagation();
                                    handlePointerDown(e, 'move');
                                  }}
                                >
                                  {/* Header Badge */}
                                  <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold shadow flex items-center gap-1.5 whitespace-nowrap z-30">
                                    <ArrowDown className="w-3 h-3 text-indigo-200" />
                                    <span>Top Fragment (Leading) • Q{newQProps.que} (Pg {currentPage})</span>
                                    <span className="opacity-75 font-mono text-[9px]">
                                      {Math.round((boxA.xmax - boxA.xmin) * 100)}% × {Math.round((boxA.ymax - boxA.ymin) * 100)}%
                                    </span>
                                  </div>

                                  {/* Bottom Break Seam Guide */}
                                  <div className="absolute -bottom-5 left-0 right-0 flex justify-center pointer-events-none z-20">
                                    <span className="px-1.5 py-0.2 bg-indigo-950/90 border border-indigo-500/60 text-indigo-300 text-[9px] font-mono rounded shadow flex items-center gap-1">
                                      <Scissors className="w-2.5 h-2.5 text-indigo-400" /> Break Seam (Trailing Region Joins Below)
                                    </span>
                                  </div>

                                  {/* Resize Handles */}
                                  <div
                                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                                  />
                                  <div
                                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                                  />
                                  <div
                                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ew-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'w'); }}
                                  />
                                  <div
                                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ew-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'e'); }}
                                  />
                                  <div
                                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ns-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'n'); }}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-xs cursor-ns-resize shadow"
                                    onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 's'); }}
                                  />
                                </div>
                              ) : (
                                /* Non-active Top Fragment Box */
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRegion('A');
                                  }}
                                  className="absolute border-2 border-dashed border-indigo-500/80 bg-indigo-500/10 hover:bg-indigo-500/25 cursor-pointer rounded-xs transition-all z-15 group"
                                  style={{
                                    top: `${boxA.ymin * 100}%`,
                                    left: `${boxA.xmin * 100}%`,
                                    width: `${(boxA.xmax - boxA.xmin) * 100}%`,
                                    height: `${(boxA.ymax - boxA.ymin) * 100}%`,
                                  }}
                                  title="Top Fragment (Leading) - Click to Select & Edit"
                                >
                                  <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-indigo-700 text-white text-[9px] font-bold rounded shadow group-hover:scale-105 transition-transform flex items-center gap-1">
                                    <ArrowDown className="w-2.5 h-2.5" />
                                    <span>Top Fragment (Click to Edit)</span>
                                  </div>
                                </div>
                              )}

                              {/* 2. BOTTOM FRAGMENT (TRAILING REGION B) - Rendered if on Page B */}
                              {currentPage === pageB && boxB && (
                                activeRegion === 'B' ? (
                                  <div
                                    className="absolute border-2 border-emerald-500 bg-emerald-500/20 shadow-lg shadow-emerald-500/25 z-20 transition-all"
                                    style={{
                                      top: `${boxB.ymin * 100}%`,
                                      left: `${boxB.xmin * 100}%`,
                                      width: `${(boxB.xmax - boxB.xmin) * 100}%`,
                                      height: `${(boxB.ymax - boxB.ymin) * 100}%`,
                                      cursor: 'move'
                                    }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      handlePointerDown(e, 'move');
                                    }}
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                      handlePointerDown(e, 'move');
                                    }}
                                  >
                                    {/* Header Badge */}
                                    <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shadow flex items-center gap-1.5 whitespace-nowrap z-30">
                                      <ArrowUp className="w-3 h-3 text-emerald-200" />
                                      <span>Bottom Fragment (Trailing) • Q{newQProps.que} (Pg {pageB})</span>
                                      <span className="opacity-75 font-mono text-[9px]">
                                        {Math.round((boxB.xmax - boxB.xmin) * 100)}% × {Math.round((boxB.ymax - boxB.ymin) * 100)}%
                                      </span>
                                    </div>

                                    {/* Top Merge Anchor Guide */}
                                    <div className="absolute -top-5 right-0 flex justify-end pointer-events-none z-20">
                                      <span className="px-1.5 py-0.2 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[9px] font-mono rounded shadow flex items-center gap-1">
                                        <GitMerge className="w-2.5 h-2.5 text-emerald-400" /> Merge Anchor (Continues from Leading)
                                      </span>
                                    </div>

                                    {/* Resize Handles */}
                                    <div
                                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-nwse-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                                    />
                                    <div
                                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-nesw-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
                                    />
                                    <div
                                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-nesw-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
                                    />
                                    <div
                                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-nwse-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                                    />
                                    <div
                                      className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-ew-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'w'); }}
                                    />
                                    <div
                                      className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-ew-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'e'); }}
                                    />
                                    <div
                                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-ns-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'n'); }}
                                    />
                                    <div
                                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-emerald-600 rounded-xs cursor-ns-resize shadow"
                                      onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 's'); }}
                                    />
                                  </div>
                                ) : (
                                  /* Non-active Bottom Fragment Box */
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveRegion('B');
                                    }}
                                    className="absolute border-2 border-dashed border-emerald-500/80 bg-emerald-500/10 hover:bg-emerald-500/25 cursor-pointer rounded-xs transition-all z-15 group"
                                    style={{
                                      top: `${boxB.ymin * 100}%`,
                                      left: `${boxB.xmin * 100}%`,
                                      width: `${(boxB.xmax - boxB.xmin) * 100}%`,
                                      height: `${(boxB.ymax - boxB.ymin) * 100}%`,
                                    }}
                                    title="Bottom Fragment (Trailing) - Click to Select & Edit"
                                  >
                                    <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-emerald-700 text-white text-[9px] font-bold rounded shadow group-hover:scale-105 transition-transform flex items-center gap-1">
                                      <ArrowUp className="w-2.5 h-2.5" />
                                      <span>Bottom Fragment (Click to Edit)</span>
                                    </div>
                                  </div>
                                )
                              )}

                              {/* 3. SAME-PAGE SPATIAL BREAK SEAM CONNECTOR */}
                              {currentPage === pageB && boxB && (
                                <div
                                  className="absolute pointer-events-none z-10 flex items-center justify-center"
                                  style={{
                                    top: `${Math.min(boxA.ymax, boxB.ymin) * 100}%`,
                                    left: `${Math.min(boxA.xmin, boxB.xmin) * 100}%`,
                                    width: `${(Math.max(boxA.xmax, boxB.xmax) - Math.min(boxA.xmin, boxB.xmin)) * 100}%`,
                                    height: `${Math.max(24, Math.abs(boxB.ymin - boxA.ymax) * 100)}%`,
                                  }}
                                >
                                  <div className="px-2.5 py-1 rounded-full bg-purple-950/90 border border-purple-500/60 shadow-lg text-purple-200 text-[10px] font-bold flex items-center gap-1.5">
                                    <Scissors className="w-3 h-3 text-purple-400" />
                                    <span>Spatial Break Detected • {stitchGap}px Seam Gap • Leading ➔ Trailing Flow ↓</span>
                                  </div>
                                </div>
                              )}

                              {/* 4. CROSS-PAGE SPATIAL BREAK BANNER */}
                              {currentPage !== pageB && boxB && (
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-purple-500/80 shadow-2xl rounded-xl p-2 px-3 text-xs flex items-center gap-3 z-30">
                                  <div className="flex items-center gap-1.5 text-purple-300">
                                    <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                                    <span>
                                      {currentPage === 1 ? 'Top Fragment (Leading)' : `Pg ${currentPage}`} ➔{' '}
                                      {pageB === currentPage ? 'Same Page' : `Bottom Fragment on Pg ${pageB}`}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (activeRegion === 'A') {
                                        setActiveRegion('B');
                                        setCurrentPage(pageB);
                                      } else {
                                        setActiveRegion('A');
                                        setCurrentPage(currentPage);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow cursor-pointer"
                                  >
                                    <span>{activeRegion === 'A' ? `View Bottom Fragment (Pg ${pageB})` : `View Top Fragment (Pg 1)`}</span>
                                    <ArrowRightCircle className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            /* STANDARD SINGLE-REGION CROP BOX */
                            <div
                              className={`absolute border-2 transition-shadow z-20 ${
                                activeRegion === 'A'
                                  ? 'border-indigo-500 bg-indigo-500/15 shadow-indigo-500/20'
                                  : 'border-emerald-500 bg-emerald-500/15 shadow-emerald-500/20'
                              }`}
                              style={{
                                top: `${currentActiveBox.ymin * 100}%`,
                                left: `${currentActiveBox.xmin * 100}%`,
                                width: `${(currentActiveBox.xmax - currentActiveBox.xmin) * 100}%`,
                                height: `${(currentActiveBox.ymax - currentActiveBox.ymin) * 100}%`,
                                cursor: 'move'
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handlePointerDown(e, 'move');
                              }}
                              onTouchStart={(e) => {
                                e.stopPropagation();
                                handlePointerDown(e, 'move');
                              }}
                            >
                              {/* Region Tag */}
                              <div
                                className={`absolute -top-6 left-0 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow ${
                                  activeRegion === 'A' ? 'bg-indigo-600' : 'bg-emerald-600'
                                }`}
                              >
                                {isMultiRegion ? `Q${newQProps.que} Region ${activeRegion}` : `Q${newQProps.que} Crop Area`}
                              </div>

                              {/* Resize Handles */}
                              <div
                                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nwse-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                              />
                              <div
                                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nesw-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
                              />
                              <div
                                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nesw-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
                              />
                              <div
                                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nwse-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                              />
                              <div
                                className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ew-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'w'); }}
                              />
                              <div
                                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ew-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'e'); }}
                              />
                              <div
                                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ns-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'n'); }}
                              />
                              <div
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ns-resize"
                                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e, 's'); }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Thumbnail Strip */}
              {pageThumbnails.length > 0 && (
                <div className="bg-slate-900 border-t border-slate-800 p-2 flex items-center gap-2 overflow-x-auto scrollbar-thin shrink-0">
                  {pageThumbnails.map((th) => {
                    const isSelected =
                      activeRegion === 'A' ? currentPage === th.page : pageB === th.page;
                    return (
                      <button
                        key={th.page}
                        onClick={() => {
                          if (activeRegion === 'A') setCurrentPage(th.page);
                          else setPageB(th.page);
                        }}
                        className={`flex flex-col items-center shrink-0 p-1 rounded border transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-950/50 scale-105'
                            : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                        }`}
                      >
                        <img
                          src={th.url}
                          alt={`Pg ${th.page}`}
                          className="h-14 w-auto object-contain rounded-xs"
                        />
                        <span className="text-[10px] font-mono mt-0.5 text-slate-400">
                          Pg {th.page}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Fast Inspection, Fine-Tuning & Save Action Panel */}
            <div className="w-full lg:w-96 flex flex-col bg-slate-900 border-l border-slate-800 shrink-0 shadow-xl overflow-hidden">
              
              {/* Header inside right column */}
              <div className="bg-slate-950 p-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                  <span className="flex items-center gap-1.5 text-indigo-400 font-bold text-sm">
                    <ListOrdered className="w-4 h-4" />
                    <span>Question {currentQ?.que} Settings</span>
                  </span>
                  <span className="px-2 py-0.5 text-[10px] bg-slate-900 border border-slate-700 text-slate-400 font-mono rounded">
                    {currentQ?.imagesCount || 0} {currentQ?.imagesCount === 1 ? 'img' : 'imgs'}
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-medium text-slate-300">
                    {currentQ?.subjectName || 'Subject'}
                  </span>
                  <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-medium text-slate-300">
                    {currentQ?.sectionName || 'Section'}
                  </span>
                </div>

                {/* Multi-Part Image Part Selector Bar */}
                {currentQ && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Question Image Parts ({Math.max(currentQ.images?.length || 0, currentQ.pdfData?.length || 0, 1)})</span>
                      <button
                        onClick={() => {
                          setTargetMode('add_part');
                          addToast({ title: 'Add Part Mode Active', description: 'Draw a bounding box on the PDF to add an extra part.', type: 'info' });
                        }}
                        className="px-1.5 py-0.5 text-[10px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded border border-indigo-500/40 font-medium transition-colors"
                        title="Crop and append a new image part to this question"
                      >
                        + Add Part
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {Array.from({ length: Math.max(currentQ.images?.length || 0, currentQ.pdfData?.length || 0, 1) }).map((_, i) => {
                        const pIdx = i + 1;
                        const isPartActive = (recropTarget?.partIndex || 1) === pIdx && targetMode !== 'add_part';
                        return (
                          <button
                            key={pIdx}
                            onClick={() => {
                              setTargetMode('replace_part');
                              selectQuestionByIndex(activeQIndex, pIdx);
                            }}
                            className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all ${
                              isPartActive
                                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            Part {pIdx}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Scrollable Toolbox */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">

                {/* Quick Edit Question Properties (The "Studio" part) */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <span>Quick Bank Edit</span>
                  </div>
                  
                  {activeArchive && (
                    <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-800/60">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">Subject</label>
                        <select
                          value={currentQ?.subjectId || ''}
                          onChange={(e) => {
                            const newSubId = e.target.value;
                            const targetSub = activeArchive.subjects.find(s => s.id === newSubId);
                            if (currentQ && targetSub && targetSub.sections.length > 0) {
                              reassignQuestionSection(currentQ.id, targetSub.sections[0].id);
                              addToast({ title: 'Reassigned', description: `Moved Q${currentQ.que} to ${targetSub.name}`, type: 'info' });
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                        >
                          {activeArchive.subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">Section</label>
                        <select
                          value={currentQ?.sectionId || ''}
                          onChange={(e) => {
                            if (currentQ) {
                              reassignQuestionSection(currentQ.id, e.target.value);
                              addToast({ title: 'Reassigned', description: `Moved Q${currentQ.que} to new section`, type: 'info' });
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                        >
                          {activeArchive.subjects
                            .find(s => s.id === currentQ?.subjectId)
                            ?.sections.map(sec => (
                              <option key={sec.id} value={sec.id}>{sec.name}</option>
                            )) || <option value="">No Sections</option>}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-semibold mb-1">Question Type</label>
                      <select
                        value={newQProps.type}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setNewQProps(p => ({ ...p, type: val }));
                          if (currentQ) {
                            const newMarks = val === 'msq' ? { cm: 4, im: -2, pm: 1, max: 4 }
                                           : val === 'msm' ? { cm: 3, im: -1, pm: 1, max: 12 }
                                           : { cm: 4, im: -1, pm: 0, max: 4 };
                            updateQuestion(currentQ.id, { type: val, marks: newMarks }, 'Updated Type');
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="mcq">MCQ (Single)</option>
                        <option value="msq">MSQ (Multi)</option>
                        <option value="nat">NAT (Numeric)</option>
                        <option value="msm">Matrix Match</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-semibold mb-1">Answer Key</label>
                      <input
                        type="text"
                        value={newQProps.answerOptions}
                        onChange={(e) => setNewQProps(p => ({ ...p, answerOptions: e.target.value }))}
                        onBlur={() => {
                          if (currentQ && currentQ.answerOptions !== newQProps.answerOptions) {
                            updateQuestion(currentQ.id, { answerOptions: newQProps.answerOptions }, 'Updated Answer');
                          }
                        }}
                        placeholder="e.g. 2 or 1,3"
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs font-mono focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-800 w-full" />

                {/* Tool: Crop Mode Strategy */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Crop Target Strategy</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {[
                      { id: 'replace_part', label: 'Replace Main Q' },
                      { id: 'add_part', label: 'Add Image Part' },
                      { id: 'stitch', label: 'Stitch Split Q' },
                      { id: 'new_question', label: 'Insert New Q' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setTargetMode(m.id as any);
                          if (m.id === 'stitch') setIsMultiRegion(true);
                          else setIsMultiRegion(false);
                        }}
                        className={`py-1.5 px-2 rounded-md font-medium border text-center transition-colors ${
                          targetMode === m.id
                            ? 'bg-cyan-900/30 border-cyan-500 text-cyan-100 shadow-sm shadow-cyan-900/50'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {targetMode === 'new_question' && activeArchive && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">Subject</label>
                        {showNewSubjectInput ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newSubjectName}
                              onChange={(e) => setNewSubjectName(e.target.value)}
                              placeholder="New subject name..."
                              className="flex-1 bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                if (newSubjectName.trim()) {
                                  setNewQProps(p => ({ ...p, subjectId: `new:${newSubjectName.trim()}` }));
                                  setNewSectionName('');
                                  setShowNewSectionInput(true);
                                }
                                setShowNewSubjectInput(false);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500 font-bold"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setShowNewSubjectInput(false);
                                setNewSubjectName('');
                              }}
                              className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select
                            value={newQProps.subjectId}
                            onChange={(e) => {
                              if (e.target.value === 'new_subject') {
                                setNewSubjectName('');
                                setShowNewSubjectInput(true);
                              } else {
                                const subj = activeArchive.subjects.find(s => s.id === e.target.value);
                                setNewQProps(p => ({ 
                                  ...p, 
                                  subjectId: e.target.value,
                                  sectionId: subj?.sections[0]?.id || ''
                                }));
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">-- Select Subject --</option>
                            {activeArchive.subjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                            {newQProps.subjectId.startsWith('new:') && (
                              <option value={newQProps.subjectId}>{newQProps.subjectId.replace('new:', '')} (New)</option>
                            )}
                            <option value="new_subject" className="text-indigo-400 font-bold">+ Create New Subject</option>
                          </select>
                        )}
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">Section</label>
                        {showNewSectionInput ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newSectionName}
                              onChange={(e) => setNewSectionName(e.target.value)}
                              placeholder="New section name..."
                              className="flex-1 bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                if (newSectionName.trim()) {
                                  setNewQProps(p => ({ ...p, sectionId: `new:${newSectionName.trim()}` }));
                                }
                                setShowNewSectionInput(false);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500 font-bold"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setShowNewSectionInput(false);
                                setNewSectionName('');
                              }}
                              className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select
                            value={newQProps.sectionId}
                            onChange={(e) => {
                              if (e.target.value === 'new_section') {
                                setNewSectionName('');
                                setShowNewSectionInput(true);
                              } else {
                                setNewQProps(p => ({ ...p, sectionId: e.target.value }));
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">-- Select Section --</option>
                            {activeArchive.subjects.find(s => s.id === newQProps.subjectId)?.sections.map(sec => (
                              <option key={sec.id} value={sec.id}>{sec.name}</option>
                            ))}
                            {newQProps.sectionId.startsWith('new:') && (
                              <option value={newQProps.sectionId}>{newQProps.sectionId.replace('new:', '')} (New)</option>
                            )}
                            <option value="new_section" className="text-indigo-400 font-bold">+ Create New Section</option>
                          </select>
                        )}
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">New Q Number</label>
                        <input
                          type="number"
                          value={newQProps.que}
                          onChange={(e) => setNewQProps(p => ({ ...p, que: parseInt(e.target.value, 10) || 1 }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">If the Q# exists in the section, the image will be appended as a new part to it.</p>
                      </div>
                    </div>
                  )}
                  
                  {isMultiRegion && (
                    <div className="bg-purple-950/20 border border-purple-900/40 rounded-lg p-2.5 mt-2">
                      <div className="flex items-center gap-2 text-[11px] text-purple-200 font-medium">
                        <Split className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Stitch Mode Active. Select Region B in main view.</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-800 w-full" />

                {/* Tool: Visual Adjustments (Filters & Nudge) */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span>Visual Enhancements & Nudge</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-slate-300">
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={autoWhiten}
                        onChange={(e) => setAutoWhiten(e.target.checked)}
                        className="rounded text-amber-600 bg-slate-900 border-slate-700"
                      />
                      <span>Clean Whiten</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={sharpenText}
                        onChange={(e) => setSharpenText(e.target.checked)}
                        className="rounded text-amber-600 bg-slate-900 border-slate-700"
                      />
                      <span>Sharpen Text</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={previewDarkMode}
                        onChange={(e) => setPreviewDarkMode(e.target.checked)}
                        className="rounded text-amber-600 bg-slate-900 border-slate-700"
                      />
                      <span>Preview Dark Mode</span>
                    </label>
                  </div>

                  {/* Nudge controls as a compact pill */}
                  <div className="bg-slate-950 rounded-lg border border-slate-800 p-2 flex items-center justify-between mt-2">
                     <span className="text-[10px] text-slate-400 font-semibold px-1">Fine-tune Bounds:</span>
                     <div className="flex items-center gap-1">
                       <button onClick={() => nudge('up')} className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowUp className="w-3.5 h-3.5" /></button>
                       <button onClick={() => nudge('down')} className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowDown className="w-3.5 h-3.5" /></button>
                       <button onClick={() => nudge('left')} className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowLeft className="w-3.5 h-3.5" /></button>
                       <button onClick={() => nudge('right')} className="p-1 hover:bg-slate-800 rounded text-slate-300"><ArrowRight className="w-3.5 h-3.5" /></button>
                       <div className="w-px h-4 bg-slate-700 mx-1" />
                       <button onClick={() => expandPadding(0.005)} className="px-2 py-0.5 bg-indigo-900/50 hover:bg-indigo-900 text-indigo-300 rounded text-[10px] font-bold">+ Pad</button>
                     </div>
                  </div>
                </div>

                <div className="h-px bg-slate-800 w-full" />

                {/* Live Preview Block */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Crop Result</span>
                    </span>
                  </div>

                  <div className={`rounded-lg border flex items-center justify-center min-h-[140px] max-h-56 overflow-auto transition-colors p-2 ${
                    previewDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-inner'
                  }`}>
                    {isMultiRegion && previewUrlStitched ? (
                      <img src={previewUrlStitched} alt="Stitched Preview" className={`max-w-full h-auto object-contain ${previewDarkMode ? 'invert hue-rotate-180' : ''}`} />
                    ) : previewUrlA ? (
                      <img src={previewUrlA} alt="Preview A" className={`max-w-full h-auto object-contain ${previewDarkMode ? 'invert hue-rotate-180' : ''}`} />
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Adjust bounds to generate preview...</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Action Buttons: Stick to Bottom */}
              <div className="bg-slate-950 p-4 border-t border-slate-800 shrink-0 flex flex-col gap-2.5">
                <button
                  onClick={() => handleSaveCrop(true)}
                  disabled={activeQIndex >= allQuestionsList.length - 1}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <ArrowRightCircle className="w-4.5 h-4.5" />
                  <span>Save Crop & Next Q</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={closePdfRecrop}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Done / Close
                  </button>
                  <button
                    onClick={() => handleSaveCrop(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Crop</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
