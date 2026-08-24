import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pin,
  PinOff,
  X,
  Minus,
  Maximize2,
  GripHorizontal,
  Layers,
  ZoomIn,
  ZoomOut,
  Sparkles,
  CheckCircle2,
  FileImage,
  AlertTriangle,
  Sun,
  Moon,
  Move,
} from 'lucide-react';
import { useQuestionPreviewStore } from '../store/useQuestionPreviewStore';
import { useCbtStore } from '../store/useCbtStore';

export const FloatingQuestionPreview: React.FC = () => {
  const {
    isOpen,
    isPinned,
    isMinimized,
    question,
    meta,
    position,
    size,
    togglePin,
    toggleMinimize,
    setPosition,
    setSize,
    closePreview,
    cancelScheduledHide,
    scheduleHide,
  } = useQuestionPreviewStore();

  const { archives, activeArchiveId } = useCbtStore();

  // Local state for zoom and visual modes
  const [zoom, setZoom] = useState<number>(100);
  const [isLightCanvas, setIsLightCanvas] = useState<boolean>(false);
  const [activePartTab, setActivePartTab] = useState<'all' | number>('all');

  // Dragging state
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  // Resizing state
  const isResizingRef = useRef(false);
  const resizeStartPosRef = useRef({ mouseX: 0, mouseY: 0, startW: 0, startH: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Find active archive to resolve raw files if needed
  const activeArchive = archives.find(
    (a) => a.id === (meta?.archiveId || activeArchiveId)
  ) || archives[0];

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Only drag if left mouse button or touch
    if ('button' in e && e.button !== 0) return;

    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartPosRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      posX: position.x,
      posY: position.y,
    };

    e.preventDefault();
  }, [position]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;

    isResizingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    resizeStartPosRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startW: size.width,
      startH: size.height,
    };

    e.preventDefault();
    e.stopPropagation();
  }, [size]);

  // Global mousemove / mouseup for dragging and resizing
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (isDraggingRef.current) {
        const deltaX = clientX - dragStartPosRef.current.mouseX;
        const deltaY = clientY - dragStartPosRef.current.mouseY;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const curW = size.width;

        const newX = Math.max(10, Math.min(screenW - curW - 10, dragStartPosRef.current.posX + deltaX));
        const newY = Math.max(10, Math.min(screenH - 80, dragStartPosRef.current.posY + deltaY));

        setPosition({ x: newX, y: newY });
      }

      if (isResizingRef.current) {
        const deltaX = clientX - resizeStartPosRef.current.mouseX;
        const deltaY = clientY - resizeStartPosRef.current.mouseY;

        const maxW = Math.min(900, window.innerWidth - 30);
        const maxH = Math.min(900, window.innerHeight - 30);

        const newW = Math.max(300, Math.min(maxW, resizeStartPosRef.current.startW + deltaX));
        const newH = Math.max(220, Math.min(maxH, resizeStartPosRef.current.startH + deltaY));

        setSize({ width: newW, height: newH });
      }
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      isResizingRef.current = false;
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [setPosition, setSize, size.width]);

  if (!isOpen || !question) return null;

  // Retrieve image URLs safely without leaking object URLs
  const questionImages = (question.images || []).map((img) => {
    let url = img.blobUrl;
    if (!url && activeArchive) {
      const entry =
        activeArchive.rawFiles.get(img.fileName) ||
        Array.from(activeArchive.rawFiles.entries()).find(([k]) => k.endsWith(img.fileName))?.[1];
      if (entry) {
        url = entry.url;
      }
    }
    return {
      ...img,
      resolvedUrl: url,
    };
  });

  const displayedImages =
    activePartTab === 'all'
      ? questionImages
      : questionImages.filter((img) => img.partIndex === activePartTab);

  return (
    <div
      ref={containerRef}
      id="floating-question-preview-popup"
      onMouseEnter={cancelScheduledHide}
      onMouseLeave={() => scheduleHide(250)}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: isMinimized ? 'auto' : `${size.height}px`,
        zIndex: 99999,
      }}
      className="flex flex-col bg-slate-900/98 backdrop-blur-md rounded-xl border-2 border-indigo-500/70 shadow-2xl shadow-black/80 overflow-hidden text-slate-100 select-none animate-in fade-in zoom-in-95 duration-150 ring-4 ring-indigo-500/20"
    >
      {/* Header & Drag Handle Bar */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`flex items-center justify-between px-3 py-2 border-b cursor-grab active:cursor-grabbing select-none transition-colors ${
          isPinned
            ? 'bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-indigo-500/60'
            : 'bg-slate-950/90 hover:bg-slate-950 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />

          {/* Question Number Badge */}
          <span className="px-2 py-0.5 rounded bg-indigo-600 font-mono font-bold text-xs text-white shadow-sm shrink-0">
            Q{question.que}
          </span>

          {/* Type Badge */}
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${
              question.type === 'mcq'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : question.type === 'msq'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : question.type === 'nat'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {question.type}
          </span>

          {/* Subject & Section Label */}
          <div className="text-[11px] text-slate-300 font-medium truncate">
            {meta?.subjectName ? (
              <span>
                {meta.subjectName}
                {meta.sectionName ? ` · ${meta.sectionName}` : ''}
              </span>
            ) : (
              <span>Question Preview</span>
            )}
          </div>
        </div>

        {/* Action Controls (Pin, Canvas Theme, Minimize, Close) */}
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {/* Pin Button */}
          <button
            onClick={togglePin}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
              isPinned
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold hover:bg-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
            }`}
            title={isPinned ? 'Pinned: Window stays open while you edit. Click to unpin.' : 'Click to Pin: Keeps preview window open during editing.'}
          >
            {isPinned ? (
              <>
                <PinOff className="w-3.5 h-3.5 fill-current" />
                <span className="text-[10px] uppercase tracking-wider">PINNED</span>
              </>
            ) : (
              <>
                <Pin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px]">Pin</span>
              </>
            )}
          </button>

          {/* Minimize / Expand */}
          <button
            onClick={toggleMinimize}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title={isMinimized ? 'Expand Preview' : 'Minimize Preview'}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          </button>

          {/* Close Window */}
          <button
            onClick={closePreview}
            className="p-1 text-slate-400 hover:text-rose-300 hover:bg-rose-950/80 rounded transition-colors"
            title="Close Preview Window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Body (hidden when minimized) */}
      {!isMinimized && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60 overflow-hidden">
          {/* Quick Details Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px]">
            <div className="flex items-center gap-3">
              {/* Answer Key */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-semibold">Key:</span>
                {question.answerOptions ? (
                  <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                    {question.answerOptions}
                  </span>
                ) : (
                  <span className="font-mono text-amber-400 italic font-semibold">Unkeyed</span>
                )}
              </div>

              {/* Marks */}
              <div className="text-slate-400 font-mono hidden sm:inline">
                Marks:{' '}
                <span className="text-slate-200">
                  +{question.marks?.cm ?? 4} / {question.marks?.im ?? -1}
                </span>
              </div>
            </div>

            {/* Images and View Toolbar */}
            <div className="flex items-center gap-1.5">
              {/* Multi-part Slices Tab Toggle */}
              {questionImages.length > 1 && (
                <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                  <button
                    onClick={() => setActivePartTab('all')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      activePartTab === 'all'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({questionImages.length})
                  </button>
                  {questionImages.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setActivePartTab(img.partIndex)}
                      className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                        activePartTab === img.partIndex
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      P{img.partIndex}
                    </button>
                  ))}
                </div>
              )}

              {/* Zoom Controls */}
              <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setZoom((z) => Math.max(50, z - 20))}
                  className="p-1 text-slate-400 hover:text-white rounded"
                  title="Zoom out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono text-slate-400 px-1">{zoom}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(200, z + 20))}
                  className="p-1 text-slate-400 hover:text-white rounded"
                  title="Zoom in"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Light/Dark Canvas Background Toggle */}
              <button
                onClick={() => setIsLightCanvas((v) => !v)}
                className={`p-1 rounded border text-slate-400 transition-colors ${
                  isLightCanvas
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-950 hover:text-white border-slate-800'
                }`}
                title={isLightCanvas ? 'Switch to Dark Canvas' : 'Switch to Light Canvas (Better contrast for transparent dark diagrams)'}
              >
                {isLightCanvas ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Question Image Canvas Viewer Area */}
          <div
            className={`flex-1 overflow-auto p-4 flex flex-col items-center justify-start gap-4 scrollbar-thin transition-colors ${
              isLightCanvas ? 'bg-slate-100/95 text-slate-900' : 'bg-slate-950/90 text-slate-100'
            }`}
          >
            {displayedImages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center my-auto">
                <FileImage className="w-10 h-10 text-slate-600 mb-2" />
                <div className="font-semibold text-xs text-slate-400">No Image Attachments Found</div>
                <div className="text-[11px] text-slate-500 max-w-xs mt-1">
                  Question Q{question.que} has no image slices attached in the archive.
                </div>
                {question.pdfData && question.pdfData.length > 0 && (
                  <div className="mt-3 text-[10px] font-mono text-slate-500 bg-slate-900/60 p-2 rounded border border-slate-800 text-left w-full max-w-xs">
                    <div className="font-bold text-slate-400 mb-1">Referenced Filenames:</div>
                    {question.pdfData.map((p, i) => (
                      <div key={i} className="truncate">
                        • {p.filename || `Part ${i + 1}`} (Page {p.page})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              displayedImages.map((img) => (
                <div
                  key={img.id}
                  className="w-full flex flex-col items-center rounded-lg border border-slate-800/60 bg-slate-900/20 p-2 shadow-sm relative group"
                >
                  {/* Image Part Banner */}
                  <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 pb-1.5 mb-1.5 border-b border-slate-800/40">
                    <span className="font-bold text-indigo-400">
                      Part {img.partIndex} of {questionImages.length}
                    </span>
                    <span className="truncate max-w-[200px]" title={img.fileName}>
                      {img.fileName}
                    </span>
                  </div>

                  {/* Render Image with Zoom Transform */}
                  <div className="w-full flex items-center justify-center overflow-auto">
                    {img.resolvedUrl ? (
                      <img
                        src={img.resolvedUrl}
                        alt={`Question ${question.que} - Part ${img.partIndex}`}
                        style={{
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'top center',
                          transition: 'transform 0.1s ease-out',
                        }}
                        className="max-w-full h-auto object-contain rounded shadow select-none"
                      />
                    ) : (
                      <div className="p-4 text-center text-rose-400 text-xs flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Binary file not loaded for {img.fileName}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Status Bar with Resize Handle */}
          <div className="flex items-center justify-between px-3 py-1 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-400 select-none">
            <div className="flex items-center gap-2">
              <span className="font-mono">
                {questionImages.length} Image{questionImages.length === 1 ? '' : 's'}
              </span>
              <span>•</span>
              <span className="text-slate-500">Drag top bar to move</span>
            </div>

            {/* Resize Corner Handle */}
            <div
              onMouseDown={handleResizeStart}
              onTouchStart={handleResizeStart}
              className="cursor-nwse-resize p-1 text-slate-500 hover:text-indigo-400 active:text-indigo-300 transition-colors flex items-center"
              title="Drag to resize popup window"
            >
              <span className="text-[9px] mr-1 hidden sm:inline text-slate-500">Resize</span>
              <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current">
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
