import { useRef, useState } from "react";
import { SelectField } from "./Shared.jsx";

export default function MechanicAssignment({ appointment, mechanics, busy, ready, dirty, onAssign, onAddMechanic }) {
  const [mechanicId, setMechanicId] = useState(String(appointment.mechanicId ?? ""));
  const [error, setError] = useState("");
  const selectRef = useRef(null);
  const eligible = ["Confirmed", "Scheduled"].includes(appointment.status) && Boolean(appointment.estimatedEndUtc);
  const activeMechanics = mechanics.filter((mechanic) => mechanic.isActive);
  const assigned = mechanics.find((mechanic) => Number(mechanic.id) === Number(appointment.mechanicId));

  async function submit(event) {
    event.preventDefault();
    if (busy || !ready || !eligible || dirty) return;
    if (!mechanicId) {
      setError("Choose an active mechanic.");
      selectRef.current?.focus();
      return;
    }
    setError("");
    try {
      await onAssign(appointment.id, Number(mechanicId));
    } catch (failure) {
      setError(failure.message);
    }
  }

  return <section className="mt-8 border-t border-paper-line pt-6" aria-labelledby="assignment-title">
    <h2 id="assignment-title" className="editor-title">Mechanic assignment</h2>
    <p className="mt-2 mb-4 text-ink-soft">Assigned: <strong className="text-ink">{appointment.mechanicName || "Unassigned"}{assigned?.isActive === false ? " (inactive)" : ""}</strong></p>
    {!eligible ? <p className="text-ink-soft">{appointment.status === "Requested" ? "Confirm and save this booking before assigning a mechanic." : "Assignments can be changed on confirmed or scheduled bookings with an estimated finish time."}</p>
      : activeMechanics.length === 0 ? <><p className="mb-3 text-ink-soft">Add or activate a mechanic to assign this booking.</p><button type="button" className="button button-secondary" disabled={busy} onClick={onAddMechanic}>Go to mechanics</button></>
        : <form onSubmit={submit} noValidate>
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy || !ready || dirty}>
            <SelectField ref={selectRef} id="assignedMechanicId" label="Mechanic" value={mechanicId} error={error} help="The API checks for overlapping jobs before saving." onChange={(_, value) => { setMechanicId(value); setError(""); }}>
              <option value="">Choose a mechanic</option>
              {assigned?.isActive === false && <option value={assigned.id} disabled>{assigned.fullName} (inactive)</option>}
              {activeMechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.fullName}</option>)}
            </SelectField>
            <button className="button button-primary w-full" type="submit" disabled={!activeMechanics.some((mechanic) => Number(mechanic.id) === Number(mechanicId)) || Number(mechanicId) === Number(appointment.mechanicId)}>{busy ? "Saving..." : appointment.mechanicId ? "Replace mechanic" : "Assign mechanic"}</button>
          </fieldset>
          {dirty && <p className="mt-3 text-ink-soft" role="status">Save or cancel your booking changes before assigning a mechanic.</p>}
        </form>}
  </section>;
}
