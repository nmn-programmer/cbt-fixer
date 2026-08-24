import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCbtStore } from '../store/useCbtStore';
import { fetchWithGeminiFallback } from '../utils/geminiKeyManager';
import { BlueprintSectionRange, QuestionType } from '../types/cbt';
import {
  BookOpen,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sliders,
  X,
  ArrowRight,
  Zap,
  Check,
  Loader2,
  Copy,
  Info,
} from 'lucide-react';
import { generateId } from '../utils/constants';
import { getPdfjsLib } from '../utils/pdfWorkerConfig';

const PRESET_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  badge: string;
  ranges: Omit<BlueprintSectionRange, 'id'>[];
}[] = [
  {
    id: 'user_3_subject_24q',
    name: '3 Subjects (Q1-24: 8 Qs Each)',
    description: 'Physics (Q1–8), Chemistry (Q9–16), Mathematics (Q17–24) • +4/-1',
    badge: '24 Qs • Standard',
    ranges: [
      {
        subjectName: 'Physics',
        sectionName: 'Physics - Section 1',
        fromQNo: 1,
        toQNo: 8,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Chemistry - Section 1',
        fromQNo: 9,
        toQNo: 16,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Mathematics - Section 1',
        fromQNo: 17,
        toQNo: 24,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
    ],
  },
  {
    id: 'jee_main_75q',
    name: 'JEE Main (75 Qs Pattern)',
    description: 'Physics (Q1–25: 20 MCQ, 5 NAT), Chemistry (Q26–50), Maths (Q51–75)',
    badge: '75 Qs • JEE Main',
    ranges: [
      {
        subjectName: 'Physics',
        sectionName: 'Section 1 (MCQ)',
        fromQNo: 1,
        toQNo: 20,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Physics',
        sectionName: 'Section 2 (NAT)',
        fromQNo: 21,
        toQNo: 25,
        type: 'nat',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Section 1 (MCQ)',
        fromQNo: 26,
        toQNo: 45,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Section 2 (NAT)',
        fromQNo: 46,
        toQNo: 50,
        type: 'nat',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Section 1 (MCQ)',
        fromQNo: 51,
        toQNo: 70,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Section 2 (NAT)',
        fromQNo: 71,
        toQNo: 75,
        type: 'nat',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
    ],
  },
  {
    id: 'jee_adv_54q',
    name: 'JEE Advanced (54 Qs Multi-Type)',
    description: 'Physics (Q1–18: MSQ/MCQ/NAT), Chemistry (Q19–36), Maths (Q37–54)',
    badge: '54 Qs • JEE Adv',
    ranges: [
      {
        subjectName: 'Physics',
        sectionName: 'Sec 1: One or More Correct',
        fromQNo: 1,
        toQNo: 6,
        type: 'msq',
        marks: { cm: 4, im: -2, pm: 1, max: 4 },
      },
      {
        subjectName: 'Physics',
        sectionName: 'Sec 2: Single Correct',
        fromQNo: 7,
        toQNo: 12,
        type: 'mcq',
        marks: { cm: 3, im: -1, pm: 0, max: 3 },
      },
      {
        subjectName: 'Physics',
        sectionName: 'Sec 3: Numerical Value',
        fromQNo: 13,
        toQNo: 18,
        type: 'nat',
        marks: { cm: 4, im: 0, pm: 0, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Sec 1: One or More Correct',
        fromQNo: 19,
        toQNo: 24,
        type: 'msq',
        marks: { cm: 4, im: -2, pm: 1, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Sec 2: Single Correct',
        fromQNo: 25,
        toQNo: 30,
        type: 'mcq',
        marks: { cm: 3, im: -1, pm: 0, max: 3 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Sec 3: Numerical Value',
        fromQNo: 31,
        toQNo: 36,
        type: 'nat',
        marks: { cm: 4, im: 0, pm: 0, max: 4 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Sec 1: One or More Correct',
        fromQNo: 37,
        toQNo: 42,
        type: 'msq',
        marks: { cm: 4, im: -2, pm: 1, max: 4 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Sec 2: Single Correct',
        fromQNo: 43,
        toQNo: 48,
        type: 'mcq',
        marks: { cm: 3, im: -1, pm: 0, max: 3 },
      },
      {
        subjectName: 'Mathematics',
        sectionName: 'Sec 3: Numerical Value',
        fromQNo: 49,
        toQNo: 54,
        type: 'nat',
        marks: { cm: 4, im: 0, pm: 0, max: 4 },
      },
    ],
  },
  {
    id: 'neet_180q',
    name: 'NEET Pattern (180 Qs)',
    description: 'Physics (Q1–45), Chemistry (Q46–90), Botany (Q91–135), Zoology (Q136–180)',
    badge: '180 Qs • NEET',
    ranges: [
      {
        subjectName: 'Physics',
        sectionName: 'Physics Section',
        fromQNo: 1,
        toQNo: 45,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Chemistry',
        sectionName: 'Chemistry Section',
        fromQNo: 46,
        toQNo: 90,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Botany',
        sectionName: 'Botany Section',
        fromQNo: 91,
        toQNo: 135,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
      {
        subjectName: 'Zoology',
        sectionName: 'Zoology Section',
        fromQNo: 136,
        toQNo: 180,
        type: 'mcq',
        marks: { cm: 4, im: -1, pm: 0, max: 4 },
      },
    ],
  },
];

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Physics: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/40' },
  Chemistry: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  Mathematics: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  Maths: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  Biology: { bg: 'bg-teal-500/20', text: 'text-teal-300', border: 'border-teal-500/40' },
  Botany: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/40' },
  Zoology: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/40' },
  General: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40' },
};

export const BlueprintRangeStudioModal: React.FC = () => {
  const {
    isBlueprintModalOpen,
    setBlueprintModalOpen,
    archives,
    activeArchiveId,
    applyBlueprintRangesToActiveArchive,
    geminiApiKey,
    addToast,
    refreshUsageMetrics,
  } = useCbtStore();

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Calculate existing question count and current subject breakdown
  const existingQuestions = useMemo(() => {
    if (!activeArchive) return [];
    const list: { id: string; que: number; key: string; subject: string; section: string }[] = [];
    activeArchive.subjects.forEach((sub) => {
      sub.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          list.push({
            id: q.id,
            que: q.que || 1,
            key: q.key,
            subject: sub.name,
            section: sec.name,
          });
        });
      });
    });
    return list.sort((a, b) => a.que - b.que);
  }, [activeArchive]);

  const totalPaperQuestions = existingQuestions.length || 24;

  const [ranges, setRanges] = useState<BlueprintSectionRange[]>([]);
  const [testTitle, setTestTitle] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [totalMarks, setTotalMarks] = useState<number>(96);
  const [rawInstructionsText, setRawInstructionsText] = useState<string>('');
  const [isScanningAi, setIsScanningAi] = useState<boolean>(false);
  const [aiScanStatus, setAiScanStatus] = useState<string>('');
  const [instructionMarkingSummary, setInstructionMarkingSummary] = useState<string>('');
  const [hasInstructedMarkingScheme, setHasInstructedMarkingScheme] = useState<boolean>(false);
  const [defaultMarkingScheme, setDefaultMarkingScheme] = useState<{ cm: number; im: number; pm?: number; max?: number }>({ cm: 4, im: -1, pm: 0, max: 4 });
  const [activeTab, setActiveTab] = useState<'editor' | 'ai_scanner' | 'presets'>('editor');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize ranges from active archive or default 3-subject pattern
  useEffect(() => {
    if (!isBlueprintModalOpen) return;

    if (activeArchive) {
      setTestTitle(activeArchive.title || activeArchive.metadata?.testTitle || 'Test Paper');
      if (activeArchive.metadata?.durationMinutes) {
        setDurationMinutes(Number(activeArchive.metadata.durationMinutes));
      }
      if (activeArchive.metadata?.totalMarks) {
        setTotalMarks(Number(activeArchive.metadata.totalMarks));
      }

      // Try to reconstruct ranges from active archive's sections
      const extractedRanges: BlueprintSectionRange[] = [];
      activeArchive.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          if (sec.questions.length > 0) {
            const minQ = Math.min(...sec.questions.map((q) => q.que || 1));
            const maxQ = Math.max(...sec.questions.map((q) => q.que || 1));
            const sampleQ = sec.questions[0];
            extractedRanges.push({
              id: generateId(),
              subjectName: sub.name,
              sectionName: sec.name,
              fromQNo: minQ,
              toQNo: maxQ,
              type: sampleQ?.type || 'mcq',
              marks: sampleQ?.marks || { cm: 4, im: -1, pm: 0, max: 4 },
            });
          }
        });
      });

      if (extractedRanges.length > 0) {
        setRanges(extractedRanges.sort((a, b) => a.fromQNo - b.fromQNo));
      } else {
        // Fallback to standard 3-subject preset
        loadPreset(PRESET_TEMPLATES[0].id);
      }
    } else {
      loadPreset(PRESET_TEMPLATES[0].id);
    }
  }, [isBlueprintModalOpen, activeArchive]);

  const loadPreset = (presetId: string) => {
    const p = PRESET_TEMPLATES.find((t) => t.id === presetId);
    if (!p) return;
    const newRanges: BlueprintSectionRange[] = p.ranges.map((r) => ({
      ...r,
      id: generateId(),
    }));
    setRanges(newRanges);
  };

  const handleAddRange = () => {
    const lastRange = ranges[ranges.length - 1];
    const nextStart = lastRange ? lastRange.toQNo + 1 : 1;
    const newRange: BlueprintSectionRange = {
      id: generateId(),
      subjectName: lastRange?.subjectName || 'Physics',
      sectionName: `Section ${ranges.length + 1}`,
      fromQNo: nextStart,
      toQNo: nextStart + 7,
      type: 'mcq',
      marks: { cm: 4, im: -1, pm: 0, max: 4 },
    };
    setRanges([...ranges, newRange]);
  };

  const handleUpdateRange = (id: string, updates: Partial<BlueprintSectionRange>) => {
    setRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleDeleteRange = (id: string) => {
    setRanges((prev) => prev.filter((r) => r.id !== id));
  };

  // Validation: compute coverage & identify gaps/overlaps
  const coverageAnalysis = useMemo(() => {
    const coveredMap = new Map<number, { count: number; subjects: string[] }>();
    const maxQ = Math.max(
      totalPaperQuestions,
      ...ranges.map((r) => r.toQNo || 0)
    );

    ranges.forEach((r) => {
      for (let q = r.fromQNo; q <= r.toQNo; q++) {
        const entry = coveredMap.get(q) || { count: 0, subjects: [] };
        entry.count += 1;
        if (!entry.subjects.includes(r.subjectName)) entry.subjects.push(r.subjectName);
        coveredMap.set(q, entry);
      }
    });

    const gaps: number[] = [];
    const overlaps: { q: number; subjects: string[] }[] = [];

    for (let q = 1; q <= maxQ; q++) {
      const entry = coveredMap.get(q);
      if (!entry || entry.count === 0) {
        gaps.push(q);
      } else if (entry.count > 1) {
        overlaps.push({ q, subjects: entry.subjects });
      }
    }

    return { maxQ, coveredMap, gaps, overlaps };
  }, [ranges, totalPaperQuestions]);

  const handleScanInstructionsAi = async (imageFile?: File) => {
    try {
      setIsScanningAi(true);
      setAiScanStatus('Reading instruction content...');

      let base64Image = '';
      if (imageFile) {
        if (imageFile.type.includes('pdf') || imageFile.name.endsWith('.pdf')) {
          const pdfjsLib = await getPdfjsLib();
          const arrayBuffer = await imageFile.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context error');

          await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
          base64Image = canvas.toDataURL('image/jpeg', 0.9);
        } else {
          base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
        }
      }

      setAiScanStatus('Gemini Vision is analyzing General Instructions & question ranges...');

      const res = await fetchWithGeminiFallback(
        '/api/extract-test-blueprint',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image || undefined,
            text: rawInstructionsText.trim() || undefined,
          }),
        },
        addToast,
        refreshUsageMetrics
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${res.status}`);
      }

      const data = await res.json();

      if (data.testTitle) setTestTitle(data.testTitle);
      if (data.durationMinutes) setDurationMinutes(data.durationMinutes);
      if (data.totalMarks) setTotalMarks(data.totalMarks);
      if (data.markingSchemeSummary) setInstructionMarkingSummary(data.markingSchemeSummary);
      if (data.hasInstructedMarkingScheme) setHasInstructedMarkingScheme(true);
      if (data.defaultMarkingScheme) {
        setDefaultMarkingScheme({
          cm: Number(data.defaultMarkingScheme.cm) || 4,
          im: Number(data.defaultMarkingScheme.im) || -1,
          pm: Number(data.defaultMarkingScheme.pm) || 0,
          max: Number(data.defaultMarkingScheme.max) || 4,
        });
      }

      if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
        const newParsedRanges: BlueprintSectionRange[] = data.sections.map((s: any) => ({
          id: generateId(),
          subjectName: s.subjectName || 'General',
          sectionName: s.sectionName || `${s.subjectName} Section`,
          fromQNo: Number(s.fromQNo) || 1,
          toQNo: Number(s.toQNo) || Number(s.fromQNo) || 1,
          type: (s.type || 'mcq').toLowerCase() as QuestionType,
          marks: {
            cm: Number(s.marks?.cm) || 4,
            im: Number(s.marks?.im) || -1,
            pm: Number(s.marks?.pm) || 0,
            max: Number(s.marks?.max) || 4,
          },
        }));

        setRanges(newParsedRanges.sort((a, b) => a.fromQNo - b.fromQNo));
        setActiveTab('editor');
        addToast({
          title: 'Blueprint Parsed',
          description: `Successfully parsed ${newParsedRanges.length} section ranges & marking scheme from instructions!`,
          type: 'success',
        });
      } else {
        throw new Error('No structured section ranges were found in the provided instructions.');
      }
    } catch (err: any) {
      console.warn('Notice scanning instructions:', err?.message || err);
      addToast({
        title: 'AI Blueprint Scan Notice',
        description: err.message || 'Unable to scan instructions page.',
        type: 'warning',
      });
    } finally {
      setIsScanningAi(false);
      setAiScanStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyToArchive = () => {
    if (!activeArchive) return;
    if (ranges.length === 0) {
      addToast({
        title: 'Ranges Required',
        description: 'Please add at least one subject range.',
        type: 'warning',
      });
      return;
    }

    applyBlueprintRangesToActiveArchive(ranges, {
      testTitle,
      durationMinutes,
      totalMarks,
      markingScheme: {
        correct: defaultMarkingScheme.cm,
        incorrect: defaultMarkingScheme.im,
        partial: defaultMarkingScheme.pm || 0,
        blank: 0,
      },
      hasInstructedMarkingScheme,
      instructionMarkingSummary,
    });

    setBlueprintModalOpen(false);
  };

  if (!isBlueprintModalOpen) return null;

  return (
    <div
      id="blueprint-studio-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in"
    >
      <div
        id="blueprint-studio-container"
        className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-none">
                  Test Instructions & Subject Range Blueprint
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Strict Allocation
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Map question ranges (e.g. Physics Q1–8, Chem Q9–16, Maths Q17–24) strictly from instructions.
              </p>
            </div>
          </div>

          <button
            onClick={() => setBlueprintModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'editor'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Range & Subject Editor ({ranges.length} Ranges)</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_scanner')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'ai_scanner'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Scan Instructions Page (AI)</span>
          </button>

          <button
            onClick={() => setActiveTab('presets')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'presets'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Exam Presets (JEE / NEET / 24Q)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* TAB 1: RANGE & SUBJECT EDITOR */}
          {activeTab === 'editor' && (
            <div className="space-y-5">
              {/* Top Meta Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Test Booklet Title
                  </label>
                  <input
                    type="text"
                    value={testTitle}
                    onChange={(e) => setTestTitle(e.target.value)}
                    placeholder="e.g. JEE Mock Test 1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Maximum Total Marks
                  </label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value) || 96)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Instructed Booklet Marking Scheme Banner */}
              {hasInstructedMarkingScheme && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-start gap-2.5 text-xs text-emerald-200">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-300">
                        Instructed Booklet Marking Scheme Active
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/30">
                        +{defaultMarkingScheme.cm} / {defaultMarkingScheme.im}
                      </span>
                    </div>
                    {instructionMarkingSummary && (
                      <p className="text-[11px] text-emerald-300/80 mt-1 leading-relaxed">
                        {instructionMarkingSummary}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Visual Question Coverage Ribbon */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" /> Question Number Coverage (Q1 to Q
                    {coverageAnalysis.maxQ})
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Total Active Questions: <strong>{totalPaperQuestions}</strong>
                  </span>
                </div>

                {/* Ribbon Bar */}
                <div className="w-full h-8 bg-slate-900 rounded-lg border border-slate-800 flex overflow-hidden p-0.5 gap-0.5">
                  {ranges.map((r, idx) => {
                    const count = Math.max(1, r.toQNo - r.fromQNo + 1);
                    const widthPct = Math.max(5, (count / coverageAnalysis.maxQ) * 100);
                    const color =
                      SUBJECT_COLORS[r.subjectName] || {
                        bg: 'bg-indigo-500/20',
                        text: 'text-indigo-300',
                        border: 'border-indigo-500/30',
                      };

                    return (
                      <div
                        key={r.id || idx}
                        style={{ width: `${widthPct}%` }}
                        className={`${color.bg} ${color.border} border rounded flex flex-col items-center justify-center px-1 text-[10px] min-w-[50px] transition-all`}
                        title={`${r.subjectName} (${r.sectionName}): Q${r.fromQNo} to Q${r.toQNo}`}
                      >
                        <span className={`font-bold truncate ${color.text}`}>
                          {r.subjectName}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          Q{r.fromQNo}-{r.toQNo}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Diagnostic Alerts for Gaps or Overlaps */}
                {coverageAnalysis.gaps.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      <strong>Warning: Gaps in question sequence.</strong> Unassigned questions:{' '}
                      {coverageAnalysis.gaps.slice(0, 10).join(', ')}
                      {coverageAnalysis.gaps.length > 10 ? '...' : ''} (will be placed in General section).
                    </span>
                  </div>
                )}

                {coverageAnalysis.overlaps.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>
                      <strong>Conflict: Overlapping question numbers.</strong> Questions mapped to multiple
                      ranges: Q{coverageAnalysis.overlaps.map((o) => o.q).slice(0, 8).join(', ')}.
                    </span>
                  </div>
                )}
              </div>

              {/* Range Editor Cards / Rows */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Subject & Section Range Map ({ranges.length} Ranges)
                  </h3>
                  <button
                    onClick={handleAddRange}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Section Range</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {ranges.map((range, index) => {
                    const color =
                      SUBJECT_COLORS[range.subjectName] || {
                        bg: 'bg-slate-800',
                        text: 'text-slate-200',
                        border: 'border-slate-700',
                      };

                    return (
                      <div
                        key={range.id}
                        className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                      >
                        {/* Range Index & Subject */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 font-mono font-bold flex items-center justify-center text-[11px] shrink-0">
                            {index + 1}
                          </span>

                          {/* Subject Selector / Input */}
                          <div className="w-32">
                            <input
                              type="text"
                              value={range.subjectName}
                              onChange={(e) =>
                                handleUpdateRange(range.id, { subjectName: e.target.value })
                              }
                              placeholder="Subject"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-100 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>

                          {/* Section Name */}
                          <div className="flex-1 md:w-40">
                            <input
                              type="text"
                              value={range.sectionName}
                              onChange={(e) =>
                                handleUpdateRange(range.id, { sectionName: e.target.value })
                              }
                              placeholder="Section Name"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Range Numbers & Question Type */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                          {/* From - To Range */}
                          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                            <span className="text-[11px] text-slate-400 font-medium">Q.</span>
                            <input
                              type="number"
                              value={range.fromQNo}
                              onChange={(e) =>
                                handleUpdateRange(range.id, {
                                  fromQNo: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                              className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono font-bold text-indigo-400 text-xs"
                            />
                            <span className="text-slate-500 font-bold">to</span>
                            <input
                              type="number"
                              value={range.toQNo}
                              onChange={(e) =>
                                handleUpdateRange(range.id, {
                                  toQNo: Math.max(range.fromQNo, Number(e.target.value) || 1),
                                })
                              }
                              className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono font-bold text-indigo-400 text-xs"
                            />
                          </div>

                          {/* Question Type */}
                          <select
                            value={range.type}
                            onChange={(e) =>
                              handleUpdateRange(range.id, {
                                type: e.target.value as QuestionType,
                              })
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="mcq">Single Correct (MCQ)</option>
                            <option value="msq">One or More Correct (MSQ)</option>
                            <option value="nat">Numerical Value (NAT)</option>
                            <option value="msm">Matrix Match (MSM)</option>
                          </select>

                          {/* Marking Scheme */}
                          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-emerald-400 font-bold">+</span>
                            <input
                              type="number"
                              value={range.marks.cm}
                              onChange={(e) =>
                                handleUpdateRange(range.id, {
                                  marks: { ...range.marks, cm: Number(e.target.value) || 4 },
                                })
                              }
                              className="w-8 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center text-xs text-emerald-400 font-mono font-bold"
                              title="Correct Marks"
                            />
                            <span className="text-[10px] text-rose-400 font-bold">/</span>
                            <input
                              type="number"
                              value={range.marks.im}
                              onChange={(e) =>
                                handleUpdateRange(range.id, {
                                  marks: { ...range.marks, im: Number(e.target.value) || 0 },
                                })
                              }
                              className="w-8 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center text-xs text-rose-400 font-mono font-bold"
                              title="Incorrect Marks (Negative)"
                            />
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteRange(range.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors ml-auto"
                            title="Delete Range"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI SCANNER FOR INSTRUCTIONS PAGE */}
          {activeTab === 'ai_scanner' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      Scan Instructions Cover Page with Gemini Vision
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Upload the instructions/cover page image or PDF, or paste the General Instructions
                      text. AI will automatically parse the subject ranges (e.g. Physics Q1–8, Chemistry
                      Q9–16), total marks, duration, and marking schemes.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Option A: Upload Page */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 rounded-xl border-2 border-dashed border-slate-800 hover:border-purple-500/60 bg-slate-900/50 hover:bg-purple-950/20 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                  >
                    <FileText className="w-8 h-8 text-purple-400 mb-2" />
                    <span className="text-xs font-bold text-slate-200">
                      Upload Instruction Page (PDF / Image)
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Upload Page 1 of test booklet
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleScanInstructionsAi(f);
                      }}
                    />
                  </div>

                  {/* Option B: Paste Instructions Text */}
                  <div className="space-y-2 flex flex-col">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Or Paste General Instructions Text:
                    </label>
                    <textarea
                      value={rawInstructionsText}
                      onChange={(e) => setRawInstructionsText(e.target.value)}
                      placeholder={`General Instructions:
1. The test booklet consists of 24 questions.
2. Subject I (Physics: Q. 1–8), Subject II (Chemistry: Q. 9–16), Subject III (Mathematics: Q. 17–24).
3. Each correct answer gives 4 marks, 1 mark will be deducted for wrong response.`}
                      rows={5}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:border-purple-500 focus:outline-none resize-none flex-1"
                    />
                    <button
                      onClick={() => handleScanInstructionsAi()}
                      disabled={isScanningAi || !rawInstructionsText.trim()}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      {isScanningAi ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isScanningAi ? 'Analyzing Text...' : 'Parse Instructions Text (AI)'}</span>
                    </button>
                  </div>
                </div>

                {isScanningAi && (
                  <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-lg flex items-center gap-3 text-xs text-purple-300 font-mono">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                    <span>{aiScanStatus || 'Processing instruction blueprint...'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: EXAM PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Click any pre-configured template below to instantly load standard question patterns:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRESET_TEMPLATES.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => {
                      loadPreset(preset.id);
                      setActiveTab('editor');
                    }}
                    className="p-4 bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl cursor-pointer transition-all hover:shadow-lg hover:shadow-indigo-950/20 group flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                          {preset.name}
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs text-indigo-400 font-medium">
                      <span>Apply Pattern</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/90">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-500" />
            <span>
              All questions in active paper will be re-grouped according to these exact ranges.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBlueprintModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyToArchive}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Blueprint to Paper</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
