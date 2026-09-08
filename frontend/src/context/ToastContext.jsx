import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const ICONS = { success: '✓', error: '!', warning: '!', info: 'i' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, title, message, duration = 4200) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, type, title, message }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (title, message) => push('success', title, message),
      error: (title, message) => push('error', title, message, 6500),
      warning: (title, message) => push('warning', title, message, 5500),
      info: (title, message) => push('info', title, message),
      /** Convenience for API failures — surfaces field-level details when present. */
      apiError: (error, fallback = 'Action failed') => {
        const details = Array.isArray(error?.details)
          ? error.details.map((d) => `${d.field}: ${d.message}`).join('  •  ')
          : '';
        return push('error', error?.message || fallback, details, 7000);
      },
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className={`stat__icon`} style={iconStyle(t.type)}>
              {ICONS[t.type]}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="toast__title">{t.title}</div>
              {t.message ? <div className="toast__message">{t.message}</div> : null}
            </div>
            <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function iconStyle(type) {
  const map = {
    success: { background: 'var(--green-100)', color: 'var(--green-600)' },
    error: { background: 'var(--red-100)', color: 'var(--red-600)' },
    warning: { background: 'var(--amber-100)', color: 'var(--amber-600)' },
    info: { background: 'var(--navy-050)', color: 'var(--navy-700)' },
  };
  return { width: 30, height: 30, fontSize: 14, fontWeight: 700, borderRadius: 8, ...map[type] };
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
