import { Fragment, useEffect } from 'react';

/* ---------------------------------------------------------------- Cards */

export function Card({ title, subtitle, actions, children, flush, className = '', icon }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card__head">
          {icon ? <span style={{ fontSize: 16 }}>{icon}</span> : null}
          <div>
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <div className="text-small text-muted">{subtitle}</div> : null}
          </div>
          {actions ? <div className="card__head-actions">{actions}</div> : null}
        </div>
      )}
      <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>
    </div>
  );
}

const TONES = {
  navy: { background: 'var(--navy-050)', color: 'var(--navy-700)' },
  orange: { background: 'var(--orange-100)', color: 'var(--orange-600)' },
  green: { background: 'var(--green-100)', color: 'var(--green-600)' },
  red: { background: 'var(--red-100)', color: 'var(--red-600)' },
  amber: { background: 'var(--amber-100)', color: 'var(--amber-600)' },
  blue: { background: 'var(--blue-100)', color: 'var(--blue-600)' },
  violet: { background: 'var(--violet-100)', color: 'var(--violet-500)' },
  slate: { background: 'var(--slate-100)', color: 'var(--slate-600)' },
};

export function Stat({ label, value, hint, icon, tone = 'navy', onClick }) {
  return (
    <div className="stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {icon ? (
        <div className="stat__icon" style={TONES[tone]}>
          {icon}
        </div>
      ) : null}
      <div style={{ minWidth: 0 }}>
        <div className="stat__label">{label}</div>
        <div className="stat__value">{value}</div>
        {hint ? <div className="stat__hint">{hint}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Badges */

export function Badge({ children, tone = 'slate', dot }) {
  return <span className={`badge badge--${tone} ${dot ? 'badge--dot' : ''}`}>{children}</span>;
}

const STATUS_TONES = {
  Completed: 'green',
  Working: 'blue',
  Incomplete: 'amber',
  Absent: 'red',
  Holiday: 'violet',
  Present: 'green',
  Open: 'amber',
  Active: 'green',
  Inactive: 'slate',
  'Not Joined': 'slate',
  Left: 'slate',
  Upcoming: 'slate',
};

const STATUS_ICONS = {
  Completed: '✅',
  Working: '🟢',
  Incomplete: '🟡',
  Absent: '🔴',
  Holiday: '🔵',
};

export function StatusBadge({ status, withIcon = true }) {
  if (!status) return <span className="table__muted">—</span>;
  return (
    <span className={`badge badge--${STATUS_TONES[status] || 'slate'}`}>
      {withIcon && STATUS_ICONS[status] ? `${STATUS_ICONS[status]} ` : ''}
      {status}
    </span>
  );
}

/** Per-field-group lock indicator used across the DPR screens. */
export function LockPill({ locked, pending, label }) {
  if (locked) {
    return (
      <span className="lock-pill lock-pill--locked" title="Saved and locked">
        🔒 {label}
      </span>
    );
  }
  if (pending) {
    return (
      <span className="lock-pill lock-pill--pending" title="Still pending">
        ⏳ {label}
      </span>
    );
  }
  return <span className="lock-pill">{label}</span>;
}

/* --------------------------------------------------------------- Forms */

export function Field({ label, required, hint, error, children, style }) {
  return (
    <div className="field" style={style}>
      {label ? (
        <label className="field__label">
          {label} {required ? <span>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div className="field__error">{error}</div> : null}
      {hint && !error ? <div className="field__hint">{hint}</div> : null}
    </div>
  );
}

export function Input(props) {
  return <input className={`input ${props.className || ''}`} {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className={`select ${props.className || ''}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea className={`textarea ${props.className || ''}`} {...props} />;
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} />
      <span className="switch__track" />
      {label ? <span style={{ fontSize: 13, fontWeight: 550 }}>{label}</span> : null}
    </label>
  );
}

export function CheckboxRow({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="checkbox-row" style={disabled ? { opacity: 0.55 } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} />
      <span>
        <span className="checkbox-row__label">{label}</span>
        {hint ? <div className="checkbox-row__hint">{hint}</div> : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------- Buttons */

export function Button({
  children,
  variant = 'default',
  size,
  loading,
  icon,
  className = '',
  ...props
}) {
  return (
    <button
      className={`btn ${variant !== 'default' ? `btn--${variant}` : ''} ${
        size === 'sm' ? 'btn--sm' : ''
      } ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : icon}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- Modals */

export function Modal({ open, onClose, title, subtitle, children, footer, size = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size ? `modal--${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <div className="text-small text-muted mt-0">{subtitle}</div> : null}
          </div>
          <button
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--slate-600)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------- States */

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="loading-block">
      <span className="spinner spinner--lg" />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ icon = '📭', title = 'Nothing to show', text }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <div className="empty-state__title">{title}</div>
      {text ? <div className="empty-state__text">{text}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">⚠️</div>
      <div className="empty-state__title">Could not load this data</div>
      <div className="empty-state__text">{error?.message || 'Unexpected error'}</div>
      {onRetry ? (
        <Button className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, icon }) {
  const icons = { info: 'ℹ️', warning: '⚠️', danger: '⛔', success: '✅', neutral: '📌' };
  return (
    <div className={`alert alert--${tone}`}>
      <span>{icon || icons[tone]}</span>
      <div>
        {title ? <strong>{title}</strong> : null}
        {title && children ? <br /> : null}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Misc */

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${active === tab.key ? 'tab--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined ? ` (${tab.count})` : ''}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) {
    return total !== undefined ? (
      <div className="pagination">
        <span className="pagination__info">{total} record{total === 1 ? '' : 's'}</span>
      </div>
    ) : null;
  }
  return (
    <div className="pagination">
      <span className="pagination__info">
        Page {page} of {pages} · {total} records
      </span>
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Previous
      </Button>
      <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next →
      </Button>
    </div>
  );
}

export function Avatar({ name, orange }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return <div className={`avatar ${orange ? 'avatar--orange' : ''}`}>{initials}</div>;
}

export function KeyValue({ items }) {
  return (
    <div className="kv">
      {items.map(({ key, value }) => (
        <Fragment key={key}>
          <div className="kv__key">{key}</div>
          <div className="kv__value">{value ?? <span className="table__muted">—</span>}</div>
        </Fragment>
      ))}
    </div>
  );
}
