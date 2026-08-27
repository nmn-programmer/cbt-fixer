import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, X, Layers } from 'lucide-react';

interface BatchProcessingProgressModalProps {
  isOpen: boolean;
  total: number;
  completed: number;
  currentTaskName: string;
  onCancel?: () => void;
}

export const BatchProcessingProgressModal: React.FC<BatchProcessingProgressModalProps> = ({
  isOpen,
  total,
  completed,
  currentTaskName,
  onCancel,
}) => {
  if (!isOpen) return null;

  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Exporting CBT Archive</h3>
              <p className="text-xs text-slate-400">Processing slices, stitching & indexing...</p>
            </div>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Cancel processing"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium truncate max-w-[260px]">{currentTaskName || 'Processing...'}</span>
            <span className="font-mono text-indigo-400 font-bold">
              {completed} / {total} ({percentage}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-200"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>High-performance non-blocking queue</span>
          </span>
          <span className="font-mono text-emerald-400">Ready for 100+ questions</span>
        </div>
      </div>
    </div>
  );
};
