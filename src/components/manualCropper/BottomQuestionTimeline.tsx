import React from 'react';
import { ManualCroppedQuestion } from '../../types/manualCropper';
import { FileText, Plus, Trash2, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BottomQuestionTimelineProps {
  questions: ManualCroppedQuestion[];
  activeQuestionId: string | null;
  onSelectQuestion: (q: ManualCroppedQuestion) => void;
  onDeleteQuestion?: (id: string) => void;
  onDuplicateQuestion?: (q: ManualCroppedQuestion) => void;
}

export const BottomQuestionTimeline: React.FC<BottomQuestionTimelineProps> = ({
  questions,
  activeQuestionId,
  onSelectQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
}) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 px-2 custom-scrollbar select-none">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider pr-2 border-r border-slate-800 shrink-0">
        <FileText className="w-4 h-4 text-indigo-400" />
        <span>Timeline ({questions.length})</span>
      </div>

      {questions.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-1 px-2">
          No cropped questions in archive yet. Select an area on the PDF stage to begin.
        </div>
      ) : (
        questions.map((q) => {
          const isActive = q.id === activeQuestionId;
          const hasImage = q.stitchedPreviewUrl || (q.parts && q.parts.length > 0 && q.parts[0].previewUrl);

          return (
            <div
              key={q.id}
              onClick={() => onSelectQuestion(q)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs cursor-pointer transition-all shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-bold ring-2 ring-indigo-400/50'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[11px] ${
                isActive ? 'bg-white text-indigo-700' : 'bg-slate-900 text-indigo-400 border border-slate-800'
              }`}>
                {q.que}
              </span>

              <div className="flex flex-col">
                <span className="truncate max-w-[100px] leading-tight">
                  {q.subject || 'General'}
                </span>
                <span className={`text-[9px] uppercase font-mono leading-tight ${
                  isActive ? 'text-indigo-200' : 'text-slate-500'
                }`}>
                  {q.type} • P{q.parts?.[0]?.page || 1}
                </span>
              </div>

              {q.parts && q.parts.length > 1 && (
                <span className={`text-[9px] font-bold px-1 rounded ${
                  isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-purple-950 text-purple-300 border border-purple-500/30'
                }`}>
                  +{q.parts.length - 1}
                </span>
              )}

              {/* Action hover buttons */}
              <div className="hidden group-hover:flex items-center gap-1 ml-1">
                {onDuplicateQuestion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateQuestion(q);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                    title="Duplicate"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                )}
                {onDeleteQuestion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteQuestion(q.id);
                    }}
                    className="p-1 rounded hover:bg-rose-900/60 text-slate-300 hover:text-rose-400"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
