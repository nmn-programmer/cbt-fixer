import React, { useState, useEffect, useRef } from 'react';
import { QuestionData, PdfDataPart } from '../types/cbt';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import { BoxCoord } from '../types/manualCropper';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crop,
  Layers,
  Sparkles,
  FileText,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Crosshair,
} from 'lucide-react';

interface QuestionPageContextViewerProps {
  question: QuestionData;
  partIndex: number;
  rawFiles: Map<string, { blob: Blob | File; url: string; size: number }>;
  onOpenOverlay: (pageNumber?: number) => void;
  onOpenRecrop: (pageNumber?: number) => void;
}

export const QuestionPageContextViewer: React.FC<QuestionPageContextViewerProps> = ({
  question,
  partIndex,
  rawFiles,
  onOpenOverlay,
  onOpenRecrop,
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(0.75);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [pdfFound, setPdfFound] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Extract page number and coordinate box for active part
  const activePart = question.pdfData && question.pdfData[partIndex - 1]
    ? question.pdfData[partIndex - 1]
    : question.pdfData?.[0];

  const pageNumFromData = activePart?.pageNumber || (activePart as any)?.page || 1;

  // Initialize PDF from rawFiles
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError(null);

      // Search for source document PDF in rawFiles
      let targetBlob: Blob | null = null;

      // Priority 1: source_document.pdf
      const srcDoc = rawFiles.get('source_document.pdf');
      if (srcDoc && srcDoc.blob) {
        targetBlob = srcDoc.blob;
      } else {
        // Priority 2: any entry ending with .pdf
        for (const [key, val] of rawFiles.entries()) {
          if (key.toLowerCase().endsWith('.pdf') && val.blob) {
            targetBlob = val.blob;
            break;
          }
        }
      }

      if (!targetBlob) {
        setPdfFound(false);
        setLoading(false);
        return;
      }

      setPdfFound(true);

      try {
        const buffer = await targetBlob.arrayBuffer();
        if (isCancelled) return;

        const pdfjsLib = await getPdfjsLib();
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(Math.min(Math.max(1, pageNumFromData), doc.numPages));
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Failed to load PDF in context viewer:', err);
          setError(err.message || 'Failed to render PDF page');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [rawFiles, pageNumFromData]);

  // Render current page on canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;

    async function renderPage() {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (e) {}
        }

        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Context page render error:', err);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, currentPage, scale]);

  // Compute bounding box normalized coords
  const box: BoxCoord | null = activePart
    ? {
        xmin: activePart.x1 ?? (activePart as any).xmin ?? (activePart.bounds ? activePart.bounds[0] : 0.035),
        ymin: activePart.y1 ?? (activePart as any).ymin ?? (activePart.bounds ? activePart.bounds[1] : 0.1),
        xmax: activePart.x2 ?? (activePart as any).xmax ?? (activePart.bounds ? activePart.bounds[2] : 0.49),
        ymax: activePart.y2 ?? (activePart as any).ymax ?? (activePart.bounds ? activePart.bounds[3] : 0.25),
      }
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-8 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
        <span className="text-sm font-semibold text-slate-200">Loading Original PDF Page Context...</span>
        <span className="text-xs text-slate-500 mt-1">Rendering high-resolution vector page with bounding box highlight</span>
      </div>
    );
  }

  if (!pdfFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-8 bg-slate-950/60 rounded-xl border border-slate-800 text-center">
        <div className="w-12 h-12 rounded-xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3">
          <FileText className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-200">Original Source PDF Not Attached</h4>
        <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
          The original source PDF (<code className="text-indigo-300 font-mono">source_document.pdf</code>) is not stored in this ZIP archive.
          You can use the <strong>Layout Overlay</strong> or <strong>Manual Cropper</strong> to load the PDF and enable live spatial context.
        </p>
        <div className="flex items-center gap-2.5 mt-4">
          <button
            onClick={() => onOpenOverlay(currentPage)}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Open Layout Overlay</span>
          </button>
          <button
            onClick={() => onOpenRecrop(currentPage)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Load PDF in Cropper</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Context Viewer Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            PDF Page {currentPage} of {totalPages}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-semibold border border-purple-500/30">
            Q{question.que} Part {partIndex} Box
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Page Navigation */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] px-1 text-slate-400">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-slate-400 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Launch Full Overlay Modal Button */}
          <button
            onClick={() => onOpenOverlay(currentPage)}
            className="px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-1 shadow-sm"
            title="Open Interactive Full-Page Boundary Overlay"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Interactive Layout Mode</span>
          </button>

          <button
            onClick={() => onOpenRecrop(currentPage)}
            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1 shadow-sm"
            title="Re-crop slice directly"
          >
            <Crop className="w-3 h-3" />
            <span>Re-Crop</span>
          </button>
        </div>
      </div>

      {/* PDF Canvas with High-Contrast Highlight Overlay Box */}
      <div
        ref={containerRef}
        className="relative max-h-[640px] overflow-auto bg-slate-950/80 rounded-xl border border-slate-800 p-4 flex justify-center shadow-inner"
      >
        <div className="relative inline-block select-none shadow-2xl rounded overflow-hidden">
          <canvas ref={canvasRef} className="block rounded" />

          {/* Question Crop Box Overlay Highlight */}
          {box && currentPage === pageNumFromData && (
            <div
              className="absolute border-2 border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30 rounded-xs pointer-events-none transition-all duration-150 animate-pulse"
              style={{
                left: `${box.xmin * 100}%`,
                top: `${box.ymin * 100}%`,
                width: `${(box.xmax - box.xmin) * 100}%`,
                height: `${(box.ymax - box.ymin) * 100}%`,
              }}
            >
              {/* Question Label Badge */}
              <div className="absolute -top-6 left-0 bg-purple-600 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1 whitespace-nowrap">
                <Crosshair className="w-3 h-3" />
                <span>Q{question.que} • Part {partIndex}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
