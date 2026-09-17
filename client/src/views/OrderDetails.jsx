import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ChevronRight,
  Box,
  CheckCircle2,
  Check,
  Clock,
  Truck,
  XCircle,
  Download,
  MapPin,
  FileText,
  Headset,
  RefreshCw,
  ShoppingCart,
  ArrowRight
} from "lucide-react";
import orderService from "../services/order.service";
import printingService from "../services/printing.service";
import "../../public/css/order-details.css";

const formatPrintStatus = (status) => {
  if (!status) return "Processing";
  if (["in_production", "reviewing", "printing"].includes(status)) return "Processing";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const OrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [serverOrder, setServerOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      if (!localStorage.getItem("token")) {
        navigate("/login", { state: { from: `/orders/${id}` } });
        return;
      }

      try {
        setLoading(true);
        // 3D print orders (numbers start with "3D") live in printing_orders
        if (/^3D/i.test(String(id || "").replace(/^#/, ""))) {
          const response = await printingService.getPrintOrderById(String(id).replace(/^#/, ""));
          const po = response.data.order;
          const specBits = [
            po.material_name,
            po.color_name || po.custom_color_hex,
            po.infill_density ? `${po.infill_density}% infill` : null,
            po.surface_finish,
            po.estimated_weight ? `${po.estimated_weight}g` : null,
          ].filter(Boolean);
          const placedDate = po.created_at
            ? new Date(po.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
            : "";
          const shipBits = [po.shipping_address1, po.shipping_city, po.shipping_state, po.shipping_pincode]
            .filter(Boolean)
            .join(", ");

          if (active) {
            setServerOrder({
              id: po.order_number,
              date: placedDate,
              placedDate,
              status: formatPrintStatus(po.status),
              totalPrice: Number(po.total_amount || 0),
              is3DPrint: true,
              allItems: [
                {
                  id: po.id,
                  name: `3D Print: ${po.file_name}`,
                  subtext: specBits.join(" · ") || "Custom 3D print",
                  image: "/images/rocket.png",
                  price: Number(po.subtotal || po.total_amount || 0),
                  qty: 1,
                  isPrint: true,
                },
              ],
              trackingSteps: (po.timeline || [
                { step: "Order Placed", timestamp: placedDate, is_completed: true },
                { step: "Confirmed", timestamp: "Pending", is_completed: po.status === "confirmed" || po.status === "delivered" },
              ]).map((step) => ({
                title: step.step,
                time: step.timestamp || "Pending",
                completed: step.is_completed,
                desc: step.tracking_number
                  ? `${step.carrier || "Carrier"} (${step.tracking_number})`
                  : step.step,
              })),
              awb: po.shipping?.awb || po.delhivery_awb || null,
              carrier: po.shipping?.carrier || (po.delhivery_awb ? "Delhivery" : null),
              shippingStatus: po.shipping?.shipping_status
                ? String(po.shipping.shipping_status).replace(/_/g, " ")
                : null,
              shippingAddress: po.shipping_name
                ? `${po.shipping_name}, ${shipBits}${po.shipping_phone ? `, ${po.shipping_phone}` : ""}`
                : shipBits || "Pickup / address on file",
              paymentMethod: po.payment_method === "cod" ? "Cash on Delivery" : po.payment_method,
              summary: {
                items_count: Number(po.quantity || 1),
                subtotal: Number(po.subtotal || 0),
                shipping_cost: 0,
                discount: 0,
                tax_amount: Number(po.tax_amount || 0),
                total_amount: Number(po.total_amount || 0),
              },
            });
          }
          return;
        }

        const response = await orderService.getOrder(id);
        const data = response.data.order;
        const status =
          data.status === "in_production" || data.status === "reviewing" || data.status === "printing"
            ? "Processing"
            : data.status
            ? data.status.charAt(0).toUpperCase() + data.status.slice(1)
            : "Processing";

        const mappedItems = (data.items || []).map((item) => ({
          id: item.id,
          name: item.product_name,
          subtext: item.variant_value || item.category_name || "PrintyNozzle",
          image: item.image_url || (item.item_type === "print" ? "/images/rocket.png" : "/images/products/01.png"),
          price: Number(item.price || 0),
          qty: Number(item.quantity || 1),
          isPrint: item.item_type === "print",
        }));

        if (active) {
          setServerOrder({
            id: data.order_number,
            date: data.formatted_date,
            placedDate: data.formatted_placed_at,
            status,
            totalPrice: Number(data.total_amount || 0),
            allItems: mappedItems,
            trackingSteps: (data.timeline || []).map((step) => ({
              title: step.step,
              time: step.timestamp || "Pending",
              completed: step.is_completed,
              desc: step.tracking_number
                ? `${step.carrier || "Carrier"} (${step.tracking_number})`
                : step.step,
            })),
            awb: data.shipping?.awb || null,
            carrier: data.shipping?.carrier || null,
            shippingStatus: data.shipping?.shipping_status
              ? String(data.shipping.shipping_status).replace(/_/g, " ")
              : null,
            shippingAddress: data.shipping_address?.formatted,
            paymentMethod: data.payment_method_label || data.payment_method,
            summary: data.summary,
          });
        }
      } catch (error) {
        if (active) {
          setServerOrder(null);
          toast.error(error?.response?.data?.message || "Unable to load order details");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOrder();
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const order = serverOrder;

  // Order items mapped with fallbacks (null-safe: order loads async)
  const items = useMemo(() => {
    return (order?.allItems || []).map((item) => ({
      id: item.id,
      name: item.name,
      subtext:
        item.subtext ||
        (order?.is3DPrint ? "3D Printing & Fabrication" : "Electronics & Components"),
      image: item.image || (item.isPrint || order?.is3DPrint ? "/images/rocket.png" : "/images/products/01.png"),
      isPrint: Boolean(item.isPrint || order?.is3DPrint),
      price: item.price || 0,
      qty: item.qty || 1
    }));
  }, [order]);

  // Financials come from the server order summary (single source of truth)
  const serverSummary = order?.summary || {};
  const subtotal = useMemo(() => {
    if (serverSummary.subtotal !== undefined && serverSummary.subtotal !== null) {
      return Number(serverSummary.subtotal);
    }
    return items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [items, serverSummary.subtotal]);

  const itemsCount = useMemo(() => {
    return Number(serverSummary.items_count || 0) || items.reduce((sum, item) => sum + item.qty, 0);
  }, [items, serverSummary.items_count]);

  const shippingCost = Number(serverSummary.shipping_cost ?? 0);
  const shipping = shippingCost === 0 ? "FREE" : `₹${shippingCost.toLocaleString("en-IN")}`;
  const discount = Number(serverSummary.discount ?? 0);
  const tax = useMemo(() => Number(serverSummary.tax_amount ?? +(subtotal * 0.18)), [subtotal, serverSummary.tax_amount]);
  const total = useMemo(
    () => Number(serverSummary.total_amount ?? +(subtotal + tax - discount + shippingCost)),
    [subtotal, tax, discount, shippingCost, serverSummary.total_amount]
  );

  // Parse address details
  const address = useMemo(() => {
    if (typeof order?.shippingAddress === "string" && order.shippingAddress.trim()) {
      const parts = order.shippingAddress.split(", ");
      return {
        name: parts[0] || "Customer",
        line1: parts.slice(1, 3).join(", ") || parts[0],
        line2: parts.slice(3).join(", ") || "",
        phone: ""
      };
    }
    return {
      name: "Customer",
      line1: "Address on file",
      line2: "",
      phone: ""
    };
  }, [order]);

  // Handlers
  const handleDownloadInvoice = async () => {
    if (!order?.id) return;
    try {
      const isPrint = Boolean(order.is3DPrint) || /^3D/i.test(String(order.id).replace(/^#/, ""));
      const filename = isPrint
        ? await printingService.downloadInvoicePdf(order.id)
        : await orderService.downloadInvoicePdf(order.id);
      toast.success(`Invoice ${filename} downloaded.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to fetch invoice");
    }
  };

  const handleReorder = () => {
    orderService
      .reorder(order.id)
      .then(() => {
        toast.success(`All ${items.length} items from Order #${order.id} added to your cart!`);
        navigate("/cart");
      })
      .catch((error) => toast.error(error?.response?.data?.message || "Unable to reorder"));
  };

  // Status badge renderer
  const renderStatusBadge = () => {
    switch (order.status) {
      case "Delivered":
        return (
          <span className="od-status-badge delivered">
            <CheckCircle2 size={16} strokeWidth={2.4} />
            <span>Delivered</span>
          </span>
        );
      case "Shipped":
        return (
          <span className="od-status-badge shipped">
            <Truck size={16} strokeWidth={2.4} />
            <span>Shipped</span>
          </span>
        );
      case "Processing":
        return (
          <span className="od-status-badge processing">
            <Box size={16} strokeWidth={2.4} />
            <span>{order.statusText || "In Production"}</span>
          </span>
        );
      case "Cancelled":
        return (
          <span className="od-status-badge cancelled">
            <XCircle size={16} strokeWidth={2.4} />
            <span>Cancelled</span>
          </span>
        );
      default:
        return (
          <span className="od-status-badge delivered">
            <CheckCircle2 size={16} strokeWidth={2.4} />
            <span>{order.status}</span>
          </span>
        );
    }
  };

  const trackingSteps = order?.trackingSteps || [];

  if (loading) {
    return (
      <div className="od-page-wrapper">
        <div className="od-container">
          <div className="p-5 text-center">
            <div className="spinner-border text-primary" role="status" aria-label="Loading order details" />
            <p className="text-muted mt-3">Loading order details…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="od-page-wrapper">
        <div className="od-container">
          <div className="p-5 text-center">
            <h2>Order not found</h2>
            <p className="text-muted">This order could not be loaded. It may have been removed or the link is incorrect.</p>
            <Link to="/orders" className="btn btn-primary px-4 py-2 mt-3">
              Back to My Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="od-page-wrapper">
      <div className="od-container">
        {/* Breadcrumbs */}
        <nav className="od-breadcrumb" aria-label="Breadcrumb">
          <Link to="/" className="od-breadcrumb-link">Home</Link>
          <ChevronRight size={15} className="od-breadcrumb-sep" />
          <Link to="/orders" className="od-breadcrumb-link">My Orders</Link>
          <ChevronRight size={15} className="od-breadcrumb-sep" />
          <span className="od-breadcrumb-current">Order Details</span>
        </nav>

        {/* 2-Column Main Layout Grid */}
        <div className="od-layout-grid">
          {/* Left Column (Main Order Content) */}
          <div className="od-main-column">
            {/* Primary Order Card */}
            <div className="od-card">
              {/* Header */}
              <div className="od-header">
                <div className="od-header-left">
                  <div className="od-header-icon-wrap">
                    <Box size={24} strokeWidth={2.2} />
                  </div>
                  <div className="od-header-info">
                    <h1 className="od-order-number">Order #{order.id}</h1>
                    <p className="od-order-date">
                      Placed on {order.placedDate || `${order.date}, 10:24 AM`}
                    </p>
                  </div>
                </div>
                <div className="od-header-right">
                  {renderStatusBadge()}
                </div>
              </div>

              {/* Courier / AWB strip (Delhivery) */}
              {order.awb && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    background: "#f0f6ff",
                    border: "1px solid #d0e1fd",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 12,
                    fontSize: "0.85rem",
                  }}
                >
                  <strong>AWB:</strong>
                  <span style={{ fontFamily: "monospace" }}>{order.awb}</span>
                  {order.carrier && <span style={{ color: "#475569" }}>• {order.carrier}</span>}
                  {order.shippingStatus && (
                    <span style={{ color: "#0759d6", fontWeight: 600 }}>• {order.shippingStatus}</span>
                  )}
                </div>
              )}

              {/* Stepper / Timeline */}
              {trackingSteps.length > 0 && (
                <div className="od-stepper-wrap">
                  <div className="od-stepper">
                    <div
                      className="od-stepper-track"
                      style={{
                        left: `${100 / (2 * trackingSteps.length)}%`,
                        right: `${100 / (2 * trackingSteps.length)}%`
                      }}
                    ></div>
                    {trackingSteps.map((step, idx) => {
                      let datePart = step.time || "";
                      let timePart = "";
                      if (step.time && step.time.includes(", ")) {
                        const parts = step.time.split(", ");
                        datePart = parts[0];
                        timePart = parts[1];
                      }

                      return (
                        <div
                          key={idx}
                          className={`od-step-item ${step.completed ? "completed" : "pending"}`}
                        >
                          <div
                            className={`od-step-circle ${step.completed ? "completed" : "pending"}`}
                          >
                            {step.completed ? (
                              <Check size={14} strokeWidth={3} />
                            ) : (
                              <Clock size={12} strokeWidth={2.4} />
                            )}
                          </div>
                          <h4 className="od-step-title">{step.title}</h4>
                          <div className="od-step-date-time">
                            <span>{datePart}</span>
                            {timePart && <span>{timePart}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items in Your Order */}
              <div className="od-items-section">
                <h2 className="od-items-title">Items in Your Order</h2>
                <div className="od-table-card">
                  <div className="od-table-head">
                    <div className="od-th od-th-product">Product Details</div>
                    <div className="od-th od-th-price">Price</div>
                    <div className="od-th od-th-qty">Quantity</div>
                    <div className="od-th od-th-total">Total</div>
                  </div>
                  <div className="od-table-body">
                    {items.map((item) => (
                      <div key={item.id} className="od-table-row">
                        <div className="od-td od-td-product od-prod-col">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="od-prod-img"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = item.isPrint ? "/images/rocket.png" : "/images/products/01.png";
                            }}
                          />
                          <div className="od-prod-meta">
                            <h3 className="od-prod-name">{item.name}</h3>
                            <p className="od-prod-sub">{item.subtext}</p>
                          </div>
                        </div>
                        <div className="od-td od-td-price">
                          ₹{item.price.toLocaleString("en-IN")}
                        </div>
                        <div className="od-td od-td-qty">{item.qty}</div>
                        <div className="od-td od-td-total">
                          ₹{(item.price * item.qty).toLocaleString("en-IN")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order Footer Info Bar */}
              <div className="od-order-info-footer">
                <div className="od-info-col">
                  <span className="od-info-lbl">Order Placed</span>
                  <span className="od-info-val">
                    {order.placedDate || `${order.date}, 10:24 AM`}
                  </span>
                </div>
                <div className="od-info-col">
                  <span className="od-info-lbl">Order ID</span>
                  <span className="od-info-val">#{order.id}</span>
                </div>
                <div className="od-info-col">
                  <span className="od-info-lbl">Payment Method</span>
                  <span className="od-info-val">
                    {order.paymentMethod || "—"}
                  </span>
                </div>
                <div className="od-info-col" style={{ alignItems: "flex-end" }}>
                  {!order.is3DPrint && (
                    <button
                      type="button"
                      className="od-info-invoice-btn"
                      onClick={handleDownloadInvoice}
                    >
                      <span>View Invoice</span>
                      <Download size={14} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Side-by-side Address Cards */}
            <div className="od-addresses-grid">
              {/* Shipping Address */}
              <div className="od-card od-address-card">
                <div className="od-address-header">
                  <MapPin size={20} strokeWidth={2.2} className="od-address-icon" />
                  <h3 className="od-address-title">Shipping Address</h3>
                </div>
                <div className="od-address-body">
                  <p className="od-address-name">{address.name}</p>
                  <p className="od-address-line">{address.line1}</p>
                  <p className="od-address-line">{address.line2}</p>
                  <p className="od-address-phone">{address.phone}</p>
                </div>
              </div>

              {/* Billing Address */}
              <div className="od-card od-address-card">
                <div className="od-address-header">
                  <FileText size={20} strokeWidth={2.2} className="od-address-icon" />
                  <h3 className="od-address-title">Billing Address</h3>
                </div>
                <div className="od-address-body">
                  <p className="od-address-name">{address.name}</p>
                  <p className="od-address-line">{address.line1}</p>
                  <p className="od-address-line">{address.line2}</p>
                  <p className="od-address-phone">{address.phone}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Sidebar) */}
          <aside className="od-sidebar">
            {/* Order Summary Card */}
            <div className="od-card od-summary-card">
              <h3 className="od-summary-title">Order Summary</h3>

              <div className="od-summary-rows">
                <div className="od-summary-row">
                  <span className="od-sum-lbl">
                    Subtotal ({itemsCount} {itemsCount === 1 ? "item" : "items"})
                  </span>
                  <span className="od-sum-val">
                    ₹{subtotal.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="od-summary-row">
                  <span className="od-sum-lbl">Shipping</span>
                  <span className={`od-sum-val ${shippingCost === 0 ? "od-sum-val-free" : ""}`}>
                    {shipping}
                  </span>
                </div>
                <div className="od-summary-row">
                  <span className="od-sum-lbl">Discount</span>
                  <span className="od-sum-val">-₹{discount}</span>
                </div>
                <div className="od-summary-row">
                  <span className="od-sum-lbl">Tax (GST)</span>
                  <span className="od-sum-val">
                    ₹{tax.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="od-summary-divider"></div>

              <div className="od-summary-total-row">
                <div className="od-total-labels">
                  <span className="od-total-title">Total Amount</span>
                  <span className="od-total-sub">(Incl. of all taxes)</span>
                </div>
                <span className="od-total-amount">
                  ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Need Help Card */}
            <div className="od-card od-action-card">
              <div className="od-action-top">
                <Headset size={32} strokeWidth={2.1} className="od-action-icon" />
                <div className="od-action-text">
                  <h4 className="od-action-title">Need Help?</h4>
                  <p className="od-action-desc">
                    Have questions about your order?
                    <br />
                    Our support team is here to help.
                  </p>
                </div>
              </div>
              <Link to="/contact" className="od-action-btn-outline">
                Contact Support
              </Link>
            </div>

            {/* Download Invoice Card (regular orders only) */}
            {!order.is3DPrint && (
            <div className="od-card od-action-card">
              <div className="od-action-top">
                <FileText size={28} strokeWidth={2.1} className="od-action-icon" />
                <div className="od-action-text">
                  <h4 className="od-action-title">Download Invoice</h4>
                  <p className="od-action-desc">
                    Get a detailed invoice for your order.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="od-action-btn-outline"
                onClick={handleDownloadInvoice}
              >
                <Download size={16} strokeWidth={2.2} />
                <span>Download Invoice</span>
              </button>
            </div>
            )}

            {/* Reorder Card (regular orders only) */}
            {!order.is3DPrint && (
            <div className="od-card od-action-card">
              <div className="od-action-top">
                <RefreshCw size={28} strokeWidth={2.1} className="od-action-icon" />
                <div className="od-action-text">
                  <h4 className="od-action-title">Reorder</h4>
                  <p className="od-action-desc">
                    Want to buy these items again?
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="od-action-btn-outline"
                onClick={handleReorder}
              >
                <ShoppingCart size={16} strokeWidth={2.2} />
                <span>Add All to Cart</span>
              </button>
            </div>
            )}

            {/* Explore 3D Printing Promo Card */}
            <div className="od-card od-promo-card">
              <div className="od-promo-left">
                <div className="od-promo-head">
                  <Box size={22} strokeWidth={2.2} className="od-promo-icon" />
                  <h4 className="od-promo-title">Explore 3D Printing</h4>
                </div>
                <p className="od-promo-desc">
                  Turn your ideas into reality with high-quality 3D prints.
                </p>
                <Link to="/products" className="od-promo-btn">
                  <span>Visit 3D Printing</span>
                  <ArrowRight size={14} strokeWidth={2.4} />
                </Link>
              </div>
              <div className="od-promo-right">
                <img
                  src="/images/My_ORDERS_PAGE_BOTTLE_TRANSPARENT.png"
                  alt="3D Printed Vase"
                  className="od-promo-vase"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "/images/products/01.png";
                  }}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default OrderDetails;
