import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder,
  FolderPlus,
  HelpCircle,
  Image,
  Layers,
  MoreVertical,
  MoveDown,
  MoveUp,
  Plus,
  Search,
  Trash2,
  X,
  FileQuestion,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import { QuestionType, SubjectData, SectionData, QuestionData } from '../types/cbt';
import { QuestionHoverTrigger } from './QuestionHoverTrigger';

export const SidebarTree: React.FC = () => {
  const {
    archives,
    activeArchiveId,
    selectedSubjectId,
    selectedSectionId,
    selectedQuestionId,
    selectQuestion,
    diagnostics,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    addSubject,
    renameSubject,
    deleteSubject,
    moveSubject,
    addSection,
    renameSection,
    deleteSection,
    moveSection,
    addQuestion,
    deleteQuestion,
    duplicateQuestion,
    moveQuestion,
  } = useCbtStore();

  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');

  const activeArchive = archives.find((a) => a.id === activeArchiveId);

  // Initialize expanded state on first load
  React.useEffect(() => {
    if (activeArchive) {
      const subState: Record<string, boolean> = {};
      const secState: Record<string, boolean> = {};
      activeArchive.subjects.forEach((sub) => {
        subState[sub.id] = true;
        sub.sections.forEach((sec) => {
          secState[sec.id] = true;
        });
      });
      setExpandedSubjects((prev) => ({ ...subState, ...prev }));
      setExpandedSections((prev) => ({ ...secState, ...prev }));
    }
  }, [activeArchiveId]);

  if (!activeArchive) return null;

  // Build diagnostic issue lookup by questionId and sectionId
  const errorMap = new Map<string, number>();
  const warningMap = new Map<string, number>();

  diagnostics.forEach((d) => {
    const qId = d.location.questionId;
    const secId = d.location.sectionId;

    if (qId) {
      if (d.severity === 'error') errorMap.set(qId, (errorMap.get(qId) || 0) + 1);
      if (d.severity === 'warning') warningMap.set(qId, (warningMap.get(qId) || 0) + 1);
    }
    if (secId) {
      if (d.severity === 'error') errorMap.set(secId, (errorMap.get(secId) || 0) + 1);
      if (d.severity === 'warning') warningMap.set(secId, (warningMap.get(secId) || 0) + 1);
    }
  });

  const toggleSubject = (id: string) => {
    setExpandedSubjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const commitEdit = (type: 'subject' | 'section', id: string) => {
    if (editName.trim()) {
      if (type === 'subject') renameSubject(id, editName.trim());
      if (type === 'section') renameSection(id, editName.trim());
    }
    setEditingId(null);
  };

  const matchesFilter = (q: QuestionData) => {
    // Search match
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchQue = `q${q.que}`.includes(term) || `${q.que}`.includes(term) || q.key.includes(term);
      const matchNotes = q.notes?.toLowerCase().includes(term);
      const matchAns = q.answerOptions.toLowerCase().includes(term);
      if (!matchQue && !matchNotes && !matchAns) return false;
    }

    // Type / Diagnostic match
    if (filterType === 'all') return true;
    if (filterType === 'errors') return (errorMap.get(q.id) || 0) > 0;
    if (filterType === 'warnings') return (warningMap.get(q.id) || 0) > 0;
    if (filterType === 'flagged') return q.isFlagged === true;
    if (['mcq', 'msq', 'nat', 'msm'].includes(filterType)) return q.type === filterType;

    return true;
  };

  const treeContent = (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200 select-none text-xs">
      {/* Search & Filter Header */}
      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/90 backdrop-blur shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Structure Navigator</span>
          </div>
          <button
            onClick={() => addSubject()}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            title="Add New Subject (e.g. Mathematics)"
          >
            <Plus className="w-3 h-3 text-indigo-400" />
            <span>Subject</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search questions (Q1, keys, answers)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
          {[
            { id: 'all', label: 'All' },
            { id: 'errors', label: '🚨 Errors' },
            { id: 'warnings', label: '⚠️ Warn' },
            { id: 'mcq', label: 'MCQ' },
            { id: 'msq', label: 'MSQ' },
            { id: 'nat', label: 'NAT' },
            { id: 'msm', label: 'MSM' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterType(item.id)}
              className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                filterType === item.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tree View Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {activeArchive.subjects.map((subject, subIndex) => {
          const isSubExpanded = expandedSubjects[subject.id] !== false;

          return (
            <div key={subject.id} className="rounded-lg bg-slate-950/40 border border-slate-800/80 overflow-hidden">
              {/* Subject Row */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-semibold group transition-colors">
                <div
                  className="flex items-center gap-1.5 flex-1 cursor-pointer truncate"
                  onClick={() => toggleSubject(subject.id)}
                >
                  {isSubExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />

                  {editingId === subject.id ? (
                    <input
                      type="text"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitEdit('subject', subject.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit('subject', subject.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="bg-slate-900 border border-indigo-500 rounded px-1 py-0 text-xs text-white"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate" title={subject.name}>
                      {subject.name}
                    </span>
                  )}
                </div>

                {/* Subject Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addSection(subject.id);
                    }}
                    className="p-1 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded"
                    title="Add Section to Subject"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(subject.id, subject.name);
                    }}
                    className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded"
                    title="Rename Subject"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {subIndex > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSubject(subject.id, 'up');
                      }}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded"
                      title="Move Subject Up"
                    >
                      <MoveUp className="w-3 h-3" />
                    </button>
                  )}
                  {subIndex < activeArchive.subjects.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSubject(subject.id, 'down');
                      }}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded"
                      title="Move Subject Down"
                    >
                      <MoveDown className="w-3 h-3" />
                    </button>
                  )}
                  {activeArchive.subjects.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete subject "${subject.name}" and all its questions?`)) {
                          deleteSubject(subject.id);
                        }
                      }}
                      className="p-1 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded"
                      title="Delete Subject"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sections Container */}
              {isSubExpanded && (
                <div className="p-1.5 space-y-1.5">
                  {subject.sections.map((section, secIndex) => {
                    const isSecExpanded = expandedSections[section.id] !== false;
                    const secErrors = errorMap.get(section.id) || 0;
                    const secWarnings = warningMap.get(section.id) || 0;
                    const filteredQuestions = section.questions.filter(matchesFilter);

                    return (
                      <div
                        key={section.id}
                        className="rounded-md border border-slate-800/60 bg-slate-900/40 overflow-hidden"
                      >
                        {/* Section Header */}
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-850 hover:bg-slate-800/80 group text-slate-300 transition-colors">
                          <div
                            className="flex items-center gap-1.5 flex-1 cursor-pointer truncate"
                            onClick={() => toggleSection(section.id)}
                          >
                            {isSecExpanded ? (
                              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                            <FolderPlus className="w-3 h-3 text-blue-400 shrink-0" />

                            {editingId === section.id ? (
                              <input
                                type="text"
                                value={editName}
                                autoFocus
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => commitEdit('section', section.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit('section', section.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="bg-slate-900 border border-indigo-500 rounded px-1 py-0 text-xs text-white"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className="font-medium truncate" title={section.name}>
                                {section.name}
                              </span>
                            )}

                            <span className="text-[10px] text-slate-500 px-1 py-0.2 rounded bg-slate-800">
                              {section.questions.length}
                            </span>

                            {secErrors > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-ping" />
                            )}
                          </div>

                          {/* Section Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addQuestion(section.id, 'mcq');
                              }}
                              className="p-1 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded"
                              title="Add Question"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(section.id, section.name);
                              }}
                              className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded"
                              title="Rename Section"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {subject.sections.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete section "${section.name}"?`)) {
                                    deleteSection(section.id);
                                  }
                                }}
                                className="p-1 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded"
                                title="Delete Section"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Questions List */}
                        {isSecExpanded && (
                          <div className="p-1 space-y-0.5">
                            {filteredQuestions.length === 0 ? (
                              <div className="py-2 text-center text-slate-500 text-[11px] italic">
                                {section.questions.length === 0 ? 'No questions in section' : 'No matching questions'}
                              </div>
                            ) : (
                              filteredQuestions.map((q) => {
                                const isSelected = q.id === selectedQuestionId;
                                const qErrors = errorMap.get(q.id) || 0;
                                const qWarnings = warningMap.get(q.id) || 0;

                                return (
                                  <QuestionHoverTrigger
                                    key={q.id}
                                    question={q}
                                    subjectName={subject.name}
                                    sectionName={section.name}
                                    archiveId={activeArchiveId || undefined}
                                    onClick={() => {
                                      selectQuestion(subject.id, section.id, q.id);
                                      setMobileSidebarOpen(false);
                                    }}
                                    className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-all ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white font-medium shadow-sm'
                                        : 'hover:bg-slate-800/80 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      {/* Question Number Badge */}
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                          isSelected
                                            ? 'bg-white/20 text-white'
                                            : 'bg-slate-800 text-slate-300'
                                        }`}
                                      >
                                        Q{q.que}
                                      </span>

                                      {/* Type Tag */}
                                      <span
                                        className={`text-[9px] uppercase font-semibold px-1 py-0.2 rounded ${
                                          q.type === 'mcq'
                                            ? isSelected ? 'bg-blue-400/30 text-blue-100' : 'bg-blue-500/10 text-blue-400'
                                            : q.type === 'msq'
                                            ? isSelected ? 'bg-purple-400/30 text-purple-100' : 'bg-purple-500/10 text-purple-400'
                                            : q.type === 'nat'
                                            ? isSelected ? 'bg-emerald-400/30 text-emerald-100' : 'bg-emerald-500/10 text-emerald-400'
                                            : isSelected ? 'bg-amber-400/30 text-amber-100' : 'bg-amber-500/10 text-amber-400'
                                        }`}
                                      >
                                        {q.type}
                                      </span>

                                      {/* Parts count */}
                                      <span
                                        className={`text-[10px] flex items-center gap-0.5 ${
                                          q.images.length === 0
                                            ? 'text-rose-400'
                                            : isSelected
                                            ? 'text-slate-200'
                                            : 'text-slate-500'
                                        }`}
                                        title={`${q.images.length} image slice(s)`}
                                      >
                                        <Image className="w-2.5 h-2.5" />
                                        <span>{q.images.length}</span>
                                      </span>

                                      {q.isFlagged && (
                                        <Bookmark className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                                      )}
                                    </div>

                                    {/* Right status: Errors/Warnings & Action dropdown */}
                                    <div className="flex items-center gap-1">
                                      {qErrors > 0 && (
                                        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                                      )}
                                      {qWarnings > 0 && qErrors === 0 && (
                                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                      )}

                                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            duplicateQuestion(q.id);
                                          }}
                                          className={`p-0.5 rounded ${
                                            isSelected ? 'hover:bg-white/20' : 'hover:bg-slate-700'
                                          }`}
                                          title="Duplicate Question"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteQuestion(q.id);
                                          }}
                                          className={`p-0.5 rounded ${
                                            isSelected ? 'hover:bg-white/20' : 'hover:bg-slate-700 hover:text-rose-400'
                                          }`}
                                          title="Delete Question"
                                        >
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </QuestionHoverTrigger>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <div>
          Total Questions:{' '}
          <span className="font-bold text-slate-200">
            {activeArchive.subjects.reduce(
              (sum, s) => sum + s.sections.reduce((secSum, sec) => secSum + sec.questions.length, 0),
              0
            )}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase font-mono">
          {activeArchive.format}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (visible on md screens and above) */}
      <aside className="hidden md:flex flex-col w-72 lg:w-80 h-full shrink-0">
        {treeContent}
      </aside>

      {/* Mobile Drawer (visible on small screens when triggered) */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs h-full z-10 shadow-2xl flex flex-col">
            <div className="absolute right-2 top-2 z-20">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {treeContent}
          </div>
        </div>
      )}
    </>
  );
};
