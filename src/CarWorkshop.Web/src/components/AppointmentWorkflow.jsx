import { useEffect, useRef, useState } from "react";
import { FormError } from "./Shared.jsx";

const WORKFLOW_STEPS = [
  { key: "Requested", label: "Needs review" },
  { key: "Confirmed", label: "Confirmed" },
  { key: "InProgress", label: "In progress" },
  { key: "Completed", label: "Completed" }
];

function stepIndexFor(status) {
  if (status === "Requested") return 0;
  if (status === "Confirmed" || status === "Scheduled") return 1;
  if (status === "InProgress") return 2;
  if (status === "Completed") return 3;
  return -1;
}

const TRANSITION_META = {
  Confirmed: {
    label: "Confirm booking",
    confirm: false
  },
  InProgress: {
    label: "Start work",
    confirm: false
  },
  Completed: {
    label: "Mark completed",
    confirm: true,
    title: "Mark this job as completed?",
    body: "Completed appointments become read-only history. You can immediately record actual mileage/work and print the official service receipt.",
    confirmButton: "Confirm completion",
    tone: "primary",
    askReason: false
  },
  Rejected: {
    label: "Reject",
    confirm: true,
    title: "Reject this booking request?",
    body: "This releases the slot and locks the request as rejected history.",
    confirmButton: "Reject booking",
    tone: "danger",
    askReason: true,
    reasonPlaceholder: "e.g. Workshop bay fully booked or parts unavailable"
  },
  Cancelled: {
    label: "Cancel",
    confirm: true,
    title: "Cancel this appointment?",
    body: "Cancelling frees the daily slot and mechanic schedule. This cannot be undone.",
    confirmButton: "Cancel appointment",
    tone: "danger",
    askReason: true,
    reasonPlaceholder: "e.g. Customer requested to reschedule or no-show"
  }
};

export default function AppointmentWorkflow({
  appointment,
  busy,
  ready,
  dirty,
  legacyWithoutServices,
  onTransition,
  onOpenReceipt
}) {
  const [pendingStatus, setPendingStatus] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const reasonRef = useRef(null);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmTarget && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => {
        if (TRANSITION_META[confirmTarget]?.askReason) reasonRef.current?.focus();
        else confirmButtonRef.current?.focus();
      });
    } else if (!confirmTarget && dialog.open) {
      dialog.close();
    }
  }, [confirmTarget]);

  const status = appointment.status;
  const activeIndex = stepIndexFor(status);
  const isCancelledOrRejected = status === "Cancelled" || status === "Rejected";
  const working = busy || pendingStatus !== null;
  const actionsDisabled = working || !ready || dirty || legacyWithoutServices;

  async function executeTransition(nextStatus, submittedReason = "") {
    if (working || !ready || dirty) return;
    setError("");
    setPendingStatus(nextStatus);
    try {
      await onTransition(appointment.id, nextStatus, submittedReason.trim() || null);
      setConfirmTarget(null);
      setReason("");
    } catch (failure) {
      setError(failure.message || "Status could not be updated. Try again.");
    } finally {
      setPendingStatus(null);
    }
  }

  function handleActionClick(nextStatus) {
    if (actionsDisabled) return;
    setError("");
    if (TRANSITION_META[nextStatus]?.confirm) {
      setReason("");
      setConfirmTarget(nextStatus);
      return;
    }
    void executeTransition(nextStatus);
  }

  function closeConfirmDialog() {
    if (working) return;
    setConfirmTarget(null);
    setReason("");
    setError("");
  }

  const confirmMeta = confirmTarget ? TRANSITION_META[confirmTarget] : null;

  return (
    <section className="workflow-card" aria-labelledby="workflow-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="workflow-title" className="text-xs font-bold tracking-[0.07em] text-ink-soft uppercase">
          Job progress
        </h3>
        {isCancelledOrRejected && (
          <span className={`workflow-terminal-pill ${status === "Rejected" ? "is-danger" : "is-muted"}`}>
            {status}
          </span>
        )}
      </div>

      {!isCancelledOrRejected && (
        <ol className="workflow-stepper" aria-label="Appointment workflow progress">
          {WORKFLOW_STEPS.map((step, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "upcoming";
            return (
              <li
                key={step.key}
                className={`workflow-step is-${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="workflow-step-dot" aria-hidden="true">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className="workflow-step-label">{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {isCancelledOrRejected && appointment.statusReason && (
        <p className="mb-2 text-sm text-ink">
          <strong>Reason:</strong> {appointment.statusReason}
        </p>
      )}

      {!legacyWithoutServices && (
        <div className="mt-4">
          {status === "Requested" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button button-primary flex-1"
                disabled={actionsDisabled}
                onClick={() => handleActionClick("Confirmed")}
              >
                {pendingStatus === "Confirmed" ? "Confirming..." : "Confirm booking"}
              </button>
              <button
                type="button"
                className="button button-secondary text-danger"
                disabled={actionsDisabled}
                onClick={() => handleActionClick("Rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={actionsDisabled}
                onClick={() => handleActionClick("Cancelled")}
              >
                Cancel
              </button>
            </div>
          )}

          {(status === "Confirmed" || status === "Scheduled") && (
            <>
              {!appointment.mechanicId && (
                <p className="mb-3 rounded-sm border border-paper-line bg-paper px-3 py-2 text-xs text-ink-soft">
                  Tip: No mechanic assigned yet. You can assign one below before starting work.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button button-primary flex-1"
                  disabled={actionsDisabled}
                  onClick={() => handleActionClick("InProgress")}
                >
                  {pendingStatus === "InProgress" ? "Starting..." : "Start work"}
                </button>
                <button
                  type="button"
                  className="button button-secondary text-danger"
                  disabled={actionsDisabled}
                  onClick={() => handleActionClick("Cancelled")}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {status === "InProgress" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button button-primary flex-1"
                disabled={actionsDisabled}
                onClick={() => handleActionClick("Completed")}
              >
                {pendingStatus === "Completed" ? "Completing..." : "Mark completed"}
              </button>
              <button
                type="button"
                className="button button-secondary text-danger"
                disabled={actionsDisabled}
                onClick={() => handleActionClick("Cancelled")}
              >
                Cancel
              </button>
            </div>
          )}

          {status === "Completed" && (
            <button
              type="button"
              className="button button-secondary w-full"
              disabled={working}
              onClick={() => onOpenReceipt(appointment)}
            >
              Print receipt
            </button>
          )}
        </div>
      )}

      {dirty && !isCancelledOrRejected && status !== "Completed" && (
        <p className="field-lock-hint" role="status">
          Save or cancel your booking changes before updating status.
        </p>
      )}

      {error && !confirmTarget && <div className="mt-3"><FormError message={error} /></div>}

      <dialog
        ref={dialogRef}
        className="dialog no-print"
        aria-labelledby="workflow-confirm-title"
        onClose={closeConfirmDialog}
        onCancel={(event) => working && event.preventDefault()}
      >
        {confirmMeta && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void executeTransition(confirmTarget, reason);
            }}
          >
            <h2 id="workflow-confirm-title" className="font-display text-2xl font-bold">
              {confirmMeta.title}
            </h2>
            <p className="mt-2 text-ink-soft">{confirmMeta.body}</p>

            {confirmMeta.askReason && (
              <div className="mt-5">
                <label className="mb-2 block font-bold" htmlFor="workflow-status-reason">
                  Reason (optional)
                </label>
                <textarea
                  ref={reasonRef}
                  id="workflow-status-reason"
                  className="control-input min-h-24 resize-y"
                  maxLength={300}
                  value={reason}
                  disabled={working}
                  placeholder={confirmMeta.reasonPlaceholder}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  Saved on the appointment record and logged in the Audit log (up to 300 characters).
                </p>
              </div>
            )}

            {error && <div className="mt-4"><FormError message={error} /></div>}

            <div className="mt-6 flex flex-wrap justify-end gap-2 max-[500px]:[&>*]:w-full">
              <button
                ref={confirmButtonRef}
                type="submit"
                className={`button ${confirmMeta.tone === "danger" ? "button-danger" : "button-primary"}`}
                disabled={working}
              >
                {working ? "Updating..." : confirmMeta.confirmButton}
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={working}
                onClick={closeConfirmDialog}
              >
                Keep current status
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
