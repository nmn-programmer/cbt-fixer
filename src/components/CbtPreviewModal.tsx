import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  HelpCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { QuestionData, SubjectData } from '../types/cbt';

type QuestionStatus = 'not_visited' | 'not_answered' | 'answered' | 'marked' | 'answered_marked';

export const CbtPreviewModal: React.FC = () => {
  const { archives, activeArchiveId, isCbtSimulatorOpen, setCbtSimulatorOpen } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);
  const [selectedSubIdx, setSelectedSubIdx] = useState<number>(0);
  const [currentQIdx, setCurrentQIdx] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(180 * 60); // 3 Hours
  const [isPaletteOpenMobile, setIsPaletteOpenMobile] = useState<boolean>(false);
  const [darkModeSim, setDarkModeSim] = useState<boolean>(false);

  // Timer countdown
  useEffect(() => {
    if (!isCbtSimulatorOpen) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isCbtSimulatorOpen]);

  if (!isCbtSimulatorOpen || !activeArchive) return null;

  const currentSubject: SubjectData = activeArchive.subjects[selectedSubIdx] || activeArchive.subjects[0];
  const allQuestionsInSubject: QuestionData[] = currentSubject?.sections.flatMap((s) => s.questions) || [];
  const currentQuestion: QuestionData | undefined = allQuestionsInSubject[currentQIdx] || allQuestionsInSubject[0];

  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelectAnswer = (ans: string) => {
    if (!currentQuestion) return;
    setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: ans }));
  };

  const handleSaveAndNext = () => {
    if (!currentQuestion) return;
    const ans = userAnswers[currentQuestion.id];
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion.id]: ans ? 'answered' : 'not_answered',
    }));

    if (currentQIdx < allQuestionsInSubject.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    }
  };

  const handleMarkForReviewAndNext = () => {
    if (!currentQuestion) return;
    const ans = userAnswers[currentQuestion.id];
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion.id]: ans ? 'answered_marked' : 'marked',
    }));

    if (currentQIdx < allQuestionsInSubject.length - 1) {
      setCurrentQIdx(currentQIdx + 1);
    }
  };

  const handleClearResponse = () => {
    if (!currentQuestion) return;
    setUserAnswers((prev) => {
      const updated = { ...prev };
      delete updated[currentQuestion.id];
      return updated;
    });
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion.id]: 'not_answered',
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 select-none overflow-hidden animate-in fade-in duration-150">
      {/* Top JEE CBT Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
            JEE
          </div>
          <div>
            <h2 className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
              <span>{activeArchive.title}</span>
              <span className="hidden sm:inline text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Exam Live Simulator
              </span>
            </h2>
            <div className="text-[10px] text-slate-400">
              National Testing Agency (NTA) Standard CBT Interface
            </div>
          </div>
        </div>

        {/* Center: Timer */}
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-300">
            {formatTime(timeLeftSeconds)}
          </span>
        </div>

        {/* Right Candidate Profile & Exit */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-right">
            <div className="text-[11px]">
              <div className="font-bold text-slate-200">Candidate: JEE Aspirant</div>
              <div className="text-[10px] text-slate-500">Roll: 2501009842</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <button
            onClick={() => setCbtSimulatorOpen(false)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-md border border-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close Exam View</span>
          </button>
        </div>
      </div>

      {/* Subject Navigation Tabs */}
      <div className="flex items-center justify-between px-3 sm:px-6 bg-slate-900 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1">
          {activeArchive.subjects.map((sub, idx) => {
            const isSubActive = idx === selectedSubIdx;
            const subQCount = sub.sections.reduce((sum, sec) => sum + sec.questions.length, 0);

            return (
              <button
                key={sub.id}
                onClick={() => {
                  setSelectedSubIdx(idx);
                  setCurrentQIdx(0);
                }}
                className={`px-4 py-2 font-bold border-b-2 transition-all whitespace-nowrap ${
                  isSubActive
                    ? 'border-indigo-500 text-indigo-300 bg-slate-800/80 rounded-t'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{sub.name}</span>
                <span className="ml-1 text-[10px] text-slate-500">({subQCount})</span>
              </button>
            );
          })}
        </div>

        {/* Mobile Palette Toggle & Theme */}
        <div className="flex items-center gap-2 py-1">
          <button
            onClick={() => setDarkModeSim(!darkModeSim)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
              darkModeSim
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {darkModeSim ? 'CBT Dark Invert On' : 'Standard Light View'}
          </button>

          <button
            onClick={() => setIsPaletteOpenMobile(!isPaletteOpenMobile)}
            className="lg:hidden px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold"
          >
            Question Palette
          </button>
        </div>
      </div>

      {/* Main Exam Area (Split Pane) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Question Pane */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 sm:p-6 bg-slate-950/70 border-r border-slate-800 space-y-4">
          {currentQuestion ? (
            <>
              {/* Question Header Bar */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span className="text-indigo-400">Question No. {currentQuestion.que}</span>
                  <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {currentQuestion.type.toUpperCase()}
                  </span>
                </div>

                {/* Marks scheme indicator */}
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <span className="text-emerald-400 font-mono">+{currentQuestion.marks.cm}</span>
                  <span className="text-rose-400 font-mono">
                    {currentQuestion.marks.im > 0
                      ? `-${currentQuestion.marks.im}`
                      : currentQuestion.marks.im}
                  </span>
                </div>
              </div>

              {/* Question Image Slice Display */}
              <div className="space-y-3">
                {currentQuestion.images.length > 0 ? (
                  currentQuestion.images.map((img) => {
                    const resolvedBlobUrl = img.blobUrl?.trim() || activeArchive.rawFiles.get(img.fileName)?.url || '';
                    return (
                      <div
                        key={`${img.id}-${resolvedBlobUrl}-${img.sizeBytes || 0}`}
                        className="rounded-lg border border-slate-800 bg-white p-3 shadow-md overflow-hidden"
                      >
                        {resolvedBlobUrl && resolvedBlobUrl.trim() !== '' ? (
                          <img
                            src={resolvedBlobUrl}
                            alt={`Q${currentQuestion.que} Part ${img.partIndex}`}
                            referrerPolicy="no-referrer"
                            style={{
                              filter: darkModeSim ? 'invert(0.9) hue-rotate(180deg)' : 'none',
                            }}
                            className="max-w-full h-auto mx-auto select-none"
                          />
                        ) : (
                          <div className="p-4 text-center text-xs text-amber-500 bg-amber-500/10 rounded">
                            Image binary not loaded ({img.fileName})
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs">
                    No image slice available for this question item.
                  </div>
                )}
              </div>

              {/* Answer Form */}
              <div className="mt-6 pt-4 border-t border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Select Your Response:
                </div>

                {/* MCQ / MSQ Options */}
                {(currentQuestion.type === 'mcq' || currentQuestion.type === 'msq') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                    {['1', '2', '3', '4'].map((opt) => {
                      const letter = String.fromCharCode(64 + parseInt(opt, 10));
                      const isSelected = userAnswers[currentQuestion.id] === opt;

                      return (
                        <button
                          key={opt}
                          onClick={() => handleSelectAnswer(opt)}
                          className={`flex items-center gap-3 p-3 rounded-lg border font-semibold text-xs transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSelected ? 'bg-white text-emerald-800' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {letter}
                          </div>
                          <span>Option ({letter})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* NAT Numerical */}
                {currentQuestion.type === 'nat' && (
                  <div className="space-y-2 max-w-xs">
                    <label className="block text-xs text-slate-400 font-medium">
                      Enter Numerical Value:
                    </label>
                    <input
                      type="text"
                      value={userAnswers[currentQuestion.id] || ''}
                      onChange={(e) => handleSelectAnswer(e.target.value)}
                      placeholder="Type number..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">No questions in this subject</div>
          )}
        </div>

        {/* Right Side: Question Palette (Desktop & Mobile Drawer) */}
        <div
          className={`w-72 lg:w-80 bg-slate-900 border-l border-slate-800 p-4 flex flex-col shrink-0 ${
            isPaletteOpenMobile ? 'fixed inset-y-0 right-0 z-40 shadow-2xl flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">
              Question Palette
            </h3>
            {isPaletteOpenMobile && (
              <button
                onClick={() => setIsPaletteOpenMobile(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Palette Legend */}
          <div className="grid grid-cols-2 gap-1.5 py-3 text-[10px] text-slate-300 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-emerald-600 font-bold text-white flex items-center justify-center">
                ✓
              </span>
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-rose-600 font-bold text-white flex items-center justify-center">
                !
              </span>
              <span>Not Answered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-purple-600 font-bold text-white flex items-center justify-center">
                ★
              </span>
              <span>Marked Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                ·
              </span>
              <span>Not Visited</span>
            </div>
          </div>

          {/* Palette Question Number Grid */}
          <div className="flex-1 overflow-y-auto py-3">
            <div className="grid grid-cols-5 gap-2">
              {allQuestionsInSubject.map((q, idx) => {
                const isCurrent = idx === currentQIdx;
                const status = questionStatuses[q.id] || (userAnswers[q.id] ? 'answered' : 'not_visited');

                let badgeClass = 'bg-slate-800 text-slate-400 border border-slate-700';
                if (status === 'answered') badgeClass = 'bg-emerald-600 text-white font-bold shadow-sm';
                else if (status === 'not_answered') badgeClass = 'bg-rose-600 text-white font-bold shadow-sm';
                else if (status === 'marked' || status === 'answered_marked')
                  badgeClass = 'bg-purple-600 text-white font-bold shadow-sm';

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentQIdx(idx);
                      setIsPaletteOpenMobile(false);
                    }}
                    className={`h-9 rounded-md text-xs font-mono transition-all flex items-center justify-center ${badgeClass} ${
                      isCurrent ? 'ring-2 ring-indigo-400 scale-105' : 'hover:opacity-80'
                    }`}
                  >
                    {q.que}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Examination Navigation & Action Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 sm:px-6 py-2.5 bg-slate-950 border-t border-slate-800 gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkForReviewAndNext}
            className="px-3 py-1.5 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-700 text-purple-200 text-xs font-semibold rounded-md transition-colors"
          >
            Mark for Review & Next
          </button>
          <button
            onClick={handleClearResponse}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-md border border-slate-700 transition-colors"
          >
            Clear Response
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAndNext}
            className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs rounded-md shadow-md transition-all"
          >
            Save & Next
          </button>
        </div>
      </div>
    </div>
  );
};
