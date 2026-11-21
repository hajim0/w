import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || '發生未預期的應用程式錯誤';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error) {
        readable = `資料權限或連線錯誤（${parsed.operationType || 'read'}）：${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-5">
            <div className="w-11 h-11 rounded-xl bg-[var(--accent-danger-soft)] flex items-center justify-center text-[var(--accent-danger)]">
              <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">系統遇到暫時性異常</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed break-words">
                {this.state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-primary-hover)] active:scale-[0.99] transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
              <span>重新整理應用程式</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
