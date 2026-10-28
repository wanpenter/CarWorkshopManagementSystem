import { useRef, useState } from "react";
import { getProblemFieldErrors, validateMechanic } from "../api.js";
import { FormError, MobileDatum, StatePanel, TableCell, TableHead, TextField } from "./Shared.jsx";

const emptyForm = { fullName: "", phone: "", isActive: true };

export default function MechanicsSection({ active, status, errorMessage, mechanics, busy, onOpenSettings, onRetry, onSave }) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const visible = mechanics.filter((mechanic) => (showInactive || mechanic.isActive) && `${mechanic.fullName} ${mechanic.phone}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function reset() {
    setSelectedId(null);
    setForm(emptyForm);
    setErrors({});
    window.requestAnimationFrame(() => nameRef.current?.focus());
  }

  function edit(mechanic) {
    setSelectedId(Number(mechanic.id));
    setForm({ fullName: mechanic.fullName, phone: mechanic.phone, isActive: mechanic.isActive });
    setErrors({});
    window.requestAnimationFrame(() => nameRef.current?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    const checked = validateMechanic(form);
    if (!checked.valid) {
      setErrors(checked.errors);
      (checked.errors.fullName ? nameRef : phoneRef).current?.focus();
      return;
    }
    try {
      await onSave(selectedId, checked.values);
      reset();
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  const actions = (mechanic) => <button className="row-action" type="button" disabled={busy} onClick={() => edit(mechanic)} aria-label={`Edit mechanic ${mechanic.fullName}`}>Edit</button>;

  return (
    <section hidden={!active} aria-labelledby="mechanics-title">
      <div className="workspace-grid">
        <div className="records-panel">
          <div className="records-heading">
            <div><h1 id="mechanics-title" className="page-title" tabIndex={-1}>Mechanics</h1><p className="mt-3 max-w-[65ch] text-ink-soft">Manage workshop staff and who can take new assignments.</p></div>
            <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || status !== "ready"} onClick={() => void onRetry()}>Reload records</button>
          </div>
          <div className="appointment-filters service-filters">
            <div><label className="mb-2 block font-bold" htmlFor="mechanic-search">Search mechanics</label><input id="mechanic-search" className="control-input" type="search" placeholder="Name or phone" value={query} disabled={status !== "ready"} onChange={(event) => setQuery(event.target.value)} /></div>
            <label className="inline-flex min-h-11 items-center gap-3 font-semibold"><input className="size-5 accent-rust" type="checkbox" checked={showInactive} disabled={status !== "ready"} onChange={(event) => setShowInactive(event.target.checked)} />Show inactive</label>
          </div>
          {status === "disconnected" ? <StatePanel title="Connect your workshop API" body="Add the backend address to load mechanics."><button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button></StatePanel>
            : status === "loading" ? <StatePanel loading title="Loading mechanics" body="Waiting for the workshop API." />
              : status === "error" ? <StatePanel error title="Mechanics could not be loaded" body={errorMessage}><button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button><button className="button button-quiet" type="button" onClick={onOpenSettings}>Check API settings</button></StatePanel>
                : mechanics.length === 0 ? <StatePanel title="No mechanics yet" body="Add a mechanic before assigning confirmed appointments."><button className="button button-primary" type="button" onClick={reset}>Add first mechanic</button></StatePanel>
                  : visible.length === 0 ? <StatePanel compact title="No matching mechanics" body="Clear the search and show inactive mechanics to see all staff."><button className="button button-quiet" type="button" onClick={() => { setQuery(""); setShowInactive(true); }}>Clear filters</button></StatePanel>
                    : <>
                      <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
                        <table className="w-full border-collapse"><thead><tr><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead>
                          <tbody>{visible.map((mechanic) => <tr key={mechanic.id} className={selectedId === Number(mechanic.id) ? "bg-selected" : "hover:bg-selected"}><TableCell><strong>{mechanic.fullName}</strong></TableCell><TableCell>{mechanic.phone}</TableCell><TableCell><span className={mechanic.isActive ? "text-success" : "text-ink-soft"}>{mechanic.isActive ? "Active" : "Inactive"}</span></TableCell><TableCell className="text-right">{actions(mechanic)}</TableCell></tr>)}</tbody>
                        </table>
                      </div>
                      <div className="grid gap-3 desk:hidden">{visible.map((mechanic) => <article key={mechanic.id} className={`record-card border-paper-line ${selectedId === Number(mechanic.id) ? "bg-selected" : "bg-paper-raised"}`}><h2 className="font-display text-xl font-bold">{mechanic.fullName}</h2><MobileDatum label="Phone">{mechanic.phone}</MobileDatum><MobileDatum label="Status">{mechanic.isActive ? "Active" : "Inactive"}</MobileDatum><div className="mt-2 border-t border-paper-line pt-2">{actions(mechanic)}</div></article>)}</div>
                    </>}
        </div>
        <aside className="editor-panel" aria-labelledby="mechanic-editor-title">
          <div className="mb-7"><h2 id="mechanic-editor-title" className="editor-title">{selectedId === null ? "Add a mechanic" : "Edit mechanic"}</h2><p className="mt-2 text-ink-soft">Inactive mechanics cannot receive new assignments. Existing assignments and history are kept.</p></div>
          <form onSubmit={submit} noValidate>
            <fieldset disabled={busy || status !== "ready"} className="m-0 min-w-0 border-0 p-0">
              <TextField ref={nameRef} id="mechanicFullName" label="Full name" value={form.fullName} maxLength={100} error={errors.fullName} onChange={(_, value) => change("fullName", value)} />
              <TextField ref={phoneRef} id="mechanicPhone" label="Phone number" type="tel" value={form.phone} maxLength={20} error={errors.phone} onChange={(_, value) => change("phone", value)} />
              <label className="mb-5 flex min-h-11 items-center gap-3 font-semibold"><input className="size-5 accent-rust" type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} />Active for new assignments</label>
              <FormError message={errors.form} />
              <div className="form-actions"><button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Add mechanic" : "Save changes"}</button>{selectedId !== null && <button className="button button-quiet" type="button" onClick={reset}>Cancel edit</button>}</div>
            </fieldset>
          </form>
        </aside>
      </div>
    </section>
  );
}
