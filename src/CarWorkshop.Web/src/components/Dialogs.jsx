import { useEffect, useRef, useState } from "react";

export function SettingsDialog({ open, initialValue, busy, onClose, onSave }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(initialValue);
      setError("");
      setSaving(false);
      dialog.showModal();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialValue]);

  async function submit(event) {
    event.preventDefault();
    if (saving || busy) return;
    setSaving(true);
    try {
      const result = await onSave(value);
      if (result && !result.ok) {
        setError(result.error);
        inputRef.current?.focus();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="settings-title" onClose={onClose} onCancel={(event) => (busy || saving) && event.preventDefault()}>
      <form onSubmit={submit} noValidate>
        <h2 id="settings-title" className="font-display text-2xl font-bold">API settings</h2>
        <p className="mt-2 mb-6 text-ink-soft">Enter the base address of the running ASP.NET Core backend.</p>
        <label className="mb-2 block font-bold" htmlFor="api-url-input">API base URL</label>
        <input ref={inputRef} id="api-url-input" className="control-input" type="url" autoComplete="url" value={value} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "api-url-help api-url-error" : "api-url-help"} onChange={(event) => { setValue(event.target.value); setError(""); }} />
        <p id="api-url-help" className="mt-2 text-sm text-ink-soft">Local development normally uses this page's address. The dev server forwards API requests to the C# backend.</p>
        {error && <p id="api-url-error" className="mt-2 text-sm font-semibold text-danger" role="alert">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2 max-[500px]:[&>*]:w-full">
          <button className="button button-primary" type="submit" disabled={busy || saving}>{saving ? "Saving..." : "Save and connect"}</button>
          <button className="button button-quiet" type="button" onClick={onClose} disabled={busy || saving}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
}

export function DeleteDialog({ target, error, busy, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => confirmRef.current?.focus());
    } else if (!target && dialog.open) {
      dialog.close();
    }
  }, [target]);

  const isCustomer = target?.type === "customer";
  const name = isCustomer
    ? target?.record?.fullName
    : `${target?.record?.registrationNumber ?? ""} · ${target?.record?.make ?? ""} ${target?.record?.model ?? ""}`.trim();

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="delete-title" onClose={onClose} onCancel={(event) => busy && event.preventDefault()}>
      <h2 id="delete-title" className="font-display text-2xl font-bold">Delete this {isCustomer ? "customer" : "vehicle"}?</h2>
      <p className="mt-2 text-ink-soft">
        {isCustomer
          ? "A customer can only be deleted after all of their vehicles are removed or reassigned."
          : "This removes the vehicle record from the workshop database."}
      </p>
      {target && <div className="mt-6 rounded-sm bg-paper-muted p-4 font-bold [overflow-wrap:anywhere]">{name}</div>}
      {error && <p className="mt-4 rounded-sm border border-danger-dark bg-danger-soft p-3 text-sm font-semibold text-danger-dark" role="alert">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2 max-[500px]:[&>*]:w-full">
        <button ref={confirmRef} className="button button-danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? "Deleting..." : `Delete ${isCustomer ? "customer" : "vehicle"}`}</button>
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>Keep record</button>
      </div>
    </dialog>
  );
}
