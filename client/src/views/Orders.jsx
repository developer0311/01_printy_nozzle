import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  User,
  ShoppingBag,
  MapPin,
  Box,
  LogOut,
  Search,
  ChevronDown,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  Headphones,
  Headset,
  RotateCcw,
  FileText,
  FileDown,
  RefreshCw,
  X,
  ExternalLink,
  Layers,
  ArrowRight,
  Download,
  AlertCircle,
  Package
} from "lucide-react";
import "../../public/css/orders.css";
import orderService from "../services/order.service";
import printingService from "../services/printing.service";
import profileService from "../services/profile.service";
import { syncCartBadge } from "../utils/cartSync";
import authServices from "../services/auth.service";

export const INITIAL_ORDERS = [];

function Orders() {
  const navigate = useNavigate();

  // User details
  const storedUser = JSON.parse(localStorage.getItem("user") || "null");
  const user = {
    name: storedUser
      ? `${storedUser.first_name || ""} ${storedUser.last_name || ""}`.trim()
      : "My Account",
    email: storedUser?.email || "",
    initials: `${storedUser?.first_name?.[0] || "M"}${storedUser?.last_name?.[0] || "A"}`.toUpperCase(),
  };

  // State management
  const [activeTab, setActiveTab] = useState("All Orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("Last 6 Months");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      if (!localStorage.getItem("token")) {
        navigate("/login", { state: { from: "/orders" } });
        return;
      }

      try {
        setLoading(true);
        const response = await orderService.getOrders({ limit: 50, time_range: "all" });
        if (active) {
          setOrders(mapOrders(response.data.orders || []));
        }
      } catch (error) {
        if (active) {
          setOrders([]);
          toast.error(error?.response?.data?.message || "Unable to load orders");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOrders();
    return () => {
      active = false;
    };
  }, [navigate]);

  // Modals state
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [show3DModal, setShow3DModal] = useState(false);
  const [printFiles, setPrintFiles] = useState([]);
  const [printFilesLoading, setPrintFilesLoading] = useState(false);

  const mapOrders = (list) =>
    (list || []).map((order) => {
      const normalizedStatus =
        order.status === "in_production" || order.status === "reviewing" || order.status === "printing"
          ? "Processing"
          : order.status
          ? order.status.charAt(0).toUpperCase() + order.status.slice(1)
          : "Processing";
      const allItems = (order.items || []).map((item) => ({
        id: item.id,
        name: item.product_name || order.file_name,
        subtext: item.variant_value || item.category_name || order.material_name || "PrintyNozzle",
        image: item.image_url || (item.item_type === "print" ? "/images/rocket.png" : "/images/products/01.png"),
        isPrint: item.item_type === "print",
        price: Number(item.price || order.total_amount || 0),
        qty: Number(item.quantity || order.quantity || 1),
      }));

      return {
        id: order.order_number,
        date: order.formatted_date || "",
        placedDate: order.formatted_date || "",
        status: normalizedStatus,
        statusText: order.status_label,
        statusDate: order.expected_delivery || "",
        totalPrice: Number(order.total_amount || 0),
        shippingCost: Number(order.shipping_cost ?? 0),
        itemCountText: order.is_3d_print ? "3D Printing Order" : `${order.items_count || allItems.length} items`,
        itemsSummary: order.items_summary || order.file_name || "Order items",
        specsText: order.is_3d_print
          ? `Material: ${order.material_name || "-"} | Color: ${order.color_name || "-"} | Qty: ${order.quantity || 1}`
          : "",
        is3DPrint: Boolean(order.is_3d_print),
        shippingAddress: order.shipping_address?.formatted || "",
        paymentMethod: order.payment_method_label || order.payment_method || "",
        thumbnails: allItems.slice(0, 3),
        overflowCount: Math.max(0, allItems.length - 3),
        allItems,
        trackingSteps: [],
        canCancel: Boolean(order.can_cancel),
      };
    });

  const reloadOrders = async () => {
    try {
      const response = await orderService.getOrders({ limit: 50, time_range: "all" });
      setOrders(mapOrders(response.data.orders || []));
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to refresh orders");
    }
  };

  const openTrackingModal = async (order) => {
    // Show the modal immediately, then fill in the live timeline
    setSelectedTrackingOrder({ ...order, trackingSteps: [] });
    try {
      const isPrint = Boolean(order.is3DPrint) || /^3D/i.test(String(order.id || "").replace(/^#/, ""));
      const response = isPrint
        ? await printingService.getPrintOrderById(String(order.id).replace(/^#/, ""))
        : await orderService.getOrder(order.id);
      const data = isPrint ? response.data.order : response.data.order;
      const steps = isPrint
        ? (data.timeline || []).map((step, idx, arr) => ({
            title: step.step,
            time: step.timestamp || "Pending",
            completed: Boolean(step.is_completed),
            current: Boolean(!step.is_completed && (idx === 0 || arr[idx - 1]?.is_completed)),
            desc: step.tracking_number
              ? `${step.carrier || "Carrier"} (${step.tracking_number})`
              : step.step,
          }))
        : (data.timeline || []).map((step, idx, arr) => ({
            title: step.step,
            time: step.timestamp || "Pending",
            completed: Boolean(step.is_completed),
            current: Boolean(!step.is_completed && (idx === 0 || arr[idx - 1]?.is_completed)),
            desc: step.tracking_number
              ? `${step.carrier || "Carrier"} (${step.tracking_number})`
              : step.step,
          }));
      const shipping = data.shipping || {};
      setSelectedTrackingOrder({
        ...order,
        trackingSteps: steps,
        awb: shipping.awb || null,
        carrier: shipping.carrier || null,
        shippingStatus: shipping.shipping_status
          ? String(shipping.shipping_status).replace(/_/g, " ")
          : null,
        shippingEvents: data.shipping_events || [],
      });
    } catch (error) {
      /* keep modal open with fallback message */
    }
  };

  const open3DFilesModal = async () => {
    setShow3DModal(true);
    setPrintFilesLoading(true);
    try {
      const response = await profileService.getPrintFiles();
      setPrintFiles(response.data?.files || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load 3D print files");
      setPrintFiles([]);
    } finally {
      setPrintFilesLoading(false);
    }
  };

  // Handlers
  const handleLogout = () => {
    toast.info("You have logged out successfully.");
    authServices.logout();
  };

  const handleBuyAgain = async (order) => {
    if (order.is3DPrint) {
      toast.info("Custom prints can't be reordered from here. Upload the model again from 3D Printing.");
      navigate("/3d-printing");
      return;
    }
    try {
      await orderService.reorder(order.id);
      toast.success(`Items from Order #${order.id} added to your cart!`);
      syncCartBadge();
      navigate("/cart");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to reorder");
    }
  };

  const handleCancelOrder = async (order) => {
    if (!window.confirm(`Cancel Order #${order.id}? This cannot be undone.`)) return;
    try {
      const response = await orderService.cancelOrder(order.id);
      toast.success(response.data?.message || `Order #${order.id} cancelled`);
      await reloadOrders();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to cancel order");
    }
  };

  const handleDownloadInvoice = async (orderOrId) => {
    try {
      const orderObj = typeof orderOrId === "object" ? orderOrId : orders.find((o) => String(o.id) === String(orderOrId));
      const orderId = typeof orderOrId === "object" ? orderOrId.id : orderOrId;
      const isPrint =
        Boolean(orderObj?.is3DPrint) || /^3D/i.test(String(orderId || "").replace(/^#/, ""));
      const filename = isPrint
        ? await printingService.downloadInvoicePdf(orderId)
        : await orderService.downloadInvoicePdf(orderId);
      toast.success(`Invoice ${filename} downloaded.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to fetch invoice");
    }
  };

  // Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      if (activeTab === "Processing" && order.status !== "Processing") return false;
      if (activeTab === "Shipped" && order.status !== "Shipped") return false;
      if (activeTab === "Delivered" && order.status !== "Delivered") return false;
      if (activeTab === "Cancelled" && order.status !== "Cancelled") return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = order.id.toLowerCase().includes(query);
        const matchesSummary = order.itemsSummary.toLowerCase().includes(query);
        const matchesItems = order.allItems.some((item) =>
          item.name.toLowerCase().includes(query)
        );
        if (!matchesId && !matchesSummary && !matchesItems) return false;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: orders.length,
      processing: orders.filter((o) => o.status === "Processing").length,
      shipped: orders.filter((o) => o.status === "Shipped").length,
      delivered: orders.filter((o) => o.status === "Delivered").length,
      cancelled: orders.filter((o) => o.status === "Cancelled").length,
    };
  }, [orders]);

  return (
    <div className="orders-page-wrapper">
      <div className="orders-container">
        <div className="orders-main-grid">
          {/* =====================================================
              LEFT SIDEBAR
              Strictly contains:
              1. My Profile
              2. My Orders (active)
              3. Addresses
              4. 3D Print Files
              5. Logout
              ===================================================== */}
          {/* =====================================================
              LEFT SIDEBAR
              Strictly contains (single unified card matching design):
              1. User Profile Header (Avatar DD, Name, Email, Edit Profile)
              2. My Profile
              3. My Orders (active)
              4. Addresses (navigates to /profile#addresses and scrolls to address section)
              5. 3D Print Files
              --- Divider ---
              6. Logout
              ===================================================== */}
          <aside className="orders-sidebar">
            <div className="orders-sidebar-card">
              {/* User Profile Header */}
              <div className="orders-user-profile-header">
                <div className="orders-user-avatar">{user.initials}</div>
                <div className="orders-user-info">
                  <span className="orders-user-name">{user.name}</span>
                  <span className="orders-user-email">{user.email}</span>
                  <Link to="/profile" className="orders-edit-profile-link">
                    Edit Profile
                  </Link>
                </div>
              </div>

              {/* Navigation Menu */}
              <ul className="orders-nav-menu">
                <li className="orders-nav-item">
                  <Link to="/profile" className="orders-nav-link">
                    <span className="orders-nav-icon">
                      <User size={18} />
                    </span>
                    <span>My Profile</span>
                  </Link>
                </li>

                <li className="orders-nav-item">
                  <Link to="/orders" className="orders-nav-link active">
                    <span className="orders-nav-icon">
                      <ShoppingBag size={18} />
                    </span>
                    <span>My Orders</span>
                  </Link>
                </li>

                <li className="orders-nav-item">
                  <Link
                    to="/profile#addresses"
                    state={{ scrollTo: "addresses" }}
                    className="orders-nav-link"
                  >
                    <span className="orders-nav-icon">
                      <MapPin size={18} />
                    </span>
                    <span>Addresses</span>
                  </Link>
                </li>

                <li className="orders-nav-item">
                  <button
                    type="button"
                    className="orders-nav-link"
                    onClick={() => setShow3DModal(true)}
                  >
                    <span className="orders-nav-icon">
                      <Box size={18} />
                    </span>
                    <span>3D Print Files</span>
                  </button>
                </li>

                <li className="orders-nav-divider-item" role="separator">
                  <div className="orders-nav-divider" />
                </li>

                <li className="orders-nav-item">
                  <button
                    type="button"
                    className="orders-nav-link logout-btn"
                    onClick={handleLogout}
                  >
                    <span className="orders-nav-icon">
                      <LogOut size={18} />
                    </span>
                    <span>Logout</span>
                  </button>
                </li>
              </ul>
            </div>
          </aside>

          {/* =====================================================
              TOP HEADER (Spans Columns 2 & 3 above Right Sidebar)
              - "My Orders" + Subtitle on the left
              - Large gap in the middle
              - Search + "Last 6 Months" on the right, directly above "Need Help?"
              ===================================================== */}
          <div className="orders-top-header">
            <div className="orders-title-text">
              <h1>My Orders</h1>
              <p>Track, view and manage all your orders in one place.</p>
            </div>

            <div className="orders-controls-group">
              {/* Search Input */}
              <div className="orders-search-wrapper">
                <input
                  type="text"
                  className="orders-search-input"
                  placeholder="Search by order ID, product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="orders-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <Search size={16} className="orders-search-icon" />
                )}
              </div>

              {/* Time Range Dropdown (Positioned directly above Need Help?) */}
              <div className="orders-time-select-wrapper">
                <select
                  className="orders-time-select"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                >
                  <option value="Last 30 Days">Last 30 Days</option>
                  <option value="Last 3 Months">Last 3 Months</option>
                  <option value="Last 6 Months">Last 6 Months</option>
                  <option value="2024">2024</option>
                  <option value="2023">2023</option>
                  <option value="All Time">All Time</option>
                </select>
                <ChevronDown size={14} className="orders-select-chevron" />
              </div>
            </div>
          </div>

          {/* =====================================================
              MIDDLE CONTENT (MY ORDERS FEED)
              ===================================================== */}
          <main className="orders-content">
            {/* Filter Tabs */}
            <div className="orders-tabs-bar">
              {[
                { key: "All Orders", label: "All Orders" },
                { key: "Processing", label: "Processing" },
                { key: "Shipped", label: "Shipped" },
                { key: "Delivered", label: "Delivered" },
                { key: "Cancelled", label: "Cancelled" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`orders-tab-btn ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Orders Feed Cards */}
            <div className="orders-list">
              {loading ? (
                <div className="orders-empty-state text-center py-5">
                  <RefreshCw className="animate-spin text-muted mb-2 mx-auto" size={32} />
                  <p className="text-muted">Loading your orders...</p>
                </div>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const statusClass =
                    order.status === "Delivered"
                      ? "delivered"
                      : order.status === "Processing"
                        ? "in-production"
                        : order.status === "Shipped"
                          ? "shipped"
                          : "cancelled";

                  return (
                    <div className="order-card" key={order.id}>
                      {/* Top Bar: Order # and Date */}
                      <div className="order-card-header">
                        <div className="order-header-left">
                          <span className="order-id-label">Order #{order.id}</span>
                          <span className="order-date-label">{order.date}</span>
                        </div>
                      </div>

                      {/* Card Content Grid */}
                      <div className="order-card-body">
                        {/* Thumbnails + Description */}
                        <div className="order-products-preview">
                          <div className="order-thumbnails-strip">
                            {order.thumbnails.map((item, idx) => (
                              <div
                                className="order-thumb-box"
                                key={idx}
                                title={item.name}
                              >
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = item.isPrint ? "/images/rocket.png" : "/images/products/01.png";
                                  }}
                                />
                              </div>
                            ))}
                            {order.overflowCount > 0 && (
                              <div className="order-thumb-overflow">
                                +{order.overflowCount}
                              </div>
                            )}
                          </div>

                          <div className="order-summary-meta">
                            {order.is3DPrint ? (
                              <>
                                <span className="order-items-count">
                                  3D Printing Order
                                </span>
                                <span className="order-products-text">
                                  {order.itemsSummary}
                                </span>
                                {order.specsText && (
                                  <span className="order-specs-text">
                                    {order.specsText}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="order-items-count">
                                  {order.itemCountText}
                                </span>
                                <span className="order-products-text">
                                  {order.itemsSummary}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status Column */}
                        <div className="order-status-col">
                          <span className={`order-status-badge ${statusClass}`}>
                            {order.status === "Delivered" && <CheckCircle2 size={15} />}
                            {order.status === "Processing" && <Box size={15} />}
                            {order.status === "Shipped" && <Truck size={15} />}
                            {order.status === "Cancelled" && <XCircle size={15} />}
                            <span>{order.statusText || order.status}</span>
                          </span>
                          <span className="order-status-date">
                            {order.statusDate}
                          </span>
                        </div>

                        {/* Price & Action Buttons */}
                        <div className="order-actions-col">
                          <span className="order-price-val">
                            ₹{order.totalPrice.toLocaleString("en-IN")}
                          </span>

                          <div className="order-buttons-group">
                            {order.status === "Shipped" && (
                              <button
                                type="button"
                                className="order-btn-outline"
                                onClick={() => openTrackingModal(order)}
                              >
                                Track Order
                              </button>
                            )}

                            <button
                              type="button"
                              className="order-btn-outline"
                              onClick={() => navigate(`/orders/${order.id}`)}
                            >
                              View Details
                            </button>

                            {order.canCancel && !order.is3DPrint && (
                              <button
                                type="button"
                                className="order-btn-outline order-btn-cancel"
                                onClick={() => handleCancelOrder(order)}
                              >
                                Cancel Order
                              </button>
                            )}

                            {order.status === "Delivered" && (
                              <button
                                type="button"
                                className="order-btn-primary"
                                onClick={() => handleBuyAgain(order)}
                              >
                                Buy Again
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="orders-empty-state">
                  <div className="orders-empty-icon">
                    <Package size={32} />
                  </div>
                  <h3>No Orders Found</h3>
                  <p>
                    {searchQuery
                      ? `No orders matching "${searchQuery}". Try another keyword or clear search.`
                      : `You don't have any orders in "${activeTab}".`}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      className="order-btn-outline"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* =====================================================
              RIGHT SIDEBAR
              Need Help? + Quick Actions + 3D Bottle Promo Card
              ===================================================== */}
          <aside className="orders-right-aside">
            {/* Need Help Card */}
            <div className="orders-aside-card orders-help-card">
              <div className="orders-help-top">
                <Headset size={36} strokeWidth={2.2} className="orders-help-icon" />
                <div className="orders-help-text">
                  <h3 className="orders-help-title">Need Help?</h3>
                  <p className="orders-help-desc">
                    Have questions about your order? Our support team is here to help.
                  </p>
                </div>
              </div>
              <Link to="/contact" className="orders-help-btn">
                Contact Support
              </Link>
            </div>

            {/* Quick Actions Card */}
            <div className="orders-aside-card orders-quick-card">
              <h3 className="orders-quick-title">Quick Actions</h3>
              <ul className="orders-quick-list">
                <li>
                  <button
                    type="button"
                    className="orders-quick-item-btn"
                    onClick={() => {
                      if (orders.find((o) => o.status === "Shipped")) {
                        setSelectedTrackingOrder(
                          orders.find((o) => o.status === "Shipped")
                        );
                      } else {
                        setSelectedTrackingOrder(orders[0]);
                      }
                    }}
                  >
                    <span className="orders-quick-icon">
                      <Truck size={22} strokeWidth={2.1} />
                    </span>
                    <span className="orders-quick-text">Track an Order</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="orders-quick-item-btn"
                    onClick={() => navigate("/contact")}
                  >
                    <span className="orders-quick-icon">
                      <RefreshCw size={21} strokeWidth={2.1} />
                    </span>
                    <span className="orders-quick-text">Request Return / Replacement</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="orders-quick-item-btn"
                    onClick={() => {
                      const invoicable = orders.find((o) => !o.is3DPrint) || orders[0];
                      if (!invoicable) {
                        toast.info("No orders with invoices yet.");
                        return;
                      }
                      handleDownloadInvoice(invoicable);
                    }}
                  >
                    <span className="orders-quick-icon">
                      <FileDown size={22} strokeWidth={2.1} />
                    </span>
                    <span className="orders-quick-text">Download Invoice</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="orders-quick-item-btn"
                    onClick={open3DFilesModal}
                  >
                    <span className="orders-quick-icon">
                      <Box size={22} strokeWidth={2.1} />
                    </span>
                    <span className="orders-quick-text">View 3D Print Files</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="orders-quick-item-btn"
                    onClick={() => setShowAddressModal(true)}
                  >
                    <span className="orders-quick-icon">
                      <MapPin size={22} strokeWidth={2.1} />
                    </span>
                    <span className="orders-quick-text">Manage Addresses</span>
                  </button>
                </li>
              </ul>
            </div>

            {/* 3D Print Promo Card with Blue Bottle Visual */}
            <div className="orders-promo-card">
              <div className="orders-promo-top">
                <div className="orders-promo-image-wrap">
                  <img
                    src="/images/My_ORDERS_PAGE_BOTTLE_IMAGE.png"
                    alt="3D Printed Vase"
                    className="orders-promo-image"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "/images/products/01.png";
                    }}
                  />
                </div>
                <div className="orders-promo-content">
                  <h3 className="orders-promo-title">Bring Your Ideas to Life</h3>
                  <p className="orders-promo-desc">
                    Upload your 3D models and get high-quality prints delivered to your door.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="orders-promo-btn"
                onClick={() => {
                  toast.success("Ready to create! Redirecting to 3D Print customizer...");
                }}
              >
                Start a 3D Print Order
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* =====================================================
          ORDER DETAILS MODAL
          ===================================================== */}
      {selectedOrderDetails && (
        <div
          className="orders-modal-backdrop"
          onClick={() => setSelectedOrderDetails(null)}
        >
          <div
            className="orders-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="orders-modal-header">
              <div>
                <h3>Order #{selectedOrderDetails.id}</h3>
                <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  Placed on {selectedOrderDetails.date}
                </span>
              </div>
              <button
                className="orders-modal-close-btn"
                onClick={() => setSelectedOrderDetails(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="orders-modal-body">
              {/* Shipping & Payment summary */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  fontSize: "0.85rem",
                }}
              >
                <div>
                  <strong style={{ display: "block", color: "#0f172a", marginBottom: 3 }}>
                    Delivery Address:
                  </strong>
                  <span style={{ color: "#475569" }}>
                    {selectedOrderDetails.shippingAddress}
                  </span>
                </div>
                <div>
                  <strong style={{ display: "block", color: "#0f172a", marginBottom: 3 }}>
                    Payment Method:
                  </strong>
                  <span style={{ color: "#475569" }}>
                    {selectedOrderDetails.paymentMethod}
                  </span>
                  <div style={{ marginTop: 6 }}>
                    <span
                      style={{
                        fontSize: "0.76rem",
                        padding: "2px 8px",
                        background: "#dcfce7",
                        color: "#166534",
                        borderRadius: "10px",
                        fontWeight: 600,
                      }}
                    >
                      Payment Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Items list */}
              <div>
                <strong
                  style={{
                    display: "block",
                    fontSize: "0.92rem",
                    color: "#0f172a",
                    marginBottom: 8,
                  }}
                >
                  Items in this Order ({selectedOrderDetails.allItems.length}):
                </strong>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {selectedOrderDetails.allItems.map((item, idx) => (
                    <div className="orders-modal-item-row" key={idx}>
                      <img
                        src={item.image}
                        alt={item.name}
                        className="orders-modal-item-img"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = item.isPrint ? "/images/rocket.png" : "/images/products/01.png";
                        }}
                      />
                      <div className="orders-modal-item-info">
                        <div className="orders-modal-item-name">{item.name}</div>
                        <div className="orders-modal-item-qty">
                          Quantity: {item.qty}
                        </div>
                      </div>
                      <div className="orders-modal-item-price">
                        ₹{item.price.toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Breakdown */}
              <div
                style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: "0.88rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                  <span>Item Subtotal</span>
                  <span>₹{selectedOrderDetails.totalPrice.toLocaleString("en-IN")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                  <span>Shipping & Handling</span>
                  {Number(selectedOrderDetails.shippingCost || 0) === 0 ? (
                    <span style={{ color: "#10b981", fontWeight: 600 }}>FREE</span>
                  ) : (
                    <span>₹{Number(selectedOrderDetails.shippingCost).toLocaleString("en-IN")}</span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    fontSize: "1.05rem",
                    color: "#0f172a",
                    borderTop: "1px solid #f1f5f9",
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <span>Grand Total</span>
                  <span>₹{selectedOrderDetails.totalPrice.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            <div className="orders-modal-footer">
              <button
                type="button"
                className="order-btn-outline"
                onClick={() => handleDownloadInvoice(selectedOrderDetails)}
              >
                <Download size={14} style={{ marginRight: 6 }} />
                Invoice
              </button>
              <button
                type="button"
                className="order-btn-primary"
                onClick={() => {
                  setSelectedTrackingOrder(selectedOrderDetails);
                  setSelectedOrderDetails(null);
                }}
              >
                Track Shipment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          TRACK ORDER MODAL
          ===================================================== */}
      {selectedTrackingOrder && (
        <div
          className="orders-modal-backdrop"
          onClick={() => setSelectedTrackingOrder(null)}
        >
          <div
            className="orders-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="orders-modal-header">
              <div>
                <h3>Tracking Order #{selectedTrackingOrder.id}</h3>
                <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                  Status: {selectedTrackingOrder.statusText || selectedTrackingOrder.status}
                </span>
              </div>
              <button
                className="orders-modal-close-btn"
                onClick={() => setSelectedTrackingOrder(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="orders-modal-body">
              {selectedTrackingOrder.awb && (
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
                  <span style={{ fontFamily: "monospace" }}>{selectedTrackingOrder.awb}</span>
                  {selectedTrackingOrder.carrier && (
                    <span style={{ color: "#475569" }}>• {selectedTrackingOrder.carrier}</span>
                  )}
                  {selectedTrackingOrder.shippingStatus && (
                    <span style={{ color: "#0759d6", fontWeight: 600 }}>
                      • {selectedTrackingOrder.shippingStatus}
                    </span>
                  )}
                </div>
              )}
              <div className="tracking-stepper">
                {selectedTrackingOrder.trackingSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`tracking-step ${step.completed ? "completed" : ""
                      } ${step.current ? "current" : ""}`}
                  >
                    <div className="tracking-step-dot">
                      {step.completed ? "✓" : idx + 1}
                    </div>
                    <div className="tracking-step-content">
                      <span className="tracking-step-title">{step.title}</span>
                      <span className="tracking-step-time">{step.time}</span>
                      <span className="tracking-step-desc">{step.desc}</span>
                    </div>
                  </div>
                ))}
                {selectedTrackingOrder.trackingSteps.length === 0 && (
                  <div style={{ padding: "12px 4px", color: "#64748b", fontSize: "0.88rem" }}>
                    Tracking timeline will appear here once the order ships.
                  </div>
                )}
              </div>
            </div>

            <div className="orders-modal-footer">
              <button
                type="button"
                className="order-btn-outline"
                onClick={() => setSelectedTrackingOrder(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="order-btn-primary"
                onClick={async () => {
                  try {
                    await profileService.updatePreferences({ order_updates: true });
                    toast.success("Order status notifications enabled!");
                  } catch (error) {
                    toast.error(error?.response?.data?.message || "Unable to update notification preference");
                  } finally {
                    setSelectedTrackingOrder(null);
                  }
                }}
              >
                Subscribe for Updates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ADDRESSES MODAL (FOR SIDEBAR / QUICK ACTION)
          ===================================================== */}
      {showAddressModal && (
        <div
          className="orders-modal-backdrop"
          onClick={() => setShowAddressModal(false)}
        >
          <div
            className="orders-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="orders-modal-header">
              <h3>Saved Delivery Addresses</h3>
              <button
                className="orders-modal-close-btn"
                onClick={() => setShowAddressModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="orders-modal-body">
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>Current Delivery Address</strong></div>
                <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "#475569" }}>{user.name} {user.email ? `(${user.email})` : ""}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>{selectedOrderDetails?.shippingAddress || "Delivery address registered on account"}</p>
              </div>
            </div>
            <div className="orders-modal-footer">
              <button
                type="button"
                className="order-btn-outline"
                onClick={() => {
                  setShowAddressModal(false);
                  navigate("/profile");
                }}
              >
                Edit in Profile
              </button>
              <button
                type="button"
                className="order-btn-primary"
                onClick={() => {
                  setShowAddressModal(false);
                  navigate("/profile#addresses");
                }}
              >
                Add New Address
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          3D PRINT FILES MODAL (FOR SIDEBAR / QUICK ACTION)
          ===================================================== */}
      {show3DModal && (
        <div
          className="orders-modal-backdrop"
          onClick={() => setShow3DModal(false)}
        >
          <div
            className="orders-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="orders-modal-header">
              <h3>My 3D Print Files</h3>
              <button
                className="orders-modal-close-btn"
                onClick={() => setShow3DModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="orders-modal-body">
              {printFilesLoading ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                  Loading your files...
                </div>
              ) : printFiles.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                  No 3D print files yet. Place a print order to see your models here.
                </div>
              ) : (
                printFiles.map((file) => (
                  <div
                    key={file.order_id || file.file_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 14px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      background: "#f8fafc",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "8px",
                        background: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Box size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {file.file_name}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {file.file_size ? `${file.file_size} • ` : ""}
                        {file.created_at ? `Ordered ${new Date(file.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} • ` : ""}
                        {file.material_name || "3D Print"}
                        {file.status ? ` • ${String(file.status).replace(/_/g, " ")}` : ""}
                      </div>
                    </div>
                    {file.file_url ? (
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="order-btn-outline"
                        style={{ padding: "5px 10px", fontSize: "0.8rem", textDecoration: "none" }}
                        title="Download original model file"
                      >
                        <Download size={14} />
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="orders-modal-footer">
              <button
                type="button"
                className="order-btn-outline"
                onClick={() => setShow3DModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="order-btn-primary"
                onClick={() => {
                  setShow3DModal(false);
                  navigate("/3d-printing");
                }}
              >
                Upload New Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;
