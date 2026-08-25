import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';

export const ConfirmDialog: React.FC = () => {
  const { confirmDialog, hideConfirm } = useCbtStore();

  if (!confirmDialog) return null;

  const { isOpen, title, message, onConfirm, onCancel } = confirmDialog;

  const handleCancel = () => {
    hideConfirm();
    if (onCancel) onCancel();
  };

  const handleConfirm = () => {
    hideConfirm();
    onConfirm();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Dialog Card Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl"
          >
            {/* Header / Accent Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              </div>
              <button
                onClick={handleCancel}
                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4">
              <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                {message}
              </p>
            </div>

            {/* Action Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 bg-slate-950/30 px-4 py-3">
              <button
                onClick={handleCancel}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 active:bg-rose-700 shadow-md shadow-rose-950/20 transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
