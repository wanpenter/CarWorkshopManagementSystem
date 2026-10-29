export const API_STORAGE_KEY = "car-workshop-api-base-url";
export const FALLBACK_API_BASE_URL = "http://localhost";
const LEGACY_LOCAL_API_BASE_URLS = new Set(["http://localhost:5272", "http://127.0.0.1:5272"]);
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(message, { status = null, problem = null, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export function validateApiBaseUrl(value, { pageUrl = "http://localhost" } = {}) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter the API base URL." };

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a complete URL starting with http:// or https://." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Use an address starting with http:// or https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Remove credentials from the API address." };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: "Remove query text and fragments from the API address." };
  }

  let currentPage;
  try {
    currentPage = new URL(pageUrl);
  } catch {
    currentPage = null;
  }
  if (currentPage?.protocol === "https:" && parsed.protocol === "http:") {
    return { ok: false, error: "This HTTPS page cannot call an HTTP API. Use an HTTPS API address." };
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return {
    ok: true,
    value: `${parsed.origin}${normalizedPath === "/" ? "" : normalizedPath}`
  };
}

export function resolveInitialApiBaseUrl({
  storage,
  environmentUrl,
  fallbackUrl,
  pageUrl = "http://localhost"
} = {}) {
  let storageError = false;
  let storedValue = null;
  try {
    storedValue = storage?.getItem(API_STORAGE_KEY) ?? null;
  } catch {
    storageError = true;
  }

  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    page = null;
  }
  const isLocalVitePage = page?.port === "4173" && ["localhost", "127.0.0.1"].includes(page.hostname);
  if (isLocalVitePage && LEGACY_LOCAL_API_BASE_URLS.has(storedValue?.replace(/\/+$/, ""))) {
    storedValue = null;
  }

  for (const [source, candidate] of [
    ["storage", storedValue],
    ["environment", environmentUrl],
    ["fallback", fallbackUrl ?? page?.origin ?? FALLBACK_API_BASE_URL]
  ]) {
    if (!candidate) continue;
    const validation = validateApiBaseUrl(candidate, { pageUrl });
    if (validation.ok) {
      return {
        url: validation.value,
        source,
        storageError,
        invalidStoredValue: source !== "storage" && Boolean(storedValue)
      };
    }
  }

  return { url: "", source: "none", storageError, invalidStoredValue: Boolean(storedValue) };
}

export function saveApiBaseUrl(storage, value) {
  if (!storage || typeof storage.setItem !== "function") {
    return { ok: false, error: "The API address works for this session, but this browser could not save it." };
  }
  try {
    storage.setItem(API_STORAGE_KEY, value);
    return { ok: true };
  } catch {
    return { ok: false, error: "The API address works for this session, but this browser could not save it." };
  }
}

export function canonicalizeRegistration(value) {
  return String(value ?? "").toUpperCase().replace(/[\s-]+/g, "");
}

export function validateCustomer(values) {
  const fullName = String(values?.fullName ?? "").trim();
  const phone = String(values?.phone ?? "").trim();
  const addressText = String(values?.address ?? "").trim();
  const digits = phone.replace(/\D/g, "");
  const errors = {};

  if (!fullName) errors.fullName = "Enter the customer's full name.";
  else if (fullName.length > 100) errors.fullName = "Full name must be 100 characters or fewer.";

  if (!phone) errors.phone = "Enter the customer's phone number.";
  else if (!/^\+?[\d\s()-]+$/.test(phone)) errors.phone = "Use digits, spaces, +, brackets, or hyphens only.";
  else if (digits.length < 7 || digits.length > 15) errors.phone = "Phone number must contain 7 to 15 digits.";

  if (addressText.length > 500) errors.address = "Address must be 500 characters or fewer.";

  return {
    values: { fullName, phone, address: addressText || null },
    errors,
    valid: Object.keys(errors).length === 0
  };
}

export function validateMechanic(values) {
  const checked = validateCustomer(values);
  const { fullName, phone } = checked.values;
  const errors = { ...checked.errors };
  delete errors.address;
  if (!fullName) errors.fullName = "Enter the mechanic's full name.";
  if (!phone) errors.phone = "Enter the mechanic's phone number.";
  else if (phone.length > 20) errors.phone = "Phone number must be 20 characters or fewer.";
  return { valid: Object.keys(errors).length === 0, errors, values: { fullName, phone, isActive: values?.isActive !== false } };
}

export function validateVehicle(values, { currentYear = new Date().getUTCFullYear() } = {}) {
  const customerId = Number(values?.customerId);
  const registrationNumber = canonicalizeRegistration(values?.registrationNumber);
  const make = String(values?.make ?? "").trim();
  const model = String(values?.model ?? "").trim();
  const yearText = String(values?.year ?? "").trim();
  const mileageText = String(values?.mileage ?? "").trim();
  const year = yearText === "" ? null : Number(yearText);
  const mileage = mileageText === "" ? 0 : Number(mileageText);
  const errors = {};

  if (!Number.isInteger(customerId) || customerId <= 0) errors.customerId = "Choose a vehicle owner.";
  if (!registrationNumber) errors.registrationNumber = "Enter the registration number.";
  else if (!/^[A-Z0-9]+$/.test(registrationNumber)) errors.registrationNumber = "Use letters and numbers only.";
  else if (registrationNumber.length > 20) errors.registrationNumber = "Registration number must be 20 characters or fewer.";
  if (!make) errors.make = "Enter the vehicle make.";
  else if (make.length > 50) errors.make = "Make must be 50 characters or fewer.";
  if (!model) errors.model = "Enter the vehicle model.";
  else if (model.length > 100) errors.model = "Model must be 100 characters or fewer.";
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > currentYear + 1)) {
    errors.year = `Year must be from 1900 to ${currentYear + 1}.`;
  }
  if (!Number.isInteger(mileage) || mileage < 0) errors.mileage = "Mileage must be a whole number of 0 or more.";

  return {
    values: {
      customerId,
      registrationNumber,
      make,
      model,
      year,
      mileage,
      isActive: values?.isActive !== false
    },
    errors,
    valid: Object.keys(errors).length === 0
  };
}

export const APPOINTMENT_STATUSES = Object.freeze(["Requested", "Confirmed", "Rejected", "Scheduled", "InProgress", "Completed", "Cancelled"]);
export const WORKSHOP_UTC_OFFSET_HOURS = 8;

export function toWorkshopUtcIso(value) {
  const input = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return toWorkshopDateTimeInput(parsed.toISOString()) === input ? parsed.toISOString() : null;
}

export function toWorkshopDateTimeInput(utcValue) {
  const parsed = new Date(utcValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() + WORKSHOP_UTC_OFFSET_HOURS * 3600000).toISOString().slice(0, 16);
}

export function workshopMinutes(utcValue) {
  const input = toWorkshopDateTimeInput(utcValue);
  if (!input) return null;
  return Number(input.slice(11, 13)) * 60 + Number(input.slice(14, 16));
}

export function appointmentEstimate(appointment, selectedIds, catalogue) {
  const ids = Array.isArray(selectedIds) ? selectedIds.map(Number) : [];
  const snapshots = appointment?.services ?? [];
  const originalIds = snapshots.map((service) => Number(service.serviceId));
  const unchanged = Boolean(appointment) && ids.length === originalIds.length
    && ids.every((id) => originalIds.includes(id));
  const items = ids.map((id) => {
    const snapshot = unchanged ? snapshots.find((service) => Number(service.serviceId) === id) : null;
    if (snapshot) return { id, name: snapshot.name, price: Number(snapshot.price), durationMinutes: Number(snapshot.durationMinutes) };
    const current = catalogue.find((service) => Number(service.id) === id);
    return current ? { id, name: current.name, price: Number(current.currentPrice), durationMinutes: Number(current.estimatedDurationMinutes) } : null;
  }).filter(Boolean);
  return {
    items,
    unchanged,
    totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
    totalPrice: items.reduce((sum, item) => sum + item.price, 0)
  };
}

export function toUtcIso(localValue) {
  const value = String(localValue ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toLocalDateTimeInput(utcValue) {
  const parsed = new Date(utcValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function validateAppointment(values, { now = new Date(), includeStatus = false } = {}) {
  const customerId = Number(values?.customerId);
  const vehicleId = Number(values?.vehicleId);
  const scheduledAtUtc = values?.scheduledAtLocal !== undefined
    ? toWorkshopUtcIso(values.scheduledAtLocal)
    : toUtcIso(values?.scheduledAtUtc);
  const serviceIds = Array.isArray(values?.serviceIds) ? values.serviceIds.map(Number) : [];
  const totalMinutes = Number(values?.totalMinutes ?? 0);
  const notesText = String(values?.notes ?? "").trim();
  const status = String(values?.status ?? "Requested");
  const errors = {};

  if (!Number.isInteger(customerId) || customerId <= 0) errors.customerId = "Choose a customer.";
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = "Choose one of the customer's vehicles.";
  if (!scheduledAtUtc) errors.scheduledAtUtc = "Choose a valid appointment date and time.";
  if (serviceIds.length === 0 || serviceIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(serviceIds).size !== serviceIds.length) {
    errors.serviceIds = "Choose at least one available service.";
  }
  if (notesText.length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  if (includeStatus && !APPOINTMENT_STATUSES.includes(status)) errors.status = "Choose a valid appointment status.";
  if (scheduledAtUtc && Date.parse(scheduledAtUtc) <= now.getTime() && ["Requested", "Confirmed", "Scheduled"].includes(status)) {
    errors.scheduledAtUtc = "Choose a future workshop time.";
  }
  if (scheduledAtUtc) {
    const minute = workshopMinutes(scheduledAtUtc);
    if (minute < 8 * 60 + 30 || minute >= 17 * 60 + 30 || minute % 30 !== 0) {
      errors.scheduledAtUtc = "Choose a 30-minute start between 8:30 AM and 5:00 PM (MYT).";
    } else if (totalMinutes > 0 && minute + totalMinutes > 17 * 60 + 30) {
      errors.scheduledAtUtc = "The selected services must finish by 5:30 PM (MYT).";
    }
  }

  return {
    values: {
      customerId,
      vehicleId,
      scheduledAtUtc,
      serviceIds,
      notes: notesText || null,
      ...(includeStatus ? { status } : {})
    },
    errors,
    valid: Object.keys(errors).length === 0
  };
}

const FIELD_NAMES = {
  username: "username",
  password: "password",
  currentpassword: "currentPassword",
  newpassword: "newPassword",
  role: "role",
  fullname: "fullName",
  phone: "phone",
  address: "address",
  customerid: "customerId",
  registrationnumber: "registrationNumber",
  make: "make",
  model: "model",
  year: "year",
  mileage: "mileage",
  isactive: "isActive",
  scheduledatutc: "scheduledAtUtc",
  serviceids: "serviceIds",
  name: "name",
  description: "description",
  currentprice: "currentPrice",
  estimateddurationminutes: "estimatedDurationMinutes",
  servicetype: "serviceType",
  vehicleid: "vehicleId",
  notes: "notes",
  status: "status"
};

export function getProblemFieldErrors(error) {
  const source = error?.problem?.errors;
  if (!source || typeof source !== "object") return {};

  return Object.entries(source).reduce((result, [field, messages]) => {
    const first = Array.isArray(messages)
      ? messages.find((message) => typeof message === "string" && message.trim())
      : typeof messages === "string" && messages.trim() ? messages : null;
    const leaf = field.split(".").at(-1)?.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const key = FIELD_NAMES[leaf] ?? leaf;
    if (first && key) result[key] = first;
    return result;
  }, {});
}

function problemMessage(problem, status) {
  if (typeof problem?.detail === "string" && problem.detail.trim()) return problem.detail;
  if (typeof problem?.title === "string" && problem.title.trim()) return problem.title;
  if (status === 404) return "That record no longer exists. Reload the records and try again.";
  if (status === 409) return "That change conflicts with an existing record. Reload and try again.";
  return `The API returned an error (${status}).`;
}

async function readJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createApiClient(
  baseUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, onUnauthorized } = {}
) {
  const validation = validateApiBaseUrl(baseUrl);
  if (!validation.ok) throw new TypeError(validation.error);
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const requestBaseUrl = validation.value;

  async function request(path, { method = "GET", body, signal: externalSignal } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const handleExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) handleExternalAbort();
    else externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
      const csrf = unsafe ? await request("/api/auth/csrf", { signal: controller.signal }) : null;
      if (unsafe && typeof csrf?.token !== "string") throw new ApiError("The API did not provide a security token. Reload the page and try again.");
      const response = await fetchImpl(`${requestBaseUrl}${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(unsafe ? { "X-CSRF-TOKEN": csrf.token } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const responseBody = await readJsonResponse(response);
      if (!response.ok) {
        if (response.status === 401 && !["/api/auth/login", "/api/auth/me"].includes(path)) onUnauthorized?.();
        throw new ApiError(problemMessage(responseBody, response.status), {
          status: response.status,
          problem: responseBody
        });
      }
      return responseBody;
    } catch (error) {
      if (timedOut) {
        throw new ApiError("The API took too long to respond. Confirm it is running, then try again.", { cause: error });
      }
      if (externalSignal?.aborted) throw error;
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError) {
        throw new ApiError(
          "The browser could not reach the API. Check the address, CORS settings, and whether the backend is running.",
          { cause: error }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
    }
  }

  return Object.freeze({
    baseUrl: requestBaseUrl,
    getCurrentUser: ({ signal } = {}) => request("/api/auth/me", { signal }),
    login: (values) => request("/api/auth/login", { method: "POST", body: values }),
    logout: () => request("/api/auth/logout", { method: "POST" }),
    changePassword: (values) => request("/api/auth/change-password", { method: "POST", body: values }),
    getUsers: ({ signal } = {}) => request("/api/users", { signal }),
    addUser: (values) => request("/api/users", { method: "POST", body: values }),
    updateUser: (id, values) => request(`/api/users/${id}`, { method: "PUT", body: values }),
    resetUserPassword: (id, newPassword) => request(`/api/users/${id}/reset-password`, { method: "POST", body: { newPassword } }),
    getCustomers: ({ signal } = {}) => request("/api/customers", { signal }),
    getCustomer: (id, { signal } = {}) => request(`/api/customers/${id}`, { signal }),
    addCustomer: (customer, { signal } = {}) => request("/api/customers", { method: "POST", body: customer, signal }),
    updateCustomer: (id, customer, { signal } = {}) => request(`/api/customers/${id}`, { method: "PUT", body: customer, signal }),
    deleteCustomer: (id, { signal } = {}) => request(`/api/customers/${id}`, { method: "DELETE", signal }),
    getCustomerVehicles: (id, { signal } = {}) => request(`/api/customers/${id}/vehicles`, { signal }),
    getVehicles: ({ customerId, signal } = {}) => request(`/api/vehicles${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ""}`, { signal }),
    getVehicle: (id, { signal } = {}) => request(`/api/vehicles/${id}`, { signal }),
    addVehicle: (vehicle, { signal } = {}) => request("/api/vehicles", { method: "POST", body: vehicle, signal }),
    updateVehicle: (id, vehicle, { signal } = {}) => request(`/api/vehicles/${id}`, { method: "PUT", body: vehicle, signal }),
    deleteVehicle: (id, { signal } = {}) => request(`/api/vehicles/${id}`, { method: "DELETE", signal }),
    getAppointments: ({ customerId, status, signal } = {}) => {
      const params = new URLSearchParams();
      if (customerId) params.set("customerId", customerId);
      if (status) params.set("status", status);
      const search = params.toString();
      const query = search ? `?${search}` : "";
      return request(`/api/appointments${query}`, { signal });
    },
    getAppointment: (id, { signal } = {}) => request(`/api/appointments/${id}`, { signal }),
    addAppointment: (appointment, { signal } = {}) => request("/api/appointments", { method: "POST", body: appointment, signal }),
    updateAppointment: (id, appointment, { signal } = {}) => request(`/api/appointments/${id}`, { method: "PUT", body: appointment, signal }),
    getServices: ({ signal } = {}) => request("/api/services", { signal }),
    addService: (service, { signal } = {}) => request("/api/services", { method: "POST", body: service, signal }),
    updateService: (id, service, { signal } = {}) => request(`/api/services/${id}`, { method: "PUT", body: service, signal }),
    getMechanics: ({ signal } = {}) => request("/api/mechanics", { signal }),
    addMechanic: (mechanic, { signal } = {}) => request("/api/mechanics", { method: "POST", body: mechanic, signal }),
    updateMechanic: (id, mechanic, { signal } = {}) => request(`/api/mechanics/${id}`, { method: "PUT", body: mechanic, signal }),
    assignMechanic: (id, mechanicId, { signal } = {}) => request(`/api/appointments/${id}/mechanic`, { method: "PUT", body: { mechanicId }, signal })
  });
}
