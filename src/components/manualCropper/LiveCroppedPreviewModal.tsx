import React from 'react';
import { X, Check, Copy, Download, ZoomIn } from 'lucide-react';

interface LiveCroppedPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewUrl: string;
  ocrText?: string;
  onApply?: () => void;
  title?: string;
}

export const LiveCroppedPreviewModal: React.FC<LiveCroppedPreviewModalProps> = ({
  isOpen,
  onClose,
  previewUrl,
  ocrText,
  onApply,
  title = 'Live Cropped Image Slice Inspection',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <ZoomIn className="w-4 h-4 text-indigo-400" />
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          <div className="bg-white/5 border border-slate-800 rounded-xl p-3 flex justify-center items-center overflow-auto min-h-[200px]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Cropped Preview"
                className="max-h-96 object-contain rounded shadow-lg"
              />
            ) : (
              <div className="text-xs text-slate-500 font-mono">No preview image loaded</div>
            )}
          </div>

          {ocrText && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                <span>Extracted Text Layer</span>
                <button
                  onClick={() => navigator.clipboard.writeText(ocrText)}
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-normal lowercase"
                >
                  <Copy className="w-3 h-3" />
                  <span>copy</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                {ocrText}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition-colors"
          >
            Close
          </button>
          {previewUrl && (
            <a
              href={previewUrl}
              download="cropped_slice.png"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Image</span>
            </a>
          )}
          {onApply && (
            <button
              onClick={() => {
                onApply();
                onClose();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Slice</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
