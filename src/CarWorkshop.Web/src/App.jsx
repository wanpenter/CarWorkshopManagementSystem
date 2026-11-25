import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createApiClient,
  resolveInitialApiBaseUrl,
  resolvePortalRoute,
  saveApiBaseUrl,
  validateApiBaseUrl
} from "./api.js";
import CustomersSection from "./components/CustomersSection.jsx";
import AppointmentsSection from "./components/AppointmentsSection.jsx";
import ServicesSection from "./components/ServicesSection.jsx";
import PartsSection from "./components/PartsSection.jsx";
import MechanicsSection from "./components/MechanicsSection.jsx";
import { DeleteDialog, SettingsDialog } from "./components/Dialogs.jsx";
import { Notice } from "./components/Shared.jsx";
import VehiclesSection from "./components/VehiclesSection.jsx";
import WorkshopShell from "./components/WorkshopShell.jsx";
import DashboardSection from "./components/DashboardSection.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import AccountSection from "./components/AccountSection.jsx";
import UsersSection from "./components/UsersSection.jsx";
import AuditLogsSection from "./components/AuditLogsSection.jsx";
import ServiceReceiptDialog from "./components/ServiceReceiptDialog.jsx";
import CustomerPortal from "./components/CustomerPortal.jsx";
import { WORKSHOP_PROFILE } from "./workshopProfile.js";
import torqueProLogo from "./assets/torquepro-logo-light.png";
import "./auth.css";

function App() {
  const [browserStorage] = useState(() => {
    try {
      return { value: window.localStorage, unavailable: false };
    } catch {
      return { value: null, unavailable: true };
    }
  });
  const [initialConfig] = useState(() => {
    const resolved = resolveInitialApiBaseUrl({
      storage: browserStorage.value,
      environmentUrl: import.meta.env.VITE_API_BASE_URL,
      pageUrl: window.location.href
    });
    return { ...resolved, storageError: resolved.storageError || browserStorage.unavailable };
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(initialConfig.url);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [status, setStatus] = useState(apiBaseUrl ? "loading" : "disconnected");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [appointmentPreset, setAppointmentPreset] = useState(null);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState(() => {
    if (initialConfig.invalidStoredValue) return { tone: "error", message: "The saved API address was invalid, so the local default is being used." };
    if (initialConfig.storageError) return { tone: "error", message: "Browser storage is unavailable. API settings will last for this session." };
    return null;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [receiptAppointmentId, setReceiptAppointmentId] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [portalRoute, setPortalRoute] = useState(() => resolvePortalRoute(window.location.pathname));

  const mountedRef = useRef(true);
  const activeLoadRef = useRef({ revision: 0, controller: null });
  const settingsTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  const clearSession = useCallback((message = "Your session ended. Sign in again.") => {
    activeLoadRef.current.controller?.abort();
    activeLoadRef.current.revision += 1;
    setSessionUser(null);
    setAuthStatus("signedOut");
    setAuthError(message);
    setCustomers([]);
    setVehicles([]);
    setAppointments([]);
    setServices([]);
    setParts([]);
    setMechanics([]);
    setOwnerFilter("");
    setAppointmentPreset(null);
    setActiveTab("dashboard");
    setDeleteTarget(null);
    setReceiptAppointmentId(null);
    setSettingsOpen(false);
    setNotice(null);
    setStatus("disconnected");
  }, []);
  const api = useMemo(() => (apiBaseUrl ? createApiClient(apiBaseUrl, { onUnauthorized: clearSession }) : null), [apiBaseUrl, clearSession]);
  const loading = status === "loading";
  const busy = loading || mutating;

  const showNotice = useCallback((message, tone = "success") => {
    if (mountedRef.current) setNotice({ message, tone });
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeLoadRef.current.controller?.abort();
    };
  }, []);

  const loadRecords = useCallback(async ({ quiet = false } = {}) => {
    const revision = activeLoadRef.current.revision + 1;
    activeLoadRef.current.controller?.abort();
    const controller = new AbortController();
    activeLoadRef.current = { revision, controller };

    if (!api) {
      setStatus("disconnected");
      return { ok: false, error: new Error("Set an API address before loading records.") };
    }

    if (!quiet) {
      setStatus("loading");
      setErrorMessage("");
    }

    try {
      const [customerResult, vehicleResult, appointmentResult, serviceResult, partResult, mechanicResult] = await Promise.all([
        api.getCustomers({ signal: controller.signal }),
        api.getVehicles({ signal: controller.signal }),
        api.getAppointments({ signal: controller.signal }),
        api.getServices({ signal: controller.signal }),
        api.getParts({ signal: controller.signal }),
        api.getMechanics({ signal: controller.signal })
      ]);
      if (![customerResult, vehicleResult, appointmentResult, serviceResult, partResult, mechanicResult].every(Array.isArray)) {
        throw new Error("The API response did not contain complete workshop records.");
      }
      if (!mountedRef.current || activeLoadRef.current.revision !== revision) return { ok: false, stale: true };
      setCustomers(customerResult);
      setVehicles(vehicleResult);
      setAppointments(appointmentResult);
      setServices(serviceResult);
      setParts(partResult);
      setMechanics(mechanicResult);
      setStatus("ready");
      setErrorMessage("");
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current || activeLoadRef.current.revision !== revision) {
        return { ok: false, stale: true };
      }
      if (!quiet) {
        setCustomers([]);
        setVehicles([]);
        setAppointments([]);
        setServices([]);
        setParts([]);
        setMechanics([]);
        setStatus("error");
        setErrorMessage(error.message);
      }
      return { ok: false, error };
    }
  }, [api]);

  const checkSession = useCallback(async (signal) => {
    clearSession("");
    setAuthStatus("checking");
    setAuthError("");
    setSessionUser(null);
    try {
      if (!api) throw new Error("Set your workshop API address to connect.");
      const user = await api.getCurrentUser({ signal });
      if (signal?.aborted) return;
      setSessionUser(user);
      setAuthStatus("ready");
    } catch (error) {
      if (signal?.aborted) return;
      setAuthStatus(error.status === 401 ? "signedOut" : "error");
      setAuthError(error.status === 401 ? "" : error.message);
    }
  }, [api, clearSession]);

  useEffect(() => {
    const onPopState = () => setPortalRoute(resolvePortalRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigatePortal = useCallback((targetPortal) => {
    const nextPath = targetPortal === "staff" ? "/staff" : "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPortalRoute(targetPortal);
    setAuthError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkSession(controller.signal);
    return () => controller.abort();
  }, [checkSession]);

  useEffect(() => {
    if (sessionUser && sessionUser.role !== "Customer" && portalRoute === "staff") void loadRecords();
  }, [loadRecords, portalRoute, sessionUser]);

  useEffect(() => {
    if (!sessionUser || !api) return undefined;
    let checking = false;
    const controller = new AbortController();
    const verify = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const latest = await api.getCurrentUser({ signal: controller.signal });
        if (!controller.signal.aborted && latest.role !== sessionUser.role) clearSession("Your account access changed. Sign in again.");
      } catch (error) {
        if (!controller.signal.aborted && error.status === 401) clearSession();
      } finally { checking = false; }
    };
    const timer = window.setInterval(verify, 60000);
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", verify);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", verify); document.removeEventListener("visibilitychange", verify); };
  }, [sessionUser, api, clearSession]);

  async function login(values) {
    if (!api || authBusy) throw new Error("Connect to the workshop API before signing in.");
    setAuthBusy(true);
    try {
      const user = portalRoute === "staff"
        ? await api.staffLogin(values)
        : await api.customerLogin(values);
      setAuthError("");
      setSessionUser(user);
      setAuthStatus("ready");
    } finally { setAuthBusy(false); }
  }

  async function register(values) {
    if (!api || authBusy) throw new Error("Connect to the workshop API before registering.");
    setAuthBusy(true);
    try {
      const user = await api.registerCustomer(values);
      setAuthError("");
      setSessionUser(user);
      setAuthStatus("ready");
    } finally { setAuthBusy(false); }
  }

  async function logout() {
    if (!api || authBusy || mutating) return;
    setAuthBusy(true);
    try {
      await api.logout();
      clearSession("You have been signed out.");
    } catch (error) {
      if (error.status !== 401) showNotice(`Sign out failed: ${error.message} Try again.`, "error");
    } finally { setAuthBusy(false); }
  }

  async function changePassword(values) {
    if (!api || authBusy || mutating) throw new Error("Wait for the current change to finish.");
    setAuthBusy(true);
    try {
      await api.changePassword(values);
      clearSession("Password changed. Sign in with your new password.");
    } finally { setAuthBusy(false); }
  }

  const reloadRecords = useCallback(async () => {
    const result = await loadRecords();
    if (result.ok) showNotice("Records refreshed.");
  }, [loadRecords, showNotice]);

  const refreshAfterWrite = useCallback(async (successMessage) => {
    const refresh = await loadRecords({ quiet: true });
    if (refresh.ok) showNotice(successMessage);
    else if (!refresh.stale) showNotice(`${successMessage} The latest records could not be reloaded; use Reload records.`, "error");
  }, [loadRecords, showNotice]);

  async function saveCustomer(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addCustomer(values);
      else await api.updateCustomer(id, values);
      await refreshAfterWrite(id === null ? "Customer added." : "Customer changes saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveVehicle(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addVehicle(values);
      else await api.updateVehicle(id, values);
      await refreshAfterWrite(id === null ? "Vehicle registered." : "Vehicle changes saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveAppointment(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addAppointment(values);
      else await api.updateAppointment(id, values);
      await refreshAfterWrite(id === null ? "Appointment booked." : "Appointment changes saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function transitionAppointmentStatus(id, status, reason) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      const updated = await api.transitionAppointmentStatus(id, { status, reason });
      if (mountedRef.current) {
        setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      const statusMessages = {
        Confirmed: "Booking confirmed.",
        InProgress: "Job started (In progress).",
        Completed: "Appointment marked as completed.",
        Rejected: "Booking request rejected.",
        Cancelled: "Appointment cancelled."
      };
      await refreshAfterWrite(statusMessages[status] || "Appointment status updated.");
      return updated;
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  function openReceipt(appointment) {
    if (!appointment) return;
    setReceiptAppointmentId(Number(appointment.id));
  }

  function closeReceipt() {
    setReceiptAppointmentId(null);
  }

  function handlePrintReceipt(appointment) {
    if (!api || !appointment?.id) return;
    void api.logReceiptPrinted(appointment.id).catch(() => {});
  }

  async function recordService(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      const saved = await api.recordService(id, values);
      if (mountedRef.current) {
        setAppointments((current) => current.map((appointment) => appointment.id === saved.id ? saved : appointment));
      }
      await refreshAfterWrite("Service record saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveService(id, values, { message } = {}) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addService(values);
      else await api.updateService(id, values);
      await refreshAfterWrite(message || (id === null ? "Service added." : "Service changes saved."));
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function saveMechanic(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addMechanic(values);
      else await api.updateMechanic(id, values);
      await refreshAfterWrite(id === null ? "Mechanic added." : "Mechanic changes saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function assignMechanic(appointmentId, mechanicId) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      await api.assignMechanic(appointmentId, mechanicId);
      await refreshAfterWrite("Mechanic assignment saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function savePart(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addPart(values);
      else await api.updatePart(id, values);
      await refreshAfterWrite(id === null ? "Spare part added." : "Spare part updated.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function adjustPartStock(id, payload) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      await api.adjustPartStock(id, payload);
      await refreshAfterWrite("Stock adjustment saved.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function addAppointmentPart(appointmentId, payload) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      const updated = await api.addAppointmentPart(appointmentId, payload);
      if (mountedRef.current) {
        setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      await refreshAfterWrite("Spare part added to job.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function removeAppointmentPart(appointmentId, partLineId) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      const updated = await api.removeAppointmentPart(appointmentId, partLineId);
      if (mountedRef.current) {
        setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      await refreshAfterWrite("Spare part removed and stock restored.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  async function recordAppointmentPayment(appointmentId, payload) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      const updated = await api.recordAppointmentPayment(appointmentId, payload);
      if (mountedRef.current) {
        setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      await refreshAfterWrite("Payment recorded.");
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  function openSettings(event) {
    if (mutating) return;
    settingsTriggerRef.current = event?.currentTarget ?? null;
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
  }

  async function saveSettings(value) {
    if (mutating) return { ok: false, error: "Wait for the current change to finish." };
    const validation = validateApiBaseUrl(value, { pageUrl: window.location.href });
    if (!validation.ok) return validation;
    const storageResult = saveApiBaseUrl(browserStorage.value, validation.value);
    const changed = validation.value !== apiBaseUrl;
    setApiBaseUrl(validation.value);
    closeSettings();
    if (!storageResult.ok) showNotice(storageResult.error, "error");
    else showNotice("API address updated.");
    if (!changed) await checkSession();
    return { ok: true };
  }

  function askToDelete(type, record, trigger) {
    if (busy) return;
    deleteTriggerRef.current = trigger;
    setDeleteError("");
    setDeleteTarget({ type, record });
  }

  function closeDeleteDialog() {
    if (mutating) return;
    setDeleteTarget(null);
    setDeleteError("");
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  async function confirmDelete() {
    if (!api || !deleteTarget || mutating) return;
    const target = deleteTarget;
    setMutating(true);
    setDeleteError("");
    try {
      if (target.type === "customer") await api.deleteCustomer(target.record.id);
      else await api.deleteVehicle(target.record.id);
      setDeleteTarget(null);
      await refreshAfterWrite(target.type === "customer" ? "Customer deleted." : "Vehicle deleted.");
      window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
    } catch (error) {
      const message = error instanceof ApiError && error.message
        ? error.message
        : target.type === "customer" && error instanceof ApiError && error.status === 409
          ? "This customer cannot be deleted while vehicles or appointments are linked to them."
          : error.message;
      if (mountedRef.current) setDeleteError(message);
    } finally {
      if (mountedRef.current) setMutating(false);
    }
  }

  function showCustomerVehicles(customerId) {
    setOwnerFilter(String(customerId));
    setActiveTab("vehicles");
    window.requestAnimationFrame(() => document.getElementById("vehicles-nav")?.focus());
  }

  function goToCustomers() {
    setActiveTab("customers");
    window.requestAnimationFrame(() => document.getElementById("customers-nav")?.focus());
  }

  function goToVehicles() {
    setActiveTab("vehicles");
    window.requestAnimationFrame(() => document.getElementById("vehicles-nav")?.focus());
  }

  function openAppointments(preset = {}) {
    setAppointmentPreset({
      status: preset.status ?? "",
      mechanic: preset.mechanic ?? "",
      appointmentId: preset.appointmentId ?? null,
      token: `${Date.now()}-${Math.random()}`
    });
    setActiveTab("appointments");
    window.requestAnimationFrame(() => document.getElementById("appointments-nav")?.focus());
  }

  const receiptAppointment = useMemo(
    () => receiptAppointmentId === null ? null : appointments.find((item) => Number(item.id) === receiptAppointmentId) ?? null,
    [appointments, receiptAppointmentId]
  );
  const receiptCustomer = useMemo(
    () => receiptAppointment ? customers.find((item) => Number(item.id) === Number(receiptAppointment.customerId)) ?? null : null,
    [customers, receiptAppointment]
  );

  const isCustomerUser = sessionUser?.role === "Customer";
  const portalMismatch = Boolean(
    sessionUser && authStatus === "ready" && (
      (isCustomerUser && portalRoute === "staff") ||
      (!isCustomerUser && portalRoute === "customer")
    )
  );

  return (
    <>
      {sessionUser && authStatus === "ready" ? (
        portalMismatch ? (
          <div className={`auth-screen ${portalRoute === "staff" ? "is-staff" : "is-customer"}`}>
            <a className="skip-link" href="#main-content">Skip to portal notice</a>
            <header className="auth-navbar">
              <div className="auth-navbar-brand">
                <span className="auth-wordmark">
                  Torque<span className="auth-wordmark-accent">Pro</span>
                </span>
                <span className="auth-wordmark-divider" aria-hidden="true" />
                <img
                  src={torqueProLogo}
                  alt=""
                  aria-hidden="true"
                  className="auth-brand-logo"
                />
              </div>
            </header>
            <main id="main-content" className="auth-entry-panel" tabIndex={-1}>
              <div className={`auth-card ${portalRoute === "staff" ? "is-staff" : ""}`}>
                <div className="auth-state" role="alert">
                  <span className="auth-state-symbol" aria-hidden="true">!</span>
                  <h1>{isCustomerUser ? "Staff portal only" : "Signed in as staff"}</h1>
                  <p>
                    {isCustomerUser
                      ? `Signed in as ${sessionUser.username} (Customer). Only workshop staff can open /staff.`
                      : `Signed in as ${sessionUser.username} (${sessionUser.role}). Open Staff Portal or sign out to switch.`}
                  </p>
                  <div className="auth-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={authBusy}
                      onClick={() => navigatePortal(isCustomerUser ? "customer" : "staff")}
                    >
                      {isCustomerUser ? "Return to Customer Portal" : "Open Staff Portal (/staff)"}
                    </button>
                    <button type="button" className="button button-secondary" disabled={authBusy} onClick={logout}>
                      {authBusy ? "Signing out..." : "Sign out"}
                    </button>
                  </div>
                </div>
              </div>
            </main>
            <footer className="auth-footer">
              <div className="auth-footer-meta">
                <strong>{WORKSHOP_PROFILE.name}</strong>
              </div>
            </footer>
          </div>
        ) : isCustomerUser ? (
          <CustomerPortal
            api={api}
            user={sessionUser}
            onUserUpdated={setSessionUser}
            onLogout={logout}
            signingOut={authBusy}
            onChangePassword={changePassword}
            onOpenSettings={openSettings}
            onSessionExpired={clearSession}
          />
        ) : (
          <WorkshopShell user={sessionUser} onLogout={logout} signingOut={authBusy} activeTab={activeTab} counts={{ customers: customers.length, vehicles: vehicles.length, appointments: appointments.length, services: services.length, parts: parts.length, mechanics: mechanics.length }} status={status} mutating={mutating || authBusy} onNavigate={setActiveTab} onOpenSettings={openSettings}>
            <main id="main-content" tabIndex={-1}>
              {notice && <div className="notice-container no-print"><Notice notice={notice} onDismiss={() => setNotice(null)} /></div>}
              <DashboardSection active={activeTab === "dashboard"} status={status} errorMessage={errorMessage} customers={customers} vehicles={vehicles} services={services} parts={parts} mechanics={mechanics} appointments={appointments} busy={busy} onRetry={reloadRecords} onOpenSettings={openSettings} onNavigate={setActiveTab} onOpenAppointments={openAppointments} />
              <CustomersSection
                active={activeTab === "customers"}
                status={status}
                errorMessage={errorMessage}
                customers={customers}
                busy={busy}
                onOpenSettings={openSettings}
                onRetry={reloadRecords}
                onSave={saveCustomer}
                onDelete={askToDelete}
                onViewVehicles={showCustomerVehicles}
              />
              <VehiclesSection
                active={activeTab === "vehicles"}
                status={status}
                errorMessage={errorMessage}
                customers={customers}
                vehicles={vehicles}
                appointments={appointments}
                ownerFilter={ownerFilter}
                busy={busy}
                onOwnerFilterChange={setOwnerFilter}
                onOpenSettings={openSettings}
                onRetry={reloadRecords}
                onSave={saveVehicle}
                onDelete={askToDelete}
                onAddCustomer={goToCustomers}
                onOpenReceipt={openReceipt}
              />
              <AppointmentsSection
                active={activeTab === "appointments"}
                api={api}
                connectionStatus={status}
                errorMessage={errorMessage}
                customers={customers}
                vehicles={vehicles}
                appointments={appointments}
                services={services}
                parts={parts}
                mechanics={mechanics}
                preset={appointmentPreset}
                onAssignMechanic={assignMechanic}
                onTransitionStatus={transitionAppointmentStatus}
                onRecordService={recordService}
                onAddPart={addAppointmentPart}
                onRemovePart={removeAppointmentPart}
                onRecordPayment={recordAppointmentPayment}
                onOpenReceipt={openReceipt}
                onAddMechanic={() => { setActiveTab("mechanics"); window.requestAnimationFrame(() => document.getElementById("mechanics-nav")?.focus()); }}
                busy={busy}
                onOpenSettings={openSettings}
                onRetry={reloadRecords}
                onSave={saveAppointment}
                onAddCustomer={goToCustomers}
                onAddVehicle={goToVehicles}
                onAddService={() => setActiveTab("services")}
              />
              <ServicesSection
                active={activeTab === "services"}
                status={status}
                errorMessage={errorMessage}
                services={services}
                busy={busy}
                onOpenSettings={openSettings}
                onRetry={reloadRecords}
                onSave={saveService}
                onError={(message) => showNotice(message, "error")}
              />
              <PartsSection
                active={activeTab === "parts"}
                status={status}
                errorMessage={errorMessage}
                parts={parts}
                busy={busy}
                onOpenSettings={openSettings}
                onRetry={reloadRecords}
                onSave={savePart}
                onAdjustStock={adjustPartStock}
              />
              <MechanicsSection active={activeTab === "mechanics"} status={status} errorMessage={errorMessage} mechanics={mechanics} busy={busy} onOpenSettings={openSettings} onRetry={reloadRecords} onSave={saveMechanic} />
              {sessionUser.role === "Admin" && <UsersSection key={sessionUser.id} active={activeTab === "users"} currentUser={sessionUser} api={api} onSessionExpired={clearSession} />}
              {sessionUser.role === "Admin" && <AuditLogsSection key={`audit-${sessionUser.id}`} active={activeTab === "audit"} api={api} onSessionExpired={clearSession} onNotify={showNotice} />}
              <AccountSection active={activeTab === "account"} user={sessionUser} busy={authBusy || mutating} onChangePassword={changePassword} />
            </main>
          </WorkshopShell>
        )
      ) : (
        <LoginScreen
          portal={portalRoute}
          status={authStatus}
          errorMessage={authError}
          busy={authBusy}
          onLogin={login}
          onRegister={register}
          onSwitchPortal={navigatePortal}
          onRetry={() => void checkSession()}
          onOpenSettings={openSettings}
        />
      )}

      <SettingsDialog open={settingsOpen} initialValue={apiBaseUrl} busy={mutating || authBusy} onClose={closeSettings} onSave={saveSettings} />
      <DeleteDialog target={deleteTarget} error={deleteError} busy={mutating} onClose={closeDeleteDialog} onConfirm={confirmDelete} />
      <ServiceReceiptDialog appointment={receiptAppointment} customer={receiptCustomer} onClose={closeReceipt} onPrint={handlePrintReceipt} />
    </>
  );
}

export default App;
