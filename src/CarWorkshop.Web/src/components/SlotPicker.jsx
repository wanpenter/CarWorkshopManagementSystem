import { useEffect, useMemo, useState } from "react";

const REASON_LABELS = {
  past: "Past",
  exceeds_hours: "Past 5:30 PM",
  day_full: "Day full",
  no_mechanics: "No staff",
  vehicle_conflict: "Vehicle busy",
  slot_full: "Full"
};

function todayMalaysiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDaysToIsoDate(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00+08:00`);
  if (Number.isNaN(base.getTime())) return todayMalaysiaDate();
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(base);
}

function formatClock12(hhmm) {
  const [hStr, mStr] = String(hhmm ?? "08:30").split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function SlotPicker({
  api,
  mode = "portal",
  value = "",
  onChange,
  durationMinutes = 30,
  vehicleId = "",
  excludeAppointmentId = null,
  disabled = false,
  error = "",
  idPrefix = "slot-picker",
  refreshKey = 0
}) {
  const today = useMemo(() => todayMalaysiaDate(), []);
  const tomorrow = useMemo(() => addDaysToIsoDate(today, 1), [today]);

  const parsedDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : today;
  const selectedTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : "";

  const [date, setDate] = useState(parsedDate);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const incoming = value.slice(0, 10);
      setDate((current) => (current === incoming ? current : incoming));
    }
  }, [value]);

  const effectiveDuration = Math.max(1, Number(durationMinutes) || 30);
  const numericVehicleId = Number(vehicleId) > 0 ? Number(vehicleId) : undefined;
  const numericExcludeId = Number(excludeAppointmentId) > 0 ? Number(excludeAppointmentId) : undefined;

  useEffect(() => {
    if (!api || !date || disabled) return undefined;
    const fetchAvailability = mode === "workshop" ? api.getWorkshopAvailability : api.getPortalAvailability;
    if (typeof fetchAvailability !== "function") return undefined;

    const controller = new AbortController();
    setLoading(true);
    setLoadError("");

    fetchAvailability({
      date,
      durationMinutes: effectiveDuration,
      vehicleId: numericVehicleId,
      ...(mode === "workshop" && numericExcludeId ? { excludeAppointmentId: numericExcludeId } : {}),
      signal: controller.signal
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setAvailability(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAvailability(null);
        setLoadError(err?.message || "Could not load available time slots.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [api, mode, date, effectiveDuration, numericVehicleId, numericExcludeId, disabled, refreshKey, retryCount]);

  function handleDateChange(nextDate) {
    if (!nextDate) return;
    setDate(nextDate);
    if (selectedTime) {
      onChange?.(`${nextDate}T${selectedTime}`);
    }
  }

  function handleSelectSlot(slot) {
    if (disabled || !slot.available) return;
    onChange?.(`${date}T${slot.startLocal}`);
  }

  const slots = availability?.slots ?? [];
  const availableCount = slots.filter((slot) => slot.available).length;
  const selectedSlot = availability && parsedDate === date
    ? slots.find((slot) => slot.startLocal === selectedTime) ?? null
    : null;
  const selectedUnavailable = Boolean(selectedSlot && !selectedSlot.available);

  return (
    <div className="slot-picker">
      <div className="slot-picker-header">
        <div className="slot-picker-date-wrap">
          <label className="mb-1.5 block font-bold" htmlFor={`${idPrefix}-date`}>
            Appointment date (MYT)
          </label>
          <div className="slot-picker-date-controls">
            <input
              id={`${idPrefix}-date`}
              type="date"
              className="control-input"
              min={mode === "portal" ? today : undefined}
              value={date}
              disabled={disabled}
              onChange={(event) => handleDateChange(event.target.value)}
            />
            <button
              type="button"
              className={`button slot-day-shortcut ${date === today ? "button-primary" : "button-secondary"}`}
              disabled={disabled}
              onClick={() => handleDateChange(today)}
            >
              Today
            </button>
            <button
              type="button"
              className={`button slot-day-shortcut ${date === tomorrow ? "button-primary" : "button-secondary"}`}
              disabled={disabled}
              onClick={() => handleDateChange(tomorrow)}
            >
              Tomorrow
            </button>
          </div>
        </div>
      </div>

      <div className="slot-picker-meta" aria-live="polite">
        {loading ? (
          <span>Checking live workshop slots...</span>
        ) : availability ? (
          <>
            <span className="tabular-nums">
              <strong>{availableCount}</strong> open {availableCount === 1 ? "slot" : "slots"} · {availability.dailyBookedCount} / {availability.dailyCap} booked · {availability.activeMechanicCount} active {availability.activeMechanicCount === 1 ? "mechanic" : "mechanics"}
            </span>
            {Number(durationMinutes) === 0 && (
              <span className="text-ink-soft">Showing 30-min slots until services are chosen</span>
            )}
          </>
        ) : (
          <span>Workshop hours: 8:30 AM – 5:30 PM MYT</span>
        )}
      </div>

      {loadError ? (
        <div className="slot-picker-error" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Retry slots
          </button>
        </div>
      ) : (
        <div
          className="slot-grid"
          role="group"
          aria-label={`Available time slots for ${date}`}
          aria-busy={loading}
        >
          {slots.map((slot) => {
            const isSelected = parsedDate === date && selectedTime === slot.startLocal;
            const subtext = slot.available
              ? `${slot.remainingMechanics} ${slot.remainingMechanics === 1 ? "bay" : "bays"}`
              : REASON_LABELS[slot.unavailableReason] ?? "Unavailable";
            return (
              <button
                key={slot.startLocal}
                type="button"
                className={`slot-chip ${isSelected ? "is-selected" : ""} ${slot.available ? "is-open" : "is-closed"}`}
                disabled={disabled || !slot.available}
                aria-pressed={isSelected}
                onClick={() => handleSelectSlot(slot)}
              >
                <span className="slot-chip-time">{formatClock12(slot.startLocal)}</span>
                <span className="slot-chip-meta">{subtext}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedUnavailable && (
        <p className="mt-2 text-xs font-semibold text-rust-dark" role="status">
          {formatClock12(selectedTime)} is unavailable ({REASON_LABELS[selectedSlot.unavailableReason] ?? "Unavailable"}). Pick an open slot above.
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
