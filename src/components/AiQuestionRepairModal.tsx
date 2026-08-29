import React, { useState, useEffect } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { fetchWithGeminiFallback } from '../utils/geminiKeyManager';
import {
  Wand2,
  X,
  Sparkles,
  Check,
  Crop,
  AlertTriangle,
  FileCheck,
  Layers,
  Scissors,
  Split,
  RefreshCw,
  Loader2,
  ArrowRight,
  Eye,
  Sliders
} from 'lucide-react';

export const AiQuestionRepairModal: React.FC = () => {
  const {
    isAiRepairModalOpen,
    aiRepairQuestionId,
    closeAiRepair,
    archives,
    activeArchiveId,
    updateQuestion,
    openPdfRecrop,
    applyCroppedImage,
    geminiApiKey,
    addToast,
    refreshUsageMetrics,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Locate the question
  let targetQuestion: any = null;
  let targetSection: any = null;
  let targetSubject: any = null;

  if (activeArchive && aiRepairQuestionId) {
    for (const sub of activeArchive.subjects) {
      for (const sec of sub.sections) {
        const q = sec.questions.find((item) => item.id === aiRepairQuestionId);
        if (q) {
          targetQuestion = q;
          targetSection = sec;
          targetSubject = sub;
          break;
        }
      }
    }
  }

  // AI Diagnostic State
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<{
    ocrText?: string;
    detectedType?: 'mcq' | 'msq' | 'nat' | 'msm';
    suggestedAnswer?: string;
    suggestedMarks?: { cm: number; im: number; pm: number; max: number };
    issuesFound?: string[];
    confidence?: number;
    explanation?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Image Enhancement & Filter Scope State
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null);
  const [enhancementFilter, setEnhancementFilter] = useState<'clean' | 'sharpen' | 'high_contrast' | 'invert'>('clean');
  const [filterScope, setFilterScope] = useState<'current' | 'all' | 'range'>('current');
  const [rangeInput, setRangeInput] = useState<string>('');
  const [isProcessingFilter, setIsProcessingFilter] = useState<boolean>(false);

  // Parse comma-separated question range string like "1-10, 15, 18-20"
  const parseQuestionRange = (str: string, allQuestions: any[]): any[] => {
    if (!str.trim()) return [];
    const parts = str.split(',').map((p) => p.trim()).filter(Boolean);
    const matchedIds = new Set<string>();

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => parseInt(s.trim(), 10));
        if (!isNaN(startStr) && !isNaN(endStr)) {
          const min = Math.min(startStr, endStr);
          const max = Math.max(startStr, endStr);
          allQuestions.forEach((q) => {
            if (q.que >= min && q.que <= max) {
              matchedIds.add(q.id);
            }
          });
        }
      } else {
        const qNum = parseInt(part, 10);
        if (!isNaN(qNum)) {
          allQuestions.forEach((q) => {
            if (q.que === qNum) {
              matchedIds.add(q.id);
            }
          });
        }
      }
    }

    return allQuestions.filter((q) => matchedIds.has(q.id));
  };

  // Process filter transformation on image blob
  const applyFilterToQuestionBlob = async (q: any, filterType: 'clean' | 'sharpen' | 'high_contrast' | 'invert'): Promise<Blob | null> => {
    if (!q || !q.images || q.images.length === 0) return null;
    const imgUrl = q.images[0].blobUrl;
    if (!imgUrl) return null;

    return new Promise((resolve) => {
      const imgElem = new Image();
      imgElem.crossOrigin = 'anonymous';
      imgElem.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = imgElem.naturalWidth;
        canvas.height = imgElem.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        ctx.drawImage(imgElem, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          if (filterType === 'clean') {
            if (r > 205 && g > 205 && b > 205) {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            }
          } else if (filterType === 'sharpen') {
            if (r < 150 && g < 150 && b < 150) {
              data[i] = Math.max(0, r - 40);
              data[i + 1] = Math.max(0, g - 40);
              data[i + 2] = Math.max(0, b - 40);
            } else if (r > 200) {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            }
          } else if (filterType === 'high_contrast') {
            const avg = (r + g + b) / 3;
            const val = avg < 160 ? 0 : 255;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
          } else if (filterType === 'invert') {
            data[i] = 255 - r;
            data[i + 1] = 255 - g;
            data[i + 2] = 255 - b;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      };
      imgElem.onerror = () => resolve(null);
      imgElem.src = imgUrl;
    });
  };

  // Batch Filter Execution over selected Scope
  const handleApplyFilterToScope = async (filterType: 'clean' | 'sharpen' | 'high_contrast' | 'invert') => {
    if (!activeArchive) return;

    const allQuestions: any[] = [];
    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => allQuestions.push(q));
      });
    });

    let targetsToProcess: any[] = [];
    if (filterScope === 'current') {
      if (targetQuestion) targetsToProcess = [targetQuestion];
    } else if (filterScope === 'all') {
      targetsToProcess = allQuestions;
    } else if (filterScope === 'range') {
      targetsToProcess = parseQuestionRange(rangeInput, allQuestions);
    }

    if (targetsToProcess.length === 0) {
      addToast('Filter Scope Error', 'No questions matched the provided range or selection.', 'error');
      return;
    }

    setIsProcessingFilter(true);
    let successCount = 0;

    for (const q of targetsToProcess) {
      const blob = await applyFilterToQuestionBlob(q, filterType);
      if (blob) {
        await applyCroppedImage({
          questionId: q.id,
          partIndex: 1,
          mode: 'replace_part',
          blob,
        });
        successCount++;
      }
    }

    setIsProcessingFilter(false);
    const filterLabel =
      filterType === 'clean'
        ? 'Auto-Whiten'
        : filterType === 'sharpen'
        ? 'Sharpen'
        : filterType === 'high_contrast'
        ? 'Binarize'
        : 'Invert';

    addToast('Filter Processed!', `Applied ${filterLabel} filter to ${successCount} question(s).`, 'success');

    if (filterScope === 'current' && targetQuestion) {
      applyImageEnhancement(filterType);
    }
  };

  // Split question state
  const [splitYPercent, setSplitYPercent] = useState<number>(50);
  const [showSplitTool, setShowSplitTool] = useState<boolean>(false);
  const [splitPreviews, setSplitPreviews] = useState<{ top: string; bottom: string } | null>(null);

  // Auto-run AI diagnostic when opened
  useEffect(() => {
    if (!isAiRepairModalOpen || !targetQuestion) {
      setAnalysisResult(null);
      setErrorMsg('');
      setEnhancedPreview(null);
      setShowSplitTool(false);
      setSplitPreviews(null);
      return;
    }

    runAiDiagnostic();
  }, [isAiRepairModalOpen, targetQuestion?.id]);

  const runAiDiagnostic = async () => {
    if (!targetQuestion || targetQuestion.images.length === 0) return;
    setAnalyzing(true);
    setErrorMsg('');

    try {
      // Get the primary image base64
      const primaryImg = targetQuestion.images[0];
      let base64 = '';

      if (primaryImg.rawBlob) {
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(primaryImg.rawBlob);
        });
      } else if (primaryImg.blobUrl) {
        const response = await fetch(primaryImg.blobUrl);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      if (!base64) {
        throw new Error('Image data not accessible');
      }

      const res = await fetchWithGeminiFallback(
        '/api/analyze-question-image',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            qNo: targetQuestion.que,
            currentType: targetQuestion.type,
          }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Diagnostic service error');
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err: any) {
      console.error("AI Repair error:", err);
      setErrorMsg(err.message || 'Diagnostic failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate Enhanced Image Preview
  const applyImageEnhancement = async (filterType: 'clean' | 'sharpen' | 'high_contrast' | 'invert') => {
    if (!targetQuestion || targetQuestion.images.length === 0) return;
    const imgElem = new Image();
    imgElem.crossOrigin = 'anonymous';
    imgElem.src = targetQuestion.images[0].blobUrl;

    await new Promise((res) => (imgElem.onload = res));

    const canvas = document.createElement('canvas');
    canvas.width = imgElem.naturalWidth;
    canvas.height = imgElem.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(imgElem, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (filterType === 'clean') {
        // Auto-whiten grey scanner background
        if (r > 205 && g > 205 && b > 205) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      } else if (filterType === 'sharpen') {
        // High contrast text
        if (r < 150 && g < 150 && b < 150) {
          data[i] = Math.max(0, r - 40);
          data[i + 1] = Math.max(0, g - 40);
          data[i + 2] = Math.max(0, b - 40);
        } else if (r > 200) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      } else if (filterType === 'high_contrast') {
        // Pure thresholding binarization
        const avg = (r + g + b) / 3;
        const val = avg < 160 ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      } else if (filterType === 'invert') {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setEnhancedPreview(canvas.toDataURL('image/png'));
    setEnhancementFilter(filterType);
  };

  // Split Image horizontally into two questions
  const previewSplit = async (percent: number) => {
    if (!targetQuestion || targetQuestion.images.length === 0) return;
    const imgElem = new Image();
    imgElem.crossOrigin = 'anonymous';
    imgElem.src = targetQuestion.images[0].blobUrl;
    await new Promise((res) => (imgElem.onload = res));

    const splitY = Math.floor((percent / 100) * imgElem.naturalHeight);

    // Top Canvas
    const topCanvas = document.createElement('canvas');
    topCanvas.width = imgElem.naturalWidth;
    topCanvas.height = splitY;
    const tCtx = topCanvas.getContext('2d');
    if (tCtx) tCtx.drawImage(imgElem, 0, 0, imgElem.naturalWidth, splitY, 0, 0, imgElem.naturalWidth, splitY);

    // Bottom Canvas
    const botCanvas = document.createElement('canvas');
    botCanvas.width = imgElem.naturalWidth;
    botCanvas.height = imgElem.naturalHeight - splitY;
    const bCtx = botCanvas.getContext('2d');
    if (bCtx)
      bCtx.drawImage(
        imgElem,
        0,
        splitY,
        imgElem.naturalWidth,
        imgElem.naturalHeight - splitY,
        0,
        0,
        imgElem.naturalWidth,
        imgElem.naturalHeight - splitY
      );

    setSplitPreviews({
      top: topCanvas.toDataURL('image/png'),
      bottom: botCanvas.toDataURL('image/png')
    });
  };

  // Apply Split & Insert Next Question
  const handleExecuteSplit = async () => {
    if (!splitPreviews || !targetQuestion || !targetSection) return;

    // Convert top preview to blob -> replace current question image
    const topBlob = await (await fetch(splitPreviews.top)).blob();
    await applyCroppedImage({
      questionId: targetQuestion.id,
      partIndex: 1,
      mode: 'replace_part',
      blob: topBlob
    });

    // Convert bottom preview to blob -> add new next question
    const botBlob = await (await fetch(splitPreviews.bottom)).blob();
    await applyCroppedImage({
      mode: 'new_question',
      sectionId: targetSection.id,
      subjectId: targetSubject.id,
      blob: botBlob,
      newQuestionProps: {
        que: targetQuestion.que + 1,
        type: targetQuestion.type,
        marks: { ...targetQuestion.marks }
      }
    });

    closeAiRepair();
  };

  // Apply AI Fixes to Question
  const handleApplyAiFixes = () => {
    if (!targetQuestion || !analysisResult) return;

    const updates: any = {};
    if (analysisResult.detectedType) {
      updates.type = analysisResult.detectedType;
    }
    if (analysisResult.suggestedMarks) {
      updates.marks = analysisResult.suggestedMarks;
    }
    if (analysisResult.suggestedAnswer && !targetQuestion.answerOptions) {
      updates.answerOptions = analysisResult.suggestedAnswer;
    }
    if (analysisResult.ocrText) {
      updates.notes = analysisResult.ocrText.slice(0, 300);
    }

    updateQuestion(targetQuestion.id, updates, `AI Auto-Repair Q${targetQuestion.que}`);

    if (enhancedPreview) {
      fetch(enhancedPreview)
        .then((r) => r.blob())
        .then((blob) => {
          applyCroppedImage({
            questionId: targetQuestion.id,
            partIndex: 1,
            mode: 'replace_part',
            blob
          });
        });
    }

    closeAiRepair();
  };

  if (!isAiRepairModalOpen || !targetQuestion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 text-slate-100 overflow-hidden">
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 border border-purple-500/40 rounded-lg text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  AI Question Doctor & Repair Workbench
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded-full font-mono">
                  Q{targetQuestion.que} • {targetSection?.name || 'Section'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Inspect OCR accuracy, correct question classifications, enhance scanned images, or repair split errors.
              </p>
            </div>
          </div>

          <button
            onClick={closeAiRepair}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Top Section: Question Image & Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Image Preview Box */}
            <div className="md:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
                <span>Active Image Slice</span>
                <span>{targetQuestion.images.length} Part(s)</span>
              </div>

              <div className="w-full bg-white rounded-lg p-2 flex items-center justify-center max-h-64 overflow-auto border border-slate-300 shadow-inner">
                {targetQuestion.images.length > 0 ? (
                  <img
                    src={enhancedPreview || targetQuestion.images[0].blobUrl}
                    alt={`Q${targetQuestion.que}`}
                    className="max-w-full h-auto object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-500">No image attached</span>
                )}
              </div>

              {/* Re-crop trigger button */}
              <div className="w-full mt-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    closeAiRepair();
                    openPdfRecrop({
                      questionId: targetQuestion.id,
                      partIndex: 1,
                      mode: 'replace_part'
                    });
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                >
                  <Crop className="w-4 h-4" />
                  <span>Re-Crop from PDF Paper</span>
                </button>

                <button
                  onClick={() => setShowSplitTool(!showSplitTool)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
                  title="If AI merged two questions into one"
                >
                  <Scissors className="w-3.5 h-3.5 text-purple-400" />
                  <span>Split Combined</span>
                </button>
              </div>
            </div>

            {/* AI Diagnostics & Suggestions */}
            <div className="md:col-span-6 space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      AI Diagnostic Scan
                    </h3>
                  </div>

                  <button
                    onClick={runAiDiagnostic}
                    disabled={analyzing}
                    className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                    title="Re-run Diagnostic"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {analyzing ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                    <p className="text-xs text-slate-400">
                      Analyzing question formula, type, and marking scheme...
                    </p>
                  </div>
                ) : analysisResult ? (
                  <div className="space-y-3 text-xs">
                    {/* Detected Type */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-slate-400">Question Format:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400 line-through">
                          {targetQuestion.type.toUpperCase()}
                        </span>
                        <ArrowRight className="w-3 h-3 text-purple-400" />
                        <span className="font-bold text-emerald-400 uppercase font-mono">
                          {analysisResult.detectedType}
                        </span>
                      </div>
                    </div>

                    {/* Marking Scheme */}
                    {analysisResult.suggestedMarks && (
                      <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-400">Marking Scheme:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          +{analysisResult.suggestedMarks.cm} / -{Math.abs(analysisResult.suggestedMarks.im)}
                          {analysisResult.suggestedMarks.pm > 0 && ` (Partial: +${analysisResult.suggestedMarks.pm})`}
                        </span>
                      </div>
                    )}

                    {/* Detected Answer Key */}
                    {analysisResult.suggestedAnswer && (
                      <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-400">Suggested Answer:</span>
                        <span className="font-mono font-bold text-amber-400">
                          {analysisResult.suggestedAnswer}
                        </span>
                      </div>
                    )}

                    {/* OCR Text */}
                    {analysisResult.ocrText && (
                      <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Extracted OCR Content
                        </span>
                        <p className="text-[11px] text-slate-300 font-mono leading-relaxed line-clamp-3">
                          {analysisResult.ocrText}
                        </p>
                      </div>
                    )}
                  </div>
                ) : errorMsg ? (
                  <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300">
                    {errorMsg}
                  </div>
                ) : null}
              </div>

              {/* Image Enhancers & Batch Scope Filters */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Scan Cleaning & Filters
                    </h3>
                  </div>
                  {isProcessingFilter && (
                    <div className="flex items-center gap-1.5 text-xs text-indigo-400 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Applying filter...</span>
                    </div>
                  )}
                </div>

                {/* Filter Target Scope Control */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Target Scope:</span>
                    <span className="text-indigo-400">
                      {filterScope === 'current'
                        ? `Current Q${targetQuestion.que}`
                        : filterScope === 'all'
                        ? `All Questions (${
                            activeArchive
                              ? activeArchive.subjects.reduce(
                                  (acc, sub) => acc + sub.sections.reduce((secAcc, sec) => secAcc + sec.questions.length, 0),
                                  0
                                )
                              : 0
                          })`
                        : `${
                            parseQuestionRange(
                              rangeInput,
                              activeArchive
                                ? activeArchive.subjects.flatMap((s) => s.sections.flatMap((sec) => sec.questions))
                                : []
                            ).length
                          } Selected`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px] font-medium">
                    <button
                      onClick={() => setFilterScope('current')}
                      className={`py-1 px-2 rounded-md transition-all ${
                        filterScope === 'current'
                          ? 'bg-indigo-600 text-white font-bold shadow'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Current Q{targetQuestion.que}
                    </button>
                    <button
                      onClick={() => setFilterScope('all')}
                      className={`py-1 px-2 rounded-md transition-all ${
                        filterScope === 'all'
                          ? 'bg-indigo-600 text-white font-bold shadow'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      All Questions
                    </button>
                    <button
                      onClick={() => setFilterScope('range')}
                      className={`py-1 px-2 rounded-md transition-all ${
                        filterScope === 'range'
                          ? 'bg-indigo-600 text-white font-bold shadow'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {filterScope === 'range' && (
                    <div className="space-y-1 pt-1">
                      <input
                        type="text"
                        value={rangeInput}
                        onChange={(e) => setRangeInput(e.target.value)}
                        placeholder="e.g. 1-10, 15, 18-20"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-md font-mono text-white placeholder-slate-500 outline-none"
                      />
                      <p className="text-[10px] text-slate-400">
                        Enter comma-separated question numbers or ranges like <code className="text-indigo-300 font-mono">1-10, 12, 15-20</code>
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => handleApplyFilterToScope('clean')}
                    disabled={isProcessingFilter}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 text-slate-300 text-left transition-colors disabled:opacity-50"
                  >
                    <span className="font-semibold block text-indigo-300">Auto-Whiten</span>
                    <span className="text-[10px] text-slate-400">Remove scanner grey shadows</span>
                  </button>

                  <button
                    onClick={() => handleApplyFilterToScope('sharpen')}
                    disabled={isProcessingFilter}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 text-slate-300 text-left transition-colors disabled:opacity-50"
                  >
                    <span className="font-semibold block text-emerald-300">Sharpen Text</span>
                    <span className="text-[10px] text-slate-400">Deepen faint math & formulas</span>
                  </button>

                  <button
                    onClick={() => handleApplyFilterToScope('high_contrast')}
                    disabled={isProcessingFilter}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 text-slate-300 text-left transition-colors disabled:opacity-50"
                  >
                    <span className="font-semibold block text-amber-300">Binarize</span>
                    <span className="text-[10px] text-slate-400">Pure monochrome 1-bit scan</span>
                  </button>

                  <button
                    onClick={() => handleApplyFilterToScope('invert')}
                    disabled={isProcessingFilter}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 text-slate-300 text-left transition-colors disabled:opacity-50"
                  >
                    <span className="font-semibold block text-purple-300">Invert Colors</span>
                    <span className="text-[10px] text-slate-400">Dark mode / inverted scans</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Split Question Slicer Tool (if toggled) */}
          {showSplitTool && (
            <div className="bg-slate-950 border border-purple-800/60 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">
                    Horizontal Splitter (Split 2-in-1 Merged Image)
                  </h3>
                </div>
                <button
                  onClick={() => setShowSplitTool(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                  <span>Split Cut Line: {splitYPercent}%</span>
                  <span className="text-purple-400">
                    Q{targetQuestion.que} (Top) + Q{targetQuestion.que + 1} (Bottom)
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={splitYPercent}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSplitYPercent(val);
                    previewSplit(val);
                  }}
                  className="w-full accent-purple-500"
                />
              </div>

              {splitPreviews && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-2 rounded border border-purple-500">
                    <span className="text-[10px] font-bold text-purple-700 block mb-1">
                      Part 1 (stays Q{targetQuestion.que})
                    </span>
                    <img src={splitPreviews.top} alt="Top" className="max-h-32 object-contain" />
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-500">
                    <span className="text-[10px] font-bold text-indigo-700 block mb-1">
                      Part 2 (inserted as Q{targetQuestion.que + 1})
                    </span>
                    <img
                      src={splitPreviews.bottom}
                      alt="Bottom"
                      className="max-h-32 object-contain"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleExecuteSplit}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-600/30 transition-all"
              >
                Execute Split & Create Next Question
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={closeAiRepair}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleApplyAiFixes}
            disabled={!analysisResult && !enhancedPreview}
            className="flex items-center gap-1.5 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply AI Repair & Updates</span>
          </button>
        </div>
      </div>
    </div>
  );
};
