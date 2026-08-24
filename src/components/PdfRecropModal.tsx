import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  FileText
} from 'lucide-react';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';

interface BoxCoord {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
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
    refreshUsageMetrics,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

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

  // Mouse / Touch Dragging State
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<string | null>(null); // 'create' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
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
    sectionId: ''
  });

  // Previews
  const [previewUrlA, setPreviewUrlA] = useState<string>('');
  const [previewUrlB, setPreviewUrlB] = useState<string>('');
  const [previewUrlStitched, setPreviewUrlStitched] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRenderTaskRef = useRef<any>(null);

  // Initialize Target State
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
      // Find default question or subject/section
      let curQNo = 1;
      let curSubjId = activeArchive.subjects[0]?.id || '';
      let curSecId = activeArchive.subjects[0]?.sections[0]?.id || '';

      let targetPage = recropTarget?.pageNumber || 1;

      if (recropTarget?.questionId) {
        activeArchive.subjects.forEach((sub) => {
          sub.sections.forEach((sec) => {
            const q = sec.questions.find((item) => item.id === recropTarget.questionId);
            if (q) {
              curQNo = q.que;
              curSubjId = sub.id;
              curSecId = sec.id;
              if (q.pdfData && q.pdfData.length > 0 && q.pdfData[0].pageNumber) {
                targetPage = q.pdfData[0].pageNumber;
              } else if (q.images && q.images.length > 0) {
                const partIdx = recropTarget.partIndex ? recropTarget.partIndex - 1 : 0;
                const img = q.images[partIdx] || q.images[0];
                if (img && (img as any).pageNumber) {
                  targetPage = (img as any).pageNumber;
                }
              }
            }
          });
        });
      } else if (recropTarget?.defaultQNo) {
        curQNo = recropTarget.defaultQNo;
      }

      setNewQProps({
        que: curQNo,
        type: 'mcq',
        subjectId: curSubjId,
        sectionId: curSecId
      });

      // Jump to target page if PDF document is already loaded
      if (pdfDoc && targetPage) {
        setCurrentPage(Math.min(Math.max(1, targetPage), pdfDoc.numPages));
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

        // Generate small thumbnails for the first 15 pages asynchronously
        const thumbs: { url: string; page: number }[] = [];
        const thumbPages = Math.min(loaded.numPages, 30);
        for (let i = 1; i <= thumbPages; i++) {
          try {
            const page = await loaded.getPage(i);
            const viewport = page.getViewport({ scale: 0.2 });
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = viewport.width;
            thumbCanvas.height = viewport.height;
            const ctx = thumbCanvas.getContext('2d');
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport } as any).promise;
              thumbs.push({ url: thumbCanvas.toDataURL('image/jpeg', 0.6), page: i });
            }
          } catch (e) {
            console.warn("Failed generating thumb for page", i, e);
          }
        }
        if (isMounted) setPageThumbnails(thumbs);
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

  // Render High-DPI Page to Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    setRenderingPage(true);

    // Cancel any previous render task in flight on this canvas to prevent collision errors
    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel();
      } catch {
        // Ignored
      }
      activeRenderTaskRef.current = null;
    }

    try {
      const pageToRender = activeRegion === 'B' && isMultiRegion ? pageB : currentPage;
      const page = await pdfDoc.getPage(pageToRender);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = page.render({ canvasContext: ctx, viewport } as any);
      activeRenderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException' && !err?.message?.includes('cancelled')) {
        console.warn('Page rendering notice:', err?.message || err);
      }
    } finally {
      activeRenderTaskRef.current = null;
      setRenderingPage(false);
    }
  }, [pdfDoc, currentPage, pageB, activeRegion, isMultiRegion, scale]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Helper to extract a crop box from a given page into a canvas
  const cropBoxFromPage = useCallback(
    async (pageIndex: number, box: BoxCoord): Promise<HTMLCanvasElement | null> => {
      if (!pdfDoc) return null;
      try {
        const page = await pdfDoc.getPage(pageIndex);
        const hiScale = 2.6; // High resolution 2.6x crop for razor-sharp text & math
        const viewport = page.getViewport({ scale: hiScale });
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

        // Apply Image Clean / Enhancement filters with continuous smooth tone-curves
        if (autoWhiten || sharpenText) {
          const imgData = cropCtx.getImageData(0, 0, pxW, pxH);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const avg = (r + g + b) / 3;

            if (autoWhiten) {
              // Smooth knee-curve: brighten off-white/scanner grey backgrounds while preserving delicate font anti-aliasing
              if (avg > 210) {
                const factor = Math.min(1, (avg - 210) / 42);
                data[i] = Math.min(255, Math.round(r + (255 - r) * factor));
                data[i + 1] = Math.min(255, Math.round(g + (255 - g) * factor));
                data[i + 2] = Math.min(255, Math.round(b + (255 - b) * factor));
              }
            }

            if (sharpenText) {
              // Smoothly deepen dark ink contrast without introducing jagged threshold artifacts
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

  // Update live preview when boxes or settings change
  useEffect(() => {
    let active = true;
    const updatePreviews = async () => {
      if (!pdfDoc) return;

      const cA = await cropBoxFromPage(currentPage, boxA);
      if (!active) return;
      if (cA) {
        setPreviewUrlA(cA.toDataURL('image/png'));
      }

      if (isMultiRegion && boxB) {
        const cB = await cropBoxFromPage(pageB, boxB);
        if (!active) return;
        if (cB) {
          setPreviewUrlB(cB.toDataURL('image/png'));

          if (cA) {
            // Create vertical stitched image with clean divider
            const gap = 12;
            const stitchW = Math.max(cA.width, cB.width);
            const stitchH = cA.height + cB.height + gap;
            const sCanvas = document.createElement('canvas');
            sCanvas.width = stitchW;
            sCanvas.height = stitchH;
            const sCtx = sCanvas.getContext('2d');
            if (sCtx) {
              sCtx.fillStyle = '#FFFFFF';
              sCtx.fillRect(0, 0, stitchW, stitchH);
              sCtx.drawImage(cA, 0, 0);

              // Subtle dotted divider line
              sCtx.strokeStyle = '#CBD5E1';
              sCtx.setLineDash([4, 4]);
              sCtx.beginPath();
              sCtx.moveTo(0, cA.height + gap / 2);
              sCtx.lineTo(stitchW, cA.height + gap / 2);
              sCtx.stroke();

              sCtx.drawImage(cB, 0, cA.height + gap);
              setPreviewUrlStitched(sCanvas.toDataURL('image/png'));
            }
          }
        }
      } else {
        setPreviewUrlB('');
        setPreviewUrlStitched('');
      }
    };

    const timeout = setTimeout(updatePreviews, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [pdfDoc, currentPage, pageB, boxA, boxB, isMultiRegion, cropBoxFromPage]);

  // Handle PDF Upload / Replacement
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      setPdfFileName(file.name);
      if (activeArchive) {
        attachSourcePdfToArchive(activeArchive.id, file);
      }
    }
  };

  // AI Auto-Detect Box for the Question
  const handleAiAutoDetect = async () => {
    if (!canvasRef.current || !pdfDoc) return;
    setAiDetecting(true);
    setAiMessage('');

    try {
      const pageToDetect = activeRegion === 'B' && isMultiRegion ? pageB : currentPage;
      const page = await pdfDoc.getPage(pageToDetect);
      const viewport = page.getViewport({ scale: 1.5 });
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context error');
      await page.render({ canvasContext: ctx, viewport } as any).promise;

      const pageBase64 = tempCanvas.toDataURL('image/jpeg', 0.85);

      const res = await fetchWithGeminiFallback(
        '/api/detect-question-box',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: pageBase64,
            qNo: newQProps.que,
            promptHint: `Find question ${newQProps.que} with all its diagrams and options`,
          }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to detect box with AI');
      }

      const result = await res.json();
      if (result.box && Array.isArray(result.box) && result.box.length === 4) {
        let [ymin, xmin, ymax, xmax] = result.box;
        ymin = Math.max(0, Math.min(0.98, Number(ymin) || 0));
        xmin = Math.max(0, Math.min(0.98, Number(xmin) || 0));
        ymax = Math.max(ymin + 0.02, Math.min(1, Number(ymax) || 1));
        xmax = Math.max(xmin + 0.04, Math.min(1, Number(xmax) || 1));

        // Intelligent column alignment
        const isLeftCol = xmin < 0.46 && xmax <= 0.52;
        const isRightCol = xmin >= 0.48;
        if (isLeftCol) {
          xmin = Math.min(xmin, 0.035);
          xmax = Math.min(Math.max(xmax, 0.46), 0.492);
        } else if (isRightCol) {
          xmin = Math.max(Math.min(xmin, 0.53), 0.508);
          xmax = Math.max(xmax, 0.965);
        }

        // Asymmetric safe margin
        ymin = Math.max(0, ymin - 0.008);
        ymax = Math.min(1, ymax + 0.012);

        const newBox: BoxCoord = { ymin, xmin, ymax, xmax };
        if (activeRegion === 'A') {
          setBoxA(newBox);
        } else {
          setBoxB(newBox);
        }
        setAiMessage(`Found Question ${result.detectedQNo || newQProps.que} on Page ${pageToDetect}!`);
      } else {
        setAiMessage('Could not pinpoint question box automatically. Please draw manually.');
      }
    } catch (err: any) {
      console.error("AI Detect Error:", err);
      setAiMessage(`Detection: ${err.message}`);
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

  // Pointer Down (Start Box Draw / Drag / Resize)
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
      // Handles resize
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

  // Apply Action & Save Cropped Image to Question
  const handleSaveCrop = async () => {
    if (!pdfDoc) return;

    let finalCanvas: HTMLCanvasElement | null = null;
    let targetPage = currentPage;
    let targetBox = boxA;

    if (targetMode === 'stitch' || (isMultiRegion && boxB)) {
      const cA = await cropBoxFromPage(currentPage, boxA);
      const cB = await cropBoxFromPage(pageB, boxB || boxA);
      if (cA && cB) {
        const gap = 12;
        const stitchW = Math.max(cA.width, cB.width);
        const stitchH = cA.height + cB.height + gap;
        finalCanvas = document.createElement('canvas');
        finalCanvas.width = stitchW;
        finalCanvas.height = stitchH;
        const sCtx = finalCanvas.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = '#FFFFFF';
          sCtx.fillRect(0, 0, stitchW, stitchH);
          sCtx.drawImage(cA, 0, 0);
          sCtx.drawImage(cB, 0, cA.height + gap);
        }
      }
    } else {
      targetPage = activeRegion === 'B' ? pageB : currentPage;
      targetBox = activeRegion === 'B' && boxB ? boxB : boxA;
      finalCanvas = await cropBoxFromPage(targetPage, targetBox);
    }

    if (!finalCanvas) return;

    finalCanvas.toBlob(async (blob) => {
      if (!blob) return;

      const pdfCoords = {
        page: targetPage,
        x1: Math.round(targetBox.xmin * 1000),
        y1: Math.round(targetBox.ymin * 1000),
        x2: Math.round(targetBox.xmax * 1000),
        y2: Math.round(targetBox.ymax * 1000)
      };

      await applyCroppedImage({
        questionId: recropTarget?.questionId,
        partIndex: recropTarget?.partIndex || 1,
        mode: targetMode,
        blob,
        sectionId: newQProps.sectionId || recropTarget?.sectionId,
        subjectId: newQProps.subjectId || recropTarget?.subjectId,
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
        pdfCoords
      });

      closePdfRecrop();
    }, 'image/png');
  };

  if (!isPdfRecropModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 text-slate-100 overflow-hidden">
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full h-full max-w-7xl max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 border border-indigo-500/40 rounded-lg text-indigo-400">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  PDF Visual Re-Cropper & Slicer
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 rounded-full">
                  Multi-Modal Precision
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-sm sm:max-w-md">
                {pdfFileName
                  ? `Source: ${pdfFileName}`
                  : 'Select or attach source PDF to re-crop question'}
              </p>
            </div>
          </div>

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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium transition-colors"
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
          /* Empty / Upload PDF Prompt */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-950/50">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">
              No Source PDF Attached Yet
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
              Attach the question paper PDF to visually re-crop any question, adjust bounding boxes, or stitch split columns and multi-page questions seamlessly.
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
              {/* PDF Navigation & Zoom Bar */}
              <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 gap-2 text-xs">
                {/* Page Navigation */}
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

                {/* Region Switcher (if Split Question mode) */}
                {isMultiRegion && (
                  <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                    <button
                      onClick={() => setActiveRegion('A')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        activeRegion === 'A'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Region A (Pg {currentPage})
                    </button>
                    <button
                      onClick={() => {
                        setActiveRegion('B');
                        if (!boxB) setBoxB({ ...boxA });
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        activeRegion === 'B'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Region B (Pg {pageB})
                    </button>
                  </div>
                )}

                {/* AI Auto-Detect & Zoom Controls */}
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

              {/* Interactive PDF Document Stage */}
              <div
                ref={containerRef}
                className="flex-1 overflow-auto bg-slate-950 p-4 relative flex items-start justify-center select-none"
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              >
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
                    // Only start new box if clicking on background canvas
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

                  {/* Render Crop Box for Active Region */}
                  {canvasRef.current && (
                    <div
                      className={`absolute border-2 transition-shadow ${
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
                        {isMultiRegion ? `Region ${activeRegion}` : `Question Crop`}
                      </div>

                      {/* Resize Handles */}
                      <div
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nwse-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'nw');
                        }}
                      />
                      <div
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nesw-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'ne');
                        }}
                      />
                      <div
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nesw-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'sw');
                        }}
                      />
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-nwse-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'se');
                        }}
                      />
                      <div
                        className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ew-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'w');
                        }}
                      />
                      <div
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ew-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'e');
                        }}
                      />
                      <div
                        className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ns-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 'n');
                        }}
                      />
                      <div
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-indigo-600 rounded-xs cursor-ns-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handlePointerDown(e, 's');
                        }}
                      />
                    </div>
                  )}
                </div>
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

            {/* Right Column: Fine-Tuning & Live Preview Panel */}
            <div className="w-full lg:w-96 flex flex-col bg-slate-900 p-4 space-y-4 overflow-y-auto scrollbar-thin shrink-0">
              {/* Tool 1: Fine-Tune Nudge & Expand Controls */}
              <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Nudge & Padding</span>
                  </span>
                  <button
                    onClick={() => expandPadding(0.01)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-0.5 bg-slate-900 rounded border border-slate-800"
                  >
                    +8px Margin
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-xs text-center">
                  <div />
                  <button
                    onClick={() => nudge('up')}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center"
                    title="Nudge Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <div />
                  <button
                    onClick={() => nudge('left')}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center"
                    title="Nudge Left"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => expandPadding(0.005)}
                    className="p-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 rounded text-[10px] font-bold"
                    title="Expand Crop Boundary"
                  >
                    +Pad
                  </button>
                  <button
                    onClick={() => nudge('right')}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center"
                    title="Nudge Right"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <div />
                  <button
                    onClick={() => nudge('down')}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 flex items-center justify-center"
                    title="Nudge Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <div />
                </div>
              </div>

              {/* Tool 2: Split Question Multi-Region Toggle */}
              <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Split className="w-3.5 h-3.5 text-purple-400" />
                    <span>Split Question Assembler</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={isMultiRegion}
                    onChange={(e) => {
                      setIsMultiRegion(e.target.checked);
                      if (e.target.checked && !boxB) {
                        setBoxB({ ...boxA, ymin: boxA.ymax + 0.02, ymax: Math.min(1, boxA.ymax + 0.3) });
                        setPageB(currentPage);
                      }
                    }}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Enable if the question spans across two columns or two different pages. Crop both regions and stitch them cleanly.
                </p>
              </div>

              {/* Tool 3: Clean Scan & Enhancement Toggles */}
              <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Scan Enhancement Filters</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoWhiten}
                      onChange={(e) => setAutoWhiten(e.target.checked)}
                      className="rounded text-indigo-600 bg-slate-900 border-slate-700"
                    />
                    <span>Clean Scan (Auto-Whiten Grey Background)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sharpenText}
                      onChange={(e) => setSharpenText(e.target.checked)}
                      className="rounded text-indigo-600 bg-slate-900 border-slate-700"
                    />
                    <span>Sharpen Math Formulas & Contrast</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={previewDarkMode}
                      onChange={(e) => setPreviewDarkMode(e.target.checked)}
                      className="rounded text-indigo-600 bg-slate-900 border-slate-700"
                    />
                    <span>CBT Dark Mode Test Simulator</span>
                  </label>
                </div>
              </div>

              {/* Tool 4: Target Save Action & Metadata */}
              <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Target Question Action</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {[
                    { id: 'replace_part', label: 'Replace Slice' },
                    { id: 'add_part', label: 'Add Part 2+' },
                    { id: 'stitch', label: 'Stitch & Replace' },
                    { id: 'new_question', label: 'New Question' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTargetMode(m.id as any)}
                      className={`p-1.5 rounded text-left font-medium border transition-colors ${
                        targetMode === m.id
                          ? 'bg-indigo-600/30 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {targetMode === 'new_question' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Q Number</label>
                        <input
                          type="number"
                          value={newQProps.que}
                          onChange={(e) =>
                            setNewQProps((p) => ({ ...p, que: parseInt(e.target.value, 10) || 1 }))
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Type</label>
                        <select
                          value={newQProps.type}
                          onChange={(e) =>
                            setNewQProps((p) => ({ ...p, type: e.target.value as any }))
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                        >
                          <option value="mcq">MCQ Single</option>
                          <option value="msq">MSQ Multi</option>
                          <option value="nat">NAT Numerical</option>
                          <option value="msm">Matrix Match</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Cropped Result Preview */}
              <div className="flex-1 bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-2 min-h-[160px]">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Live Crop Preview</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {isMultiRegion ? 'Stitched 2-Part Image' : `Page ${currentPage}`}
                  </span>
                </div>

                <div
                  className={`rounded border p-2 flex items-center justify-center max-h-56 overflow-auto transition-colors ${
                    previewDarkMode
                      ? 'bg-slate-950 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {isMultiRegion && previewUrlStitched ? (
                    <img
                      src={previewUrlStitched}
                      alt="Stitched Preview"
                      className={`max-w-full h-auto object-contain ${
                        previewDarkMode ? 'invert hue-rotate-180' : ''
                      }`}
                    />
                  ) : previewUrlA ? (
                    <img
                      src={previewUrlA}
                      alt="Preview A"
                      className={`max-w-full h-auto object-contain ${
                        previewDarkMode ? 'invert hue-rotate-180' : ''
                      }`}
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Loading crop preview...</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                <button
                  onClick={closePdfRecrop}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCrop}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply & Save</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
