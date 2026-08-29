import React, { useState, useMemo } from 'react';
import { X, Check, Award, Sliders, Hash, Layers, BookOpen, AlertCircle } from 'lucide-react';
import { MarksScheme, QuestionData, QuestionPaperArchive } from '../../types/cbt';
import { MARKING_PRESETS } from '../../utils/constants';

interface MarkingSchemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeArchive?: QuestionPaperArchive | null;
  subjects?: any[];
  currentQuestionId?: string | null;
  activeQuestionId?: string | null;
  currentQuestionNumber?: number | '';
  activeQuestionNumber?: number | '';
  currentSubject?: string;
  activeSubjectId?: string;
  currentSection?: string;
  activeSectionId?: string;
  currentScheme?: MarksScheme;
  onApplyScheme?: (scheme: MarksScheme, scope: MarkingScopeConfig) => void;
  onApply?: (scheme: MarksScheme, scope: MarkingScopeConfig) => void;
}

export interface MarkingScopeConfig {
  type: 'current' | 'all' | 'range' | 'subject' | 'section';
  rangeStart?: number;
  rangeEnd?: number;
  subjectId?: string;
  sectionId?: string;
}

export const MarkingSchemeModal: React.FC<MarkingSchemeModalProps> = ({
  isOpen,
  onClose,
  activeArchive,
  subjects = [],
  currentQuestionId,
  activeQuestionId,
  currentQuestionNumber,
  activeQuestionNumber,
  currentSubject,
  currentSection,
  onApplyScheme,
  onApply,
}) => {
  const effectiveQuestionNumber = currentQuestionNumber ?? activeQuestionNumber ?? '';

  const [scopeType, setScopeType] = useState<'current' | 'all' | 'range' | 'subject' | 'section'>('current');
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(30);
  const [targetSubjectId, setTargetSubjectId] = useState<string>(
    activeArchive?.subjects?.[0]?.id || subjects[0]?.id || ''
  );
  const [targetSectionId, setTargetSectionId] = useState<string>(
    activeArchive?.subjects?.[0]?.sections?.[0]?.id || subjects[0]?.sections?.[0]?.id || ''
  );

  const [selectedPresetId, setSelectedPresetId] = useState<string>('jee_main_mcq');
  const [cm, setCm] = useState<number>(4);
  const [im, setIm] = useState<number>(-1);
  const [pm, setPm] = useState<number>(0);
  const [maxMarks, setMaxMarks] = useState<number>(4);

  // Apply preset values
  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    const p = MARKING_PRESETS.find((item) => item.id === presetId);
    if (p) {
      setCm(p.marks.cm);
      setIm(p.marks.im);
      setPm(p.marks.pm || 0);
      setMaxMarks(p.marks.max || p.marks.cm);
    }
  };

  const subjectList = activeArchive?.subjects || subjects || [];

  // Compute how many questions match the selected scope
  const affectedCount = useMemo(() => {
    let count = 0;
    if (scopeType === 'current') {
      return 1;
    }
    if (scopeType === 'all') {
      subjectList.forEach((s) => {
        s.sections?.forEach((sec: any) => {
          count += sec.questions?.length || 0;
        });
      });
      return count;
    }
    if (scopeType === 'range') {
      subjectList.forEach((s) => {
        s.sections?.forEach((sec: any) => {
          sec.questions?.forEach((q: any) => {
            if (q.que >= rangeStart && q.que <= rangeEnd) {
              count++;
            }
          });
        });
      });
      return count;
    }
    if (scopeType === 'subject') {
      const sub = subjectList.find((s) => s.id === targetSubjectId);
      if (sub) {
        sub.sections?.forEach((sec: any) => {
          count += sec.questions?.length || 0;
        });
      }
      return count;
    }
    if (scopeType === 'section') {
      subjectList.forEach((s) => {
        const sec = s.sections?.find((sc: any) => sc.id === targetSectionId);
        if (sec) {
          count += sec.questions?.length || 0;
        }
      });
      return count;
    }
    return 0;
  }, [subjectList, scopeType, rangeStart, rangeEnd, targetSubjectId, targetSectionId]);

  if (!isOpen) return null;

  const handleApply = () => {
    const scheme: MarksScheme = {
      cm: Number(cm),
      im: Number(im),
      pm: Number(pm),
      max: Number(maxMarks),
    };

    const targetFn = onApply || onApplyScheme;
    if (targetFn) {
      targetFn(scheme, {
        type: scopeType,
        rangeStart: Number(rangeStart),
        rangeEnd: Number(rangeEnd),
        subjectId: targetSubjectId,
        sectionId: targetSectionId,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="marking-scheme-studio-modal"
        className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Marking Scheme Studio</h3>
              <p className="text-xs text-slate-400">
                Configure exam score weights per question, range, subject, or section
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* 1. Target Scope Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              1. Choose Application Scope
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScopeType('current')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  scopeType === 'current'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold">
                  <Hash className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Current Question</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {currentQuestionNumber ? `Q.${currentQuestionNumber}` : 'Active question only'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScopeType('all')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  scopeType === 'all'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Entire Paper</span>
                </div>
                <div className="text-[10px] text-slate-500">All questions in paper</div>
              </button>

              <button
                type="button"
                onClick={() => setScopeType('range')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  scopeType === 'range'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Question Range</span>
                </div>
                <div className="text-[10px] text-slate-500">From Q.X to Q.Y</div>
              </button>

              <button
                type="button"
                onClick={() => setScopeType('subject')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  scopeType === 'subject'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>By Subject</span>
                </div>
                <div className="text-[10px] text-slate-500">Specific subject group</div>
              </button>

              <button
                type="button"
                onClick={() => setScopeType('section')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  scopeType === 'section'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>By Section</span>
                </div>
                <div className="text-[10px] text-slate-500">Specific section only</div>
              </button>
            </div>

            {/* Sub-parameters for scope */}
            {scopeType === 'range' && (
              <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3 text-xs">
                <span className="text-slate-400 font-medium">Question Range:</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">From Q.</span>
                  <input
                    type="number"
                    min="1"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center"
                  />
                  <span className="text-slate-400">to Q.</span>
                  <input
                    type="number"
                    min="1"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center"
                  />
                </div>
              </div>
            )}

            {scopeType === 'subject' && (
              <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                <label className="text-slate-400 block mb-1 font-medium">Select Target Subject:</label>
                <select
                  value={targetSubjectId}
                  onChange={(e) => setTargetSubjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                >
                  {subjectList.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.sections?.reduce((acc: number, s: any) => acc + (s.questions?.length || 0), 0) || 0} questions)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scopeType === 'section' && (
              <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                <label className="text-slate-400 block mb-1 font-medium">Select Target Section:</label>
                <select
                  value={targetSectionId}
                  onChange={(e) => setTargetSectionId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                >
                  {subjectList.map((sub: any) =>
                    sub.sections?.map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        {sub.name} - {sec.name} ({sec.questions?.length || 0} questions)
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>

          {/* 2. Presets Quick Select */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              2. Competitive Exam Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MARKING_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span className={isSelected ? 'text-indigo-300' : 'text-slate-200'}>{preset.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {preset.marks.cm > 0 ? `+${preset.marks.cm}` : preset.marks.cm} / {preset.marks.im}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{preset.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Custom Value Inputs */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              3. Fine-Tune Marking Values
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
              <div>
                <label className="text-[11px] text-emerald-400 font-bold block mb-1">
                  Correct (+Marks)
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={cm}
                  onChange={(e) => {
                    setCm(parseFloat(e.target.value) || 0);
                    setSelectedPresetId('custom');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] text-rose-400 font-bold block mb-1">
                  Incorrect (-Marks)
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={im}
                  onChange={(e) => {
                    setIm(parseFloat(e.target.value) || 0);
                    setSelectedPresetId('custom');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] text-amber-400 font-bold block mb-1">
                  Partial (+Marks)
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={pm}
                  onChange={(e) => {
                    setPm(parseFloat(e.target.value) || 0);
                    setSelectedPresetId('custom');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] text-indigo-400 font-bold block mb-1">
                  Max Marks
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={maxMarks}
                  onChange={(e) => {
                    setMaxMarks(parseFloat(e.target.value) || 0);
                    setSelectedPresetId('custom');
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Will update <strong>{affectedCount}</strong> question{affectedCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Scheme</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
