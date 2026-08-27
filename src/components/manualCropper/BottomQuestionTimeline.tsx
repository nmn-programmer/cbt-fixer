import React, { useRef } from 'react';
import {
  ManualCroppedQuestion,
} from '../../types/manualCropper';
import {
  Trash2,
  Edit3,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Copy,
  ArrowRight
} from 'lucide-react';

interface BottomQuestionTimelineProps {
  questions: ManualCroppedQuestion[];
  activeQuestionId: string | null;
  onSelectQuestion: (question: ManualCroppedQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onDuplicateQuestion: (question: ManualCroppedQuestion) => void;
}

export const BottomQuestionTimeline: React.FC<BottomQuestionTimelineProps> = ({
  questions,
  activeQuestionId,
  onSelectQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -260, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 260, behavior: 'smooth' });
    }
  };

  if (questions.length === 0) {
    return (
      <div className="h-16 border-t border-slate-800 bg-slate-950/90 px-4 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-600" />
          <span>No questions cropped yet. Draw a box on the PDF canvas and press <strong>Save Crop (Enter)</strong> to begin!</span>
        </div>
        <span className="text-[11px] font-mono text-slate-600">0 Questions Cropped</span>
      </div>
    );
  }

  // Sort questions sequentially by Question Number
  const sortedQuestions = [...questions].sort((a, b) => a.que - b.que);

  return (
    <div className="h-24 sm:h-28 border-t border-slate-800 bg-slate-950/95 flex flex-col shrink-0 select-none z-20 backdrop-blur-md">
      {/* Header bar of strip */}
      <div className="px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">Cropped Questions Timeline</span>
          <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800/50 rounded font-mono text-[10px]">
            {questions.length} total
          </span>
          <span className="text-slate-500 hidden sm:inline">• Click any question card to jump & re-crop</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={scrollLeft}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Scroll Left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={scrollRight}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Scroll Right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Cards list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center gap-2.5 px-3 py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700"
      >
        {sortedQuestions.map((q) => {
          const isActive = q.id === activeQuestionId;
          const thumbnail = q.stitchedPreviewUrl || (q.parts[0]?.previewUrl ?? '');
          const isMultiPart = q.parts.length > 1;

          return (
            <div
              key={q.id}
              onClick={() => onSelectQuestion(q)}
              className={`flex-shrink-0 w-44 sm:w-52 h-full rounded-lg border transition-all cursor-pointer flex items-center gap-2 p-1.5 group relative ${
                isActive
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Thumbnail image */}
              <div className="w-12 sm:w-14 h-full bg-slate-950 rounded border border-slate-800 overflow-hidden flex items-center justify-center relative shrink-0">
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={`Q${q.que}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-slate-600 font-mono">Q.{q.que}</span>
                )}

                {isMultiPart && (
                  <span className="absolute bottom-0 right-0 bg-indigo-600 text-[8px] text-white px-1 font-bold rounded-tl">
                    {q.parts.length}P
                  </span>
                )}
              </div>

              {/* Question metadata */}
              <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-100 flex items-center gap-1 truncate">
                    <span>Q.{q.que}</span>
                    {q.type && (
                      <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400 font-mono">
                        {q.type}
                      </span>
                    )}
                  </span>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateQuestion(q);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                      title="Duplicate Question"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteQuestion(q.id);
                      }}
                      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded"
                      title="Delete Question"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 truncate">
                  {q.subject || 'No Subject'} {q.section ? `• ${q.section}` : ''}
                </div>

                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                  <span>Page {q.parts[0]?.page || 1}</span>
                  <span className="text-emerald-400/80">+{q.marks?.cm || 4}/{q.marks?.im ?? -1}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
