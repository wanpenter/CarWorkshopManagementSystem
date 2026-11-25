import { useEffect, useMemo, useRef, useState } from "react";
import { getProblemFieldErrors, validatePart } from "../api.js";
import { FormError, MobileDatum, ResultsBar, StatePanel, TableCell, TableHead, TextAreaField, TextField } from "./Shared.jsx";

const emptyForm = {
  sku: "",
  name: "",
  description: "",
  unitPrice: "",
  stockQuantity: "0",
  lowStockThreshold: "5",
  isActive: true
};

const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);

export default function PartsSection({
  active,
  status,
  errorMessage,
  parts,
  busy,
  onOpenSettings,
  onRetry,
  onSave,
  onAdjustStock
}) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "" });
  const [adjustErrors, setAdjustErrors] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const editorPanelRef = useRef(null);
  const skuRef = useRef(null);
  const deltaRef = useRef(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return parts.filter((part) => {
      if (!showInactive && !part.isActive) return false;
      if (lowStockOnly && !part.isLowStock) return false;
      if (!q) return true;
      return `${part.sku ?? ""} ${part.name ?? ""} ${part.description ?? ""}`.toLocaleLowerCase().includes(q);
    });
  }, [parts, showInactive, lowStockOnly, query]);

  const lowStockCount = useMemo(
    () => parts.filter((part) => part.isActive && part.isLowStock).length,
    [parts]
  );

  const adjustingPart = useMemo(
    () => adjustingId === null ? null : parts.find((part) => Number(part.id) === adjustingId) ?? null,
    [parts, adjustingId]
  );

  useEffect(() => {
    if (selectedId !== null && !parts.some((part) => Number(part.id) === selectedId)) {
      setSelectedId(null);
      setForm(emptyForm);
    }
    if (adjustingId !== null && !parts.some((part) => Number(part.id) === adjustingId)) {
      setAdjustingId(null);
      setAdjustForm({ delta: "", reason: "" });
    }
  }, [parts, selectedId, adjustingId]);

  function edit(part) {
    setAdjustingId(null);
    setSelectedId(Number(part.id));
    setForm({
      sku: part.sku ?? "",
      name: part.name ?? "",
      description: part.description ?? "",
      unitPrice: String(part.unitPrice ?? ""),
      stockQuantity: String(part.stockQuantity ?? 0),
      lowStockThreshold: String(part.lowStockThreshold ?? 5),
      isActive: part.isActive !== false
    });
    setErrors({});
    editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.requestAnimationFrame(() => skuRef.current?.focus({ preventScroll: true }));
  }

  function openAdjust(part) {
    setSelectedId(null);
    setAdjustingId(Number(part.id));
    setAdjustForm({ delta: "", reason: "" });
    setAdjustErrors({});
    editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.requestAnimationFrame(() => deltaRef.current?.focus({ preventScroll: true }));
  }

  function reset() {
    setSelectedId(null);
    setAdjustingId(null);
    setForm(emptyForm);
    setErrors({});
    setAdjustForm({ delta: "", reason: "" });
    setAdjustErrors({});
    window.requestAnimationFrame(() => skuRef.current?.focus());
  }

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  async function submitPart(event) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    const isNew = selectedId === null;
    const checked = validatePart(form, { includeStock: isNew });
    if (!checked.valid) {
      setErrors(checked.errors);
      if (checked.errors.sku) window.requestAnimationFrame(() => skuRef.current?.focus());
      return;
    }
    try {
      await onSave(selectedId, checked.values);
      reset();
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  async function submitAdjust(event) {
    event.preventDefault();
    if (busy || status !== "ready" || !adjustingPart) return;
    const delta = Number(adjustForm.delta);
    const reason = adjustForm.reason.trim();
    const nextErrors = {};
    if (!Number.isInteger(delta) || delta === 0) {
      nextErrors.delta = "Enter a whole non-zero change (e.g. 10 to add, -2 to deduct).";
    } else if (adjustingPart.stockQuantity + delta < 0) {
      nextErrors.delta = `Stock cannot go below 0 (current stock: ${adjustingPart.stockQuantity}).`;
    }
    if (reason.length > 200) {
      nextErrors.reason = "Reason must be 200 characters or fewer.";
    }
    if (Object.keys(nextErrors).length) {
      setAdjustErrors(nextErrors);
      return;
    }

    setAdjustErrors({});
    try {
      await onAdjustStock(adjustingPart.id, { delta, reason: reason || null });
      setAdjustForm({ delta: "", reason: "" });
      setAdjustingId(null);
    } catch (error) {
      const fields = getProblemFieldErrors(error);
      setAdjustErrors(Object.keys(fields).length ? fields : { form: error.message });
    }
  }

  const hasFilters = Boolean(query || !showInactive || lowStockOnly);

  return (
    <section hidden={!active} aria-labelledby="parts-title">
      <div className="workspace-grid">
        <div className="records-panel">
          <div className="records-heading">
            <div>
              <h1 id="parts-title" className="page-title" tabIndex={-1}>Parts &amp; inventory</h1>
              <p className="mt-3 max-w-[65ch] text-ink-soft">
                Track workshop spare parts, unit pricing, and stock levels. Adding parts to a job automatically deducts stock.
              </p>
            </div>
            <button
              className="button button-secondary shrink-0 max-[500px]:w-full"
              type="button"
              disabled={busy || status !== "ready"}
              onClick={() => void onRetry()}
            >
              {status === "loading" ? "Reloading..." : "Reload records"}
            </button>
          </div>

          {status === "ready" && lowStockCount > 0 && (
            <div className="capacity-strip" role="status">
              <div>
                <strong className="text-rust-dark">{lowStockCount} low-stock {lowStockCount === 1 ? "part" : "parts"}</strong>
                <span className="ml-2 text-ink-soft">At or below alert threshold</span>
              </div>
              <button
                type="button"
                className="row-action text-rust-dark"
                onClick={() => setLowStockOnly((current) => !current)}
              >
                {lowStockOnly ? "Show all parts" : "Filter low stock"}
              </button>
            </div>
          )}

          <div className="parts-filters">
            <div>
              <label className="mb-2 block font-bold" htmlFor="part-search">Search parts</label>
              <input
                id="part-search"
                className="control-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SKU, name, or description"
                disabled={status !== "ready"}
              />
            </div>
            <label className="inline-flex min-h-11 items-center gap-2.5 font-semibold">
              <input
                className="size-5 accent-rust"
                type="checkbox"
                checked={lowStockOnly}
                onChange={(event) => setLowStockOnly(event.target.checked)}
                disabled={status !== "ready"}
              />
              Low stock only
            </label>
            <label className="inline-flex min-h-11 items-center gap-2.5 font-semibold">
              <input
                className="size-5 accent-rust"
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                disabled={status !== "ready"}
              />
              Show inactive
            </label>
          </div>

          {status === "ready" && parts.length > 0 && (
            <ResultsBar
              visibleCount={visible.length}
              totalCount={parts.length}
              noun="part"
              hasFilters={hasFilters}
              onClearFilters={() => { setQuery(""); setShowInactive(true); setLowStockOnly(false); }}
            />
          )}

          {status === "disconnected" ? (
            <StatePanel title="Connect your workshop API" body="Add the backend address to load parts inventory.">
              <button className="button button-primary" type="button" onClick={onOpenSettings}>Set API address</button>
            </StatePanel>
          ) : status === "loading" ? (
            <StatePanel loading title="Loading spare parts" body="Waiting for the C# API." />
          ) : status === "error" ? (
            <StatePanel error title="The API could not be reached" body={errorMessage}>
              <button className="button button-primary" type="button" onClick={() => void onRetry()}>Try connection again</button>
            </StatePanel>
          ) : parts.length === 0 ? (
            <StatePanel title="No spare parts yet" body="Add your first spare part to track stock and include parts on job invoices.">
              <button className="button button-primary" type="button" onClick={reset}>Add first part</button>
            </StatePanel>
          ) : visible.length === 0 ? (
            <StatePanel compact title="No matching parts" body="Change your search or filters to see all spare parts.">
              <button className="button button-quiet" type="button" onClick={() => { setQuery(""); setShowInactive(true); setLowStockOnly(false); }}>
                Clear filters
              </button>
            </StatePanel>
          ) : (
            <>
              <div className="hidden overflow-x-auto border-b border-line-strong desk:block">
                <table className="w-full border-collapse tabular-nums">
                  <thead>
                    <tr>
                      <TableHead>Part &amp; SKU</TableHead>
                      <TableHead>Unit price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((part) => (
                      <tr
                        key={part.id}
                        className={selectedId === Number(part.id) || adjustingId === Number(part.id) ? "bg-selected" : "transition-colors hover:bg-selected"}
                      >
                        <TableCell>
                          <strong className="block">{part.name}</strong>
                          <span className="mt-0.5 block text-xs text-ink-soft">
                            <span className="font-semibold text-ink">{part.sku}</span>
                            {part.description ? ` · ${part.description}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{money(part.unitPrice)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className={part.stockQuantity === 0 ? "text-danger" : ""}>{part.stockQuantity}</strong>
                            {part.isLowStock && (
                              <span className={`status-text ${part.stockQuantity === 0 ? "pill-danger" : "pill-rust"}`}>
                                {part.stockQuantity === 0 ? "Out" : "Low"}
                              </span>
                            )}
                          </div>
                          <span className="mt-0.5 block text-xs text-ink-soft">Alert ≤ {part.lowStockThreshold}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`status-text ${part.isActive ? "pill-success" : "pill-muted"}`}>
                            {part.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <button className="row-action" type="button" disabled={busy} onClick={() => openAdjust(part)}>
                              Stock
                            </button>
                            <button className="row-action" type="button" disabled={busy} onClick={() => edit(part)}>
                              Edit
                            </button>
                          </div>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 desk:hidden">
                {visible.map((part) => (
                  <article key={part.id} className="record-card border-paper-line bg-paper-raised">
                    <h2 className="font-display text-lg font-bold">{part.name}</h2>
                    <p className="mt-0.5 text-xs font-semibold text-ink-soft">{part.sku}</p>
                    {part.description && <p className="my-2 text-ink-soft">{part.description}</p>}
                    <MobileDatum label="Unit price">{money(part.unitPrice)}</MobileDatum>
                    <MobileDatum label="Stock">
                      <span>{part.stockQuantity} (alert ≤ {part.lowStockThreshold})</span>
                      {part.isLowStock && (
                        <span className={`ml-2 status-text ${part.stockQuantity === 0 ? "pill-danger" : "pill-rust"}`}>
                          {part.stockQuantity === 0 ? "Out" : "Low"}
                        </span>
                      )}
                    </MobileDatum>
                    <MobileDatum label="Status">
                      <span className={`status-text ${part.isActive ? "pill-success" : "pill-muted"}`}>
                        {part.isActive ? "Active" : "Inactive"}
                      </span>
                    </MobileDatum>
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-paper-line pt-2">
                      <button className="row-action" type="button" disabled={busy} onClick={() => openAdjust(part)}>Adjust stock</button>
                      <button className="row-action" type="button" disabled={busy} onClick={() => edit(part)}>Edit</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <aside ref={editorPanelRef} className="editor-panel" aria-labelledby="part-editor-title">
          {adjustingPart ? (
            <>
              <div className="mb-7">
                <h2 id="part-editor-title" className="editor-title">Adjust stock</h2>
                <p className="mt-2 text-ink-soft">
                  <strong>{adjustingPart.name}</strong> ({adjustingPart.sku}) · Currently <strong>{adjustingPart.stockQuantity}</strong> in stock.
                </p>
              </div>
              <form onSubmit={submitAdjust} noValidate>
                <fieldset disabled={status !== "ready" || busy} className="m-0 min-w-0 border-0 p-0">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {[10, 5, 1, -1].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setAdjustForm((c) => ({ ...c, delta: String(preset) }));
                          setAdjustErrors((e) => ({ ...e, delta: undefined, form: undefined }));
                        }}
                      >
                        {preset > 0 ? `+${preset}` : preset}
                      </button>
                    ))}
                  </div>
                  <TextField
                    ref={deltaRef}
                    id="partStockDelta"
                    label="Quantity change (+ add / - deduct)"
                    type="number"
                    inputMode="numeric"
                    value={adjustForm.delta}
                    error={adjustErrors.delta}
                    help={Number.isInteger(Number(adjustForm.delta)) && adjustForm.delta !== ""
                      ? `New stock after save: ${adjustingPart.stockQuantity + Number(adjustForm.delta)}`
                      : "Enter a positive number for restock or negative number for write-off."}
                    onChange={(_, value) => {
                      setAdjustForm((c) => ({ ...c, delta: value }));
                      setAdjustErrors((e) => ({ ...e, delta: undefined, form: undefined }));
                    }}
                  />
                  <TextField
                    id="partStockReason"
                    label="Reason (optional)"
                    value={adjustForm.reason}
                    maxLength={200}
                    placeholder="e.g. Supplier delivery, damaged unit"
                    error={adjustErrors.reason}
                    onChange={(_, value) => {
                      setAdjustForm((c) => ({ ...c, reason: value }));
                      setAdjustErrors((e) => ({ ...e, reason: undefined, form: undefined }));
                    }}
                  />
                  <FormError message={adjustErrors.form} />
                  <div className="form-actions">
                    <button className="button button-primary" type="submit">
                      {busy ? "Updating..." : "Save adjustment"}
                    </button>
                    <button className="button button-quiet" type="button" onClick={reset}>
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            </>
          ) : (
            <>
              <div className="mb-7">
                <h2 id="part-editor-title" className="editor-title">
                  {selectedId === null ? "Add a spare part" : "Edit spare part"}
                </h2>
                <p className="mt-2 text-ink-soft">
                  {selectedId === null
                    ? "New parts can be added to in-progress or completed jobs."
                    : "Price changes only affect future jobs; existing invoices keep their recorded prices."}
                </p>
              </div>
              <form onSubmit={submitPart} noValidate>
                <fieldset disabled={status !== "ready" || busy} className="m-0 min-w-0 border-0 p-0">
                  <TextField
                    ref={skuRef}
                    id="partSku"
                    label="SKU code"
                    value={form.sku}
                    maxLength={40}
                    placeholder="e.g. OIL-5W30-4L"
                    help="Saved in uppercase letters and numbers"
                    error={errors.sku}
                    onChange={(_, value) => change("sku", value)}
                  />
                  <TextField
                    id="partName"
                    label="Part name"
                    value={form.name}
                    maxLength={120}
                    placeholder="e.g. Fully Synthetic Oil 5W-30 (4L)"
                    error={errors.name}
                    onChange={(_, value) => change("name", value)}
                  />
                  <TextAreaField
                    id="partDescription"
                    label="Description (optional)"
                    value={form.description}
                    maxLength={500}
                    error={errors.description}
                    onChange={(_, value) => change("description", value)}
                  />
                  <div className="grid grid-cols-2 gap-x-4 max-[500px]:grid-cols-1">
                    <TextField
                      id="partUnitPrice"
                      label="Unit price (RM)"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form.unitPrice}
                      error={errors.unitPrice}
                      onChange={(_, value) => change("unitPrice", value)}
                    />
                    {selectedId === null ? (
                      <TextField
                        id="partStockQuantity"
                        label="Opening stock"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form.stockQuantity}
                        error={errors.stockQuantity}
                        onChange={(_, value) => change("stockQuantity", value)}
                      />
                    ) : (
                      <TextField
                        id="partLowStockThreshold"
                        label="Low-stock alert at"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form.lowStockThreshold}
                        error={errors.lowStockThreshold}
                        onChange={(_, value) => change("lowStockThreshold", value)}
                      />
                    )}
                  </div>
                  {selectedId === null && (
                    <TextField
                      id="partLowStockThreshold"
                      label="Low-stock alert at"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.lowStockThreshold}
                      help="Flag this part when stock reaches this number or lower"
                      error={errors.lowStockThreshold}
                      onChange={(_, value) => change("lowStockThreshold", value)}
                    />
                  )}
                  <label className="mb-5 flex min-h-11 items-center gap-3 font-semibold">
                    <input
                      className="size-5 accent-rust"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => change("isActive", event.target.checked)}
                    />
                    Active in catalogue
                  </label>
                  <FormError message={errors.form} />
                  <div className="form-actions">
                    <button className="button button-primary" type="submit">
                      {busy ? "Saving..." : selectedId === null ? "Add part" : "Save changes"}
                    </button>
                    {selectedId !== null && (
                      <button className="button button-quiet" type="button" onClick={reset}>
                        Cancel edit
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
            </>
          )}
          {status !== "ready" && (
            <p className="mt-6 border-t border-paper-line pt-4 text-ink-soft">
              The editor unlocks after the API connects successfully.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
