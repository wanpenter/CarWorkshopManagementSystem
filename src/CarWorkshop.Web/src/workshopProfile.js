const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

export const WORKSHOP_PROFILE = Object.freeze({
  name: env.VITE_WORKSHOP_NAME || "TorquePro Auto Workshop",
  tagline: env.VITE_WORKSHOP_TAGLINE || "Vehicle Maintenance & Service Centre",
  address: env.VITE_WORKSHOP_ADDRESS || "Melaka, Malaysia",
  phone: env.VITE_WORKSHOP_PHONE || "+60 6-000 0000",
  footerNote: env.VITE_WORKSHOP_RECEIPT_NOTE || "Thank you for servicing with TorquePro. Please keep this receipt for your vehicle service records."
});

const yearFormat = new Intl.DateTimeFormat("en-MY", {
  year: "numeric",
  timeZone: "Asia/Kuala_Lumpur"
});

export function formatReceiptNumber(appointment) {
  const id = Number(appointment?.id);
  const date = appointment?.scheduledAtUtc ? new Date(appointment.scheduledAtUtc) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : yearFormat.format(date);
  const padded = Number.isInteger(id) && id > 0 ? String(id).padStart(5, "0") : "00000";
  return `TP-${year}-${padded}`;
}
