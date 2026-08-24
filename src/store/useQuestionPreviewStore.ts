import { create } from 'zustand';
import { QuestionData } from '../types/cbt';

export interface QuestionPreviewMeta {
  subjectName?: string;
  sectionName?: string;
  archiveId?: string;
  paperName?: string;
}

export interface QuestionPreviewPosition {
  x: number;
  y: number;
}

export interface QuestionPreviewSize {
  width: number;
  height: number;
}

interface QuestionPreviewState {
  isOpen: boolean;
  isPinned: boolean;
  isMinimized: boolean;
  question: QuestionData | null;
  meta: QuestionPreviewMeta | null;
  position: QuestionPreviewPosition;
  size: QuestionPreviewSize;
  timerId: any | null;
  hideTimerId: any | null;

  // Actions
  schedulePreview: (
    question: QuestionData,
    meta?: QuestionPreviewMeta,
    anchorPos?: { clientX?: number; clientY?: number; rect?: DOMRect },
    delayMs?: number
  ) => void;
  cancelScheduledPreview: () => void;
  scheduleHide: (delayMs?: number) => void;
  cancelScheduledHide: () => void;
  showPreviewImmediately: (
    question: QuestionData,
    meta?: QuestionPreviewMeta,
    anchorPos?: { clientX?: number; clientY?: number; rect?: DOMRect }
  ) => void;
  hidePreview: (force?: boolean) => void;
  togglePin: () => void;
  setPinned: (pinned: boolean) => void;
  toggleMinimize: () => void;
  setPosition: (pos: QuestionPreviewPosition | ((prev: QuestionPreviewPosition) => QuestionPreviewPosition)) => void;
  setSize: (size: QuestionPreviewSize | ((prev: QuestionPreviewSize) => QuestionPreviewSize)) => void;
  closePreview: () => void;
}

// Initial position calculations (top-right side of screen or near cursor)
const getInitialPosition = (anchorPos?: { clientX?: number; clientY?: number; rect?: DOMRect }): QuestionPreviewPosition => {
  if (typeof window === 'undefined') return { x: 100, y: 100 };

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const defaultW = Math.min(420, screenW - 32);

  if (anchorPos?.clientX !== undefined && anchorPos?.clientY !== undefined) {
    let x = anchorPos.clientX + 20;
    let y = anchorPos.clientY - 20;

    // Check bounds
    if (x + defaultW > screenW - 20) {
      x = Math.max(20, anchorPos.clientX - defaultW - 20);
    }
    if (y + 440 > screenH - 20) {
      y = Math.max(20, screenH - 460);
    }
    return { x: Math.max(16, x), y: Math.max(16, y) };
  }

  if (anchorPos?.rect) {
    const r = anchorPos.rect;
    let x = r.right + 16;
    let y = r.top - 10;
    if (x + defaultW > screenW - 20) {
      x = Math.max(20, r.left - defaultW - 16);
    }
    if (y + 440 > screenH - 20) {
      y = Math.max(20, screenH - 460);
    }
    return { x: Math.max(16, x), y: Math.max(16, y) };
  }

  // Default upper right corner
  return {
    x: Math.max(20, screenW - defaultW - 24),
    y: 72,
  };
};

export const useQuestionPreviewStore = create<QuestionPreviewState>((set, get) => ({
  isOpen: false,
  isPinned: false,
  isMinimized: false,
  question: null,
  meta: null,
  position: { x: 100, y: 80 },
  size: { width: 440, height: 480 },
  timerId: null,
  hideTimerId: null,

  schedulePreview: (question, meta, anchorPos, delayMs = 100) => {
    const { timerId, hideTimerId, isPinned, isOpen, question: currentQ } = get();

    if (timerId) clearTimeout(timerId);
    if (hideTimerId) clearTimeout(hideTimerId);

    // If already open and pinned, update the active question immediately when user hovers over another question
    if (isPinned && isOpen && currentQ?.id !== question.id) {
      set({ question, meta: meta || null, hideTimerId: null });
      return;
    }

    const newTimerId = setTimeout(() => {
      const { isPinned: currentPinned, position: currentPos } = get();
      const nextPos = currentPinned ? currentPos : getInitialPosition(anchorPos);

      set({
        isOpen: true,
        question,
        meta: meta || null,
        position: nextPos,
        timerId: null,
        hideTimerId: null,
      });
    }, delayMs);

    set({ timerId: newTimerId, hideTimerId: null });
  },

  cancelScheduledPreview: () => {
    const { timerId } = get();
    if (timerId) {
      clearTimeout(timerId);
      set({ timerId: null });
    }
  },

  scheduleHide: (delayMs = 250) => {
    const { hideTimerId, isPinned } = get();
    if (isPinned) return; // Do not hide if pinned!

    if (hideTimerId) clearTimeout(hideTimerId);

    const newHideTimerId = setTimeout(() => {
      const state = get();
      if (!state.isPinned) {
        set({ isOpen: false, hideTimerId: null });
      }
    }, delayMs);

    set({ hideTimerId: newHideTimerId });
  },

  cancelScheduledHide: () => {
    const { hideTimerId } = get();
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      set({ hideTimerId: null });
    }
  },

  showPreviewImmediately: (question, meta, anchorPos) => {
    const { timerId, hideTimerId, position: currentPos, isPinned } = get();
    if (timerId) clearTimeout(timerId);
    if (hideTimerId) clearTimeout(hideTimerId);

    const nextPos = isPinned ? currentPos : getInitialPosition(anchorPos);
    set({
      isOpen: true,
      question,
      meta: meta || null,
      position: nextPos,
      timerId: null,
      hideTimerId: null,
    });
  },

  hidePreview: (force = false) => {
    const { isPinned, timerId, hideTimerId } = get();
    if (timerId) clearTimeout(timerId);
    if (hideTimerId) clearTimeout(hideTimerId);

    if (force || !isPinned) {
      set({ isOpen: false, isPinned: force ? false : isPinned, timerId: null, hideTimerId: null });
    }
  },

  togglePin: () => {
    set((state) => ({ isPinned: !state.isPinned }));
  },

  setPinned: (pinned) => {
    set({ isPinned: pinned });
  },

  toggleMinimize: () => {
    set((state) => ({ isMinimized: !state.isMinimized }));
  },

  setPosition: (posOrUpdater) => {
    set((state) => ({
      position: typeof posOrUpdater === 'function' ? posOrUpdater(state.position) : posOrUpdater,
    }));
  },

  setSize: (sizeOrUpdater) => {
    set((state) => ({
      size: typeof sizeOrUpdater === 'function' ? sizeOrUpdater(state.size) : sizeOrUpdater,
    }));
  },

  closePreview: () => {
    const { timerId, hideTimerId } = get();
    if (timerId) clearTimeout(timerId);
    if (hideTimerId) clearTimeout(hideTimerId);
    set({ isOpen: false, isPinned: false, question: null, timerId: null, hideTimerId: null });
  },
}));
