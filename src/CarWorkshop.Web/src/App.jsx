import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createApiClient,
  resolveInitialApiBaseUrl,
  saveApiBaseUrl,
  validateApiBaseUrl
} from "./api.js";
import CustomersSection from "./components/CustomersSection.jsx";
import AppointmentsSection from "./components/AppointmentsSection.jsx";
import ServicesSection from "./components/ServicesSection.jsx";
import MechanicsSection from "./components/MechanicsSection.jsx";
import { DeleteDialog, SettingsDialog } from "./components/Dialogs.jsx";
import { Notice } from "./components/Shared.jsx";
import VehiclesSection from "./components/VehiclesSection.jsx";
import WorkshopShell from "./components/WorkshopShell.jsx";
import DashboardSection from "./components/DashboardSection.jsx";

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
  const [mechanics, setMechanics] = useState([]);
  const [status, setStatus] = useState(apiBaseUrl ? "loading" : "disconnected");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState(() => {
    if (initialConfig.invalidStoredValue) return { tone: "error", message: "The saved API address was invalid, so the local default is being used." };
    if (initialConfig.storageError) return { tone: "error", message: "Browser storage is unavailable. API settings will last for this session." };
    return null;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const mountedRef = useRef(true);
  const activeLoadRef = useRef({ revision: 0, controller: null });
  const settingsTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  const api = useMemo(() => (apiBaseUrl ? createApiClient(apiBaseUrl) : null), [apiBaseUrl]);
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
      const [customerResult, vehicleResult, appointmentResult, serviceResult, mechanicResult] = await Promise.all([
        api.getCustomers({ signal: controller.signal }),
        api.getVehicles({ signal: controller.signal }),
        api.getAppointments({ signal: controller.signal }),
        api.getServices({ signal: controller.signal }),
        api.getMechanics({ signal: controller.signal })
      ]);
      if (![customerResult, vehicleResult, appointmentResult, serviceResult, mechanicResult].every(Array.isArray)) {
        throw new Error("The API response did not contain complete workshop records.");
      }
      if (!mountedRef.current || activeLoadRef.current.revision !== revision) return { ok: false, stale: true };
      setCustomers(customerResult);
      setVehicles(vehicleResult);
      setAppointments(appointmentResult);
      setServices(serviceResult);
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
        setMechanics([]);
        setStatus("error");
        setErrorMessage(error.message);
      }
      return { ok: false, error };
    }
  }, [api]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

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

  async function saveService(id, values) {
    if (!api || mutating) throw new Error("Another change is still in progress.");
    setMutating(true);
    try {
      if (id === null) await api.addService(values);
      else await api.updateService(id, values);
      await refreshAfterWrite(id === null ? "Service added." : "Service changes saved.");
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
    if (!changed) {
      const refresh = await loadRecords();
      if (refresh.ok && storageResult.ok) showNotice("API settings saved and records reloaded.");
    }
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
      const message = target.type === "customer" && error instanceof ApiError && error.status === 409
        ? "This customer still has registered vehicles. Reassign or delete those vehicles first."
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

  return (
    <>
      <WorkshopShell activeTab={activeTab} counts={{ customers: customers.length, vehicles: vehicles.length, appointments: appointments.length, services: services.length, mechanics: mechanics.length }} status={status} mutating={mutating} onNavigate={setActiveTab} onOpenSettings={openSettings}>
      <main id="main-content" tabIndex={-1}>
        {notice && <div className="notice-container"><Notice notice={notice} /></div>}
        <DashboardSection active={activeTab === "dashboard"} status={status} errorMessage={errorMessage} customers={customers} vehicles={vehicles} services={services} mechanics={mechanics} appointments={appointments} busy={busy} onRetry={loadRecords} onOpenSettings={openSettings} onNavigate={setActiveTab} />
        <CustomersSection
          active={activeTab === "customers"}
          status={status}
          errorMessage={errorMessage}
          customers={customers}
          busy={busy}
          onOpenSettings={openSettings}
          onRetry={loadRecords}
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
          ownerFilter={ownerFilter}
          busy={busy}
          onOwnerFilterChange={setOwnerFilter}
          onOpenSettings={openSettings}
          onRetry={loadRecords}
          onSave={saveVehicle}
          onDelete={askToDelete}
          onAddCustomer={goToCustomers}
        />
        <AppointmentsSection
          active={activeTab === "appointments"}
          connectionStatus={status}
          errorMessage={errorMessage}
          customers={customers}
          vehicles={vehicles}
          appointments={appointments}
          services={services}
          mechanics={mechanics}
          onAssignMechanic={assignMechanic}
          onAddMechanic={() => { setActiveTab("mechanics"); window.requestAnimationFrame(() => document.getElementById("mechanics-nav")?.focus()); }}
          busy={busy}
          onOpenSettings={openSettings}
          onRetry={loadRecords}
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
          onRetry={loadRecords}
          onSave={saveService}
        />
        <MechanicsSection active={activeTab === "mechanics"} status={status} errorMessage={errorMessage} mechanics={mechanics} busy={busy} onOpenSettings={openSettings} onRetry={loadRecords} onSave={saveMechanic} />
      </main>
      </WorkshopShell>

      <SettingsDialog open={settingsOpen} initialValue={apiBaseUrl} busy={mutating} onClose={closeSettings} onSave={saveSettings} />
      <DeleteDialog target={deleteTarget} error={deleteError} busy={mutating} onClose={closeDeleteDialog} onConfirm={confirmDelete} />
    </>
  );
}

export default App;
