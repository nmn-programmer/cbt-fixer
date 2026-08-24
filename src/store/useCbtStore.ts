import { create } from 'zustand';
import {
  ArchiveMetadata,
  BlueprintSectionRange,
  DiagnosticIssue,
  ImageAttachment,
  MarksScheme,
  PdfDataPart,
  QuestionData,
  QuestionPaperArchive,
  QuestionType,
  SectionData,
  SubjectData,
  TestPaperBlueprint,
} from '../types/cbt';
import {
  buildImageFileName,
  generateId,
  MARKING_PRESETS,
} from '../utils/constants';
import {
  autoFixAnswerTypeMismatches,
  autoFixInstructedMarkings,
  autoFixMarkingSchemes,
  autoFixModernizeToAiFormat,
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
import {
  ApiKeyStatus,
  FallbackKeyItem,
  getKeyUsageSnapshot,
  getStoredFallbackKeys,
  getStoredPrimaryApiKey,
  getStoredPrimaryStatus,
  recordRequestUsage,
  setStoredFallbackKeys,
  setStoredPrimaryApiKey,
  setStoredPrimaryStatus,
  ToastNotification,
} from '../utils/geminiKeyManager';
import { getStoredSelectedModel, setStoredSelectedModel } from '../utils/aiModelConfig';

interface HistoryEntry {
  archive: QuestionPaperArchive;
  actionLabel: string;
  timestamp: number;
}

export interface BackgroundTaskState {
  id: string;
  title: string;
  statusText: string;
  percent: number;
  isMinimized: boolean;
  isComplete: boolean;
  modalType: 'pdf_converter' | 'answer_key_studio' | 'blueprint_studio';
  startTime: number;
  resultSummary?: string;
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
  isPdfConverterModalOpen: boolean;
  isPdfRecropModalOpen: boolean;
  recropTarget: {
    questionId?: string;
    partIndex?: number;
    mode: 'replace_part' | 'add_part' | 'new_question' | 'stitch';
    sectionId?: string;
    subjectId?: string;
    defaultQNo?: number;
    pageNumber?: number;
  } | null;
  isAiRepairModalOpen: boolean;
  aiRepairQuestionId: string | null;
  isAnswerKeyModalOpen: boolean;
  isBulkModalOpen: boolean;
  isExportModalOpen: boolean;
  isCbtSimulatorOpen: boolean;
  isMobileSidebarOpen: boolean;
  theme: 'dark' | 'light' | 'cbt-high-contrast';
  geminiApiKey: string;
  fallbackApiKeys: FallbackKeyItem[];
  activeKeyId: string;
  primaryRpm: number;
  primaryRpd: number;
  primaryStatus: ApiKeyStatus;
  primaryExhaustedUntil?: number;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  toasts: ToastNotification[];

  activeBackgroundTask: BackgroundTaskState | null;
  enableDoublePassRescan: boolean;
  setEnableDoublePassRescan: (enable: boolean) => void;
  startBackgroundTask: (task: Omit<BackgroundTaskState, 'isMinimized' | 'isComplete' | 'startTime'>) => void;
  updateBackgroundTask: (updates: Partial<BackgroundTaskState>) => void;
  minimizeBackgroundTask: () => void;
  restoreBackgroundTask: () => void;
  completeBackgroundTask: (resultSummary?: string) => void;
  clearBackgroundTask: () => void;

  setGeminiApiKey: (key: string) => void;
  setFallbackApiKeys: (keys: FallbackKeyItem[]) => void;
  addFallbackApiKey: (key: string, label?: string) => void;
  updateFallbackApiKey: (id: string, updates: Partial<FallbackKeyItem>) => void;
  deleteFallbackApiKey: (id: string) => void;
  reorderFallbackApiKeys: (fromIndex: number, toIndex: number) => void;
  refreshUsageMetrics: () => void;
  addToast: (
    titleOrObj: string | { title: string; description?: string; type?: 'info' | 'success' | 'warning' | 'error' },
    description?: string,
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  removeToast: (id: string) => void;

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

  // PDF Re-Cropping & Repair
  openPdfRecrop: (target?: {
    questionId?: string;
    partIndex?: number;
    mode?: 'replace_part' | 'add_part' | 'new_question' | 'stitch';
    sectionId?: string;
    subjectId?: string;
    defaultQNo?: number;
    pageNumber?: number;
  }) => void;
  closePdfRecrop: () => void;
  openAiRepair: (questionId: string) => void;
  closeAiRepair: () => void;
  attachSourcePdfToArchive: (archiveId: string, file: File) => void;
  applyCroppedImage: (payload: {
    questionId?: string;
    partIndex?: number;
    mode: 'replace_part' | 'add_part' | 'new_question' | 'stitch';
    blob: Blob;
    sectionId?: string;
    subjectId?: string;
    newQuestionProps?: Partial<QuestionData>;
    pdfCoords?: PdfDataPart;
  }) => Promise<void>;

  // Answer Key & Classification
  setPdfConverterModalOpen: (open: boolean) => void;
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
  fixAnswerTypeMismatches: () => void;
  fixInstructedMarkings: () => void;
  fixModernizeFormat: () => void;
  bulkApplyMarkingScheme: (sectionIds: string[], presetId: string) => void;
  bulkRenumberPaper: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Modals & UI Toggles
  isBlueprintModalOpen: boolean;
  setBlueprintModalOpen: (open: boolean) => void;
  applyBlueprintRangesToActiveArchive: (
    ranges: BlueprintSectionRange[],
    testMetadata?: Partial<ArchiveMetadata>
  ) => void;
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

    geminiApiKey: getStoredPrimaryApiKey(),
    fallbackApiKeys: getStoredFallbackKeys(),
    activeKeyId: 'primary',
    primaryRpm: 0,
    primaryRpd: 0,
    primaryStatus: 'Ready',
    selectedModel: getStoredSelectedModel(),
    setSelectedModel: (model: string) => {
      setStoredSelectedModel(model);
      set({ selectedModel: model });
      get().addToast('AI Model Updated', `Active model set to ${model}. All AI tasks will now use this model.`, 'success');
    },
    toasts: [],

    activeBackgroundTask: null,
    enableDoublePassRescan: true,

    setEnableDoublePassRescan: (enable: boolean) => {
      set({ enableDoublePassRescan: enable });
    },

    startBackgroundTask: (task) => {
      set({
        activeBackgroundTask: {
          ...task,
          isMinimized: false,
          isComplete: false,
          startTime: Date.now(),
        },
      });
    },

    updateBackgroundTask: (updates) => {
      set((state) => {
        if (!state.activeBackgroundTask) return state;
        return {
          activeBackgroundTask: {
            ...state.activeBackgroundTask,
            ...updates,
          },
        };
      });
    },

    minimizeBackgroundTask: () => {
      set((state) => {
        if (!state.activeBackgroundTask) return state;
        // Close the respective modal when minimizing to floating widget
        const modalType = state.activeBackgroundTask.modalType;
        return {
          activeBackgroundTask: {
            ...state.activeBackgroundTask,
            isMinimized: true,
          },
          ...(modalType === 'pdf_converter' ? { isPdfConverterModalOpen: false } : {}),
          ...(modalType === 'answer_key_studio' ? { isAnswerKeyModalOpen: false } : {}),
          ...(modalType === 'blueprint_studio' ? { isBlueprintModalOpen: false } : {}),
        };
      });
    },

    restoreBackgroundTask: () => {
      set((state) => {
        if (!state.activeBackgroundTask) return state;
        const modalType = state.activeBackgroundTask.modalType;
        return {
          activeBackgroundTask: {
            ...state.activeBackgroundTask,
            isMinimized: false,
          },
          ...(modalType === 'pdf_converter' ? { isPdfConverterModalOpen: true } : {}),
          ...(modalType === 'answer_key_studio' ? { isAnswerKeyModalOpen: true } : {}),
          ...(modalType === 'blueprint_studio' ? { isBlueprintModalOpen: true } : {}),
        };
      });
    },

    completeBackgroundTask: (resultSummary?: string) => {
      set((state) => {
        if (!state.activeBackgroundTask) return state;
        return {
          activeBackgroundTask: {
            ...state.activeBackgroundTask,
            percent: 100,
            isComplete: true,
            statusText: resultSummary || 'AI Processing Completed Successfully!',
          },
        };
      });
    },

    clearBackgroundTask: () => {
      set({ activeBackgroundTask: null });
    },

    setGeminiApiKey: (key: string) => {
      setStoredPrimaryApiKey(key);
      setStoredPrimaryStatus('Ready');
      get().refreshUsageMetrics();
    },

    setFallbackApiKeys: (keys: FallbackKeyItem[]) => {
      setStoredFallbackKeys(keys);
      get().refreshUsageMetrics();
    },

    addFallbackApiKey: (key: string, label?: string) => {
      const current = getStoredFallbackKeys();
      const newItem: FallbackKeyItem = {
        id: generateId(),
        key: key.trim(),
        label: label || `Fallback Key ${current.length + 1}`,
        status: 'Ready',
        rpmCount: 0,
        rpdCount: 0,
        requestTimestamps: [],
      };
      const updated = [...current, newItem];
      setStoredFallbackKeys(updated);
      get().refreshUsageMetrics();
    },

    updateFallbackApiKey: (id: string, updates: Partial<FallbackKeyItem>) => {
      const current = getStoredFallbackKeys();
      const updated = current.map((f) => (f.id === id ? { ...f, ...updates } : f));
      setStoredFallbackKeys(updated);
      get().refreshUsageMetrics();
    },

    deleteFallbackApiKey: (id: string) => {
      const current = getStoredFallbackKeys();
      const updated = current.filter((f) => f.id !== id);
      setStoredFallbackKeys(updated);
      get().refreshUsageMetrics();
    },

    reorderFallbackApiKeys: (fromIndex: number, toIndex: number) => {
      const current = getStoredFallbackKeys();
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
      const updated = [...current];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      setStoredFallbackKeys(updated);
      get().refreshUsageMetrics();
    },

    refreshUsageMetrics: () => {
      const snapshot = getKeyUsageSnapshot();
      set({
        geminiApiKey: snapshot.primaryKey,
        primaryStatus: snapshot.primaryKeyStatus,
        primaryRpm: snapshot.primaryRpm,
        primaryRpd: snapshot.primaryRpd,
        primaryExhaustedUntil: snapshot.primaryExhaustedUntil,
        fallbackApiKeys: snapshot.fallbackKeys,
        activeKeyId: snapshot.activeKeyId,
      });
    },

    addToast: (
      titleOrObj: string | { title: string; description?: string; type?: 'info' | 'success' | 'warning' | 'error' },
      description?: string,
      type: 'info' | 'success' | 'warning' | 'error' = 'info'
    ) => {
      let finalTitle = '';
      let finalDesc: string | undefined = undefined;
      let finalType: 'info' | 'success' | 'warning' | 'error' = type;

      if (typeof titleOrObj === 'string') {
        finalTitle = titleOrObj;
        finalDesc = description;
        finalType = type;
      } else if (titleOrObj && typeof titleOrObj === 'object') {
        finalTitle = titleOrObj.title;
        finalDesc = titleOrObj.description;
        finalType = titleOrObj.type || 'info';
      }

      const newToast: ToastNotification = {
        id: generateId(),
        title: finalTitle,
        description: finalDesc,
        type: finalType,
        timestamp: Date.now(),
      };
      set((state) => ({ toasts: [...state.toasts.slice(-4), newToast] }));
    },

    removeToast: (id: string) => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },
    isPdfConverterModalOpen: false,
    isBlueprintModalOpen: false,
    isPdfRecropModalOpen: false,
    recropTarget: null,
    isAiRepairModalOpen: false,
    aiRepairQuestionId: null,
    isAnswerKeyModalOpen: false,
    isBulkModalOpen: false,
    isExportModalOpen: false,
    isCbtSimulatorOpen: false,
    isMobileSidebarOpen: false,
    theme: 'dark',

    past: [],
    future: [],

    setPdfConverterModalOpen: (open: boolean) => set({ isPdfConverterModalOpen: open }),
    setBlueprintModalOpen: (open: boolean) => set({ isBlueprintModalOpen: open }),
    setAnswerKeyModalOpen: (open: boolean) => set({ isAnswerKeyModalOpen: open }),

    applyBlueprintRangesToActiveArchive: (
      ranges: BlueprintSectionRange[],
      testMetadata?: Partial<ArchiveMetadata>
    ) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      // Flatten all questions currently in the active archive in sequence
      const allQuestions: QuestionData[] = [];
      active.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            allQuestions.push(q);
          });
        });
      });

      // Sort questions by their sequence number `que`
      allQuestions.sort((a, b) => (a.que || 0) - (b.que || 0));

      // Build new subjects and sections structure based strictly on ranges
      const subjectMap = new Map<string, SubjectData>();
      const allocatedQuestionIds = new Set<string>();

      ranges.forEach((range) => {
        const subjName = range.subjectName.trim() || 'General';
        let subject = subjectMap.get(subjName);
        if (!subject) {
          subject = {
            id: generateId(),
            name: subjName,
            sections: [],
          };
          subjectMap.set(subjName, subject);
        }

        // Find or create section
        let section = subject.sections.find((s) => s.name === range.sectionName);
        if (!section) {
          section = {
            id: generateId(),
            name: range.sectionName,
            questions: [],
          };
          subject.sections.push(section);
        }

        // Find questions matching range [fromQNo, toQNo]
        const matchedQs = allQuestions.filter(
          (q) => (q.que || 0) >= range.fromQNo && (q.que || 0) <= range.toQNo
        );

        matchedQs.forEach((q) => {
          allocatedQuestionIds.add(q.id);
          const updatedQ: QuestionData = {
            ...q,
            type: range.type || q.type,
            marks: {
              cm: range.marks?.cm ?? q.marks.cm,
              im: range.marks?.im ?? q.marks.im,
              pm: range.marks?.pm ?? q.marks.pm ?? 0,
              max: range.marks?.max ?? q.marks.max ?? 4,
            },
          };
          section!.questions.push(updatedQ);
        });
      });

      // Handle any remaining unallocated questions
      const unallocatedQs = allQuestions.filter((q) => !allocatedQuestionIds.has(q.id));
      if (unallocatedQs.length > 0) {
        let unallocatedSub = subjectMap.get('General');
        if (!unallocatedSub) {
          unallocatedSub = {
            id: generateId(),
            name: 'General',
            sections: [],
          };
          subjectMap.set('General', unallocatedSub);
        }
        const unallocatedSec: SectionData = {
          id: generateId(),
          name: 'Unallocated Questions',
          questions: unallocatedQs,
        };
        unallocatedSub.sections.push(unallocatedSec);
      }

      const updatedSubjects = Array.from(subjectMap.values());

      const updatedArchive: QuestionPaperArchive = {
        ...active,
        title: testMetadata?.testTitle || active.title,
        metadata: {
          ...active.metadata,
          ...testMetadata,
        },
        subjects: updatedSubjects,
      };

      commitArchiveUpdate(
        updatedArchive,
        `Apply Blueprint Ranges (${ranges.length} ranges)`
      );
    },

    openPdfRecrop: (target) => {
      const state = get();
      const currentActive = state.archives.find((a) => a.id === state.activeArchiveId);
      const activeQ = state.selectedQuestionId;
      const targetQId = target?.questionId || activeQ;

      let extractedPageNumber: number | undefined = target?.pageNumber;

      if (!extractedPageNumber && currentActive && targetQId) {
        for (const sub of currentActive.subjects) {
          for (const sec of sub.sections) {
            const q = sec.questions.find((item) => item.id === targetQId);
            if (q) {
              if (q.pdfData && q.pdfData.length > 0 && q.pdfData[0].pageNumber) {
                extractedPageNumber = q.pdfData[0].pageNumber;
              } else if (q.images && q.images.length > 0) {
                const partIdx = target?.partIndex ? target.partIndex - 1 : 0;
                const img = q.images[partIdx] || q.images[0];
                if (img && (img as any).pageNumber) {
                  extractedPageNumber = (img as any).pageNumber;
                }
              }
              break;
            }
          }
        }
      }
      
      const recropData = target ? {
        mode: target.mode || ('replace_part' as const),
        pageNumber: extractedPageNumber,
        ...target,
      } : (activeQ ? {
        questionId: activeQ,
        partIndex: 1,
        pageNumber: extractedPageNumber,
        mode: 'replace_part' as const,
        sectionId: state.selectedSectionId || undefined,
        subjectId: state.selectedSubjectId || undefined
      } : {
        mode: 'new_question' as const,
        pageNumber: extractedPageNumber,
        sectionId: state.selectedSectionId || undefined,
        subjectId: state.selectedSubjectId || undefined
      });

      set({ isPdfRecropModalOpen: true, recropTarget: recropData });
    },

    closePdfRecrop: () => {
      set({ isPdfRecropModalOpen: false, recropTarget: null });
    },

    openAiRepair: (questionId: string) => {
      set({ isAiRepairModalOpen: true, aiRepairQuestionId: questionId });
    },

    closeAiRepair: () => {
      set({ isAiRepairModalOpen: false, aiRepairQuestionId: null });
    },

    attachSourcePdfToArchive: (archiveId: string, file: File) => {
      const state = get();
      const targetArchive = state.archives.find((a) => a.id === archiveId);
      if (!targetArchive) return;

      const updatedRawFiles = new Map(targetArchive.rawFiles);
      const url = URL.createObjectURL(file);
      updatedRawFiles.set('source_document.pdf', {
        blob: file,
        url,
        size: file.size,
      });

      const updatedArchive: QuestionPaperArchive = {
        ...targetArchive,
        metadata: {
          ...targetArchive.metadata,
          sourcePdfName: file.name,
        },
        rawFiles: updatedRawFiles,
        lastModified: Date.now(),
      };

      commitArchiveUpdate(updatedArchive, `Attach Source PDF: ${file.name}`);
    },

    applyCroppedImage: async (payload) => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;

      const blobUrl = URL.createObjectURL(payload.blob);
      const updatedRawFiles = new Map(active.rawFiles);

      if (payload.mode === 'new_question') {
        let targetSubj = active.subjects.find((s) => s.id === payload.subjectId) || active.subjects[0];
        if (!targetSubj) {
          targetSubj = { id: generateId(), name: 'General', sections: [] };
          active.subjects.push(targetSubj);
        }
        let targetSec = targetSubj.sections.find((s) => s.id === payload.sectionId) || targetSubj.sections[0];
        if (!targetSec) {
          targetSec = { id: generateId(), name: 'Section 1', questions: [] };
          targetSubj.sections.push(targetSec);
        }

        const nextQueNum =
          payload.newQuestionProps?.que ||
          (targetSec.questions.length > 0
            ? Math.max(...targetSec.questions.map((q) => q.que)) + 1
            : 1);
        const imageName = buildImageFileName(targetSec.name, nextQueNum, 1, 'png');

        updatedRawFiles.set(imageName, { blob: payload.blob, url: blobUrl, size: payload.blob.size });

        const newQuestion: QuestionData = {
          id: generateId(),
          key: nextQueNum.toString(),
          que: nextQueNum,
          type: payload.newQuestionProps?.type || 'mcq',
          marks: payload.newQuestionProps?.marks || { cm: 4, im: -1, pm: 0, max: 4 },
          answerOptions: payload.newQuestionProps?.answerOptions || '',
          pdfData: payload.pdfCoords ? [{ ...payload.pdfCoords, filename: imageName }] : [],
          images: [
            {
              id: generateId(),
              partIndex: 1,
              fileName: imageName,
              blobUrl,
              rawBlob: payload.blob,
              mimeType: 'image/png',
              sizeBytes: payload.blob.size,
            },
          ],
          notes: payload.newQuestionProps?.notes || '',
        };

        const updatedSubjects = active.subjects.map((sub) => {
          if (sub.id !== targetSubj.id) return sub;
          return {
            ...sub,
            sections: sub.sections.map((sec) => {
              if (sec.id !== targetSec.id) return sec;
              return {
                ...sec,
                questions: [...sec.questions, newQuestion].sort((a, b) => a.que - b.que),
              };
            }),
          };
        });

        commitArchiveUpdate(
          { ...active, subjects: updatedSubjects, rawFiles: updatedRawFiles },
          `Add Cropped Question Q${nextQueNum}`
        );

        set({
          selectedSubjectId: targetSubj.id,
          selectedSectionId: targetSec.id,
          selectedQuestionId: newQuestion.id,
        });
        return;
      }

      if (!payload.questionId) return;
      const qId = payload.questionId;

      let secName = 'Section 1';
      let qNum = 1;
      active.subjects.forEach((sub) => {
        sub.sections.forEach((sec) => {
          const q = sec.questions.find((item) => item.id === qId);
          if (q) {
            secName = sec.name;
            qNum = q.que;
          }
        });
      });

      if (payload.mode === 'replace_part') {
        const targetPartIdx = payload.partIndex || 1;
        const targetFileName = buildImageFileName(secName, qNum, targetPartIdx, 'png');
        updatedRawFiles.set(targetFileName, { blob: payload.blob, url: blobUrl, size: payload.blob.size });

        const updatedSubjects = active.subjects.map((sub) => ({
          ...sub,
          sections: sub.sections.map((sec) => ({
            ...sec,
            questions: sec.questions.map((q) => {
              if (q.id === qId) {
                const updatedImages = q.images.map((img) =>
                  img.partIndex === targetPartIdx
                    ? {
                        ...img,
                        fileName: targetFileName,
                        blobUrl,
                        rawBlob: payload.blob,
                        mimeType: 'image/png',
                        sizeBytes: payload.blob.size,
                      }
                    : img
                );
                if (!updatedImages.some((img) => img.partIndex === targetPartIdx)) {
                  updatedImages.push({
                    id: generateId(),
                    partIndex: targetPartIdx,
                    fileName: targetFileName,
                    blobUrl,
                    rawBlob: payload.blob,
                    mimeType: 'image/png',
                    sizeBytes: payload.blob.size,
                  });
                }

                const updatedPdfData = q.pdfData.map((part, idx) =>
                  idx === targetPartIdx - 1 && payload.pdfCoords
                    ? { ...payload.pdfCoords, filename: targetFileName }
                    : part
                );

                return {
                  ...q,
                  images: updatedImages,
                  pdfData:
                    updatedPdfData.length > 0
                      ? updatedPdfData
                      : payload.pdfCoords
                      ? [{ ...payload.pdfCoords, filename: targetFileName }]
                      : q.pdfData,
                };
              }
              return q;
            }),
          })),
        }));

        commitArchiveUpdate(
          { ...active, subjects: updatedSubjects, rawFiles: updatedRawFiles },
          `Re-cropped Question Q${qNum} Part ${targetPartIdx}`
        );
      } else if (payload.mode === 'stitch') {
        const targetFileName = buildImageFileName(secName, qNum, 1, 'png');
        updatedRawFiles.set(targetFileName, { blob: payload.blob, url: blobUrl, size: payload.blob.size });

        const updatedSubjects = active.subjects.map((sub) => ({
          ...sub,
          sections: sub.sections.map((sec) => ({
            ...sec,
            questions: sec.questions.map((q) => {
              if (q.id === qId) {
                const newImage: ImageAttachment = {
                  id: generateId(),
                  partIndex: 1,
                  fileName: targetFileName,
                  blobUrl,
                  rawBlob: payload.blob,
                  mimeType: 'image/png',
                  sizeBytes: payload.blob.size,
                };
                return {
                  ...q,
                  images: [newImage],
                  pdfData: payload.pdfCoords
                    ? [{ ...payload.pdfCoords, filename: targetFileName }]
                    : [],
                };
              }
              return q;
            }),
          })),
        }));

        commitArchiveUpdate(
          { ...active, subjects: updatedSubjects, rawFiles: updatedRawFiles },
          `Stitched & Replaced Q${qNum} Image`
        );
      } else if (payload.mode === 'add_part') {
        let newPartIdx = 1;
        active.subjects.forEach((sub) => {
          sub.sections.forEach((sec) => {
            const q = sec.questions.find((item) => item.id === qId);
            if (q) newPartIdx = q.images.length + 1;
          });
        });

        const targetFileName = buildImageFileName(secName, qNum, newPartIdx, 'png');
        updatedRawFiles.set(targetFileName, { blob: payload.blob, url: blobUrl, size: payload.blob.size });

        const updatedSubjects = active.subjects.map((sub) => ({
          ...sub,
          sections: sub.sections.map((sec) => ({
            ...sec,
            questions: sec.questions.map((q) => {
              if (q.id === qId) {
                const newImage: ImageAttachment = {
                  id: generateId(),
                  partIndex: newPartIdx,
                  fileName: targetFileName,
                  blobUrl,
                  rawBlob: payload.blob,
                  mimeType: 'image/png',
                  sizeBytes: payload.blob.size,
                };
                return {
                  ...q,
                  images: [...q.images, newImage],
                  pdfData: payload.pdfCoords
                    ? [...q.pdfData, { ...payload.pdfCoords, filename: targetFileName }]
                    : q.pdfData,
                };
              }
              return q;
            }),
          })),
        }));

        commitArchiveUpdate(
          { ...active, subjects: updatedSubjects, rawFiles: updatedRawFiles },
          `Add Image Part ${newPartIdx} to Q${qNum}`
        );
      }
    },

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

    fixAnswerTypeMismatches: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixAnswerTypeMismatches(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Reconcile Question Types with Answer Keys');
    },

    fixInstructedMarkings: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixInstructedMarkings(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Apply Instructed Booklet Marking Scheme');
    },

    fixModernizeFormat: () => {
      const state = get();
      const active = state.archives.find((a) => a.id === state.activeArchiveId);
      if (!active) return;
      const fixed = autoFixModernizeToAiFormat(active);
      commitArchiveUpdate(fixed, 'Auto-Fix: Modernize to AI Standard Format');
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
