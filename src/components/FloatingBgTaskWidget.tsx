import React, { useState, useRef, useEffect } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { Sparkles, Maximize2, CheckCircle2, X, Move, ShieldCheck } from 'lucide-react';

export const FloatingBgTaskWidget: React.FC = () => {
  const {
    activeBackgroundTask,
    restoreBackgroundTask,
    clearBackgroundTask,
    addToast,
  } = useCbtStore();

  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: window.innerWidth - 340,
    y: window.innerHeight - 140,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  // Adjust initial position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => ({
        x: Math.min(prev.x, window.innerWidth - 320),
        y: Math.min(prev.y, window.innerHeight - 120),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!activeBackgroundTask || !activeBackgroundTask.isMinimized) {
    return null;
  }

  const { title, statusText, percent, isComplete, resultSummary } = activeBackgroundTask;

  // Drag handlers for mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag when holding header/drag handle
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const newX = Math.max(10, Math.min(window.innerWidth - 320, dragRef.current.posX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 120, dragRef.current.posY + dy));

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Drag handlers for mobile touch
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.startX;
    const dy = touch.clientY - dragRef.current.startY;

    const newX = Math.max(10, Math.min(window.innerWidth - 300, dragRef.current.posX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 100, dragRef.current.posY + dy));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // SVG Circular progress math
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, percent))) / 100;

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={`fixed z-[180] flex items-center gap-3 p-3.5 bg-slate-900/95 border ${
        isComplete ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-indigo-500/50 shadow-indigo-500/10'
      } rounded-2xl shadow-2xl backdrop-blur-md select-none transition-shadow ${
        isDragging ? 'cursor-grabbing scale-[1.02]' : 'cursor-grab'
      } w-[310px] animate-in slide-in-from-bottom-5 duration-300`}
    >
      {/* Drag handle & Circular Progress */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
        title="Drag floating progress bubble"
      >
        <svg className="w-12 h-12 transform -rotate-90">
          <circle
            cx="24"
            cy="24"
            r={radius}
            className="text-slate-800"
            strokeWidth="3.5"
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="24"
            cy="24"
            r={radius}
            className={`transition-all duration-300 ease-out ${
              isComplete ? 'text-emerald-400' : 'text-indigo-500'
            }`}
            strokeWidth="3.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          {isComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
          ) : (
            <span className="text-[10px] font-extrabold text-slate-100 font-mono">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      </div>

      {/* Task Info & Status */}
      <div
        onClick={() => {
          restoreBackgroundTask();
          if (isComplete) {
            addToast('Task Finished', resultSummary || 'AI extraction complete!', 'success');
          }
        }}
        className="flex-1 min-w-0 cursor-pointer group"
        title="Click to reopen full AI popup"
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
            {title}
          </span>
          {!isComplete && (
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-300 truncate leading-tight">
          {statusText || 'AI agent running in background...'}
        </p>
      </div>

      {/* Quick Action Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => restoreBackgroundTask()}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          title="Expand / Reopen Modal"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => clearBackgroundTask()}
          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
          title="Dismiss Background Widget"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
