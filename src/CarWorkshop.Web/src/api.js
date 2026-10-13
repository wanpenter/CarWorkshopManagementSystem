export const API_STORAGE_KEY = "car-workshop-api-base-url";
export const FALLBACK_API_BASE_URL = "http://localhost:5272";
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
  fallbackUrl = FALLBACK_API_BASE_URL,
  pageUrl = "http://localhost"
} = {}) {
  let storageError = false;
  let storedValue = null;
  try {
    storedValue = storage?.getItem(API_STORAGE_KEY) ?? null;
  } catch {
    storageError = true;
  }

  for (const [source, candidate] of [
    ["storage", storedValue],
    ["environment", environmentUrl],
    ["fallback", fallbackUrl]
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

export const APPOINTMENT_STATUSES = Object.freeze(["Scheduled", "InProgress", "Completed", "Cancelled"]);

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
  const scheduledAtUtc = toUtcIso(values?.scheduledAtLocal ?? values?.scheduledAtUtc);
  const serviceType = String(values?.serviceType ?? "").trim();
  const notesText = String(values?.notes ?? "").trim();
  const status = String(values?.status ?? "Scheduled");
  const errors = {};

  if (!Number.isInteger(customerId) || customerId <= 0) errors.customerId = "Choose a customer.";
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = "Choose one of the customer's vehicles.";
  if (!scheduledAtUtc) errors.scheduledAtUtc = "Choose a valid appointment date and time.";
  if (!serviceType) errors.serviceType = "Enter the service required.";
  else if (serviceType.length > 100) errors.serviceType = "Service type must be 100 characters or fewer.";
  if (notesText.length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  if (includeStatus && !APPOINTMENT_STATUSES.includes(status)) errors.status = "Choose a valid appointment status.";
  if (scheduledAtUtc && status === "Scheduled" && Date.parse(scheduledAtUtc) <= now.getTime()) {
    errors.scheduledAtUtc = "Scheduled appointments must be in the future.";
  }

  return {
    values: {
      customerId,
      vehicleId,
      scheduledAtUtc,
      serviceType,
      notes: notesText || null,
      ...(includeStatus ? { status } : {})
    },
    errors,
    valid: Object.keys(errors).length === 0
  };
}

const FIELD_NAMES = {
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
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}
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
      const response = await fetchImpl(`${requestBaseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const responseBody = await readJsonResponse(response);
      if (!response.ok) {
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
    updateAppointment: (id, appointment, { signal } = {}) => request(`/api/appointments/${id}`, { method: "PUT", body: appointment, signal })
  });
}
