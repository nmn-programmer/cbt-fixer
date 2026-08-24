import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FileCode,
  Layers,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCbtStore } from '../store/useCbtStore';
import { serializeDataJson, serializeZipArchive } from '../utils/zipSerializer';

export const ExportModal: React.FC = () => {
  const { archives, activeArchiveId, isExportModalOpen, setExportModalOpen, diagnostics, addToast } =
    useCbtStore();

  const [exportFormat, setExportFormat] = useState<'pdfCropper' | 'ultimate' | 'dataJsonOnly'>(
    'pdfCropper'
  );
  const [sanitizeFilenames, setSanitizeFilenames] = useState<boolean>(true);
  const [stripOrphaned, setStripOrphaned] = useState<boolean>(true);
  const [autoRenumber, setAutoRenumber] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStats, setExportStats] = useState<{ questions: number; images: number; size: number } | null>(
    null
  );

  const activeArchive = archives.find((a) => a.id === activeArchiveId);
  if (!isExportModalOpen || !activeArchive) return null;

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const handleExecuteExport = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'dataJsonOnly') {
        const result = serializeDataJson(activeArchive, autoRenumber);
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const result = await serializeZipArchive(activeArchive, {
          format: exportFormat,
          sanitizeFilenames,
          stripOrphanedImages: stripOrphaned,
          autoRenumberSequentially: autoRenumber,
          compressionLevel: 6,
        });

        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);

        setExportStats({
          questions: result.stats.totalQuestions,
          images: result.stats.totalImages,
          size: result.stats.byteSize,
        });

        // Trigger celebratory confetti
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err: any) {
      console.warn('Export notice:', err?.message || err);
      addToast({
        title: 'Export Failed',
        description: err.message || 'An error occurred while compiling export package.',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={() => setExportModalOpen(false)}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Sanitize & Export CBT Archive</h3>
              <p className="text-[11px] text-slate-400">
                Generate production-ready, schema-validated ZIP package
              </p>
            </div>
          </div>
          <button
            onClick={() => setExportModalOpen(false)}
            className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Health Check Banner */}
          <div
            className={`p-3 rounded-lg border flex items-center justify-between ${
              errorCount > 0
                ? 'bg-rose-950/20 border-rose-900/60 text-rose-300'
                : warningCount > 0
                ? 'bg-amber-950/20 border-amber-900/60 text-amber-300'
                : 'bg-emerald-950/20 border-emerald-900/60 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {errorCount > 0 ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <div>
                <span className="font-bold">
                  {errorCount > 0
                    ? `Pre-Export Warning: ${errorCount} schema errors detected`
                    : 'Pre-Export Validation Passed'}
                </span>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {errorCount > 0
                    ? 'Exporting with sanitization options enabled will auto-repair filename syntax.'
                    : 'All question formats and image files are verified.'}
                </div>
              </div>
            </div>
          </div>

          {/* Export Target Format */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-300">1. Target Export Format:</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'pdfCropper',
                  label: 'Standard pdfCropper',
                  desc: 'Root data.json + strict delimited images',
                  icon: FileArchive,
                },
                {
                  id: 'ultimate',
                  label: 'Ultimate Archive',
                  desc: 'Nested subject folders (Physics/data.json)',
                  icon: Layers,
                },
                {
                  id: 'dataJsonOnly',
                  label: 'Clean data.json',
                  desc: 'Standalone sanitized JSON descriptor',
                  icon: FileCode,
                },
              ].map((fmt) => {
                const Icon = fmt.icon;
                const isSelected = exportFormat === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => setExportFormat(fmt.id as any)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mb-1.5 ${
                        isSelected ? 'text-indigo-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="font-bold">{fmt.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{fmt.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sanitization Toggles */}
          {exportFormat !== 'dataJsonOnly' && (
            <div className="space-y-2">
              <label className="block font-bold text-slate-300">
                2. Automated Packaging & Sanitization Options:
              </label>

              <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sanitizeFilenames}
                    onChange={(e) => setSanitizeFilenames(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">
                      Standardize Filename Delimiters
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Enforce strict <code>&lt;Section&gt;__--__&lt;QNo&gt;__--__&lt;Part&gt;.png</code> naming.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stripOrphaned}
                    onChange={(e) => setStripOrphaned(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">
                      Strip Orphaned / Unlinked Images
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Exclude unused binary files to keep ZIP size lean and clean.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenumber}
                    onChange={(e) => setAutoRenumber(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">
                      Auto-Renumber Sequentially (1..N)
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Fix gaps and duplicate indices on the exported archive.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Export Success Stats */}
          {exportStats && (
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg flex items-center justify-between text-emerald-300">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Export Succeeded!</span>
              </span>
              <span className="text-[11px]">
                {exportStats.questions} Questions • {exportStats.images} Images •{' '}
                {Math.round(exportStats.size / 1024)} KB
              </span>
            </div>
          )}

          {/* Primary Download Button */}
          <button
            id="execute-export-download-btn"
            onClick={handleExecuteExport}
            disabled={isExporting}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold text-white rounded-lg transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Packaging & Compressing Archive...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Export & Download {exportFormat === 'dataJsonOnly' ? 'data.json' : 'Sanitized ZIP'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
