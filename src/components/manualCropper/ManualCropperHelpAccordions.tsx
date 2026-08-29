import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Keyboard, HelpCircle, Magnet, Crop, Sparkles } from 'lucide-react';

export const ManualCropperHelpAccordions: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('shortcuts');

  const toggle = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-2 text-xs text-slate-300">
      {/* Shortcuts section */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <button
          onClick={() => toggle('shortcuts')}
          className="w-full px-3 py-2 flex items-center justify-between text-left font-bold text-slate-200 hover:bg-slate-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
            <span>Keyboard Shortcuts</span>
          </span>
          {openSection === 'shortcuts' ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {openSection === 'shortcuts' && (
          <div className="p-3 border-t border-slate-800/80 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Shift + Drag</span>
              <span className="text-indigo-300">Draw new custom crop box</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Keys 1, 2, 3</span>
              <span className="text-indigo-300">Left / Right / Full Width column snap</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Key S</span>
              <span className="text-indigo-300">Magnetic whitespace valley snap</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Key L</span>
              <span className="text-indigo-300">Toggle 3.0x precision loupe magnifier</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Key W</span>
              <span className="text-indigo-300">Toggle auto scanner background whitening</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400">Enter / Ctrl+S</span>
              <span className="text-indigo-300">Commit crop slice to active archive</span>
            </div>
          </div>
        )}
      </div>

      {/* Column Snapping Guide */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <button
          onClick={() => toggle('snapping')}
          className="w-full px-3 py-2 flex items-center justify-between text-left font-bold text-slate-200 hover:bg-slate-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Magnet className="w-3.5 h-3.5 text-emerald-400" />
            <span>4-Line Column Guidelines</span>
          </span>
          {openSection === 'snapping' ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {openSection === 'snapping' && (
          <div className="p-3 border-t border-slate-800/80 space-y-2 text-slate-400 text-[11px] leading-relaxed">
            <p>
              Standard two-column question papers follow explicit horizontal layout boundaries:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li>Left Column: xmin = 0.035, xmax = 0.490</li>
              <li>Right Column: xmin = 0.508, xmax = 0.965</li>
            </ul>
            <p>
              Drag boxes close to these boundaries to automatically snap them into exact alignment.
            </p>
          </div>
        )}
      </div>

      {/* Multi-part Cropping */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <button
          onClick={() => toggle('multipart')}
          className="w-full px-3 py-2 flex items-center justify-between text-left font-bold text-slate-200 hover:bg-slate-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Crop className="w-3.5 h-3.5 text-purple-400" />
            <span>Split & Multi-Part Questions</span>
          </span>
          {openSection === 'multipart' ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {openSection === 'multipart' && (
          <div className="p-3 border-t border-slate-800/80 text-slate-400 text-[11px] leading-relaxed">
            When a question spans across two columns or multiple pages, use "Add Part" or multi-box stitching to cleanly merge multiple slices into a single question card.
          </div>
        )}
      </div>
    </div>
  );
};
