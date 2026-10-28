import { useEffect, useMemo, useRef, useState } from "react";
import { getProblemFieldErrors, validateVehicle } from "../api.js";
import {
  FormError,
  MobileDatum,
  SelectField,
  StatePanel,
  TableCell,
  TableHead,
  TextField
} from "./Shared.jsx";

const blankVehicle = {
  customerId: "",
  registrationNumber: "",
  make: "",
  model: "",
  year: "",
  mileage: "0",
  isActive: true
};

export default function VehiclesSection({
  active,
  status,
  errorMessage,
  customers,
  vehicles,
  ownerFilter,
  busy,
  onOwnerFilterChange,
  onOpenSettings,
  onRetry,
  onSave,
  onDelete,
  onAddCustomer
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(blankVehicle);
  const [errors, setErrors] = useState({});
  const registrationRef = useRef(null);
  const maxYear = new Date().getUTCFullYear() + 1;

  const visibleVehicles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return vehicles.filter((vehicle) => {
      if (ownerFilter && Number(vehicle.customerId) !== Number(ownerFilter)) return false;
      if (!query) return true;
      return `${vehicle.registrationNumber ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.customerName ?? ""}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [vehicles, search, ownerFilter]);

  useEffect(() => {
    if (selectedId !== null && !vehicles.some((vehicle) => Number(vehicle.id) === selectedId)) {
      setSelectedId(null);
      setForm((current) => ({ ...blankVehicle, customerId: current.customerId }));
      setErrors({});
    }
  }, [vehicles, selectedId]);

  useEffect(() => {
    if (customers.length === 0) {
      setForm((current) => ({ ...current, customerId: "" }));
      return;
    }
    setForm((current) => {
      const ownerExists = customers.some((customer) => Number(customer.id) === Number(current.customerId));
      return ownerExists ? current : { ...current, customerId: String(customers[0].id) };
    });
  }, [customers]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function resetEditor({ focus = false } = {}) {
    const preferredOwner = ownerFilter && customers.some((customer) => Number(customer.id) === Number(ownerFilter))
      ? ownerFilter
      : customers[0]?.id ?? "";
    setSelectedId(null);
    setForm({ ...blankVehicle, customerId: String(preferredOwner) });
    setErrors({});
    if (focus) window.requestAnimationFrame(() => registrationRef.current?.focus());
  }

  function beginEdit(vehicle) {
    if (busy) return;
    setSelectedId(Number(vehicle.id));
    setForm({
      customerId: String(vehicle.customerId ?? ""),
      registrationNumber: String(vehicle.registrationNumber ?? ""),
      make: String(vehicle.make ?? ""),
      model: String(vehicle.model ?? ""),
      year: vehicle.year == null ? "" : String(vehicle.year),
      mileage: String(vehicle.mileage ?? 0),
      isActive: vehicle.isActive !== false
    });
    setErrors({});
    window.requestAnimationFrame(() => registrationRef.current?.focus({ preventScroll: true }));
  }

  async function submitVehicle(event) {
    event.preventDefault();
    if (busy || status !== "ready" || customers.length === 0) return;
    const validation = validateVehicle(form);
    setForm({
      ...validation.values,
      customerId: String(validation.values.customerId || ""),
      year: validation.values.year == null ? "" : String(validation.values.year),
      mileage: String(Number.isFinite(validation.values.mileage) ? validation.values.mileage : form.mileage)
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      window.requestAnimationFrame(() => registrationRef.current?.focus());
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
    <section hidden={!active} aria-labelledby="vehicles-title">
      <div className="workspace-grid">
        <div className="records-panel">
          <div className="records-heading">
            <div>
              <h1 id="vehicles-title" className="page-title" tabIndex={-1}>Vehicles</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Register each vehicle to an owner and keep mileage and active status current.</p>
            </div>
            <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || status !== "ready"} onClick={() => void onRetry()}>
              {status === "loading" ? "Loading..." : "Reload records"}
            </button>
          </div>

          <div className="filter-row filter-row-wide">
            <div>
              <label className="mb-2 block font-bold" htmlFor="vehicle-search">Search vehicles</label>
              <input id="vehicle-search" className="control-input" type="search" placeholder="Registration, make, model, or owner" autoComplete="off" value={search} disabled={status !== "ready"} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block font-bold" htmlFor="owner-filter">Filter by owner</label>
              <select id="owner-filter" className="control-input" value={ownerFilter} disabled={status !== "ready"} onChange={(event) => onOwnerFilterChange(event.target.value)}>
                <option value="">All customers</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}</option>)}
              </select>
            </div>
          </div>

          <VehicleRecords
            status={status}
            errorMessage={errorMessage}
            customers={customers}
            vehicles={vehicles}
            visibleVehicles={visibleVehicles}
            ownerFilter={ownerFilter}
            selectedId={selectedId}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onRetry={onRetry}
            onAdd={() => resetEditor({ focus: true })}
            onAddCustomer={onAddCustomer}
            onClearFilters={() => { setSearch(""); onOwnerFilterChange(""); }}
            onEdit={beginEdit}
            onDelete={onDelete}
          />
        </div>

        <aside className="editor-panel" aria-labelledby="vehicle-editor-title">
          {customers.length === 0 && status === "ready" ? (
            <StatePanel title="Add a customer first" body="Every vehicle needs an owner. Create a customer, then return here to register the vehicle.">
              <button className="button button-primary" type="button" onClick={onAddCustomer}>Go to customers</button>
            </StatePanel>
          ) : (
            <>
              <div className="mb-7">
                <h2 id="vehicle-editor-title" className="editor-title">{selectedId === null ? "Register a vehicle" : "Edit vehicle"}</h2>
                <p className="mt-2 max-w-[65ch] text-ink-soft">{selectedId === null ? "Link the vehicle to its customer record." : "Update ownership or vehicle details."}</p>
              </div>
              <form onSubmit={submitVehicle} noValidate>
                <fieldset disabled={status !== "ready" || busy} className="m-0 min-w-0 border-0 p-0">
                  <SelectField id="customerId" label="Owner" value={form.customerId} error={errors.customerId} onChange={updateField}>
                    <option value="">Choose a customer</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}</option>)}
                  </SelectField>
                  <TextField ref={registrationRef} id="registrationNumber" label="Registration number" value={form.registrationNumber} maxLength={30} help="Spaces and hyphens are removed when saved" error={errors.registrationNumber} onChange={updateField} />
                  <div className="grid grid-cols-2 gap-x-4 max-[500px]:grid-cols-1">
                    <TextField id="make" label="Make" value={form.make} maxLength={50} error={errors.make} onChange={updateField} />
                    <TextField id="model" label="Model" value={form.model} maxLength={100} error={errors.model} onChange={updateField} />
                    <TextField id="year" label="Year (optional)" value={form.year} type="number" min="1900" max={maxYear} inputMode="numeric" help={`1900 to ${maxYear}`} error={errors.year} onChange={updateField} />
                    <TextField id="mileage" label="Mileage" value={form.mileage} type="number" min="0" inputMode="numeric" help="Whole number, 0 or more" error={errors.mileage} onChange={updateField} />
                  </div>
                  <label className="mb-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-paper-line bg-paper px-3 py-2.5 font-bold">
                    <input className="size-5 accent-rust" type="checkbox" checked={form.isActive} onChange={(event) => updateField("isActive", event.target.checked)} />
                    Active vehicle
                  </label>
                  <FormError message={errors.form} />
                  <div className="form-actions">
                    <button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Register vehicle" : "Save changes"}</button>
                    {selectedId !== null && <button className="button button-quiet" type="button" onClick={() => resetEditor()}>Cancel edit</button>}
                  </div>
                </fieldset>
              </form>
              {status !== "ready" && <p className="mt-6 border-t border-paper-line pt-4 text-ink-soft">The editor unlocks after the API connects successfully.</p>}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function VehicleRecords(props) {
  const { status, errorMessage, customers, vehicles, visibleVehicles, ownerFilter, selectedId, busy, onOpenSettings, onRetry, onAdd, onAddCustomer, onClearFilters, onEdit, onDelete } = props;
  if (status === "disconnected") {
    return <StatePanel title="Connect your workshop API" body="Add the backend address to load customer and vehicle records."><button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button></StatePanel>;
  }
  if (status === "loading") return <StatePanel loading title="Loading workshop records" body="Waiting for customers and vehicles from the C# API." />;
  if (status === "error") {
    return <StatePanel error title="The API could not be reached" body={errorMessage || "Check the API address and confirm the backend is running."}><button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button><button className="button button-quiet" type="button" onClick={onOpenSettings}>Check API settings</button></StatePanel>;
  }
  if (customers.length === 0) {
    return <StatePanel title="A vehicle needs an owner" body="Add a customer before registering the first vehicle."><button className="button button-primary" type="button" onClick={onAddCustomer}>Add first customer</button></StatePanel>;
  }
  if (vehicles.length === 0) {
    return <StatePanel title="No vehicles registered yet" body="Register the first vehicle and choose its owner."><button className="button button-primary" type="button" onClick={onAdd}>Register first vehicle</button></StatePanel>;
  }
  if (visibleVehicles.length === 0) {
    return <StatePanel compact title={ownerFilter ? "No vehicles for this view" : "No matching vehicles"} body="Clear the search and owner filter to see all vehicle records."><button className="button button-quiet" type="button" onClick={onClearFilters}>Clear filters</button></StatePanel>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
        <table className="w-full min-w-220 border-collapse tabular-nums">
          <thead><tr><TableHead>Registration</TableHead><TableHead>Vehicle</TableHead><TableHead>Owner</TableHead><TableHead>Year</TableHead><TableHead>Mileage</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead>
          <tbody>
            {visibleVehicles.map((vehicle) => (
              <tr key={vehicle.id} className={Number(vehicle.id) === selectedId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                <TableCell className="font-bold tracking-[0.03em]">{vehicle.registrationNumber}</TableCell>
                <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                <TableCell>{vehicle.customerName}</TableCell>
                <TableCell>{vehicle.year ?? "Not provided"}</TableCell>
                <TableCell>{Number(vehicle.mileage ?? 0).toLocaleString("en-MY")} km</TableCell>
                <TableCell><span className={vehicle.isActive === false ? "status-text text-ink-soft" : "status-text text-success"}>{vehicle.isActive === false ? "Inactive" : "Active"}</span></TableCell>
                <TableCell><VehicleActions vehicle={vehicle} busy={busy} onEdit={onEdit} onDelete={onDelete} /></TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 desk:hidden">
        {visibleVehicles.map((vehicle) => (
          <article key={vehicle.id} className={`record-card ${Number(vehicle.id) === selectedId ? "border-line-strong bg-selected" : "border-paper-line bg-paper-raised"}`}>
            <MobileDatum label="Registration"><strong>{vehicle.registrationNumber}</strong></MobileDatum>
            <MobileDatum label="Vehicle">{vehicle.make} {vehicle.model}</MobileDatum>
            <MobileDatum label="Owner">{vehicle.customerName}</MobileDatum>
            <MobileDatum label="Year">{vehicle.year ?? "Not provided"}</MobileDatum>
            <MobileDatum label="Mileage">{Number(vehicle.mileage ?? 0).toLocaleString("en-MY")} km</MobileDatum>
            <MobileDatum label="Status">{vehicle.isActive === false ? "Inactive" : "Active"}</MobileDatum>
            <div className="mt-2 border-t border-paper-line pt-2"><VehicleActions vehicle={vehicle} busy={busy} onEdit={onEdit} onDelete={onDelete} /></div>
          </article>
        ))}
      </div>
    </>
  );
}

function VehicleActions({ vehicle, busy, onEdit, onDelete }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 max-desk:justify-start">
      <button className="row-action" type="button" disabled={busy} onClick={() => onEdit(vehicle)} aria-label={`Edit ${vehicle.registrationNumber}`}>Edit</button>
      <button className="row-action text-danger" type="button" disabled={busy} onClick={(event) => onDelete("vehicle", vehicle, event.currentTarget)} aria-label={`Delete ${vehicle.registrationNumber}`}>Delete</button>
    </div>
  );
}
