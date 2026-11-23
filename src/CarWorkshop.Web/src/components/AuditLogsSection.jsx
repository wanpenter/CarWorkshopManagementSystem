import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api.js";
import { MobileDatum, StatePanel, TableCell, TableHead } from "./Shared.jsx";

const ENTITY_TYPES = ["Appointment", "Customer", "Vehicle", "Service", "Mechanic", "User"];
const PAGE_SIZE = 20;

const dateTimeFormat = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur"
});

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : `${dateTimeFormat.format(date)} MYT`;
}

function formatActionLabel(action) {
  const value = String(action ?? "");
  const parts = value.split(".");
  const verb = parts[1] ?? parts[0] ?? value;
  return verb.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function actionTone(action) {
  const value = String(action ?? "");
  if (value.includes("Deleted") || value.includes("Failed") || value.includes("Locked")) return "text-danger";
  if (value.includes("Created") || value.includes("ServiceRecorded")) return "text-success";
  return "text-rust-dark";
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatFieldName(key) {
  return String(key)
    .replace(/Utc$/i, " (UTC)")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function ChangeDiff({ oldValues, newValues }) {
  const keys = useMemo(() => {
    const oldObj = oldValues && typeof oldValues === "object" && !Array.isArray(oldValues) ? oldValues : {};
    const newObj = newValues && typeof newValues === "object" && !Array.isArray(newValues) ? newValues : {};
    return [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])];
  }, [oldValues, newValues]);

  if (keys.length === 0) {
    return <p className="text-sm text-ink-soft">No field-level snapshot recorded for this event.</p>;
  }

  const hasOld = Boolean(oldValues && typeof oldValues === "object");
  const hasNew = Boolean(newValues && typeof newValues === "object");

  return (
    <div className="divide-y divide-paper-line rounded-sm border border-paper-line bg-paper">
      {keys.map((key) => {
        const before = hasOld ? formatFieldValue(oldValues[key]) : null;
        const after = hasNew ? formatFieldValue(newValues[key]) : null;
        const changed = hasOld && hasNew && before !== after;
        return (
          <div key={key} className={`px-3 py-2.5 text-xs ${changed ? "bg-rust-soft/60" : ""}`}>
            <div className="font-bold text-ink">{formatFieldName(key)}</div>
            {hasOld && hasNew ? (
              <div className="mt-1 space-y-0.5 [overflow-wrap:anywhere]">
                {changed ? (
                  <>
                    <div className="text-ink-soft line-through">{before}</div>
                    <div className="font-semibold text-ink">{after}</div>
                  </>
                ) : (
                  <div className="text-ink-soft">{after}</div>
                )}
              </div>
            ) : (
              <div className="mt-1 text-ink-soft [overflow-wrap:anywhere]">{hasNew ? after : before}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLogsSection({ active, api, onSessionExpired, onNotify }) {
  const [result, setResult] = useState({ items: [], page: 1, pageSize: PAGE_SIZE, totalCount: 0, totalPages: 0 });
  const [loadStatus, setLoadStatus] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const [entityType, setEntityType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const abortRef = useRef(null);
  const inspectorRef = useRef(null);
  const inspectorTitleRef = useRef(null);

  const selectedEntry = useMemo(
    () => result.items.find((entry) => entry.id === selectedId) ?? null,
    [result.items, selectedId]
  );

  const loadLogs = useCallback(async ({ targetPage = page, targetEntity = entityType, targetSearch = appliedSearch, announce = false } = {}) => {
    if (!api) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadStatus("loading");
    setLoadError("");
    try {
      const response = await api.getAuditLogs({
        entityType: targetEntity || undefined,
        search: targetSearch || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      const items = Array.isArray(response?.items) ? response.items : [];
      setResult({
        items,
        page: Number(response?.page) || targetPage,
        pageSize: Number(response?.pageSize) || PAGE_SIZE,
        totalCount: Number(response?.totalCount) || 0,
        totalPages: Number(response?.totalPages) || 0
      });
      setSelectedId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      setLoadStatus("ready");
      if (announce) onNotify?.("Audit logs refreshed.");
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      if (error?.status === 401) {
        onSessionExpired?.();
        return;
      }
      setLoadError(error instanceof ApiError ? error.message : "Audit logs could not be loaded. Try again.");
      setLoadStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [api, appliedSearch, entityType, onNotify, onSessionExpired, page]);

  useEffect(() => {
    if (!active) return undefined;
    void loadLogs({ targetPage: page, targetEntity: entityType, targetSearch: appliedSearch });
    return undefined;
  }, [active, page, entityType, appliedSearch, loadLogs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function applySearch(event) {
    event.preventDefault();
    const cleaned = searchInput.trim();
    if (cleaned === appliedSearch && page === 1) {
      void loadLogs({ targetPage: 1, targetEntity: entityType, targetSearch: cleaned });
      return;
    }
    setPage(1);
    setAppliedSearch(cleaned);
  }

  function clearFilters() {
    setEntityType("");
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  }

  function inspectEntry(entry) {
    setSelectedId(entry.id);
    inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.requestAnimationFrame(() => inspectorTitleRef.current?.focus({ preventScroll: true }));
  }

  if (!active) return null;

  const hasFilters = Boolean(entityType || appliedSearch);
  const startRow = result.totalCount === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const endRow = Math.min(result.totalCount, result.page * result.pageSize);
  const canGoPrev = result.page > 1 && loadStatus !== "loading";
  const canGoNext = result.page < result.totalPages && loadStatus !== "loading";

  return (
    <section className="workspace-grid" aria-labelledby="audit-title">
      <div className="records-panel">
        <div className="records-heading">
          <div>
            <h1 id="audit-title" className="page-title" tabIndex={-1}>Audit log</h1>
            <p className="mt-3 max-w-[65ch] text-ink-soft">
              Read-only record of workshop changes, status updates, mechanic assignments, and account security events.
            </p>
          </div>
          <button
            className="button button-secondary shrink-0 max-[500px]:w-full"
            type="button"
            disabled={loadStatus === "loading"}
            onClick={() => void loadLogs({ announce: true })}
          >
            {loadStatus === "loading" ? "Reloading..." : "Reload logs"}
          </button>
        </div>

        <form className="filter-row filter-row-wide" onSubmit={applySearch}>
          <div>
            <label className="mb-2 block font-bold" htmlFor="audit-search">Search audit log</label>
            <div className="flex gap-2">
              <input
                id="audit-search"
                className="control-input"
                type="search"
                placeholder="Username, summary, action, or record ID"
                autoComplete="off"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button className="button button-secondary shrink-0" type="submit" disabled={loadStatus === "loading"}>
                Search
              </button>
            </div>
          </div>
          <div>
            <label className="mb-2 block font-bold" htmlFor="audit-entity-filter">Record type</label>
            <select
              id="audit-entity-filter"
              className="control-input"
              value={entityType}
              disabled={loadStatus === "loading"}
              onChange={(event) => { setEntityType(event.target.value); setPage(1); }}
            >
              <option value="">All record types</option>
              {ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </form>

        {loadStatus === "loading" && result.items.length === 0 ? (
          <StatePanel loading title="Loading audit logs" body="Getting the latest workshop activity from the API." />
        ) : loadStatus === "error" ? (
          <StatePanel error title="Audit logs could not be loaded" body={loadError}>
            <button className="button button-primary" type="button" onClick={() => void loadLogs({ announce: true })}>
              Try again
            </button>
          </StatePanel>
        ) : result.items.length === 0 ? (
          <StatePanel
            compact
            title={hasFilters ? "No matching audit events" : "No audit events recorded yet"}
            body={hasFilters ? "Clear the search or record type filter to see all recorded activity." : "Workshop changes will appear here automatically as staff work."}
          >
            {hasFilters && <button className="button button-quiet" type="button" onClick={clearFilters}>Clear filters</button>}
          </StatePanel>
        ) : (
          <>
            <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
              <table className="w-full min-w-210 border-collapse tabular-nums">
                <thead>
                  <tr>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((entry) => (
                    <tr key={entry.id} className={entry.id === selectedId ? "bg-selected" : "transition-colors hover:bg-selected"}>
                      <TableCell className="whitespace-nowrap text-xs font-semibold">{formatTimestamp(entry.createdAtUtc)}</TableCell>
                      <TableCell>
                        <strong className="block">{entry.actorUsername}</strong>
                        <span className="text-xs text-ink-soft">{entry.actorRole}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`status-text ${actionTone(entry.action)}`}>{formatActionLabel(entry.action)}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}
                      </TableCell>
                      <TableCell className="max-w-72 [overflow-wrap:anywhere]">{entry.summary}</TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => inspectEntry(entry)}
                          aria-label={`Inspect audit event #${entry.id}`}
                        >
                          Inspect
                        </button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 desk:hidden">
              {result.items.map((entry) => (
                <article
                  key={entry.id}
                  className={`record-card ${entry.id === selectedId ? "border-line-strong bg-selected" : "border-paper-line bg-paper-raised"}`}
                >
                  <MobileDatum label="When"><strong>{formatTimestamp(entry.createdAtUtc)}</strong></MobileDatum>
                  <MobileDatum label="Actor">{entry.actorUsername} ({entry.actorRole})</MobileDatum>
                  <MobileDatum label="Action"><span className={actionTone(entry.action)}>{formatActionLabel(entry.action)}</span></MobileDatum>
                  <MobileDatum label="Target">{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</MobileDatum>
                  <MobileDatum label="Summary">{entry.summary}</MobileDatum>
                  <div className="mt-2 border-t border-paper-line pt-2">
                    <button type="button" className="row-action" onClick={() => inspectEntry(entry)}>Inspect details</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-4 text-sm">
              <span className="text-ink-soft tabular-nums">
                Showing {startRow}–{endRow} of {result.totalCount} events (Page {result.page} of {Math.max(1, result.totalPages)})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!canGoPrev}
                  title={!canGoPrev ? "You are on the first page" : undefined}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!canGoNext}
                  title={!canGoNext ? "You are on the last page" : undefined}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <aside ref={inspectorRef} className="editor-panel" aria-labelledby="audit-inspector-title">
        <div className="mb-7">
          <h2 ref={inspectorTitleRef} id="audit-inspector-title" tabIndex={-1} className="editor-title">
            {selectedEntry ? `Event #${selectedEntry.id}` : "Event details"}
          </h2>
          <p className="mt-2 text-ink-soft">
            {selectedEntry ? "Append-only audit snapshot." : "Select an audit event to view its before and after values."}
          </p>
        </div>

        {selectedEntry ? (
          <div className="space-y-4">
            <div className="readonly-banner" role="note">
              <strong className="block font-semibold">{selectedEntry.action}</strong>
              <span className="mt-0.5 block text-ink-soft">{selectedEntry.summary}</span>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">When</dt>
                <dd className="mt-0.5 font-medium">{formatTimestamp(selectedEntry.createdAtUtc)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Actor</dt>
                <dd className="mt-0.5 font-medium">
                  {selectedEntry.actorUsername} · {selectedEntry.actorRole}
                  {selectedEntry.userId ? ` (User #${selectedEntry.userId})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">Target record</dt>
                <dd className="mt-0.5 font-medium">
                  {selectedEntry.entityType}{selectedEntry.entityId ? ` #${selectedEntry.entityId}` : ""}
                </dd>
              </div>
            </dl>

            <div className="border-t border-paper-line pt-4">
              <h3 className="mb-2.5 text-xs font-bold tracking-[0.06em] text-ink-soft uppercase">
                Recorded values {selectedEntry.oldValues && selectedEntry.newValues ? "(Before → After)" : ""}
              </h3>
              <ChangeDiff oldValues={selectedEntry.oldValues} newValues={selectedEntry.newValues} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No event selected yet.</p>
        )}
      </aside>
    </section>
  );
}
