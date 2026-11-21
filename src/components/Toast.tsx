import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export type ToastTone = 'success' | 'error' | 'xp';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2 pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ boxShadow: 'var(--shadow-modal)' }}
              className={`pointer-events-auto theme-transition flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md bg-[var(--bg-surface)]/95 text-[var(--text-primary)] ${
                t.tone === 'error'
                  ? 'border-[var(--accent-danger)]/40'
                  : t.tone === 'xp'
                  ? 'border-[var(--accent-primary)]/40'
                  : 'border-[var(--border-strong)]'
              }`}
            >
              {t.tone === 'error' ? (
                <AlertCircle className="w-4 h-4 text-[var(--accent-danger)] shrink-0" strokeWidth={1.75} />
              ) : t.tone === 'xp' ? (
                <Sparkles className="w-4 h-4 text-[var(--accent-primary)] shrink-0" strokeWidth={1.75} />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-success)] shrink-0" strokeWidth={1.75} />
              )}
              <span className="text-sm font-medium flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="關閉提示"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
