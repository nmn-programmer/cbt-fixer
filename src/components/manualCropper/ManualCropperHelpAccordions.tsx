import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Sliders,
  Crop,
  Layers,
  Sparkles,
  Keyboard,
  FileQuestion,
  Info,
  CheckCircle2,
  Columns,
  Scissors
} from 'lucide-react';

interface AccordionItemProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <div className="border-b border-emerald-950/60 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full py-3.5 px-4 flex items-center justify-between text-left text-slate-300 hover:text-emerald-300 hover:bg-emerald-950/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-emerald-400">{icon}</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-emerald-400/80 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-300' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed border-t border-emerald-950/40 bg-slate-900/40 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
};

export const ManualCropperHelpAccordions: React.FC = () => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    about: false,
    leftPanel: false,
    questionDetails: false,
    steps: false,
    textPattern: false,
    shortcuts: false,
    specialFormats: false,
  });

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full max-w-2xl mx-auto border border-emerald-500/30 bg-slate-950/90 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Top Banner Green Header matching reference */}
      <div className="p-5 text-center border-b border-emerald-500/30 bg-emerald-950/20">
        <h3 className="text-sm sm:text-base font-semibold text-emerald-400">
          This page/tool is used to create CBT from PDF by defining questions and their locations in the PDF.
        </h3>
        <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-center gap-1.5">
          <span>Click any topic below to learn how to crop, split, and produce CBT tests.</span>
        </p>
      </div>

      {/* Accordion Sections List */}
      <div className="divide-y divide-emerald-950/40">
        {/* 1. About Test Maker Page */}
        <AccordionItem
          title="About Test Maker Page"
          icon={<Info className="w-4 h-4" />}
          isOpen={openItems.about}
          onToggle={() => toggleItem('about')}
        >
          <p className="mb-2">
            The <strong>Test Maker Studio</strong> provides a precise, visual, and zero-loss method to convert any question paper PDF into a computer-based test (CBT).
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
            <li>You have full control over the exact cropping area, question numbering, and subject classification.</li>
            <li>Supports single-column, 2-column, multi-page split questions, and complex mathematical formulas without OCR degradation.</li>
            <li>All cropped images are extracted at high 300 DPI native canvas resolution for razor-sharp rendering on CBT student screens.</li>
          </ul>
        </AccordionItem>

        {/* 2. About things on the left panel */}
        <AccordionItem
          title="About things on the left panel"
          icon={<Sliders className="w-4 h-4" />}
          isOpen={openItems.leftPanel}
          onToggle={() => toggleItem('leftPanel')}
        >
          <div className="space-y-2">
            <div>
              <span className="font-semibold text-emerald-300">Zoom & Mode Bar:</span> Adjust canvas magnification, switch between Crop Mode, Edit Mode, and Full Preview.
            </div>
            <div>
              <span className="font-semibold text-emerald-300">Cropper Modes:</span> Choose between <strong>Box Cropper</strong> (rectangular drag with 8 handles), <strong>Line Cropper</strong> (click top and bottom boundary lines), and <strong>Pattern Cropper</strong> (auto-detect question marks).
            </div>
            <div>
              <span className="font-semibold text-emerald-300">Page Navigation:</span> Move across pages seamlessly or click the thumbnail drawer to jump directly to any page.
            </div>
            <div>
              <span className="font-semibold text-emerald-300">Finish Cropping:</span> Once you have cropped all questions, clicking this generates the complete CBT Paper and opens it directly in the CBT Studio workspace!
            </div>
          </div>
        </AccordionItem>

        {/* 3. Question Details */}
        <AccordionItem
          title="Question Details"
          icon={<FileQuestion className="w-4 h-4" />}
          isOpen={openItems.questionDetails}
          onToggle={() => toggleItem('questionDetails')}
        >
          <div className="space-y-2">
            <p>Every cropped question holds structured metadata for the computer-based test:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li><strong className="text-slate-200">Subject & Section Name:</strong> Type or select from suggestions (e.g., Physics, Chemistry, Mathematics, Section A, Section B).</li>
              <li><strong className="text-slate-200">Question Number:</strong> Automatically increments after saving, or can be set manually.</li>
              <li><strong className="text-slate-200">Question Type:</strong> Single Choice (MCQ), Multi-Select (MSQ), Numerical Value (NAT), or Matrix Match (MSM).</li>
              <li><strong className="text-slate-200">Marking Scheme:</strong> Define Correct Marks (+4), Negative Marks (-1 or 0), and partial marks for accurate CBT scoring.</li>
            </ul>
          </div>
        </AccordionItem>

        {/* 4. Steps for Using the Test Maker */}
        <AccordionItem
          title="Steps for Using the Test Maker"
          icon={<CheckCircle2 className="w-4 h-4" />}
          isOpen={openItems.steps}
          onToggle={() => toggleItem('steps')}
        >
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
            <li><span className="font-medium text-emerald-300">Upload PDF:</span> Click &quot;Select a PDF&quot; or drop your paper onto the canvas.</li>
            <li><span className="font-medium text-emerald-300">Set Subject & Section:</span> Choose your subject (e.g. Physics) and section (e.g. Section 1).</li>
            <li><span className="font-medium text-emerald-300">Select Cropping Region:</span> Drag a box or use Line Cropper over Question 1.</li>
            <li><span className="font-medium text-emerald-300">Save & Advance:</span> Click &quot;Save Crop [Enter]&quot;. The question is stored and the counter advances to Question 2.</li>
            <li><span className="font-medium text-emerald-300">Review & Finish:</span> Inspect your questions in the bottom strip, then click &quot;Finish Cropping&quot; to import directly to CBT Studio.</li>
          </ol>
        </AccordionItem>

        {/* 5. Precision Loupe & Smart Auto-Trim */}
        <AccordionItem
          title="Precision Loupe & Smart Auto-Trim"
          icon={<Sparkles className="w-4 h-4" />}
          isOpen={openItems.textPattern}
          onToggle={() => toggleItem('textPattern')}
        >
          <div className="space-y-2">
            <p className="text-slate-300">
              To ensure mathematical equations, fractions, and superscripts are never clipped:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li><strong className="text-slate-200">Interactive Precision Loupe:</strong> When resizing corner or edge handles, a 2.5x circular magnified loupe with pixel crosshairs tracks your pointer so boundaries align to exact sub-pixels.</li>
              <li><strong className="text-slate-200">Smart Auto-Trim:</strong> Click &quot;Smart Auto-Trim&quot; to auto-detect the luminance of non-white content within the box and shrink borders directly to the equation edges.</li>
              <li><strong className="text-slate-200">Peek Text / Q#:</strong> Click &quot;Peek Text / Q#&quot; to extract the text under the crop box directly from the PDF layer to confirm numbering.</li>
            </ul>
          </div>
        </AccordionItem>

        {/* 6. Context menus and keyboard shortcuts */}
        <AccordionItem
          title="Context menus and keyboard shortcuts"
          icon={<Keyboard className="w-4 h-4" />}
          isOpen={openItems.shortcuts}
          onToggle={() => toggleItem('shortcuts')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Save & Next Question:</span>
              <kbd className="px-1.5 py-0.5 bg-emerald-900/60 text-emerald-300 rounded font-bold">Enter</kbd>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Pan Canvas:</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded">Space + Drag</kbd>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Nudge Box 1px:</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded">Arrow Keys</kbd>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Nudge Box 10px:</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded">Shift + Arrows</kbd>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Prev / Next Page:</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded">[ / ]</kbd>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-900 rounded border border-slate-800">
              <span className="text-slate-400">Undo / Redo:</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-200 rounded">Ctrl+Z / Ctrl+Y</kbd>
            </div>
          </div>
        </AccordionItem>

        {/* 7. Dealing with some special/weird question formats */}
        <AccordionItem
          title="Dealing with some special/weird question formats"
          icon={<Scissors className="w-4 h-4" />}
          isOpen={openItems.specialFormats}
          onToggle={() => toggleItem('specialFormats')}
        >
          <div className="space-y-2">
            <div>
              <strong className="text-emerald-300">Multi-Part / Split Questions:</strong> When a question starts at the bottom of Column 1 and continues on Column 2 (or next page), click <span className="px-1 py-0.5 bg-emerald-950 text-emerald-400 font-semibold rounded">+ Add Part 2</span>. Draw Box 2 over the continuation. Both parts will be seamlessly stitched into a single image!
            </div>
            <div>
              <strong className="text-emerald-300">2-Column Layout Papers:</strong> Use the Column Snap buttons (Left Column / Right Column) to instantly snap the horizontal bounds to the column gutter, ensuring zero edge clipping.
            </div>
            <div>
              <strong className="text-emerald-300">Fixing Past Mistakes:</strong> Click on any question in the bottom timeline to instantly reload its coordinates, adjust the box, and hit Update Question!
            </div>
          </div>
        </AccordionItem>
      </div>
    </div>
  );
};
