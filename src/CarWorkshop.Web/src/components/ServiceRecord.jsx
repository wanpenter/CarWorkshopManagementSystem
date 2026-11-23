import { useRef, useState } from "react";
import { getProblemFieldErrors } from "../api.js";
import { FormError, TextAreaField, TextField } from "./Shared.jsx";

const mileageFormat = new Intl.NumberFormat("en-MY");
const dateFormat = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" });

export function ServiceRecordDetails({ record }) {
  return (
    <>
      <p className="text-sm text-ink-soft">
        {mileageFormat.format(record.mileage)} km · Recorded {dateFormat.format(new Date(record.recordedAtUtc))}
      </p>
      {record.nextServiceMileage != null && (
        <p className="mt-1 text-xs font-semibold text-rust-dark">
          Next service due: {mileageFormat.format(record.nextServiceMileage)} km
        </p>
      )}
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
  const [nextServiceMileage, setNextServiceMileage] = useState("");
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const mileageRef = useRef(null);
  const nextMileageRef = useRef(null);
  const headingRef = useRef(null);
  const choicesRef = useRef(null);
  const booked = appointment.services ?? [];
  const additional = services.filter((service) => service.isActive && !booked.some((item) => item.serviceId === service.id));
  const parsedCurrentMileage = mileage.trim() === "" ? NaN : Number(mileage);
  const hasValidCurrentMileage = Number.isInteger(parsedCurrentMileage) && parsedCurrentMileage >= 0 && parsedCurrentMileage <= 2147483647;

  function clearError(field) {
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function applyNextInterval(delta) {
    if (!hasValidCurrentMileage) return;
    const target = parsedCurrentMileage + delta;
    if (target <= 2147483647) {
      setNextServiceMileage(String(target));
      clearError("nextServiceMileage");
    }
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
    const nextText = nextServiceMileage.trim();
    let nextMileageValue = null;
    if (nextText !== "") {
      const parsedNext = Number(nextText);
      if (!Number.isInteger(parsedNext) || parsedNext <= 0 || parsedNext > 2147483647) {
        nextErrors.nextServiceMileage = "Enter a whole mileage greater than 0.";
      } else if (!nextErrors.mileage && parsedNext <= mileageValue) {
        nextErrors.nextServiceMileage = "Next service mileage must be greater than current mileage.";
      } else {
        nextMileageValue = parsedNext;
      }
    }
    if (selected.length === 0 && !notes.trim()) nextErrors.serviceIds = "Choose a service or describe other work in Notes.";
    setErrors(nextErrors);
    if (nextErrors.mileage) mileageRef.current?.focus();
    else if (nextErrors.nextServiceMileage) nextMileageRef.current?.focus();
    else if (nextErrors.serviceIds) choicesRef.current?.focus();
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      await onSave(appointment.id, {
        mileage: mileageValue,
        nextServiceMileage: nextMileageValue,
        serviceIds: selected,
        notes: notes.trim() || null
      });
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
            <TextField
              ref={mileageRef}
              id="service-mileage"
              label="Mileage (km)"
              value={mileage}
              type="number"
              inputMode="numeric"
              min="0"
              help="Current odometer reading at the time of service. Higher readings automatically update the vehicle profile."
              error={errors.mileage}
              onChange={(_, value) => { setMileage(value); clearError("mileage"); }}
            />
            <div className="mb-5">
              <TextField
                ref={nextMileageRef}
                id="next-service-mileage"
                label="Next service due (km, optional)"
                value={nextServiceMileage}
                type="number"
                inputMode="numeric"
                min="1"
                help="Printed on the service receipt as a reminder for the customer."
                error={errors.nextServiceMileage}
                onChange={(_, value) => { setNextServiceMileage(value); clearError("nextServiceMileage"); }}
              />
              <div className="-mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="row-action min-h-8 border border-paper-line bg-paper px-2.5 py-1 text-xs"
                  disabled={!hasValidCurrentMileage}
                  title={!hasValidCurrentMileage ? "Enter current mileage first" : "Set to current mileage + 5,000 km"}
                  onClick={() => applyNextInterval(5000)}
                >
                  +5,000 km
                </button>
                <button
                  type="button"
                  className="row-action min-h-8 border border-paper-line bg-paper px-2.5 py-1 text-xs"
                  disabled={!hasValidCurrentMileage}
                  title={!hasValidCurrentMileage ? "Enter current mileage first" : "Set to current mileage + 10,000 km"}
                  onClick={() => applyNextInterval(10000)}
                >
                  +10,000 km
                </button>
                {!hasValidCurrentMileage && (
                  <span className="text-xs text-ink-soft">Enter current mileage to use quick intervals.</span>
                )}
              </div>
            </div>
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
                setNextServiceMileage("");
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

export function VehicleServiceHistory({ appointments, vehicleId, onOpenReceipt }) {
  const history = appointments.filter((appointment) => Number(appointment.vehicleId) === vehicleId && appointment.serviceRecord)
    .sort((first, second) => Date.parse(second.scheduledAtUtc) - Date.parse(first.scheduledAtUtc) || second.id - first.id);

  return (
    <section className="mb-6 border-y border-paper-line py-4" aria-labelledby="vehicle-service-history-title">
      <h3 id="vehicle-service-history-title" className="mb-2 font-bold">Service history</h3>
      {history.length === 0 ? <p className="text-sm text-ink-soft">No service records for this vehicle yet.</p> : (
        <ul className="divide-y divide-paper-line">
          {history.map((appointment) => (
            <li key={appointment.id} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold">Appointment {dateFormat.format(new Date(appointment.scheduledAtUtc))}</h4>
                {onOpenReceipt && appointment.status === "Completed" && (
                  <button
                    type="button"
                    className="count-link min-h-8 px-1.5 py-0.5 text-xs"
                    onClick={() => onOpenReceipt(appointment)}
                  >
                    Print receipt
                  </button>
                )}
              </div>
              <ServiceRecordDetails record={appointment.serviceRecord} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
