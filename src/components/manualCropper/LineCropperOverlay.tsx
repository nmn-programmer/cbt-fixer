import React, { useState, useEffect, useRef } from 'react';
import { BoxCoord } from '../../types/manualCropper';
import { ArrowUpDown, Scissors, Sparkles, Undo2, Columns, LayoutGrid, Check } from 'lucide-react';

interface LineCropperOverlayProps {
  activeBox: BoxCoord;
  onChangeBox: (box: BoxCoord) => void;
  containerWidth: number;
  containerHeight: number;
  predictedBox?: BoxCoord | null;
  questionNumber: number;
  onApplyCrop: () => void;
  onUndoLineCut?: () => void;
  columnMode?: 'double' | 'single';
  onColumnModeChange?: (mode: 'double' | 'single') => void;
  onSetColumnPreset?: (preset: 'left' | 'right' | 'full') => void;
}

export const LineCropperOverlay: React.FC<LineCropperOverlayProps> = ({
  activeBox,
  onChangeBox,
  containerWidth,
  containerHeight,
  predictedBox,
  questionNumber,
  onApplyCrop,
  onUndoLineCut,
  columnMode = 'double',
  onColumnModeChange,
  onSetColumnPreset,
}) => {
  const [cursorY, setCursorY] = useState<number | null>(null);
  const [activeDragLine, setActiveDragLine] = useState<'top' | 'left' | 'right' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Track cursor mouse movements over canvas stage
  useEffect(() => {
    const container = document.getElementById('pdf-canvas-stage-container');
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect || rect.height === 0) return;

      const normY = (e.clientY - rect.top) / rect.height;
      const normX = (e.clientX - rect.left) / rect.width;

      if (normY >= 0 && normY <= 1) {
        setCursorY(normY);
      }

      if (activeDragLine === 'top') {
        const newYmin = Math.min(activeBox.ymax - 0.01, Math.max(0, normY));
        onChangeBox({ ...activeBox, ymin: newYmin });
      } else if (activeDragLine === 'left') {
        const newXmin = Math.min(activeBox.xmax - 0.05, Math.max(0, normX));
        onChangeBox({ ...activeBox, xmin: newXmin });
      } else if (activeDragLine === 'right') {
        const newXmax = Math.max(activeBox.xmin + 0.05, Math.min(1, normX));
        onChangeBox({ ...activeBox, xmax: newXmax });
      }
    };

    const handleMouseUp = () => {
      setActiveDragLine(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDragLine, activeBox, onChangeBox]);

  // Click on canvas to cut line & save question
  const handleCanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // If clicking on drag handles, don't trigger cut
    if (activeDragLine) return;

    const container = document.getElementById('pdf-canvas-stage-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickY = (e.clientY - rect.top) / rect.height;

    // Only cut if click is below current ymin
    if (clickY > activeBox.ymin + 0.008) {
      onChangeBox({
        ...activeBox,
        ymax: clickY,
      });

      // Trigger crop save & advance
      setTimeout(() => {
        onApplyCrop();
      }, 40);
    }
  };

  const topPercent = activeBox.ymin * 100;
  const leftPercent = activeBox.xmin * 100;
  const rightPercent = activeBox.xmax * 100;
  const widthPercent = (activeBox.xmax - activeBox.xmin) * 100;

  const activeYmax = activeBox.ymax;
  const heightPercent = Math.max(0, activeYmax - activeBox.ymin) * 100;

  // Predicted boundary line
  const predictedYmaxPercent = predictedBox ? predictedBox.ymax * 100 : null;

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      className="absolute inset-0 pointer-events-auto cursor-crosshair z-30 select-none"
    >
      {/* 1. Top HUD Quick Toolbar */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-950/95 backdrop-blur-md border border-indigo-500/40 px-3 py-1.5 rounded-xl shadow-2xl pointer-events-auto">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-950 border border-indigo-500/50 rounded-lg text-xs font-bold text-indigo-200">
          <Scissors className="w-3.5 h-3.5 text-indigo-400" />
          <span>Line Crop Q.{questionNumber}</span>
        </div>

        {/* Column Mode Selector (Double vs Single) */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onColumnModeChange?.('double');
              onSetColumnPreset?.('left');
            }}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded transition-all ${
              columnMode === 'double'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Double Column Mode (Default)"
          >
            <Columns className="w-3 h-3" />
            <span>Double Col</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onColumnModeChange?.('single');
              onSetColumnPreset?.('full');
            }}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded transition-all ${
              columnMode === 'single'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Single Column Mode (Full Width)"
          >
            <LayoutGrid className="w-3 h-3" />
            <span>Single Col</span>
          </button>
        </div>

        {/* Column Quick Presets (Left / Right / Full) */}
        {onSetColumnPreset && (
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetColumnPreset('left');
              }}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                Math.abs(activeBox.xmin - 0.035) < 0.02 && Math.abs(activeBox.xmax - 0.49) < 0.02
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Left Half (Key 1)"
            >
              Left (1)
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetColumnPreset('right');
              }}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                Math.abs(activeBox.xmin - 0.508) < 0.02 && Math.abs(activeBox.xmax - 0.965) < 0.02
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Right Half (Key 2)"
            >
              Right (2)
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetColumnPreset('full');
              }}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                Math.abs(activeBox.xmin - 0.035) < 0.02 && Math.abs(activeBox.xmax - 0.965) < 0.02
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Full Width (Key 3)"
            >
              Full (3)
            </button>
          </div>
        )}

        {/* AI Predicted Cut Button */}
        {predictedBox && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChangeBox(predictedBox);
              setTimeout(() => onApplyCrop(), 40);
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11px] font-bold rounded-lg shadow-md transition-all active:scale-95"
            title="Use AI predicted cut line for Q.X (Spacebar)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>AI Cut (Space)</span>
          </button>
        )}

        {/* Undo Cut Button */}
        {onUndoLineCut && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUndoLineCut();
            }}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
            title="Undo previous line cut (Esc / Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2. Active Question Selection Box */}
      <div
        className="absolute border-2 border-indigo-400 bg-indigo-500/15 pointer-events-none rounded shadow-lg transition-all"
        style={{
          top: `${topPercent}%`,
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          height: `${heightPercent}%`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-mono font-bold text-indigo-200 bg-slate-950/85 px-2 py-0.5 rounded border border-indigo-500/40 shadow">
            Q.{questionNumber} Height: {heightPercent.toFixed(1)}% ({Math.round((heightPercent / 100) * containerHeight)}px)
          </span>
        </div>
      </div>

      {/* 3. Top Boundary Line (Start Y for Q.X) */}
      <div
        className="absolute left-0 right-0 pointer-events-auto cursor-ns-resize group"
        style={{ top: `${topPercent}%`, height: '14px', transform: 'translateY(-7px)' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDragLine('top');
        }}
      >
        <div className="w-full h-0.5 bg-cyan-400 shadow-md group-hover:h-1 transition-all" />
        <div className="absolute left-4 -top-3 px-2 py-0.5 bg-slate-950 border border-cyan-400 text-cyan-300 text-[10px] font-bold font-mono rounded-full flex items-center gap-1 shadow-lg cursor-ns-resize">
          <ArrowUpDown className="w-2.5 h-2.5" />
          <span>START Q.{questionNumber}: {topPercent.toFixed(1)}%</span>
        </div>
      </div>

      {/* 4. AI Predicted Boundary Line (Dashed Purple/Magenta) */}
      {predictedYmaxPercent !== null && (
        <div
          className="absolute left-0 right-0 pointer-events-auto cursor-pointer group"
          style={{ top: `${predictedYmaxPercent}%`, height: '14px', transform: 'translateY(-7px)' }}
          onClick={(e) => {
            e.stopPropagation();
            if (predictedBox) {
              onChangeBox(predictedBox);
              setTimeout(() => onApplyCrop(), 40);
            }
          }}
        >
          <div className="w-full h-0.5 border-t-2 border-dashed border-purple-400 shadow-lg group-hover:border-solid transition-all animate-pulse" />
          <div className="absolute right-4 -top-3 px-2 py-0.5 bg-purple-950/90 border border-purple-400 text-purple-200 text-[10px] font-bold font-mono rounded-full flex items-center gap-1.5 shadow-xl hover:scale-105 transition-transform">
            <Sparkles className="w-3 h-3 text-amber-300 animate-spin" />
            <span>✨ AI PREDICTED END Q.{questionNumber}: {predictedYmaxPercent.toFixed(1)}% (CLICK TO CUT)</span>
          </div>
        </div>
      )}

      {/* 5. Live Cursor Horizontal Cut Guide Line */}
      {cursorY !== null && cursorY > activeBox.ymin + 0.008 && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: `${cursorY * 100}%`, transform: 'translateY(-50%)' }}
        >
          <div className="w-full h-0.5 bg-amber-400/90 shadow-lg border-b border-amber-300/50" />
          <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 px-2.5 py-0.5 bg-amber-950 border border-amber-400 text-amber-300 text-[10px] font-bold font-mono rounded-full flex items-center gap-1 shadow-2xl">
            <Scissors className="w-3 h-3 text-amber-300" />
            <span>CLICK TO CUT Q.{questionNumber} AT Y: {(cursorY * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* 6. Column Left Boundary Line (X1) */}
      <div
        className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize group"
        style={{ left: `${leftPercent}%`, width: '14px', transform: 'translateX(-7px)' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDragLine('left');
        }}
      >
        <div className="h-full w-0.5 bg-indigo-400/80 shadow-md group-hover:w-1 transition-all mx-auto" />
      </div>

      {/* 7. Column Right Boundary Line (X2) */}
      <div
        className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize group"
        style={{ left: `${rightPercent}%`, width: '14px', transform: 'translateX(-7px)' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setActiveDragLine('right');
        }}
      >
        <div className="h-full w-0.5 bg-indigo-400/80 shadow-md group-hover:w-1 transition-all mx-auto" />
      </div>
    </div>
  );
};
