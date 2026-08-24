import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Settings,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { useCbtStore } from '../store/useCbtStore';
import {
  GEMINI_FREE_TIER_RPD,
  GEMINI_FREE_TIER_RPM,
  getUsageColor,
  ApiKeyStatus,
} from '../utils/geminiKeyManager';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const {
    geminiApiKey,
    setGeminiApiKey,
    fallbackApiKeys,
    activeKeyId,
    primaryRpm,
    primaryRpd,
    primaryStatus,
    primaryExhaustedUntil,
    addFallbackApiKey,
    updateFallbackApiKey,
    deleteFallbackApiKey,
    reorderFallbackApiKeys,
    refreshUsageMetrics,
    addToast,
  } = useCbtStore();

  const [showPrimaryKey, setShowPrimaryKey] = useState(false);
  const [showFallbackKeysMap, setShowFallbackKeysMap] = useState<Record<string, boolean>>({});
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isAddingFallback, setIsAddingFallback] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      refreshUsageMetrics();
    }
  }, [isOpen, refreshUsageMetrics]);

  if (!isOpen) return null;

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    refreshUsageMetrics();
    setTimeout(() => {
      setIsRefreshing(false);
      addToast('Usage Refreshed', 'API key metrics & quota usage updated.', 'info');
    }, 400);
  };

  const toggleShowFallback = (id: string) => {
    setShowFallbackKeysMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateFallback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;
    addFallbackApiKey(newKeyInput, newKeyLabel || undefined);
    setNewKeyInput('');
    setNewKeyLabel('');
    setIsAddingFallback(false);
    addToast('Fallback Key Added', 'New backup API key configured successfully.', 'success');
  };

  const rpmUsage = getUsageColor(primaryRpm, GEMINI_FREE_TIER_RPM, primaryStatus === 'Quota Exhausted');
  const rpdUsage = getUsageColor(primaryRpd, GEMINI_FREE_TIER_RPD, primaryStatus === 'Quota Exhausted');

  const renderStatusBadge = (status: ApiKeyStatus, isActive: boolean) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Active
        </span>
      );
    }

    switch (status) {
      case 'Ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Ready
          </span>
        );
      case 'Quota Exhausted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            Quota Exhausted
          </span>
        );
      case 'Invalid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Invalid
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Ready
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-800 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">App & API Settings</h2>
              <p className="text-xs text-slate-400">Manage Gemini API keys, multi-key fallback & rate limit tracking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-7">
          {/* Section 1: Primary API Key & Usage Indicator */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100 tracking-wide uppercase">Primary API Key</h3>
              </div>
              {renderStatusBadge(primaryStatus, activeKeyId === 'primary')}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Your primary Google Gemini API key used for PDF extraction, OCR recognition, and question analysis.
            </p>

            {/* Input with Mask Toggle */}
            <div className="relative">
              <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPrimaryKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-10 pr-12 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPrimaryKey(!showPrimaryKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                title={showPrimaryKey ? 'Hide API key' : 'Show API key'}
              >
                {showPrimaryKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Live API Usage Indicator Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live API Usage Indicator</span>
                </div>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg border border-slate-700/60 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                  Refresh Usage
                </button>
              </div>

              {/* Progress Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* RPM Bar */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Requests Per Min (RPM)</span>
                    <span className={`font-mono font-bold ${rpmUsage.color}`}>
                      {primaryRpm} / {GEMINI_FREE_TIER_RPM}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        primaryStatus === 'Quota Exhausted' || rpmUsage.percentage >= 90
                          ? 'bg-rose-500'
                          : rpmUsage.percentage >= 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${rpmUsage.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Free Tier Limit: {GEMINI_FREE_TIER_RPM} RPM</span>
                    <span className={`font-semibold ${rpmUsage.color}`}>{rpmUsage.badge}</span>
                  </div>
                </div>

                {/* RPD Bar */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Requests Per Day (RPD)</span>
                    <span className={`font-mono font-bold ${rpdUsage.color}`}>
                      {primaryRpd} / {GEMINI_FREE_TIER_RPD.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        primaryStatus === 'Quota Exhausted' || rpdUsage.percentage >= 90
                          ? 'bg-rose-500'
                          : rpdUsage.percentage >= 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${rpdUsage.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Free Tier Limit: 1,500 RPD</span>
                    <span className={`font-semibold ${rpdUsage.color}`}>{rpdUsage.badge}</span>
                  </div>
                </div>
              </div>

              {primaryExhaustedUntil && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    Primary key limit reached. Cooling down until{' '}
                    <strong>{new Date(primaryExhaustedUntil).toLocaleTimeString()}</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Section 2: Fallback API Keys (Dynamic List) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-slate-100 tracking-wide uppercase">
                  Fallback API Keys ({fallbackApiKeys.length})
                </h3>
              </div>

              {!isAddingFallback && (
                <button
                  type="button"
                  onClick={() => setIsAddingFallback(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Fallback Key
                </button>
              )}
            </div>

            {/* Warning Note Callout */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong>Important Cloud Quota Tip:</strong> Ensure fallback keys originate from <em>distinct Google Cloud Projects</em>. Keys from the same GCP project share identical quota limits and will exhaust simultaneously.
              </div>
            </div>

            {/* Add Fallback Form */}
            {isAddingFallback && (
              <form
                onSubmit={handleCreateFallback}
                className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4 space-y-3 animate-in fade-in"
              >
                <h4 className="text-xs font-bold text-slate-200">Configure New Fallback API Key</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Key Label (e.g., Project B Backup)"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    required
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingFallback(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                  >
                    Save Key
                  </button>
                </div>
              </form>
            )}

            {/* Fallback Key List */}
            {fallbackApiKeys.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                No fallback API keys configured yet. Click "Add Fallback Key" to add backup credentials.
              </div>
            ) : (
              <div className="space-y-3">
                {fallbackApiKeys.map((item, index) => {
                  const isShown = showFallbackKeysMap[item.id] || false;
                  const isActive = activeKeyId === item.id;
                  const itemRpm = getUsageColor(item.rpmCount, GEMINI_FREE_TIER_RPM, item.status === 'Quota Exhausted');

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-slate-950/90 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                            #{index + 1}
                          </span>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateFallbackApiKey(item.id, { label: e.target.value })}
                            className="bg-transparent border border-transparent hover:border-slate-700 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs font-bold text-slate-200 focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {renderStatusBadge(item.status, isActive)}

                          {/* Priority Shift Controls */}
                          <div className="flex items-center border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => reorderFallbackApiKeys(index, index - 1)}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
                              title="Move Up Priority"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === fallbackApiKeys.length - 1}
                              onClick={() => reorderFallbackApiKeys(index, index + 1)}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
                              title="Move Down Priority"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              deleteFallbackApiKey(item.id);
                              addToast('Fallback Removed', 'Fallback API key removed.', 'info');
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete Fallback Key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Key Value Field */}
                      <div className="relative mb-2">
                        <input
                          type={isShown ? 'text' : 'password'}
                          value={item.key}
                          onChange={(e) => updateFallbackApiKey(item.id, { key: e.target.value, status: 'Ready' })}
                          className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowFallback(item.id)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
                        >
                          {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Fallback Metrics */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <div className="flex items-center gap-3">
                          <span>
                            RPM: <strong className={itemRpm.color}>{item.rpmCount || 0} / 15</strong>
                          </span>
                          <span>
                            RPD: <strong>{item.rpdCount || 0} / 1,500</strong>
                          </span>
                        </div>
                        {item.lastUsedAt && (
                          <span className="text-[10px] text-slate-500">
                            Last used: {new Date(item.lastUsedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">
            Fallback keys automatically take over when primary limits are reached.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
