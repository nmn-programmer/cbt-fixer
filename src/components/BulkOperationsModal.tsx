import React, { useState } from 'react';
import {
  Check,
  Combine,
  FileArchive,
  Hash,
  Layers,
  Sparkles,
  Split,
  X,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { MARKING_PRESETS } from '../utils/constants';
import { QuestionPaperArchive, SubjectData } from '../types/cbt';
import { generateId } from '../utils/constants';

export const BulkOperationsModal: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    isBulkModalOpen,
    setBulkModalOpen,
    bulkRenumberPaper,
    fixRenumberSection,
    bulkApplyMarkingScheme,
    addArchive,
  } = useCbtStore();

  const [activeTab, setActiveTab] = useState<'renumber' | 'marking' | 'merge' | 'split'>('renumber');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('jee_main_mcq');
  const [mergeArchiveIds, setMergeArchiveIds] = useState<string[]>([]);

  const activeArchive = archives.find((a) => a.id === activeArchiveId);
  if (!isBulkModalOpen || !activeArchive) return null;

  // Initialize selected section IDs
  const allSections = activeArchive.subjects.flatMap((s) => s.sections);

  const toggleSectionSelection = (secId: string) => {
    if (selectedSectionIds.includes(secId)) {
      setSelectedSectionIds(selectedSectionIds.filter((id) => id !== secId));
    } else {
      setSelectedSectionIds([...selectedSectionIds, secId]);
    }
  };

  const selectAllSections = () => {
    setSelectedSectionIds(allSections.map((s) => s.id));
  };

  const handleMergeArchives = () => {
    if (mergeArchiveIds.length < 2) {
      alert('Select at least 2 archives to merge.');
      return;
    }

    const selectedArchives = archives.filter((a) => mergeArchiveIds.includes(a.id));
    const mergedSubjects: SubjectData[] = [];
    const mergedRawFiles = new Map<string, { blob: Blob; url: string; size: number }>();

    for (const arch of selectedArchives) {
      for (const sub of arch.subjects) {
        mergedSubjects.push({
          ...sub,
          id: generateId(),
        });
      }
      for (const [path, entry] of arch.rawFiles.entries()) {
        mergedRawFiles.set(path, entry);
      }
    }

    const mergedArchive: QuestionPaperArchive = {
      id: generateId(),
      fileName: `Consolidated_Ultimate_${Date.now().toString(36)}.zip`,
      title: 'Consolidated Ultimate Question Paper',
      format: 'ultimate',
      metadata: {
        appVersion: '2.6.0',
        generatedBy: 'CBTStudioMerger',
        createdAt: new Date().toISOString(),
      },
      subjects: mergedSubjects,
      rawFiles: mergedRawFiles,
      isDirty: true,
      lastModified: Date.now(),
    };

    addArchive(mergedArchive, true);
    setBulkModalOpen(false);
  };

  const handleSplitArchive = (subjectId: string) => {
    const targetSub = activeArchive.subjects.find((s) => s.id === subjectId);
    if (!targetSub) return;

    const referencedFiles = new Set<string>();
    targetSub.sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        q.images.forEach((img) => referencedFiles.add(img.fileName));
      });
    });

    const splitRawFiles = new Map<string, { blob: Blob; url: string; size: number }>();
    for (const [path, entry] of activeArchive.rawFiles.entries()) {
      const baseName = path.split('/').pop() || path;
      if (referencedFiles.has(baseName) || referencedFiles.has(path)) {
        splitRawFiles.set(path, entry);
      }
    }

    const splitArchive: QuestionPaperArchive = {
      id: generateId(),
      fileName: `${targetSub.name.replace(/\s+/g, '_')}_Standalone.zip`,
      title: `${activeArchive.title} - ${targetSub.name}`,
      format: 'pdfCropper',
      metadata: {
        ...activeArchive.metadata,
        testTitle: `${activeArchive.title} - ${targetSub.name}`,
      },
      subjects: [targetSub],
      rawFiles: splitRawFiles,
      isDirty: true,
      lastModified: Date.now(),
    };

    addArchive(splitArchive, true);
    setBulkModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setBulkModalOpen(false)} />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-hidden z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Bulk Operations & Reorganization</h3>
              <p className="text-[11px] text-slate-400">
                Batch renumbering, template application, and multi-archive merge/split
              </p>
            </div>
          </div>
          <button
            onClick={() => setBulkModalOpen(false)}
            className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-4 pt-2 gap-2 text-xs">
          {[
            { id: 'renumber', label: 'Bulk Renumbering', icon: Hash },
            { id: 'marking', label: 'Marking Templates', icon: Sparkles },
            { id: 'merge', label: 'Merge Archives', icon: Combine },
            { id: 'split', label: 'Split Archive', icon: Split },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-all ${
                  isActive
                    ? 'border-indigo-500 text-indigo-300 font-semibold bg-slate-900/50 rounded-t'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Tab 1: Renumbering */}
          {activeTab === 'renumber' && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-lg text-slate-300">
                <div className="font-semibold text-indigo-300 mb-1">
                  Sequential Question Renumbering
                </div>
                <div className="text-[11px] text-slate-400">
                  Automatically resets question numbers sequentially (1, 2, 3... N) across sections, eliminates duplicate indices, and synchronizes image slice filenames.
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-200">Select Renumber Scope:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      bulkRenumberPaper();
                      setBulkModalOpen(false);
                    }}
                    className="p-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-left transition-colors group"
                  >
                    <div className="font-bold text-white group-hover:text-indigo-300">
                      Renumber Entire Paper
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Applies sequential 1..N numbering to all sections across all subjects.
                    </div>
                  </button>

                  {allSections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => {
                        fixRenumberSection(sec.id);
                        setBulkModalOpen(false);
                      }}
                      className="p-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-left transition-colors group"
                    >
                      <div className="font-bold text-slate-200 group-hover:text-indigo-300">
                        Renumber "{sec.name}"
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Renumber only the {sec.questions.length} questions in this section.
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Batch Marking Scheme */}
          {activeTab === 'marking' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-lg text-slate-300">
                <div className="font-semibold text-purple-300 mb-1">
                  Batch Marking Scheme Applicator
                </div>
                <div className="text-[11px] text-slate-400">
                  Select target sections and apply predefined JEE examination marking formulas in bulk.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  1. Select Marking Scheme Preset:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MARKING_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selectedPresetId === preset.id
                          ? 'bg-purple-950/40 border-purple-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold">{preset.name}</div>
                      <div className="text-[10px] text-purple-300 mt-0.5">{preset.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-300">
                    2. Select Target Sections ({selectedSectionIds.length} selected):
                  </label>
                  <button
                    onClick={selectAllSections}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Select All Sections
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-950 rounded-lg border border-slate-800">
                  {allSections.map((sec) => {
                    const isChecked = selectedSectionIds.includes(sec.id);
                    return (
                      <div
                        key={sec.id}
                        onClick={() => toggleSectionSelection(sec.id)}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-indigo-950/50 text-white'
                            : 'hover:bg-slate-900 text-slate-400'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                            isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-800'
                          }`}
                        >
                          {isChecked && '✓'}
                        </div>
                        <span className="font-medium truncate">{sec.name}</span>
                        <span className="text-[10px] text-slate-500">({sec.questions.length} Qs)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  if (selectedSectionIds.length === 0) {
                    alert('Please select at least one section.');
                    return;
                  }
                  bulkApplyMarkingScheme(selectedSectionIds, selectedPresetId);
                  setBulkModalOpen(false);
                }}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 font-bold text-white rounded-lg transition-colors shadow-md"
              >
                Apply Scheme to {selectedSectionIds.length} Section(s)
              </button>
            </div>
          )}

          {/* Tab 3: Merge Archives */}
          {activeTab === 'merge' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded-lg text-slate-300">
                <div className="font-semibold text-blue-300 mb-1">
                  Consolidated Ultimate ZIP Merger
                </div>
                <div className="text-[11px] text-slate-400">
                  Combine distinct subject archives (e.g. Physics.zip + Chemistry.zip + Maths.zip) into a single Ultimate Archive with nested subject folders.
                </div>
              </div>

              {archives.length < 2 ? (
                <div className="text-center py-6 text-slate-400">
                  <FileArchive className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <div>You need at least 2 open archives in the workspace to merge.</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Import more ZIP files from the top bar or dropzone.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-300">
                      Select Archives to Combine:
                    </label>
                    {archives.map((arch) => {
                      const isChecked = mergeArchiveIds.includes(arch.id);
                      return (
                        <div
                          key={arch.id}
                          onClick={() => {
                            if (isChecked) {
                              setMergeArchiveIds(mergeArchiveIds.filter((id) => id !== arch.id));
                            } else {
                              setMergeArchiveIds([...mergeArchiveIds, arch.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-blue-950/40 border-blue-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                                isChecked ? 'bg-blue-600 text-white' : 'bg-slate-800'
                              }`}
                            >
                              {isChecked && '✓'}
                            </div>
                            <span className="font-semibold">{arch.fileName}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {arch.subjects.length} Subject(s)
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleMergeArchives}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-lg transition-colors shadow-md"
                  >
                    Combine Selected ({mergeArchiveIds.length}) into Ultimate Archive
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Split Archive */}
          {activeTab === 'split' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-slate-300">
                <div className="font-semibold text-emerald-300 mb-1">
                  Extract Standalone Subject Archives
                </div>
                <div className="text-[11px] text-slate-400">
                  Split the active multi-subject archive into clean, isolated single-subject archives containing only relevant questions and image slices.
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-slate-300">
                  Select Subject to Extract:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeArchive.subjects.map((sub) => {
                    const qCount = sub.sections.reduce((s, sec) => s + sec.questions.length, 0);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => handleSplitArchive(sub.id)}
                        className="p-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-left transition-colors group"
                      >
                        <div className="font-bold text-white group-hover:text-emerald-400">
                          Extract "{sub.name}"
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {sub.sections.length} Section(s) • {qCount} Questions
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
