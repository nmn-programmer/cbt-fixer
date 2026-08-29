import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Crop,
  ExternalLink,
  Eye,
  FileImage,
  FlipHorizontal,
  FlipVertical,
  HelpCircle,
  Image as ImageIcon,
  Key,
  Layers,
  Maximize2,
  Minimize2,
  MoveDown,
  MoveUp,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { QuestionData, QuestionType, SubjectData, SectionData } from '../types/cbt';
import { MARKING_PRESETS, parseImageFileName } from '../utils/constants';
import { QuestionHoverTrigger } from './QuestionHoverTrigger';
import { QuestionPageContextViewer } from './QuestionPageContextViewer';

export const QuestionEditor: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    selectedSubjectId,
    selectedSectionId,
    selectedQuestionId,
    selectNextQuestion,
    selectPrevQuestion,
    updateQuestion,
    reassignQuestionSection,
    moveQuestionAcrossArchives,
    applyMarkingPreset,
    addImagePart,
    replaceImagePart,
    deleteImagePart,
    reorderImageParts,
    unlinkSplitQuestion,
    diagnostics,
    fixStandardizeFilenames,
    fixMarkingSchemes,
    jumpToDiagnostic,
    setAnswerKeyModalOpen,
    openPdfRecrop,
    openBoundaryOverlay,
    openAiRepair,
    addToast,
  } = useCbtStore();

  const [activeTab, setActiveTab] = useState<'editor' | 'context' | 'json'>('editor');
  const [activePartIndex, setActivePartIndex] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'single' | 'stacked'>('single');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [invertDarkMode, setInvertDarkMode] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const fileAddRef = useRef<HTMLInputElement>(null);
  const fileReplaceRef = useRef<HTMLInputElement>(null);
  const replacingPartIndex = useRef<number>(1);

  const activeArchive = archives.find((a) => a.id === activeArchiveId);
  if (!activeArchive) return null;

  // Find active subject, section, and question
  let currentSubject: SubjectData | undefined;
  let currentSection: SectionData | undefined;
  let currentQuestion: QuestionData | undefined;

  for (const sub of activeArchive.subjects) {
    if (sub.id === selectedSubjectId || !selectedSubjectId) {
      for (const sec of sub.sections) {
        if (sec.id === selectedSectionId || !selectedSectionId) {
          const foundQ = sec.questions.find((q) => q.id === selectedQuestionId);
          if (foundQ) {
            currentSubject = sub;
            currentSection = sec;
            currentQuestion = foundQ;
            break;
          }
        }
      }
    }
    if (currentQuestion) break;
  }

  // Fallback if not found: select first question
  if (!currentQuestion && activeArchive.subjects[0]?.sections[0]?.questions[0]) {
    currentSubject = activeArchive.subjects[0];
    currentSection = activeArchive.subjects[0].sections[0];
    currentQuestion = activeArchive.subjects[0].sections[0].questions[0];
  }

  if (!currentQuestion || !currentSection || !currentSubject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-950">
        <FileImage className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-300">No Question Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Select a question from the sidebar tree or create a new question to start editing.
        </p>
      </div>
    );
  }

  // Active question issues
  const qIssues = diagnostics.filter((d) => d.location.questionId === currentQuestion?.id);
  const activeImage = currentQuestion.images.find((img) => img.partIndex === activePartIndex) || currentQuestion.images[0];

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentQuestion) {
      await addImagePart(currentQuestion.id, file);
      setActivePartIndex(currentQuestion.images.length + 1);
    }
    if (fileAddRef.current) fileAddRef.current.value = '';
  };

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentQuestion) {
      await replaceImagePart(currentQuestion.id, replacingPartIndex.current, file);
    }
    if (fileReplaceRef.current) fileReplaceRef.current.value = '';
  };

  const triggerReplace = (partIdx: number) => {
    replacingPartIndex.current = partIdx;
    fileReplaceRef.current?.click();
  };

  // Helper for MSQ Option Selection
  const toggleMsqOption = (optNumberOrLetter: string) => {
    if (!currentQuestion) return;
    const isNum = /^[1-4]$/.test(optNumberOrLetter);
    const letter = isNum ? String.fromCharCode(64 + parseInt(optNumberOrLetter, 10)) : optNumberOrLetter.toUpperCase();
    const num = isNum ? optNumberOrLetter : String(optNumberOrLetter.charCodeAt(0) - 64);

    const rawStr = currentQuestion.answerOptions || currentQuestion.correctAnswer || '';
    const currentList = rawStr
      .split(/[,\s;/]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const isCurrentlyPresent = currentList.includes(optNumberOrLetter.toUpperCase()) || 
                               currentList.includes(letter) || 
                               currentList.includes(num);

    let updatedList: string[];
    if (isCurrentlyPresent) {
      updatedList = currentList.filter(
        (item) => item !== optNumberOrLetter.toUpperCase() && item !== letter && item !== num
      );
    } else {
      updatedList = [...currentList, letter].sort();
    }
    const joined = updatedList.join(',');
    updateQuestion(
      currentQuestion.id,
      { answerOptions: joined, correctAnswer: joined },
      'Update MSQ Options'
    );
  };

  const isMcqOptionSelected = (opt: string) => {
    if (!currentQuestion) return false;
    const letter = String.fromCharCode(64 + parseInt(opt, 10)); // 1->A, 2->B, etc.
    const candidates = [
      currentQuestion.answerOptions,
      currentQuestion.correctAnswer,
    ].filter(Boolean) as string[];

    for (const raw of candidates) {
      const trimmed = raw.trim().toUpperCase();
      if (trimmed === opt || trimmed === letter) return true;
      if (trimmed === `OPTION ${opt}` || trimmed === `OPTION ${letter}`) return true;
      if (trimmed === `OPT ${opt}` || trimmed === `OPT ${letter}`) return true;
      if (trimmed === `${opt}.` || trimmed === `${letter}.`) return true;
      if (trimmed === `(${opt})` || trimmed === `(${letter})`) return true;
    }
    return false;
  };

  const isMsqOptionSelected = (opt: string) => {
    if (!currentQuestion) return false;
    const letter = String.fromCharCode(64 + parseInt(opt, 10));
    const rawStrings = [
      currentQuestion.answerOptions,
      currentQuestion.correctAnswer,
    ].filter(Boolean) as string[];

    const tokens: string[] = [];
    for (const s of rawStrings) {
      s.split(/[,\s;/]+/).forEach((t) => {
        const trimmed = t.trim().toUpperCase();
        if (trimmed) tokens.push(trimmed);
      });
    }

    return (
      tokens.includes(opt) ||
      tokens.includes(letter) ||
      tokens.includes(`OPTION ${opt}`) ||
      tokens.includes(`OPTION ${letter}`) ||
      tokens.includes(`${letter}.`) ||
      tokens.includes(`${opt}.`)
    );
  };

  // Helper for MSM (Matrix Match) toggle
  // Format: A->P,Q; B->R; C->P,S; D->T
  const parseMatrixOptions = (): Record<string, string[]> => {
    const map: Record<string, string[]> = { A: [], B: [], C: [], D: [] };
    if (!currentQuestion?.answerOptions) return map;

    const pairs = currentQuestion.answerOptions.split(';');
    for (const pair of pairs) {
      const [row, cols] = pair.split('->');
      if (row && cols) {
        const cleanRow = row.trim().toUpperCase();
        if (map[cleanRow]) {
          map[cleanRow] = cols.split(',').map((c) => c.trim().toUpperCase());
        }
      }
    }
    return map;
  };

  const toggleMatrixCell = (row: string, col: string) => {
    if (!currentQuestion) return;
    const currentMap = parseMatrixOptions();
    const rowCols = currentMap[row] || [];
    if (rowCols.includes(col)) {
      currentMap[row] = rowCols.filter((c) => c !== col);
    } else {
      currentMap[row] = [...rowCols, col].sort();
    }

    const serialized = Object.entries(currentMap)
      .filter(([_, cols]) => cols.length > 0)
      .map(([r, cols]) => `${r}->${cols.join(',')}`)
      .join('; ');

    updateQuestion(currentQuestion.id, { answerOptions: serialized }, 'Update Matrix Match');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Hidden File Inputs */}
      <input type="file" ref={fileAddRef} onChange={handleAddImage} accept="image/*" className="hidden" />
      <input type="file" ref={fileReplaceRef} onChange={handleReplaceImage} accept="image/*" className="hidden" />

      {/* Question Header & Navigation Bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 truncate">
          <QuestionHoverTrigger
            question={currentQuestion}
            subjectName={currentSubject.name}
            sectionName={currentSection.name}
            archiveId={activeArchiveId || undefined}
            className="cursor-pointer"
            showHoverHint
          >
            <div className="flex items-center gap-1.5 bg-slate-800 hover:bg-indigo-900/50 hover:border-indigo-500/50 transition-colors px-2.5 py-1 rounded-md border border-slate-700 font-mono font-bold text-sm text-indigo-300">
              <span>Q{currentQuestion.que}</span>
            </div>
          </QuestionHoverTrigger>

          <div className="flex flex-col truncate">
            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <span>{currentSubject.name}</span>
              <span>/</span>
              <span className="text-slate-200 font-medium">{currentSection.name}</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Key: "{currentQuestion.key}" • Type: {currentQuestion.type.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Action buttons & Prev/Next */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => openPdfRecrop({ questionId: currentQuestion!.id, partIndex: activePartIndex, mode: 'replace_part' })}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-md border border-indigo-500/40 transition-colors font-medium"
            title="Re-crop this question directly from original PDF"
          >
            <Crop className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Re-Crop from PDF</span>
          </button>

          <button
            onClick={() => openAiRepair(currentQuestion!.id)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-md border border-purple-500/40 transition-colors font-medium"
            title="Launch AI Doctor to diagnose & repair question defects"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">AI Doctor</span>
          </button>

          {(currentQuestion.images.length > 1 || currentQuestion.isSplitQuestion) && (
            <button
              onClick={() => unlinkSplitQuestion(currentQuestion!.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-md border border-amber-500/40 transition-colors font-medium"
              title="Split this multi-part question into two separate sequential questions"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Unlink Split Q</span>
            </button>
          )}

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={() =>
              updateQuestion(
                currentQuestion!.id,
                { isFlagged: !currentQuestion!.isFlagged },
                'Toggle Flag'
              )
            }
            className={`p-1.5 rounded-md border transition-colors ${
              currentQuestion.isFlagged
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Flag question for review"
          >
            <Bookmark className={`w-3.5 h-3.5 ${currentQuestion.isFlagged ? 'fill-amber-400' : ''}`} />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Prev / Next buttons */}
          <button
            id="prev-question-btn"
            onClick={selectPrevQuestion}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors text-slate-300"
            title="Previous Question"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <button
            id="next-question-btn"
            onClick={selectNextQuestion}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-md transition-colors text-white font-medium shadow-sm"
            title="Next Question"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex rounded-md bg-slate-800 p-0.5 border border-slate-700 ml-1">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                activeTab === 'editor' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`px-2 py-0.5 text-xs rounded flex items-center gap-1 transition-colors ${
                activeTab === 'context' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Full PDF page spatial context"
            >
              <Layers className="w-3 h-3" />
              <span>Context</span>
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-2 py-0.5 text-xs rounded flex items-center gap-1 transition-colors ${
                activeTab === 'json' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 scrollbar-thin">
        {/* Double-Scan Manual Image Review Flag Banner */}
        {(currentQuestion.hasExtractionWarning ||
          currentQuestion.doubleScanStatus === 'flagged' ||
          currentQuestion.isFlagged) && (
          <div className="rounded-lg bg-amber-950/40 border border-amber-800/80 p-3 flex items-center justify-between text-xs text-amber-200 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] uppercase font-mono mr-2 border border-amber-500/40">
                  Needs Manual Image Review
                </span>
                <span>
                  {currentQuestion.warningReason ||
                    'Double-scan audit detected possible option truncation or boundary constraint on this extracted question.'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() =>
                  openPdfRecrop({
                    questionId: currentQuestion!.id,
                    partIndex: activePartIndex,
                    mode: 'replace_part',
                  })
                }
                className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-semibold transition-colors flex items-center gap-1 shadow-sm"
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Adjust Bounds</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Question Diagnostic Alerts Banner */}
        {qIssues.length > 0 && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-800/80 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{qIssues.length} Diagnostic Issue(s) in this Question</span>
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {qIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-center justify-between bg-slate-900/60 p-2 rounded border border-rose-900/50 text-slate-200"
                >
                  <div>
                    <span className="font-semibold text-rose-300">{issue.title}: </span>
                    <span className="text-slate-300 text-[11px]">{issue.message}</span>
                  </div>
                  {issue.autoFixable && (
                    <button
                      onClick={() => {
                        if (issue.code === 'MALFORMED_FILENAME') fixStandardizeFilenames();
                        if (issue.code === 'MARKING_ANOMALY') fixMarkingSchemes();
                      }}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold rounded shrink-0 ml-2"
                    >
                      Auto Fix
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'context' ? (
          /* Full PDF Page Spatial Context Tab */
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-slate-200">
                  Full PDF Page Context • Question {currentQuestion.que}
                </span>
              </div>
              <span className="text-slate-400 text-[11px]">
                Showing question crop bounding box in original PDF vector page
              </span>
            </div>
            <QuestionPageContextViewer
              question={currentQuestion}
              partIndex={activePartIndex}
              rawFiles={activeArchive.rawFiles}
              onOpenOverlay={(pageNum) => {
                openBoundaryOverlay({
                  pageNumber: pageNum || (currentQuestion.pdfData?.[0]?.pageNumber ?? 1),
                  questionId: currentQuestion.id,
                  partIndex: activePartIndex,
                });
              }}
              onOpenRecrop={(pageNum) => {
                openPdfRecrop({
                  questionId: currentQuestion.id,
                  partIndex: activePartIndex,
                  pageNumber: pageNum || (currentQuestion.pdfData?.[0]?.pageNumber ?? 1),
                  mode: 'replace_part',
                });
              }}
            />
          </div>
        ) : activeTab === 'json' ? (
          /* JSON Raw Inspector Tab */
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
              <span>data.json representation for Q{currentQuestion.que}</span>
              <button
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(JSON.stringify(currentQuestion, null, 2));
                    addToast({
                      title: 'Copied JSON',
                      description: `Copied question Q${currentQuestion.que} JSON to clipboard!`,
                      type: 'success',
                    });
                  } catch {
                    addToast({
                      title: 'Copy Notice',
                      description: 'Clipboard write requires user permission.',
                      type: 'warning',
                    });
                  }
                }}
                className="flex items-center gap-1 text-[11px] hover:text-white"
              >
                <Copy className="w-3 h-3" />
                <span>Copy JSON</span>
              </button>
            </div>
            <pre className="overflow-x-auto p-2 bg-slate-950 rounded text-emerald-400 leading-relaxed">
              {JSON.stringify(
                {
                  que: currentQuestion.que,
                  type: currentQuestion.type,
                  marks: currentQuestion.marks,
                  pdfData: currentQuestion.pdfData.map((part) => ({
                    page: part.page ?? 1,
                    x1: part.x1 ?? 0,
                    x2: part.x2 ?? 100,
                    y1: part.y1 ?? 0,
                    y2: part.y2 ?? 100,
                  })),
                  ...(currentQuestion.answerOptions && currentQuestion.answerOptions.trim() !== ''
                    ? { answerOptions: currentQuestion.answerOptions.trim() }
                    : {}),
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : (
          /* Visual Question Workbench */
          <>
            {/* Row 1: Question Type & Number Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Question Type Cards */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Question Type</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'mcq', label: 'Single MCQ', desc: 'Single Choice' },
                    { id: 'msq', label: 'Multi MSQ', desc: 'One or More' },
                    { id: 'nat', label: 'NAT', desc: 'Numerical' },
                    { id: 'msm', label: 'MSM', desc: 'Matrix Match' },
                  ].map((t) => {
                    const isSelected = currentQuestion?.type === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          const defaultMarks =
                            t.id === 'msq'
                              ? { cm: 4, im: -2, pm: 1, max: 4 }
                              : t.id === 'msm'
                              ? { cm: 3, im: -1, pm: 1, max: 12 }
                              : { cm: 4, im: -1, pm: 0, max: 4 };

                          updateQuestion(
                            currentQuestion!.id,
                            { type: t.id as QuestionType, marks: defaultMarks },
                            `Change Type to ${t.label}`
                          );
                        }}
                        className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-bold text-xs">{t.label}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Display Question Number & Reassign Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Index & Section Assignment</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        Display Number (que)
                      </label>
                      <input
                        type="number"
                        value={currentQuestion.que}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            updateQuestion(currentQuestion!.id, { que: val }, 'Change Question Number');
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {archives.length > 1 ? (
                      <div>
                        <label className="block text-[11px] text-slate-400 font-medium mb-1">
                          Move to Opened Tab / Section
                        </label>
                        <select
                          value={`${activeArchive.id}:::${currentSection.id}`}
                          onChange={(e) => {
                            const [targetArchId, targetSecId] = e.target.value.split(':::');
                            if (!targetArchId || !targetSecId) return;
                            if (targetArchId === activeArchive.id && targetSecId === currentSection.id) return;

                            if (targetArchId === activeArchive.id) {
                              reassignQuestionSection(currentQuestion!.id, targetSecId);
                            } else {
                              moveQuestionAcrossArchives(currentQuestion!.id, targetArchId, targetSecId);
                            }
                          }}
                          className="w-full bg-slate-950 border border-indigo-500/50 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
                        >
                          {archives.map((arch) => (
                            <optgroup key={arch.id} label={`📦 ${arch.fileName} ${arch.id === activeArchive.id ? '(Current Tab)' : ''}`}>
                              {arch.subjects.map((sub) =>
                                sub.sections.map((sec) => (
                                  <option key={`${arch.id}:::${sec.id}`} value={`${arch.id}:::${sec.id}`}>
                                    {arch.id !== activeArchive.id ? `[${arch.fileName}] ` : ''}{sub.name} → {sec.name} ({sec.questions.length} Qs)
                                  </option>
                                ))
                              )}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-slate-400 font-medium mb-1">
                          Target Section
                        </label>
                        <select
                          value={currentSection.id}
                          onChange={(e) => {
                            const targetSecId = e.target.value;
                            if (targetSecId && targetSecId !== currentSection!.id) {
                              reassignQuestionSection(currentQuestion!.id, targetSecId);
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {activeArchive.subjects.map((sub) => (
                            <optgroup key={sub.id} label={`📁 ${sub.name}`}>
                              {sub.sections.map((sec) => (
                                <option key={sec.id} value={sec.id}>
                                  {sec.name} ({sec.questions.length} Q{sec.questions.length === 1 ? '' : 's'})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Granular Marking Scheme & Quick Presets */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Granular Marking Scheme</span>
                </div>

                {/* Marking Presets Bar */}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-[10px]">
                  <span className="text-slate-500 font-semibold hidden md:inline">Presets:</span>
                  {MARKING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyMarkingPreset(currentQuestion!.id, preset.id)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 whitespace-nowrap transition-colors"
                      title={preset.description}
                    >
                      {preset.name.split(' ')[0]} {preset.marks.cm}/{preset.marks.im}
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Marks Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <label className="block text-[11px] text-emerald-400 font-semibold mb-1">
                    + Correct (cm)
                  </label>
                  <input
                    type="number"
                    value={currentQuestion.marks.cm}
                    onChange={(e) =>
                      updateQuestion(
                        currentQuestion!.id,
                        { marks: { ...currentQuestion!.marks, cm: parseFloat(e.target.value) || 0 } },
                        'Update Correct Marks'
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <label className="block text-[11px] text-rose-400 font-semibold mb-1">
                    - Incorrect (im)
                  </label>
                  <input
                    type="number"
                    value={currentQuestion.marks.im}
                    onChange={(e) =>
                      updateQuestion(
                        currentQuestion!.id,
                        { marks: { ...currentQuestion!.marks, im: parseFloat(e.target.value) || 0 } },
                        'Update Incorrect Marks'
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <label className="block text-[11px] text-purple-400 font-semibold mb-1">
                    Partial per Opt (pm)
                  </label>
                  <input
                    type="number"
                    value={currentQuestion.marks.pm ?? 0}
                    onChange={(e) =>
                      updateQuestion(
                        currentQuestion!.id,
                        { marks: { ...currentQuestion!.marks, pm: parseFloat(e.target.value) || 0 } },
                        'Update Partial Marks'
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <label className="block text-[11px] text-blue-400 font-semibold mb-1">
                    Max Marks (max)
                  </label>
                  <input
                    type="number"
                    value={currentQuestion.marks.max ?? 4}
                    onChange={(e) =>
                      updateQuestion(
                        currentQuestion!.id,
                        { marks: { ...currentQuestion!.marks, max: parseFloat(e.target.value) || 4 } },
                        'Update Max Marks'
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Answer Key & Option Responses */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Answer Key & Response Target</span>
                  </div>
                  {(!currentQuestion.answerOptions || currentQuestion.answerOptions.trim().length === 0) ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                      Unkeyed (No Answer Set)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                      Keyed
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {currentQuestion.answerOptions && currentQuestion.answerOptions.trim().length > 0 && (
                    <button
                      onClick={() =>
                        updateQuestion(currentQuestion!.id, { answerOptions: '' }, 'Clear Question Answer')
                      }
                      className="px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded border border-rose-800/60 transition-colors"
                      title="Reset answer to empty (unanswered/unkeyed)"
                    >
                      Clear Answer
                    </button>
                  )}
                  <button
                    onClick={() => setAnswerKeyModalOpen(true)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/80 rounded border border-indigo-800 transition-colors flex items-center gap-1"
                  >
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>Answer Key Studio</span>
                  </button>
                </div>
              </div>

              {/* Interactive MCQ Option Selector */}
              {currentQuestion.type === 'mcq' && (
                <div className="flex flex-wrap items-center gap-3">
                  {['1', '2', '3', '4'].map((opt) => {
                    const letter = String.fromCharCode(64 + parseInt(opt, 10)); // 1->A, 2->B, etc.
                    const isSelected = isMcqOptionSelected(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() =>
                          updateQuestion(
                            currentQuestion!.id,
                            {
                              answerOptions: isSelected ? '' : opt,
                              correctAnswer: isSelected ? '' : letter,
                            },
                            `Toggle Answer ${letter}`
                          )
                        }
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-xs transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-md scale-105'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSelected ? 'bg-white text-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {letter}
                        </span>
                        <span>Option {opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Interactive MSQ Option Selector (Multi-select) */}
              {currentQuestion.type === 'msq' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {['1', '2', '3', '4'].map((opt) => {
                      const letter = String.fromCharCode(64 + parseInt(opt, 10));
                      const isSelected = isMsqOptionSelected(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggleMsqOption(opt)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-xs transition-all ${
                            isSelected
                              ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                              isSelected ? 'bg-purple-800 text-white' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isSelected ? '✓' : letter}
                          </span>
                          <span>Option {letter} ({opt})</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Selected Correct Options:{' '}
                    <span className="font-mono font-bold text-purple-300">
                      {currentQuestion.answerOptions || currentQuestion.correctAnswer || 'None selected (Unkeyed)'}
                    </span>
                  </div>
                </div>
              )}

              {/* Interactive NAT Numerical Input */}
              {currentQuestion.type === 'nat' && (
                <div className="space-y-2 max-w-md">
                  <label className="block text-[11px] text-slate-400">
                    Numerical Value / Decimal Answer (e.g. 25, 4.50, -12.25)
                  </label>
                  <input
                    type="text"
                    value={currentQuestion.answerOptions}
                    onChange={(e) =>
                      updateQuestion(
                        currentQuestion!.id,
                        { answerOptions: e.target.value.trim() },
                        'Update Numerical Answer'
                      )
                    }
                    placeholder="Enter numerical target..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Interactive MSM Matrix Matching Grid */}
              {currentQuestion.type === 'msm' && (
                <div className="space-y-2 overflow-x-auto">
                  <div className="text-[11px] text-slate-400">
                    Matrix Matching (Click cells to connect Column 1 Rows [A..D] to Column 2 [P..S]):
                  </div>
                  <table className="border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-slate-500 font-mono">Row \ Col</th>
                        {['P', 'Q', 'R', 'S'].map((col) => (
                          <th key={col} className="p-2 text-slate-300 font-mono text-center font-bold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['A', 'B', 'C', 'D'].map((row) => {
                        const matrixMap = parseMatrixOptions();
                        const selectedCols = matrixMap[row] || [];
                        return (
                          <tr key={row} className="border-t border-slate-800">
                            <td className="p-2 font-bold font-mono text-indigo-300">{row}</td>
                            {['P', 'Q', 'R', 'S'].map((col) => {
                              const isChecked = selectedCols.includes(col);
                              return (
                                <td key={col} className="p-1.5 text-center">
                                  <button
                                    onClick={() => toggleMatrixCell(row, col)}
                                    className={`w-8 h-8 rounded font-mono text-xs font-bold transition-all ${
                                      isChecked
                                        ? 'bg-amber-500 text-slate-950 font-black scale-105 shadow-sm'
                                        : 'bg-slate-950 border border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                                    }`}
                                  >
                                    {isChecked ? `${row}→${col}` : '·'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Matrix Formula: <span className="font-mono text-amber-300">{currentQuestion.answerOptions || 'Empty'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Multi-Part Image Manager & Visual Inspector */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Question Image Slices ({currentQuestion.images.length} Part{currentQuestion.images.length === 1 ? '' : 's'})</span>
                  </div>

                  {/* Single vs Stacked Continuous View Toggle */}
                  {currentQuestion.images.length > 1 && (
                    <div className="flex items-center bg-slate-950 p-0.5 rounded-md border border-slate-800 text-[10px]">
                      <button
                        onClick={() => setViewMode('single')}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                          viewMode === 'single'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Single Part
                      </button>
                      <button
                        onClick={() => setViewMode('stacked')}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                          viewMode === 'stacked'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Display all slices continuously stacked vertically (Passage + Question)"
                      >
                        Stacked View
                      </button>
                    </div>
                  )}
                </div>

                {/* Image Part Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      openPdfRecrop({
                        questionId: currentQuestion!.id,
                        partIndex: activePartIndex,
                        mode: 'replace_part'
                      })
                    }
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-md border border-indigo-500/40 transition-colors font-medium"
                    title="Open PDF Visual Cropper to re-crop slice"
                  >
                    <Crop className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Re-Crop from PDF</span>
                  </button>

                  <button
                    onClick={() =>
                      openPdfRecrop({
                        questionId: currentQuestion!.id,
                        mode: 'add_part'
                      })
                    }
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
                    title="Crop a new slice from PDF and append as Part 2+"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Crop New Part</span>
                  </button>

                  {currentQuestion.images.length > 1 && (
                    <button
                      onClick={() => unlinkSplitQuestion(currentQuestion!.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-md border border-amber-500/40 transition-colors"
                      title="Unlink and split these parts into separate sequential questions"
                    >
                      <Scissors className="w-3.5 h-3.5 text-amber-400" />
                      <span>Unlink Parts</span>
                    </button>
                  )}

                  <button
                    onClick={() => fileAddRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
                    title="Upload image from computer file"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Upload Image</span>
                  </button>
                </div>
              </div>

              {/* Part Tabs Strip & Ordering Controls */}
              {currentQuestion.images.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {currentQuestion.images.map((img, idx) => {
                    const isPartActive = img.partIndex === activePartIndex && viewMode === 'single';
                    const parsedName = parseImageFileName(img.fileName);

                    return (
                      <div
                        key={img.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          isPartActive
                            ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                        onClick={() => {
                          setActivePartIndex(img.partIndex);
                          setViewMode('single');
                        }}
                      >
                        <span>Part {img.partIndex}</span>

                        {!parsedName.isValid && (
                          <AlertTriangle className="w-3 h-3 text-rose-400" title="Malformed filename syntax" />
                        )}

                        {/* Part Actions */}
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPdfRecrop({
                                questionId: currentQuestion!.id,
                                partIndex: img.partIndex,
                                mode: 'replace_part'
                              });
                            }}
                            className="p-0.5 hover:text-indigo-300 rounded"
                            title="Re-Crop this Part from PDF"
                          >
                            <Crop className="w-2.5 h-2.5" />
                          </button>
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reorderImageParts(currentQuestion!.id, idx, idx - 1);
                              }}
                              className="p-0.5 hover:text-white rounded"
                              title="Move Part Up"
                            >
                              <MoveUp className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {idx < currentQuestion!.images.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reorderImageParts(currentQuestion!.id, idx, idx + 1);
                              }}
                              className="p-0.5 hover:text-white rounded"
                              title="Move Part Down"
                            >
                              <MoveDown className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerReplace(img.partIndex);
                            }}
                            className="p-0.5 hover:text-cyan-300 rounded"
                            title="Replace with Local File"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                          </button>
                          {currentQuestion!.images.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteImagePart(currentQuestion!.id, img.partIndex);
                                setActivePartIndex(1);
                              }}
                              className="p-0.5 hover:text-rose-400 rounded"
                              title="Delete Part"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Image Previewer & Transformation Toolbar */}
              {currentQuestion.images.length > 0 ? (
                <div className="space-y-2">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                      {viewMode === 'stacked' ? (
                        <span className="font-medium text-indigo-300">
                          Stacked Multi-Part View ({currentQuestion.images.length} slices)
                        </span>
                      ) : (
                        <>
                          <span className="font-mono font-medium text-slate-300 truncate max-w-[200px] sm:max-w-xs" title={activeImage?.fileName}>
                            {activeImage?.fileName}
                          </span>
                          {activeImage?.sizeBytes && (
                            <span>({Math.round(activeImage.sizeBytes / 1024)} KB)</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Inspection Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
                        {zoomLevel}%
                      </span>
                      <button
                        onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>

                      <div className="h-3 w-px bg-slate-800 mx-1" />

                      {viewMode === 'single' && (
                        <>
                          <button
                            onClick={() => setRotation((r) => (r + 90) % 360)}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                            title="Rotate 90° Clockwise"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setFlipH((f) => !f)}
                            className={`p-1 rounded transition-colors ${
                              flipH ? 'bg-indigo-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                            }`}
                            title="Flip Horizontal"
                          >
                            <FlipHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setFlipV((f) => !f)}
                            className={`p-1 rounded transition-colors ${
                              flipV ? 'bg-indigo-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                            }`}
                            title="Flip Vertical"
                          >
                            <FlipVertical className="w-3.5 h-3.5" />
                          </button>

                          <div className="h-3 w-px bg-slate-800 mx-1" />
                        </>
                      )}

                      {/* CBT Dark Theme Simulator Toggle */}
                      <button
                        onClick={() => setInvertDarkMode((inv) => !inv)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          invertDarkMode
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                        }`}
                        title="Simulate CBT Exam Dark Mode Inversion"
                      >
                        <Eye className="w-3 h-3" />
                        <span>CBT Dark View</span>
                      </button>
                    </div>
                  </div>

                  {/* Image Display Canvas Container with Drag and Drop Support */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingOver(true);
                    }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDraggingOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && currentQuestion) {
                        if (activeImage) {
                          await replaceImagePart(currentQuestion.id, activeImage.partIndex, file);
                        } else {
                          await addImagePart(currentQuestion.id, file);
                        }
                      }
                    }}
                    className={`relative min-h-[240px] max-h-[560px] rounded-lg border transition-colors overflow-auto p-4 ${
                      invertDarkMode
                        ? 'bg-slate-950/90 border-slate-800'
                        : 'bg-slate-100/90 border-slate-300/60'
                    } ${
                      isDraggingOver
                        ? 'border-indigo-500 bg-indigo-950/20'
                        : ''
                    }`}
                  >
                    {isDraggingOver && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-indigo-950/80 backdrop-blur-xs rounded-lg text-indigo-300 text-sm font-semibold">
                        Drop image to replace current slice
                      </div>
                    )}

                    {viewMode === 'stacked' ? (
                      <div className="space-y-4 flex flex-col items-center">
                        {currentQuestion.images.map((img) => {
                          const resolvedBlobUrl = img.blobUrl?.trim() || activeArchive.rawFiles.get(img.fileName)?.url || '';
                          return (
                            <div
                              key={img.id}
                              className="w-full max-w-2xl bg-slate-900/60 rounded-lg p-2 border border-slate-800/80 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                                <span className="font-semibold text-indigo-400">
                                  Part {img.partIndex} of {currentQuestion!.images.length}
                                </span>
                                <span className="font-mono text-slate-500 text-[10px]">
                                  {img.fileName}
                                </span>
                              </div>
                              <div
                                className={`flex justify-center p-3 rounded-lg transition-colors ${
                                  invertDarkMode
                                    ? 'bg-slate-950 border border-slate-800'
                                    : 'bg-white border border-slate-200 shadow-sm'
                                }`}
                              >
                                {resolvedBlobUrl && resolvedBlobUrl.trim() !== '' ? (
                                  <img
                                    src={resolvedBlobUrl}
                                    alt={img.fileName}
                                    referrerPolicy="no-referrer"
                                    style={{
                                      transform: `scale(${zoomLevel / 100})`,
                                      filter: invertDarkMode ? 'invert(0.9) hue-rotate(180deg)' : 'none',
                                      transition: 'transform 0.15s ease-out, filter 0.15s ease-out',
                                    }}
                                    className="max-w-full h-auto rounded select-none"
                                  />
                                ) : (
                                  <div className="py-6 text-center text-xs text-amber-400 flex flex-col items-center gap-1.5">
                                    <AlertTriangle className="w-5 h-5 text-amber-400/80" />
                                    <span>Image binary data not loaded for {img.fileName}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center min-h-[220px]">
                        {(() => {
                          if (!activeImage) return null;
                          const resolvedBlobUrl = activeImage.blobUrl?.trim() || activeArchive.rawFiles.get(activeImage.fileName)?.url || '';
                          if (!resolvedBlobUrl) {
                            return (
                              <div className="p-6 text-center text-xs text-amber-400 flex flex-col items-center gap-1.5 bg-slate-950/60 rounded-lg border border-slate-800">
                                <AlertTriangle className="w-5 h-5 text-amber-400/80" />
                                <span>Image binary data not loaded for {activeImage.fileName}</span>
                              </div>
                            );
                          }
                          return (
                            <div
                              className={`p-3 sm:p-4 rounded-lg transition-colors flex items-center justify-center max-w-full ${
                                invertDarkMode
                                  ? 'bg-slate-950 border border-slate-800'
                                  : 'bg-white border border-slate-200 shadow-sm'
                              }`}
                            >
                              <img
                                src={resolvedBlobUrl}
                                alt={activeImage.fileName}
                                referrerPolicy="no-referrer"
                                style={{
                                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg) scaleX(${
                                    flipH ? -1 : 1
                                  }) scaleY(${flipV ? -1 : 1})`,
                                  filter: invertDarkMode ? 'invert(0.9) hue-rotate(180deg)' : 'none',
                                  transition: 'transform 0.15s ease-out, filter 0.15s ease-out',
                                }}
                                className="max-w-full h-auto rounded select-none pointer-events-none"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileAddRef.current?.click()}
                  className="border-2 border-dashed border-slate-800 hover:border-indigo-500/60 rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                >
                  <Upload className="w-8 h-8 text-slate-600 mb-2" />
                  <div className="text-xs font-semibold text-slate-300">
                    No image attached for this question
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Click or drop question image slice (PNG, JPG, WebP)
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
