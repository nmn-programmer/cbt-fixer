import React, { useRef, useState, useEffect } from 'react';
import { Settings,
  AlertTriangle,
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Crop,
  Download,
  Eye,
  FileArchive,
  FilePlus,
  FolderOpen,
  Home,
  Key,
  Layers,
  Moon,
  Plus,
  Redo2,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  Wrench,
  X,
  Menu,
  MoreVertical,
  ArrowRight,
  Minimize2,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { parseZipArchive } from '../utils/zipParser';

export const Header: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    setActiveArchive,
    closeArchive,
    reorderArchives,
    closeOtherArchives,
    closeTabsToRight,
    closeAllArchives,
    createNewPaper,
    addArchive,
    diagnostics,
    setDiagnosticsOpen,
    setBulkModalOpen,
    setExportModalOpen,
    setBlueprintModalOpen,
    setAnswerKeyModalOpen,
    setCbtSimulatorOpen,
    setMobileSidebarOpen,
    openPdfRecrop,
    setPdfConverterModalOpen,
    past,
    future,
    undo,
    redo,
    theme,
    setTheme,
    addToast,
    showConfirm,
  } = useCbtStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItemIndexRef = useRef<number | null>(null);

  // Tab Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    archiveId: string;
    archiveName: string;
    isDirty: boolean;
  } | null>(null);

  // Close context menu on global click or scroll, and warn user on window tab close if unsaved changes exist
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (archives.some((a) => a.isDirty)) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [archives]);

  const activeArchive = archives.find((a) => a.id === activeArchiveId);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  // Unsaved changes confirmation helper for a single tab
  const handleCloseSingleTab = (archiveId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const arc = archives.find((a) => a.id === archiveId);
    if (!arc) return;

    if (arc.isDirty) {
      showConfirm({
        title: 'Close Tab',
        message: `⚠️ UNSAVED CHANGES WARNING:\n\nYou have unsaved modifications in '${arc.fileName}'.\nClosing this tab without exporting will discard your changes.\n\nAre you sure you want to close this tab?`,
        onConfirm: () => {
          closeArchive(archiveId);
        }
      });
    } else {
      closeArchive(archiveId);
    }
  };

  // Close other tabs
  const handleCloseOthers = (archiveId: string) => {
    const otherDirty = archives.filter((a) => a.id !== archiveId && a.isDirty);
    if (otherDirty.length > 0) {
      showConfirm({
        title: 'Close Other Tabs',
        message: `⚠️ UNSAVED CHANGES WARNING:\n\n${otherDirty.length} of the other open tabs contain unsaved modifications (${otherDirty
          .map((a) => a.fileName)
          .join(', ')}).\n\nAre you sure you want to close all other tabs and discard their unsaved changes?`,
        onConfirm: () => {
          closeOtherArchives(archiveId);
        }
      });
    } else {
      closeOtherArchives(archiveId);
    }
  };

  // Close tabs to right
  const handleCloseRight = (archiveId: string) => {
    const index = archives.findIndex((a) => a.id === archiveId);
    if (index === -1) return;
    const rightTabs = archives.slice(index + 1);
    const rightDirty = rightTabs.filter((a) => a.isDirty);

    if (rightDirty.length > 0) {
      showConfirm({
        title: 'Close Tabs to Right',
        message: `⚠️ UNSAVED CHANGES WARNING:\n\n${rightDirty.length} of the tabs to the right contain unsaved modifications.\n\nAre you sure you want to close them?`,
        onConfirm: () => {
          closeTabsToRight(archiveId);
        }
      });
    } else {
      closeTabsToRight(archiveId);
    }
  };

  // Close all tabs
  const handleCloseAll = () => {
    const dirtyTabs = archives.filter((a) => a.isDirty);
    if (dirtyTabs.length > 0) {
      showConfirm({
        title: 'Close All Tabs',
        message: `⚠️ UNSAVED CHANGES WARNING:\n\n${dirtyTabs.length} open paper tabs contain unsaved modifications.\nClosing all tabs will discard all unsaved edits.\n\nAre you sure you want to close all tabs?`,
        onConfirm: () => {
          closeAllArchives();
        }
      });
    } else {
      showConfirm({
        title: 'Close All Tabs',
        message: 'Are you sure you want to close all open paper tabs?',
        onConfirm: () => {
          closeAllArchives();
        }
      });
    }
  };

  // Tab Context Menu trigger
  const handleTabContextMenu = (e: React.MouseEvent, archiveId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const arc = archives.find((a) => a.id === archiveId);
    if (!arc) return;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      archiveId: arc.id,
      archiveName: arc.fileName,
      isDirty: arc.isDirty || false,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.zip') || file.type.includes('zip')) {
        try {
          const result = await parseZipArchive(file, file.name);
          addArchive(result.archive, true);
          addToast({
            title: 'ZIP Loaded',
            description: `Loaded ${file.name} successfully.`,
            type: 'success',
          });
        } catch (err: any) {
          addToast({
            title: 'Failed to load ZIP',
            description: `${file.name}: ${err.message}`,
            type: 'error',
          });
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lastUndoAction = past.length > 0 ? past[past.length - 1].actionLabel : '';
  const lastRedoAction = future.length > 0 ? future[0].actionLabel : '';

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 select-none sticky top-0 z-30 shadow-md">
      {/* Top Main Navigation Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 gap-2 sm:gap-4">
        {/* Left: Brand & Mobile Sidebar Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            id="mobile-sidebar-toggle-btn"
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-md hover:bg-slate-800 text-slate-300 transition-colors"
            title="Toggle Question Navigator"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-inner text-white font-black text-sm">
              CBT
            </div>
            <div>
              <h1 className="font-bold text-xs sm:text-sm tracking-tight flex items-center gap-1.5">
                <span>CBT Studio</span>
                <span className="hidden lg:inline text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  ZIP Inspector
                </span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  v2.5.0
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 hidden xl:block">
                JEE Question Paper IDE & Diagnostic Workbench
              </p>
            </div>
          </div>
        </div>

        {/* Center: Quick Action Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
          {/* File Upload Hidden Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".zip"
            multiple
            className="hidden"
          />

          {/* Import Archive Button */}
          <button
            id="import-zip-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm"
            title="Import one or more CBT ZIP archives"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Import ZIP</span>
          </button>

          {/* Manual PDF Cropper Studio */}
          <button
            id="manual-cropper-btn"
            onClick={() => openPdfRecrop()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-emerald-950/60 hover:bg-emerald-900/60 active:bg-emerald-850 text-emerald-300 rounded-md border border-emerald-700/60 transition-colors shrink-0 shadow-sm"
            title="Open Manual PDF Cropper & Test Maker Studio"
          >
            <Crop className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline font-semibold">Manual Cropper</span>
          </button>

          {/* AI Auto PDF Converter */}
          <button
            id="ai-pdf-converter-btn"
            onClick={() => setPdfConverterModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-indigo-950/60 hover:bg-indigo-900/60 active:bg-indigo-850 text-indigo-300 rounded-md border border-indigo-700/60 transition-colors shrink-0 shadow-sm"
            title="Auto AI PDF to CBT Archive Extractor"
          >
            <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">AI Converter</span>
          </button>

          {/* Create New Paper Button */}
          <button
            id="new-paper-btn"
            onClick={() => createNewPaper()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm text-slate-200"
            title="Create a new blank CBT Question Paper"
          >
            <FilePlus className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">New Paper</span>
          </button>

          {/* Undo / Redo buttons */}
          <div className="flex items-center bg-slate-800 rounded-md border border-slate-700 p-0.5 shrink-0">
            <button
              id="undo-btn"
              onClick={undo}
              disabled={past.length === 0}
              className={`p-1.5 rounded transition-colors ${
                past.length > 0
                  ? 'text-slate-200 hover:bg-slate-700 active:bg-slate-600'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title={past.length > 0 ? `Undo (${lastUndoAction}) [Ctrl+Z]` : 'Undo (None)'}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="redo-btn"
              onClick={redo}
              disabled={future.length === 0}
              className={`p-1.5 rounded transition-colors ${
                future.length > 0
                  ? 'text-slate-200 hover:bg-slate-700 active:bg-slate-600'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title={future.length > 0 ? `Redo (${lastRedoAction}) [Ctrl+Y]` : 'Redo (None)'}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Blueprint & Subject Range Studio Trigger */}
          {activeArchive && (
            <button
              id="blueprint-studio-btn"
              onClick={() => setBlueprintModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm text-indigo-300 hover:text-indigo-200"
              title="Test Instructions & Subject Ranges Blueprint"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline font-semibold">Instructions & Ranges</span>
            </button>
          )}

          {/* Answer Key Studio Trigger */}
          {activeArchive && (
            <button
              id="answer-key-studio-btn"
              onClick={() => setAnswerKeyModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm text-amber-300 hover:text-amber-200"
              title="Open Answer Key Studio, upload keys & auto-classify questions"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline font-semibold">Answer Key</span>
            </button>
          )}

          {/* Bulk Operations Modal Trigger */}
          {activeArchive && (
            <button
              id="bulk-ops-btn"
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm"
              title="Bulk Renumber, Marking Presets & Merge/Split"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden lg:inline">Bulk Ops</span>
            </button>
          )}

          {/* CBT Simulator Preview */}
          {activeArchive && (
            <button
              id="cbt-preview-btn"
              onClick={() => setCbtSimulatorOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-md border border-slate-700 transition-colors shrink-0 shadow-sm"
              title="Preview in JEE Computer Based Test Simulator"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">CBT Preview</span>
            </button>
          )}
        </div>

        {/* Right: Diagnostics & Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Diagnostics Badge */}
          {activeArchive && (
            <button
              id="diagnostics-toggle-btn"
              onClick={() => setDiagnosticsOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all ${
                errorCount > 0
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25 animate-pulse'
                  : warningCount > 0
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
              }`}
              title="Open Diagnostics & Linter Drawer"
            >
              {errorCount > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              ) : warningCount > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="font-semibold">
                {errorCount > 0
                  ? `${errorCount} Errors`
                  : warningCount > 0
                  ? `${warningCount} Warn`
                  : 'Clean'}
              </span>
            </button>
          )}

          {/* Export Primary Action */}
          {activeArchive && (
            <button
              id="export-modal-btn"
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white rounded-md shadow-md shadow-blue-900/30 transition-all"
              title="Export Sanitized ZIP Archive"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export ZIP</span>
              <span className="sm:hidden">Export</span>
            </button>
          )}

          {/* AI Multi-Key Fleet & Activity Monitor */}
          <button
            id="header-ai-monitor-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-ai-monitor'))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/50 rounded-md transition-colors min-h-[32px]"
            title="AI Multi-Key Fleet & Activity Monitor"
          >
            <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span className="hidden xl:inline">AI Monitor</span>
          </button>

          {/* Settings Button */}
          <button
            id="header-settings-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
            className="flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors min-h-[32px] min-w-[32px]"
            title="Studio Settings & API Keys"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Multi-Tab Archive Strip with Drag & Drop Reordering */}
      <div className="flex items-center justify-between px-2 pt-1 border-t border-slate-800/80 bg-slate-950 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-1 overflow-x-auto">
          {/* Homepage Tab */}
          <div
            onClick={() => setActiveArchive(null)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-md cursor-pointer transition-all border-t-2 border-x select-none ${
              activeArchiveId === null
                ? 'bg-slate-900 border-t-indigo-500 border-x-slate-800 text-slate-100 font-medium shadow-md'
                : 'bg-slate-950/60 border-t-transparent border-x-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
            title="Application Homepage & Import"
          >
            <Home className={`w-3.5 h-3.5 shrink-0 ${activeArchiveId === null ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
            <span>Home</span>
          </div>

          {archives.map((archive, index) => {
            const isActive = archive.id === activeArchiveId;
            return (
              <div
                key={archive.id}
                draggable
                onDragStart={() => {
                  dragItemIndexRef.current = index;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragItemIndexRef.current !== null && dragItemIndexRef.current !== index) {
                    reorderArchives(dragItemIndexRef.current, index);
                    dragItemIndexRef.current = null;
                  }
                }}
                onClick={() => setActiveArchive(archive.id)}
                onContextMenu={(e) => handleTabContextMenu(e, archive.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer transition-all border-t-2 border-x select-none ${
                  isActive
                    ? 'bg-slate-900 border-t-indigo-500 border-x-slate-800 text-slate-100 font-medium shadow-md'
                    : 'bg-slate-950/60 border-t-transparent border-x-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
                title={`${archive.fileName}${archive.isDirty ? ' (Unsaved changes)' : ''} - Right click for options / Drag to reorder`}
              >
                <FileArchive
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                  }`}
                />
                <span className="max-w-[140px] sm:max-w-[200px] truncate">{archive.fileName}</span>

                {archive.isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"
                    title="Unsaved changes in workspace"
                  />
                )}

                {/* Single tab close button with confirmation */}
                <button
                  onClick={(e) => handleCloseSingleTab(archive.id, e)}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 opacity-60 group-hover:opacity-100 transition-opacity ml-1"
                  title="Close tab (Confirm if unsaved)"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Close All Action */}
        {archives.length > 1 && (
          <button
            onClick={handleCloseAll}
            className="hidden sm:flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-rose-300 hover:bg-rose-950/50 rounded transition-colors mb-1 shrink-0"
            title="Close all open tabs"
          >
            <X className="w-3 h-3" />
            <span>Close All</span>
          </button>
        )}
      </div>

      {/* Floating Right-Click Tab Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.max(10, Math.min(contextMenu.x, window.innerWidth - 200))}px`,
            top: `${Math.max(10, Math.min(contextMenu.y, window.innerHeight - 200))}px`,
            zIndex: 999999,
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-48 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl p-1 text-xs text-slate-200 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1.5 font-bold text-[11px] text-slate-400 truncate border-b border-slate-800 mb-1">
            {contextMenu.archiveName}
            {contextMenu.isDirty && <span className="text-amber-400 font-mono ml-1">*</span>}
          </div>

          <button
            onClick={() => {
              const id = contextMenu.archiveId;
              setContextMenu(null);
              handleCloseSingleTab(id);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between transition-colors text-rose-300 hover:text-rose-200"
          >
            <span>Close Tab</span>
            <X className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              const id = contextMenu.archiveId;
              setContextMenu(null);
              handleCloseOthers(id);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between transition-colors"
          >
            <span>Close Other Tabs</span>
            <Minimize2 className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button
            onClick={() => {
              const id = contextMenu.archiveId;
              setContextMenu(null);
              handleCloseRight(id);
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between transition-colors"
          >
            <span>Close Tabs to Right</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <div className="h-px bg-slate-800 my-1" />

          <button
            onClick={() => {
              setContextMenu(null);
              handleCloseAll();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/80 text-rose-400 hover:text-rose-200 flex items-center justify-between transition-colors"
          >
            <span>Close All Tabs</span>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  );
};
