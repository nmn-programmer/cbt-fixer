import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Activity,
  Layers,
  Palette,
  HardDrive,
  Info,
  Check,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Zap,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import {
  GEMINI_FREE_TIER_RPM,
  GEMINI_FREE_TIER_RPD,
  getUsageColor,
  maskApiKey,
  ApiKeyStatus,
} from '../utils/geminiKeyManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'keys' | 'performance' | 'appearance' | 'storage';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('keys');
  const [showPrimaryKey, setShowPrimaryKey] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isAddingFallback, setIsAddingFallback] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    geminiApiKey,
    setGeminiApiKey,
    fallbackApiKeys,
    addFallbackApiKey,
    deleteFallbackApiKey,
    refreshUsageMetrics,
    primaryRpm,
    primaryRpd,
    primaryStatus,
    activeKeyId,
    theme,
    setTheme,
    enableDoublePassRescan,
    setEnableDoublePassRescan,
    addToast,
    archives,
  } = useCbtStore();

  useEffect(() => {
    if (isOpen) {
      refreshUsageMetrics();
    }
  }, [isOpen, refreshUsageMetrics]);

  if (!isOpen) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshUsageMetrics();
    setTimeout(() => {
      setIsRefreshing(false);
      addToast('Usage Refreshed', 'API key metrics and quota counters updated.', 'info');
    }, 400);
  };

  const handleAddFallback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;

    addFallbackApiKey(
      newKeyInput.trim(),
      newKeyLabel.trim() || `Backup Key ${fallbackApiKeys.length + 1}`
    );
    setNewKeyInput('');
    setNewKeyLabel('');
    setIsAddingFallback(false);
    addToast('Fallback Key Added', 'New backup API key configured successfully.', 'success');
  };

  const handleTestKey = async (key: string, id: string) => {
    if (!key.trim()) return;
    setTestingKeyId(id);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`
      );
      if (resp.ok) {
        addToast('Key Valid', 'Connection test succeeded. Gemini API is accessible.', 'success');
      } else {
        const errData = await resp.json().catch(() => ({}));
        addToast(
          'Key Validation Failed',
          errData?.error?.message || `HTTP ${resp.status}: Invalid key or quota issue.`,
          'error'
        );
      }
    } catch (err: any) {
      addToast('Connection Error', err.message || 'Unable to contact Gemini endpoint.', 'error');
    } finally {
      setTestingKeyId(null);
    }
  };

  const renderStatusBadge = (status: ApiKeyStatus, isActive: boolean) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Active
        </span>
      );
    }

    switch (status) {
      case 'Ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3 h-3 text-slate-400" />
            Ready
          </span>
        );
      case 'Quota Exhausted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            Quota Cooldown
          </span>
        );
      case 'Invalid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <X className="w-3 h-3" />
            Invalid
          </span>
        );
      default:
        return null;
    }
  };

  const primaryRpmColor = getUsageColor(primaryRpm, GEMINI_FREE_TIER_RPM);
  const primaryRpdColor = getUsageColor(primaryRpd, GEMINI_FREE_TIER_RPD);

  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'keys', label: 'API Keys & Multi-Key', icon: Key },
    { id: 'performance', label: 'AI & OCR Engines', icon: Zap },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'storage', label: 'Drafts & Storage', icon: HardDrive },
  ];

  return (
    <div
      id="settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="settings-modal-container"
        className="flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl bg-slate-900 border-0 sm:border border-slate-800 sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">Studio Settings</h2>
              <p className="text-xs text-slate-400">Manage Gemini API keys, OCR preferences & theme</p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - Horizontal Scrollable on Mobile */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-2 overflow-x-auto no-scrollbar scroll-smooth">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border-b-2 min-h-[44px] ${
                  isActive
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: API KEYS & MULTI-KEY FAILOVER */}
          {activeTab === 'keys' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Header with Quick Refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    Gemini API Keys & Failover
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure multiple API keys for automated failover during quota exhaustion.
                  </p>
                </div>
                <button
                  id="refresh-metrics-btn"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 min-h-[36px]"
                  title="Refresh rate limits and quota snapshot"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                  <span className="hidden sm:inline">Refresh Metrics</span>
                </button>
              </div>

              {/* Primary API Key Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Primary API Key
                    </span>
                  </div>
                  {renderStatusBadge(primaryStatus, activeKeyId === 'primary')}
                </div>

                <div className="relative">
                  <input
                    id="primary-gemini-api-key-input"
                    type={showPrimaryKey ? 'text' : 'password'}
                    placeholder="Enter your Gemini API key (AIzaSy...)"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all pr-24 min-h-[44px]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPrimaryKey(!showPrimaryKey)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                      title={showPrimaryKey ? 'Hide Key' : 'Show Key'}
                    >
                      {showPrimaryKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {geminiApiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleTestKey(geminiApiKey, 'primary')}
                        disabled={testingKeyId === 'primary'}
                        className="px-2 py-1 rounded-md bg-indigo-600/30 text-indigo-300 text-xs font-medium hover:bg-indigo-600/50 transition-colors"
                      >
                        {testingKeyId === 'primary' ? 'Testing...' : 'Test'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary Usage Stats */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-400" /> RPM Usage
                      </span>
                      <span className="font-semibold text-slate-200">
                        {primaryRpm} / {GEMINI_FREE_TIER_RPM}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${primaryRpmColor.bg} transition-all duration-300`}
                        style={{ width: `${Math.min((primaryRpm / GEMINI_FREE_TIER_RPM) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-purple-400" /> Daily RPD
                      </span>
                      <span className="font-semibold text-slate-200">
                        {primaryRpd} / {GEMINI_FREE_TIER_RPD}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${primaryRpdColor.bg} transition-all duration-300`}
                        style={{ width: `${Math.min((primaryRpd / GEMINI_FREE_TIER_RPD) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Fallback API Keys Pool */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Backup & Fallback Keys ({fallbackApiKeys.length})
                    </span>
                  </div>
                  {!isAddingFallback && (
                    <button
                      id="add-fallback-key-btn"
                      onClick={() => setIsAddingFallback(true)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 text-xs font-medium transition-colors min-h-[36px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Backup Key</span>
                    </button>
                  )}
                </div>

                {/* Add Fallback Form */}
                {isAddingFallback && (
                  <form
                    onSubmit={handleAddFallback}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-3 animate-in fade-in duration-150"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-indigo-300">
                      <span>Add New Backup Key</span>
                      <button
                        type="button"
                        onClick={() => setIsAddingFallback(false)}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="Label (e.g. Account 2 Key)"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                      />
                      <input
                        type="password"
                        placeholder="Gemini API Key (AIzaSy...)"
                        value={newKeyInput}
                        onChange={(e) => setNewKeyInput(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 min-h-[40px]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Save Backup Key
                    </button>
                  </form>
                )}

                {/* Fallback Keys List */}
                {fallbackApiKeys.length === 0 ? (
                  <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No backup API keys configured. If your primary key hits quota, AI extraction will halt until reset.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fallbackApiKeys.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {maskApiKey(item.key)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {renderStatusBadge(item.status, activeKeyId === item.id)}
                          <button
                            type="button"
                            onClick={() => handleTestKey(item.key, item.id)}
                            disabled={testingKeyId === item.id}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
                          >
                            {testingKeyId === item.id ? '...' : 'Test'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFallbackApiKey(item.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete backup key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AI & OCR ENGINES */}
          {activeTab === 'performance' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  AI OCR & Extraction Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tune document recognition, bounding box precision, and double-pass algorithms.
                </p>
              </div>

              {/* Double-Pass Rescan Toggle */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-100">
                        Double-Pass AI Quality Rescan
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Runs an automated secondary review pass over cropped images to detect clipped formulas, split option columns, or diagram cropping defects.
                    </p>
                  </div>
                  <button
                    id="toggle-double-pass-btn"
                    onClick={() => setEnableDoublePassRescan(!enableDoublePassRescan)}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 min-h-[24px] ${
                      enableDoublePassRescan ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                        enableDoublePassRescan ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Engine Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5" /> High-Res PDF Renderer
                  </div>
                  <p className="text-[11px] text-slate-400">
                    PDF pages are rendered at 2.0x device pixel ratio to ensure crisp mathematical symbols, subscripts, and molecular formulas.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Check className="w-3.5 h-3.5" /> JEE & NEET Pattern Aware
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Specialized prompt structures map question types (MCQ, MSQ, Numerical/NAT, Matrix Match) with negative marking schemes.
                  </p>
                </div>
              </div>

              {/* Active Model Chain */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Active Model Pipeline</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Fast & Flash Lite
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="font-mono font-medium text-slate-200">gemini-2.5-flash</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Primary Default</span>
                  </div>
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                      <span className="font-mono font-medium text-slate-300">gemini-3.1-flash-lite</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider">Fast Lite Fallback</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE & THEME */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Workspace Appearance
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Choose visual contrast mode for question editing and CBT simulation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Dark Slate Mode */}
                <button
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-xl border text-left transition-all min-h-[44px] ${
                    theme === 'dark'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-md ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Moon className="w-5 h-5 text-indigo-400" />
                    {theme === 'dark' && <Check className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <div className="text-xs font-bold text-slate-100">Dark Slate (Default)</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Optimized for long editing sessions and high contrast readability.
                  </div>
                </button>

                {/* CBT Exam Contrast */}
                <button
                  onClick={() => setTheme('cbt-high-contrast')}
                  className={`p-4 rounded-xl border text-left transition-all min-h-[44px] ${
                    theme === 'cbt-high-contrast'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300 shadow-md ring-1 ring-amber-500'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Monitor className="w-5 h-5 text-amber-400" />
                    {theme === 'cbt-high-contrast' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="text-xs font-bold text-slate-100">JEE CBT High-Contrast</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Mimics the authentic NTA / JEE Advanced test screen layout and borders.
                  </div>
                </button>

                {/* Light Mode */}
                <button
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-xl border text-left transition-all min-h-[44px] ${
                    theme === 'light'
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300 shadow-md ring-1 ring-sky-500'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Sun className="w-5 h-5 text-sky-400" />
                    {theme === 'light' && <Check className="w-4 h-4 text-sky-400" />}
                  </div>
                  <div className="text-xs font-bold text-slate-100">Light Paper</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Clean paper-white backdrop for verifying printed quality.
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: DRAFTS & LOCAL STORAGE */}
          {activeTab === 'storage' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Local Drafts & Storage
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Archives are automatically persisted in browser IndexedDB for offline resilience.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      Active Archives in Memory
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {archives.length} {archives.length === 1 ? 'Paper' : 'Papers'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <p>• All question papers, images, and answer keys save locally automatically.</p>
                  <p>• Closing tabs does not lose your work — archives restore instantly upon reopening.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 sticky bottom-0 z-10">
          <button
            id="done-settings-btn"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/20 transition-all min-h-[44px] flex items-center justify-center"
          >
            Done & Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
