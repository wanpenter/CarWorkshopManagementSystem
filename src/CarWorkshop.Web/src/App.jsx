import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createApiClient,
  resolveInitialApiBaseUrl,
  saveApiBaseUrl,
  validateApiBaseUrl
} from "./api.js";
import CustomersSection from "./components/CustomersSection.jsx";
import { DeleteDialog, SettingsDialog } from "./components/Dialogs.jsx";
import { ConnectionStatus, Notice } from "./components/Shared.jsx";
import VehiclesSection from "./components/VehiclesSection.jsx";

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
  const [status, setStatus] = useState(apiBaseUrl ? "loading" : "disconnected");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("customers");
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
      const [customerResult, vehicleResult] = await Promise.all([
        api.getCustomers({ signal: controller.signal }),
        api.getVehicles({ signal: controller.signal })
      ]);
      if (!Array.isArray(customerResult) || !Array.isArray(vehicleResult)) {
        throw new Error("The API response did not contain customer and vehicle lists.");
      }
      if (!mountedRef.current || activeLoadRef.current.revision !== revision) return { ok: false, stale: true };
      setCustomers(customerResult);
      setVehicles(vehicleResult);
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

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to workshop records</a>
      <header className="app-header">
        <span className="font-display text-[1.08rem] font-bold">Workshop Registry</span>
        <div className="flex items-center gap-2 max-[560px]:w-full max-[560px]:justify-between">
          <ConnectionStatus status={status} />
          <button className="button button-quiet" type="button" onClick={openSettings} disabled={mutating}>API settings</button>
        </div>
      </header>

      <nav className="section-nav" aria-label="Workshop records">
        <button id="customers-nav" className="section-tab" type="button" aria-current={activeTab === "customers" ? "page" : undefined} onClick={() => setActiveTab("customers")}>Customers <span className="tab-count">{customers.length}</span></button>
        <button id="vehicles-nav" className="section-tab" type="button" aria-current={activeTab === "vehicles" ? "page" : undefined} onClick={() => setActiveTab("vehicles")}>Vehicles <span className="tab-count">{vehicles.length}</span></button>
      </nav>

      <main id="main-content">
        <div className="px-[clamp(1rem,5vw,5rem)] pt-5"><Notice notice={notice} /></div>
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
      </main>

      <SettingsDialog open={settingsOpen} initialValue={apiBaseUrl} busy={mutating} onClose={closeSettings} onSave={saveSettings} />
      <DeleteDialog target={deleteTarget} error={deleteError} busy={mutating} onClose={closeDeleteDialog} onConfirm={confirmDelete} />
    </>
  );
}

export default App;
