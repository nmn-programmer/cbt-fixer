import React from 'react';
import { QuestionType } from '../../types/cbt';
import { Check, Hash, ListChecks, HelpCircle, X } from 'lucide-react';

interface AnswerKeyInputBarProps {
  questionType: QuestionType;
  answerValue: string;
  onChangeAnswer: (val: string) => void;
  onChangeType: (type: QuestionType) => void;
}

export const AnswerKeyInputBar: React.FC<AnswerKeyInputBarProps> = ({
  questionType,
  answerValue,
  onChangeAnswer,
  onChangeType,
}) => {
  // Helpers for MCQ / MSQ option parsing
  const selectedOptions = (answerValue || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const toggleMsqOption = (opt: string) => {
    let updated: string[];
    if (selectedOptions.includes(opt)) {
      updated = selectedOptions.filter((o) => o !== opt);
    } else {
      updated = [...selectedOptions, opt].sort();
    }
    onChangeAnswer(updated.join(','));
  };

  const selectMcqOption = (opt: string) => {
    onChangeAnswer(opt);
  };

  return (
    <div className="space-y-2.5 pt-2 border-t border-slate-800">
      {/* Type & Answer Header */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5 text-indigo-400" />
          <span>Question Type & Answer Key</span>
        </label>
        {answerValue && (
          <button
            type="button"
            onClick={() => onChangeAnswer('')}
            className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-0.5 transition-colors"
            title="Clear Answer"
          >
            <X className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Question Type Quick Segmented Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
        <button
          type="button"
          onClick={() => onChangeType('mcq')}
          className={`py-1 rounded-lg text-center transition-all ${
            questionType === 'mcq'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Single Correct Choice (MCQ)"
        >
          MCQ
        </button>
        <button
          type="button"
          onClick={() => onChangeType('msq')}
          className={`py-1 rounded-lg text-center transition-all ${
            questionType === 'msq'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Multiple Correct Choice (MSQ)"
        >
          MSQ
        </button>
        <button
          type="button"
          onClick={() => onChangeType('nat')}
          className={`py-1 rounded-lg text-center transition-all ${
            questionType === 'nat'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Numerical Answer Type (NAT)"
        >
          NAT
        </button>
        <button
          type="button"
          onClick={() => onChangeType('msm')}
          className={`py-1 rounded-lg text-center transition-all ${
            questionType === 'msm'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Matrix Match (MSM)"
        >
          Matrix
        </button>
      </div>

      {/* Dynamic Answer Key Selector based on Question Type */}
      {questionType === 'mcq' && (
        <div>
          <div className="text-[10px] text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Select Correct Option:</span>
            <span className="font-mono text-indigo-300 font-bold">
              {answerValue ? `Answer: Option ${answerValue}` : 'None selected'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {['A', 'B', 'C', 'D'].map((opt, idx) => {
              const isSelected =
                answerValue === opt ||
                answerValue === String(idx + 1) ||
                answerValue.toLowerCase() === opt.toLowerCase();
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => selectMcqOption(opt)}
                  className={`py-2 rounded-xl font-bold text-xs border transition-all flex flex-col items-center justify-center ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-sm font-mono">{opt}</span>
                  <span className="text-[9px] opacity-60">Opt {idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {questionType === 'msq' && (
        <div>
          <div className="text-[10px] text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Select One or More Correct Options:</span>
            <span className="font-mono text-purple-300 font-bold">
              {answerValue ? `Answers: [ ${answerValue} ]` : 'None selected'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {['A', 'B', 'C', 'D'].map((opt) => {
              const isSelected = selectedOptions.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleMsqOption(opt)}
                  className={`py-2 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1 ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 ring-2 ring-purple-400/50'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-sm font-mono">{opt}</span>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {questionType === 'nat' && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Enter Numerical / Decimal Value:</span>
            <span className="font-mono text-cyan-300 font-bold">
              {answerValue ? `Value: ${answerValue}` : 'No value'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={answerValue}
              onChange={(e) => onChangeAnswer(e.target.value)}
              placeholder="e.g. 42 or 3.14"
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm font-bold focus:border-indigo-500 focus:outline-none"
            />
            {/* Quick digit presets */}
            <div className="flex items-center gap-1">
              {['0', '1', '2', '4'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChangeAnswer(d)}
                  className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-xs font-mono"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {questionType === 'msm' && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Matrix Match Syntax (Row -&gt; Col):</span>
            <span className="font-mono text-amber-300 font-bold">{answerValue || 'Not set'}</span>
          </div>
          <input
            type="text"
            value={answerValue}
            onChange={(e) => onChangeAnswer(e.target.value)}
            placeholder="e.g. A->P,Q; B->R; C->S; D->P"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};
