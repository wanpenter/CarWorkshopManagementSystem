import { useEffect, useMemo, useRef, useState } from "react";
import { getProblemFieldErrors, validateCustomer } from "../api.js";
import {
  FormError,
  MobileDatum,
  StatePanel,
  TableCell,
  TableHead,
  TextAreaField,
  TextField
} from "./Shared.jsx";

const emptyCustomer = { fullName: "", phone: "", address: "" };

export default function CustomersSection({
  active,
  status,
  errorMessage,
  customers,
  busy,
  onOpenSettings,
  onRetry,
  onSave,
  onDelete,
  onViewVehicles
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyCustomer);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return customers;
    return customers.filter((customer) =>
      `${customer.fullName ?? ""} ${customer.phone ?? ""} ${customer.address ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [customers, search]);

  useEffect(() => {
    if (selectedId !== null && !customers.some((customer) => Number(customer.id) === selectedId)) {
      setSelectedId(null);
      setForm(emptyCustomer);
      setErrors({});
    }
  }, [customers, selectedId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function resetEditor({ focus = false } = {}) {
    setSelectedId(null);
    setForm(emptyCustomer);
    setErrors({});
    if (focus) window.requestAnimationFrame(() => nameRef.current?.focus());
  }

  function beginEdit(customer) {
    if (busy) return;
    setSelectedId(Number(customer.id));
    setForm({
      fullName: String(customer.fullName ?? ""),
      phone: String(customer.phone ?? ""),
      address: String(customer.address ?? "")
    });
    setErrors({});
    window.requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true }));
  }

  async function submitCustomer(event) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    const validation = validateCustomer(form);
    setForm({ ...validation.values, address: validation.values.address ?? "" });
    if (!validation.valid) {
      setErrors(validation.errors);
      window.requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }

    setErrors({});
    try {
      await onSave(selectedId, validation.values);
      resetEditor();
    } catch (error) {
      const fieldErrors = getProblemFieldErrors(error);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
    }
  }

  return (
    <section hidden={!active} aria-labelledby="customers-title">
      <div className="workspace-grid">
        <div className="min-w-0 px-[clamp(1rem,5vw,5rem)] py-[clamp(2.25rem,5vw,5rem)]">
          <div className="mb-8 flex items-end justify-between gap-6 max-mid:flex-col max-mid:items-start">
            <div>
              <h1 id="customers-title" className="page-title">Customers</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Manage customer contact details and open the vehicles registered to each owner.</p>
            </div>
            <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || status !== "ready"} onClick={() => void onRetry()}>
              {status === "loading" ? "Loading..." : "Reload records"}
            </button>
          </div>

          <div className="filter-row">
            <label className="font-bold" htmlFor="customer-search">Search customers</label>
            <input
              id="customer-search"
              className="control-input"
              type="search"
              placeholder="Name, phone, or address"
              autoComplete="off"
              value={search}
              disabled={status !== "ready"}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <CustomerRecords
            status={status}
            errorMessage={errorMessage}
            customers={customers}
            visibleCustomers={visibleCustomers}
            selectedId={selectedId}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onRetry={onRetry}
            onAdd={() => resetEditor({ focus: true })}
            onClearSearch={() => setSearch("")}
            onEdit={beginEdit}
            onDelete={onDelete}
            onViewVehicles={onViewVehicles}
          />
        </div>

        <aside className="editor-panel" aria-labelledby="customer-editor-title">
          <div className="mb-7">
            <h2 id="customer-editor-title" className="editor-title">{selectedId === null ? "Add a customer" : "Edit customer"}</h2>
            <p className="mt-2 max-w-[65ch] text-ink-soft">{selectedId === null ? "Create the owner record before registering a vehicle." : "Update this customer's contact details."}</p>
          </div>
          <form onSubmit={submitCustomer} noValidate>
            <fieldset disabled={status !== "ready" || busy} className="m-0 min-w-0 border-0 p-0">
              <TextField ref={nameRef} id="fullName" label="Full name" value={form.fullName} maxLength={100} help="Required, up to 100 characters" autoComplete="name" error={errors.fullName} onChange={updateField} />
              <TextField id="phone" label="Phone" value={form.phone} maxLength={20} help="Required, 7 to 15 digits" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone} onChange={updateField} />
              <TextAreaField id="address" label="Address (optional)" value={form.address} maxLength={500} help="Up to 500 characters" error={errors.address} onChange={updateField} />
              <FormError message={errors.form} />
              <div className="form-actions">
                <button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Add customer" : "Save changes"}</button>
                {selectedId !== null && <button className="button button-quiet" type="button" onClick={() => resetEditor()}>Cancel edit</button>}
              </div>
            </fieldset>
          </form>
          {status !== "ready" && <p className="mt-6 border-t border-paper-line pt-4 text-ink-soft">The editor unlocks after the API connects successfully.</p>}
        </aside>
      </div>
    </section>
  );
}

function CustomerRecords(props) {
  const { status, errorMessage, customers, visibleCustomers, selectedId, busy, onOpenSettings, onRetry, onAdd, onClearSearch, onEdit, onDelete, onViewVehicles } = props;
  if (status === "disconnected") {
    return <StatePanel title="Connect your workshop API" body="Add the backend address to load customer and vehicle records."><button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button></StatePanel>;
  }
  if (status === "loading") return <StatePanel loading title="Loading workshop records" body="Waiting for customers and vehicles from the C# API." />;
  if (status === "error") {
    return <StatePanel error title="The API could not be reached" body={errorMessage || "Check the API address and confirm the backend is running."}><button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button><button className="button button-quiet" type="button" onClick={onOpenSettings}>Check API settings</button></StatePanel>;
  }
  if (customers.length === 0) {
    return <StatePanel title="No customers recorded yet" body="Add the first customer, then register their vehicle."><button className="button button-primary" type="button" onClick={onAdd}>Add first customer</button></StatePanel>;
  }
  if (visibleCustomers.length === 0) {
    return <StatePanel compact title="No matching customers" body="Change the search text to see other customer records."><button className="button button-quiet" type="button" onClick={onClearSearch}>Clear search</button></StatePanel>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
        <table className="w-full min-w-190 border-collapse tabular-nums">
          <thead><tr><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead><TableHead>Vehicles</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead>
          <tbody>
            {visibleCustomers.map((customer) => (
              <tr key={customer.id} className={Number(customer.id) === selectedId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                <TableCell className="font-bold">{customer.fullName}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell className="max-w-72 text-ink-soft">{customer.address || "—"}</TableCell>
                <TableCell><button className="count-link" type="button" disabled={busy} onClick={() => onViewVehicles(Number(customer.id))}>{Number(customer.vehicleCount ?? 0)} {Number(customer.vehicleCount ?? 0) === 1 ? "vehicle" : "vehicles"}</button></TableCell>
                <TableCell><CustomerActions customer={customer} busy={busy} onEdit={onEdit} onDelete={onDelete} /></TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 desk:hidden">
        {visibleCustomers.map((customer) => (
          <article key={customer.id} className={`record-card ${Number(customer.id) === selectedId ? "border-line-strong bg-selected" : "border-paper-line bg-paper-raised"}`}>
            <MobileDatum label="Customer"><strong>{customer.fullName}</strong></MobileDatum>
            <MobileDatum label="Phone">{customer.phone}</MobileDatum>
            <MobileDatum label="Address">{customer.address || "—"}</MobileDatum>
            <MobileDatum label="Vehicles"><button className="count-link" type="button" disabled={busy} onClick={() => onViewVehicles(Number(customer.id))}>{Number(customer.vehicleCount ?? 0)} registered</button></MobileDatum>
            <div className="mt-2 border-t border-paper-line pt-2"><CustomerActions customer={customer} busy={busy} onEdit={onEdit} onDelete={onDelete} /></div>
          </article>
        ))}
      </div>
    </>
  );
}

function CustomerActions({ customer, busy, onEdit, onDelete }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 max-desk:justify-start">
      <button className="row-action" type="button" disabled={busy} onClick={() => onEdit(customer)} aria-label={`Edit ${customer.fullName}`}>Edit</button>
      <button className="row-action text-danger" type="button" disabled={busy} onClick={(event) => onDelete("customer", customer, event.currentTarget)} aria-label={`Delete ${customer.fullName}`}>Delete</button>
    </div>
  );
}
