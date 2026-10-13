import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPOINTMENT_STATUSES,
  appointmentEstimate,
  getProblemFieldErrors,
  toWorkshopDateTimeInput,
  toWorkshopUtcIso,
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
  const next = new Date(Date.now() + 60 * 60 * 1000);
  const workshop = toWorkshopDateTimeInput(next);
  const [date, clock] = workshop.split("T");
  const minutes = Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  const rounded = Math.ceil(minutes / 30) * 30;
  if (rounded >= 17 * 60 + 30) {
    const tomorrow = new Date(`${date}T08:30:00+08:00`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return toWorkshopDateTimeInput(tomorrow);
  }
  if (rounded < 8 * 60 + 30) return `${date}T08:30`;
  return `${date}T${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function makeBlankAppointment(customerId = "") {
  return {
    customerId: String(customerId),
    vehicleId: "",
    scheduledAtLocal: nextAppointmentTime(),
    serviceIds: [],
    notes: "",
    status: "Requested"
  };
}

const statusLabels = {
  Requested: "Needs review",
  Confirmed: "Confirmed",
  Rejected: "Rejected",
  Scheduled: "Scheduled",
  InProgress: "In progress",
  Completed: "Completed",
  Cancelled: "Cancelled"
};

const statusClasses = {
  Requested: "text-rust-dark",
  Confirmed: "text-success",
  Rejected: "text-danger",
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
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur"
  }).format(date);
}

const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);
const bookedServices = (appointment) => appointment.services?.length
  ? appointment.services.map((service) => service.name).join(", ")
  : appointment.serviceType || "Service unavailable";

export default function AppointmentsSection({
  active,
  connectionStatus,
  errorMessage,
  customers,
  vehicles,
  appointments,
  services,
  busy,
  onOpenSettings,
  onRetry,
  onSave,
  onAddCustomer,
  onAddVehicle,
  onAddService
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
  const activeServices = useMemo(() => services.filter((service) => service.isActive), [services]);
  const estimate = useMemo(() => appointmentEstimate(selectedAppointment, form.serviceIds, services), [selectedAppointment, form.serviceIds, services]);
  const { totalMinutes, totalPrice } = estimate;
  const displayedServices = useMemo(() => {
    const catalogueIds = new Set(services.map((service) => Number(service.id)));
    const historical = (selectedAppointment?.services ?? [])
      .filter((service) => form.serviceIds.includes(Number(service.serviceId)) && !catalogueIds.has(Number(service.serviceId)))
      .map((service) => ({ id: service.serviceId, name: service.name, currentPrice: service.price, estimatedDurationMinutes: service.durationMinutes, isActive: false }));
    return [...services.filter((service) => service.isActive || form.serviceIds.includes(Number(service.id))), ...historical];
  }, [form.serviceIds, selectedAppointment, services]);
  const appointmentStart = toWorkshopUtcIso(form.scheduledAtLocal);
  const estimatedEnd = appointmentStart && totalMinutes
    ? new Date(Date.parse(appointmentStart) + totalMinutes * 60000)
    : null;

  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return appointments.filter((appointment) => {
      if (customerFilter && Number(appointment.customerId) !== Number(customerFilter)) return false;
      if (statusFilter && appointment.status !== statusFilter) return false;
      if (!query) return true;
      return `${appointment.customerName ?? ""} ${appointment.registrationNumber ?? ""} ${appointment.vehicleName ?? ""} ${bookedServices(appointment)} ${appointment.notes ?? ""}`
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
    if (!selectedAppointment) return ["Requested"];
    if (selectedAppointment.status === "Requested") {
      return ["Requested", "Confirmed", "Rejected", "Cancelled"];
    }
    if (selectedAppointment.status === "Confirmed" || selectedAppointment.status === "Scheduled") {
      return [selectedAppointment.status, "InProgress", "Cancelled"];
    }
    if (selectedAppointment.status === "InProgress") {
      return ["InProgress", "Completed", "Cancelled"];
    }
    return [selectedAppointment.status];
  }, [selectedAppointment]);

  const legacyWithoutServices = selectedAppointment && !selectedAppointment.services?.length;
  const terminalAppointment = ["Completed", "Cancelled", "Rejected"].includes(selectedAppointment?.status) || Boolean(legacyWithoutServices);

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
      ...(field === "serviceIds" ? { serviceIds: undefined } : {}),
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
      scheduledAtLocal: toWorkshopDateTimeInput(appointment.scheduledAtUtc),
      serviceIds: appointment.services?.map((service) => Number(service.serviceId)) ?? [],
      notes: String(appointment.notes ?? ""),
      status: APPOINTMENT_STATUSES.includes(appointment.status) ? appointment.status : "Requested"
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
    const validation = validateAppointment({ ...submittedForm, totalMinutes }, { includeStatus: editing });
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

  const noBookingFoundation = connectionStatus === "ready" && (customers.length === 0 || vehicles.length === 0 || (activeServices.length === 0 && selectedId === null));

  return (
    <section hidden={!active} aria-labelledby="appointments-title">
      <div className="workspace-grid">
        <div className="min-w-0 px-[clamp(1rem,5vw,5rem)] py-[clamp(2.25rem,5vw,5rem)]">
          <div className="mb-8 flex items-end justify-between gap-6 max-mid:flex-col max-mid:items-start">
            <div>
              <h1 id="appointments-title" className="page-title">Appointments</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Book workshop visits with service estimates. New requests wait for staff review.</p>
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
            services={services}
            visibleAppointments={visibleAppointments}
            hasFilters={Boolean(search || customerFilter || statusFilter)}
            selectedId={selectedId}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onRetry={onRetry}
            onAdd={() => resetEditor({ focus: true })}
            onAddCustomer={onAddCustomer}
            onAddVehicle={onAddVehicle}
            onAddService={onAddService}
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
            ) : vehicles.length === 0 ? (
              <StatePanel title="Register a vehicle first" body="Add a vehicle to a customer before booking their workshop visit.">
                <button className="button button-primary" type="button" onClick={onAddVehicle}>Go to vehicles</button>
              </StatePanel>
            ) : (
              <StatePanel title="Add a service first" body="Bookings need at least one active service with a price and estimated duration.">
                <button className="button button-primary" type="button" onClick={onAddService}>Go to services</button>
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
                      ? legacyWithoutServices
                        ? "This earlier booking has no catalogue service snapshot, so its original details are shown as read-only history."
                        : `This ${statusLabels[selectedAppointment.status].toLocaleLowerCase()} appointment is kept as read-only workshop history.`
                      : "Update the booking or choose a new review status."}
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
                  <TextField ref={dateRef} id="scheduledAtLocal" label="Date and time (MYT)" value={form.scheduledAtLocal} type="datetime-local" error={errors.scheduledAtLocal || errors.scheduledAtUtc} help="Workshop hours 8:30 AM–5:30 PM. Starts every 30 minutes." onChange={updateField} />
                  <fieldset className="mb-5 min-w-0 border-0 p-0" aria-describedby={errors.serviceIds ? "serviceIds-error" : undefined}>
                    <legend className="mb-2 font-bold">Services required</legend>
                    <div ref={serviceRef} tabIndex={-1} className="grid gap-2">
                      {displayedServices.map((service) => {
                        const displayed = estimate.unchanged ? estimate.items.find((item) => item.id === Number(service.id)) : null;
                        return <label key={service.id} className="service-choice">
                        <input type="checkbox" className="size-5 shrink-0 accent-rust" checked={form.serviceIds.includes(Number(service.id))} disabled={!service.isActive && !form.serviceIds.includes(Number(service.id))} onChange={(event) => updateField("serviceIds", event.target.checked ? [...form.serviceIds, Number(service.id)] : form.serviceIds.filter((id) => id !== Number(service.id)))} />
                        <span className="min-w-0"><strong className="block">{displayed?.name ?? service.name}{!service.isActive ? " (inactive)" : ""}</strong><span className="text-sm text-ink-soft">{displayed?.durationMinutes ?? service.estimatedDurationMinutes} min · {money(displayed?.price ?? service.currentPrice)}</span></span>
                      </label>})}
                    </div>
                    {errors.serviceIds && <p id="serviceIds-error" className="mt-2 text-sm font-semibold text-danger" role="alert">{errors.serviceIds}</p>}
                  </fieldset>
                  <div className="mb-5 border-y border-paper-line py-3 text-sm" aria-live="polite"><span className="font-bold">{estimate.unchanged ? "Booked estimate" : "Current estimate"}</span><span className="ml-2">{totalMinutes} min · {money(totalPrice)}</span>{estimatedEnd && <span className="mt-1 block text-ink-soft">Expected finish: {formatAppointmentTime(estimatedEnd.toISOString())} MYT</span>}</div>
                  <TextAreaField id="notes" label="Notes (optional)" value={form.notes} maxLength={500} error={errors.notes} help="Up to 500 characters" onChange={updateField} />
                  {selectedId !== null && (
                    <SelectField id="status" label="Status" value={form.status} error={errors.status} help={form.status === "Requested" ? "Staff can confirm or reject this request." : "Changes are checked by the API."} onChange={updateField}>
                      {availableStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
                    </SelectField>
                  )}
                  <FormError message={errors.form} />
                  {!terminalAppointment && (
                    <div className="form-actions">
                      <button className="button button-primary" type="submit">{busy ? "Saving..." : selectedId === null ? "Request booking" : "Save changes"}</button>
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
  const { connectionStatus, errorMessage, customers, vehicles, services, appointments, visibleAppointments, hasFilters, selectedId, busy, onOpenSettings, onRetry, onAdd, onAddCustomer, onAddVehicle, onAddService, onClearFilters, onEdit } = props;
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
  if (services.every((service) => !service.isActive) && appointments.length === 0) {
    return <StatePanel title="An appointment needs a service" body="Add and activate a workshop service before the first booking."><button className="button button-primary" type="button" onClick={onAddService}>Add first service</button></StatePanel>;
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
                <TableCell className="max-w-70">{bookedServices(appointment)}<span className="mt-0.5 block text-sm text-ink-soft">{appointment.services?.length ? `${appointment.services.reduce((sum, service) => sum + Number(service.durationMinutes || 0), 0)} min · ${money(appointment.services.reduce((sum, service) => sum + Number(service.price || 0), 0))}` : "Legacy booking"}</span></TableCell>
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
            <MobileDatum label="Service">{bookedServices(appointment)}</MobileDatum>
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
      <button className="row-action" type="button" disabled={busy} onClick={() => onEdit(appointment)} aria-label={`Edit ${bookedServices(appointment)} appointment for ${appointment.customerName}`}>Edit</button>
    </div>
  );
}
