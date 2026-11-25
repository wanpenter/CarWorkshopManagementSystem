import { useEffect, useMemo, useState } from "react";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "../api.js";
import { FormError } from "./Shared.jsx";

const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);

const PAYMENT_PILLS = {
  Unpaid: "pill-rust",
  PartiallyPaid: "pill-teal",
  Paid: "pill-success",
  Voided: "pill-muted"
};

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur"
  }).format(date);
}

export function AppointmentPartsPanel({
  appointment,
  parts,
  disabled,
  onAddPart,
  onRemovePart
}) {
  const [selectedPartId, setSelectedPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const usedParts = appointment.partsUsed ?? [];
  const invoice = appointment.invoice ?? null;
  const partsLocked = Boolean(invoice && (Number(invoice.amountPaid) > 0 || invoice.paymentStatus === "Voided"));
  const canEdit = ["InProgress", "Completed"].includes(appointment.status) && !partsLocked;

  const availableParts = useMemo(
    () => (parts ?? []).filter((part) => part.isActive && Number(part.stockQuantity) > 0),
    [parts]
  );

  const chosenPart = useMemo(
    () => availableParts.find((part) => Number(part.id) === Number(selectedPartId)) ?? null,
    [availableParts, selectedPartId]
  );

  const partsSubtotal = usedParts.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);

  async function handleAdd(event) {
    event.preventDefault();
    if (disabled || working || !canEdit) return;
    const partId = Number(selectedPartId);
    const qty = Number(quantity);
    if (!Number.isInteger(partId) || partId <= 0) {
      setError("Choose a spare part to add.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      setError("Enter a valid quantity.");
      return;
    }
    if (chosenPart && qty > chosenPart.stockQuantity) {
      setError(`Only ${chosenPart.stockQuantity} unit(s) available in stock.`);
      return;
    }

    setError("");
    setWorking(true);
    try {
      await onAddPart(appointment.id, { partId, quantity: qty });
      setSelectedPartId("");
      setQuantity("1");
    } catch (err) {
      setError(err?.message || "Could not add spare part.");
    } finally {
      setWorking(false);
    }
  }

  async function handleRemove(partLineId) {
    if (disabled || working || !canEdit) return;
    setError("");
    setWorking(true);
    try {
      await onRemovePart(appointment.id, partLineId);
    } catch (err) {
      setError(err?.message || "Could not remove spare part.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="billing-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Spare parts used</h3>
        <span className="text-xs font-semibold text-ink-soft tabular-nums">
          Subtotal: {money(partsSubtotal)}
        </span>
      </div>

      {usedParts.length === 0 ? (
        <p className="text-xs text-ink-soft">No spare parts recorded for this job yet.</p>
      ) : (
        <ul className="billing-line-list">
          {usedParts.map((line) => (
            <li key={line.id} className="billing-line-item">
              <div className="min-w-0">
                <strong className="block text-xs text-ink">{line.name}</strong>
                <span className="block text-xs text-ink-soft tabular-nums">
                  {line.sku} · {line.quantity} × {money(line.unitPrice)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold tabular-nums">{money(line.lineTotal)}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="row-action text-danger"
                    disabled={disabled || working}
                    onClick={() => void handleRemove(line.id)}
                    aria-label={`Remove ${line.name} from appointment`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {partsLocked && (
        <p className="mt-2.5 text-xs text-ink-soft">
          Parts are locked because payment has already been recorded.
        </p>
      )}

      {canEdit && (
        <form className="mt-3.5 space-y-2.5 border-t border-paper-line pt-3.5" onSubmit={handleAdd} noValidate>
          <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2 max-[480px]:grid-cols-1">
            <div>
              <label className="mb-1 block text-xs font-bold" htmlFor={`add-part-${appointment.id}`}>
                Add spare part
              </label>
              <select
                id={`add-part-${appointment.id}`}
                className="control-input"
                value={selectedPartId}
                disabled={disabled || working || availableParts.length === 0}
                onChange={(event) => { setSelectedPartId(event.target.value); setError(""); }}
              >
                <option value="">
                  {availableParts.length === 0 ? "No active parts in stock" : "Choose a part"}
                </option>
                {availableParts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.sku} · {part.name} ({money(part.unitPrice)}, {part.stockQuantity} left)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold" htmlFor={`add-part-qty-${appointment.id}`}>
                Qty
              </label>
              <input
                id={`add-part-qty-${appointment.id}`}
                type="number"
                min="1"
                max={chosenPart ? chosenPart.stockQuantity : 1000}
                className="control-input"
                value={quantity}
                disabled={disabled || working || !selectedPartId}
                onChange={(event) => { setQuantity(event.target.value); setError(""); }}
              />
            </div>
          </div>
          {error && <FormError message={error} />}
          <button
            type="submit"
            className="button button-secondary w-full"
            disabled={disabled || working || !selectedPartId}
          >
            {working ? "Updating parts..." : "Add part to job"}
          </button>
        </form>
      )}
    </div>
  );
}

export function AppointmentInvoicePanel({
  appointment,
  disabled,
  onRecordPayment
}) {
  const invoice = appointment.invoice ?? null;
  const labourSubtotal = invoice
    ? Number(invoice.labourSubtotal)
    : (appointment.services ?? []).reduce((sum, item) => sum + Number(item.price || 0), 0);
  const partsSubtotal = invoice
    ? Number(invoice.partsSubtotal)
    : (appointment.partsUsed ?? []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const totalAmount = invoice ? Number(invoice.totalAmount) : labourSubtotal + partsSubtotal;
  const amountPaid = invoice ? Number(invoice.amountPaid) : 0;
  const balanceDue = invoice ? Number(invoice.balanceDue) : Math.max(0, totalAmount - amountPaid);
  const paymentStatus = invoice?.paymentStatus ?? (totalAmount === 0 ? "Paid" : "Unpaid");

  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : "");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : "");
    setError("");
  }, [appointment.id, balanceDue]);

  async function handlePaymentSubmit(event) {
    event.preventDefault();
    if (disabled || working || balanceDue <= 0) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (numericAmount > balanceDue + 0.001) {
      setError(`Payment cannot exceed the remaining balance of ${money(balanceDue)}.`);
      return;
    }

    setError("");
    setWorking(true);
    try {
      await onRecordPayment(appointment.id, {
        amount: Math.round(numericAmount * 100) / 100,
        method,
        reference: reference.trim() || null
      });
      setReference("");
    } catch (err) {
      setError(err?.message || "Could not record payment.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="billing-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">Invoice &amp; payment</h3>
          {invoice && (
            <p className="mt-0.5 text-xs font-semibold text-ink-soft tabular-nums">{invoice.invoiceNumber}</p>
          )}
        </div>
        <span className={`status-text ${PAYMENT_PILLS[paymentStatus] ?? "pill-muted"}`}>
          {PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus}
        </span>
      </div>

      <dl className="invoice-summary-grid tabular-nums">
        <div><dt>Labour</dt><dd>{money(labourSubtotal)}</dd></div>
        <div><dt>Spare parts</dt><dd>{money(partsSubtotal)}</dd></div>
        <div className="invoice-summary-total"><dt>Total</dt><dd>{money(totalAmount)}</dd></div>
        <div><dt>Paid</dt><dd>{money(amountPaid)}</dd></div>
        <div className={balanceDue > 0 ? "text-rust-dark font-bold" : "text-success font-bold"}>
          <dt>Balance due</dt>
          <dd>{money(balanceDue)}</dd>
        </div>
      </dl>

      {invoice?.paymentMethod && (
        <p className="mt-2.5 text-xs text-ink-soft">
          Last payment: <strong>{PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}</strong>
          {invoice.paymentReference ? ` · Ref: ${invoice.paymentReference}` : ""}
          {invoice.paidAtUtc ? ` · Settled ${formatDateTime(invoice.paidAtUtc)} MYT` : ""}
        </p>
      )}

      {balanceDue > 0 && paymentStatus !== "Voided" && (
        <form className="mt-3.5 space-y-3 border-t border-paper-line pt-3.5" onSubmit={handlePaymentSubmit} noValidate>
          <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
            <div>
              <label className="mb-1 block text-xs font-bold" htmlFor={`pay-amount-${appointment.id}`}>
                Amount (RM)
              </label>
              <input
                id={`pay-amount-${appointment.id}`}
                type="number"
                step="0.01"
                min="0.01"
                max={balanceDue.toFixed(2)}
                inputMode="decimal"
                className="control-input"
                value={amount}
                disabled={disabled || working}
                onChange={(event) => { setAmount(event.target.value); setError(""); }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold" htmlFor={`pay-method-${appointment.id}`}>
                Method
              </label>
              <select
                id={`pay-method-${appointment.id}`}
                className="control-input"
                value={method}
                disabled={disabled || working}
                onChange={(event) => { setMethod(event.target.value); setError(""); }}
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>
                    {PAYMENT_METHOD_LABELS[item] ?? item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold" htmlFor={`pay-ref-${appointment.id}`}>
              Reference (optional)
            </label>
            <input
              id={`pay-ref-${appointment.id}`}
              type="text"
              maxLength={100}
              className="control-input"
              placeholder="DuitNow ref, card approval, or transfer ID"
              value={reference}
              disabled={disabled || working}
              onChange={(event) => { setReference(event.target.value); setError(""); }}
            />
          </div>

          {error && <FormError message={error} />}
          <button
            type="submit"
            className="button button-primary w-full"
            disabled={disabled || working}
          >
            {working ? "Recording payment..." : "Record payment"}
          </button>
        </form>
      )}
    </div>
  );
}
