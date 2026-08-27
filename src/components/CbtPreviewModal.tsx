import React, { useState, useEffect } from 'react';
import {
  Award,
  BarChart3,
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
  TrendingUp,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { QuestionData, SubjectData } from '../types/cbt';
import { evaluateWholePaper, PaperEvaluationReport } from '../utils/evaluationEngine';

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

  // Scorecard & Submission state
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [evaluationReport, setEvaluationReport] = useState<PaperEvaluationReport | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'full_correct' | 'partial_correct' | 'incorrect' | 'unattempted'>('all');

  // Timer countdown
  useEffect(() => {
    if (!isCbtSimulatorOpen || isSubmitted) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isCbtSimulatorOpen, isSubmitted]);

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

    if (currentQuestion.type === 'msq') {
      // Toggle option in comma-separated list
      const currentList = userAnswers[currentQuestion.id]
        ? userAnswers[currentQuestion.id].split(',').map((x) => x.trim()).filter(Boolean)
        : [];
      let updated: string[];
      if (currentList.includes(ans)) {
        updated = currentList.filter((x) => x !== ans);
      } else {
        updated = [...currentList, ans].sort();
      }
      setUserAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: updated.join(','),
      }));
    } else {
      setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: ans }));
    }
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

  const handleSubmitExam = () => {
    const report = evaluateWholePaper(activeArchive.subjects, userAnswers);
    setEvaluationReport(report);
    setIsSubmitted(true);
  };

  const handleResetExam = () => {
    setUserAnswers({});
    setQuestionStatuses({});
    setTimeLeftSeconds(180 * 60);
    setIsSubmitted(false);
    setEvaluationReport(null);
    setCurrentQIdx(0);
    setSelectedSubIdx(0);
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

        {/* Center: Timer & Submission Status */}
        {!isSubmitted ? (
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs sm:text-sm font-mono font-bold text-amber-300">
              {formatTime(timeLeftSeconds)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 px-3 py-1.5 rounded-lg text-emerald-300 text-xs font-semibold">
            <Award className="w-4 h-4 text-emerald-400" />
            <span>Exam Completed & Evaluated</span>
          </div>
        )}

        {/* Right Actions & Exit */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isSubmitted && (
            <button
              onClick={handleSubmitExam}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-md shadow transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Submit Test</span>
            </button>
          )}

          <button
            onClick={() => setCbtSimulatorOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            title="Exit Simulator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* RENDER SCORECARD VIEW IF SUBMITTED */}
      {isSubmitted && evaluationReport ? (
        <div className="flex-1 bg-slate-950 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Top Score Summary Banner */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1 flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    <span>Official Scorecard & Analysis</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {evaluationReport.totalScore}{' '}
                    <span className="text-base text-slate-400 font-normal">
                      / {evaluationReport.maxPossibleScore} Marks
                    </span>
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Overall Accuracy: <strong className="text-indigo-300">{evaluationReport.accuracy}%</strong> · Percentage: <strong className="text-emerald-300">{evaluationReport.percentage}%</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetExam}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors border border-slate-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retake Test</span>
                  </button>
                  <button
                    onClick={() => setCbtSimulatorOpen(false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg"
                  >
                    Return to Studio
                  </button>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800/80">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-emerald-400 font-semibold">Full Correct</div>
                  <div className="text-xl font-bold text-white mt-0.5">{evaluationReport.fullCorrectCount}</div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-purple-500/30 text-center">
                  <div className="text-[11px] text-purple-400 font-semibold">JEE Partial (+1/+2/+3)</div>
                  <div className="text-xl font-bold text-purple-200 mt-0.5">{evaluationReport.partialCorrectCount}</div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-rose-500/30 text-center">
                  <div className="text-[11px] text-rose-400 font-semibold">Incorrect (Negative)</div>
                  <div className="text-xl font-bold text-rose-200 mt-0.5">{evaluationReport.incorrectCount}</div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-slate-400 font-semibold">Unattempted</div>
                  <div className="text-xl font-bold text-slate-300 mt-0.5">{evaluationReport.unattemptedCount}</div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-center col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-blue-400 font-semibold">Attempt Rate</div>
                  <div className="text-xl font-bold text-blue-200 mt-0.5">
                    {Math.round((evaluationReport.attemptedCount / evaluationReport.totalQuestions) * 100)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Analytics Breakdown Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <span>Subject-Wise Performance Breakdown</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="pb-2 font-medium">Subject</th>
                      <th className="pb-2 font-medium text-center">Questions</th>
                      <th className="pb-2 font-medium text-center">Correct</th>
                      <th className="pb-2 font-medium text-center text-purple-400">Partial</th>
                      <th className="pb-2 font-medium text-center text-rose-400">Incorrect</th>
                      <th className="pb-2 font-medium text-center">Score</th>
                      <th className="pb-2 font-medium text-right">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {evaluationReport.subjectAnalytics.map((sub) => (
                      <tr key={sub.subjectName} className="hover:bg-slate-800/40">
                        <td className="py-2.5 font-bold text-slate-200">{sub.subjectName}</td>
                        <td className="py-2.5 text-center text-slate-400">{sub.totalQuestions}</td>
                        <td className="py-2.5 text-center text-emerald-400 font-semibold">{sub.correct}</td>
                        <td className="py-2.5 text-center text-purple-300 font-semibold">{sub.partial}</td>
                        <td className="py-2.5 text-center text-rose-400 font-semibold">{sub.incorrect}</td>
                        <td className="py-2.5 text-center font-bold text-white font-mono">
                          {sub.score} / {sub.maxScore}
                        </td>
                        <td className="py-2.5 text-right text-indigo-300 font-semibold">{sub.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Question by Question Solutions & Partial Marks Inspection */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Question-by-Question Solution & Grading Review
                </h3>
                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 text-[11px] overflow-x-auto">
                  {(['all', 'full_correct', 'partial_correct', 'incorrect', 'unattempted'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setReviewFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                        reviewFilter === filterKey
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {filterKey.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {evaluationReport.results
                  .filter((r) => reviewFilter === 'all' || r.status === reviewFilter)
                  .map((res) => {
                    const qObj = activeArchive.subjects
                      .flatMap((s) => s.sections)
                      .flatMap((sec) => sec.questions)
                      .find((q) => q.id === res.questionId);

                    return (
                      <div
                        key={res.questionId}
                        className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white">
                              Q#{res.que} ({res.subjectName} · {res.sectionName})
                            </span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {res.type.toUpperCase()}
                            </span>
                            {res.status === 'full_correct' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300">
                                Full Correct (+{res.marksAwarded})
                              </span>
                            )}
                            {res.status === 'partial_correct' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 border border-purple-600 text-purple-300">
                                JEE Partial (+{res.marksAwarded})
                              </span>
                            )}
                            {res.status === 'incorrect' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 border border-rose-600 text-rose-300">
                                Incorrect ({res.marksAwarded})
                              </span>
                            )}
                            {res.status === 'unattempted' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                Unattempted (0)
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-400">
                            Your Answer: <strong className="text-slate-200">{res.userAnswer || 'None'}</strong> · Official Answer:{' '}
                            <strong className="text-emerald-400">{res.officialAnswer || 'None'}</strong>
                          </div>

                          <p className="text-[11px] text-slate-400 italic">{res.explanation}</p>
                        </div>

                        {qObj?.images?.[0]?.blobUrl && (
                          <img
                            src={qObj.images[0].blobUrl}
                            alt={`Q#${res.que}`}
                            className="max-h-20 max-w-[200px] object-contain rounded border border-slate-800 bg-white p-0.5"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LIVE EXAMINATION INTERFACE */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Main Question & Canvas Area */}
          <div className="flex-1 flex flex-col overflow-y-auto p-3 sm:p-6 bg-slate-950">
            {/* Subject Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 overflow-x-auto scrollbar-none shrink-0">
              {activeArchive.subjects.map((sub, idx) => {
                const isSelected = idx === selectedSubIdx;
                const count = sub.sections.flatMap((s) => s.questions).length;

                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setSelectedSubIdx(idx);
                      setCurrentQIdx(0);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Current Question Info & Controls */}
            {currentQuestion ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 mb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Question #{currentQuestion.que}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      Type: {currentQuestion.type.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-400 font-semibold font-mono">
                      +{currentQuestion.marks.cm}
                    </span>
                    <span className="text-rose-400 font-semibold font-mono">
                      {currentQuestion.marks.im}
                    </span>
                    {currentQuestion.type === 'msq' && (
                      <span className="text-purple-400 text-[11px] font-mono">
                        Partial: +{currentQuestion.marks.partialTiers?.threeCorrect ?? 3}/+{currentQuestion.marks.partialTiers?.twoCorrect ?? 2}/+{currentQuestion.marks.partialTiers?.oneCorrect ?? 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Image Render */}
                <div className="flex-1 flex flex-col items-center justify-start bg-slate-900/50 p-4 rounded-xl border border-slate-800 overflow-y-auto">
                  {currentQuestion.images && currentQuestion.images.length > 0 ? (
                    currentQuestion.images.map((img, idx) => (
                      <div key={img.id || idx} className="max-w-3xl w-full flex flex-col items-center mb-4">
                        <img
                          src={img.blobUrl}
                          alt={`Question ${currentQuestion.que} Part ${img.partIndex || idx + 1}`}
                          className="max-w-full rounded bg-white shadow-md p-1"
                        />
                        {currentQuestion.images.length > 1 && (
                          <div className="text-[10px] text-slate-500 mt-1 font-mono">
                            Part {img.partIndex || idx + 1} of {currentQuestion.images.length}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs">
                      No image slice available for this question item.
                    </div>
                  )}
                </div>

                {/* Answer Form */}
                <div className="mt-6 pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <span>
                      Select Your Response{' '}
                      {currentQuestion.type === 'msq' && (
                        <span className="text-purple-400 lowercase font-normal">(One or More Options)</span>
                      )}
                    </span>
                  </div>

                  {/* MCQ / MSQ Options */}
                  {(currentQuestion.type === 'mcq' || currentQuestion.type === 'msq') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                      {['1', '2', '3', '4'].map((opt) => {
                        const letter = String.fromCharCode(64 + parseInt(opt, 10));
                        const currentAns = userAnswers[currentQuestion.id] || '';
                        const isSelected =
                          currentQuestion.type === 'msq'
                            ? currentAns.split(',').map((s) => s.trim()).includes(opt)
                            : currentAns === opt;

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
      )}

      {/* Bottom Examination Navigation & Action Bar */}
      {!isSubmitted && (
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
      )}
    </div>
  );
};
