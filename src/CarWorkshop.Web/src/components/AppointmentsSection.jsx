import { useEffect, useMemo, useRef, useState } from "react";
import AppointmentWorkflow from "./AppointmentWorkflow.jsx";
import MechanicAssignment from "./MechanicAssignment.jsx";
import { AppointmentServiceRecord } from "./ServiceRecord.jsx";
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
  PaginationBar,
  ResultsBar,
  SelectField,
  StatePanel,
  TableCell,
  TableHead,
  TextAreaField,
  TextField
} from "./Shared.jsx";

const PAGE_SIZE = 10;
const DAILY_CAPACITY = 10;
const dayKey = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(date));

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
  Requested: "pill-rust",
  Confirmed: "pill-success",
  Rejected: "pill-danger",
  Scheduled: "pill-rust",
  InProgress: "pill-teal",
  Completed: "pill-success",
  Cancelled: "pill-muted"
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
  mechanics,
  preset,
  onAssignMechanic,
  onTransitionStatus,
  onRecordService,
  onOpenReceipt,
  onAddMechanic,
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
  const [mechanicFilter, setMechanicFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => makeBlankAppointment());
  const [errors, setErrors] = useState({});
  const lastPresetTokenRef = useRef(null);
  const editorPanelRef = useRef(null);
  const editorTitleRef = useRef(null);
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
      if (mechanicFilter === "unassigned") {
        if (appointment.mechanicId || !["Confirmed", "Scheduled"].includes(appointment.status)) return false;
      } else if (mechanicFilter && Number(appointment.mechanicId) !== Number(mechanicFilter)) {
        return false;
      }
      if (!query) return true;
      return `${appointment.customerName ?? ""} ${appointment.registrationNumber ?? ""} ${appointment.vehicleName ?? ""} ${bookedServices(appointment)} ${appointment.notes ?? ""} ${appointment.mechanicName ?? ""}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [appointments, customerFilter, mechanicFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleAppointments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedAppointments = useMemo(
    () => visibleAppointments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, visibleAppointments]
  );

  const todayActiveCount = useMemo(() => {
    const today = dayKey(new Date());
    return appointments.filter(
      (appointment) =>
        dayKey(appointment.scheduledAtUtc) === today &&
        !["Cancelled", "Rejected"].includes(appointment.status)
    ).length;
  }, [appointments]);

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

  const legacyWithoutServices = selectedAppointment && !selectedAppointment.services?.length;
  const terminalAppointment = ["Completed", "Cancelled", "Rejected"].includes(selectedAppointment?.status) || Boolean(legacyWithoutServices);
  const readOnlyReason = !terminalAppointment
    ? ""
    : legacyWithoutServices
      ? "This earlier booking has no catalogue service snapshot, so its details are locked as read-only history."
      : `${statusLabels[selectedAppointment.status]} appointments are locked as read-only workshop history and cannot be edited.`;
  const bookingDirty = selectedAppointment && (
    Number(form.customerId) !== Number(selectedAppointment.customerId) ||
    Number(form.vehicleId) !== Number(selectedAppointment.vehicleId) ||
    form.scheduledAtLocal !== toWorkshopDateTimeInput(selectedAppointment.scheduledAtUtc) ||
    form.notes !== (selectedAppointment.notes ?? "") ||
    form.serviceIds.length !== (selectedAppointment.services?.length ?? 0) ||
    form.serviceIds.some((id) => !selectedAppointment.services?.some((service) => Number(service.serviceId) === id))
  );

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

  useEffect(() => {
    setPage(1);
  }, [search, customerFilter, statusFilter, mechanicFilter]);

  useEffect(() => {
    if (!preset?.token || preset.token === lastPresetTokenRef.current) return;
    lastPresetTokenRef.current = preset.token;
    setSearch("");
    setCustomerFilter("");
    setPage(1);
    if (preset.appointmentId != null) {
      setStatusFilter("");
      setMechanicFilter("");
      const target = appointments.find((item) => Number(item.id) === Number(preset.appointmentId));
      if (target) {
        setSelectedId(Number(target.id));
        setForm({
          customerId: String(target.customerId ?? ""),
          vehicleId: String(target.vehicleId ?? ""),
          scheduledAtLocal: toWorkshopDateTimeInput(target.scheduledAtUtc),
          serviceIds: target.services?.map((service) => Number(service.serviceId)) ?? [],
          notes: String(target.notes ?? ""),
          status: APPOINTMENT_STATUSES.includes(target.status) ? target.status : "Requested"
        });
        setErrors({});
        window.requestAnimationFrame(() => {
          editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          editorTitleRef.current?.focus({ preventScroll: true });
        });
      }
      return;
    }
    setStatusFilter(preset.status ?? "");
    setMechanicFilter(preset.mechanic ?? "");
  }, [appointments, preset]);

  async function handleTransitionStatus(id, nextStatus, reason) {
    const updated = await onTransitionStatus(id, nextStatus, reason);
    if (statusFilter && updated?.status && updated.status !== statusFilter) {
      const remaining = appointments.filter(
        (item) => Number(item.id) !== Number(id) && item.status === statusFilter
      ).length;
      if (remaining === 0) setStatusFilter("");
    }
    return updated;
  }

  async function handleAssignMechanic(appointmentId, mechanicId) {
    await onAssignMechanic(appointmentId, mechanicId);
    if (mechanicFilter === "unassigned") {
      const remaining = appointments.filter(
        (item) =>
          Number(item.id) !== Number(appointmentId) &&
          ["Confirmed", "Scheduled"].includes(item.status) &&
          !item.mechanicId
      ).length;
      if (remaining === 0) setMechanicFilter("");
    }
  }

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
    editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.requestAnimationFrame(() => {
      if (appointment.status === "Completed" || ["Cancelled", "Rejected"].includes(appointment.status) || !appointment.services?.length) {
        editorTitleRef.current?.focus({ preventScroll: true });
      } else {
        customerRef.current?.focus({ preventScroll: true });
      }
    });
  }

  async function submitAppointment(event) {
    event.preventDefault();
    if (busy || connectionStatus !== "ready" || customers.length === 0 || vehicles.length === 0) return;
    const editing = selectedId !== null;
    const dateControl = event.currentTarget.elements.namedItem("scheduledAtLocal");
    const submittedForm = {
      ...form,
      status: selectedAppointment?.status ?? form.status,
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
        <div className="records-panel">
          <div className="records-heading">
            <div>
              <h1 id="appointments-title" className="page-title" tabIndex={-1}>Appointments</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Book workshop visits with service estimates. New requests wait for staff review.</p>
            </div>
            <button className="button button-secondary shrink-0 max-[500px]:w-full" type="button" disabled={busy || connectionStatus !== "ready"} onClick={() => void onRetry()}>
              {connectionStatus === "loading" ? "Reloading..." : "Reload records"}
            </button>
          </div>

          {connectionStatus === "ready" && (
            <div className="capacity-strip" aria-label="Today's workshop slot capacity">
              <div>
                <strong className="text-ink">Today&apos;s capacity</strong>
                <span className="ml-2 text-ink-soft tabular-nums">
                  {todayActiveCount} / {DAILY_CAPACITY} slots booked ({Math.max(0, DAILY_CAPACITY - todayActiveCount)} remaining)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="capacity-track" aria-hidden="true">
                  <div
                    className={`capacity-fill ${todayActiveCount >= DAILY_CAPACITY ? "is-full" : todayActiveCount >= 8 ? "is-busy" : ""}`}
                    style={{ width: `${Math.min(100, (todayActiveCount / DAILY_CAPACITY) * 100)}%` }}
                  />
                </div>
                <span className={`font-bold tabular-nums ${todayActiveCount >= DAILY_CAPACITY ? "text-danger" : todayActiveCount >= 8 ? "text-rust-dark" : "text-ink-soft"}`}>
                  {Math.min(100, Math.round((todayActiveCount / DAILY_CAPACITY) * 100))}%
                </span>
              </div>
            </div>
          )}

          <div className="appointment-filters">
            <div className="appointment-search">
              <label className="mb-2 block font-bold" htmlFor="appointment-search">Search appointments</label>
              <input id="appointment-search" className="control-input" type="search" placeholder="Customer, vehicle, service, or mechanic" autoComplete="off" value={search} disabled={connectionStatus !== "ready"} onChange={(event) => setSearch(event.target.value)} />
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
            <div>
              <label className="mb-2 block font-bold" htmlFor="appointment-mechanic-filter">Assigned mechanic</label>
              <select id="appointment-mechanic-filter" className="control-input" value={mechanicFilter} disabled={connectionStatus !== "ready"} onChange={(event) => setMechanicFilter(event.target.value)}>
                <option value="">All mechanics</option>
                <option value="unassigned">Unassigned (ready to assign)</option>
                {mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.fullName}{mechanic.isActive ? "" : " (inactive)"}</option>)}
              </select>
            </div>
          </div>

          {connectionStatus === "ready" && appointments.length > 0 && (
            <ResultsBar
              visibleCount={visibleAppointments.length}
              totalCount={appointments.length}
              noun="appointment"
              hasFilters={Boolean(search || customerFilter || statusFilter || mechanicFilter)}
              onClearFilters={() => { setSearch(""); setCustomerFilter(""); setStatusFilter(""); setMechanicFilter(""); }}
            />
          )}

          <AppointmentRecords
            connectionStatus={connectionStatus}
            errorMessage={errorMessage}
            customers={customers}
            vehicles={vehicles}
            appointments={appointments}
            services={services}
            visibleAppointments={paginatedAppointments}
            totalVisibleCount={visibleAppointments.length}
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            hasFilters={Boolean(search || customerFilter || statusFilter || mechanicFilter)}
            selectedId={selectedId}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onRetry={onRetry}
            onAdd={() => resetEditor({ focus: true })}
            onAddCustomer={onAddCustomer}
            onAddVehicle={onAddVehicle}
            onAddService={onAddService}
            onClearFilters={() => { setSearch(""); setCustomerFilter(""); setStatusFilter(""); setMechanicFilter(""); }}
            onEdit={beginEdit}
            onOpenReceipt={onOpenReceipt}
          />
        </div>

        <aside ref={editorPanelRef} className="editor-panel" aria-labelledby="appointment-editor-title">
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
                <h2 ref={editorTitleRef} id="appointment-editor-title" tabIndex={-1} className="editor-title">
                  {selectedId === null ? "Book an appointment" : terminalAppointment ? "Appointment details" : "Edit appointment"}
                </h2>
                <p className="mt-2 max-w-[65ch] text-ink-soft">
                  {selectedId === null
                    ? "Choose the customer first to see only their vehicles."
                    : terminalAppointment
                      ? "Viewing saved workshop record."
                      : "Update the booking or choose a new review status."}
                </p>
              </div>
              {selectedAppointment && (
                <AppointmentWorkflow
                  key={`workflow-${selectedAppointment.id}`}
                  appointment={selectedAppointment}
                  busy={busy}
                  ready={connectionStatus === "ready"}
                  dirty={Boolean(bookingDirty)}
                  legacyWithoutServices={Boolean(legacyWithoutServices)}
                  onTransition={handleTransitionStatus}
                  onOpenReceipt={onOpenReceipt}
                />
              )}
              {terminalAppointment && (
                <div className="readonly-banner" role="note">
                  <strong className="block font-semibold">Read-only record</strong>
                  <span className="mt-0.5 block text-ink-soft">{readOnlyReason}</span>
                  {selectedAppointment?.statusReason && (
                    <span className="mt-1.5 block text-ink">
                      <strong>Reason:</strong> {selectedAppointment.statusReason}
                    </span>
                  )}
                </div>
              )}
              {selectedAppointment?.status === "Completed" && (
                <AppointmentServiceRecord key={selectedAppointment.id} appointment={selectedAppointment} services={services}
                  disabled={connectionStatus !== "ready" || busy} onSave={onRecordService} />
              )}
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
                    {terminalAppointment && (
                      <p className="mb-2 text-xs text-ink-soft">Locked: services cannot be changed on a read-only appointment.</p>
                    )}
                    {!terminalAppointment && displayedServices.some((service) => !service.isActive) && (
                      <p className="mb-2 text-xs text-ink-soft">Inactive services stay checked for this booking but cannot be re-added if removed.</p>
                    )}
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
              {selectedAppointment && <MechanicAssignment key={`${selectedAppointment.id}-${selectedAppointment.mechanicId ?? "unassigned"}`} appointment={selectedAppointment} mechanics={mechanics} busy={busy} ready={connectionStatus === "ready"} dirty={bookingDirty} onAssign={handleAssignMechanic} onAddMechanic={onAddMechanic} />}
              {connectionStatus !== "ready" && <p className="mt-6 border-t border-paper-line pt-4 text-ink-soft">The editor unlocks after the API connects successfully.</p>}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function AppointmentRecords(props) {
  const { connectionStatus, errorMessage, customers, vehicles, services, appointments, visibleAppointments, totalVisibleCount, page, totalPages, onPageChange, hasFilters, selectedId, busy, onOpenSettings, onRetry, onAdd, onAddCustomer, onAddVehicle, onAddService, onClearFilters, onEdit, onOpenReceipt } = props;
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
  if (totalVisibleCount === 0) {
    return <StatePanel compact title="No matching appointments" body="Clear the search and filters to see all bookings.">{hasFilters && <button className="button button-quiet" type="button" onClick={onClearFilters}>Clear filters</button>}</StatePanel>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
        <table className="w-full border-collapse tabular-nums">
          <thead><tr><TableHead>When</TableHead><TableHead>Customer &amp; vehicle</TableHead><TableHead>Service &amp; mechanic</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></tr></thead>
          <tbody>
            {visibleAppointments.map((appointment) => (
              <tr key={appointment.id} className={Number(appointment.id) === selectedId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                <TableCell className="font-semibold whitespace-nowrap">{formatAppointmentTime(appointment.scheduledAtUtc)}</TableCell>
                <TableCell>
                  <strong className="block">{appointment.customerName}</strong>
                  <span className="mt-0.5 block text-xs text-ink-soft">{appointment.registrationNumber} · {appointment.vehicleName}</span>
                </TableCell>
                <TableCell className="max-w-68">
                  <span className="block">{bookedServices(appointment)}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {appointment.services?.length ? `${appointment.services.reduce((sum, service) => sum + Number(service.durationMinutes || 0), 0)} min · ${money(appointment.services.reduce((sum, service) => sum + Number(service.price || 0), 0))}` : "Legacy booking"} · {appointment.mechanicName || "Unassigned"}
                  </span>
                </TableCell>
                <TableCell><span className={`status-text ${statusClasses[appointment.status] ?? "pill-muted"}`}>{statusLabels[appointment.status] ?? appointment.status}</span></TableCell>
                <TableCell className="whitespace-nowrap"><AppointmentActions appointment={appointment} busy={busy} onEdit={onEdit} onOpenReceipt={onOpenReceipt} /></TableCell>
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
            <MobileDatum label="Mechanic">{appointment.mechanicName || "Unassigned"}</MobileDatum>
            <MobileDatum label="Status"><span className={`status-text ${statusClasses[appointment.status] ?? "pill-muted"}`}>{statusLabels[appointment.status] ?? appointment.status}</span></MobileDatum>
            <div className="mt-2 border-t border-paper-line pt-2"><AppointmentActions appointment={appointment} busy={busy} onEdit={onEdit} onOpenReceipt={onOpenReceipt} /></div>
          </article>
        ))}
      </div>
      <PaginationBar page={page} totalPages={totalPages} totalCount={totalVisibleCount} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
    </>
  );
}

function AppointmentActions({ appointment, busy, onEdit, onOpenReceipt }) {
  const readOnly = ["Completed", "Cancelled", "Rejected"].includes(appointment.status) || !appointment.services?.length;
  const actionVerb = readOnly ? "View" : "Edit";
  return (
    <div className="flex flex-wrap justify-end gap-2 max-desk:justify-start">
      <button className="row-action" type="button" disabled={busy} onClick={() => onEdit(appointment)} aria-label={`${actionVerb} ${bookedServices(appointment)} appointment for ${appointment.customerName}`}>{actionVerb}</button>
      {appointment.status === "Completed" && (
        <button className="row-action text-rust-dark" type="button" disabled={busy} onClick={() => onOpenReceipt?.(appointment)} aria-label={`Print receipt for ${appointment.customerName}`}>Receipt</button>
      )}
    </div>
  );
}
