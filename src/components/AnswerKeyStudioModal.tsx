import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileCode,
  FilePlus2,
  Files,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  HelpCircle,
  Key,
  Layers,
  ListFilter,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Wand2,
  X,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { fetchWithGeminiFallback } from '../utils/geminiKeyManager';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';
import {
  AnswerKeyParseResult,
  ClassificationReport,
  classifyAndMatchAnswerKey,
  generateAnswerKeyCsv,
  generateOfficialAnswerKeyJson,
  letterToOptionIndex,
  LoadedAnswerKeyFile,
  mergeMultipleAnswerKeys,
  NormalizedAnswerItem,
  optionIndexToLetter,
  optionIndicesToLetters,
  parseAnswerKeyPayload,
  QuestionMatchResult,
} from '../utils/answerKeyManager';
import { generateId } from '../utils/constants';
import { QuestionData, QuestionType } from '../types/cbt';
import { QuestionHoverTrigger } from './QuestionHoverTrigger';

export const AnswerKeyStudioModal: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    isAnswerKeyModalOpen,
    setAnswerKeyModalOpen,
    applyAnswerKeyClassification,
    clearAllAnswersInActiveArchive,
    updateQuestion,
    addToast,
    refreshUsageMetrics,
    startBackgroundTask,
    updateBackgroundTask,
    minimizeBackgroundTask,
    completeBackgroundTask,
    enableDoublePassRescan,
    setEnableDoublePassRescan,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  const [activeTab, setActiveTab] = useState<'upload' | 'matcher' | 'matrix' | 'export'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<LoadedAnswerKeyFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | 'merged' | 'manual'>('merged');
  const [manualInputText, setManualInputText] = useState<string>('');
  const [editorText, setEditorText] = useState<string>('');
  const [matcherFilter, setMatcherFilter] = useState<'all' | 'changed' | 'unmatched'>('all');
  const [matrixSubjectFilter, setMatrixSubjectFilter] = useState<string>('all');
  const [matrixOnlyMissing, setMatrixOnlyMissing] = useState<boolean>(false);
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'official_json' | 'csv' | 'markdown'>('official_json');
  const [copied, setCopied] = useState<boolean>(false);
  const [updateMarksOnApply, setUpdateMarksOnApply] = useState<boolean>(true);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isExtractingAiKey, setIsExtractingAiKey] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiKeyFileInputRef = useRef<HTMLInputElement>(null);

  // Compute merged result from all active uploaded files and manual text if present
  const { mergedParseResult, mergedJsonText } = useMemo(() => {
    // If no uploaded files, check manual input
    if (uploadedFiles.length === 0) {
      if (manualInputText.trim()) {
        const res = parseAnswerKeyPayload(manualInputText);
        return {
          mergedParseResult: res,
          mergedJsonText: manualInputText,
        };
      }
      return {
        mergedParseResult: null,
        mergedJsonText: '',
      };
    }

    // Merge all active files
    const { parseResult, mergedJson } = mergeMultipleAnswerKeys(uploadedFiles);

    // If manual text exists and not empty, merge it in as well
    if (manualInputText.trim()) {
      const manualRes = parseAnswerKeyPayload(manualInputText);
      if (manualRes.isValid) {
        const manualFile: LoadedAnswerKeyFile = {
          id: 'manual-entry',
          name: 'Manual_Paste_Scratchpad.json',
          size: manualInputText.length,
          content: manualInputText,
          parseResult: manualRes,
          enabled: true,
          uploadedAt: Date.now(),
        };
        const combined = mergeMultipleAnswerKeys([...uploadedFiles, manualFile]);
        return {
          mergedParseResult: combined.parseResult,
          mergedJsonText: combined.mergedJson,
        };
      }
    }

    return {
      mergedParseResult: parseResult,
      mergedJsonText: mergedJson,
    };
  }, [uploadedFiles, manualInputText]);

  // Compute classification & match report against active paper
  const classificationReport = useMemo<ClassificationReport | null>(() => {
    if (!activeArchive || !mergedParseResult || !mergedParseResult.isValid) {
      return null;
    }
    return classifyAndMatchAnswerKey(activeArchive, mergedParseResult);
  }, [activeArchive, mergedParseResult]);

  // Fast Question lookup map by ID
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

  // Sync editor text based on selectedFileId
  useEffect(() => {
    if (selectedFileId === 'merged') {
      setEditorText(mergedJsonText || '');
    } else if (selectedFileId === 'manual') {
      setEditorText(manualInputText);
    } else {
      const found = uploadedFiles.find((f) => f.id === selectedFileId);
      if (found) {
        setEditorText(found.content);
      } else {
        setSelectedFileId('merged');
        setEditorText(mergedJsonText || '');
      }
    }
  }, [selectedFileId, mergedJsonText, uploadedFiles, manualInputText]);

  // Export string generator
  const exportString = useMemo(() => {
    if (!activeArchive) return '';
    if (exportFormat === 'official_json') {
      return generateOfficialAnswerKeyJson(activeArchive);
    } else if (exportFormat === 'csv') {
      return generateAnswerKeyCsv(activeArchive);
    } else {
      let md = '| Q# | Subject | Section | Type | Correct Answer (Letter) | Marks |\n|---|---|---|---|---|---|\n';
      activeArchive.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            const letter =
              q.type === 'mcq'
                ? optionIndexToLetter(q.answerOptions)
                : q.type === 'msq'
                ? optionIndicesToLetters(q.answerOptions)
                : q.answerOptions || 'Unset';
            md += `| ${q.que} | ${sub.name} | ${sec.name} | ${q.type.toUpperCase()} | **${letter}** | +${q.marks.cm}/${q.marks.im} |\n`;
          });
        });
      });
      return md;
    }
  }, [activeArchive, exportFormat]);

  // If opening modal and no input exists, we keep it ready
  if (!isAnswerKeyModalOpen) return null;

  // Handle uploading 1 or MORE files at once
  const handleAddFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const newFiles: LoadedAnswerKeyFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const parsed = parseAnswerKeyPayload(text);
        newFiles.push({
          id: generateId(),
          name: file.name,
          size: file.size,
          content: text,
          parseResult: parsed,
          enabled: true,
          uploadedAt: Date.now() + i,
        });
      } catch (err: any) {
        console.error(`Error reading ${file.name}:`, err);
      }
    }

    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      setSelectedFileId('merged');
    }
  };

  const handleToggleFile = (fileId: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (selectedFileId === fileId) {
      setSelectedFileId('merged');
    }
  };

  const handleClearAllFiles = () => {
    if (uploadedFiles.length === 0 && !manualInputText) return;
    if (confirm('Clear all uploaded answer key files and manual inputs?')) {
      setUploadedFiles([]);
      setManualInputText('');
      setSelectedFileId('merged');
    }
  };

  // Update text when user edits current file or manual scratchpad in editor
  const handleEditorChange = (newText: string) => {
    setEditorText(newText);

    if (selectedFileId === 'manual') {
      setManualInputText(newText);
    } else if (selectedFileId !== 'merged') {
      const updatedParse = parseAnswerKeyPayload(newText);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === selectedFileId
            ? { ...f, content: newText, parseResult: updatedParse, size: newText.length }
            : f
        )
      );
    } else {
      // If user edits while in 'merged' view, convert it to manual scratchpad
      setManualInputText(newText);
    }
  };

  const handleExtractAiKeyFromFile = async (file: File) => {
    try {
      setIsExtractingAiKey(true);
      startBackgroundTask({
        id: 'answer_key_studio',
        title: `Scanning Key: ${file.name}`,
        statusText: enableDoublePassRescan
          ? 'Pass 1/2: Gemini AI Vision scanning answer key table...'
          : 'Gemini AI Vision scanning answer key table...',
        percent: 20,
        modalType: 'answer_key_studio',
      });

      let images: string[] = [];

      if (file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await getPdfjsLib();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = Math.min(pdfDoc.numPages, 10);

        for (let i = 1; i <= numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not get canvas 2d context');

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport } as any).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.85));
        }
      } else {
        // Image file
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        images.push(base64Image);
      }

      updateBackgroundTask({
        percent: 45,
        statusText: enableDoublePassRescan
          ? 'Pass 2/2: Verification rescan auditing question sequence & option types...'
          : 'Gemini AI Vision analyzing table layout...',
      });

      const response = await fetchWithGeminiFallback(
        '/api/extract-answer-key-pdf',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            options: { enableDoublePass: enableDoublePassRescan },
          }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      if (!data.answers || data.answers.length === 0) {
        throw new Error('No question answers were detected in this image/page.');
      }

      // Group answers by subject if available, otherwise flat mapping
      const hasSubjects = data.answers.some((a: any) => a.subject && a.subject.trim().length > 0);
      let formattedKeyJson: any = {};

      if (hasSubjects) {
        data.answers.forEach((item: any) => {
          const sub = (item.subject || 'General').trim();
          if (!formattedKeyJson[sub]) formattedKeyJson[sub] = {};
          formattedKeyJson[sub][String(item.qNo)] = String(item.answer);
        });
      } else {
        data.answers.forEach((item: any) => {
          formattedKeyJson[String(item.qNo)] = String(item.answer);
        });
      }

      const jsonString = JSON.stringify(formattedKeyJson, null, 2);
      const parsedRes = parseAnswerKeyPayload(jsonString);

      const newFile: LoadedAnswerKeyFile = {
        id: generateId(),
        name: `AI_Key_${file.name.replace(/\.[^/.]+$/, '')}.json`,
        size: jsonString.length,
        content: jsonString,
        parseResult: parsedRes,
        enabled: true,
        uploadedAt: Date.now(),
      };

      setUploadedFiles((prev) => [...prev, newFile]);
      setSelectedFileId(newFile.id);
      setEditorText(jsonString);

      completeBackgroundTask(`AI extracted & verified ${parsedRes.totalQuestions} answers from "${file.name}"!`);
      addToast(
        'Answer Key Extracted',
        `AI successfully parsed ${parsedRes.totalQuestions} questions with High Accuracy verification!`,
        'success'
      );
    } catch (err: any) {
      console.error('AI answer key extraction error:', err);
      addToast('Extraction Failed', err.message || 'Could not parse answer key.', 'error');
    } finally {
      setIsExtractingAiKey(false);
      if (aiKeyFileInputRef.current) aiKeyFileInputRef.current.value = '';
    }
  };

  const handleApplyToPaper = () => {
    if (!classificationReport || !activeArchive) return;
    applyAnswerKeyClassification(classificationReport, updateMarksOnApply);
    addToast({
      title: 'Answer Key Applied',
      description: `Successfully applied verified answer key to ${classificationReport.matchedCount} questions in ${activeArchive.title}!`,
      type: 'success',
    });
    setActiveTab('matrix');
  };

  const handleToggleIncludeMatch = (matchId: string) => {
    if (!classificationReport) return;
    // handled via state toggle
    const match = classificationReport.matches.find((m) => m.id === matchId);
    if (match) {
      match.isIncluded = !match.isIncluded;
    }
  };

  const handleSelectAllMatches = (selectAll: boolean) => {
    if (!classificationReport) return;
    classificationReport.matches.forEach((m) => {
      m.isIncluded = selectAll;
    });
  };

  const handleOverrideMatchType = (matchId: string, newType: QuestionType) => {
    if (!classificationReport) return;
    const m = classificationReport.matches.find((item) => item.id === matchId);
    if (m) {
      m.proposedType = newType;
      m.status = 'type_changed';
    }
  };

  // Matrix Stats
  const totalQuestionsInPaper = activeArchive
    ? activeArchive.subjects.reduce(
        (sum, sub) => sum + sub.sections.reduce((sSum, sec) => sSum + sec.questions.length, 0),
        0
      )
    : 0;

  const keyedQuestionsInPaper = activeArchive
    ? activeArchive.subjects.reduce(
        (sum, sub) =>
          sum +
          sub.sections.reduce(
            (sSum, sec) =>
              sSum + sec.questions.filter((q) => q.answerOptions && q.answerOptions.trim().length > 0).length,
            0
          ),
        0
      )
    : 0;

  const missingKeyCount = totalQuestionsInPaper - keyedQuestionsInPaper;

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportString);
      setCopied(true);
      addToast({
        title: 'Copied Export',
        description: 'Answer key copied to clipboard!',
        type: 'success',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        title: 'Clipboard Notice',
        description: 'Failed to copy to clipboard automatically.',
        type: 'warning',
      });
    }
  };

  const handleDownloadExport = () => {
    const filename = `answer_key_${activeArchive?.title.replace(/\s+/g, '_').toLowerCase() || 'cbt'}.${
      exportFormat === 'official_json' ? 'json' : exportFormat === 'csv' ? 'csv' : 'md'
    }`;
    const blob = new Blob([exportString], {
      type: exportFormat === 'official_json' ? 'application/json' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilesCount = uploadedFiles.filter((f) => f.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[94vh] max-h-[880px] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/30">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-white">
                  Answer Key Studio & Multi-File Ingestion Engine
                </h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Multi-File Ready
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Upload one or multiple answer key JSON/CSV files, merge distinct subject keys, auto-classify types, and verify.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeArchive && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
                <span className="text-slate-400">Paper Progress:</span>
                <span className={`font-semibold ${missingKeyCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {keyedQuestionsInPaper}/{totalQuestionsInPaper} Keyed
                </span>
              </div>
            )}
            <button
              onClick={() => setAnswerKeyModalOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-4 sm:px-6 bg-slate-950/60 border-b border-slate-800 overflow-x-auto scrollbar-none text-xs font-semibold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'upload'
                ? 'border-indigo-500 text-indigo-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Files className="w-4 h-4" />
            <span>1. Answer Key Files & Uploads</span>
            {uploadedFiles.length > 0 && (
              <span className="px-1.5 py-0.2 bg-indigo-600/80 text-white rounded text-[10px]">
                {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''}
              </span>
            )}
            {mergedParseResult?.isValid && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('matcher')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'matcher'
                ? 'border-indigo-500 text-indigo-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>2. Intelligent Classifier & Verification</span>
            {classificationReport && (
              <span className="px-1.5 py-0.2 bg-indigo-600/60 text-white rounded text-[10px]">
                {classificationReport.matchedCount} Qs
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'border-indigo-500 text-indigo-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>3. Paper Answer Grid</span>
            <span className="text-[10px] text-slate-500">
              ({keyedQuestionsInPaper}/{totalQuestionsInPaper})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'export'
                ? 'border-indigo-500 text-indigo-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>4. Generate & Export Key</span>
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/60">
          {/* TAB 1: MULTI-FILE UPLOAD & MANAGER */}
          {activeTab === 'upload' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Multi-file Hidden Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files) handleAddFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                accept=".json,.csv,.txt,.tsv"
                multiple
                className="hidden"
              />
              <input
                ref={aiKeyFileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExtractAiKeyFromFile(file);
                }}
              />

              {/* Upload Dropzone (Supports Multiple Files) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-indigo-500 bg-indigo-950/30 scale-101'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/50 shadow-lg'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center mb-3 shadow-md shadow-indigo-900/30">
                  <FilePlus2 className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm sm:text-base text-white">
                  Drop One or Multiple Answer Key Files (.json, .csv, .txt) Here
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-md">
                  Select multiple files at once (e.g. Physics.json, Chemistry.json, Maths.json) or add files sequentially. The system will intelligently merge all sections.
                </div>
                <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-lg text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Choose Multiple Files</span>
                </div>
              </div>

              {/* AI Progress Banner when scanning */}
              {isExtractingAiKey && (
                <div className="bg-indigo-950/80 border border-indigo-700/60 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-lg animate-pulse">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-indigo-200 block">
                        AI Scanning & Rescanning Answer Key...
                      </span>
                      <span className="text-[11px] text-indigo-300/80 block">
                        Double-pass verification pass in progress. You can run this process in the background.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={minimizeBackgroundTask}
                    className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-850 border border-indigo-500/50 text-indigo-200 hover:text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
                  >
                    <Minimize2 className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Run in Background</span>
                  </button>
                </div>
              )}

              {/* Quick Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-xs">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-300 font-semibold">Smart Key Tools:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={enableDoublePassRescan}
                      onChange={(e) => setEnableDoublePassRescan(e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-500"
                    />
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Double-Pass Rescan</span>
                  </label>

                  <button
                    onClick={() => aiKeyFileInputRef.current?.click()}
                    disabled={isExtractingAiKey}
                    className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    title="Upload an answer key page (image or PDF) and let AI OCR the table into standard JSON format"
                  >
                    {isExtractingAiKey ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    )}
                    <span>{isExtractingAiKey ? 'AI Extracting...' : 'Scan Key from PDF/Image (AI)'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (activeArchive) {
                        const json = generateOfficialAnswerKeyJson(activeArchive);
                        const file: LoadedAnswerKeyFile = {
                          id: generateId(),
                          name: `${activeArchive.title.replace(/\s+/g, '_')}_Key.json`,
                          size: json.length,
                          content: json,
                          parseResult: parseAnswerKeyPayload(json),
                          enabled: true,
                          uploadedAt: Date.now(),
                        };
                        setUploadedFiles((prev) => [...prev, file]);
                        setSelectedFileId('merged');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                    title="Generate answer key JSON directly from the questions currently in the active paper"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Generate Key from Active Paper</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Key Files</span>
                  </button>
                </div>
              </div>

              {/* Uploaded Files Queue List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <Files className="w-4 h-4 text-indigo-400" />
                      <span>Loaded Answer Key Files ({uploadedFiles.length})</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        • {activeFilesCount} active in merged key
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold rounded-md text-[11px] flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Another File</span>
                      </button>
                      <button
                        onClick={handleClearAllFiles}
                        className="text-slate-400 hover:text-rose-400 text-[11px] font-medium transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {uploadedFiles.map((file) => {
                      const isSelected = selectedFileId === file.id;
                      const sectionsCount = Object.keys(file.parseResult.sectionsMap).length;
                      const sectionNames = Object.keys(file.parseResult.sectionsMap).join(', ');

                      return (
                        <div
                          key={file.id}
                          className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                            !file.enabled
                              ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                              : isSelected
                              ? 'bg-indigo-950/30 border-indigo-500/60 shadow-md'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  file.parseResult.isValid
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                    : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                                }`}
                              >
                                {file.name.endsWith('.csv') ? (
                                  <FileSpreadsheet className="w-4 h-4" />
                                ) : (
                                  <FileCode className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="font-bold text-xs text-white truncate"
                                  title={file.name}
                                >
                                  {file.name}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                                  <span>•</span>
                                  <span
                                    className={`font-semibold ${
                                      file.parseResult.isValid ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {file.parseResult.isValid
                                      ? `${file.parseResult.totalQuestions} Questions (${sectionsCount} Sec)`
                                      : 'Invalid Format'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleToggleFile(file.id)}
                              className="text-slate-400 hover:text-white shrink-0 p-1"
                              title={file.enabled ? 'Disable from merge' : 'Include in merge'}
                            >
                              {file.enabled ? (
                                <ToggleRight className="w-5 h-5 text-indigo-400" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-slate-600" />
                              )}
                            </button>
                          </div>

                          {sectionNames && (
                            <div
                              className="text-[10px] text-slate-500 truncate bg-slate-900 px-2 py-1 rounded border border-slate-800"
                              title={sectionNames}
                            >
                              Sections: {sectionNames}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                            <button
                              onClick={() => setSelectedFileId(file.id)}
                              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                              }`}
                            >
                              {isSelected ? 'Viewing Content' : 'Inspect / Edit'}
                            </button>

                            <button
                              onClick={() => handleRemoveFile(file.id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="Remove file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Combined JSON & File Inspector Sub-View */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-blue-400" />
                      <span>Content & Raw Payload Viewer:</span>
                    </span>

                    {/* View selector tabs */}
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setSelectedFileId('merged')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                          selectedFileId === 'merged'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        <span>Combined Merged JSON</span>
                      </button>

                      <button
                        onClick={() => setSelectedFileId('manual')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                          selectedFileId === 'manual'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Clipboard className="w-3 h-3" />
                        <span>Manual Scratchpad</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {editorText && (
                      <button
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(editorText);
                            handleEditorChange(JSON.stringify(parsed, null, 2));
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-indigo-400 hover:text-indigo-300 text-[11px] font-medium"
                      >
                        Format JSON
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={editorText}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    placeholder={`Paste answer key JSON or CSV here, or upload files above...\n{\n  "sections": {\n    "P1 · Physics": {\n      "1": { "correctOption": "D" }\n    }\n  }\n}`}
                    rows={8}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-y leading-relaxed shadow-inner"
                  />
                  {selectedFileId === 'merged' && (
                    <div className="absolute top-2 right-3 px-2 py-0.5 bg-indigo-900/80 border border-indigo-700/60 rounded text-[10px] font-mono text-indigo-200">
                      Auto-Merged View (Read-Only Live Aggregate)
                    </div>
                  )}
                </div>
              </div>

              {/* Merged Health & Verification Summary */}
              {mergedParseResult && (
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    mergedParseResult.isValid
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {mergedParseResult.isValid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-white">
                        {mergedParseResult.isValid
                          ? `Unified Answer Key Ready (${mergedParseResult.totalQuestions} Questions combined across ${
                              Object.keys(mergedParseResult.sectionsMap).length
                            } Sections from ${activeFilesCount} file${activeFilesCount > 1 ? 's' : ''})`
                          : 'Invalid Answer Key Structure'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {mergedParseResult.isValid
                          ? `Schema verified: Ready to auto-classify and match with ${activeArchive?.title || 'active paper'}.`
                          : mergedParseResult.error || 'Parsing syntax error in answer key payload.'}
                      </div>
                    </div>
                  </div>

                  {mergedParseResult.isValid && activeArchive && (
                    <button
                      onClick={() => setActiveTab('matcher')}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>Proceed to Intelligent Classifier & Matcher ({mergedParseResult.totalQuestions} Qs)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INTELLIGENT CLASSIFIER & MATCHER */}
          {activeTab === 'matcher' && (
            <div className="space-y-4">
              {!classificationReport ? (
                <div className="p-12 text-center bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <HelpCircle className="w-10 h-10 text-slate-500 mx-auto" />
                  <div className="font-bold text-white text-sm">No Answer Key Files Loaded to Match</div>
                  <div className="text-xs text-slate-400 max-w-sm mx-auto">
                    Please upload or select answer key files in Tab 1 to run the intelligent matching engine against the active question paper.
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('upload');
                    }}
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
                  >
                    Go to Upload &amp; Load Keys
                  </button>
                </div>
              ) : (
                <>
                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Matched Questions</div>
                      <div className="text-lg font-bold text-emerald-400">
                        {classificationReport.matchedCount} / {classificationReport.totalPaperQuestions}
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Type Inferences</div>
                      <div className="text-lg font-bold text-indigo-400">
                        {classificationReport.typeChangedCount}
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Answer Updates</div>
                      <div className="text-lg font-bold text-purple-400">
                        {classificationReport.answerUpdatedCount}
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Unmatched in Key</div>
                      <div className="text-lg font-bold text-amber-400">
                        {classificationReport.unmatchedCount}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Filters Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-400 font-medium">Filter:</span>
                      {(['all', 'changed', 'unmatched'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setMatcherFilter(f)}
                          className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-colors ${
                            matcherFilter === f
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {f === 'changed' ? 'Type/Answer Updates' : f}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={updateMarksOnApply}
                          onChange={(e) => setUpdateMarksOnApply(e.target.checked)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Auto-update marking schemes (+4/-2 MSQ, +4/0 NAT)</span>
                      </label>

                      <button
                        onClick={handleApplyToPaper}
                        className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Apply Merged Key to Paper</span>
                      </button>
                    </div>
                  </div>

                  {/* Matches Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 z-10 border-b border-slate-800">
                          <tr>
                            <th className="p-3 w-10">
                              <input
                                type="checkbox"
                                checked={classificationReport.matches.every((m) => m.isIncluded)}
                                onChange={(e) => handleSelectAllMatches(e.target.checked)}
                                className="rounded border-slate-700"
                              />
                            </th>
                            <th className="p-3">Q#</th>
                            <th className="p-3">Subject / Section</th>
                            <th className="p-3">Current Type → Proposed</th>
                            <th className="p-3">Proposed Answer (Target)</th>
                            <th className="p-3">Confidence</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {classificationReport.matches
                            .filter((m) => {
                              if (matcherFilter === 'changed') {
                                return m.status === 'type_changed' || m.status === 'answer_updated';
                              }
                              return true;
                            })
                            .map((match) => {
                              return (
                                <tr
                                  key={match.id}
                                  className={`hover:bg-slate-900/40 transition-colors ${
                                    !match.isIncluded ? 'opacity-40' : ''
                                  }`}
                                >
                                  <td className="p-3">
                                    <input
                                      type="checkbox"
                                      checked={match.isIncluded}
                                      onChange={() => handleToggleIncludeMatch(match.id)}
                                      className="rounded border-slate-700 text-indigo-600"
                                    />
                                  </td>
                                  <td className="p-3 font-bold text-white">
                                    {questionMap.get(match.questionId) ? (
                                      <QuestionHoverTrigger
                                        question={questionMap.get(match.questionId)!}
                                        subjectName={match.subjectName}
                                        sectionName={match.sectionName}
                                        archiveId={activeArchive?.id}
                                        className="inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <span className="hover:text-indigo-300 hover:underline decoration-indigo-400 decoration-dotted underline-offset-2 transition-colors">
                                          Q{match.questionNumber}
                                        </span>
                                      </QuestionHoverTrigger>
                                    ) : (
                                      <span>Q{match.questionNumber}</span>
                                    )}
                                  </td>
                                  <td className="p-3 font-sans text-slate-300">
                                    <div className="font-semibold text-white">{match.subjectName}</div>
                                    <div className="text-[10px] text-slate-400">{match.sectionName}</div>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase text-[10px]">
                                        {match.currentType}
                                      </span>
                                      <span className="text-slate-600">→</span>
                                      <select
                                        value={match.proposedType}
                                        onChange={(e) =>
                                          handleOverrideMatchType(match.id, e.target.value as QuestionType)
                                        }
                                        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-indigo-300 font-bold uppercase"
                                      >
                                        <option value="mcq">MCQ</option>
                                        <option value="msq">MSQ</option>
                                        <option value="nat">NAT</option>
                                        <option value="msm">MSM</option>
                                      </select>
                                    </div>
                                  </td>
                                  <td className="p-3 font-sans">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-700/60 text-emerald-300 rounded font-bold text-xs">
                                        {match.proposedLetterAnswer}
                                      </span>
                                      {match.proposedAnswer !== match.proposedLetterAnswer && (
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          (Index: {match.proposedAnswer})
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 font-sans">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                        match.confidence === 'exact'
                                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                          : match.confidence === 'section_fuzzy'
                                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                          : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                      }`}
                                      title={match.matchReason}
                                    >
                                      {match.confidence.replace('_', ' ').toUpperCase()} ({match.matchScore}%)
                                    </span>
                                  </td>
                                  <td className="p-3 font-sans">
                                    {match.status === 'type_changed' && (
                                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                                        Type Updated
                                      </span>
                                    )}
                                    {match.status === 'answer_updated' && (
                                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                                        Answer Updated
                                      </span>
                                    )}
                                    {match.status === 'already_matches' && (
                                      <span className="text-slate-500 text-[11px]">Identical</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Unmatched Warnings Section */}
                  {classificationReport.unmatchedKeyEntries.length > 0 && (
                    <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Unmatched Key Entries ({classificationReport.unmatchedKeyEntries.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-300 font-mono">
                        {classificationReport.unmatchedKeyEntries.map((item, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded"
                          >
                            {item.sectionName} Q#{item.questionNumber}: {item.letterAnswer}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: PAPER ANSWER KEY GRID & MATRIX EDITOR */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {/* Top Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Subject filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Subject:</span>
                    <select
                      value={matrixSubjectFilter}
                      onChange={(e) => setMatrixSubjectFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    >
                      <option value="all">All Subjects</option>
                      {activeArchive?.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Only Missing Answers */}
                  <button
                    onClick={() => setMatrixOnlyMissing((m) => !m)}
                    className={`px-3 py-1 rounded-lg border font-semibold transition-colors flex items-center gap-1.5 ${
                      matrixOnlyMissing
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Missing / Unticked Only ({missingKeyCount})</span>
                  </button>

                  {/* Quick Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                    <input
                      type="text"
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                      placeholder="Search Q# or section..."
                      className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white w-40 sm:w-48"
                    />
                  </div>
                </div>

                {/* Batch Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to clear ALL answers from this paper? All questions will become unkeyed.')) {
                        clearAllAnswersInActiveArchive();
                      }
                    }}
                    className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Answers</span>
                  </button>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <div className="overflow-x-auto max-h-[460px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-3 w-16">Q#</th>
                        <th className="p-3">Subject & Section</th>
                        <th className="p-3 w-28">Type</th>
                        <th className="p-3">Answer Key & Response Target</th>
                        <th className="p-3 w-28">Marks</th>
                        <th className="p-3 w-16">Clear</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {activeArchive?.subjects
                        .filter((s) => matrixSubjectFilter === 'all' || s.id === matrixSubjectFilter)
                        .flatMap((sub) =>
                          sub.sections.flatMap((sec) =>
                            sec.questions
                              .filter((q) => {
                                if (matrixOnlyMissing && q.answerOptions && q.answerOptions.trim().length > 0) {
                                  return false;
                                }
                                if (matrixSearch) {
                                  const search = matrixSearch.toLowerCase();
                                  return (
                                    String(q.que).includes(search) ||
                                    sec.name.toLowerCase().includes(search) ||
                                    sub.name.toLowerCase().includes(search)
                                  );
                                }
                                return true;
                              })
                              .map((q) => {
                                const isKeyed = q.answerOptions && q.answerOptions.trim().length > 0;

                                return (
                                  <tr
                                    key={q.id}
                                    className={`hover:bg-slate-900/40 transition-colors ${
                                      !isKeyed ? 'bg-amber-950/10' : ''
                                    }`}
                                  >
                                    <td className="p-3 font-mono font-bold text-white">
                                      <QuestionHoverTrigger
                                        question={q}
                                        subjectName={sub.name}
                                        sectionName={sec.name}
                                        archiveId={activeArchive?.id}
                                        className="inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <span className="hover:text-indigo-300 hover:underline decoration-indigo-400 decoration-dotted underline-offset-2 transition-colors">
                                          Q{q.que}
                                        </span>
                                        {!isKeyed && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Missing answer key" />
                                        )}
                                      </QuestionHoverTrigger>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-semibold text-white">{sub.name}</div>
                                      <div className="text-[10px] text-slate-400">{sec.name}</div>
                                    </td>
                                    <td className="p-3">
                                      <select
                                        value={q.type}
                                        onChange={(e) =>
                                          updateQuestion(
                                            q.id,
                                            { type: e.target.value as QuestionType },
                                            'Change Question Type'
                                          )
                                        }
                                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-indigo-300 font-bold uppercase"
                                      >
                                        <option value="mcq">MCQ (Single)</option>
                                        <option value="msq">MSQ (Multi)</option>
                                        <option value="nat">NAT (Num)</option>
                                        <option value="msm">MSM (Matrix)</option>
                                      </select>
                                    </td>
                                    <td className="p-3">
                                      {/* MCQ Option selector */}
                                      {q.type === 'mcq' && (
                                        <div className="flex items-center gap-1.5">
                                          {['1', '2', '3', '4'].map((opt) => {
                                            const letter = optionIndexToLetter(opt);
                                            const isSelected =
                                              q.answerOptions === opt || q.answerOptions === letter;
                                            return (
                                              <button
                                                key={opt}
                                                onClick={() =>
                                                  updateQuestion(
                                                    q.id,
                                                    { answerOptions: opt },
                                                    `Set Answer to ${letter}`
                                                  )
                                                }
                                                className={`w-7 h-7 rounded-lg font-bold text-xs transition-all flex items-center justify-center ${
                                                  isSelected
                                                    ? 'bg-emerald-600 text-white shadow-md scale-105'
                                                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                                                }`}
                                              >
                                                {letter}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* MSQ Multi-option selector */}
                                      {q.type === 'msq' && (
                                        <div className="flex items-center gap-1.5">
                                          {['1', '2', '3', '4'].map((opt) => {
                                            const letter = optionIndexToLetter(opt);
                                            const list = q.answerOptions
                                              ? q.answerOptions.split(',').map((s) => s.trim())
                                              : [];
                                            const isSelected = list.includes(opt) || list.includes(letter);

                                            return (
                                              <button
                                                key={opt}
                                                onClick={() => {
                                                  let newList = isSelected
                                                    ? list.filter((x) => x !== opt && x !== letter)
                                                    : [...list, opt];
                                                  newList = Array.from(new Set(newList)).sort();
                                                  updateQuestion(
                                                    q.id,
                                                    { answerOptions: newList.join(',') },
                                                    'Update MSQ Option'
                                                  );
                                                }}
                                                className={`w-7 h-7 rounded-lg font-bold text-xs transition-all flex items-center justify-center ${
                                                  isSelected
                                                    ? 'bg-purple-600 text-white shadow-md'
                                                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                                                }`}
                                              >
                                                {letter}
                                              </button>
                                            );
                                          })}
                                          <span className="text-[10px] text-purple-300 font-mono ml-2">
                                            {optionIndicesToLetters(q.answerOptions) || 'None'}
                                          </span>
                                        </div>
                                      )}

                                      {/* NAT Numerical Input */}
                                      {q.type === 'nat' && (
                                        <input
                                          type="text"
                                          value={q.answerOptions || ''}
                                          onChange={(e) =>
                                            updateQuestion(
                                              q.id,
                                              { answerOptions: e.target.value },
                                              'Update Numerical Answer'
                                            )
                                          }
                                          placeholder="e.g. 40, 5, 0.75"
                                          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono w-32 focus:outline-none focus:border-indigo-500"
                                        />
                                      )}

                                      {/* MSM Matrix mapping input */}
                                      {q.type === 'msm' && (
                                        <input
                                          type="text"
                                          value={q.answerOptions || ''}
                                          onChange={(e) =>
                                            updateQuestion(
                                              q.id,
                                              { answerOptions: e.target.value },
                                              'Update Matrix Answer'
                                            )
                                          }
                                          placeholder="A->P,Q; B->R..."
                                          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono w-48 focus:outline-none focus:border-indigo-500"
                                        />
                                      )}
                                    </td>
                                    <td className="p-3 font-mono text-slate-300">
                                      +{q.marks.cm} / {q.marks.im}
                                    </td>
                                    <td className="p-3">
                                      {isKeyed && (
                                        <button
                                          onClick={() =>
                                            updateQuestion(
                                              q.id,
                                              { answerOptions: '' },
                                              'Clear Question Answer'
                                            )
                                          }
                                          className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                                          title="Clear Answer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                          )
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GENERATE & EXPORT KEY */}
          {activeTab === 'export' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Export Format:</span>
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setExportFormat('official_json')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        exportFormat === 'official_json'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Official JSON (NTA)
                    </button>
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        exportFormat === 'csv'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      CSV Spreadsheet
                    </button>
                    <button
                      onClick={() => setExportFormat('markdown')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        exportFormat === 'markdown'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Markdown Table
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyExport}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                  </button>

                  <button
                    onClick={handleDownloadExport}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>

              {/* Code Display Area */}
              <div className="relative border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <span>
                    {exportFormat === 'official_json'
                      ? 'answer_key.json'
                      : exportFormat === 'csv'
                      ? 'answer_key.csv'
                      : 'answer_key.md'}
                  </span>
                  <span>{exportString.split('\n').length} lines</span>
                </div>
                <pre className="p-4 font-mono text-xs text-indigo-200 overflow-auto max-h-[460px] leading-relaxed select-text">
                  {exportString}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              Multi-File Answer Key Ingestion Engine Active ({activeFilesCount} File{activeFilesCount !== 1 ? 's' : ''} Loaded)
            </span>
          </div>

          <button
            onClick={() => setAnswerKeyModalOpen(false)}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

