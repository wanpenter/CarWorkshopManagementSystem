import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getProblemFieldErrors,
  toWorkshopDateTimeInput,
  toWorkshopUtcIso,
  validateAppointment,
  validateCustomer,
  validateVehicle
} from "../api.js";
import { DeleteDialog } from "./Dialogs.jsx";
import ServiceReceiptDialog from "./ServiceReceiptDialog.jsx";
import { VehicleServiceHistory } from "./ServiceRecord.jsx";
import {
  ConnectionStatus,
  FormError,
  MobileDatum,
  Notice,
  PaginationBar,
  ResultsBar,
  SelectField,
  StatePanel,
  TableCell,
  TableHead,
  TextAreaField,
  TextField
} from "./Shared.jsx";
import WorkshopIcon from "./WorkshopIcon.jsx";

const PORTAL_SECTIONS = [
  ["bookings", "My bookings", "appointments"],
  ["book", "Book service", "services"],
  ["vehicles", "My vehicles", "vehicles"],
  ["account", "My account", "account"]
];

const WORKFLOW_STEPS = [
  { key: "Requested", label: "Needs review" },
  { key: "Confirmed", label: "Confirmed" },
  { key: "InProgress", label: "In progress" },
  { key: "Completed", label: "Completed" }
];

const STATUS_LABELS = {
  Requested: "Needs review",
  Confirmed: "Confirmed",
  Scheduled: "Scheduled",
  InProgress: "In progress",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Rejected: "Rejected"
};

const STATUS_PILLS = {
  Requested: "pill-rust",
  Confirmed: "pill-success",
  Scheduled: "pill-rust",
  InProgress: "pill-teal",
  Completed: "pill-success",
  Cancelled: "pill-muted",
  Rejected: "pill-danger"
};

const CANCELLABLE_STATUSES = ["Requested", "Confirmed", "Scheduled"];
const PAGE_SIZE = 10;

const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur"
  }).format(date);
}

function nextSlotInput() {
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

function stepIndexFor(status) {
  if (status === "Requested") return 0;
  if (status === "Confirmed" || status === "Scheduled") return 1;
  if (status === "InProgress") return 2;
  if (status === "Completed") return 3;
  return -1;
}

function serviceSummary(appointment) {
  return appointment.services?.length
    ? appointment.services.map((service) => service.name).join(", ")
    : appointment.serviceType || "Workshop service";
}

function appointmentTotal(appointment) {
  return (appointment.services ?? []).reduce((sum, item) => sum + Number(item.price || 0), 0);
}

const BLANK_VEHICLE = {
  registrationNumber: "",
  make: "",
  model: "",
  year: "",
  mileage: "0",
  isActive: true
};

export default function CustomerPortal({
  api,
  user,
  onUserUpdated,
  onLogout,
  signingOut = false,
  onChangePassword,
  onOpenSettings,
  onSessionExpired
}) {
  const [activeTab, setActiveTab] = useState("bookings");
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState(null);

  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);

  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("");
  const [bookingPage, setBookingPage] = useState(1);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const cancelDialogRef = useRef(null);
  const cancelReasonRef = useRef(null);

  const [receiptAppointmentId, setReceiptAppointmentId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const menuRef = useRef(null);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef(null);

  const showNotice = useCallback((message, tone = "success") => {
    if (mountedRef.current) setNotice({ message, tone });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  useEffect(() => {
    const dialog = cancelDialogRef.current;
    if (!dialog) return;
    if (cancelTarget && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => cancelReasonRef.current?.focus());
    } else if (!cancelTarget && dialog.open) {
      dialog.close();
    }
  }, [cancelTarget]);

  const loadPortal = useCallback(async ({ quiet = false } = {}) => {
    if (!api) return { ok: false };
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    if (!quiet) {
      setStatus("loading");
      setErrorMessage("");
    }
    try {
      const [profileData, vehicleData, appointmentData, serviceData] = await Promise.all([
        api.getPortalProfile({ signal: controller.signal }),
        api.getPortalVehicles({ signal: controller.signal }),
        api.getPortalAppointments({ signal: controller.signal }),
        api.getPortalServices({ signal: controller.signal })
      ]);
      if (controller.signal.aborted || !mountedRef.current) return { ok: false, stale: true };
      setProfile(profileData);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
      const list = Array.isArray(appointmentData) ? appointmentData : [];
      setAppointments(list);
      setServices(Array.isArray(serviceData) ? serviceData : []);
      setSelectedBookingId((current) =>
        current !== null && list.some((item) => Number(item.id) === current)
          ? current
          : list[0]?.id ?? null
      );
      setStatus("ready");
      setErrorMessage("");
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return { ok: false, stale: true };
      if (error?.status === 401) {
        onSessionExpired?.();
        return { ok: false };
      }
      if (!quiet) {
        setStatus("error");
        setErrorMessage(error instanceof ApiError ? error.message : "Could not load your portal records.");
      }
      return { ok: false, error };
    }
  }, [api, onSessionExpired]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const refreshAfterWrite = useCallback(async (message) => {
    const result = await loadPortal({ quiet: true });
    if (result.ok) showNotice(message);
    else if (!result.stale) showNotice(`${message} Please reload to see the latest status.`, "error");
  }, [loadPortal, showNotice]);

  function navigate(tab) {
    setActiveTab(tab);
    setMenuOpen(false);
    window.requestAnimationFrame(() => document.getElementById(`portal-${tab}-title`)?.focus());
  }

  const busy = status === "loading" || mutating || signingOut;
  const activeVehicles = useMemo(() => vehicles.filter((item) => item.isActive !== false), [vehicles]);

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLocaleLowerCase();
    return appointments.filter((item) => {
      if (bookingStatusFilter && item.status !== bookingStatusFilter) return false;
      if (!query) return true;
      return `${item.registrationNumber ?? ""} ${item.vehicleName ?? ""} ${serviceSummary(item)} ${item.mechanicName ?? ""} ${item.notes ?? ""}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [appointments, bookingSearch, bookingStatusFilter]);

  useEffect(() => {
    setBookingPage(1);
  }, [bookingSearch, bookingStatusFilter]);

  const bookingTotalPages = Math.max(1, Math.ceil(filteredBookings.length / PAGE_SIZE));
  const safeBookingPage = Math.min(bookingPage, bookingTotalPages);
  const paginatedBookings = useMemo(
    () => filteredBookings.slice((safeBookingPage - 1) * PAGE_SIZE, safeBookingPage * PAGE_SIZE),
    [filteredBookings, safeBookingPage]
  );

  const selectedBooking = useMemo(
    () => appointments.find((item) => Number(item.id) === Number(selectedBookingId)) ?? null,
    [appointments, selectedBookingId]
  );

  const receiptAppointment = useMemo(
    () => receiptAppointmentId === null ? null : appointments.find((item) => Number(item.id) === receiptAppointmentId) ?? null,
    [appointments, receiptAppointmentId]
  );

  const upcomingCount = useMemo(
    () => appointments.filter((item) => ["Requested", "Confirmed", "Scheduled", "InProgress"].includes(item.status)).length,
    [appointments]
  );
  const reviewCount = useMemo(
    () => appointments.filter((item) => item.status === "Requested").length,
    [appointments]
  );
  const completedCount = useMemo(
    () => appointments.filter((item) => item.status === "Completed").length,
    [appointments]
  );

  async function submitCancelBooking(event) {
    event.preventDefault();
    if (!cancelTarget || mutating) return;
    setMutating(true);
    setCancelError("");
    try {
      const updated = await api.cancelPortalAppointment(cancelTarget.id, cancelReason.trim() || null);
      setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCancelTarget(null);
      setCancelReason("");
      await refreshAfterWrite("Appointment cancelled.");
    } catch (error) {
      setCancelError(error instanceof ApiError ? error.message : "Could not cancel this appointment.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveVehicle(id, values) {
    setMutating(true);
    try {
      if (id === null) await api.addPortalVehicle(values);
      else await api.updatePortalVehicle(id, values);
      await refreshAfterWrite(id === null ? "Vehicle registered." : "Vehicle changes saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function confirmDeleteVehicle() {
    if (!deleteTarget || mutating) return;
    setMutating(true);
    setDeleteError("");
    try {
      await api.deletePortalVehicle(deleteTarget.record.id);
      setDeleteTarget(null);
      await refreshAfterWrite("Vehicle deleted.");
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : "Could not delete this vehicle.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function createBooking(values) {
    setMutating(true);
    try {
      const created = await api.addPortalAppointment(values);
      setSelectedBookingId(Number(created.id));
      await refreshAfterWrite("Booking request submitted! Our workshop team will review and confirm shortly.");
      navigate("bookings");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveProfile(values) {
    setMutating(true);
    try {
      const updated = await api.updatePortalProfile(values);
      setProfile(updated);
      onUserUpdated?.((current) => current ? { ...current, fullName: updated.fullName } : current);
      showNotice("Profile updated.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  function handlePrintReceipt(appointment) {
    if (!api || !appointment?.id) return;
    void api.logPortalReceiptPrinted(appointment.id).catch(() => {});
  }

  const currentTabLabel = PORTAL_SECTIONS.find(([id]) => id === activeTab)?.[1] ?? "My bookings";
  const counts = { bookings: appointments.length, vehicles: vehicles.length };

  return (
    <div className="workshop-shell">
      <a className="skip-link" href="#portal-main">Skip to customer portal</a>
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} id="portal-sidebar">
        <a
          className="brand"
          href="#bookings"
          onClick={(event) => { event.preventDefault(); navigate("bookings"); }}
          aria-label="TorquePro customer portal"
        >
          <span>Torque<span className="brand-accent">Pro</span></span>
        </a>
        <div className="sidebar-caption">Customer portal</div>
        <nav className="section-nav" aria-label="Customer portal navigation">
          {PORTAL_SECTIONS.map(([id, label, icon]) => (
            <button
              key={id}
              id={`portal-${id}-nav`}
              className="section-tab"
              type="button"
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <WorkshopIcon name={icon} />
              <span>{label}</span>
              {counts[id] !== undefined && <span className="tab-count">{counts[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-footer-dot" />
          <div>
            <strong>{profile?.fullName || user?.fullName}</strong>
            <span>Customer account</span>
          </div>
        </div>
      </aside>

      <div className="app-surface">
        <header className="app-header">
          <div className="header-location">
            <button
              ref={menuRef}
              className="menu-toggle"
              type="button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-controls="portal-sidebar"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <WorkshopIcon name={menuOpen ? "close" : "menu"} />
            </button>
            <span className="header-workspace">Customer portal</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{currentTabLabel}</strong>
          </div>
          <div className="header-tools">
            <ConnectionStatus status={status} />
            <button className="header-settings" type="button" onClick={onOpenSettings} disabled={busy}>
              <WorkshopIcon name="settings" />
              <span>API settings</span>
            </button>
            <button className="header-settings" type="button" disabled={busy} onClick={onLogout}>
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <div className="workspace-context">
          <span>Self-service booking &amp; service history</span>
          <time dateTime={new Date().toISOString()}>
            {new Intl.DateTimeFormat("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())}
            <span className="date-zone">MYT</span>
          </time>
        </div>

        <main id="portal-main" tabIndex={-1}>
          {notice && (
            <div className="notice-container no-print">
              <Notice notice={notice} onDismiss={() => setNotice(null)} />
            </div>
          )}

          {status === "loading" ? (
            <div className="dashboard-page">
              <div className="dashboard-panel">
                <StatePanel loading title="Loading your customer portal" body="Fetching your vehicles, bookings, and available workshop services." />
              </div>
            </div>
          ) : status === "error" ? (
            <div className="dashboard-page">
              <div className="dashboard-panel">
                <StatePanel error title="Could not load your portal" body={errorMessage}>
                  <button className="button button-primary" type="button" onClick={() => void loadPortal()}>Try again</button>
                  <button className="button button-secondary" type="button" onClick={onOpenSettings}>API settings</button>
                </StatePanel>
              </div>
            </div>
          ) : (
            <>
              <section hidden={activeTab !== "bookings"} aria-labelledby="portal-bookings-title">
                <div className="dashboard-page">
                  <div className="dashboard-heading">
                    <div>
                      <h1 id="portal-bookings-title" className="page-title" tabIndex={-1}>My bookings</h1>
                      <p className="page-description">Track your workshop appointments, cancel upcoming requests, or print completed receipts.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadPortal().then((res) => res.ok && showNotice("Portal records refreshed."))}>
                        Refresh
                      </button>
                      <button className="button button-primary" type="button" disabled={busy} onClick={() => navigate("book")}>
                        <WorkshopIcon name="services" />
                        Book a service
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                    <button type="button" className="metric-card" onClick={() => setBookingStatusFilter("")}>
                      <span className="metric-top"><span>Active visits</span><span className="metric-icon orange"><WorkshopIcon name="appointments" /></span></span>
                      <strong className="metric-value">{upcomingCount}</strong>
                      <span className="metric-note">Pending, confirmed, or in progress</span>
                    </button>
                    <button type="button" className="metric-card" onClick={() => setBookingStatusFilter("Requested")}>
                      <span className="metric-top"><span>Awaiting workshop review</span><span className="metric-icon teal"><WorkshopIcon name="services" /></span></span>
                      <strong className="metric-value">{reviewCount}</strong>
                      <span className="metric-note">Requests waiting for confirmation</span>
                    </button>
                    <button type="button" className="metric-card" onClick={() => setBookingStatusFilter("Completed")}>
                      <span className="metric-top"><span>Completed services</span><span className="metric-icon teal"><WorkshopIcon name="vehicles" /></span></span>
                      <strong className="metric-value">{completedCount}</strong>
                      <span className="metric-note">Ready for receipt download</span>
                    </button>
                  </div>
                </div>

                <div className="workspace-grid">
                  <div className="records-panel">
                    <div className="filter-row filter-row-wide">
                      <div>
                        <label className="mb-2 block font-bold" htmlFor="portal-booking-search">Search bookings</label>
                        <input
                          id="portal-booking-search"
                          className="control-input"
                          type="search"
                          placeholder="Plate number, service, or notes"
                          value={bookingSearch}
                          onChange={(event) => setBookingSearch(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block font-bold" htmlFor="portal-booking-status">Status</label>
                        <select
                          id="portal-booking-status"
                          className="control-input"
                          value={bookingStatusFilter}
                          onChange={(event) => setBookingStatusFilter(event.target.value)}
                        >
                          <option value="">All statuses</option>
                          {Object.entries(STATUS_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <ResultsBar
                      visibleCount={filteredBookings.length}
                      totalCount={appointments.length}
                      noun="booking"
                      hasFilters={Boolean(bookingSearch || bookingStatusFilter)}
                      onClearFilters={() => { setBookingSearch(""); setBookingStatusFilter(""); }}
                    />

                    {appointments.length === 0 ? (
                      <StatePanel title="No bookings yet" body="Book your first workshop appointment online and track its progress here.">
                        <button className="button button-primary" type="button" onClick={() => navigate(activeVehicles.length ? "book" : "vehicles")}>
                          {activeVehicles.length ? "Book first service" : "Register your first vehicle"}
                        </button>
                      </StatePanel>
                    ) : filteredBookings.length === 0 ? (
                      <StatePanel compact title="No matching bookings" body="Clear the search or status filter to view all your bookings.">
                        <button className="button button-quiet" type="button" onClick={() => { setBookingSearch(""); setBookingStatusFilter(""); }}>
                          Clear filters
                        </button>
                      </StatePanel>
                    ) : (
                      <>
                        <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
                          <table className="w-full border-collapse tabular-nums">
                            <thead>
                              <tr>
                                <TableHead>When</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Services</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedBookings.map((appointment) => (
                                <tr
                                  key={appointment.id}
                                  className={Number(appointment.id) === Number(selectedBookingId) ? "bg-selected" : "transition-colors hover:bg-selected"}
                                >
                                  <TableCell className="font-semibold whitespace-nowrap">{formatDateTime(appointment.scheduledAtUtc)}</TableCell>
                                  <TableCell>
                                    <strong className="block">{appointment.registrationNumber}</strong>
                                    <span className="mt-0.5 block text-xs text-ink-soft">{appointment.vehicleName}</span>
                                  </TableCell>
                                  <TableCell className="max-w-68">
                                    <span className="block">{serviceSummary(appointment)}</span>
                                    <span className="mt-0.5 block text-xs text-ink-soft">{money(appointmentTotal(appointment))}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={`status-text ${STATUS_PILLS[appointment.status] ?? "pill-muted"}`}>
                                      {STATUS_LABELS[appointment.status] ?? appointment.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <div className="flex justify-end gap-1">
                                      <button type="button" className="row-action" onClick={() => setSelectedBookingId(Number(appointment.id))}>
                                        Details
                                      </button>
                                      {appointment.status === "Completed" && (
                                        <button type="button" className="row-action text-rust-dark" onClick={() => setReceiptAppointmentId(Number(appointment.id))}>
                                          Receipt
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid gap-3 desk:hidden">
                          {paginatedBookings.map((appointment) => (
                            <article
                              key={appointment.id}
                              className={`record-card ${Number(appointment.id) === Number(selectedBookingId) ? "border-line-strong bg-selected" : "border-paper-line bg-paper-raised"}`}
                            >
                              <MobileDatum label="When"><strong>{formatDateTime(appointment.scheduledAtUtc)}</strong></MobileDatum>
                              <MobileDatum label="Vehicle">{appointment.registrationNumber} · {appointment.vehicleName}</MobileDatum>
                              <MobileDatum label="Services">{serviceSummary(appointment)} ({money(appointmentTotal(appointment))})</MobileDatum>
                              <MobileDatum label="Status">
                                <span className={`status-text ${STATUS_PILLS[appointment.status] ?? "pill-muted"}`}>
                                  {STATUS_LABELS[appointment.status] ?? appointment.status}
                                </span>
                              </MobileDatum>
                              <div className="mt-2 flex flex-wrap gap-2 border-t border-paper-line pt-2">
                                <button type="button" className="row-action" onClick={() => setSelectedBookingId(Number(appointment.id))}>Details</button>
                                {appointment.status === "Completed" && (
                                  <button type="button" className="row-action text-rust-dark" onClick={() => setReceiptAppointmentId(Number(appointment.id))}>Receipt</button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>

                        <PaginationBar
                          page={safeBookingPage}
                          totalPages={bookingTotalPages}
                          totalCount={filteredBookings.length}
                          pageSize={PAGE_SIZE}
                          onPageChange={setBookingPage}
                        />
                      </>
                    )}
                  </div>

                  <aside className="editor-panel" aria-labelledby="portal-booking-detail-title">
                    <div className="mb-7">
                      <h2 id="portal-booking-detail-title" className="editor-title">
                        {selectedBooking ? `Booking #${selectedBooking.id}` : "Booking details"}
                      </h2>
                      <p className="mt-2 text-ink-soft">
                        {selectedBooking
                          ? `${selectedBooking.registrationNumber} · ${selectedBooking.vehicleName}`
                          : "Select a booking to view live job progress and receipt options."}
                      </p>
                    </div>

                    {selectedBooking ? (
                      <PortalBookingDetail
                        appointment={selectedBooking}
                        busy={busy}
                        onRequestCancel={() => { setCancelReason(""); setCancelError(""); setCancelTarget(selectedBooking); }}
                        onOpenReceipt={() => setReceiptAppointmentId(Number(selectedBooking.id))}
                      />
                    ) : (
                      <p className="text-sm text-ink-soft">No booking selected yet.</p>
                    )}
                  </aside>
                </div>
              </section>

              <PortalBookServiceSection
                active={activeTab === "book"}
                vehicles={activeVehicles}
                services={services}
                busy={busy}
                onGoVehicles={() => navigate("vehicles")}
                onSubmit={createBooking}
              />

              <PortalVehiclesSection
                active={activeTab === "vehicles"}
                vehicles={vehicles}
                appointments={appointments}
                busy={busy}
                onSave={saveVehicle}
                onDelete={(record) => { setDeleteError(""); setDeleteTarget({ type: "vehicle", record }); }}
                onOpenReceipt={(appointment) => setReceiptAppointmentId(Number(appointment.id))}
              />

              <PortalAccountSection
                active={activeTab === "account"}
                user={user}
                profile={profile}
                busy={busy}
                onSaveProfile={saveProfile}
                onChangePassword={onChangePassword}
              />
            </>
          )}
        </main>

        <footer className="app-footer">
          <span>TorquePro Customer Portal</span>
          <span>Workshop hours: 8:30 AM – 5:30 PM MYT</span>
        </footer>
      </div>

      <dialog
        ref={cancelDialogRef}
        className="dialog no-print"
        aria-labelledby="portal-cancel-title"
        onClose={() => !mutating && setCancelTarget(null)}
        onCancel={(event) => mutating && event.preventDefault()}
      >
        {cancelTarget && (
          <form noValidate onSubmit={submitCancelBooking}>
            <h2 id="portal-cancel-title" className="font-display text-2xl font-bold">Cancel this booking?</h2>
            <p className="mt-2 text-ink-soft">
              Cancelling frees your {formatDateTime(cancelTarget.scheduledAtUtc)} MYT slot for <strong>{cancelTarget.registrationNumber}</strong>. This cannot be undone.
            </p>
            <div className="mt-5">
              <label className="mb-2 block font-bold" htmlFor="portal-cancel-reason">Reason (optional)</label>
              <textarea
                ref={cancelReasonRef}
                id="portal-cancel-reason"
                className="control-input min-h-24 resize-y"
                maxLength={300}
                value={cancelReason}
                disabled={mutating}
                placeholder="e.g. Need to reschedule to next week"
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </div>
            {cancelError && <div className="mt-4"><FormError message={cancelError} /></div>}
            <div className="mt-6 flex flex-wrap justify-end gap-2 max-[500px]:[&>*]:w-full">
              <button type="submit" className="button button-danger" disabled={mutating}>
                {mutating ? "Cancelling..." : "Cancel booking"}
              </button>
              <button type="button" className="button button-quiet" disabled={mutating} onClick={() => setCancelTarget(null)}>
                Keep booking
              </button>
            </div>
          </form>
        )}
      </dialog>

      <DeleteDialog
        target={deleteTarget}
        error={deleteError}
        busy={mutating}
        onClose={() => !mutating && setDeleteTarget(null)}
        onConfirm={confirmDeleteVehicle}
      />

      <ServiceReceiptDialog
        appointment={receiptAppointment}
        customer={profile}
        onClose={() => setReceiptAppointmentId(null)}
        onPrint={handlePrintReceipt}
      />
    </div>
  );
}

function PortalBookingDetail({ appointment, busy, onRequestCancel, onOpenReceipt }) {
  const status = appointment.status;
  const activeIndex = stepIndexFor(status);
  const isTerminalCancel = status === "Cancelled" || status === "Rejected";
  const canCancel = CANCELLABLE_STATUSES.includes(status);

  return (
    <div className="space-y-5">
      <div className="workflow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-[0.07em] text-ink-soft uppercase">Job progress</h3>
          {isTerminalCancel && (
            <span className={`workflow-terminal-pill ${status === "Rejected" ? "is-danger" : "is-muted"}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
          )}
        </div>

        {!isTerminalCancel && (
          <ol className="workflow-stepper" aria-label="Booking progress">
            {WORKFLOW_STEPS.map((step, index) => {
              const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "upcoming";
              return (
                <li key={step.key} className={`workflow-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                  <span className="workflow-step-dot" aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
                  <span className="workflow-step-label">{step.label}</span>
                </li>
              );
            })}
          </ol>
        )}

        {appointment.statusReason && (
          <p className="mt-3 text-xs text-ink">
            <strong>Reason:</strong> {appointment.statusReason}
          </p>
        )}

        {canCancel && (
          <div className="mt-4">
            <button type="button" className="button button-secondary w-full text-danger" disabled={busy} onClick={onRequestCancel}>
              Cancel booking
            </button>
          </div>
        )}

        {status === "Completed" && (
          <div className="mt-4">
            <button type="button" className="button button-primary w-full" disabled={busy} onClick={onOpenReceipt}>
              Print service receipt
            </button>
          </div>
        )}
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Scheduled time</dt>
          <dd className="mt-0.5 font-semibold">{formatDateTime(appointment.scheduledAtUtc)} MYT</dd>
          {appointment.estimatedEndUtc && (
            <dd className="text-xs text-ink-soft">Estimated finish: {formatDateTime(appointment.estimatedEndUtc)} MYT</dd>
          )}
        </div>
        <div>
          <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Assigned mechanic</dt>
          <dd className="mt-0.5 font-medium">{appointment.mechanicName || "Will be assigned after confirmation"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Booked services</dt>
          <dd className="mt-1 space-y-1">
            {(appointment.services ?? []).map((item) => (
              <div key={item.serviceId} className="flex justify-between gap-2 text-xs">
                <span>{item.name} ({item.durationMinutes} min)</span>
                <span className="font-semibold tabular-nums">{money(item.price)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-paper-line pt-1.5 font-bold">
              <span>Estimated total</span>
              <span className="tabular-nums">{money(appointmentTotal(appointment))}</span>
            </div>
          </dd>
        </div>
        {appointment.notes && (
          <div>
            <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Your notes</dt>
            <dd className="mt-0.5 text-ink-soft [overflow-wrap:anywhere]">{appointment.notes}</dd>
          </div>
        )}
      </dl>

      {appointment.serviceRecord && (
        <div className="rounded-sm border border-paper-line bg-paper p-3.5 text-xs">
          <h3 className="mb-2 font-bold tracking-[0.06em] text-ink-soft uppercase">Recorded workshop service</h3>
          <p><strong>Odometer:</strong> {Number(appointment.serviceRecord.mileage).toLocaleString("en-MY")} km</p>
          {appointment.serviceRecord.nextServiceMileage != null && (
            <p className="mt-1"><strong>Next service due:</strong> {Number(appointment.serviceRecord.nextServiceMileage).toLocaleString("en-MY")} km</p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-ink-soft">{appointment.serviceRecord.workPerformed}</p>
        </div>
      )}
    </div>
  );
}

function PortalBookServiceSection({ active, vehicles, services, busy, onGoVehicles, onSubmit }) {
  const [form, setForm] = useState(() => ({
    vehicleId: "",
    scheduledAtLocal: nextSlotInput(),
    serviceIds: [],
    notes: ""
  }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm((current) => {
      if (vehicles.some((item) => Number(item.id) === Number(current.vehicleId))) return current;
      return { ...current, vehicleId: vehicles[0] ? String(vehicles[0].id) : "" };
    });
  }, [vehicles]);

  const selectedServices = useMemo(
    () => services.filter((item) => form.serviceIds.includes(Number(item.id))),
    [form.serviceIds, services]
  );
  const totalMinutes = selectedServices.reduce((sum, item) => sum + Number(item.estimatedDurationMinutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, item) => sum + Number(item.currentPrice || 0), 0);
  const startUtc = toWorkshopUtcIso(form.scheduledAtLocal);
  const estimatedEnd = startUtc && totalMinutes ? new Date(Date.parse(startUtc) + totalMinutes * 60000) : null;
  const chosenVehicle = vehicles.find((item) => Number(item.id) === Number(form.vehicleId)) ?? null;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      ...(field === "scheduledAtLocal" ? { scheduledAtUtc: undefined } : {}),
      form: undefined
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || vehicles.length === 0 || services.length === 0) return;
    const dateControl = event.currentTarget.elements.namedItem("scheduledAtLocal");
    const submitted = {
      ...form,
      scheduledAtLocal: typeof dateControl?.value === "string" ? dateControl.value : form.scheduledAtLocal
    };
    const checked = validateAppointment({ ...submitted, totalMinutes }, { requireCustomer: false });
    if (!checked.valid) {
      setErrors(checked.errors);
      return;
    }

    setErrors({});
    try {
      await onSubmit({
        vehicleId: checked.values.vehicleId,
        scheduledAtUtc: checked.values.scheduledAtUtc,
        serviceIds: checked.values.serviceIds,
        notes: checked.values.notes
      });
      setForm({
        vehicleId: vehicles[0] ? String(vehicles[0].id) : "",
        scheduledAtLocal: nextSlotInput(),
        serviceIds: [],
        notes: ""
      });
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      if (fields.scheduledAtUtc) fields.scheduledAtLocal = fields.scheduledAtUtc;
      setErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  return (
    <section hidden={!active} aria-labelledby="portal-book-title">
      <div className="workspace-grid">
        <div className="records-panel">
          <div className="records-heading">
            <div>
              <h1 id="portal-book-title" className="page-title" tabIndex={-1}>Book a workshop service</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Choose your vehicle, pick a 30-minute time slot, and select the services you need.</p>
            </div>
          </div>

          {vehicles.length === 0 ? (
            <StatePanel title="Register a vehicle first" body="Add your vehicle details before booking your first workshop visit.">
              <button type="button" className="button button-primary" onClick={onGoVehicles}>Go to my vehicles</button>
            </StatePanel>
          ) : services.length === 0 ? (
            <StatePanel title="No online services available" body="No workshop services are currently active for online booking. Please check back later." />
          ) : (
            <form noValidate onSubmit={handleSubmit}>
              <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
                <SelectField id="portalVehicleId" label="Your vehicle" value={form.vehicleId} error={errors.vehicleId} onChange={(_, value) => updateField("vehicleId", value)}>
                  <option value="">Choose a vehicle</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registrationNumber} · {vehicle.make} {vehicle.model}
                    </option>
                  ))}
                </SelectField>

                <TextField
                  id="scheduledAtLocal"
                  label="Date and time (MYT)"
                  type="datetime-local"
                  value={form.scheduledAtLocal}
                  error={errors.scheduledAtLocal || errors.scheduledAtUtc}
                  help="Workshop hours: 8:30 AM – 5:30 PM MYT. Appointments start every 30 minutes."
                  onChange={updateField}
                />

                <fieldset className="mb-5 min-w-0 border-0 p-0">
                  <legend className="mb-2 font-bold">Select services</legend>
                  <div className="grid gap-2">
                    {services.map((service) => (
                      <label key={service.id} className="service-choice">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-rust"
                          checked={form.serviceIds.includes(Number(service.id))}
                          onChange={(event) => updateField(
                            "serviceIds",
                            event.target.checked
                              ? [...form.serviceIds, Number(service.id)]
                              : form.serviceIds.filter((id) => id !== Number(service.id))
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block">{service.name}</strong>
                          <span className="text-xs text-ink-soft">
                            {service.estimatedDurationMinutes} min · {money(service.currentPrice)}
                            {service.description ? ` · ${service.description}` : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.serviceIds && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{errors.serviceIds}</p>}
                </fieldset>

                <TextAreaField
                  id="portalNotes"
                  label="Notes for the mechanic (optional)"
                  value={form.notes}
                  maxLength={500}
                  error={errors.notes}
                  help="Describe any unusual noises, warning lights, or special requests (up to 500 characters)."
                  onChange={(_, value) => updateField("notes", value)}
                />

                <FormError message={errors.form} />
                <button type="submit" className="button button-primary">
                  {busy ? "Submitting request..." : "Request booking"}
                </button>
              </fieldset>
            </form>
          )}
        </div>

        <aside className="editor-panel" aria-labelledby="portal-summary-title">
          <div className="mb-7">
            <h2 id="portal-summary-title" className="editor-title">Booking summary</h2>
            <p className="mt-2 text-ink-soft">Live estimate based on your selected services.</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Vehicle</dt>
              <dd className="mt-0.5 font-semibold">
                {chosenVehicle ? `${chosenVehicle.registrationNumber} · ${chosenVehicle.make} ${chosenVehicle.model}` : "Not selected"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Estimated duration &amp; total</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums">{totalMinutes} min · {money(totalPrice)}</dd>
              {estimatedEnd && (
                <dd className="mt-0.5 text-xs text-ink-soft">Expected finish: {formatDateTime(estimatedEnd.toISOString())} MYT</dd>
              )}
            </div>
          </dl>
          <div className="readonly-banner mt-6">
            <strong className="block font-semibold">What happens next?</strong>
            <span className="mt-1 block text-xs text-ink-soft">
              Slot availability is checked automatically against active workshop mechanics and our daily capacity. New bookings start as <strong>Needs review</strong> until confirmed by our team.
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PortalVehiclesSection({ active, vehicles, appointments, busy, onSave, onDelete, onOpenReceipt }) {
  const [selectedId, setSelectedId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [form, setForm] = useState(BLANK_VEHICLE);
  const [errors, setErrors] = useState({});
  const maxYear = new Date().getUTCFullYear() + 1;
  const historyVehicle = historyId === null ? null : vehicles.find((item) => Number(item.id) === historyId) ?? null;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function resetEditor() {
    setSelectedId(null);
    setHistoryId(null);
    setForm(BLANK_VEHICLE);
    setErrors({});
  }

  function beginEdit(vehicle) {
    setHistoryId(null);
    setSelectedId(Number(vehicle.id));
    setForm({
      registrationNumber: String(vehicle.registrationNumber ?? ""),
      make: String(vehicle.make ?? ""),
      model: String(vehicle.model ?? ""),
      year: vehicle.year == null ? "" : String(vehicle.year),
      mileage: String(vehicle.mileage ?? 0),
      isActive: vehicle.isActive !== false
    });
    setErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const checked = validateVehicle(form, { requireCustomer: false });
    if (!checked.valid) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    try {
      await onSave(selectedId, {
        registrationNumber: checked.values.registrationNumber,
        make: checked.values.make,
        model: checked.values.model,
        year: checked.values.year,
        mileage: checked.values.mileage,
        isActive: checked.values.isActive
      });
      resetEditor();
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  return (
    <section hidden={!active} aria-labelledby="portal-vehicles-title">
      <div className="workspace-grid">
        <div className="records-panel">
          <div className="records-heading">
            <div>
              <h1 id="portal-vehicles-title" className="page-title" tabIndex={-1}>My vehicles</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">Manage your registered vehicles and view their past workshop service history.</p>
            </div>
          </div>

          {vehicles.length === 0 ? (
            <StatePanel title="No vehicles registered yet" body="Add your car using the form on the right to start booking services online." />
          ) : (
            <>
              <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
                <table className="w-full border-collapse tabular-nums">
                  <thead>
                    <tr>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Mileage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((vehicle) => (
                      <tr key={vehicle.id} className={Number(vehicle.id) === selectedId || Number(vehicle.id) === historyId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                        <TableCell>
                          <strong className="block tracking-[0.03em]">{vehicle.registrationNumber}</strong>
                          <span className="mt-0.5 block text-xs text-ink-soft">{vehicle.make} {vehicle.model}{vehicle.year ? ` · ${vehicle.year}` : ""}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{Number(vehicle.mileage ?? 0).toLocaleString("en-MY")} km</TableCell>
                        <TableCell>
                          <span className={`status-text ${vehicle.isActive === false ? "pill-muted" : "pill-success"}`}>
                            {vehicle.isActive === false ? "Inactive" : "Active"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="row-action" disabled={busy} onClick={() => { setSelectedId(null); setHistoryId(Number(vehicle.id)); }}>History</button>
                            <button type="button" className="row-action" disabled={busy} onClick={() => beginEdit(vehicle)}>Edit</button>
                            <button type="button" className="row-action text-danger" disabled={busy} onClick={() => onDelete(vehicle)}>Delete</button>
                          </div>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 desk:hidden">
                {vehicles.map((vehicle) => (
                  <article key={vehicle.id} className="record-card border-paper-line bg-paper-raised">
                    <MobileDatum label="Registration"><strong>{vehicle.registrationNumber}</strong></MobileDatum>
                    <MobileDatum label="Vehicle">{vehicle.make} {vehicle.model}{vehicle.year ? ` (${vehicle.year})` : ""}</MobileDatum>
                    <MobileDatum label="Mileage">{Number(vehicle.mileage ?? 0).toLocaleString("en-MY")} km</MobileDatum>
                    <MobileDatum label="Status">
                      <span className={`status-text ${vehicle.isActive === false ? "pill-muted" : "pill-success"}`}>
                        {vehicle.isActive === false ? "Inactive" : "Active"}
                      </span>
                    </MobileDatum>
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-paper-line pt-2">
                      <button type="button" className="row-action" disabled={busy} onClick={() => { setSelectedId(null); setHistoryId(Number(vehicle.id)); }}>History</button>
                      <button type="button" className="row-action" disabled={busy} onClick={() => beginEdit(vehicle)}>Edit</button>
                      <button type="button" className="row-action text-danger" disabled={busy} onClick={() => onDelete(vehicle)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="editor-panel" aria-labelledby="portal-vehicle-editor-title">
          {historyVehicle ? (
            <>
              <div className="mb-7">
                <h2 id="portal-vehicle-editor-title" className="editor-title">{historyVehicle.registrationNumber}</h2>
                <p className="mt-2 text-ink-soft">{historyVehicle.make} {historyVehicle.model} · Service history</p>
              </div>
              <VehicleServiceHistory appointments={appointments} vehicleId={historyId} onOpenReceipt={onOpenReceipt} />
              <div className="form-actions">
                <button type="button" className="button button-primary" disabled={busy} onClick={() => beginEdit(historyVehicle)}>Edit vehicle</button>
                <button type="button" className="button button-quiet" onClick={resetEditor}>Close history</button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-7">
                <h2 id="portal-vehicle-editor-title" className="editor-title">{selectedId === null ? "Register a vehicle" : "Edit vehicle"}</h2>
                <p className="mt-2 text-ink-soft">{selectedId === null ? "Add your vehicle to book services online." : "Update your vehicle details."}</p>
              </div>
              <form noValidate onSubmit={handleSubmit}>
                <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
                  <TextField id="portalRegNo" label="Registration number" value={form.registrationNumber} maxLength={30} help="Spaces and hyphens are removed when saved" error={errors.registrationNumber} onChange={(_, value) => updateField("registrationNumber", value)} />
                  <div className="grid grid-cols-2 gap-x-4 max-[500px]:grid-cols-1">
                    <TextField id="portalMake" label="Make" value={form.make} maxLength={50} error={errors.make} onChange={(_, value) => updateField("make", value)} />
                    <TextField id="portalModel" label="Model" value={form.model} maxLength={100} error={errors.model} onChange={(_, value) => updateField("model", value)} />
                    <TextField id="portalYear" label="Year (optional)" value={form.year} type="number" min="1900" max={maxYear} inputMode="numeric" error={errors.year} onChange={(_, value) => updateField("year", value)} />
                    <TextField id="portalMileage" label="Mileage (km)" value={form.mileage} type="number" min="0" inputMode="numeric" error={errors.mileage} onChange={(_, value) => updateField("mileage", value)} />
                  </div>
                  <label className="mb-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-paper-line bg-paper px-3 py-2.5 font-bold">
                    <input className="size-5 accent-rust" type="checkbox" checked={form.isActive} onChange={(event) => updateField("isActive", event.target.checked)} />
                    Active vehicle
                  </label>
                  <FormError message={errors.form} />
                  <div className="form-actions">
                    <button type="submit" className="button button-primary">{busy ? "Saving..." : selectedId === null ? "Register vehicle" : "Save changes"}</button>
                    {selectedId !== null && <button type="button" className="button button-quiet" onClick={resetEditor}>Cancel edit</button>}
                  </div>
                </fieldset>
              </form>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function PortalAccountSection({ active, user, profile, busy, onSaveProfile, onChangePassword }) {
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "", address: "" });
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordFormError, setPasswordFormError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      fullName: profile.fullName ?? "",
      phone: profile.phone ?? "",
      address: profile.address ?? ""
    });
  }, [profile]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const checked = validateCustomer(profileForm);
    if (!checked.valid) {
      setProfileErrors(checked.errors);
      return;
    }
    setProfileErrors({});
    try {
      await onSaveProfile(checked.values);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setProfileErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (busy || savingPassword) return;
    const next = {};
    if (!passwordForm.currentPassword) next.currentPassword = "Enter your current password.";
    if (!passwordForm.newPassword) next.newPassword = "Enter a new password.";
    else if (passwordForm.newPassword.length < 12) next.newPassword = "Use at least 12 characters.";
    else if (passwordForm.newPassword.length > 128) next.newPassword = "Use no more than 128 characters.";
    if (!passwordForm.confirmPassword) next.confirmPassword = "Confirm your new password.";
    else if (passwordForm.confirmPassword !== passwordForm.newPassword) next.confirmPassword = "The passwords do not match.";
    if (Object.keys(next).length) {
      setPasswordErrors(next);
      return;
    }
    setSavingPassword(true);
    setPasswordErrors({});
    setPasswordFormError("");
    try {
      await onChangePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setPasswordErrors(fields);
      setPasswordFormError(error instanceof ApiError ? error.message : "Password could not be changed.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!active) return null;

  return (
    <section className="workspace-grid account-workspace" aria-labelledby="portal-account-title">
      <article className="records-panel">
        <div className="records-heading">
          <div>
            <h1 id="portal-account-title" className="page-title" tabIndex={-1}>My account &amp; profile</h1>
            <p className="text-ink-soft">Keep your contact details up to date for booking confirmations and receipts.</p>
          </div>
          <span className="status-text pill-success">Customer</span>
        </div>

        <dl className="account-profile-grid mb-6">
          <div><dt>Username</dt><dd>{user?.username}</dd></div>
          <div><dt>Account role</dt><dd>{user?.role}</dd></div>
        </dl>

        <form noValidate onSubmit={handleProfileSubmit}>
          <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
            <TextField id="portalFullName" label="Full name" value={profileForm.fullName} maxLength={100} error={profileErrors.fullName} onChange={(_, value) => { setProfileForm((c) => ({ ...c, fullName: value })); setProfileErrors((e) => ({ ...e, fullName: undefined, form: undefined })); }} />
            <TextField id="portalPhone" label="Phone number" type="tel" value={profileForm.phone} maxLength={20} error={profileErrors.phone} onChange={(_, value) => { setProfileForm((c) => ({ ...c, phone: value })); setProfileErrors((e) => ({ ...e, phone: undefined, form: undefined })); }} />
            <TextAreaField id="portalAddress" label="Address (optional)" value={profileForm.address} maxLength={500} error={profileErrors.address} onChange={(_, value) => { setProfileForm((c) => ({ ...c, address: value })); setProfileErrors((e) => ({ ...e, address: undefined, form: undefined })); }} />
            <FormError message={profileErrors.form} />
            <button type="submit" className="button button-primary">{busy ? "Saving..." : "Save profile"}</button>
          </fieldset>
        </form>
      </article>

      <aside className="editor-panel" aria-labelledby="portal-password-title">
        <div className="mb-7">
          <h2 id="portal-password-title" className="editor-title">Change password</h2>
          <p className="mt-2 text-ink-soft">Changing your password signs out active sessions. Use 12 to 128 characters.</p>
        </div>
        <form noValidate onSubmit={handlePasswordSubmit}>
          <FormError message={passwordFormError} />
          <TextField id="portalCurrentPassword" label="Current password" type="password" autoComplete="current-password" value={passwordForm.currentPassword} error={passwordErrors.currentPassword} onChange={(_, value) => { setPasswordForm((c) => ({ ...c, currentPassword: value })); setPasswordErrors((e) => ({ ...e, currentPassword: undefined })); setPasswordFormError(""); }} />
          <TextField id="portalNewPassword" label="New password" type="password" autoComplete="new-password" value={passwordForm.newPassword} error={passwordErrors.newPassword} help="Use 12 to 128 characters." onChange={(_, value) => { setPasswordForm((c) => ({ ...c, newPassword: value })); setPasswordErrors((e) => ({ ...e, newPassword: undefined })); setPasswordFormError(""); }} />
          <TextField id="portalConfirmPassword" label="Confirm new password" type="password" autoComplete="new-password" value={passwordForm.confirmPassword} error={passwordErrors.confirmPassword} onChange={(_, value) => { setPasswordForm((c) => ({ ...c, confirmPassword: value })); setPasswordErrors((e) => ({ ...e, confirmPassword: undefined })); setPasswordFormError(""); }} />
          <button type="submit" className="button button-primary w-full" disabled={busy || savingPassword}>
            {savingPassword ? "Changing password..." : "Change password"}
          </button>
        </form>
      </aside>
    </section>
  );
}
