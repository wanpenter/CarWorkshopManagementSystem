import { useEffect, useRef } from "react";
import { WORKSHOP_PROFILE, formatReceiptNumber } from "../workshopProfile.js";

const moneyFormat = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const mileageFormat = new Intl.NumberFormat("en-MY");
const dateTimeFormat = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur"
});

function formatMyt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : `${dateTimeFormat.format(date)} MYT`;
}

export function ReceiptSheet({ appointment, customer, printedAt }) {
  const services = appointment.services ?? [];
  const totalPrice = services.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalMinutes = services.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const receiptNumber = formatReceiptNumber(appointment);

  return (
    <article className="receipt-sheet" aria-label={`Service receipt ${receiptNumber}`}>
      <header className="receipt-header">
        <div>
          <div className="receipt-brand">
            Torque<span className="brand-accent">Pro</span>
          </div>
          <p className="receipt-workshop-name">{WORKSHOP_PROFILE.name}</p>
          <p className="receipt-meta-line">{WORKSHOP_PROFILE.tagline}</p>
          <p className="receipt-meta-line">
            {WORKSHOP_PROFILE.address} · {WORKSHOP_PROFILE.phone}
          </p>
        </div>
        <div className="receipt-header-right">
          <div className="receipt-doc-title">SERVICE RECEIPT</div>
          <dl className="receipt-id-grid">
            <div><dt>Receipt No.</dt><dd>{receiptNumber}</dd></div>
            <div><dt>Booking Ref.</dt><dd>#{appointment.id}</dd></div>
            <div><dt>Status</dt><dd>{appointment.status}</dd></div>
            <div><dt>Printed</dt><dd>{formatMyt(printedAt)}</dd></div>
          </dl>
        </div>
      </header>

      <section className="receipt-parties">
        <div>
          <h3>Customer</h3>
          <p className="receipt-strong">{appointment.customerName}</p>
          {customer?.phone && <p>{customer.phone}</p>}
          {customer?.address && <p className="receipt-wrap">{customer.address}</p>}
        </div>
        <div>
          <h3>Vehicle &amp; Visit</h3>
          <p className="receipt-strong">{appointment.registrationNumber} · {appointment.vehicleName}</p>
          <p>Appointment: {formatMyt(appointment.scheduledAtUtc)}</p>
          <p>Mechanic: {appointment.mechanicName || "Workshop staff"}</p>
          {appointment.serviceRecord && (
            <p>Mileage: {mileageFormat.format(appointment.serviceRecord.mileage)} km</p>
          )}
          {appointment.serviceRecord?.nextServiceMileage != null && (
            <p className="receipt-strong">
              Next Service Due: {mileageFormat.format(appointment.serviceRecord.nextServiceMileage)} km
            </p>
          )}
        </div>
      </section>

      <section className="receipt-section">
        <h3>Booked Services</h3>
        {services.length > 0 ? (
          <table className="receipt-table">
            <thead>
              <tr>
                <th>Service</th>
                <th className="receipt-num">Est. Time</th>
                <th className="receipt-num">Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.serviceId}>
                  <td>{service.name}</td>
                  <td className="receipt-num">{service.durationMinutes} min</td>
                  <td className="receipt-num">{moneyFormat.format(service.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="receipt-num">{totalMinutes} min</td>
                <td className="receipt-num receipt-total">{moneyFormat.format(totalPrice)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="receipt-muted">{appointment.serviceType || "Legacy service record (no itemized prices)."}</p>
        )}
      </section>

      {appointment.serviceRecord && (
        <section className="receipt-section">
          <h3>Actual Work Performed</h3>
          <p className="receipt-meta-line">
            Recorded {formatMyt(appointment.serviceRecord.recordedAtUtc)} · Odometer {mileageFormat.format(appointment.serviceRecord.mileage)} km
            {appointment.serviceRecord.nextServiceMileage != null
              ? ` · Next service due at ${mileageFormat.format(appointment.serviceRecord.nextServiceMileage)} km`
              : ""}
          </p>
          <p className="receipt-work-notes">{appointment.serviceRecord.workPerformed}</p>
        </section>
      )}

      {appointment.notes && (
        <section className="receipt-section">
          <h3>Booking Notes</h3>
          <p className="receipt-work-notes">{appointment.notes}</p>
        </section>
      )}

      <footer className="receipt-footer">
        <p>{WORKSHOP_PROFILE.footerNote}</p>
        <p className="receipt-signature-line">
          <span>Prepared by: _______________________</span>
          <span>Customer acknowledgement: _______________________</span>
        </p>
      </footer>
    </article>
  );
}

export default function ServiceReceiptDialog({ appointment, customer, onClose, onPrint }) {
  const dialogRef = useRef(null);
  const printButtonRef = useRef(null);
  const printedAt = appointment ? new Date().toISOString() : "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (appointment && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => printButtonRef.current?.focus());
    } else if (!appointment && dialog.open) {
      dialog.close();
    }
  }, [appointment]);

  function handlePrint() {
    if (!appointment) return;
    onPrint?.(appointment);
    window.print();
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="dialog receipt-dialog no-print"
        aria-labelledby="receipt-dialog-title"
        onClose={onClose}
      >
        {appointment && (
          <div>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-paper-line pb-4">
              <div>
                <h2 id="receipt-dialog-title" className="font-display text-xl font-bold">
                  Service receipt preview
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {formatReceiptNumber(appointment)} · Use Print to send to a workshop printer or choose Save as PDF.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  ref={printButtonRef}
                  type="button"
                  className="button button-primary"
                  onClick={handlePrint}
                >
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>

            {!appointment.serviceRecord && (
              <p className="mb-4 rounded-sm border border-paper-line bg-rust-soft px-3.5 py-2.5 text-sm text-rust-dark" role="status">
                Note: Actual mileage and service record have not been entered yet. You can print booked items now, or close and click <strong>Record service</strong> first.
              </p>
            )}

            <div className="receipt-preview-frame">
              <ReceiptSheet appointment={appointment} customer={customer} printedAt={printedAt} />
            </div>
          </div>
        )}
      </dialog>

      {appointment && (
        <div className="print-only print-receipt-sheet">
          <ReceiptSheet appointment={appointment} customer={customer} printedAt={printedAt} />
        </div>
      )}
    </>
  );
}
