import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPOINTMENT_STATUSES,
  getProblemFieldErrors,
  toLocalDateTimeInput,
  validateAppointment
} from "../api.js";
import {
  FormError,
  MobileDatum,
  SelectField,
  StatePanel,
  TableCell,
  TableHead,
  TextAreaField,
  TextField
} from "./Shared.jsx";

function nextAppointmentTime() {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return toLocalDateTimeInput(next);
}

function makeBlankAppointment(customerId = "") {
  return {
    customerId: String(customerId),
    vehicleId: "",
    scheduledAtLocal: nextAppointmentTime(),
    serviceType: "",
    notes: "",
    status: "Scheduled"
  };
}

const statusLabels = {
  Scheduled: "Scheduled",
  InProgress: "In progress",
  Completed: "Completed",
  Cancelled: "Cancelled"
};

const statusClasses = {
  Scheduled: "text-rust-dark",
  InProgress: "text-focus",
  Completed: "text-success",
  Cancelled: "text-ink-soft"
};

function formatAppointmentTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default function AppointmentsSection({
  active,
  connectionStatus,
  errorMessage,
  customers,
  vehicles,
  appointments,
  busy,
  onOpenSettings,
  onRetry,
  onSave,
  onAddCustomer,
  onAddVehicle
}) {
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => makeBlankAppointment());
  const [errors, setErrors] = useState({});
  const customerRef = useRef(null);
  const vehicleRef = useRef(null);
  const dateRef = useRef(null);
  const serviceRef = useRef(null);

  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => Number(appointment.id) === selectedId) ?? null,
    [appointments, selectedId]
  );

  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return appointments.filter((appointment) => {
      if (customerFilter && Number(appointment.customerId) !== Number(customerFilter)) return false;
      if (statusFilter && appointment.status !== statusFilter) return false;
      if (!query) return true;
      return `${appointment.customerName ?? ""} ${appointment.registrationNumber ?? ""} ${appointment.vehicleName ?? ""} ${appointment.serviceType ?? ""} ${appointment.notes ?? ""}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [appointments, customerFilter, search, statusFilter]);

  const appointmentVehicles = useMemo(() => {
    const matchingOwner = vehicles.filter((vehicle) => Number(vehicle.customerId) === Number(form.customerId));
    const currentVehicleId = Number(form.vehicleId);
    if (!selectedAppointment || !currentVehicleId || matchingOwner.some((vehicle) => Number(vehicle.id) === currentVehicleId)) {
      return matchingOwner;
    }
    const currentVehicle = vehicles.find((vehicle) => Number(vehicle.id) === currentVehicleId);
    if (currentVehicle) return [currentVehicle, ...matchingOwner];
    return [{
      id: selectedAppointment.vehicleId,
      customerId: selectedAppointment.customerId,
      registrationNumber: selectedAppointment.registrationNumber,
      make: selectedAppointment.vehicleName,
      model: "",
      historical: true
    }, ...matchingOwner];
  }, [form.customerId, form.vehicleId, selectedAppointment, vehicles]);

  const availableStatuses = useMemo(() => {
    if (!selectedAppointment || selectedAppointment.status === "Scheduled") {
      return ["Scheduled", "InProgress", "Cancelled"];
    }
    if (selectedAppointment.status === "InProgress") {
      return ["InProgress", "Completed", "Cancelled"];
    }
    return [selectedAppointment.status];
  }, [selectedAppointment]);

  const terminalAppointment = selectedAppointment?.status === "Completed" || selectedAppointment?.status === "Cancelled";

  useEffect(() => {
    if (selectedId !== null && !appointments.some((appointment) => Number(appointment.id) === selectedId)) {
      setSelectedId(null);
      setForm(makeBlankAppointment(customers[0]?.id ?? ""));
      setErrors({});
    }
  }, [appointments, customers, selectedId]);

  useEffect(() => {
    if (selectedId !== null) return;
    setForm((current) => {
      const customerExists = customers.some((customer) => Number(customer.id) === Number(current.customerId));
      return customerExists ? current : makeBlankAppointment(customers[0]?.id ?? "");
    });
  }, [customers, selectedId]);

  function updateField(field, value) {
    setForm((current) => {
      if (field === "customerId") {
        const selectedVehicleStillMatches = vehicles.some(
          (vehicle) => Number(vehicle.id) === Number(current.vehicleId) && Number(vehicle.customerId) === Number(value)
        );
        return { ...current, customerId: value, vehicleId: selectedVehicleStillMatches ? current.vehicleId : "" };
      }
      return { ...current, [field]: value };
    });
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      ...(field === "customerId" ? { vehicleId: undefined } : {}),
      ...(field === "scheduledAtLocal" ? { scheduledAtUtc: undefined } : {}),
      form: undefined
    }));
  }

  function focusFirstError(fieldErrors) {
    const target = fieldErrors.customerId
      ? customerRef
      : fieldErrors.vehicleId
        ? vehicleRef
        : fieldErrors.scheduledAtUtc || fieldErrors.scheduledAtLocal
          ? dateRef
          : serviceRef;
    window.requestAnimationFrame(() => target.current?.focus());
  }

  function resetEditor({ focus = false } = {}) {
    setSelectedId(null);
    setForm(makeBlankAppointment(customerFilter || customers[0]?.id || ""));
    setErrors({});
    if (focus) window.requestAnimationFrame(() => customerRef.current?.focus());
  }

  function beginEdit(appointment) {
    if (busy) return;
    setSelectedId(Number(appointment.id));
    setForm({
      customerId: String(appointment.customerId ?? ""),
      vehicleId: String(appointment.vehicleId ?? ""),
      scheduledAtLocal: toLocalDateTimeInput(appointment.scheduledAtUtc),
      serviceType: String(appointment.serviceType ?? ""),
      notes: String(appointment.notes ?? ""),
      status: APPOINTMENT_STATUSES.includes(appointment.status) ? appointment.status : "Scheduled"
    });
    setErrors({});
    window.requestAnimationFrame(() => customerRef.current?.focus({ preventScroll: true }));
  }

  async function submitAppointment(event) {
    event.preventDefault();
    if (busy || connectionStatus !== "ready" || customers.length === 0 || vehicles.length === 0) return;
    const editing = selectedId !== null;
    const dateControl = event.currentTarget.elements.namedItem("scheduledAtLocal");
    const submittedForm = {
      ...form,
      scheduledAtLocal: typeof dateControl?.value === "string" ? dateControl.value : form.scheduledAtLocal
    };
    const validation = validateAppointment(submittedForm, { includeStatus: editing });
    if (!validation.valid) {
      setErrors(validation.errors);
      focusFirstError(validation.errors);
      return;
    }

    setErrors({});
    try {
      await onSave(selectedId, validation.values);
      resetEditor();
    } catch (error) {
      const fieldErrors = getProblemFieldErrors(error);
      if (fieldErrors.scheduledAtUtc) fieldErrors.scheduledAtLocal = fieldErrors.scheduledAtUtc;
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
      if (Object.keys(fieldErrors).length) focusFirstError(fieldErrors);
    }
  }

  const noBookingFoundation = connectionStatus === "ready" && (customers.length === 0 || vehicles.length === 0);

  return (
    <section hidden={!active} aria-labelledby="appointments-title">
      <div className="workspace-grid">
        <div className="min-w-0 px-[clamp(1rem,5vw,5rem)] py-[clamp(2.25rem,5vw,5rem)]">
          <div className="mb-8 flex items-end justify-between gap-6 max-mid:flex-col max-mid:items-start">
            <div>
              <h1 id="appointments-title" className="page-title">Appointments</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Book workshop visits, track service progress, and keep the original customer attached to each booking.</p>
            </div>
            <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || connectionStatus !== "ready"} onClick={() => void onRetry()}>
              {connectionStatus === "loading" ? "Loading..." : "Reload records"}
            </button>
          </div>

          <div className="appointment-filters">
            <div className="appointment-search">
              <label className="mb-2 block font-bold" htmlFor="appointment-search">Search appointments</label>
              <input id="appointment-search" className="control-input" type="search" placeholder="Customer, vehicle, or service" autoComplete="off" value={search} disabled={connectionStatus !== "ready"} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block font-bold" htmlFor="appointment-customer-filter">Customer</label>
              <select id="appointment-customer-filter" className="control-input" value={customerFilter} disabled={connectionStatus !== "ready"} onChange={(event) => setCustomerFilter(event.target.value)}>
                <option value="">All customers</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block font-bold" htmlFor="appointment-status-filter">Status</label>
              <select id="appointment-status-filter" className="control-input" value={statusFilter} disabled={connectionStatus !== "ready"} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {APPOINTMENT_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>
            </div>
          </div>

          <AppointmentRecords
            connectionStatus={connectionStatus}
            errorMessage={errorMessage}
            customers={customers}
            vehicles={vehicles}
            appointments={appointments}
            visibleAppointments={visibleAppointments}
            hasFilters={Boolean(search || customerFilter || statusFilter)}
            selectedId={selectedId}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onRetry={onRetry}
            onAdd={() => resetEditor({ focus: true })}
            onAddCustomer={onAddCustomer}
            onAddVehicle={onAddVehicle}
            onClearFilters={() => { setSearch(""); setCustomerFilter(""); setStatusFilter(""); }}
            onEdit={beginEdit}
          />
        </div>

        <aside className="editor-panel" aria-labelledby="appointment-editor-title">
          {noBookingFoundation ? (
            customers.length === 0 ? (
              <StatePanel title="Add a customer first" body="An appointment needs a customer and one of their registered vehicles.">
                <button className="button button-primary" type="button" onClick={onAddCustomer}>Go to customers</button>
              </StatePanel>
            ) : (
              <StatePanel title="Register a vehicle first" body="Add a vehicle to a customer before booking their workshop visit.">
                <button className="button button-primary" type="button" onClick={onAddVehicle}>Go to vehicles</button>
              </StatePanel>
            )
          ) : (
            <>
              <div className="mb-7">
                <h2 id="appointment-editor-title" className="editor-title">{selectedId === null ? "Book an appointment" : "Edit appointment"}</h2>
                <p className="mt-2 max-w-[65ch] text-ink-soft">
                  {selectedId === null
                    ? "Choose the customer first to see only their vehicles."
                    : terminalAppointment
                      ? `This ${statusLabels[selectedAppointment.status].toLocaleLowerCase()} appointment is kept as read-only workshop history.`
                      : "Update the schedule, service details, or progress status."}
                </p>
              </div>
              <form onSubmit={submitAppointment} noValidate>
                <fieldset disabled={connectionStatus !== "ready" || busy || terminalAppointment} className="m-0 min-w-0 border-0 p-0">
                  <SelectField ref={customerRef} id="customerId" label="Customer" value={form.customerId} error={errors.customerId} onChange={updateField}>
                    <option value="">Choose a customer</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}</option>)}
                  </SelectField>
                  <SelectField ref={vehicleRef} id="vehicleId" label="Vehicle" value={form.vehicleId} error={errors.vehicleId} help={appointmentVehicles.length === 0 ? "This customer has no registered vehicles." : "Only vehicles registered to the selected customer are listed."} onChange={updateField}>
                    <option value="">Choose a vehicle</option>
                    {appointmentVehicles.map((vehicle) => {
                      const changedOwner = Number(vehicle.customerId) !== Number(form.customerId);
                      const label = `${vehicle.registrationNumber} · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}${changedOwner ? " (current booking; owner changed)" : vehicle.isActive === false ? " (inactive)" : ""}`;
                      return <option key={vehicle.id} value={vehicle.id}>{label}</option>;
                    })}
                  </SelectField>
                  <TextField ref={dateRef} id="scheduledAtLocal" label="Date and time" value={form.scheduledAtLocal} type="datetime-local" error={errors.scheduledAtLocal || errors.scheduledAtUtc} help="Shown in your local time" onChange={updateField} />
                  <TextField ref={serviceRef} id="serviceType" label="Service required" value={form.serviceType} maxLength={100} error={errors.serviceType} help="Required, up to 100 characters" onChange={updateField} />
                  <TextAreaField id="notes" label="Notes (optional)" value={form.notes} maxLength={500} error={errors.notes} help="Up to 500 characters" onChange={updateField} />
                  {selectedId !== null && (
                    <SelectField id="status" label="Status" value={form.status} error={errors.status} help="Cancel a booking by changing its status to Cancelled." onChange={updateField}>
                      {availableStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
                    </SelectField>
                  )}
                  <FormError message={errors.form} />
                  {!terminalAppointment && (
                    <div className="form-actions">
                      <button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Book appointment" : "Save changes"}</button>
                      {selectedId !== null && <button className="button button-quiet" type="button" onClick={() => resetEditor()}>Cancel edit</button>}
                    </div>
                  )}
                </fieldset>
                {terminalAppointment && <button className="button button-secondary w-full" type="button" onClick={() => resetEditor()}>Close record</button>}
              </form>
              {connectionStatus !== "ready" && <p className="mt-6 border-t border-paper-line pt-4 text-ink-soft">The editor unlocks after the API connects successfully.</p>}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function AppointmentRecords(props) {
  const { connectionStatus, errorMessage, customers, vehicles, appointments, visibleAppointments, hasFilters, selectedId, busy, onOpenSettings, onRetry, onAdd, onAddCustomer, onAddVehicle, onClearFilters, onEdit } = props;
  if (connectionStatus === "disconnected") {
    return <StatePanel title="Connect your workshop API" body="Add the backend address to load appointment records."><button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button></StatePanel>;
  }
  if (connectionStatus === "loading") return <StatePanel loading title="Loading workshop records" body="Waiting for appointments, customers, and vehicles from the C# API." />;
  if (connectionStatus === "error") {
    return <StatePanel error title="The API could not be reached" body={errorMessage || "Check the API address and confirm the backend is running."}><button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button><button className="button button-quiet" type="button" onClick={onOpenSettings}>Check API settings</button></StatePanel>;
  }
  if (customers.length === 0) {
    return <StatePanel title="An appointment needs a customer" body="Add the first customer before creating a workshop appointment."><button className="button button-primary" type="button" onClick={onAddCustomer}>Add first customer</button></StatePanel>;
  }
  if (vehicles.length === 0) {
    return <StatePanel title="An appointment needs a vehicle" body="Register a vehicle to a customer before creating the first appointment."><button className="button button-primary" type="button" onClick={onAddVehicle}>Register first vehicle</button></StatePanel>;
  }
  if (appointments.length === 0) {
    return <StatePanel title="No appointments booked yet" body="Book the first workshop visit and choose the service required."><button className="button button-primary" type="button" onClick={onAdd}>Book first appointment</button></StatePanel>;
  }
  if (visibleAppointments.length === 0) {
    return <StatePanel compact title="No matching appointments" body="Clear the search and filters to see all bookings.">{hasFilters && <button className="button button-quiet" type="button" onClick={onClearFilters}>Clear filters</button>}</StatePanel>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
        <table className="w-full min-w-245 border-collapse tabular-nums">
          <thead><tr><TableHead>When</TableHead><TableHead>Customer</TableHead><TableHead>Vehicle</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead>
          <tbody>
            {visibleAppointments.map((appointment) => (
              <tr key={appointment.id} className={Number(appointment.id) === selectedId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                <TableCell className="font-semibold whitespace-nowrap">{formatAppointmentTime(appointment.scheduledAtUtc)}</TableCell>
                <TableCell>{appointment.customerName}</TableCell>
                <TableCell><strong>{appointment.registrationNumber}</strong><span className="mt-0.5 block text-sm text-ink-soft">{appointment.vehicleName}</span></TableCell>
                <TableCell className="max-w-70">{appointment.serviceType}<span className="mt-0.5 block text-sm text-ink-soft">{appointment.notes || "No notes"}</span></TableCell>
                <TableCell><span className={`status-text ${statusClasses[appointment.status] ?? "text-ink-soft"}`}>{statusLabels[appointment.status] ?? appointment.status}</span></TableCell>
                <TableCell><AppointmentActions appointment={appointment} busy={busy} onEdit={onEdit} /></TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 desk:hidden">
        {visibleAppointments.map((appointment) => (
          <article key={appointment.id} className={`record-card ${Number(appointment.id) === selectedId ? "border-line-strong bg-selected" : "border-paper-line bg-paper-raised"}`}>
            <MobileDatum label="When"><strong>{formatAppointmentTime(appointment.scheduledAtUtc)}</strong></MobileDatum>
            <MobileDatum label="Customer">{appointment.customerName}</MobileDatum>
            <MobileDatum label="Vehicle">{appointment.registrationNumber} · {appointment.vehicleName}</MobileDatum>
            <MobileDatum label="Service">{appointment.serviceType}</MobileDatum>
            <MobileDatum label="Notes">{appointment.notes || "No notes"}</MobileDatum>
            <MobileDatum label="Status"><span className={statusClasses[appointment.status] ?? "text-ink-soft"}>{statusLabels[appointment.status] ?? appointment.status}</span></MobileDatum>
            <div className="mt-2 border-t border-paper-line pt-2"><AppointmentActions appointment={appointment} busy={busy} onEdit={onEdit} /></div>
          </article>
        ))}
      </div>
    </>
  );
}

function AppointmentActions({ appointment, busy, onEdit }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 max-desk:justify-start">
      <button className="row-action" type="button" disabled={busy} onClick={() => onEdit(appointment)} aria-label={`Edit ${appointment.serviceType} appointment for ${appointment.customerName}`}>Edit</button>
    </div>
  );
}
