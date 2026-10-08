import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Pencil,
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
  company: { name: "", gstin: "", address1: "", address2: "", city: "", state: "", pincode: "", country: "India" },
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
  roundTotal: "",
  amountPaid: "",
  showSeal: true,
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

function ManualOrders({ categories = [], brands = [], products = [], materials = [], prefill = null }) {
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingNumber, setEditingNumber] = useState("");
  // Linked WhatsApp quotation (from 3D Printing → 3D Print Quotations →
  // Generate Invoice). Saving the invoice auto-creates the 3D print order.
  const [quotationId, setQuotationId] = useState(null);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimer = React.useRef(null);
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

  /* Quotation prefill — fills customer + the attached 3D file as a print row. */
  useEffect(() => {
    const q = prefill?.quotation;
    if (!prefill?.key || !q) return;
    setEditingId(null);
    setEditingNumber("");
    setQuotationId(q.id);
    setForm({
      ...blankForm(),
      customer: {
        ...EMPTY_PERSON,
        name: q.customer_name || "",
        email: q.customer_email || "",
        phone: q.customer_phone || "",
        address1: q.customer_address1 || q.customer_address || "",
        address2: q.customer_address2 || "",
        city: q.customer_city || "",
        state: q.customer_state || "",
        pincode: q.customer_pincode || "",
        country: q.customer_country || "India",
      },
      items: [
        {
          key: `${Date.now()}-quote`,
          item_type: "print",
          product_id: null,
          description: composePrintDescription({
            file_name: q.file_name,
            material_name: q.material_name,
            color_name: q.color_name || q.custom_color_hex,
            infill_density: "",
            surface_finish: "",
          }),
          hsn: "",
          rate: "",
          qty: Math.max(1, Number(q.quantity) || 1),
          disc: "",
          file_name: q.file_name || "",
          material_name: q.material_name || "",
          color_name: q.color_name || q.custom_color_hex || "",
          infill_density: "",
          surface_finish: "standard",
          filament_weight_grams: "",
          print_time_hours: "",
        },
      ],
    });
    setCustomerSuggestions([]);
    setShowSuggestions(false);
    toast.success(`Quotation #${q.id} loaded — set the price and save`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.key]);

  /* Customer autocomplete — typing the name refills saved billing details. */
  const onCustomerNameChange = (value) => {
    setCustomer({ name: value });
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (String(value || "").trim().length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await adminService.searchManualCustomers(value.trim());
        setCustomerSuggestions(res.data?.data || []);
        setShowSuggestions(true);
      } catch {
        setCustomerSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);
  };

  const applySuggestion = (c) => {
    setShowSuggestions(false);
    setCustomerSuggestions([]);
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        name: c.customer_name || "",
        email: c.customer_email || "",
        phone: c.customer_phone || "",
        address1: c.billing_address1 || "",
        address2: c.billing_address2 || "",
        city: c.billing_city || "",
        state: c.billing_state || "",
        pincode: c.billing_pincode || "",
        country: c.billing_country || "India",
      },
      company: {
        ...(prev.company || {}),
        name: c.company_name || "",
        gstin: c.company_gstin || "",
        address1: c.company_address || "",
        address2: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
      },
      sameAsBilling: c.shipping_same !== 0 ? prev.sameAsBilling : false,
      shipping: {
        ...prev.shipping,
        name: c.shipping_name || "",
        email: c.shipping_email || "",
        phone: c.shipping_phone || "",
        address1: c.shipping_address1 || "",
        address2: c.shipping_address2 || "",
        city: c.shipping_city || "",
        state: c.shipping_state || "",
        pincode: c.shipping_pincode || "",
        country: c.shipping_country || "India",
      },
    }));
    toast.success("Customer details autofilled");
  };
  const setCompany = (patch) =>
    setForm((prev) => ({
      ...prev,
      company: {
        ...(prev.company || { name: "", gstin: "", address1: "", address2: "", city: "", state: "", pincode: "", country: "India" }),
        ...patch,
      },
    }));

  const copyCustomerToCompany = () =>
    setForm((prev) => ({
      ...prev,
      company: {
        ...(prev.company || {}),
        address1: prev.customer.address1 || "",
        address2: prev.customer.address2 || "",
        city: prev.customer.city || "",
        state: prev.customer.state || "",
        pincode: prev.customer.pincode || "",
        country: prev.customer.country || "India",
      },
    }));

  const composeCompanyAddress = (company = {}) =>
    [company.address1, company.address2, company.city, company.state, company.pincode, company.country]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(", ");
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
          filament_weight_grams: "",
          print_time_hours: "",
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
          filament_weight_grams: "",
          print_time_hours: "",
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
          filament_weight_grams: "",
          print_time_hours: "",
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
        // Auto-suggest the rate from filament weight + print time while the
        // rate is still empty (never overwrites a manually entered rate).
        // Material part uses the material's ₹/gram; time uses the standard ₹40/h slab.
        if (
          next.item_type === "print" &&
          (patch.filament_weight_grams !== undefined ||
            patch.print_time_hours !== undefined ||
            patch.material_name !== undefined) &&
          (next.rate === "" || next.rate === undefined || next.rate === null)
        ) {
          const mat = (materials || []).find(
            (m) => String(m.name || "").toLowerCase() === String(next.material_name || "").toLowerCase()
          );
          const grams = Number(next.filament_weight_grams) || 0;
          const hours = Number(next.print_time_hours) || 0;
          if (mat && Number(mat.price_per_gram) > 0 && (grams > 0 || hours > 0)) {
            next.rate = Math.round((grams * Number(mat.price_per_gram) + hours * 40) * 100) / 100;
          }
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
    let linesSubtotal = 0;
    let linesTax = 0;
    form.items.forEach((it) => {
      const gross = (Number(it.rate) || 0) * (Number(it.qty) || 0);
      const disc = Math.min(Number(it.disc) || 0, gross);
      const amount = gross - disc;
      linesSubtotal += amount;
      linesTax += (amount * rate) / 100;
    });
    const ship = Number(form.shippingCost) || 0;
    const disc = Number(form.discount) || 0;
    const computed = Math.max(0, Math.round((linesSubtotal + linesTax + ship - disc) * 100) / 100);
    const figureNum = Number(form.roundTotal);
    const figure = Number.isFinite(figureNum) && figureNum > 0 ? Math.round(figureNum * 100) / 100 : null;
    // Round figure = final GST-inclusive total: GST auto-splits out of it at
    // the invoice rate, so Taxes is calculated even with blank line rates.
    let subtotal;
    let taxTotal;
    let grand;
    let roundOff = 0;
    if (figure !== null) {
      grand = figure;
      taxTotal = rate > 0 ? Math.round((grand * rate) / (100 + rate) * 100) / 100 : 0;
      subtotal = Math.round((grand - taxTotal + disc) * 100) / 100;
    } else {
      subtotal = Math.round(linesSubtotal * 100) / 100;
      taxTotal = Math.round(linesTax * 100) / 100;
      grand = computed;
    }
    const final = grand;
    // Advance paid (clamped to the final total) → pending auto-calculates.
    const paid = Math.min(Math.max(0, Number(form.amountPaid) || 0), final);
    const pending = Math.round((final - paid) * 100) / 100;
    return {
      subtotal,
      taxTotal,
      grand,
      figure,
      roundOff,
      final,
      paid,
      pending,
    };
  }, [form.items, form.gstRate, form.shippingCost, form.discount, form.roundTotal, form.amountPaid]);

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

  const buildPayload = () => ({
    ...(quotationId ? { quotation_id: quotationId } : {}),
    customer: {
      ...form.customer,
      company_name: form.company?.name || "",
      company_address: composeCompanyAddress(form.company),
      company_gstin: form.company?.gstin || "",
    },
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
      filament_weight_grams: it.filament_weight_grams !== "" && it.filament_weight_grams != null ? Number(it.filament_weight_grams) : null,
      print_time_hours: it.print_time_hours !== "" && it.print_time_hours != null ? Number(it.print_time_hours) : null,
    })),
    shippingCost: Number(form.shippingCost) || 0,
    deliveryOption: form.deliveryOption,
    discount: Number(form.discount) || 0,
    roundTotal: form.roundTotal === "" ? null : Number(form.roundTotal),
    amountPaid: Number(form.amountPaid) || 0,
    showSeal: form.showSeal !== false,
    payment: { methodLabel: form.payMethod, status: form.payStatus },
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.items.length) {
      toast.error("Add at least one item");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await adminService.updateManualInvoice(editingId, buildPayload());
        toast.success(`Invoice ${editingNumber} updated.`);
        await downloadSaved({ id: editingId });
        cancelEdit();
        setPage(1);
        loadInvoices(1, search);
        return;
      }
      const filename = await adminService.createManualInvoicePdf(buildPayload());
      toast.success(`Invoice saved. ${filename} downloaded.`);
      if (quotationId) {
        toast.info("3D print order created from this quotation.");
      }
      setQuotationId(null);
      setForm(blankForm());
      setPage(1);
      loadInvoices(1, search);
    } catch (error) {
      toast.error(await readBlobError(error));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingNumber("");
    setQuotationId(null);
    setForm(blankForm());
    setCustomerSuggestions([]);
    setShowSuggestions(false);
  };

  const startEdit = async (inv) => {
    try {
      const res = await adminService.getManualInvoice(inv.id);
      const d = res.data?.data || {};
      setForm({
        ...blankForm(),
        customer: {
          name: d.customer_name || "",
          email: d.customer_email || "",
          phone: d.customer_phone || "",
          address1: d.billing_address1 || "",
          address2: d.billing_address2 || "",
          city: d.billing_city || "",
          state: d.billing_state || "",
          pincode: d.billing_pincode || "",
          country: d.billing_country || "India",
        },
        company: {
          name: d.company_name || "",
          gstin: d.company_gstin || "",
          address1: d.company_address || "",
          address2: "",
          city: "",
          state: "",
          pincode: "",
          country: "India",
        },
        sameAsBilling: d.shipping_same !== 0,
        shipping: {
          ...EMPTY_PERSON,
          name: d.shipping_name || "",
          email: d.shipping_email || "",
          phone: d.shipping_phone || "",
          address1: d.shipping_address1 || "",
          address2: d.shipping_address2 || "",
          city: d.shipping_city || "",
          state: d.shipping_state || "",
          pincode: d.shipping_pincode || "",
          country: d.shipping_country || "India",
        },
        saleOrder: d.sale_order || "",
        reference: d.reference || "",
        date: d.invoice_date ? String(d.invoice_date).slice(0, 10) : todayISO(),
        gstRate: String(d.gst_rate ?? 18),
        items: (d.items || []).map((it) => ({
          key: newKey(),
          item_type: it.item_type || "custom",
          product_id: it.product_id || null,
          description: it.description || "",
          hsn: it.hsn || "",
          rate: it.rate ?? "",
          qty: it.qty ?? 1,
          disc: it.disc ?? "",
          file_name: it.file_name || "",
          material_name: it.material_name || "",
          color_name: it.color_name || "",
          infill_density: it.infill_density ?? "",
          surface_finish: it.surface_finish || "standard",
          filament_weight_grams: it.filament_weight_grams ?? "",
          print_time_hours: it.print_time_hours ?? "",
        })),
        deliveryOption: d.delivery_option || "standard",
        shippingCost: d.shipping_cost ?? "",
        discount: d.discount ?? "",
        roundTotal: d.round_total ?? "",
        amountPaid: d.amount_paid ?? "",
        showSeal: d.show_seal === undefined || d.show_seal === null ? true : Number(d.show_seal) === 1,
        payMethod: d.payment_method || "Cash",
        payStatus: d.payment_status || "PAID",
      });
      setEditingId(d.id);
      setEditingNumber(d.invoice_number || "");
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.info(`Editing ${d.invoice_number} — save to update`);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Unable to load invoice for editing");
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
          {editingId && (
            <div className="pf-section" style={{ border: "1.5px solid #2563eb" }}>
              <div className="pf-section-head">
                <div>
                  <h3>Editing {editingNumber}</h3>
                  <p>Changes overwrite the saved invoice. The invoice number stays the same.</p>
                </div>
                <button type="button" className="admin-secondary" onClick={cancelEdit} disabled={saving}>
                  <X size={14} /> Cancel Edit
                </button>
              </div>
            </div>
          )}
          {quotationId && !editingId && (
            <div className="pf-section" style={{ border: "1.5px solid #16a34a" }}>
              <div className="pf-section-head">
                <div>
                  <h3>From WhatsApp Quotation #{quotationId}</h3>
                  <p>Customer details and the 3D file are prefilled. Set the price and save — the 3D print order is created automatically.</p>
                </div>
                <button type="button" className="admin-secondary" onClick={() => setQuotationId(null)} disabled={saving}>
                  <X size={14} /> Unlink
                </button>
              </div>
            </div>
          )}
          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Customer (Billing)</h3></div></div>
            <div className="pf-grid cols-2">
              <label className="pf-field" style={{ position: "relative" }}><span>Name <b>*</b></span>
                <input
                  required
                  value={form.customer.name}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onFocus={() => { if (customerSuggestions.length) setShowSuggestions(true); }}
                  placeholder="Customer full name — type to autofill"
                  autoComplete="off"
                />
                {showSuggestions && customerSuggestions.length > 0 && (
                  <div className="manual-suggest-list">
                    {customerSuggestions.map((c) => (
                      <button
                        key={`${c.customer_name}-${c.customer_phone}-${c.id}`}
                        type="button"
                        className="manual-suggest-item"
                        onMouseDown={() => applySuggestion(c)}
                      >
                        <strong>{c.customer_name}</strong>
                        <span>{c.customer_phone}{c.billing_city ? ` • ${c.billing_city}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                {suggestLoading && <span className="admin-print-sub">Searching...</span>}
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
              <label className="pf-field"><span>Address Line 1</span>
                <input value={form.customer.address1} onChange={(e) => setCustomer({ address1: e.target.value })} />
              </label>
              <label className="pf-field"><span>Address Line 2</span>
                <input value={form.customer.address2} onChange={(e) => setCustomer({ address2: e.target.value })} />
              </label>
              <label className="pf-field"><span>City</span>
                <input value={form.customer.city} onChange={(e) => setCustomer({ city: e.target.value })} />
              </label>
              <label className="pf-field"><span>State</span>
                <input value={form.customer.state} onChange={(e) => setCustomer({ state: e.target.value })} placeholder="West Bengal" />
              </label>
              <label className="pf-field"><span>Pincode</span>
                <input value={form.customer.pincode} onChange={(e) => setCustomer({ pincode: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head"><div><h3>Company Details (optional)</h3><p>Filled only when the order is for a company — printed on the GST invoice.</p></div></div>
            <div className="pf-grid cols-2">
              <label className="pf-field"><span>Company Name</span>
                <input value={form.company?.name || ""} onChange={(e) => setCompany({ name: e.target.value })} placeholder="Company name" />
              </label>
              <label className="pf-field"><span>Company GSTIN</span>
                <input value={form.company?.gstin || ""} onChange={(e) => setCompany({ gstin: e.target.value.toUpperCase() })} placeholder="15-character GSTIN" maxLength={15} />
              </label>
              <div style={{ gridColumn: "1 / -1" }}>
                <button
                  type="button"
                  className="admin-primary small"
                  onClick={copyCustomerToCompany}
                  style={{ marginBottom: 10 }}
                >
                  <span>Same as customer address</span>
                </button>
              </div>
              <label className="pf-field"><span>Company Address Line 1</span>
                <input value={form.company?.address1 || ""} onChange={(e) => setCompany({ address1: e.target.value })} placeholder="House no., Building, Street" />
              </label>
              <label className="pf-field"><span>Company Address Line 2</span>
                <input value={form.company?.address2 || ""} onChange={(e) => setCompany({ address2: e.target.value })} placeholder="Apartment, Landmark, Area" />
              </label>
              <label className="pf-field"><span>Company City</span>
                <input value={form.company?.city || ""} onChange={(e) => setCompany({ city: e.target.value })} placeholder="City" />
              </label>
              <label className="pf-field"><span>Company State</span>
                <input value={form.company?.state || ""} onChange={(e) => setCompany({ state: e.target.value })} placeholder="West Bengal" />
              </label>
              <label className="pf-field"><span>Company Pincode</span>
                <input value={form.company?.pincode || ""} onChange={(e) => setCompany({ pincode: e.target.value })} placeholder="Pincode" />
              </label>
              <label className="pf-field"><span>Company Country</span>
                <input value={form.company?.country || ""} onChange={(e) => setCompany({ country: e.target.value })} placeholder="India" />
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
                <label className="pf-field"><span>Address Line 1</span>
                  <input value={form.shipping.address1} onChange={(e) => setShipping({ address1: e.target.value })} />
                </label>
                <label className="pf-field"><span>Address Line 2</span>
                  <input value={form.shipping.address2} onChange={(e) => setShipping({ address2: e.target.value })} />
                </label>
                <label className="pf-field"><span>City</span>
                  <input value={form.shipping.city} onChange={(e) => setShipping({ city: e.target.value })} />
                </label>
                <label className="pf-field"><span>State</span>
                  <input value={form.shipping.state} onChange={(e) => setShipping({ state: e.target.value })} />
                </label>
                <label className="pf-field"><span>Pincode</span>
                  <input value={form.shipping.pincode} onChange={(e) => setShipping({ pincode: e.target.value })} />
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
                  <option>PARTIAL</option>
                  <option>PENDING</option>
                </select>
              </label>
              <label className="seal-toggle" style={{ gridColumn: "1 / -1" }} title="Print the authorised signatory seal at the bottom-right of the invoice">
                <input type="checkbox" className="seal-toggle-input" checked={!!form.showSeal} onChange={(e) => set({ showSeal: e.target.checked })} />
                <span className="seal-track"><span className="seal-knob" /></span>
                <span>Show authorised seal on invoice</span>
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
                        <input type="number" min="0" step="0.01" placeholder="Filament (g)" title="Filament weight in grams — auto-fills the rate" value={it.filament_weight_grams} onChange={(e) => updateRow(it.key, { filament_weight_grams: e.target.value }, true)} />
                        <input type="number" min="0" step="0.01" placeholder="Time (hrs)" title="Printing time in hours — auto-fills the rate" value={it.print_time_hours} onChange={(e) => updateRow(it.key, { print_time_hours: e.target.value }, true)} />
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
              <label className="pf-field"><span>Amount Paid (Rs., advance)</span>
                <input type="number" min="0" step="0.01" value={form.amountPaid} onChange={(e) => set({ amountPaid: e.target.value })} placeholder="0.00" />
              </label>
              <label className="pf-field" style={{ gridColumn: "1 / -1" }}><span>Round Figure (Rs., optional — final total incl. GST)</span>
                <input type="number" min="0" step="0.01" value={form.roundTotal} onChange={(e) => set({ roundTotal: e.target.value })} placeholder="Leave empty to total the lines — or type the final amount and GST auto-splits" />
              </label>
            </div>
            <div className="manual-totals">
              <span>Subtotal <strong>Rs. {totals.subtotal.toFixed(2)}</strong></span>
              {(Number(form.shippingCost) || 0) > 0 && (
                <span>Shipping <strong>+ Rs. {(Number(form.shippingCost) || 0).toFixed(2)}</strong></span>
              )}
              {(Number(form.discount) || 0) > 0 && (
                <span>Discount <strong>- Rs. {(Number(form.discount) || 0).toFixed(2)}</strong></span>
              )}
              <span>Taxes ({Number(form.gstRate) || 0}%) <strong>Rs. {totals.taxTotal.toFixed(2)}</strong></span>
              {totals.roundOff !== 0 && (
                <span>Round Off <strong>Rs. {totals.roundOff.toFixed(2)}</strong></span>
              )}
              <span className="grand">Total <strong>Rs. {totals.final.toFixed(2)}</strong></span>
              {totals.paid > 0 && (
                <span>Paid <strong>- Rs. {totals.paid.toFixed(2)}</strong></span>
              )}
              {totals.paid > 0 && (
                <span className="grand">Pending <strong>Rs. {totals.pending.toFixed(2)}</strong></span>
              )}
            </div>
          </div>

          <div className="manual-actions">
            {editingId ? (
              <>
                <span className="admin-print-sub">Editing <strong>{editingNumber}</strong></span>
                <button type="button" className="admin-secondary" onClick={cancelEdit} disabled={saving}>Cancel</button>
                <button type="submit" className="admin-primary" disabled={saving || !form.items.length}>
                  <Download size={16} />
                  <span>{saving ? "Updating..." : "Update & Download PDF"}</span>
                </button>
              </>
            ) : (
              <>
                <button type="button" className="admin-secondary" onClick={() => { setForm(blankForm()); setQuotationId(null); }} disabled={saving}>Reset</button>
                <button type="submit" className="admin-primary" disabled={saving || !form.items.length}>
                  <Download size={16} />
                  <span>{saving ? "Saving..." : "Save & Generate PDF"}</span>
                </button>
              </>
            )}
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
                  <span><span className={`admin-pay-pill ${String(inv.payment_status || "").toUpperCase() === "PAID" ? "done" : "pending"}`}>{inv.payment_status}</span></span>
                  <span><strong className="admin-print-date-text">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</strong></span>
                  <span className="admin-print-actions">
                    <button type="button" className="admin-icon-btn view" onClick={() => toggleExpand(inv)} title="View invoice details"><Eye size={16} /></button>
                    <button type="button" className="admin-icon-btn view" onClick={() => downloadSaved(inv)} title="Download PDF"><Download size={16} /></button>
                    <button type="button" className="admin-icon-btn view" onClick={() => startEdit(inv)} title="View & edit invoice"><Pencil size={16} /></button>
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
                          <p>{expandedDetail.customer_name}<br />{expandedDetail.billing_address1}{expandedDetail.billing_address2 ? `, ${expandedDetail.billing_address2}` : ""}<br />{expandedDetail.billing_city}, {expandedDetail.billing_state} {expandedDetail.billing_pincode}<br />{expandedDetail.customer_phone}{expandedDetail.customer_email ? ` • ${expandedDetail.customer_email}` : ""}{expandedDetail.company_name ? (<><br /><strong>{expandedDetail.company_name}</strong></>) : null}{expandedDetail.company_address ? (<><br />{expandedDetail.company_address}</>) : null}{expandedDetail.company_gstin ? (<><br />GSTIN: {expandedDetail.company_gstin}</>) : null}</p>
                        </div>
                        <div>
                          <strong>Items</strong>
                          {(expandedDetail.items || []).map((it) => (
                            <p key={it.id}>
                              <em className={`manual-type-pill ${it.item_type}`}>{it.item_type}</em> {it.description} — {it.qty} × Rs. {it.rate} = {money(it.total)}
                              {(it.filament_weight_grams != null || it.print_time_hours != null) && (
                                <span className="admin-print-sub">
                                  {" "}• {it.filament_weight_grams != null ? `${it.filament_weight_grams}g` : "—"} • {it.print_time_hours != null ? `${it.print_time_hours}h` : "—"}
                                </span>
                              )}
                            </p>
                          ))}
                          <p>
                            <strong>Total: {money(expandedDetail.grand_total)}</strong>
                            {expandedDetail.round_total ? <> <span className="admin-print-sub">(round figure applied)</span></> : null}
                            {Number(expandedDetail.amount_paid || 0) > 0 ? (
                              <>
                                <br /><strong>Paid: {money(expandedDetail.amount_paid)}</strong>
                                <span className="admin-print-sub"> • Pending: {money(Math.max(0, Number(expandedDetail.grand_total || 0) - Number(expandedDetail.amount_paid || 0)))}</span>
                              </>
                            ) : null}
                            {` • ${expandedDetail.payment_status || ""}`}
                          </p>
                          <p>
                            <button type="button" className="admin-secondary" onClick={() => startEdit(expandedDetail)}><Pencil size={14} /> Edit Invoice</button>
                            {" "}
                            <button type="button" className="admin-secondary" onClick={() => downloadSaved(expandedDetail)}><Download size={14} /> PDF</button>
                          </p>
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
