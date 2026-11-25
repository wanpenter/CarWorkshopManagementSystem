import { forwardRef } from "react";

export function ConnectionStatus({ status }) {
  const values = {
    disconnected: ["neutral", "Not connected"],
    loading: ["loading", "Connecting"],
    ready: ["connected", "API connected"],
    error: ["error", "Connection failed"]
  }[status] ?? ["neutral", "Not connected"];
  const toneClasses = {
    neutral: "text-ink-soft before:bg-line-strong",
    loading: "text-rust before:animate-pulse before:bg-rust",
    connected: "text-success before:bg-success",
    error: "text-danger before:bg-danger"
  }[values[0]];

  return (
    <div
      className={`connection-status is-${values[0]} flex min-h-11 items-center gap-2 px-3 text-sm font-semibold before:size-2.5 before:rounded-full before:content-[''] ${toneClasses}`}
      role="status"
    >
      {values[1]}
    </div>
  );
}

export function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const colors = notice.tone === "error"
    ? "border-danger-dark bg-danger-soft text-danger-dark"
    : "border-success bg-success-soft text-success";
  return (
    <div className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium ${colors}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="min-w-0 [overflow-wrap:anywhere]">{notice.message}</span>
      {onDismiss && (
        <button
          type="button"
          className="-my-1 -mr-1.5 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-transparent text-current opacity-75 hover:opacity-100"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function StatePanel({ title, body, children, loading = false, error = false, compact = false }) {
  return (
    <section className={`max-w-168 py-8 ${compact ? "mt-2" : "mt-6"} ${error ? "text-danger-dark" : ""}`}>
      {loading ? <div className="loading-line" aria-hidden="true" /> : !compact && <div className="mb-6 h-1.5 w-18 bg-rust" aria-hidden="true" />}
      <h2 className="max-w-[24ch] font-display text-[clamp(1.45rem,2.4vw,2rem)] leading-tight font-bold tracking-[-0.025em] text-balance">{title}</h2>
      <p className={`mt-2 mb-5 max-w-[65ch] ${error ? "text-danger-dark" : "text-ink-soft"}`}>{body}</p>
      {children && <div className="flex flex-wrap gap-2 max-[500px]:[&>*]:w-full">{children}</div>}
    </section>
  );
}

export const TextField = forwardRef(function TextField({
  id,
  label,
  value,
  error,
  help,
  maxLength,
  type = "text",
  min,
  max,
  inputMode,
  autoComplete = "off",
  onChange
}, ref) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-5">
      <label className="mb-2 block font-bold" htmlFor={`${id}-input`}>{label}</label>
      <input
        ref={ref}
        id={`${id}-input`}
        className="control-input"
        name={id}
        type={type}
        min={min}
        max={max}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        onInput={type === "datetime-local" ? (event) => onChange(id, event.target.value) : undefined}
        onChange={(event) => onChange(id, event.target.value)}
      />
      {help && <p id={`${id}-help`} className="mt-1.5 text-[0.82rem] text-ink-soft">{help}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
});

export function TextAreaField({ id, label, value, error, help, maxLength, onChange }) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-5">
      <label className="mb-2 block font-bold" htmlFor={`${id}-input`}>{label}</label>
      <textarea
        id={`${id}-input`}
        className="control-input min-h-24 resize-y"
        name={id}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(id, event.target.value)}
      />
      {help && <p id={`${id}-help`} className="mt-1.5 text-[0.82rem] text-ink-soft">{help}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const SelectField = forwardRef(function SelectField({ id, label, value, error, help, children, onChange }, ref) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-5">
      <label className="mb-2 block font-bold" htmlFor={`${id}-input`}>{label}</label>
      <select
        ref={ref}
        id={`${id}-input`}
        className="control-input"
        name={id}
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(id, event.target.value)}
      >
        {children}
      </select>
      {help && <p id={`${id}-help`} className="mt-1.5 text-[0.82rem] text-ink-soft">{help}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
});

export function TableHead({ children, className = "" }) {
  return <th className={`border-b border-paper-line px-3 py-4 text-left text-[0.79rem] font-bold tracking-[0.07em] text-ink-soft uppercase ${className}`}>{children}</th>;
}

export function TableCell({ children, className = "" }) {
  return <td className={`border-b border-paper-line px-3 py-4 text-left align-top ${className}`}>{children}</td>;
}

export function MobileDatum({ label, children }) {
  return <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1.5"><span className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">{label}</span><span className="[overflow-wrap:anywhere]">{children}</span></div>;
}

export function FormError({ message }) {
  if (!message) return null;
  return <p className="mb-4 rounded-sm border border-danger-dark bg-danger-soft p-3 text-sm font-semibold text-danger-dark" role="alert">{message}</p>;
}

export function ResultsBar({ visibleCount, totalCount, noun, hasFilters, onClearFilters }) {
  if (totalCount === 0 || visibleCount === 0) return null;
  const plural = totalCount === 1 ? noun : `${noun}s`;
  return (
    <div className="results-bar">
      <span className="tabular-nums">
        {hasFilters
          ? `Showing ${visibleCount} of ${totalCount} ${plural}`
          : `${totalCount} ${plural} total`}
      </span>
      {hasFilters && onClearFilters && (
        <button type="button" className="count-link min-h-7 px-1.5 py-0.5 text-xs" onClick={onClearFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export function PaginationBar({ page, totalPages, totalCount, pageSize, onPageChange }) {
  if (totalCount <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-4 text-xs">
      <span className="text-ink-soft tabular-nums">
        Showing {start}–{end} of {totalCount} (Page {page} of {totalPages})
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="button button-secondary min-h-9 px-3 py-1.5 text-xs"
          disabled={page <= 1}
          title={page <= 1 ? "You are on the first page" : undefined}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="button button-secondary min-h-9 px-3 py-1.5 text-xs"
          disabled={page >= totalPages}
          title={page >= totalPages ? "You are on the last page" : undefined}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
