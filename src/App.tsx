import React, { useEffect } from 'react';
import { useCbtStore } from './store/useCbtStore';
import { loadAllArchivesFromDB } from './utils/indexedDB';
import { Header } from './components/Header';
import { SidebarTree } from './components/SidebarTree';
import { QuestionEditor } from './components/QuestionEditor';
import { ImportDropzone } from './components/ImportDropzone';
import { DiagnosticsDrawer } from './components/DiagnosticsDrawer';
import { BulkOperationsModal } from './components/BulkOperationsModal';
import { ExportModal } from './components/ExportModal';
import { CbtPreviewModal } from './components/CbtPreviewModal';
import { AnswerKeyStudioModal } from './components/AnswerKeyStudioModal';
import { FloatingQuestionPreview } from './components/FloatingQuestionPreview';
import { BlueprintRangeStudioModal } from './components/BlueprintRangeStudioModal';
import { UnifiedPdfStudioModal } from './components/UnifiedPdfStudioModal';
import { UnifiedAiIngestionModal } from './components/UnifiedAiIngestionModal';
import { AiQuestionRepairModal } from './components/AiQuestionRepairModal';
import { AiProcessingMonitorModal } from './components/AiProcessingMonitorModal';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer } from './components/ToastContainer';
import { FloatingBgTaskWidget } from './components/FloatingBgTaskWidget';
import { ConfirmDialog } from './components/ConfirmDialog';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isAiMonitorOpen, setIsAiMonitorOpen] = React.useState(false);

  useEffect(() => {
    const handleOpenSettings = () => setIsSettingsOpen(true);
    const handleOpenAiMonitor = () => setIsAiMonitorOpen(true);

    window.addEventListener('open-settings', handleOpenSettings);
    window.addEventListener('open-ai-monitor', handleOpenAiMonitor);

    return () => {
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('open-ai-monitor', handleOpenAiMonitor);
    };
  }, []);

  const {
    archives,
    activeArchiveId,
    addArchive,
    loadSample,
    undo,
    redo,
    setDiagnosticsOpen,
    setBulkModalOpen,
    setExportModalOpen,
    isDiagnosticsOpen,
    isBulkModalOpen,
    isExportModalOpen,
  } = useCbtStore();

  // Load drafts from IndexedDB on startup
  useEffect(() => {
    async function initDB() {
      const storedArchives = await loadAllArchivesFromDB();
      if (storedArchives && storedArchives.length > 0) {
        storedArchives.forEach((arch, idx) => {
          addArchive(arch, idx === 0);
        });
      }
    }
    initDB();
  }, []);

  // Global Keyboard Shortcuts (Undo, Redo, Diagnostics, Export)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (cmdOrCtrl && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setExportModalOpen(true);
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDiagnosticsOpen(!isDiagnosticsOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isDiagnosticsOpen]);

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden select-none">
      {/* Top Application Header */}
      <Header />

      {/* Main Workspace Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeArchive ? (
          <>
            <SidebarTree />
            <QuestionEditor />
          </>
        ) : (
          <ImportDropzone />
        )}
      </main>

      {/* Slide-over & Dialog Modals */}
      <DiagnosticsDrawer />
      <BulkOperationsModal />
      <ExportModal />
      <CbtPreviewModal />
      <AnswerKeyStudioModal />
      <BlueprintRangeStudioModal />
      <UnifiedPdfStudioModal />
      <UnifiedAiIngestionModal />
      <AiQuestionRepairModal />
      <AiProcessingMonitorModal isOpen={isAiMonitorOpen} onClose={() => setIsAiMonitorOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ConfirmDialog />

      {/* Draggable & Pinned Floating Question Image Previewer */}
      <FloatingQuestionPreview />

      {/* Global Toast Notifications */}
      <ToastContainer />

      {/* Floating Circular Progress Background Widget */}
      <FloatingBgTaskWidget />
    </div>
  );
}
