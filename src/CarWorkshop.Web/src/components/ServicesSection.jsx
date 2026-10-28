import { useEffect, useMemo, useRef, useState } from "react";
import { FormError, MobileDatum, StatePanel, TableCell, TableHead, TextAreaField, TextField } from "./Shared.jsx";
import { getProblemFieldErrors } from "../api.js";

const emptyForm = { name: "", description: "", currentPrice: "", estimatedDurationMinutes: "30", isActive: true };
const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);

export function validateService(values) {
  const name = String(values?.name ?? "").trim();
  const description = String(values?.description ?? "").trim();
  const currentPrice = Number(values?.currentPrice);
  const estimatedDurationMinutes = Number(values?.estimatedDurationMinutes);
  const errors = {};
  if (!name) errors.name = "Enter the service name.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";
  if (description.length > 500) errors.description = "Use 500 characters or fewer.";
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(values?.currentPrice ?? "").trim()) || !Number.isFinite(currentPrice) || currentPrice > 999999.99) errors.currentPrice = "Enter a price from 0 to 999,999.99, with up to two decimal places.";
  if (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes <= 0 || estimatedDurationMinutes > 540) errors.estimatedDurationMinutes = "Enter a duration from 1 to 540 minutes.";
  return { valid: Object.keys(errors).length === 0, errors, values: { name, description: description || null, currentPrice, estimatedDurationMinutes, isActive: values?.isActive !== false } };
}

export default function ServicesSection({ active, status, errorMessage, services, busy, onOpenSettings, onRetry, onSave }) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);
  const visible = useMemo(() => services.filter((service) => (showInactive || service.isActive) && `${service.name} ${service.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [services, showInactive, query]);
  useEffect(() => {
    if (selectedId !== null && !services.some((service) => Number(service.id) === selectedId)) {
      setSelectedId(null);
      setForm(emptyForm);
    }
  }, [services, selectedId]);

  function edit(service) {
    setSelectedId(Number(service.id));
    setForm({ name: service.name ?? "", description: service.description ?? "", currentPrice: String(service.currentPrice ?? ""), estimatedDurationMinutes: String(service.estimatedDurationMinutes ?? 30), isActive: service.isActive !== false });
    setErrors({});
    window.requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true }));
  }
  function reset() {
    setSelectedId(null);
    setForm(emptyForm);
    setErrors({});
    window.requestAnimationFrame(() => nameRef.current?.focus());
  }
  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    const checked = validateService(form);
    if (!checked.valid) {
      setErrors(checked.errors);
      if (checked.errors.name) window.requestAnimationFrame(() => nameRef.current?.focus());
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
  async function toggle(service) {
    if (busy) return;
    try {
      await onSave(Number(service.id), { name: service.name, description: service.description ?? null, currentPrice: service.currentPrice, estimatedDurationMinutes: service.estimatedDurationMinutes, isActive: !service.isActive });
      if (selectedId === Number(service.id)) change("isActive", !service.isActive);
    } catch (error) {
      setErrors({ form: error.message });
    }
  }

  return <section hidden={!active} aria-labelledby="services-title"><div className="workspace-grid">
    <div className="records-panel">
      <div className="records-heading">
        <div><h1 id="services-title" className="page-title" tabIndex={-1}>Services</h1><p className="mt-3 max-w-[65ch] text-ink-soft">Set the price and time for work offered at the workshop. Inactive services stay visible in past bookings.</p></div>
        <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || status !== "ready"} onClick={() => void onRetry()}>Reload records</button>
      </div>
      <div className="appointment-filters service-filters"><div><label className="mb-2 block font-bold" htmlFor="service-search">Search services</label><input id="service-search" className="control-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or description" disabled={status !== "ready"} /></div><label className="inline-flex min-h-11 items-center gap-3 font-semibold"><input className="size-5 accent-rust" type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} disabled={status !== "ready"} /> Show inactive</label></div>
      {status === "disconnected" ? <StatePanel title="Connect your workshop API" body="Add the backend address to load services."><button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button></StatePanel>
        : status === "loading" ? <StatePanel loading title="Loading services" body="Waiting for the C# API." />
          : status === "error" ? <StatePanel error title="The API could not be reached" body={errorMessage}><button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button></StatePanel>
            : services.length === 0 ? <StatePanel title="No services yet" body="Add the first workshop service to start taking bookings."><button className="button button-primary" type="button" onClick={reset}>Add a service</button></StatePanel>
              : visible.length === 0 ? <StatePanel compact title="No matching services" body="Change the search or show inactive services to see more results."><button className="button button-quiet" type="button" onClick={() => { setQuery(""); setShowInactive(true); }}>Clear filters</button></StatePanel>
                : <><div className="hidden overflow-x-auto border-b border-line-strong desk:block"><table className="w-full min-w-165 border-collapse"><thead><tr><TableHead>Service</TableHead><TableHead>Duration</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead><tbody>{visible.map((service) => <tr key={service.id} className={selectedId === Number(service.id) ? "bg-selected" : "hover:bg-selected"}><TableCell><strong>{service.name}</strong><span className="mt-0.5 block text-sm text-ink-soft">{service.description || "No description"}</span></TableCell><TableCell>{service.estimatedDurationMinutes} min</TableCell><TableCell>{money(service.currentPrice)}</TableCell><TableCell><span className={`status-text ${service.isActive ? "text-success" : "text-ink-soft"}`}>{service.isActive ? "Active" : "Inactive"}</span></TableCell><TableCell><div className="flex justify-end gap-1"><button className="row-action" type="button" disabled={busy} onClick={() => edit(service)}>Edit</button><button className="row-action" type="button" disabled={busy} onClick={() => void toggle(service)}>{service.isActive ? "Deactivate" : "Activate"}</button></div></TableCell></tr>)}</tbody></table></div><div className="grid gap-3 desk:hidden">{visible.map((service) => <article key={service.id} className="record-card border-paper-line bg-paper-raised"><h2 className="font-display text-xl font-bold">{service.name}</h2>{service.description && <p className="my-2 text-ink-soft">{service.description}</p>}<MobileDatum label="Duration">{service.estimatedDurationMinutes} min</MobileDatum><MobileDatum label="Price">{money(service.currentPrice)}</MobileDatum><MobileDatum label="Status">{service.isActive ? "Active" : "Inactive"}</MobileDatum><div className="mt-2 flex flex-wrap gap-2 border-t border-paper-line pt-2"><button className="row-action" type="button" disabled={busy} onClick={() => edit(service)}>Edit</button><button className="row-action" type="button" disabled={busy} onClick={() => void toggle(service)}>{service.isActive ? "Deactivate" : "Activate"}</button></div></article>)}</div></>}
    </div>
    <aside className="editor-panel" aria-labelledby="service-editor-title"><div className="mb-7"><h2 id="service-editor-title" className="editor-title">{selectedId === null ? "Add a service" : "Edit service"}</h2><p className="mt-2 text-ink-soft">Prices and durations on existing bookings are kept as they were when booked.</p></div><form onSubmit={submit} noValidate><fieldset disabled={status !== "ready" || busy} className="m-0 min-w-0 border-0 p-0"><TextField ref={nameRef} id="name" label="Service name" value={form.name} maxLength={100} error={errors.name} onChange={change} /><TextAreaField id="description" label="Description (optional)" value={form.description} maxLength={500} error={errors.description} onChange={change} /><TextField id="currentPrice" label="Price (RM)" value={form.currentPrice} type="number" min="0" inputMode="decimal" error={errors.currentPrice} onChange={change} /><TextField id="estimatedDurationMinutes" label="Estimated duration (minutes)" value={form.estimatedDurationMinutes} type="number" min="1" max="540" inputMode="numeric" error={errors.estimatedDurationMinutes} onChange={change} /><label className="mb-5 flex min-h-11 items-center gap-3 font-semibold"><input className="size-5 accent-rust" type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} /> Available for new bookings</label><FormError message={errors.form} /><div className="form-actions"><button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Add service" : "Save changes"}</button>{selectedId !== null && <button className="button button-quiet" type="button" onClick={reset}>Cancel edit</button>}</div></fieldset></form></aside>
  </div></section>;
}
