import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: React.ErrorInfo, errorInfo: React.ErrorInfo) {
    console.error('Uncaught React render error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-400 mb-4 break-words font-mono bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-left overflow-auto max-h-32">
              {this.state.error?.message || 'An unexpected error occurred during rendering.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg active:scale-95"
            >
              Reload Studio App
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
