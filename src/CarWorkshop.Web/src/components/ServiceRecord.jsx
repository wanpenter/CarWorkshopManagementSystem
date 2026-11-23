import { useRef, useState } from "react";
import { getProblemFieldErrors } from "../api.js";
import { FormError, TextAreaField, TextField } from "./Shared.jsx";

const mileageFormat = new Intl.NumberFormat("en-MY");
const dateFormat = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" });

export function ServiceRecordDetails({ record }) {
  return (
    <>
      <p className="text-sm text-ink-soft">{mileageFormat.format(record.mileage)} km · Recorded {dateFormat.format(new Date(record.recordedAtUtc))}</p>
      <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{record.workPerformed}</p>
    </>
  );
}

function ServiceCheckbox({ id, name, selected, onToggle }) {
  return (
    <label className="service-choice">
      <input type="checkbox" name="performedService" className="size-5 shrink-0 accent-rust"
        checked={selected.includes(id)} onChange={() => onToggle(id)} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
    </label>
  );
}

export function AppointmentServiceRecord({ appointment, services, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mileage, setMileage] = useState("");
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const mileageRef = useRef(null);
  const headingRef = useRef(null);
  const choicesRef = useRef(null);
  const booked = appointment.services ?? [];
  const additional = services.filter((service) => service.isActive && !booked.some((item) => item.serviceId === service.id));

  function clearError(field) {
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function toggleService(id) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    clearError("serviceIds");
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    const mileageValue = Number(mileage);
    if (!mileage || !Number.isInteger(mileageValue) || mileageValue < 0 || mileageValue > 2147483647) {
      nextErrors.mileage = "Enter a whole mileage from 0 to 2,147,483,647.";
    }
    if (selected.length === 0 && !notes.trim()) nextErrors.serviceIds = "Choose a service or describe other work in Notes.";
    setErrors(nextErrors);
    if (nextErrors.mileage) mileageRef.current?.focus();
    else if (nextErrors.serviceIds) choicesRef.current?.focus();
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      await onSave(appointment.id, { mileage: mileageValue, serviceIds: selected, notes: notes.trim() || null });
      headingRef.current?.focus();
    } catch (error) {
      setErrors({ ...getProblemFieldErrors(error), form: error.message || "The service record could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 border-y border-paper-line py-4" aria-labelledby="appointment-service-title">
      <h3 ref={headingRef} id="appointment-service-title" tabIndex={-1} className="mb-2 font-bold">Service record</h3>
      {appointment.serviceRecord ? (
        <ServiceRecordDetails record={appointment.serviceRecord} />
      ) : editing ? (
        <form noValidate onSubmit={submit}>
          <fieldset disabled={disabled || saving} className="m-0 min-w-0 border-0 p-0">
            <TextField ref={mileageRef} id="service-mileage" label="Mileage (km)" value={mileage} type="number" inputMode="numeric" min="0" error={errors.mileage} onChange={(_, value) => { setMileage(value); clearError("mileage"); }} />
            <fieldset ref={choicesRef} tabIndex={-1} className="mb-5 min-w-0 border-0 p-0"
              aria-describedby={errors.serviceIds ? "performed-service-help performed-service-error" : "performed-service-help"}>
              <legend className="mb-2 font-bold">Work performed</legend>
              <p id="performed-service-help" className="mb-3 text-sm text-ink-soft">Tick the services the workshop completed.</p>
              {booked.length > 0 ? (
                <div className="grid gap-2">
                  {booked.map((service) => <ServiceCheckbox key={service.serviceId} id={service.serviceId} name={service.name} selected={selected} onToggle={toggleService} />)}
                </div>
              ) : <p className="mb-3 text-sm text-ink-soft">This booking has no catalogue services listed.</p>}
              {additional.length > 0 && (
                <details className={booked.length ? "mt-2" : undefined}>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-rust-dark">Choose additional services</summary>
                  <div className="mt-1 grid gap-2">
                    {additional.map((service) => <ServiceCheckbox key={service.id} id={service.id} name={service.name} selected={selected} onToggle={toggleService} />)}
                  </div>
                </details>
              )}
              {errors.serviceIds && <p id="performed-service-error" className="mt-2 text-sm font-semibold text-danger" role="alert">{errors.serviceIds}</p>}
            </fieldset>
            <TextAreaField id="service-record-notes" label="Notes (optional)" value={notes} maxLength={500} error={errors.notes}
              help="Use this for details or work outside the catalogue." onChange={(_, value) => { setNotes(value); clearError("notes"); clearError("serviceIds"); }} />
            <FormError message={errors.form} />
            <div className="form-actions">
              <button className="button button-primary" type="submit">{saving ? "Saving..." : "Save service record"}</button>
              <button className="button button-quiet" type="button" onClick={() => {
                setEditing(false);
                setMileage("");
                setSelected([]);
                setNotes("");
                setErrors({});
                headingRef.current?.focus();
              }}>Cancel</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">Job completed. Actual work has yet to be recorded.</p>
          <button className="button button-primary" type="button" disabled={disabled} onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => mileageRef.current?.focus());
          }}>Record service</button>
        </>
      )}
    </section>
  );
}

export function VehicleServiceHistory({ appointments, vehicleId }) {
  const history = appointments.filter((appointment) => Number(appointment.vehicleId) === vehicleId && appointment.serviceRecord)
    .sort((first, second) => Date.parse(second.scheduledAtUtc) - Date.parse(first.scheduledAtUtc) || second.id - first.id);

  return (
    <section className="mb-6 border-y border-paper-line py-4" aria-labelledby="vehicle-service-history-title">
      <h3 id="vehicle-service-history-title" className="mb-2 font-bold">Service history</h3>
      {history.length === 0 ? <p className="text-sm text-ink-soft">No service records for this vehicle yet.</p> : (
        <ul className="divide-y divide-paper-line">
          {history.map((appointment) => (
            <li key={appointment.id} className="py-3 first:pt-0 last:pb-0">
              <h4 className="mb-1 text-sm font-bold">Appointment {dateFormat.format(new Date(appointment.scheduledAtUtc))}</h4>
              <ServiceRecordDetails record={appointment.serviceRecord} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
