import { create } from 'zustand';
import {
  DiagnosticIssue,
  ImageAttachment,
  MarksScheme,
  PdfDataPart,
  QuestionData,
  QuestionPaperArchive,
  QuestionType,
  SectionData,
  SubjectData,
} from '../types/cbt';
import {
  buildImageFileName,
  generateId,
  MARKING_PRESETS,
} from '../utils/constants';
import {
  autoFixMarkingSchemes,
  autoFixPruneOrphanedImages,
  autoFixRenumberSection,
  autoFixStandardizeFilenames,
  runDiagnostics,
} from '../utils/linter';
import { deleteArchiveFromDB, saveArchiveToDB } from '../utils/indexedDB';
import {
  createCleanSampleArchive,
  createFlawedSampleArchive,
  createJeeAdvChemistrySampleArchive,
} from '../utils/sampleData';
import {
  applyClassificationToArchive,
  ClassificationReport,
} from '../utils/answerKeyManager';

interface HistoryEntry {
  archive: QuestionPaperArchive;
  actionLabel: string;
  timestamp: number;
}

interface CbtStoreState {
  // Archives & Active Workspace
  archives: QuestionPaperArchive[];
  activeArchiveId: string | null;
  selectedSubjectId: string | null;
  selectedSectionId: string | null;
  selectedQuestionId: string | null;

  // Diagnostics & Linter
  diagnostics: DiagnosticIssue[];
  isDiagnosticsOpen: boolean;

  // Search & Filter
  searchTerm: string;
  filterType: string; // 'all' | 'errors' | 'warnings' | 'mcq' | 'msq' | 'nat' | 'msm' | 'flagged'

  // Modals & Panels
  isAnswerKeyModalOpen: boolean;
  isBulkModalOpen: boolean;
  isExportModalOpen: boolean;
  isCbtSimulatorOpen: boolean;
  isMobileSidebarOpen: boolean;
  theme: 'dark' | 'light' | 'cbt-high-contrast';

  // History / Undo / Redo
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Action methods
  setActiveArchive: (archiveId: string) => void;
  addArchive: (archive: QuestionPaperArchive, makeActive?: boolean) => void;
  closeArchive: (archiveId: string) => void;
  reorderArchives: (fromIndex: number, toIndex: number) => void;
  closeOtherArchives: (archiveId: string) => void;
  closeTabsToRight: (archiveId: string) => void;
  closeAllArchives: () => void;
  createNewPaper: (title?: string) => void;
  loadSample: (type: 'flawed' | 'clean' | 'chemistry_adv') => void;

  // Answer Key & Classification
  setAnswerKeyModalOpen: (open: boolean) => void;
  applyAnswerKeyClassification: (report: ClassificationReport, updateMarks?: boolean) => void;
  clearAllAnswersInActiveArchive: () => void;

  // Navigation
  selectQuestion: (subjectId: string, sectionId: string, questionId: string) => void;
  selectNextQuestion: () => void;
  selectPrevQuestion: () => void;
  jumpToDiagnostic: (issue: DiagnosticIssue) => void;

  // Question Manipulations
  updateQuestion: (
    questionId: string,
    updater: Partial<QuestionData>,
    actionLabel?: string
  ) => void;
  applyMarkingPreset: (questionId: string, presetId: string) => void;
  addQuestion: (sectionId: string, type?: QuestionType) => void;
  deleteQuestion: (questionId: string) => void;
  duplicateQuestion: (questionId: string) => void;
  moveQuestion: (questionId: string, direction: 'up' | 'down') => void;
  reassignQuestionSection: (questionId: string, targetSectionId: string) => void;
  moveQuestionAcrossArchives: (
    questionId: string,
    targetArchiveId: string,
    targetSectionId: string
  ) => void;

  // Section & Subject Manipulations
  addSection: (subjectId: string, name?: string) => void;
  renameSection: (sectionId: string, newName: string) => void;
  deleteSection: (sectionId: string) => void;
  moveSection: (sectionId: string, direction: 'up' | 'down') => void;
  addSubject: (name?: string) => void;
  renameSubject: (subjectId: string, newName: string) => void;
  deleteSubject: (subjectId: string) => void;
  moveSubject: (subjectId: string, direction: 'up' | 'down') => void;

  // Multi-Part Image Operations
  addImagePart: (questionId: string, file: File) => Promise<void>;
  replaceImagePart: (questionId: string, partIndex: number, file: File) => Promise<void>;
  deleteImagePart: (questionId: string, partIndex: number) => void;
  reorderImageParts: (questionId: string, fromIndex: number, toIndex: number) => void;

  // Auto-Fix & Bulk Operations
  runLinter: () => void;
  fixRenumberSection: (sectionId?: string) => void;
  fixPruneOrphaned: () => void;
  fixStandardizeFilenames: () => void;
  fixMarkingSchemes: () => void;
  bulkApplyMarkingScheme: (sectionIds: string[], presetId: string) => void;
  bulkRenumberPaper: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Modals & UI Toggles
  setDiagnosticsOpen: (open: boolean) => void;
  setBulkModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setCbtSimulatorOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  setFilterType: (filter: string) => void;
  setTheme: (theme: 'dark' | 'light' | 'cbt-high-contrast') => void;
}

export const useCbtStore = create<CbtStoreState>((set, get) => {
  // Helper to commit an immutable archive update with undo/redo snapshot
  function commitArchiveUpdate(
    newArchive: QuestionPaperArchive,
    actionLabel: string = 'Edit Paper'
  ) {
    const state = get();
    const currentActive = state.archives.find((a) => a.id === state.activeArchiveId);

    if (!currentActive) return;

    // Snapshot current state for Undo
    const historyEntry: HistoryEntry = {
      archive: currentActive,
      actionLabel,
      timestamp: Date.now(),
    };

    const newPast = [...state.past.slice(-40), historyEntry];
    const newArchives = state.archives.map((a) =>
      a.id === newArchive.id ? { ...newArchive, isDirty: true, lastModified: Date.now() } : a
    );

    // Re-run diagnostics on active
    const newDiagnostics = runDiagnostics(newArchive);

    set({
      archives: newArchives,
      past: newPast,
      future: [], // Clear redo stack on new action
      diagnostics: newDiagnostics,
    });

    // Auto-save to IndexedDB in background
    saveArchiveToDB(newArchive);
  }

  return {
    archives: [],
    activeArchiveId: null,
    selectedSubjectId: null,
    selectedSectionId: null,
    selectedQuestionId: null,

    diagnostics: [],
    isDiagnosticsOpen: false,

    searchTerm: '',
    filterType: 'all',

    isAnswerKeyModalOpen: false,
    isBulkModalOpen: false,
    isExportModalOpen: false,
    isCbtSimulatorOpen: false,
    isMobileSidebarOpen: false,
    theme: 'dark',

    past: [],
    future: [],

    setAnswerKeyModalOpen: (open: boolean) => set({ isAnswerKeyModalOpen: open }),

    applyAnswerKeyClassification: (report: ClassificationReport, updateMarks: boolean = true) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updated = applyClassificationToArchive(active, report, updateMarks);
      commitArchiveUpdate(updated, `Apply Answer Key (${report.matchedCount} questions)`);
    },

    clearAllAnswersInActiveArchive: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => ({
            ...q,
            answerOptions: '',
          })),
        })),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Clear All Question Answers');
    },

    setActiveArchive: (archiveId: string) => {
      const state = get();
      const target = state.archives.find((a) => a.id === archiveId);
      if (!target) return;

      const firstSubject = target.subjects[0];
      const firstSection = firstSubject?.sections[0];
      const firstQuestion = firstSection?.questions[0];

      const diagnostics = runDiagnostics(target);

      set({
        activeArchiveId: archiveId,
        selectedSubjectId: firstSubject?.id || null,
        selectedSectionId: firstSection?.id || null,
        selectedQuestionId: firstQuestion?.id || null,
        diagnostics,
        past: [],
        future: [],
      });
    },

    addArchive: (archive: QuestionPaperArchive, makeActive: boolean = true) => {
      const state = get();
      // Avoid duplicate IDs
      const filtered = state.archives.filter((a) => a.id !== archive.id);
      const newArchives = [...filtered, archive];

      saveArchiveToDB(archive);

      if (makeActive) {
        const firstSubject = archive.subjects[0];
        const firstSection = firstSubject?.sections[0];
        const firstQuestion = firstSection?.questions[0];
        const diagnostics = runDiagnostics(archive);

        set({
          archives: newArchives,
          activeArchiveId: archive.id,
          selectedSubjectId: firstSubject?.id || null,
          selectedSectionId: firstSection?.id || null,
          selectedQuestionId: firstQuestion?.id || null,
          diagnostics,
          past: [],
          future: [],
        });
      } else {
        set({ archives: newArchives });
      }
    },

    closeArchive: (archiveId: string) => {
      const state = get();
      const newArchives = state.archives.filter((a) => a.id !== archiveId);
      deleteArchiveFromDB(archiveId);

      if (state.activeArchiveId === archiveId) {
        const nextArchive = newArchives[0] || null;
        if (nextArchive) {
          const firstSubject = nextArchive.subjects[0];
          const firstSection = firstSubject?.sections[0];
          const firstQuestion = firstSection?.questions[0];
          const diagnostics = runDiagnostics(nextArchive);

          set({
            archives: newArchives,
            activeArchiveId: nextArchive.id,
            selectedSubjectId: firstSubject?.id || null,
            selectedSectionId: firstSection?.id || null,
            selectedQuestionId: firstQuestion?.id || null,
            diagnostics,
            past: [],
            future: [],
          });
        } else {
          set({
            archives: [],
            activeArchiveId: null,
            selectedSubjectId: null,
            selectedSectionId: null,
            selectedQuestionId: null,
            diagnostics: [],
            past: [],
            future: [],
          });
        }
      } else {
        set({ archives: newArchives });
      }
    },

    reorderArchives: (fromIndex: number, toIndex: number) => {
      const state = get();
      if (
        fromIndex < 0 ||
        fromIndex >= state.archives.length ||
        toIndex < 0 ||
        toIndex >= state.archives.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const updated = [...state.archives];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      set({ archives: updated });
    },

    closeOtherArchives: (archiveId: string) => {
      const state = get();
      const target = state.archives.find((a) => a.id === archiveId);
      if (!target) return;

      const toRemove = state.archives.filter((a) => a.id !== archiveId);
      toRemove.forEach((a) => deleteArchiveFromDB(a.id));

      const firstSubject = target.subjects[0];
      const firstSection = firstSubject?.sections[0];
      const firstQuestion = firstSection?.questions[0];

      set({
        archives: [target],
        activeArchiveId: archiveId,
        selectedSubjectId: firstSubject?.id || null,
        selectedSectionId: firstSection?.id || null,
        selectedQuestionId: firstQuestion?.id || null,
        diagnostics: runDiagnostics(target),
        past: [],
        future: [],
      });
    },

    closeTabsToRight: (archiveId: string) => {
      const state = get();
      const index = state.archives.findIndex((a) => a.id === archiveId);
      if (index === -1) return;

      const kept = state.archives.slice(0, index + 1);
      const removed = state.archives.slice(index + 1);
      removed.forEach((a) => deleteArchiveFromDB(a.id));

      let activeId = state.activeArchiveId;
      if (!kept.some((a) => a.id === activeId)) {
        activeId = archiveId;
      }

      const activeArc = kept.find((a) => a.id === activeId) || kept[0];
      const firstSubject = activeArc?.subjects[0];
      const firstSection = firstSubject?.sections[0];
      const firstQuestion = firstSection?.questions[0];

      set({
        archives: kept,
        activeArchiveId: activeArc ? activeArc.id : null,
        selectedSubjectId: firstSubject?.id || null,
        selectedSectionId: firstSection?.id || null,
        selectedQuestionId: firstQuestion?.id || null,
        diagnostics: activeArc ? runDiagnostics(activeArc) : [],
      });
    },

    closeAllArchives: () => {
      const state = get();
      state.archives.forEach((a) => deleteArchiveFromDB(a.id));
      set({
        archives: [],
        activeArchiveId: null,
        selectedSubjectId: null,
        selectedSectionId: null,
        selectedQuestionId: null,
        diagnostics: [],
        past: [],
        future: [],
      });
    },

    createNewPaper: (title: string = 'New CBT Question Paper') => {
      const subjectId = generateId();
      const sectionId = generateId();
      const qId = generateId();

      const newArchive: QuestionPaperArchive = {
        id: generateId(),
        fileName: 'Untitled_Paper.zip',
        title,
        format: 'pdfCropper',
        metadata: {
          appVersion: '2.6.0',
          generatedBy: 'CBTQuestionPaperStudio',
          createdAt: new Date().toISOString(),
        },
        subjects: [
          {
            id: subjectId,
            name: 'Physics',
            sections: [
              {
                id: sectionId,
                name: 'Physics Section 1',
                questions: [
                  {
                    id: qId,
                    key: '1',
                    que: 1,
                    type: 'mcq',
                    marks: { cm: 4, im: -1, pm: 0, max: 4 },
                    answerOptions: '1',
                    pdfData: [],
                    images: [],
                  },
                ],
              },
            ],
          },
        ],
        rawFiles: new Map(),
        isDirty: true,
        lastModified: Date.now(),
      };

      get().addArchive(newArchive, true);
    },

    loadSample: (type: 'flawed' | 'clean' | 'chemistry_adv') => {
      let sample;
      if (type === 'flawed') {
        sample = createFlawedSampleArchive();
      } else if (type === 'chemistry_adv') {
        sample = createJeeAdvChemistrySampleArchive();
      } else {
        sample = createCleanSampleArchive();
      }
      get().addArchive(sample, true);
    },

    selectQuestion: (subjectId: string, sectionId: string, questionId: string) => {
      set({
        selectedSubjectId: subjectId,
        selectedSectionId: sectionId,
        selectedQuestionId: questionId,
      });
    },

    selectNextQuestion: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const flatQuestions: Array<{ subId: string; secId: string; q: QuestionData }> = [];
      active.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            flatQuestions.push({ subId: sub.id, secId: sec.id, q });
          });
        });
      });

      const currentIndex = flatQuestions.findIndex((item) => item.q.id === state.selectedQuestionId);
      if (currentIndex !== -1 && currentIndex < flatQuestions.length - 1) {
        const next = flatQuestions[currentIndex + 1];
        set({
          selectedSubjectId: next.subId,
          selectedSectionId: next.secId,
          selectedQuestionId: next.q.id,
        });
      }
    },

    selectPrevQuestion: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const flatQuestions: Array<{ subId: string; secId: string; q: QuestionData }> = [];
      active.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            flatQuestions.push({ subId: sub.id, secId: sec.id, q });
          });
        });
      });

      const currentIndex = flatQuestions.findIndex((item) => item.q.id === state.selectedQuestionId);
      if (currentIndex > 0) {
        const prev = flatQuestions[currentIndex - 1];
        set({
          selectedSubjectId: prev.subId,
          selectedSectionId: prev.secId,
          selectedQuestionId: prev.q.id,
        });
      }
    },

    jumpToDiagnostic: (issue: DiagnosticIssue) => {
      const loc = issue.location;
      const state = get();

      // If issue belongs to different archive, switch active tab
      if (loc.archiveId && loc.archiveId !== state.activeArchiveId) {
        state.setActiveArchive(loc.archiveId);
      }

      set((curr) => ({
        selectedSubjectId: loc.subjectId || curr.selectedSubjectId,
        selectedSectionId: loc.sectionId || curr.selectedSectionId,
        selectedQuestionId: loc.questionId || curr.selectedQuestionId,
        isDiagnosticsOpen: false, // Close drawer on jump for focused editing
      }));
    },

    updateQuestion: (
      questionId: string,
      updater: Partial<QuestionData>,
      actionLabel: string = 'Update Question'
    ) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id === questionId) {
              const updated = { ...q, ...updater };
              // If question number changed, update key if needed
              if (updater.que !== undefined) {
                updated.key = String(updater.que);
              }
              return updated;
            }
            return q;
          }),
        })),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, actionLabel);
    },

    applyMarkingPreset: (questionId: string, presetId: string) => {
      const preset = MARKING_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      get().updateQuestion(
        questionId,
        {
          type: preset.type,
          marks: { ...preset.marks },
        },
        `Apply Preset: ${preset.name}`
      );
    },

    addQuestion: (sectionId: string, type: QuestionType = 'mcq') => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      let newQId = generateId();
      let parentSubId = '';

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          if (sec.id === sectionId) {
            parentSubId = sub.id;
            const maxQue = sec.questions.reduce((max, q) => Math.max(max, q.que), 0);
            const nextQue = maxQue + 1;
            const defaultMarks: MarksScheme =
              type === 'msq'
                ? { cm: 4, im: -2, pm: 1, max: 4 }
                : type === 'msm'
                ? { cm: 3, im: -1, pm: 1, max: 12 }
                : { cm: 4, im: -1, pm: 0, max: 4 };

            const newQuestion: QuestionData = {
              id: newQId,
              key: String(nextQue),
              que: nextQue,
              type,
              marks: defaultMarks,
              answerOptions: '',
              pdfData: [],
              images: [],
            };

            return {
              ...sec,
              questions: [...sec.questions, newQuestion],
            };
          }
          return sec;
        }),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Add Question');
      set({
        selectedSubjectId: parentSubId || state.selectedSubjectId,
        selectedSectionId: sectionId,
        selectedQuestionId: newQId,
      });
    },

    deleteQuestion: (questionId: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      let nextFocusQId: string | null = null;
      let nextSubId: string | null = null;
      let nextSecId: string | null = null;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          const qIndex = sec.questions.findIndex((q) => q.id === questionId);
          if (qIndex !== -1) {
            nextSubId = sub.id;
            nextSecId = sec.id;
            const filtered = sec.questions.filter((q) => q.id !== questionId);
            if (filtered.length > 0) {
              const targetIdx = Math.min(qIndex, filtered.length - 1);
              nextFocusQId = filtered[targetIdx].id;
            }
            return { ...sec, questions: filtered };
          }
          return sec;
        }),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Delete Question');

      if (nextFocusQId) {
        set({
          selectedSubjectId: nextSubId || state.selectedSubjectId,
          selectedSectionId: nextSecId || state.selectedSectionId,
          selectedQuestionId: nextFocusQId,
        });
      }
    },

    duplicateQuestion: (questionId: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      let duplicatedQId = generateId();
      let parentSubId = '';
      let parentSecId = '';

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          const targetIndex = sec.questions.findIndex((q) => q.id === questionId);
          if (targetIndex !== -1) {
            parentSubId = sub.id;
            parentSecId = sec.id;
            const targetQ = sec.questions[targetIndex];
            const maxQue = sec.questions.reduce((m, q) => Math.max(m, q.que), 0);
            const newQue = maxQue + 1;

            const cloned: QuestionData = {
              ...targetQ,
              id: duplicatedQId,
              key: `${newQue}`,
              que: newQue,
              images: [...targetQ.images],
              pdfData: [...targetQ.pdfData],
            };

            const updatedList = [...sec.questions];
            updatedList.splice(targetIndex + 1, 0, cloned);
            return { ...sec, questions: updatedList };
          }
          return sec;
        }),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Duplicate Question');
      set({
        selectedSubjectId: parentSubId,
        selectedSectionId: parentSecId,
        selectedQuestionId: duplicatedQId,
      });
    },

    moveQuestion: (questionId: string, direction: 'up' | 'down') => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          const idx = sec.questions.findIndex((q) => q.id === questionId);
          if (idx === -1) return sec;

          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= sec.questions.length) return sec;

          const list = [...sec.questions];
          const temp = list[idx];
          list[idx] = list[targetIdx];
          list[targetIdx] = temp;

          return { ...sec, questions: list };
        }),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, `Move Question ${direction}`);
    },

    reassignQuestionSection: (questionId: string, targetSectionId: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      let targetQuestion: QuestionData | null = null;
      let targetSubId: string | null = null;

      // 1. Extract question from current section
      const cleanedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          const foundQ = sec.questions.find((q) => q.id === questionId);
          if (foundQ) {
            targetQuestion = foundQ;
            return {
              ...sec,
              questions: sec.questions.filter((q) => q.id !== questionId),
            };
          }
          return sec;
        }),
      }));

      if (!targetQuestion) return;

      // 2. Insert into destination section
      const updatedSubjects = cleanedSubjects.map((sub) => {
        const hasTarget = sub.sections.some((sec) => sec.id === targetSectionId);
        if (hasTarget) {
          targetSubId = sub.id;
          return {
            ...sub,
            sections: sub.sections.map((sec) => {
              if (sec.id === targetSectionId) {
                return {
                  ...sec,
                  questions: [...sec.questions, targetQuestion!],
                };
              }
              return sec;
            }),
          };
        }
        return sub;
      });

      const updatedArchive = { ...active, subjects: updatedSubjects };
      commitArchiveUpdate(updatedArchive, 'Reassign Question Section');

      set({
        selectedSubjectId: targetSubId || state.selectedSubjectId,
        selectedSectionId: targetSectionId,
        selectedQuestionId: questionId,
      });
    },

    moveQuestionAcrossArchives: (
      questionId: string,
      targetArchiveId: string,
      targetSectionId: string
    ) => {
      const state = get();
      const sourceArchive = state.archives.find((a) => a.id === state.activeArchiveId);
      const targetArchive = state.archives.find((a) => a.id === targetArchiveId);
      if (!sourceArchive || !targetArchive) return;

      // If same archive, reuse standard reassign
      if (sourceArchive.id === targetArchive.id) {
        get().reassignQuestionSection(questionId, targetSectionId);
        return;
      }

      let questionToMove: QuestionData | null = null;
      let sourceSubjectId: string | null = null;

      // 1. Remove question from source archive
      const updatedSourceSubjects = sourceArchive.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          const found = sec.questions.find((q) => q.id === questionId);
          if (found) {
            questionToMove = found;
            sourceSubjectId = sub.id;
            return {
              ...sec,
              questions: sec.questions.filter((q) => q.id !== questionId),
            };
          }
          return sec;
        }),
      }));

      if (!questionToMove) return;

      // Transfer rawFiles from source rawFiles Map to target rawFiles Map
      const targetRawFiles = new Map(targetArchive.rawFiles);
      (questionToMove as QuestionData).images.forEach((img) => {
        const fileEntry = sourceArchive.rawFiles.get(img.fileName);
        if (fileEntry) {
          targetRawFiles.set(img.fileName, fileEntry);
        }
      });

      // 2. Add question to target archive's destination section
      let targetSubjectId: string | null = null;
      const updatedTargetSubjects = targetArchive.subjects.map((sub) => {
        const hasTarget = sub.sections.some((sec) => sec.id === targetSectionId);
        if (hasTarget) {
          targetSubjectId = sub.id;
          return {
            ...sub,
            sections: sub.sections.map((sec) => {
              if (sec.id === targetSectionId) {
                const maxQue = sec.questions.reduce((m, q) => Math.max(m, q.que || 0), 0);
                const nextQue = (questionToMove as QuestionData).que > maxQue
                  ? (questionToMove as QuestionData).que
                  : maxQue + 1;
                const movedQuestion: QuestionData = {
                  ...(questionToMove as QuestionData),
                  que: nextQue,
                  key: String(nextQue),
                };
                return {
                  ...sec,
                  questions: [...sec.questions, movedQuestion],
                };
              }
              return sec;
            }),
          };
        }
        return sub;
      });

      const finalSourceArchive: QuestionPaperArchive = {
        ...sourceArchive,
        subjects: updatedSourceSubjects,
        isDirty: true,
        lastModified: Date.now(),
      };

      const finalTargetArchive: QuestionPaperArchive = {
        ...targetArchive,
        subjects: updatedTargetSubjects,
        rawFiles: targetRawFiles,
        isDirty: true,
        lastModified: Date.now(),
      };

      const updatedArchives = state.archives.map((a) => {
        if (a.id === sourceArchive.id) return finalSourceArchive;
        if (a.id === targetArchive.id) return finalTargetArchive;
        return a;
      });

      const historyEntry: HistoryEntry = {
        archive: targetArchive,
        actionLabel: `Move Question to ${targetArchive.fileName}`,
        timestamp: Date.now(),
      };

      set((curr) => ({
        archives: updatedArchives,
        activeArchiveId: targetArchive.id,
        selectedSubjectId: targetSubjectId || curr.selectedSubjectId,
        selectedSectionId: targetSectionId,
        selectedQuestionId: questionId,
        past: [...curr.past.slice(-40), historyEntry],
        future: [],
        diagnostics: runDiagnostics(finalTargetArchive),
      }));

      saveArchiveToDB(finalSourceArchive);
      saveArchiveToDB(finalTargetArchive);
    },

    addSection: (subjectId: string, name?: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const newSecId = generateId();
      const newQId = generateId();

      const updatedSubjects = active.subjects.map((sub) => {
        if (sub.id === subjectId) {
          const secCount = sub.sections.length + 1;
          const secName = name || `${sub.name} Section ${secCount}`;
          const newSection: SectionData = {
            id: newSecId,
            name: secName,
            questions: [
              {
                id: newQId,
                key: '1',
                que: 1,
                type: 'mcq',
                marks: { cm: 4, im: -1, pm: 0, max: 4 },
                answerOptions: '1',
                pdfData: [],
                images: [],
              },
            ],
          };
          return { ...sub, sections: [...sub.sections, newSection] };
        }
        return sub;
      });

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Add Section');
      set({
        selectedSubjectId: subjectId,
        selectedSectionId: newSecId,
        selectedQuestionId: newQId,
      });
    },

    renameSection: (sectionId: string, newName: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => (sec.id === sectionId ? { ...sec, name: newName } : sec)),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Rename Section');
    },

    deleteSection: (sectionId: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.filter((sec) => sec.id !== sectionId),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Delete Section');
    },

    moveSection: (sectionId: string, direction: 'up' | 'down') => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => {
        const idx = sub.sections.findIndex((s) => s.id === sectionId);
        if (idx === -1) return sub;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= sub.sections.length) return sub;

        const list = [...sub.sections];
        const temp = list[idx];
        list[idx] = list[targetIdx];
        list[targetIdx] = temp;

        return { ...sub, sections: list };
      });

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, `Move Section ${direction}`);
    },

    addSubject: (name: string = 'New Subject') => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const newSubId = generateId();
      const newSecId = generateId();
      const newQId = generateId();

      const newSubject: SubjectData = {
        id: newSubId,
        name,
        sections: [
          {
            id: newSecId,
            name: `${name} Section 1`,
            questions: [
              {
                id: newQId,
                key: '1',
                que: 1,
                type: 'mcq',
                marks: { cm: 4, im: -1, pm: 0, max: 4 },
                answerOptions: '1',
                pdfData: [],
                images: [],
              },
            ],
          },
        ],
      };

      const updatedSubjects = [...active.subjects, newSubject];
      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Add Subject');
      set({
        selectedSubjectId: newSubId,
        selectedSectionId: newSecId,
        selectedQuestionId: newQId,
      });
    },

    renameSubject: (subjectId: string, newName: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) =>
        sub.id === subjectId ? { ...sub, name: newName } : sub
      );

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Rename Subject');
    },

    deleteSubject: (subjectId: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.filter((sub) => sub.id !== subjectId);
      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Delete Subject');
    },

    moveSubject: (subjectId: string, direction: 'up' | 'down') => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const idx = active.subjects.findIndex((s) => s.id === subjectId);
      if (idx === -1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= active.subjects.length) return;

      const list = [...active.subjects];
      const temp = list[idx];
      list[idx] = list[targetIdx];
      list[targetIdx] = temp;

      commitArchiveUpdate({ ...active, subjects: list }, `Move Subject ${direction}`);
    },

    addImagePart: async (questionId: string, file: File) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const blobUrl = URL.createObjectURL(file);
      const ext = file.name.split('.').pop() || 'png';

      // Find section name and question number
      let secName = 'Section 1';
      let qNum = 1;
      active.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          const q = sec.questions.find((item) => item.id === questionId);
          if (q) {
            secName = sec.name;
            qNum = q.que;
          }
        });
      });

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id === questionId) {
              const partIndex = q.images.length + 1;
              const fileName = buildImageFileName(secName, qNum, partIndex, ext);

              const newImage: ImageAttachment = {
                id: generateId(),
                partIndex,
                fileName,
                blobUrl,
                rawBlob: file,
                mimeType: file.type || 'image/png',
                sizeBytes: file.size,
              };

              const newPdfPart: PdfDataPart = {
                page: 1,
                x1: 0,
                y1: 0,
                x2: 100,
                y2: 100,
                filename: fileName,
              };

              return {
                ...q,
                images: [...q.images, newImage],
                pdfData: [...q.pdfData, newPdfPart],
              };
            }
            return q;
          }),
        })),
      }));

      // Store in raw files map
      const updatedRawFiles = new Map(active.rawFiles);
      const targetName = buildImageFileName(secName, qNum, updatedSubjects.length, ext);
      updatedRawFiles.set(targetName, { blob: file, url: blobUrl, size: file.size });

      commitArchiveUpdate(
        { ...active, subjects: updatedSubjects, rawFiles: updatedRawFiles },
        'Add Image Part'
      );
    },

    replaceImagePart: async (questionId: string, partIndex: number, file: File) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const blobUrl = URL.createObjectURL(file);

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id === questionId) {
              const updatedImages = q.images.map((img) =>
                img.partIndex === partIndex
                  ? {
                      ...img,
                      blobUrl,
                      rawBlob: file,
                      mimeType: file.type || 'image/png',
                      sizeBytes: file.size,
                    }
                  : img
              );
              return { ...q, images: updatedImages };
            }
            return q;
          }),
        })),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, `Replace Image Part ${partIndex}`);
    },

    deleteImagePart: (questionId: string, partIndex: number) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id === questionId) {
              const filteredImages = q.images
                .filter((img) => img.partIndex !== partIndex)
                .map((img, idx) => ({ ...img, partIndex: idx + 1 }));

              const filteredPdfData = q.pdfData
                .filter((_, idx) => idx + 1 !== partIndex)
                .map((part, idx) => ({
                  ...part,
                  filename: buildImageFileName(sec.name, q.que, idx + 1, 'png'),
                }));

              return { ...q, images: filteredImages, pdfData: filteredPdfData };
            }
            return q;
          }),
        })),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, `Delete Image Part ${partIndex}`);
    },

    reorderImageParts: (questionId: string, fromIndex: number, toIndex: number) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id === questionId) {
              const images = [...q.images];
              const [moved] = images.splice(fromIndex, 1);
              images.splice(toIndex, 0, moved);

              const reindexedImages = images.map((img, idx) => ({
                ...img,
                partIndex: idx + 1,
                fileName: buildImageFileName(sec.name, q.que, idx + 1, 'png'),
              }));

              const pdfData = [...q.pdfData];
              if (pdfData.length === images.length) {
                const [movedPdf] = pdfData.splice(fromIndex, 1);
                pdfData.splice(toIndex, 0, movedPdf);
              }

              const reindexedPdfData = pdfData.map((part, idx) => ({
                ...part,
                filename: buildImageFileName(sec.name, q.que, idx + 1, 'png'),
              }));

              return {
                ...q,
                images: reindexedImages,
                pdfData: reindexedPdfData,
              };
            }
            return q;
          }),
        })),
      }));

      commitArchiveUpdate({ ...active, subjects: updatedSubjects }, 'Reorder Image Parts');
    },

    runLinter: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const diagnostics = runDiagnostics(active);
      set({ diagnostics, isDiagnosticsOpen: true });
    },

    fixRenumberSection: (sectionId?: string) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixRenumberSection(active, sectionId);
      commitArchiveUpdate(fixed, 'Auto-Fix: Renumber Questions Sequentially');
    },

    fixPruneOrphaned: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixPruneOrphanedImages(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Prune Orphaned Images');
    },

    fixStandardizeFilenames: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixStandardizeFilenames(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Standardize Filenames');
    },

    fixMarkingSchemes: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixMarkingSchemes(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Fix Marking Schemes');
    },

    bulkApplyMarkingScheme: (sectionIds: string[], presetId: string) => {
      const preset = MARKING_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const secSet = new Set(sectionIds);
      const updatedSubjects = active.subjects.map((sub) => ({
        ...sub,
        sections: sub.sections.map((sec) => {
          if (!secSet.has(sec.id)) return sec;
          return {
            ...sec,
            questions: sec.questions.map((q) => ({
              ...q,
              type: preset.type,
              marks: { ...preset.marks },
            })),
          };
        }),
      }));

      commitArchiveUpdate(
        { ...active, subjects: updatedSubjects },
        `Bulk Apply Marking Scheme: ${preset.name}`
      );
    },

    bulkRenumberPaper: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixRenumberSection(active);
      commitArchiveUpdate(fixed, 'Bulk Renumber All Sections');
    },

    undo: () => {
      const state = get();
      if (state.past.length === 0) return;

      const currentActive = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!currentActive) return;

      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);

      const futureEntry: HistoryEntry = {
        archive: currentActive,
        actionLabel: previous.actionLabel,
        timestamp: Date.now(),
      };

      const newFuture = [futureEntry, ...state.future];
      const newArchives = state.archives.map((a) =>
        a.id === previous.archive.id ? previous.archive : a
      );

      const newDiagnostics = runDiagnostics(previous.archive);

      set({
        archives: newArchives,
        past: newPast,
        future: newFuture,
        diagnostics: newDiagnostics,
      });

      saveArchiveToDB(previous.archive);
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;

      const currentActive = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!currentActive) return;

      const next = state.future[0];
      const newFuture = state.future.slice(1);

      const pastEntry: HistoryEntry = {
        archive: currentActive,
        actionLabel: next.actionLabel,
        timestamp: Date.now(),
      };

      const newPast = [...state.past, pastEntry];
      const newArchives = state.archives.map((a) =>
        a.id === next.archive.id ? next.archive : a
      );

      const newDiagnostics = runDiagnostics(next.archive);

      set({
        archives: newArchives,
        past: newPast,
        future: newFuture,
        diagnostics: newDiagnostics,
      });

      saveArchiveToDB(next.archive);
    },

    setDiagnosticsOpen: (open: boolean) => set({ isDiagnosticsOpen: open }),
    setBulkModalOpen: (open: boolean) => set({ isBulkModalOpen: open }),
    setExportModalOpen: (open: boolean) => set({ isExportModalOpen: open }),
    setCbtSimulatorOpen: (open: boolean) => set({ isCbtSimulatorOpen: open }),
    setMobileSidebarOpen: (open: boolean) => set({ isMobileSidebarOpen: open }),
    setSearchTerm: (term: string) => set({ searchTerm: term }),
    setFilterType: (filter: string) => set({ filterType: filter }),
    setTheme: (theme: 'dark' | 'light' | 'cbt-high-contrast') => set({ theme }),
  };
});
