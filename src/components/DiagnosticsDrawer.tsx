import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Filter,
  Layers,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { DiagnosticIssue, DiagnosticSeverity, QuestionData } from '../types/cbt';
import { QuestionHoverTrigger } from './QuestionHoverTrigger';

export const DiagnosticsDrawer: React.FC = () => {
  const {
    diagnostics,
    isDiagnosticsOpen,
    setDiagnosticsOpen,
    jumpToDiagnostic,
    fixRenumberSection,
    fixPruneOrphaned,
    fixStandardizeFilenames,
    fixMarkingSchemes,
    fixAnswerTypeMismatches,
    fixInstructedMarkings,
    fixModernizeFormat,
    archives,
    activeArchiveId,
  } = useCbtStore();

  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning'>('all');

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  const questionMap = useMemo(() => {
    const map = new Map<string, QuestionData>();
    if (!activeArchive) return map;
    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          map.set(q.id, q);
        });
      });
    });
    return map;
  }, [activeArchive]);

  if (!isDiagnosticsOpen) return null;

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const filteredList =
    filterSeverity === 'all'
      ? diagnostics
      : diagnostics.filter((d) => d.severity === filterSeverity);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setDiagnosticsOpen(false)}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg md:max-w-xl h-full bg-slate-900 border-l border-slate-800 text-slate-100 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Diagnostic & Flaw Detector</h2>
              <p className="text-[11px] text-slate-400">
                Precision schema validation and automated one-click repair
              </p>
            </div>
          </div>

          <button
            onClick={() => setDiagnosticsOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Metrics Overview */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Flaws</div>
              <div className="text-xl font-black text-white mt-0.5">{diagnostics.length}</div>
            </div>
            <div className="bg-rose-950/30 p-2.5 rounded-lg border border-rose-900/40">
              <div className="text-[10px] uppercase font-bold text-rose-400">Errors</div>
              <div className="text-xl font-black text-rose-300 mt-0.5">{errors.length}</div>
            </div>
            <div className="bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/40">
              <div className="text-[10px] uppercase font-bold text-amber-400">Warnings</div>
              <div className="text-xl font-black text-amber-300 mt-0.5">{warnings.length}</div>
            </div>
          </div>

          {/* 1-Click Automated Repair Toolbar */}
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>1-Click Auto-Fixers</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => fixRenumberSection()}
                className="flex items-center gap-1.5 p-2 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 font-medium transition-colors text-left"
                title="Renumber all questions in all sections sequentially (1..N)"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Fix Numbering Gaps</span>
              </button>

              <button
                onClick={() => fixPruneOrphaned()}
                className="flex items-center gap-1.5 p-2 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 font-medium transition-colors text-left"
                title="Remove unindexed / unreferenced image binaries from ZIP"
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate">Prune Orphaned Files</span>
              </button>

              <button
                onClick={() => fixStandardizeFilenames()}
                className="flex items-center gap-1.5 p-2 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 font-medium transition-colors text-left"
                title="Standardize all image filenames to Section__--__QNo__--__Part.ext"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">Standardize Syntax</span>
              </button>

              <button
                onClick={() => fixMarkingSchemes()}
                className="flex items-center gap-1.5 p-2 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 font-medium transition-colors text-left"
                title="Fix MSQ/NAT marking schemes to JEE Advanced standard (+4, -2, pm: 1)"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Fix Marking Schemes</span>
              </button>
            </div>
          </div>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-400">Filter:</span>
          {(['all', 'error', 'warning'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                filterSeverity === sev
                  ? 'bg-slate-800 text-white font-semibold shadow-inner'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev === 'all'
                ? `All (${diagnostics.length})`
                : sev === 'error'
                ? `Errors (${errors.length})`
                : `Warnings (${warnings.length})`}
            </button>
          ))}
        </div>

        {/* Issues List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {filteredList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3 animate-bounce" />
              <h4 className="font-bold text-slate-200 text-base">All Clean & Validated!</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                No schema flaws, missing images, or syntax anomalies found in the active workspace.
              </p>
            </div>
          ) : (
            filteredList.map((issue) => {
              const loc = issue.location;
              const isError = issue.severity === 'error';

              return (
                <div
                  key={issue.id}
                  className={`rounded-lg border p-3.5 transition-all text-xs space-y-2 ${
                    isError
                      ? 'bg-rose-950/20 border-rose-900/60 hover:border-rose-700/80'
                      : 'bg-amber-950/20 border-amber-900/60 hover:border-amber-700/80'
                  }`}
                >
                  {/* Issue Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {isError ? (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div
                          className={`font-bold ${
                            isError ? 'text-rose-300' : 'text-amber-300'
                          }`}
                        >
                          {issue.title}
                        </div>
                        <div className="text-slate-300 mt-0.5 leading-relaxed">{issue.message}</div>
                      </div>
                    </div>
                  </div>

                  {/* Hierarchical Location Breadcrumb */}
                  <div className="bg-slate-950/80 rounded px-2.5 py-1.5 border border-slate-800/80 text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-1.5">
                    {loc.archiveName && (
                      <span className="text-indigo-300 font-semibold truncate max-w-[150px]">
                        [Archive: {loc.archiveName}]
                      </span>
                    )}
                    {loc.subjectName && (
                      <>
                        <span>→</span>
                        <span className="text-slate-200">[Subject: {loc.subjectName}]</span>
                      </>
                    )}
                    {loc.sectionName && (
                      <>
                        <span>→</span>
                        <span className="text-slate-200">[Section: {loc.sectionName}]</span>
                      </>
                    )}
                    {loc.questionNumber !== undefined && (
                      <>
                        <span>→</span>
                        {loc.questionId && questionMap.get(loc.questionId) ? (
                          <QuestionHoverTrigger
                            question={questionMap.get(loc.questionId)!}
                            subjectName={loc.subjectName}
                            sectionName={loc.sectionName}
                            archiveId={activeArchiveId || undefined}
                            inline
                          >
                            <span className="text-amber-300 font-bold hover:underline cursor-pointer">
                              [Q{loc.questionNumber}
                              {loc.partIndex ? ` (Part ${loc.partIndex})` : ''}]
                            </span>
                          </QuestionHoverTrigger>
                        ) : (
                          <span className="text-amber-300 font-bold">
                            [Q{loc.questionNumber}
                            {loc.partIndex ? ` (Part ${loc.partIndex})` : ''}]
                          </span>
                        )}
                      </>
                    )}
                    {loc.actualFileName && !loc.questionNumber && (
                      <>
                        <span>→</span>
                        <span className="text-rose-300 font-bold truncate max-w-xs">
                          [File: {loc.actualFileName}]
                        </span>
                      </>
                    )}
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between pt-1">
                    {loc.questionId ? (
                      <button
                        onClick={() => jumpToDiagnostic(issue)}
                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        <span>Focus in Question Editor</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <div />
                    )}

                    {issue.autoFixable && (
                      <button
                        onClick={() => {
                          if (issue.code === 'ORPHANED_IMAGE') fixPruneOrphaned();
                          else if (issue.code === 'MALFORMED_FILENAME') fixStandardizeFilenames();
                          else if (issue.code === 'NON_SEQUENTIAL_NUMBERING' || issue.code === 'DUPLICATE_QUESTION_INDEX')
                            fixRenumberSection(loc.sectionId);
                          else if (issue.code === 'MARKING_ANOMALY') fixMarkingSchemes();
                          else if (issue.code === 'ANSWER_TYPE_MISMATCH') fixAnswerTypeMismatches();
                          else if (issue.code === 'INSTRUCTED_MARKING_MISMATCH') fixInstructedMarkings();
                          else if (issue.code === 'LEGACY_FORMAT_DETECTED') fixModernizeFormat();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded font-semibold text-[11px] border border-slate-700 transition-colors"
                      >
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>{issue.autoFixAction || 'Auto Repair'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
