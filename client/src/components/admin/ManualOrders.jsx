import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import adminService from "../../services/admin.service";

const EMPTY_PERSON = {
  name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const blankForm = () => ({
  customer: { ...EMPTY_PERSON },
  sameAsBilling: true,
  shipping: { ...EMPTY_PERSON },
  saleOrder: "",
  reference: "",
  date: todayISO(),
  gstRate: "18",
  items: [],
  deliveryOption: "standard",
  shippingCost: "",
  discount: "",
  payMethod: "Cash",
  payStatus: "PAID",
  pickerCategory: "all",
  pickerBrand: "all",
  pickerSearch: "",
});

const money = (v) =>
  `Rs. ${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const composePrintDescription = (row) => {
  const bits = [
    row.material_name,
    row.color_name,
    row.infill_density ? `${row.infill_density}%` : "",
    row.surface_finish,
  ].filter(Boolean);
  return `3D Print: ${row.file_name || "model"}${bits.length ? ` — ${bits.join(" • ")}` : ""}`;
};

function ManualOrders({ categories = [], brands = [], products = [], materials = [] }) {
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setCustomer = (patch) =>
    setForm((prev) => ({ ...prev, customer: { ...prev.customer, ...patch } }));
  const setShipping = (patch) =>
    setForm((prev) => ({ ...prev, shipping: { ...prev.shipping, ...patch } }));

  const loadInvoices = async (pageArg = page, searchArg = search) => {
    setListLoading(true);
    try {
      const res = await adminService.listManualInvoices({
        page: pageArg,
        limit: perPage,
        search: searchArg,
      });
      setInvoices(res.data?.data?.invoices || []);
      setTotal(res.data?.data?.pagination?.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Unable to load manual invoices");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = useMemo(() => {
    const q = form.pickerSearch.trim().toLowerCase();
    return (products || [])
      .filter((p) => {
        const matchCat =
          form.pickerCategory === "all" || String(p.category_id) === String(form.pickerCategory);
        const matchBrand =
          form.pickerBrand === "all" || String(p.brand_id) === String(form.pickerBrand);
        const matchQ =
          !q ||
          [p.name, p.sku, p.category_name, p.brand_name]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q));
        return matchCat && matchBrand && matchQ;
      })
      .slice(0, 8);
  }, [products, form.pickerCategory, form.pickerBrand, form.pickerSearch]);

  const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const addProductRow = (p) => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: newKey(),
          item_type: "product",
          product_id: p.id,
          description: p.id ? `[${p.id}] ${p.name}` : p.name,
          hsn: "",
          rate: p.price ?? "",
          qty: 1,
          disc: "",
          file_name: "",
          material_name: "",
          color_name: "",
          infill_density: "",
          surface_finish: "standard",
        },
      ],
    }));
  };

  const addPrintRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: newKey(),
          item_type: "print",
          product_id: null,
          description: "3D Print: model",
          hsn: "",
          rate: "",
          qty: 1,
          disc: "",
          file_name: "",
          material_name: materials[0]?.name || "",
          color_name: "",
          infill_density: "50",
          surface_finish: "standard",
        },
      ],
    }));
  };

  const addCustomRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: newKey(),
          item_type: "custom",
          product_id: null,
          description: "",
          hsn: "",
          rate: "",
          qty: 1,
          disc: "",
          file_name: "",
          material_name: "",
          color_name: "",
          infill_density: "",
          surface_finish: "",
        },
      ],
    }));
  };

  const updateRow = (key, patch, recomposePrint = false) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        if (recomposePrint && next.item_type === "print" && !("description" in patch)) {
          next.description = composePrintDescription(next);
        }
        return next;
      }),
    }));
  };

  const removeRow = (key) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((it) => it.key !== key) }));
  };

  const totals = useMemo(() => {
    const rate = Number(form.gstRate) || 0;
    let subtotal = 0;
    let taxTotal = 0;
    form.items.forEach((it) => {
      const gross = (Number(it.rate) || 0) * (Number(it.qty) || 0);
      const disc = Math.min(Number(it.disc) || 0, gross);
      const amount = gross - disc;
      subtotal += amount;
      taxTotal += (amount * rate) / 100;
    });
    const ship = Number(form.shippingCost) || 0;
    const disc = Number(form.discount) || 0;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grand: Math.max(0, Math.round((subtotal + taxTotal + ship - disc) * 100) / 100),
    };
  }, [form.items, form.gstRate, form.shippingCost, form.discount]);

  const stats = useMemo(() => {
    const revenue = (invoices || []).reduce((s, inv) => s + Number(inv.grand_total || 0), 0);
    return { count: total, revenue };
  }, [invoices, total]);

  const readBlobError = async (error) => {
    try {
      const blob = error?.response?.data;
      if (blob instanceof Blob) {
        const parsed = JSON.parse(await blob.text());
        if (parsed?.message) return parsed.message;
      }
    } catch {
      /* ignore */
    }
    return error?.response?.data?.message || "Unable to save invoice";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.items.length) {
      toast.error("Add at least one item");
      return;
    }
    setSaving(true);
    try {
      const filename = await adminService.createManualInvoicePdf({
        customer: form.customer,
        shipping: form.sameAsBilling ? null : form.shipping,
        shippingSameAsBilling: form.sameAsBilling,
        invoice: { date: form.date, saleOrder: form.saleOrder, reference: form.reference },
        gstRate: Number(form.gstRate) || 0,
        items: form.items.map((it) => ({
          item_type: it.item_type,
          product_id: it.product_id || null,
          description: it.description,
          hsn: it.hsn || "",
          rate: Number(it.rate) || 0,
          qty: Number(it.qty) || 0,
          disc: Number(it.disc) || 0,
          file_name: it.file_name || "",
          material_name: it.material_name || "",
          color_name: it.color_name || "",
          infill_density: it.infill_density ? Number(it.infill_density) : null,
          surface_finish: it.surface_finish || "",
        })),
        shippingCost: Number(form.shippingCost) || 0,
        deliveryOption: form.deliveryOption,
        discount: Number(form.discount) || 0,
        payment: { methodLabel: form.payMethod, status: form.payStatus },
      });
      toast.success(`Invoice saved. ${filename} downloaded.`);
      setForm(blankForm());
      setPage(1);
      loadInvoices(1, search);
    } catch (error) {
      toast.error(await readBlobError(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = async (inv) => {
    if (expandedId === inv.id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(inv.id);
    setExpandedDetail(null);
    setExpandedLoading(true);
    try {
      const res = await adminService.getManualInvoice(inv.id);
      setExpandedDetail(res.data?.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Unable to load invoice");
      setExpandedId(null);
    } finally {
      setExpandedLoading(false);
    }
  };

  const downloadSaved = async (inv) => {
    try {
      const filename = await adminService.downloadManualInvoicePdf(inv.id);
      toast.success(`Invoice ${filename} downloaded.`);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Unable to download invoice");
    }
  };

  const deleteSaved = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return;
    try {
      await adminService.deleteManualInvoice(inv.id);
      toast.success("Invoice deleted");
      if (expandedId === inv.id) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
      loadInvoices(page, search);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Delete failed");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <section className="admin-orders-layout">
      <div className="admin-print-stats admin-orders-stats">
        <article className="admin-print-stat admin-stat-spark">
          <span className="admin-print-stat-ico blue"><FileText size={22} /></span>
          <div>
            <strong>{stats.count}</strong>
            <span className="admin-print-stat-label">Manual Invoices</span>
            <span className="admin-print-stat-sub">Saved in database</span>
          </div>
        </article>
        <article className="admin-print-stat admin-stat-spark">
          <span className="admin-print-stat-ico green"><ClipboardList size={22} /></span>
          <div>
            <strong>{money(stats.revenue)}</strong>
            <span className="admin-print-stat-label">Revenue (this page)</span>
            <span className="admin-print-stat-sub">Sum of listed invoices</span>
          </div>
        </article>
      </div>

      {/* New invoice form */}
      <div className="admin-panel admin-orders-panel">
        <div className="admin-panel-title-row">
          <div className="admin-colors-title">
            <span className="admin-orders-ico"><Plus size={22} /></span>
            <div>
              <h2>New Manual Invoice</h2>
              <p className="admin-panel-subtitle">
                Invoice number auto-generates (INV-YYYY-NNNN) and the invoice is saved in the
                database. Company &amp; terms come from Settings.
              </p>
            </div>
          </div>
        </div>

        <form className="pf-form" onSubmit={handleSubmit}>
          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Customer (Billing)</h3></div></div>
            <div className="pf-grid cols-2">
              <label className="pf-field"><span>Name <b>*</b></span>
                <input required value={form.customer.name} onChange={(e) => setCustomer({ name: e.target.value })} placeholder="Customer full name" />
              </label>
              <label className="pf-field"><span>Phone <b>*</b></span>
                <input required value={form.customer.phone} onChange={(e) => setCustomer({ phone: e.target.value })} placeholder="10-digit mobile" />
              </label>
              <label className="pf-field"><span>Email</span>
                <input type="email" value={form.customer.email} onChange={(e) => setCustomer({ email: e.target.value })} />
              </label>
              <label className="pf-field"><span>Country</span>
                <input value={form.customer.country} onChange={(e) => setCustomer({ country: e.target.value })} />
              </label>
              <label className="pf-field"><span>Address Line 1 <b>*</b></span>
                <input required value={form.customer.address1} onChange={(e) => setCustomer({ address1: e.target.value })} />
              </label>
              <label className="pf-field"><span>Address Line 2</span>
                <input value={form.customer.address2} onChange={(e) => setCustomer({ address2: e.target.value })} />
              </label>
              <label className="pf-field"><span>City <b>*</b></span>
                <input required value={form.customer.city} onChange={(e) => setCustomer({ city: e.target.value })} />
              </label>
              <label className="pf-field"><span>State <b>*</b></span>
                <input required value={form.customer.state} onChange={(e) => setCustomer({ state: e.target.value })} placeholder="West Bengal" />
              </label>
              <label className="pf-field"><span>Pincode <b>*</b></span>
                <input required value={form.customer.pincode} onChange={(e) => setCustomer({ pincode: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Shipping Address</h3></div></div>
            <label className="manual-check">
              <input type="checkbox" checked={form.sameAsBilling} onChange={(e) => set({ sameAsBilling: e.target.checked })} />
              <span>Same as billing address</span>
            </label>
            {!form.sameAsBilling && (
              <div className="pf-grid cols-2" style={{ marginTop: 14 }}>
                <label className="pf-field"><span>Name <b>*</b></span>
                  <input required value={form.shipping.name} onChange={(e) => setShipping({ name: e.target.value })} />
                </label>
                <label className="pf-field"><span>Phone <b>*</b></span>
                  <input required value={form.shipping.phone} onChange={(e) => setShipping({ phone: e.target.value })} />
                </label>
                <label className="pf-field"><span>Email</span>
                  <input type="email" value={form.shipping.email} onChange={(e) => setShipping({ email: e.target.value })} />
                </label>
                <label className="pf-field"><span>Country</span>
                  <input value={form.shipping.country} onChange={(e) => setShipping({ country: e.target.value })} />
                </label>
                <label className="pf-field"><span>Address Line 1 <b>*</b></span>
                  <input required value={form.shipping.address1} onChange={(e) => setShipping({ address1: e.target.value })} />
                </label>
                <label className="pf-field"><span>Address Line 2</span>
                  <input value={form.shipping.address2} onChange={(e) => setShipping({ address2: e.target.value })} />
                </label>
                <label className="pf-field"><span>City <b>*</b></span>
                  <input required value={form.shipping.city} onChange={(e) => setShipping({ city: e.target.value })} />
                </label>
                <label className="pf-field"><span>State <b>*</b></span>
                  <input required value={form.shipping.state} onChange={(e) => setShipping({ state: e.target.value })} />
                </label>
                <label className="pf-field"><span>Pincode <b>*</b></span>
                  <input required value={form.shipping.pincode} onChange={(e) => setShipping({ pincode: e.target.value })} />
                </label>
              </div>
            )}
          </div>

          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Invoice Details</h3></div></div>
            <div className="pf-grid cols-3">
              <label className="pf-field"><span>Invoice Date</span>
                <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label className="pf-field"><span>GST %</span>
                <input type="number" min="0" max="100" step="0.1" value={form.gstRate} onChange={(e) => set({ gstRate: e.target.value })} />
              </label>
              <label className="pf-field"><span>Delivery Option</span>
                <select value={form.deliveryOption} onChange={(e) => set({ deliveryOption: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                </select>
              </label>
            </div>
            <div className="pf-grid cols-2" style={{ marginTop: 18 }}>
              <label className="pf-field"><span>Sale Order</span>
                <input value={form.saleOrder} onChange={(e) => set({ saleOrder: e.target.value })} placeholder="Defaults to invoice number" />
              </label>
              <label className="pf-field"><span>Reference</span>
                <input value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="Defaults to invoice number" />
              </label>
              <label className="pf-field"><span>Payment Method</span>
                <select value={form.payMethod} onChange={(e) => set({ payMethod: e.target.value })}>
                  <option>Cash</option>
                  <option>Cash on Delivery</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Net Banking</option>
                  <option>Wallet</option>
                  <option>Bank Transfer</option>
                </select>
              </label>
              <label className="pf-field"><span>Payment Status</span>
                <select value={form.payStatus} onChange={(e) => set({ payStatus: e.target.value })}>
                  <option>PAID</option>
                  <option>PENDING</option>
                </select>
              </label>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head">
              <div>
                <h3>Add Items</h3>
                <p>Catalog products by category &amp; brand, custom 3D prints, or fully custom rows.</p>
              </div>
            </div>
            <div className="manual-picker-filters">
              <input placeholder="Search products..." value={form.pickerSearch} onChange={(e) => set({ pickerSearch: e.target.value })} />
              <select value={form.pickerCategory} onChange={(e) => set({ pickerCategory: e.target.value })}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={form.pickerBrand} onChange={(e) => set({ pickerBrand: e.target.value })}>
                <option value="all">All brands</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span className="manual-add-btns">
                <button type="button" className="admin-secondary" onClick={addPrintRow}><Plus size={14} /> 3D Print</button>
                <button type="button" className="admin-secondary" onClick={addCustomRow}><Plus size={14} /> Custom</button>
              </span>
            </div>
            <div className="manual-picker-list">
              {filteredProducts.length ? filteredProducts.map((p) => (
                <div key={p.id} className="manual-picker-row">
                  <div>
                    <strong>{p.name}</strong>
                    <span>{[p.category_name, p.brand_name].filter(Boolean).join(" • ")}{p.price !== undefined && ` • Rs. ${p.price}`}</span>
                  </div>
                  <button type="button" className="admin-secondary" onClick={() => addProductRow(p)}><Plus size={14} /> Add</button>
                </div>
              )) : <div className="admin-empty small">No products match — adjust filters or add a 3D print / custom row.</div>}
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Invoice Items ({form.items.length})</h3></div></div>
            {form.items.length ? (
              <div className="manual-items">
                {form.items.map((it, idx) => (
                  <div key={it.key} className={`manual-item-block type-${it.item_type}`}>
                    <div className="manual-item-top">
                      <span className="manual-item-num">{idx + 1}</span>
                      <span className={`manual-type-pill ${it.item_type}`}>
                        {it.item_type === "print" ? "3D Print" : it.item_type === "custom" ? "Custom" : "Product"}
                      </span>
                      <input
                        required
                        className="manual-desc"
                        placeholder={it.item_type === "print" ? "Description (auto from print specs)" : "Description"}
                        value={it.description}
                        onChange={(e) => updateRow(it.key, { description: e.target.value })}
                      />
                      <button type="button" aria-label="Remove item" onClick={() => removeRow(it.key)}><X size={15} /></button>
                    </div>
                    {it.item_type === "print" && (
                      <div className="manual-print-fields">
                        <input placeholder="File name *" value={it.file_name} onChange={(e) => updateRow(it.key, { file_name: e.target.value }, true)} />
                        <input placeholder="Material" list={`mat-list-${it.key}`} value={it.material_name} onChange={(e) => updateRow(it.key, { material_name: e.target.value }, true)} />
                        <datalist id={`mat-list-${it.key}`}>
                          {materials.map((m) => <option key={m.id} value={m.name} />)}
                        </datalist>
                        <input placeholder="Color" value={it.color_name} onChange={(e) => updateRow(it.key, { color_name: e.target.value }, true)} />
                        <input type="number" min="1" max="100" placeholder="Infill %" value={it.infill_density} onChange={(e) => updateRow(it.key, { infill_density: e.target.value }, true)} />
                        <select value={it.surface_finish} onChange={(e) => updateRow(it.key, { surface_finish: e.target.value }, true)}>
                          <option value="standard">Standard</option>
                          <option value="smooth">Smooth</option>
                        </select>
                      </div>
                    )}
                    <div className="manual-item-row">
                      <input placeholder="HSN" value={it.hsn} onChange={(e) => updateRow(it.key, { hsn: e.target.value })} />
                      <input required type="number" min="0" step="0.01" placeholder="Rate" value={it.rate} onChange={(e) => updateRow(it.key, { rate: e.target.value })} />
                      <input required type="number" min="1" step="1" placeholder="Qty" value={it.qty} onChange={(e) => updateRow(it.key, { qty: e.target.value })} />
                      <input type="number" min="0" step="0.01" placeholder="Disc" value={it.disc} onChange={(e) => updateRow(it.key, { disc: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="admin-empty small">No items yet — add products, 3D prints or custom rows above.</div>}
            <div className="pf-grid cols-2" style={{ marginTop: 18 }}>
              <label className="pf-field"><span>Shipping Cost (Rs.)</span>
                <input type="number" min="0" step="0.01" value={form.shippingCost} onChange={(e) => set({ shippingCost: e.target.value })} placeholder="0.00" />
              </label>
              <label className="pf-field"><span>Order Discount (Rs.)</span>
                <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => set({ discount: e.target.value })} placeholder="0.00" />
              </label>
            </div>
            <div className="manual-totals">
              <span>Subtotal <strong>Rs. {totals.subtotal.toFixed(2)}</strong></span>
              <span>Taxes ({Number(form.gstRate) || 0}%) <strong>Rs. {totals.taxTotal.toFixed(2)}</strong></span>
              <span className="grand">Total <strong>Rs. {totals.grand.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="manual-actions">
            <button type="button" className="admin-secondary" onClick={() => setForm(blankForm())} disabled={saving}>Reset</button>
            <button type="submit" className="admin-primary" disabled={saving || !form.items.length}>
              <Download size={16} />
              <span>{saving ? "Saving..." : "Save & Generate PDF"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Saved invoices */}
      <div className="admin-panel admin-orders-panel">
        <div className="admin-panel-title-row admin-colors-head">
          <div className="admin-colors-title">
            <span className="admin-orders-ico"><ClipboardList size={22} /></span>
            <div>
              <h2>Saved Manual Invoices</h2>
              <p className="admin-panel-subtitle">Every generated invoice is stored and re-downloadable.</p>
            </div>
          </div>
          <div className="admin-actions compact">
            <label className="admin-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); loadInvoices(1, e.target.value); }}
                placeholder="Search invoices..."
              />
            </label>
          </div>
        </div>

        <div className="admin-orders-table-wrap">
          <div className="admin-orders-table-head manual-list-head">
            <span>#</span>
            <span>Invoice No</span>
            <span>Customer</span>
            <span>Items</span>
            <span>Total Amount</span>
            <span>Payment</span>
            <span>Created On</span>
            <span className="actions">Actions</span>
          </div>
          {listLoading ? (
            <div className="admin-empty small">Loading invoices...</div>
          ) : invoices.length ? (
            invoices.map((inv, idx) => (
              <React.Fragment key={inv.id}>
                <div className="admin-orders-table-row manual-list-row">
                  <span className="admin-print-num">{(page - 1) * perPage + idx + 1}</span>
                  <span>
                    <button type="button" className="admin-order-link" onClick={() => toggleExpand(inv)} title="View details">
                      {inv.invoice_number}
                    </button>
                    <span className="admin-print-sub">{inv.sale_order}</span>
                  </span>
                  <span>
                    <strong className="admin-print-customer">{inv.customer_name}</strong>
                    <span className="admin-print-sub">{inv.customer_phone}</span>
                  </span>
                  <span><strong className="admin-print-file-name">{inv.item_count} item{Number(inv.item_count) === 1 ? "" : "s"}</strong></span>
                  <strong className="admin-print-price">{money(inv.grand_total)}</strong>
                  <span><span className="admin-pay-pill done">{inv.payment_status}</span></span>
                  <span><strong className="admin-print-date-text">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</strong></span>
                  <span className="admin-print-actions">
                    <button type="button" className="admin-icon-btn view" onClick={() => downloadSaved(inv)} title="Download PDF"><Download size={16} /></button>
                    <button type="button" className="admin-icon-btn menu" onClick={() => deleteSaved(inv)} title="Delete invoice"><Trash2 size={16} /></button>
                  </span>
                </div>
                {expandedId === inv.id && (
                  <div className="manual-detail-row">
                    {expandedLoading || !expandedDetail ? (
                      <div className="admin-empty small">Loading details...</div>
                    ) : (
                      <div className="manual-detail-grid">
                        <div>
                          <strong>Bill To</strong>
                          <p>{expandedDetail.customer_name}<br />{expandedDetail.billing_address1}{expandedDetail.billing_address2 ? `, ${expandedDetail.billing_address2}` : ""}<br />{expandedDetail.billing_city}, {expandedDetail.billing_state} {expandedDetail.billing_pincode}<br />{expandedDetail.customer_phone}{expandedDetail.customer_email ? ` • ${expandedDetail.customer_email}` : ""}</p>
                        </div>
                        <div>
                          <strong>Items</strong>
                          {(expandedDetail.items || []).map((it) => (
                            <p key={it.id}>
                              <em className={`manual-type-pill ${it.item_type}`}>{it.item_type}</em> {it.description} — {it.qty} × Rs. {it.rate} = {money(it.total)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))
          ) : <div className="admin-empty small">No manual invoices yet — create one above.</div>}
        </div>

        <div className="admin-colors-foot">
          <div className="admin-colors-page-info">
            <select className="admin-filter-select" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); loadInvoices(1, search); }} aria-label="Invoices per page">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
            <span>{total ? `Showing ${(page - 1) * perPage + 1} to ${Math.min(page * perPage, total)} of ${total} invoices` : "No invoices to show"}</span>
          </div>
          <div className="admin-colors-pagination">
            <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); loadInvoices(page - 1, search); }} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span className="admin-page-current">{page}</span>
            <button type="button" className="admin-page-btn" disabled={page >= totalPages} onClick={() => { setPage((p) => p + 1); loadInvoices(page + 1, search); }} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ManualOrders;
