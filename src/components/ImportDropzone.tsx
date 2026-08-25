import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode,
  FilePlus,
  FlaskConical,
  FolderOpen,
  Key,
  Plus,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { parseZipArchive } from '../utils/zipParser';
import {
  applyClassificationToArchive,
  classifyAndMatchAnswerKey,
  mergeMultipleAnswerKeys,
  parseAnswerKeyPayload,
} from '../utils/answerKeyManager';

export const ImportDropzone: React.FC = () => {
  const { addArchive, loadSample, createNewPaper, setAnswerKeyModalOpen, addToast } = useCbtStore();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);

    const zipFiles: File[] = [];
    const keyFiles: File[] = [];
    const pdfFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf')) {
        pdfFiles.push(file);
      } else if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
        zipFiles.push(file);
      } else if (file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')) {
        keyFiles.push(file);
      }
    }

    try {
      if (pdfFiles.length > 0) {
        // PDF dropped: open Auto PDF Converter Modal
        useCbtStore.getState().setPdfConverterModalOpen(true);
        addToast({
          title: 'PDF Detected',
          description: 'Opening Auto PDF Converter. Select your file in the modal to begin.',
          type: 'info',
        });
        return;
      }

      // Case 1: Both ZIP and Answer Key files dropped together!
      if (zipFiles.length > 0 && keyFiles.length > 0) {
        for (const zipFile of zipFiles) {
          setLoadingStatus(`Parsing Question Paper ZIP: ${zipFile.name}...`);
          const zipResult = await parseZipArchive(zipFile, zipFile.name);
          let archive = zipResult.archive;

          const loadedKeyFiles = await Promise.all(
            keyFiles.map(async (kf, idx) => {
              const text = await kf.text();
              return {
                id: `key-${idx}`,
                name: kf.name,
                size: kf.size,
                content: text,
                parseResult: parseAnswerKeyPayload(text),
                enabled: true,
                uploadedAt: Date.now() + idx,
              };
            })
          );

          const { parseResult } = mergeMultipleAnswerKeys(loadedKeyFiles);
          if (parseResult.isValid) {
            const classification = classifyAndMatchAnswerKey(archive, parseResult);
            archive = applyClassificationToArchive(archive, classification, true);
          }

          addArchive(archive, true);
        }
      } else if (zipFiles.length > 0) {
        // Case 2: Only ZIP files dropped
        for (const zipFile of zipFiles) {
          setLoadingStatus(`Parsing ${zipFile.name}...`);
          const result = await parseZipArchive(zipFile, zipFile.name);
          addArchive(result.archive, true);
        }
      } else if (keyFiles.length > 0) {
        // Case 3: Only Answer Key dropped -> Open Answer Key Studio
        setAnswerKeyModalOpen(true);
      }
    } catch (err: any) {
      console.warn('Import notice:', err?.message || err);
      addToast({
        title: 'Import Notice',
        description: `Error processing files: ${err.message}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-slate-950 text-slate-100 select-none">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept=".zip,.pdf,.json,.csv,.txt,application/pdf,application/zip"
        multiple
        className="hidden"
      />

      <div className="w-full max-w-3xl space-y-6">
        {/* Main Dropzone Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-950/30 scale-102 shadow-2xl'
              : 'border-slate-800 hover:border-slate-700 bg-slate-900/60 shadow-xl'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40 mb-4">
            {isLoading ? (
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-8 h-8" />
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Drop Question Paper ZIP and/or Answer Key Files Here
          </h2>

          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mt-1.5 leading-relaxed">
            Drop your Question Paper ZIP along with its Answer Key JSON/CSV for simultaneous intelligent question classification and auto-marking.
          </p>

          {loadingStatus && (
            <div className="mt-3 text-xs text-indigo-400 font-mono animate-pulse">
              {loadingStatus}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Browse ZIPs</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                useCbtStore.getState().setPdfConverterModalOpen(true);
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition-colors flex items-center gap-2"
            >
              <Wand2 className="w-4 h-4" />
              <span>Auto PDF → ZIP (AI)</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setAnswerKeyModalOpen(true);
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
            >
              <Key className="w-4 h-4 text-amber-400" />
              <span>Answer Key Studio</span>
            </button>
          </div>
        </div>

        {/* Quick Launch Sample Fixtures */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Interactive Test Fixtures & Presets</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <button
              onClick={() => loadSample('flawed')}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 rounded-xl text-left transition-all group shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div className="font-bold text-white group-hover:text-amber-300">
                  Flawed Test Archive
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Missing parts, unkeyed items & syntax flaws to test diagnostics.
                </div>
              </div>
            </button>

            <button
              onClick={() => loadSample('chemistry_adv')}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 rounded-xl text-left transition-all group shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <FlaskConical className="w-3.5 h-3.5" />
                </div>
                <div className="font-bold text-white group-hover:text-purple-300">
                  JEE Adv Chemistry
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Multi-slice questions (Q18-Q34) ready for Answer Key matching.
                </div>
              </div>
            </button>

            <button
              onClick={() => loadSample('clean')}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-left transition-all group shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="font-bold text-white group-hover:text-emerald-300">
                  Clean JEE Paper
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Pristine 3-subject paper with MCQ and NAT questions.
                </div>
              </div>
            </button>

            <button
              onClick={() => createNewPaper()}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-xl text-left transition-all group shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <FilePlus className="w-3.5 h-3.5" />
                </div>
                <div className="font-bold text-white group-hover:text-blue-300">
                  Blank Paper
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Start fresh with unkeyed question structures.
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
