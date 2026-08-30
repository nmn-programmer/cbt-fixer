import React from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Sparkles,
  Sun,
  Moon,
  Download,
  Check,
  Split,
  Eye
} from 'lucide-react';

interface LiveCroppedPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  previewUrl: string;
  isStitched?: boolean;
  partsCount?: number;
  autoWhiten: boolean;
  onToggleAutoWhiten: () => void;
  invertColors: boolean;
  onToggleInvertColors: () => void;
}

export const LiveCroppedPreviewModal: React.FC<LiveCroppedPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  previewUrl,
  isStitched,
  partsCount,
  autoWhiten,
  onToggleAutoWhiten,
  invertColors,
  onToggleInvertColors,
}) => {
  if (!isOpen || !previewUrl) return null;

  const handleDownloadImage = () => {
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{title}</span>
                {isStitched && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Stitched ({partsCount} Parts)
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">High-Resolution Native Crop Inspection</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAutoWhiten}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                autoWhiten
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Auto Whiten Background"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Clean Background</span>
            </button>

            <button
              onClick={onToggleInvertColors}
              className={`p-1.5 rounded-lg border transition-colors ${
                invertColors
                  ? 'bg-purple-950 text-purple-300 border-purple-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Invert Colors (Dark Mode Preview)"
            >
              {invertColors ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownloadImage}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
              title="Download High-Res PNG"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-950/60 min-h-[300px]">
          <div
            className={`max-w-full rounded-xl border p-2 transition-all shadow-xl ${
              invertColors
                ? 'bg-slate-900 border-purple-800/60 filter invert hue-rotate-180'
                : 'bg-white border-slate-200'
            }`}
          >
            <img
              src={previewUrl}
              alt="High-Res Crop Preview"
              className="max-h-[60vh] max-w-full object-contain rounded"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>Resolution: Native 300 DPI Rendering</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-sm transition-colors"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
};
