import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowUpDown,
  Ban,
  BarChart3,
  Box,
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Copy,
  CirclePause,
  Cpu,
  Cuboid,
  Cylinder,
  Filter,
  Layers,
  Lightbulb,
  Palette,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  ShieldCheck,
  Plus,
  Pencil,
  Tag,
  Ticket,
  Trash2,
  Power,
  Users,
  X,
  Eye,
  User,
  MapPin,
  CreditCard,
  FileText,
  MoreVertical,
  Package,
  Printer,
  Truck,
  CheckCircle2,
  Clock,
  Wrench,
  XCircle,
  ArrowLeft,
  Download,
  BadgePercent,
  Star,
  Mail,
  MessageSquare,
  Megaphone,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Link2,
  Image as ImageIcon,
  Globe2,
  Upload,
} from "lucide-react";
import adminService from "../services/admin.service";
import ManualOrders from "../components/admin/ManualOrders";
import "../../public/css/admin.css";

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const statusOptions = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];
const printStatusOptions = [
  "pending",
  "confirmed",
  "reviewing",
  "in_production",
  "printing",
  "quality_check",
  "shipped",
  "delivered",
  "cancelled",
];

/* ===== Helper: parse newline separated fields from admin forms ===== */
const parseLines = (text = "") => text.split("\n").map((s) => s.trim()).filter(Boolean);

const parseSpecs = (text = "") => {
  const specs = {};
  parseLines(text).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) specs[key] = value;
    }
  });
  return specs;
};

const parseResources = (text = "") =>
  parseLines(text)
    .map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length >= 2) {
        return parts.length >= 3
          ? { name: parts[0], type: parts[1], url: parts.slice(2).join("|") }
          : { name: parts[0], type: "link", url: parts[parts.length - 1] };
      }
      return null;
    })
    .filter(Boolean);

const parseFaqs = (text = "") =>
  parseLines(text)
    .map((line) => {
      const idx = line.indexOf("|");
      if (idx > 0) {
        return { q: line.slice(0, idx).trim(), a: line.slice(idx + 1).trim() };
      }
      return null;
    })
    .filter(Boolean);

const specsToText = (specs) => {
  if (!specs) return "";
  if (Array.isArray(specs)) {
    return specs
      .map((pair) => (pair && pair.label ? `${pair.label}: ${pair.value}` : ""))
      .filter(Boolean)
      .join("\n");
  }
  return Object.entries(specs)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
};

const resourcesToText = (resources) => {
  if (!resources) return "";
  return resources
    .map((r) => (r && r.name ? `${r.name} | ${r.type || "link"} | ${r.url || ""}` : ""))
    .filter(Boolean)
    .join("\n");
};

function AdminPanel() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [printSubTab, setPrintSubTab] = useState("orders");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [printStatusFilter, setPrintStatusFilter] = useState("all");
  const [colorSearch, setColorSearch] = useState("");
  const [colorStatusFilter, setColorStatusFilter] = useState("all");
  const [colorPage, setColorPage] = useState(1);
  const [colorPerPage, setColorPerPage] = useState(10);
  const [printSearch, setPrintSearch] = useState("");
  const [printMaterialFilter, setPrintMaterialFilter] = useState("all");
  const [printDateFilter, setPrintDateFilter] = useState("");
  const [printPage, setPrintPage] = useState(1);
  const [printPerPage, setPrintPerPage] = useState(10);
  const [selectedPrintIds, setSelectedPrintIds] = useState([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState("all");
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPerPage, setMaterialPerPage] = useState(10);
  const [couponSearch, setCouponSearch] = useState("");
  const [couponStatusFilter, setCouponStatusFilter] = useState("all");
  const [couponPage, setCouponPage] = useState(1);
  const [couponPerPage, setCouponPerPage] = useState(10);
  const [selectedCouponIds, setSelectedCouponIds] = useState([]);
  const [showCouponTip, setShowCouponTip] = useState(true);
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState("all");
  const [productPage, setProductPage] = useState(1);
  const [productPerPage, setProductPerPage] = useState(10);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState("all");
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPerPage, setCategoryPerPage] = useState(10);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState("all");
  const [showOrderFilters, setShowOrderFilters] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPerPage, setOrderPerPage] = useState(10);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [showOrderTip, setShowOrderTip] = useState(true);
  const [orderMenuId, setOrderMenuId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({});
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [printOrders, setPrintOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [colors, setColors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [banners, setBanners] = useState([]);
  const [siteSettings, setSiteSettings] = useState({});
  const [salesChart, setSalesChart] = useState({ monthlySales: [], statusDistribution: [] });
  const [activeModal, setActiveModal] = useState(null);
  const [editing, setEditing] = useState(null); // { type, id } when editing an existing record
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [selectedPrintOrderDetail, setSelectedPrintOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    tagline: "",
    category_id: "",
    brand_id: "",
    price: "",
    compare_price: "",
    stock: "",
    short_description: "",
    description: "",
    keyFeaturesText: "",
    specificationsText: "",
    applicationsText: "",
    resourcesText: "",
    faqsText: "",
    pinout_description: "",
    pinoutImageFile: null,
    galleryFiles: [],
    is_featured: false,
    is_active: true,
  });
  const [existingGallery, setExistingGallery] = useState([]);
  const [existingPinout, setExistingPinout] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: "",
    min_order_amount: 0,
    max_discount: "",
    usage_limit: "",
    valid_from: "",
    valid_until: "",
    is_active: true,
    show_in_announcement: false,
  });
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", is_active: true });
  const [materialForm, setMaterialForm] = useState({
    name: "",
    code: "",
    description: "",
    price_per_gram: "",
    density_g_cm3: "1.24",
    is_active: true,
  });
  const [colorForm, setColorForm] = useState({
    name: "",
    hex_code: "#0b6bdc",
    is_active: true,
  });
  const [userForm, setUserForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    role: "customer",
    is_active: true,
  });
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [userPerPage, setUserPerPage] = useState(10);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [showUserTip, setShowUserTip] = useState(true);
  const [brandForm, setBrandForm] = useState({
    name: "",
    description: "",
    website_url: "",
    logoFile: null,
    is_active: true,
  });
  const [bannerForm, setBannerForm] = useState({
    title: "",
    subtitle: "",
    link_url: "",
    button_text: "Shop Now",
    sort_order: 0,
    imageFile: null,
    is_active: true,
  });
  const [settingsForm, setSettingsForm] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [shipStatus, setShipStatus] = useState(null);
  const [whLoading, setWhLoading] = useState(false);
  const [whInfo, setWhInfo] = useState(null);
  const [whVerifyName, setWhVerifyName] = useState("");
  const [whVerifying, setWhVerifying] = useState(false);

  const loadShipStatus = async () => {
    try {
      const res = await adminService.getShippingStatus();
      setShipStatus(res.data?.data || null);
    } catch {
      setShipStatus(null);
    }
  };

  const fetchWarehouses = async () => {
    setWhLoading(true);
    try {
      const res = await adminService.getWarehouses();
      setWhInfo(res.data?.data || null);
      const h = res.data?.data?.token_health;
      if (h) {
        toast.info(
          `Token check — staging: ${h.staging?.ok ? "OK" : "FAIL"} • production: ${h.production?.ok ? "OK" : "FAIL"}`
        );
      }
      if (!res.data?.data?.supported) {
        toast.warn("Delhivery has no list-all-warehouses API — copy the name from the portal, then Verify & Save below.");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Warehouse fetch failed");
    } finally {
      setWhLoading(false);
    }
  };

  const verifyAndSaveWarehouse = async () => {
    const candidate = (whVerifyName || settingsForm?.delhivery_pickup_name || "").trim();
    if (!candidate) {
      toast.error("Enter the exact warehouse name from your Delhivery portal first");
      return;
    }
    setWhVerifying(true);
    try {
      const res = await adminService.verifyWarehouse({
        name: candidate,
        save: true,
        pincode: settingsForm?.delhivery_pickup_pincode || undefined,
        phone: settingsForm?.delhivery_pickup_phone || undefined,
        city: settingsForm?.delhivery_pickup_city || undefined,
        state: settingsForm?.delhivery_pickup_state || undefined,
        address: settingsForm?.delhivery_pickup_address || undefined,
      });
      toast.success(res.data?.message || "Warehouse verified & saved");
      setSettingsForm((p) => ({ ...p, delhivery_pickup_name: candidate }));
      loadShipStatus();
    } catch (e) {
      toast.error(e.response?.data?.message || "Warehouse not found in Delhivery");
    } finally {
      setWhVerifying(false);
    }
  };

  useEffect(() => {
    if (activeTab === "settings") loadShipStatus();
  }, [activeTab]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [
        statsRes,
        productsRes,
        ordersRes,
        printOrdersRes,
        usersRes,
        couponsRes,
        categoriesRes,
        materialsRes,
        colorsRes,
        brandsRes,
        reviewsRes,
        subscribersRes,
        contactsRes,
        bannersRes,
        settingsRes,
        salesChartRes,
      ] = await Promise.all([
        adminService.getStats(),
        adminService.getProducts({ limit: 50 }),
        adminService.getOrders({ limit: 50 }),
        adminService.getPrintOrders({ limit: 50 }),
        adminService.getUsers({ limit: 50 }),
        adminService.getCoupons(),
        adminService.getCategories(),
        adminService.getMaterials(),
        adminService.getColors(),
        adminService.getBrands(),
        adminService.getReviews({ limit: 50 }),
        adminService.getSubscribers({ limit: 50 }),
        adminService.getContacts({ limit: 50 }),
        adminService.getBanners(),
        adminService.getSettings(),
        adminService.getSalesChart(),
      ]);

      setStats(statsRes.data.data || {});
      setProducts(productsRes.data.data?.products || []);
      setOrders(ordersRes.data.data?.orders || []);
      setPrintOrders(printOrdersRes.data.data?.orders || []);
      setUsers(usersRes.data.data?.users || []);
      setCoupons(couponsRes.data.data || []);
      setCategories(categoriesRes.data.categories || []);
      setMaterials(materialsRes.data.data || []);
      setColors(colorsRes.data.data || []);
      setBrands(brandsRes.data.data || []);
      setReviews(reviewsRes.data.data?.reviews || []);
      setSubscribers(subscribersRes.data.data?.subscribers || []);
      setContacts(contactsRes.data.data?.messages || []);
      setBanners(bannersRes.data.data || bannersRes.data.banners || []);
      const settingsMap = settingsRes.data.data || {};
      setSiteSettings(settingsMap);
      setSalesChart({
        monthlySales: salesChartRes.data?.data?.monthlySales || [],
        statusDistribution: salesChartRes.data?.data?.statusDistribution || [],
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const getStockState = (product) => {
    const qty = Number(product.stock || 0);
    if (qty <= 0) return "out";
    const threshold = Number(product.low_stock_threshold ?? 5);
    if (qty <= threshold) return "low";
    return "in";
  };

  const STOCK_META = {
    in: { label: "In Stock", tone: "in" },
    low: { label: "Low Stock", tone: "low" },
    out: { label: "Out of Stock", tone: "out" },
  };

  const CATEGORY_TONES = ["blue", "green", "purple", "pink", "amber"];
  const categoryTone = (name = "") => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return CATEGORY_TONES[h % CATEGORY_TONES.length];
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !q ||
        [product.name, product.sku, product.category_name, product.brand_name]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(q));
      const matchesCategory =
        productCategoryFilter === "all" ||
        String(product.category_id) === String(productCategoryFilter) ||
        (product.category_name || "").toLowerCase() === String(productCategoryFilter).toLowerCase();
      const state = getStockState(product);
      const matchesStatus =
        productStatusFilter === "all" ||
        (productStatusFilter === "inactive" ? !(product.is_active ?? true) : state === productStatusFilter);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, productCategoryFilter, productStatusFilter]);

  const productStats = useMemo(() => {
    const total = (products || []).length;
    const inCount = (products || []).filter((p) => getStockState(p) === "in").length;
    const lowCount = (products || []).filter((p) => getStockState(p) === "low").length;
    const outCount = (products || []).filter((p) => getStockState(p) === "out").length;
    const now = new Date();
    const thisMonth = (products || []).filter((p) => {
      const d = new Date(p.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = (products || []).filter((p) => {
      const d = new Date(p.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    }).length;
    const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : thisMonth > 0 ? 100 : 0;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, inCount, lowCount, outCount, growth, pct };
  }, [products]);

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / productPerPage));
  const safeProductPage = Math.min(productPage, productTotalPages);
  const paginatedProducts = filteredProducts.slice(
    (safeProductPage - 1) * productPerPage,
    safeProductPage * productPerPage
  );

  const toggleProductSelect = (id) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleProductSelectAll = () => {
    const pageIds = paginatedProducts.map((p) => p.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  const deleteProduct = async (id) => {
    try {
      await adminService.deleteProduct(id);
      toast.success("Product deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Product delete failed");
    }
  };

  const duplicateProduct = async (id) => {
    try {
      const res = await adminService.getProductById(id);
      const p = res.data.data || {};
      // Prefill the Add Product modal — images can't be cloned (files only),
      // so the admin reviews details and re-attaches images before saving.
      setProductForm({
        name: p.name ? `${p.name} Copy` : "Copy",
        sku: p.sku ? `${p.sku}-COPY` : "",
        tagline: p.tagline || "",
        category_id: p.category_id || "",
        brand_id: p.brand_id || "",
        price: p.price || "",
        compare_price: p.compare_price || "",
        stock: p.stock ?? "",
        short_description: p.short_description || "",
        description: p.description || "",
        keyFeaturesText: (Array.isArray(p.key_features) ? p.key_features : []).join("\n"),
        specificationsText: specsToText(p.specifications),
        applicationsText: (Array.isArray(p.applications) ? p.applications : []).join("\n"),
        resourcesText: resourcesToText(p.resources),
        faqsText: (Array.isArray(p.faqs) ? p.faqs : [])
          .map((f) => `${f.q || f.question || ""}|${f.a || f.answer || ""}`)
          .join("\n"),
        pinout_description: p.pinout_description || "",
        pinoutImageFile: null,
        galleryFiles: [],
        is_featured: false,
        is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
      });
      setEditing(null);
      setActiveModal("product");
      toast.info("Review the duplicated details and save");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to duplicate product");
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    const mb = Number(bytes) / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;
  };

  const handlePinoutSelect = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Pinout file must be under 5MB");
      return;
    }
    setProductForm((prev) => ({ ...prev, pinoutImageFile: file }));
  };

  const handleGallerySelect = (files) => {
    const picked = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!picked.length) return;
    const room = 5 - existingGallery.length - productForm.galleryFiles.length;
    if (room <= 0) {
      toast.error("Gallery is full (max 5 images). Remove one first.");
      return;
    }
    if (picked.length > room) {
      toast.info(`Only ${room} more image(s) fit in the gallery`);
    }
    const accepted = picked.slice(0, room).filter((f) => {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 5MB and was skipped`);
        return false;
      }
      return true;
    });
    if (accepted.length) {
      accepted.forEach((f) => {
        f.preview = URL.createObjectURL(f);
      });
      setProductForm((prev) => ({ ...prev, galleryFiles: [...prev.galleryFiles, ...accepted] }));
    }
  };

  const removeExistingGalleryImage = async (imageId) => {
    try {
      await adminService.deleteProductImage(imageId);
      setExistingGallery((prev) => prev.filter((img) => img.id !== imageId));
      toast.success("Gallery image removed");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Image remove failed");
    }
  };

  const setPrimaryGalleryImage = async (productId, imageId) => {
    try {
      await adminService.setPrimaryProductImage(productId, imageId);
      setExistingGallery((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId ? 1 : 0 })));
      toast.success("Primary image updated");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Primary image update failed");
    }
  };

  const isCategoryActive = (category) =>
    category.is_active === undefined ? true : Boolean(category.is_active);

  const categoryIconFor = (name = "") => {
    const n = String(name).toLowerCase();
    if (n.includes("spare")) return Package;
    if (n.includes("3d printer")) return Printer;
    if (n.includes("printer") || n.includes("part") || n.includes("nozzle")) return Cog;
    if (n.includes("accessor") || n.includes("tool") || n.includes("lubricant")) return Wrench;
    if (n.includes("micro") || n.includes("controller") || n.includes("electronic")) return Cpu;
    if (n.includes("filament") || n.includes("material")) return Cylinder;
    return Box;
  };

  const categoryStats = useMemo(() => {
    const total = (categories || []).length;
    const active = (categories || []).filter((c) => isCategoryActive(c)).length;
    const inactive = Math.max(0, total - active);
    const totalProducts = (categories || []).reduce((sum, c) => sum + Number(c.product_count || 0), 0);
    const now = new Date();
    const thisMonth = (categories || []).filter((c) => {
      const d = new Date(c.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = (categories || []).filter((c) => {
      const d = new Date(c.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    }).length;
    const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : thisMonth > 0 ? 100 : 0;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, active, inactive, totalProducts, growth, pct };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    return (categories || []).filter((category) => {
      const matchesSearch =
        !q ||
        [category.name, category.description]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus =
        categoryStatusFilter === "all" ||
        (categoryStatusFilter === "active" ? isCategoryActive(category) : !isCategoryActive(category));
      return matchesSearch && matchesStatus;
    });
  }, [categories, categorySearch, categoryStatusFilter]);

  const categoryTotalPages = Math.max(1, Math.ceil(filteredCategories.length / categoryPerPage));
  const safeCategoryPage = Math.min(categoryPage, categoryTotalPages);
  const paginatedCategories = filteredCategories.slice(
    (safeCategoryPage - 1) * categoryPerPage,
    safeCategoryPage * categoryPerPage
  );

  const toggleCategorySelect = (id) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleCategorySelectAll = () => {
    const pageIds = paginatedCategories.map((c) => c.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedCategoryIds.includes(id));
    setSelectedCategoryIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  const toggleCategory = (category) => {
    adminService
      .updateCategory(category.id, { is_active: !isCategoryActive(category) })
      .then(() => {
        toast.success("Category updated");
        loadAdminData();
      })
      .catch((error) => toast.error(error?.response?.data?.message || "Category update failed"));
  };

  const AVATAR_TONES = ["blue", "purple"];
  const avatarTone = (name = "") => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return AVATAR_TONES[h % AVATAR_TONES.length];
  };

  const orderStatusTone = (status) => {
    if (status === "delivered" || status === "confirmed") return "done";
    if (status === "cancelled" || status === "returned") return "cancel";
    if (status === "pending") return "pending";
    return "progress";
  };

  const paymentTone = (status) => {
    if (status === "paid") return "done";
    if (status === "failed") return "cancel";
    if (status === "refunded") return "progress";
    return "pending";
  };

  const customerOrderStats = useMemo(() => {
    const total = (orders || []).length;
    const confirmed = (orders || []).filter((o) => o.status === "confirmed").length;
    const pending = (orders || []).filter((o) => o.status === "pending").length;
    const cancelled = (orders || []).filter((o) => o.status === "cancelled").length;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, confirmed, pending, cancelled, pct };
  }, [orders]);

  const filteredCustomerOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return (orders || []).filter((order) => {
      const customerName = `${order.first_name || ""} ${order.last_name || ""}`.trim().toLowerCase();
      const matchesSearch =
        !q ||
        [order.order_number, customerName, order.email, order.shipping_phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = orderStatusFilter === "all" || order.status === orderStatusFilter;
      const matchesPayment = orderPaymentFilter === "all" || order.payment_status === orderPaymentFilter;
      let matchesDate = true;
      if (orderDateFilter && order.created_at) {
        const d = new Date(order.created_at);
        matchesDate = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === orderDateFilter;
      }
      return matchesSearch && matchesStatus && matchesPayment && matchesDate;
    });
  }, [orders, orderSearch, orderStatusFilter, orderPaymentFilter, orderDateFilter]);

  const orderTotalPages = Math.max(1, Math.ceil(filteredCustomerOrders.length / orderPerPage));
  const safeOrderPage = Math.min(orderPage, orderTotalPages);
  const paginatedCustomerOrders = filteredCustomerOrders.slice(
    (safeOrderPage - 1) * orderPerPage,
    safeOrderPage * orderPerPage
  );

  const clearOrderFilters = () => {
    setOrderSearch("");
    setOrderStatusFilter("all");
    setOrderPaymentFilter("all");
    setOrderDateFilter("");
    setOrderPage(1);
    setSelectedOrderIds([]);
  };

  const toggleOrderSelect = (id) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleOrderSelectAll = () => {
    const pageIds = paginatedCustomerOrders.map((o) => o.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedOrderIds.includes(id));
    setSelectedOrderIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  const copyOrderNumber = async (orderNumber) => {
    try {
      await navigator.clipboard.writeText(`#${orderNumber}`);
      toast.success(`Order #${orderNumber} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const resetProductForm = () => {
    setProductForm({
      name: "",
      sku: "",
      tagline: "",
      category_id: "",
      brand_id: "",
      price: "",
      compare_price: "",
      stock: "",
      short_description: "",
      description: "",
      keyFeaturesText: "",
      specificationsText: "",
      applicationsText: "",
      resourcesText: "",
      faqsText: "",
      pinout_description: "",
      pinoutImageFile: null,
      galleryFiles: [],
      is_featured: false,
      is_active: true,
    });
  };

  const closeModal = () => {
    setEditing(null);
    setActiveModal(null);
    setExistingGallery([]);
    setExistingPinout(null);
    setSavingProduct(false);
  };

  /* ===== Build FormData for product create/update (supports image uploads) ===== */
  const buildProductFormData = () => {
    const form = new FormData();
    const append = (key, value) => {
      if (value !== undefined && value !== null && value !== "") form.append(key, value);
    };
    append("name", productForm.name);
    append("sku", productForm.sku);
    append("tagline", productForm.tagline);
    append("category_id", productForm.category_id);
    append("brand_id", productForm.brand_id);
    append("price", productForm.price);
    append("compare_price", productForm.compare_price);
    append("stock", productForm.stock);
    // Card one-liner falls back to the short subtitle so cards never render empty.
    append("short_description", productForm.short_description || productForm.tagline);
    append("description", productForm.description);
    append("pinout_description", productForm.pinout_description);
    append("key_features", JSON.stringify(parseLines(productForm.keyFeaturesText)));
    append("specifications", JSON.stringify(parseSpecs(productForm.specificationsText)));
    append("applications", JSON.stringify(parseLines(productForm.applicationsText)));
    append("resources", JSON.stringify(parseResources(productForm.resourcesText)));
    append("faqs", JSON.stringify(parseFaqs(productForm.faqsText)));
    append("is_featured", productForm.is_featured ? "true" : "false");
    append("is_active", productForm.is_active ? "true" : "false");
    if (productForm.pinoutImageFile) append("pinout_image", productForm.pinoutImageFile);
    (productForm.galleryFiles || []).forEach((file) => append("images", file));
    return form;
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    if (!productForm.name?.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!productForm.category_id) {
      toast.error("Please choose a category");
      return;
    }
    if (productForm.price === "" || Number.isNaN(Number(productForm.price)) || Number(productForm.price) < 0) {
      toast.error("Please enter a valid price");
      return;
    }
    if (productForm.stock === "" || Number.isNaN(Number(productForm.stock)) || Number(productForm.stock) < 0) {
      toast.error("Please enter a valid stock quantity");
      return;
    }
    if (!productForm.tagline?.trim()) {
      toast.error("Short description is required");
      return;
    }
    if (!productForm.description?.trim()) {
      toast.error("Product description is required");
      return;
    }
    setSavingProduct(true);
    try {
      const payload = buildProductFormData();
      if (editing?.id) {
        await adminService.updateProduct(editing.id, payload);
        toast.success("Product updated");
      } else {
        await adminService.createProduct(payload);
        toast.success("Product created");
      }
      closeModal();
      resetProductForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Product save failed");
    } finally {
      setSavingProduct(false);
    }
  };

  const openEditProduct = async (id) => {
    try {
      const res = await adminService.getProductById(id);
      const p = res.data.data || {};
      setProductForm({
        name: p.name || "",
        sku: p.sku || "",
        tagline: p.tagline || "",
        category_id: p.category_id || "",
        brand_id: p.brand_id || "",
        price: p.price || "",
        compare_price: p.compare_price || "",
        stock: p.stock ?? "",
        short_description: p.short_description || "",
        description: p.description || "",
        keyFeaturesText: (Array.isArray(p.key_features) ? p.key_features : []).join("\n"),
        specificationsText: specsToText(p.specifications),
        applicationsText: (Array.isArray(p.applications) ? p.applications : []).join("\n"),
        resourcesText: resourcesToText(p.resources),
        faqsText: (Array.isArray(p.faqs) ? p.faqs : [])
          .map((f) => `${f.q || f.question || ""}|${f.a || f.answer || ""}`)
          .join("\n"),
        pinout_description: p.pinout_description || "",
        pinoutImageFile: null,
        galleryFiles: [],
        is_featured: Boolean(p.is_featured),
        is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
      });
      setExistingGallery(Array.isArray(p.images) ? p.images : []);
      setExistingPinout(p.pinout_image || null);
      setEditing({ type: "product", id });
      setActiveModal("product");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load product");
    }
  };

  const updateProduct = async (id, patch) => {
    try {
      await adminService.updateProduct(id, patch);
      toast.success("Product updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Product update failed");
    }
  };

  const resetCouponForm = () => {
    setCouponForm({
      code: "",
      discount_type: "percentage",
      discount_value: "",
      min_order_amount: 0,
      max_discount: "",
      usage_limit: "",
      valid_from: "",
      valid_until: "",
      is_active: true,
      show_in_announcement: false,
    });
  };

  const submitCoupon = async (event) => {
    event.preventDefault();
    if (!couponForm.code || couponForm.discount_value === "") {
      toast.error("Coupon code and discount value are required");
      return;
    }
    // Send numbers as numbers and cleared optional fields as null —
    // the API rejects empty strings for numeric/date columns.
    const couponPayload = {
      code: couponForm.code,
      discount_type: couponForm.discount_type,
      discount_value: Number(couponForm.discount_value),
      min_order_amount:
        couponForm.min_order_amount === "" || couponForm.min_order_amount === null
          ? 0
          : Number(couponForm.min_order_amount),
      max_discount:
        couponForm.max_discount === "" || couponForm.max_discount === null
          ? null
          : Number(couponForm.max_discount),
      usage_limit:
        couponForm.usage_limit === "" || couponForm.usage_limit === null
          ? null
          : parseInt(couponForm.usage_limit, 10),
      valid_from: couponForm.valid_from || null,
      valid_until: couponForm.valid_until || null,
      is_active: couponForm.is_active,
      show_in_announcement: couponForm.show_in_announcement,
    };
    try {
      if (editing?.id) {
        await adminService.updateCoupon(editing.id, couponPayload);
        toast.success("Coupon updated");
      } else {
        await adminService.createCoupon(couponPayload);
        toast.success("Coupon created");
      }
      closeModal();
      resetCouponForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Coupon save failed");
    }
  };

  const openEditCoupon = (coupon) => {
    setCouponForm({
      code: coupon.code || "",
      discount_type: coupon.discount_type || "percentage",
      discount_value: coupon.discount_value || "",
      min_order_amount: coupon.min_order_amount ?? 0,
      max_discount: coupon.max_discount ?? "",
      usage_limit: coupon.usage_limit ?? "",
      valid_from: coupon.valid_from ? String(coupon.valid_from).slice(0, 10) : "",
      valid_until: coupon.valid_until ? String(coupon.valid_until).slice(0, 10) : "",
      is_active: coupon.is_active !== undefined ? Boolean(coupon.is_active) : true,
      show_in_announcement: Boolean(coupon.show_in_announcement),
    });
    setEditing({ type: "coupon", id: coupon.id });
    setActiveModal("coupon");
  };

  const deleteCoupon = async (id) => {
    try {
      await adminService.deleteCoupon(id);
      toast.success("Coupon deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Coupon delete failed");
    }
  };

  // Announcement bar: only one coupon shows at a time (enforced server-side).
  const toggleCouponAnnouncement = async (coupon) => {
    try {
      await adminService.updateCoupon(coupon.id, {
        show_in_announcement: !coupon.show_in_announcement,
      });
      toast.success(
        coupon.show_in_announcement
          ? `"${coupon.code}" removed from the announcement bar`
          : `"${coupon.code}" will now show in the announcement bar`
      );
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Announcement update failed");
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({ name: "", description: "", is_active: true });
  };

  const submitCategory = async (event) => {
    event.preventDefault();
    if (!categoryForm.name) {
      toast.error("Category name is required");
      return;
    }
    try {
      if (editing?.id) {
        await adminService.updateCategory(editing.id, categoryForm);
        toast.success("Category updated");
      } else {
        await adminService.createCategory(categoryForm);
        toast.success("Category created");
      }
      closeModal();
      resetCategoryForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Category save failed");
    }
  };

  const openEditCategory = (category) => {
    setCategoryForm({
      name: category.name || "",
      description: category.description || "",
      is_active: category.is_active !== undefined ? Boolean(category.is_active) : true,
    });
    setEditing({ type: "category", id: category.id });
    setActiveModal("category");
  };

  const deleteCategory = async (id) => {
    try {
      await adminService.deleteCategory(id);
      toast.success("Category deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Category delete failed");
    }
  };

  const resetMaterialForm = () => {
    setMaterialForm({
      name: "",
      code: "",
      description: "",
      price_per_gram: "",
      density_g_cm3: "1.24",
      is_active: true,
    });
  };

  const submitMaterial = async (event) => {
    event.preventDefault();
    if (!materialForm.name || materialForm.price_per_gram === "") {
      toast.error("Material name and price per gram are required");
      return;
    }
    try {
      const payload = {
        ...materialForm,
        code: materialForm.code || materialForm.name.slice(0, 4),
        price_per_gram: Number(materialForm.price_per_gram),
        density_g_cm3: Number(materialForm.density_g_cm3 || 1.24),
      };
      if (editing?.id) {
        await adminService.updateMaterial(editing.id, payload);
        toast.success("Material updated");
      } else {
        await adminService.createMaterial(payload);
        toast.success("Material created");
      }
      closeModal();
      resetMaterialForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Material save failed");
    }
  };

  const openEditMaterial = (material) => {
    setMaterialForm({
      name: material.name || "",
      code: material.code || material.slug || "",
      description: material.description || "",
      price_per_gram: material.price_per_gram || "",
      density_g_cm3: material.density_g_cm3 || "1.24",
      is_active: material.is_active !== undefined ? Boolean(material.is_active) : true,
    });
    setEditing({ type: "material", id: material.id });
    setActiveModal("material");
  };

  const updateMaterial = async (id, patch) => {
    try {
      await adminService.updateMaterial(id, patch);
      toast.success("Material updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Material update failed");
    }
  };

  const deleteMaterial = async (id) => {
    try {
      await adminService.deleteMaterial(id);
      toast.success("Material deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Material delete failed");
    }
  };

  const resetColorForm = () => {
    setColorForm({ name: "", hex_code: "#0b6bdc", is_active: true });
  };

  const submitColor = async (event) => {
    event.preventDefault();
    if (!colorForm.name) {
      toast.error("Color name is required");
      return;
    }
    try {
      if (editing?.id) {
        await adminService.updateColor(editing.id, colorForm);
        toast.success("Color updated");
      } else {
        await adminService.createColor(colorForm);
        toast.success("Color created");
      }
      closeModal();
      resetColorForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Color save failed");
    }
  };

  const openEditColor = (color) => {
    setColorForm({
      name: color.name || "",
      hex_code: color.hex_code || "#0b6bdc",
      is_active: color.is_active !== undefined ? Boolean(color.is_active) : true,
    });
    setEditing({ type: "color", id: color.id });
    setActiveModal("color");
  };

  const updateColor = async (id, patch) => {
    try {
      await adminService.updateColor(id, patch);
      toast.success("Color updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Color update failed");
    }
  };

  const deleteColor = async (id) => {
    try {
      await adminService.deleteColor(id);
      toast.success("Color deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Color delete failed");
    }
  };

  const resetUserForm = () => {
    setUserForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      password: "",
      role: "customer",
      is_active: true,
    });
  };

  const submitUser = async (event) => {
    event.preventDefault();
    if (!userForm.first_name || !userForm.last_name || !userForm.email) {
      toast.error("First name, last name, and email are required");
      return;
    }
    try {
      if (editing?.id) {
        const { password, ...updatePayload } = userForm;
        await adminService.updateUser(editing.id, updatePayload);
        toast.success("User updated");
      } else {
        if (!userForm.password || userForm.password.length < 6) {
          toast.error("Set a password of at least 6 characters");
          return;
        }
        await adminService.createUser(userForm);
        toast.success("User created");
      }
      closeModal();
      resetUserForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "User save failed");
    }
  };

  const openEditUser = (user) => {
    setUserForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      role: user.role || "customer",
      is_active: user.is_active !== undefined ? Boolean(user.is_active) : true,
    });
    setEditing({ type: "user", id: user.id });
    setActiveModal("user");
  };

  const deleteUser = async (id, name) => {
    try {
      await adminService.deleteUser(id);
      toast.success(`User${name ? ` ${name}` : ""} deleted`);
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "User delete failed");
    }
  };

  const loadUserDetails = async (user) => {
    setUserDetailLoading(true);
    setSelectedUserDetail({
      ...user,
      addresses: [],
      orders: [],
      printOrders: [],
    });
    try {
      const res = await adminService.getUserById(user.id);
      const detail = res.data.data || {};
      setSelectedUserDetail({
        ...user,
        ...detail,
        total_orders: user.total_orders ?? detail.orders?.length ?? 0,
        total_spent: user.total_spent ?? 0,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load user details");
    } finally {
      setUserDetailLoading(false);
    }
  };

  const userAvatarTone = (name = "") => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return h % 2 === 0 ? "blue" : "purple";
  };

  const userInitials = (user) => {
    const f = user.first_name?.[0] || "";
    const l = user.last_name?.[0] || "";
    return `${f}${l}`.toUpperCase() || "?";
  };

  const userStats = useMemo(() => {
    const total = (users || []).length;
    const customers = (users || []).filter((u) => u.role !== "admin").length;
    const admins = (users || []).filter((u) => u.role === "admin").length;
    const inactive = (users || []).filter((u) => !u.is_active).length;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, customers, admins, inactive, pct };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return (users || []).filter((user) => {
      const matchesSearch =
        !q ||
        [user.first_name, user.last_name, user.email, user.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
      const matchesStatus =
        userStatusFilter === "all" ||
        (userStatusFilter === "active" ? Boolean(user.is_active) : !user.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPerPage));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const paginatedUsers = filteredUsers.slice(
    (safeUserPage - 1) * userPerPage,
    safeUserPage * userPerPage
  );

  const toggleUserSelect = (id) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleUserSelectAll = () => {
    const pageIds = paginatedUsers.map((u) => u.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  /* ===================== BRANDS ===================== */
  const resetBrandForm = () => {
    setBrandForm({
      name: "",
      description: "",
      website_url: "",
      logoFile: null,
      is_active: true,
    });
  };

  const submitBrand = async (event) => {
    event.preventDefault();
    if (!brandForm.name) {
      toast.error("Brand name is required");
      return;
    }
    try {
      const form = new FormData();
      form.append("name", brandForm.name);
      form.append("description", brandForm.description || "");
      form.append("website_url", brandForm.website_url || "");
      form.append("is_active", brandForm.is_active ? "true" : "false");
      if (brandForm.logoFile) form.append("logo", brandForm.logoFile);

      if (editing?.id) {
        await adminService.updateBrand(editing.id, form);
        toast.success("Brand updated");
      } else {
        await adminService.createBrand(form);
        toast.success("Brand created");
      }
      closeModal();
      resetBrandForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Brand save failed");
    }
  };

  const openEditBrand = (brand) => {
    setBrandForm({
      name: brand.name || "",
      description: brand.description || "",
      website_url: brand.website_url || "",
      logoFile: null,
      is_active: brand.is_active !== undefined ? Boolean(brand.is_active) : true,
    });
    setEditing({ type: "brand", id: brand.id });
    setActiveModal("brand");
  };

  const updateBrand = async (id, patch) => {
    try {
      await adminService.updateBrand(id, patch);
      toast.success("Brand updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Brand update failed");
    }
  };

  const deleteBrand = async (id) => {
    try {
      await adminService.deleteBrand(id);
      toast.success("Brand deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Brand delete failed");
    }
  };

  /* ===================== REVIEWS ===================== */
  const toggleReview = async (id, isApproved) => {
    try {
      await adminService.toggleReviewApproval(id, { is_approved: !isApproved });
      toast.success("Review updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Review update failed");
    }
  };

  const deleteReview = async (id) => {
    try {
      await adminService.deleteReview(id);
      toast.success("Review deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Review delete failed");
    }
  };

  /* ===================== NEWSLETTER SUBSCRIBERS ===================== */
  const deleteSubscriber = async (id) => {
    try {
      await adminService.deleteSubscriber(id);
      toast.success("Subscriber removed");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Subscriber removal failed");
    }
  };

  /* ===================== CONTACT MESSAGES ===================== */
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactDateFilter, setContactDateFilter] = useState("");
  const [contactPage, setContactPage] = useState(1);
  const [contactPerPage, setContactPerPage] = useState(10);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [selectedContactDetail, setSelectedContactDetail] = useState(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [showContactTip, setShowContactTip] = useState(true);

  const updateContact = async (id, status) => {
    try {
      await adminService.updateContactStatus(id, { status });
      toast.success("Message marked as " + status);
      loadAdminData();
      if (selectedContactDetail?.id === id) {
        setSelectedContactDetail((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Message update failed");
    }
  };

  const deleteContact = async (id) => {
    try {
      await adminService.deleteContact(id);
      toast.success("Message deleted");
      if (selectedContactDetail?.id === id) setSelectedContactDetail(null);
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Message delete failed");
    }
  };

  const loadContactDetails = async (id) => {
    setContactDetailLoading(true);
    try {
      const res = await adminService.getContactById(id);
      setSelectedContactDetail(res.data.data);
      setReplyText("");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load inquiry details");
    } finally {
      setContactDetailLoading(false);
    }
  };

  const sendContactReply = async (event) => {
    event.preventDefault();
    if (!selectedContactDetail?.id || !replyText.trim()) {
      toast.error("Write a reply first");
      return;
    }
    setSendingReply(true);
    try {
      const res = await adminService.replyToContact(selectedContactDetail.id, { message: replyText.trim() });
      toast.success(res.data.message || "Reply sent");
      setReplyText("");
      const detail = await adminService.getContactById(selectedContactDetail.id);
      setSelectedContactDetail(detail.data.data);
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Reply failed");
    } finally {
      setSendingReply(false);
    }
  };

  const contactStatusTone = (status) => {
    if (status === "replied") return "done";
    if (status === "archived") return "muted";
    if (status === "read") return "progress";
    return "pending";
  };

  const contactTicketNo = (id) => `#INQ-${String(id).padStart(3, "0")}`;

  const contactStats = useMemo(() => {
    const total = (contacts || []).length;
    const replied = (contacts || []).filter((c) => c.status === "replied").length;
    const pending = (contacts || []).filter((c) => c.status === "pending" || c.status === "read").length;
    const closed = (contacts || []).filter((c) => c.status === "archived").length;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, replied, pending, closed, pct };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return (contacts || []).filter((message) => {
      const matchesSearch =
        !q ||
        [message.name, message.email, message.subject, message.message, message.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = contactStatusFilter === "all" || message.status === contactStatusFilter;
      let matchesDate = true;
      if (contactDateFilter && message.created_at) {
        const d = new Date(message.created_at);
        matchesDate = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === contactDateFilter;
      }
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [contacts, contactSearch, contactStatusFilter, contactDateFilter]);

  const contactTotalPages = Math.max(1, Math.ceil(filteredContacts.length / contactPerPage));
  const safeContactPage = Math.min(contactPage, contactTotalPages);
  const paginatedContacts = filteredContacts.slice(
    (safeContactPage - 1) * contactPerPage,
    safeContactPage * contactPerPage
  );

  const toggleContactSelect = (id) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleContactSelectAll = () => {
    const pageIds = paginatedContacts.map((m) => m.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedContactIds.includes(id));
    setSelectedContactIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  /* ===================== HERO BANNERS ===================== */
  const resetBannerForm = () => {
    setBannerForm({
      title: "",
      subtitle: "",
      link_url: "",
      button_text: "Shop Now",
      sort_order: 0,
      imageFile: null,
      is_active: true,
    });
  };

  const submitBanner = async (event) => {
    event.preventDefault();
    if (editing?.id && !bannerForm.imageFile) {
      toast.error("A banner image is required. Pick a file or cancel.");
      return;
    }
    if (!editing?.id && !bannerForm.imageFile) {
      toast.error("Banner image is required");
      return;
    }
    try {
      const form = new FormData();
      form.append("title", bannerForm.title || "");
      form.append("subtitle", bannerForm.subtitle || "");
      form.append("link_url", bannerForm.link_url || "");
      form.append("button_text", bannerForm.button_text || "Shop Now");
      form.append("sort_order", bannerForm.sort_order || 0);
      form.append("is_active", bannerForm.is_active ? "true" : "false");
      if (bannerForm.imageFile) form.append("image", bannerForm.imageFile);

      if (editing?.id) {
        await adminService.updateBanner(editing.id, form);
        toast.success("Banner updated");
      } else {
        await adminService.createBanner(form);
        toast.success("Banner created");
      }
      closeModal();
      resetBannerForm();
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Banner save failed");
    }
  };

  const openEditBanner = (banner) => {
    setBannerForm({
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      link_url: banner.link_url || "",
      button_text: banner.button_text || "Shop Now",
      sort_order: banner.sort_order || 0,
      imageFile: null,
      is_active: banner.is_active !== undefined ? Boolean(banner.is_active) : true,
    });
    setEditing({ type: "banner", id: banner.id });
    setActiveModal("banner");
  };

  const updateBanner = async (id, patch) => {
    try {
      await adminService.updateBanner(id, patch);
      toast.success("Banner updated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Banner update failed");
    }
  };

  const deleteBanner = async (id) => {
    try {
      await adminService.deleteBanner(id);
      toast.success("Banner deleted");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Banner delete failed");
    }
  };

  /* ===================== SITE SETTINGS ===================== */
  useEffect(() => {
    setSettingsForm(siteSettings);
  }, [siteSettings]);

  const updateSettingField = (key, value) => {
    setSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitSettings = async (event) => {
    event.preventDefault();
    setSettingsSaving(true);
    try {
      await adminService.updateSettings(settingsForm);
      toast.success("Settings saved");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Settings save failed");
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateOrder = async (id, status) => {
    try {
      await adminService.updateOrderStatus(id, { status });
      toast.success("Order status updated");
      loadAdminData();
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Order update failed");
      return false;
    }
  };

  const updateOrderDetails = async (id, patch) => {
    try {
      await adminService.updateOrderStatus(id, patch);
      toast.success("Order updated");
      loadAdminData();
      loadOrderDetails(id);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Order update failed");
    }
  };

  const updatePrintOrder = async (id, status) => {
    try {
      await adminService.updatePrintOrderStatus(id, { status });
      toast.success("Print order status updated");
      loadAdminData();
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Print order update failed");
      return false;
    }
  };

  const updatePrintOrderNotes = async (id, value) => {
    try {
      await adminService.updatePrintOrderStatus(id, {
        admin_notes: value?.trim() || null,
      });
      toast.success("Print order notes updated");
      loadAdminData();
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Print order notes update failed");
      return false;
    }
  };

  const loadOrderDetails = async (orderId) => {
    setDetailLoading(true);
    try {
      const res = await adminService.getOrderDetails(orderId);
      setSelectedOrderDetail(res.data.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load order details");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadPrintOrderDetails = async (orderId) => {
    setDetailLoading(true);
    try {
      const res = await adminService.getPrintOrderDetails(orderId);
      setSelectedPrintOrderDetail(res.data.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to load print order details");
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", Icon: BarChart3 },
    { id: "products", label: "Products", Icon: Box },
    { id: "orders", label: "Orders", Icon: ClipboardList },
    { id: "manual", label: "Manual Orders", Icon: FileText },
    { id: "printing", label: "3D Printing", Icon: Cuboid },
    { id: "users", label: "Users", Icon: Users },
    { id: "coupons", label: "Coupons", Icon: Tag },
    { id: "catalog", label: "Catalog", Icon: Layers },
    { id: "brands", label: "Brands", Icon: Store },
    { id: "reviews", label: "Reviews", Icon: Star },
    { id: "subscribers", label: "Subscribers", Icon: Mail },
    { id: "contacts", label: "Inquiries", Icon: MessageSquare },
    { id: "settings", label: "Settings", Icon: Settings2 },
  ];

  const navGroups = [
    { label: "Overview", ids: ["dashboard"] },
    { label: "Sales", ids: ["orders", "manual", "printing", "coupons"] },
    { label: "Catalog", ids: ["products", "catalog", "brands", "reviews"] },
    { label: "Customers", ids: ["users", "subscribers", "contacts"] },
    { label: "System", ids: ["settings"] },
  ];

  const tabById = Object.fromEntries(tabs.map((tab) => [tab.id, tab]));

  const printSubTabs = [
    { id: "orders", label: "3D Printing Orders", count: printOrders.length, Icon: Box },
    { id: "colors", label: "Colors", count: colors.length, Icon: Palette },
    { id: "materials", label: "Materials", count: materials.length, Icon: Cuboid },
  ];

  const colorUsageMap = useMemo(() => {
    const map = {};
    (printOrders || []).forEach((order) => {
      const cid = order.color_id;
      if (cid !== null && cid !== undefined) map[cid] = (map[cid] || 0) + 1;
    });
    return map;
  }, [printOrders]);

  const filteredColors = useMemo(() => {
    const q = colorSearch.trim().toLowerCase();
    return (colors || []).filter((color) => {
      const matchesSearch =
        !q ||
        [color.name, color.hex_code].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus =
        colorStatusFilter === "all" ||
        (colorStatusFilter === "active" ? Boolean(color.is_active) : !color.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [colors, colorSearch, colorStatusFilter]);

  const colorTotalPages = Math.max(1, Math.ceil(filteredColors.length / colorPerPage));
  const safeColorPage = Math.min(colorPage, colorTotalPages);
  const paginatedColors = filteredColors.slice(
    (safeColorPage - 1) * colorPerPage,
    safeColorPage * colorPerPage
  );

  const formatColorDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const printStats = useMemo(() => {
    const total = (printOrders || []).length;
    const completed = (printOrders || []).filter((o) => o.status === "delivered").length;
    const cancelled = (printOrders || []).filter((o) => o.status === "cancelled").length;
    const inProduction = Math.max(0, total - completed - cancelled);
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, completed, cancelled, inProduction, pct };
  }, [printOrders]);

  const filteredPrintOrders = useMemo(() => {
    const q = printSearch.trim().toLowerCase();
    return (printOrders || []).filter((order) => {
      const customerName = `${order.first_name || ""} ${order.last_name || ""}`.trim().toLowerCase();
      const matchesSearch =
        !q ||
        [order.order_number, customerName, order.email, order.file_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = printStatusFilter === "all" || order.status === printStatusFilter;
      const matchesMaterial =
        printMaterialFilter === "all" ||
        String(order.material_id) === String(printMaterialFilter) ||
        (order.material_name || "").toLowerCase() === String(printMaterialFilter).toLowerCase();
      let matchesDate = true;
      if (printDateFilter && order.created_at) {
        const d = new Date(order.created_at);
        matchesDate = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === printDateFilter;
      }
      return matchesSearch && matchesStatus && matchesMaterial && matchesDate;
    });
  }, [printOrders, printSearch, printStatusFilter, printMaterialFilter, printDateFilter]);

  const printTotalPages = Math.max(1, Math.ceil(filteredPrintOrders.length / printPerPage));
  const safePrintPage = Math.min(printPage, printTotalPages);
  const paginatedPrintOrders = filteredPrintOrders.slice(
    (safePrintPage - 1) * printPerPage,
    safePrintPage * printPerPage
  );

  const clearPrintFilters = () => {
    setPrintSearch("");
    setPrintStatusFilter("all");
    setPrintMaterialFilter("all");
    setPrintDateFilter("");
    setPrintPage(1);
    setSelectedPrintIds([]);
  };

  const formatPrintDate = (value) => {
    if (!value) return { date: "—", time: "" };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
    return {
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
  };

  const printStatusTone = (status) => {
    if (status === "delivered") return "done";
    if (status === "cancelled") return "cancel";
    if (["pending", "confirmed", "reviewing"].includes(status)) return "pending";
    return "progress";
  };

  const togglePrintSelect = (id) => {
    setSelectedPrintIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const togglePrintSelectAll = () => {
    const pageIds = paginatedPrintOrders.map((o) => o.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedPrintIds.includes(id));
    setSelectedPrintIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  const MATERIAL_META = {
    PLA: { chemical: "Polylactic Acid", type: "Bioplastic", tone: "green", image: "/images/products/blue_filament.png" },
    PETG: { chemical: "Polyethylene Terephthalate Glycol", type: "Thermoplastic", tone: "blue", image: "/images/products/petg_filament.jpg" },
    ABS: { chemical: "Acrylonitrile Butadiene Styrene", type: "Thermoplastic", tone: "blue", image: "/images/products/abs_filament.jpg" },
    TPU: { chemical: "Thermoplastic Polyurethane", type: "Flexible", tone: "purple", image: "/images/products/tpu_filament.jpg" },
  };

  const getMaterialMeta = (material) => {
    const key = String(material?.name || material?.code || "").trim().toUpperCase();
    return (
      MATERIAL_META[key] || {
        chemical: material?.code || material?.slug || "Printing material",
        type: "Standard",
        tone: "gray",
        image: "/images/products/blue_filament.png",
      }
    );
  };

  const materialStats = useMemo(() => {
    const total = (materials || []).length;
    const active = (materials || []).filter((m) => Boolean(m.is_active)).length;
    const inactive = Math.max(0, total - active);
    const avgPrice =
      total > 0
        ? (materials || []).reduce((sum, m) => sum + Number(m.price_per_gram || 0), 0) / total
        : 0;
    const now = new Date();
    const thisMonth = (materials || []).filter((m) => {
      const d = new Date(m.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = (materials || []).filter((m) => {
      const d = new Date(m.created_at);
      return !Number.isNaN(d.getTime()) && d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    }).length;
    const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : thisMonth > 0 ? 100 : 0;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, active, inactive, avgPrice, growth, pct };
  }, [materials]);

  const materialTypeOptions = useMemo(() => {
    const types = new Set();
    (materials || []).forEach((m) => types.add(getMaterialMeta(m).type));
    return [...types];
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    return (materials || []).filter((material) => {
      const matchesSearch =
        !q ||
        [material.name, material.code, material.description, material.best_for]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesType =
        materialTypeFilter === "all" || getMaterialMeta(material).type === materialTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [materials, materialSearch, materialTypeFilter]);

  const materialTotalPages = Math.max(1, Math.ceil(filteredMaterials.length / materialPerPage));
  const safeMaterialPage = Math.min(materialPage, materialTotalPages);
  const paginatedMaterials = filteredMaterials.slice(
    (safeMaterialPage - 1) * materialPerPage,
    safeMaterialPage * materialPerPage
  );

  const duplicateMaterial = async (material) => {
    try {
      const payload = {
        name: `${material.name} Copy`,
        code: material.code || material.slug || material.name,
        description: material.description || "",
        price_per_gram: Number(material.price_per_gram),
        density_g_cm3: Number(material.density_g_cm3 || 1.24),
        is_active: Boolean(material.is_active),
      };
      await adminService.createMaterial(payload);
      toast.success("Material duplicated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Material duplicate failed");
    }
  };

  const getCouponState = (coupon, now = new Date()) => {
    if (coupon.valid_until && new Date(coupon.valid_until) < now) return "expired";
    if (coupon.valid_from && new Date(coupon.valid_from) > now) return "scheduled";
    return coupon.is_active ? "active" : "inactive";
  };

  const couponStats = useMemo(() => {
    const now = new Date();
    const total = (coupons || []).length;
    const active = (coupons || []).filter((c) => getCouponState(c, now) === "active").length;
    const scheduled = (coupons || []).filter((c) => getCouponState(c, now) === "scheduled").length;
    const expired = (coupons || []).filter((c) => getCouponState(c, now) === "expired").length;
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}% of total` : "0% of total");
    return { total, active, scheduled, expired, pct };
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    const now = new Date();
    const q = couponSearch.trim().toLowerCase();
    return (coupons || []).filter((coupon) => {
      const matchesSearch =
        !q ||
        [coupon.code, coupon.description]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus =
        couponStatusFilter === "all" || getCouponState(coupon, now) === couponStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [coupons, couponSearch, couponStatusFilter]);

  const couponTotalPages = Math.max(1, Math.ceil(filteredCoupons.length / couponPerPage));
  const safeCouponPage = Math.min(couponPage, couponTotalPages);
  const paginatedCoupons = filteredCoupons.slice(
    (safeCouponPage - 1) * couponPerPage,
    safeCouponPage * couponPerPage
  );

  const toggleCouponSelect = (id) => {
    setSelectedCouponIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleCouponSelectAll = () => {
    const pageIds = paginatedCoupons.map((c) => c.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedCouponIds.includes(id));
    setSelectedCouponIds((prev) =>
      allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]
    );
  };

  const copyCouponCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Code ${code} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const duplicateCoupon = async (coupon) => {
    try {
      const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
      const payload = {
        code: `${coupon.code}-COPY`,
        discount_type: coupon.discount_type || "percentage",
        discount_value: coupon.discount_value,
        min_order_amount: coupon.min_order_amount ?? 0,
        max_discount: coupon.max_discount ?? null,
        usage_limit: coupon.usage_limit ?? null,
        valid_from: toDateInput(coupon.valid_from),
        valid_until: toDateInput(coupon.valid_until),
        is_active: Boolean(coupon.is_active),
        show_in_announcement: false,
      };
      await adminService.createCoupon(payload);
      toast.success("Coupon duplicated");
      loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Coupon duplicate failed");
    }
  };

  const formatShortDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="admin-page">
      <aside className="admin-sidebar">
        <Link to="/" className="admin-brand">
          <img src="/images/logo.png" alt="Printy Nozzles" />
          <span className="admin-brand-text">
            <strong>Admin</strong>
            <small>PrintyNozzle Control Room</small>
          </span>
        </Link>
        <nav className="admin-tabs">
          {navGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-label">{group.label}</span>
              {group.ids.map((id) => {
                const { label, Icon } = tabById[id];
                return (
                  <button
                    type="button"
                    key={id}
                    className={`admin-tab ${activeTab === id ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab(id);
                      setSelectedOrderDetail(null);
                      setSelectedPrintOrderDetail(null);
                      setSelectedUserDetail(null);
                      setSelectedContactDetail(null);
                      setOrderStatusFilter("all");
                      setOrderSearch("");
                      setOrderDateFilter("");
                      setOrderPaymentFilter("all");
                      setOrderPage(1);
                      setSelectedOrderIds([]);
                      setOrderMenuId(null);
                      setPrintStatusFilter("all");
                      setPrintSearch("");
                      setPrintMaterialFilter("all");
                      setPrintDateFilter("");
                      setPrintPage(1);
                      setSelectedPrintIds([]);
                      setMaterialSearch("");
                      setMaterialTypeFilter("all");
                      setMaterialPage(1);
                      setSearch("");
                      setProductCategoryFilter("all");
                      setProductStatusFilter("all");
                      setProductPage(1);
                      setSelectedProductIds([]);
                      setCategorySearch("");
                      setCategoryStatusFilter("all");
                      setCategoryPage(1);
                      setSelectedCategoryIds([]);
                      setUserSearch("");
                      setUserRoleFilter("all");
                      setUserStatusFilter("all");
                      setUserPage(1);
                      setSelectedUserIds([]);
                      setContactSearch("");
                      setContactStatusFilter("all");
                      setContactDateFilter("");
                      setContactPage(1);
                      setSelectedContactIds([]);
                    }}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    {id === "contacts" && contacts.length > 0 && (
                      <em className="admin-tab-badge">{contacts.length}</em>
                    )}
                    {id === "reviews" && reviews.length > 0 && (
                      <em className="admin-tab-badge">{reviews.length}</em>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <Link to="/" className="admin-store-link">
            <Store size={15} />
            <span>View Store</span>
          </Link>
          <span className="admin-side-note">Signed in as store admin</span>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span className="admin-kicker">PrintyNozzle Control Room</span>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <p className="admin-header-sub">
              {{
                dashboard: "Live store performance, revenue and order health at a glance.",
                products: "Manage your storefront catalog, pricing, stock and visibility.",
                orders: "Track, fulfil and update every customer order.",
                manual: "Offline and phone orders with saved GST invoices.",
                printing: "Custom 3D print jobs, materials and colors.",
                users: "Customers and admin access in one place.",
                coupons: "Discount codes that grow average order value.",
                catalog: "Categories that organize the storefront.",
                brands: "Brands shoppers can filter and trust.",
                reviews: "Approve and moderate customer reviews.",
                subscribers: "Newsletter audience and retention.",
                contacts: "Customer inquiries waiting for a reply.",
                settings: "Store configuration, shipping, tax and content.",
              }[activeTab] || "Manage your store."}
            </p>
            <span className="admin-header-meta">
              <i className="admin-live-dot" />
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="admin-refresh" onClick={loadAdminData}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {loading ? (
          <div className="admin-empty">Loading admin data...</div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <>
                <section className="admin-stat-grid">
                  {[
                    ["Revenue", money(stats.totalRevenue), BarChart3, "Paid orders", "linear-gradient(135deg,#FF7508,#FFA94D)", "rgba(255,117,8,.28)"],
                    ["Orders", stats.totalOrders || 0, ClipboardList, "All product orders", "linear-gradient(135deg,#7c3aed,#a78bfa)", "rgba(124,58,237,.28)"],
                    ["3D Print Orders", stats.totalPrintOrders || 0, Cuboid, "Custom print jobs", "linear-gradient(135deg,#ea580c,#ffb21f)", "rgba(234,88,12,.28)"],
                    ["Customers", stats.totalUsers || 0, Users, "Registered users", "linear-gradient(135deg,#059669,#34d399)", "rgba(5,150,105,.28)"],
                    ["Products", stats.totalProducts || 0, Box, "Live catalog", "linear-gradient(135deg,#E05E00,#FF7508)", "rgba(224,94,0,.28)"],
                    ["Low Stock", stats.lowStockCount || 0, ShieldCheck, "Needs restock", "linear-gradient(135deg,#dc2626,#f87171)", "rgba(220,38,38,.28)"],
                  ].map(([label, value, Icon, hint, ico, glow]) => (
                    <article
                      className="admin-stat"
                      key={label}
                      style={{ "--ad-ico": ico, "--ad-glow": glow }}
                    >
                      <span className="admin-stat-ico">
                        <Icon size={21} />
                      </span>
                      <span className="admin-stat-label">{label}</span>
                      <strong>{value}</strong>
                      <span className="admin-stat-hint">{hint}</span>
                    </article>
                  ))}
                </section>

<section className="admin-grid two">
                  <div className="admin-panel">
                    <div className="admin-panel-title-row">
                      <div>
                        <h2>Revenue this year</h2>
                        <p className="admin-panel-subtitle">Paid & delivered orders per month.</p>
                      </div>
                      <span className="admin-count-badge">
                        {money((salesChart.monthlySales || []).reduce((sum, m) => sum + Number(m.total_sales || 0), 0))} total
                      </span>
                    </div>
                    {(salesChart.monthlySales || []).length ? (
                      <AdminSalesChart monthlySales={salesChart.monthlySales} />
                    ) : (
                      <div className="admin-empty small">No sales data yet this year</div>
                    )}
                  </div>
                  <div className="admin-panel">
                    <div className="admin-panel-title-row">
                      <div>
                        <h2>Orders by status</h2>
                        <p className="admin-panel-subtitle">Live distribution across all product orders.</p>
                      </div>
                    </div>
                    {(salesChart.statusDistribution || []).length ? (
                      <div className="admin-dist-list">
                        {(() => {
                          const total = salesChart.statusDistribution.reduce((s, r) => s + Number(r.count || 0), 0) || 1;
                          return salesChart.statusDistribution.map((row) => (
                            <div className="admin-dist-row" key={row.status}>
                              <span className={`admin-detail-status-badge ${row.status}`} style={{ fontSize: "0.7rem" }}>
                                {row.status?.replace(/_/g, " ")}
                              </span>
                              <div className="admin-dist-track">
                                <div
                                  className="admin-dist-fill"
                                  style={{ width: `${Math.max(4, (Number(row.count) / total) * 100)}%` }}
                                />
                              </div>
                              <strong>{row.count}</strong>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <div className="admin-empty small">No orders yet</div>
                    )}
                  </div>
                </section>

                <section className="admin-grid two">
                  <div className="admin-panel">
                    <h2>Recent Orders</h2>
                    <AdminTable
                      columns={["Order", "Customer", "Status", "Total"]}
                      rows={(stats.recentOrders || []).map((order) => [
                        `#${order.order_number}`,
                        `${order.first_name || ""} ${order.last_name || ""}`.trim() || order.email,
                        order.status,
                        money(order.total_amount),
                      ])}
                      emptyMessage="No recent orders found"
                    />
                  </div>
                  <div className="admin-panel">
                    <h2>Top Products</h2>
                    <AdminTable
                      columns={["Product", "Stock", "Sold", "Price"]}
                      rows={(stats.topProducts || []).map((product) => [
                        product.name,
                        product.stock,
                        product.units_sold,
                        money(product.price),
                      ])}
                      emptyMessage="No top products found"
                    />
                  </div>
                </section>
              </>
            )}

            {activeTab === "products" && (
              <section className="admin-products-layout">
                <div className="admin-print-stats admin-products-stats">
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico blue"><Box size={22} /></span>
                    <div>
                      <strong>{productStats.total}</strong>
                      <span className="admin-print-stat-label">Total Products</span>
                      <span className="admin-print-stat-sub up">↑ {productStats.growth}% from last month</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico green"><Box size={22} /></span>
                    <div>
                      <strong>{productStats.inCount}</strong>
                      <span className="admin-print-stat-label">In Stock</span>
                      <span className="admin-print-stat-sub">{productStats.pct(productStats.inCount)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico amber"><Clock size={22} /></span>
                    <div>
                      <strong>{productStats.lowCount}</strong>
                      <span className="admin-print-stat-label">Low Stock</span>
                      <span className="admin-print-stat-sub">{productStats.pct(productStats.lowCount)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico red"><XCircle size={22} /></span>
                    <div>
                      <strong>{productStats.outCount}</strong>
                      <span className="admin-print-stat-label">Out of Stock</span>
                      <span className="admin-print-stat-sub">{productStats.pct(productStats.outCount)}</span>
                    </div>
                  </article>
                </div>

                <div className="admin-panel admin-products-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-coupons-ico">
                        <Box size={22} />
                      </span>
                      <div>
                        <h2>Products</h2>
                        <p className="admin-panel-subtitle">Manage backend products and review storefront catalog items.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-products-tools">
                      <label className="admin-search admin-products-search">
                        <Search size={15} />
                        <input value={search} onChange={(e) => { setSearch(e.target.value); setProductPage(1); }} placeholder="Search products..." />
                      </label>
                      <select
                        className="admin-filter-select"
                        value={productCategoryFilter}
                        onChange={(e) => { setProductCategoryFilter(e.target.value); setProductPage(1); }}
                        aria-label="Filter products by category"
                      >
                        <option value="all">All Categories</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                      <select
                        className="admin-filter-select"
                        value={productStatusFilter}
                        onChange={(e) => { setProductStatusFilter(e.target.value); setProductPage(1); }}
                        aria-label="Filter products by status"
                      >
                        <option value="all">All Status</option>
                        <option value="in">In Stock</option>
                        <option value="low">Low Stock</option>
                        <option value="out">Out of Stock</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetProductForm(); setActiveModal("product"); }}>
                        <Plus size={16} />
                        <span>Add Product</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-products-table-wrap">
                    <div className="admin-products-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedProducts.length > 0 && paginatedProducts.every((p) => selectedProductIds.includes(p.id))}
                        onChange={toggleProductSelectAll}
                        aria-label="Select all products on page"
                      />
                      <span>#</span>
                      <span>Product</span>
                      <span>Category</span>
                      <span>Price (Rs.)</span>
                      <span>Stock</span>
                      <span>Status</span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedProducts.length ? (
                      paginatedProducts.map((product, idx) => {
                        const rowNum = (safeProductPage - 1) * productPerPage + idx + 1;
                        const stockQty = Number(product.stock || 0);
                        const stockState = getStockState(product);
                        const stockMeta = STOCK_META[stockState];
                        const isActive = product.is_active ?? true;
                        const created = formatPrintDate(product.created_at);
                        return (
                          <div className={`admin-products-table-row ${isActive ? "" : "inactive"}`} key={product.id}>
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(product.id)}
                              onChange={() => toggleProductSelect(product.id)}
                              aria-label={`Select product ${product.name}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-product-cell">
                                <ProductThumb src={product.primary_image} alt={product.name} />
                                <span>
                                  <strong className="admin-product-name">{product.name}</strong>
                                  <span className="admin-print-sub">{product.sku || product.brand_name || "No SKU"}</span>
                                </span>
                              </span>
                            </span>
                            <span>
                              <span className={`admin-category-pill ${categoryTone(product.category_name || "Catalog")}`}>
                                {product.category_name || "Catalog"}
                              </span>
                            </span>
                            <span className="admin-material-value">{Number(product.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className={`admin-stock-count ${stockMeta.tone}`}>{stockQty}</span>
                            <span>
                              <span className={`admin-stock-pill ${stockMeta.tone}`}>
                                <i className="admin-status-dot" />
                                {stockMeta.label}
                              </span>
                              {!isActive && <span className="admin-print-sub">Hidden</span>}
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <Link
                                to={`/product/${product.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="admin-icon-btn view"
                                title="View on storefront"
                              >
                                <Eye size={16} />
                              </Link>
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => openEditProduct(product.id)}
                                title="Edit product details"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn copy"
                                onClick={() => duplicateProduct(product.id)}
                                title="Duplicate product"
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete product "${product.name}"?`)) {
                                    deleteProduct(product.id);
                                  }
                                }}
                                title="Delete product"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No products found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={productPerPage}
                        onChange={(e) => { setProductPerPage(Number(e.target.value)); setProductPage(1); }}
                        aria-label="Products per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredProducts.length
                          ? `Showing ${(safeProductPage - 1) * productPerPage + 1} to ${Math.min(safeProductPage * productPerPage, filteredProducts.length)} of ${filteredProducts.length} products`
                          : "No products to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeProductPage <= 1}
                        onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeProductPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeProductPage >= productTotalPages}
                        onClick={() => setProductPage((p) => Math.min(productTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "orders" && !selectedOrderDetail && (
              <section className="admin-orders-layout">
                <div className="admin-print-stats admin-orders-stats">
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico blue"><ShoppingCart size={22} /></span>
                    <div>
                      <strong>{customerOrderStats.total}</strong>
                      <span className="admin-print-stat-label">Total Orders</span>
                      <span className="admin-print-stat-sub up">↑ 100% from last month</span>
                    </div>
                    <Sparkline tone="blue" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico green"><CheckCircle2 size={22} /></span>
                    <div>
                      <strong>{customerOrderStats.confirmed}</strong>
                      <span className="admin-print-stat-label">Confirmed</span>
                      <span className="admin-print-stat-sub">{customerOrderStats.pct(customerOrderStats.confirmed)}</span>
                    </div>
                    <Sparkline tone="green" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico amber"><Clock size={22} /></span>
                    <div>
                      <strong>{customerOrderStats.pending}</strong>
                      <span className="admin-print-stat-label">Pending</span>
                      <span className="admin-print-stat-sub">{customerOrderStats.pct(customerOrderStats.pending)}</span>
                    </div>
                    <Sparkline tone="amber" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico red"><XCircle size={22} /></span>
                    <div>
                      <strong>{customerOrderStats.cancelled}</strong>
                      <span className="admin-print-stat-label">Cancelled</span>
                      <span className="admin-print-stat-sub">{customerOrderStats.pct(customerOrderStats.cancelled)}</span>
                    </div>
                    <Sparkline tone="red" />
                  </article>
                </div>

                <div className="admin-panel admin-orders-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-orders-ico">
                        <ClipboardList size={22} />
                      </span>
                      <div>
                        <h2>Customer Orders</h2>
                        <p className="admin-panel-subtitle">Manage customer orders and update delivery status.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-orders-tools">
                      <label className="admin-search admin-orders-search">
                        <Search size={15} />
                        <input
                          value={orderSearch}
                          onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
                          placeholder="Search orders..."
                        />
                      </label>
                      <label className="admin-filter-wrap">
                        <Filter size={15} />
                        <select
                          className="admin-filter-select"
                          value={orderStatusFilter}
                          onChange={(e) => { setOrderStatusFilter(e.target.value); setOrderPage(1); }}
                          aria-label="Filter orders by status"
                        >
                          <option value="all">All statuses</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-print-date">
                        <Calendar size={15} />
                        <input
                          type="date"
                          value={orderDateFilter}
                          onChange={(e) => { setOrderDateFilter(e.target.value); setOrderPage(1); }}
                          aria-label="Filter orders by date"
                        />
                        {!orderDateFilter && <span className="admin-print-date-ph">Select date range</span>}
                      </label>
                      <button
                        type="button"
                        className={`admin-secondary admin-filter-toggle ${showOrderFilters ? "on" : ""}`}
                        onClick={() => setShowOrderFilters((v) => !v)}
                        title="More filters"
                        aria-label="Toggle more filters"
                      >
                        <Filter size={15} />
                      </button>
                    </div>
                  </div>
                  {showOrderFilters && (
                    <div className="admin-orders-extra-filters">
                      <select
                        className="admin-filter-select"
                        value={orderPaymentFilter}
                        onChange={(e) => { setOrderPaymentFilter(e.target.value); setOrderPage(1); }}
                        aria-label="Filter orders by payment status"
                      >
                        <option value="all">All payments</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                      </select>
                      <button type="button" className="admin-secondary" onClick={clearOrderFilters}>
                        Clear
                      </button>
                    </div>
                  )}

                  <div className="admin-orders-table-wrap">
                    <div className="admin-orders-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedCustomerOrders.length > 0 && paginatedCustomerOrders.every((o) => selectedOrderIds.includes(o.id))}
                        onChange={toggleOrderSelectAll}
                        aria-label="Select all orders on page"
                      />
                      <span>#</span>
                      <span>Order ID</span>
                      <span>Customer</span>
                      <span>Items</span>
                      <span>Total Amount</span>
                      <span>Payment Status</span>
                      <span>Order Status</span>
                      <span>Ordered On</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedCustomerOrders.length ? (
                      paginatedCustomerOrders.map((order, idx) => {
                        const rowNum = (safeOrderPage - 1) * orderPerPage + idx + 1;
                        const customerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Guest";
                        const items = Array.isArray(order.items) ? order.items : [];
                        const itemCount = order.item_count ?? items.length ?? 0;
                        const firstItem = items[0];
                        const created = formatPrintDate(order.created_at);
                        return (
                          <div className="admin-orders-table-row" key={order.id}>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(order.id)}
                              onChange={() => toggleOrderSelect(order.id)}
                              aria-label={`Select order ${order.order_number}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-order-id-cell">
                                <button
                                  type="button"
                                  className="admin-order-link"
                                  onClick={() => loadOrderDetails(order.id)}
                                  title="View order details"
                                >
                                  #{order.order_number}
                                </button>
                                <button
                                  type="button"
                                  className="admin-order-copy"
                                  onClick={() => copyOrderNumber(order.order_number)}
                                  title="Copy order ID"
                                >
                                  <Copy size={13} />
                                </button>
                              </span>
                              <span className="admin-print-sub">ID {order.id}</span>
                            </span>
                            <span>
                              <span className="admin-customer-cell">
                                <span className={`admin-avatar-sm ${avatarTone(customerName)}`}>
                                  {(customerName[0] || "G").toUpperCase()}
                                </span>
                                <span>
                                  <strong className="admin-print-customer">{customerName}</strong>
                                  <span className="admin-print-sub">{order.email || "—"}</span>
                                  {order.shipping_phone && (
                                    <span className="admin-print-sub">+91 {order.shipping_phone}</span>
                                  )}
                                </span>
                              </span>
                            </span>
                            <span>
                              <span className="admin-order-items-cell">
                                {firstItem?.product_image ? (
                                  <img src={firstItem.product_image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                ) : (
                                  <span className="admin-order-items-thumb"><Box size={20} /></span>
                                )}
                                <span>
                                  <strong className="admin-print-file-name">{itemCount} item{itemCount === 1 ? "" : "s"}</strong>
                                  {items.slice(0, 2).map((it, i) => (
                                    <span className="admin-print-sub" key={i}>{it.product_name}</span>
                                  ))}
                                </span>
                              </span>
                            </span>
                            <strong className="admin-print-price">{money(order.total_amount)}</strong>
                            <span>
                              <span className={`admin-pay-pill ${paymentTone(order.payment_status)}`}>
                                <i className="admin-status-dot" />
                                {(order.payment_status || "pending").charAt(0).toUpperCase() + (order.payment_status || "pending").slice(1)}
                              </span>
                            </span>
                            <span>
                              <span className={`admin-print-status ${orderStatusTone(order.status)}`}>
                                <Clock size={13} />
                                {(order.status || "pending").replace(/_/g, " ")}
                              </span>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn view"
                                onClick={() => loadOrderDetails(order.id)}
                                title="View details"
                              >
                                <Eye size={16} />
                              </button>
                              <span className="admin-menu-wrap">
                                <button
                                  type="button"
                                  className="admin-icon-btn menu"
                                  onClick={() => setOrderMenuId(orderMenuId === order.id ? null : order.id)}
                                  title="Change status"
                                  aria-label="Change order status"
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {orderMenuId === order.id && (
                                  <>
                                    <span className="admin-menu-overlay" onClick={() => setOrderMenuId(null)} />
                                    <span className="admin-menu">
                                      {statusOptions.map((status) => (
                                        <button
                                          key={status}
                                          type="button"
                                          className={order.status === status ? "current" : ""}
                                          onClick={() => {
                                            updateOrder(order.id, status);
                                            setOrderMenuId(null);
                                          }}
                                        >
                                          {status}
                                        </button>
                                      ))}
                                    </span>
                                  </>
                                )}
                              </span>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">
                        {orders.length ? "No orders match these filters" : "No customer orders yet"}
                      </div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={orderPerPage}
                        onChange={(e) => { setOrderPerPage(Number(e.target.value)); setOrderPage(1); }}
                        aria-label="Orders per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredCustomerOrders.length
                          ? `Showing ${(safeOrderPage - 1) * orderPerPage + 1} to ${Math.min(safeOrderPage * orderPerPage, filteredCustomerOrders.length)} of ${filteredCustomerOrders.length} orders`
                          : "No orders to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeOrderPage <= 1}
                        onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeOrderPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeOrderPage >= orderTotalPages}
                        onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {showOrderTip && (
                  <div className="admin-pro-tip">
                    <span className="admin-pro-tip-ico">
                      <Lightbulb size={22} />
                    </span>
                    <div>
                      <strong>Pro Tip</strong>
                      <p>Keep order statuses updated to improve customer trust and streamline fulfillment.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-pro-tip-close"
                      onClick={() => setShowOrderTip(false)}
                      aria-label="Dismiss tip"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTab === "orders" && selectedOrderDetail && (
              <AdminOrderDetail
                order={selectedOrderDetail}
                loading={detailLoading}
                onBack={() => setSelectedOrderDetail(null)}
                onStatusUpdate={async (id, status) => {
                  // Wait for the PUT to finish before re-fetching details,
                  // otherwise the detail view reloads the old status.
                  if (await updateOrder(id, status)) {
                    loadOrderDetails(id);
                  }
                }}
                onTrackingUpdate={updateOrderDetails}
                onShipmentChange={(id) => {
                  loadAdminData();
                  loadOrderDetails(id);
                }}
                statusOptions={statusOptions}
                money={money}
              />
            )}

            {activeTab === "manual" && (
              <ManualOrders
                categories={categories}
                brands={brands}
                products={products}
                materials={materials}
              />
            )}

            {activeTab === "printing" && (
              <section className="admin-printing-layout">
                <div className="admin-subtabs" role="tablist" aria-label="3D printing admin sections">
                  {printSubTabs.map((tab) => (
                    <button
                      type="button"
                      key={tab.id}
                      className={`admin-subtab ${printSubTab === tab.id ? "active" : ""}`}
                      onClick={() => {
                        setPrintSubTab(tab.id);
                        setSelectedPrintOrderDetail(null);
                      }}
                      role="tab"
                      aria-selected={printSubTab === tab.id}
                    >
                      <span className="admin-subtab-label">
                        {tab.Icon && <tab.Icon size={20} />}
                        <span>{tab.label}</span>
                      </span>
                      <strong>{tab.count}</strong>
                    </button>
                  ))}
                </div>

                {printSubTab === "orders" && !selectedPrintOrderDetail && (
                <div className="admin-panel admin-section-panel admin-print-orders-panel">
                  <div className="admin-panel-title-row admin-print-orders-head">
                    <div className="admin-colors-title">
                      <span className="admin-print-orders-ico">
                        <FileText size={22} />
                      </span>
                      <div>
                        <h2>3D Print Orders</h2>
                        <p className="admin-panel-subtitle">Track custom print jobs and update production status.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact">
                      <Link to="/printing" className="admin-primary admin-new-order-btn">
                        <Plus size={16} />
                        <span>New Order</span>
                      </Link>
                    </div>
                  </div>

                  <div className="admin-print-stats">
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico blue"><FileText size={22} /></span>
                      <div>
                        <strong>{printStats.total}</strong>
                        <span className="admin-print-stat-label">Total Orders</span>
                        <span className="admin-print-stat-sub up">↑ 100% from last month</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico green"><CheckCircle2 size={22} /></span>
                      <div>
                        <strong>{printStats.completed}</strong>
                        <span className="admin-print-stat-label">Completed</span>
                        <span className="admin-print-stat-sub">{printStats.pct(printStats.completed)}</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico amber"><Clock size={22} /></span>
                      <div>
                        <strong>{printStats.inProduction}</strong>
                        <span className="admin-print-stat-label">In Production</span>
                        <span className="admin-print-stat-sub">{printStats.pct(printStats.inProduction)}</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico red"><XCircle size={22} /></span>
                      <div>
                        <strong>{printStats.cancelled}</strong>
                        <span className="admin-print-stat-label">Cancelled</span>
                        <span className="admin-print-stat-sub">{printStats.pct(printStats.cancelled)}</span>
                      </div>
                    </article>
                  </div>

                  <div className="admin-print-filters">
                    <label className="admin-search admin-print-search">
                      <Search size={15} />
                      <input
                        value={printSearch}
                        onChange={(e) => { setPrintSearch(e.target.value); setPrintPage(1); }}
                        placeholder="Search by Order ID, customer, file name..."
                      />
                    </label>
                    <select
                      className="admin-filter-select"
                      value={printStatusFilter}
                      onChange={(e) => { setPrintStatusFilter(e.target.value); setPrintPage(1); }}
                      aria-label="Filter print orders by status"
                    >
                      <option value="all">All Statuses</option>
                      {printStatusOptions.map((status) => (
                        <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                    <select
                      className="admin-filter-select"
                      value={printMaterialFilter}
                      onChange={(e) => { setPrintMaterialFilter(e.target.value); setPrintPage(1); }}
                      aria-label="Filter print orders by material"
                    >
                      <option value="all">All Materials</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <label className="admin-print-date">
                      <Calendar size={15} />
                      <input
                        type="date"
                        value={printDateFilter}
                        onChange={(e) => { setPrintDateFilter(e.target.value); setPrintPage(1); }}
                        aria-label="Filter print orders by date"
                      />
                      {!printDateFilter && <span className="admin-print-date-ph">Select date range</span>}
                    </label>
                    <button type="button" className="admin-secondary" onClick={clearPrintFilters}>
                      Clear
                    </button>
                  </div>

                  <div className="admin-print-table-wrap">
                    <div className="admin-print-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedPrintOrders.length > 0 && paginatedPrintOrders.every((o) => selectedPrintIds.includes(o.id))}
                        onChange={togglePrintSelectAll}
                        aria-label="Select all orders on page"
                      />
                      <span>#</span>
                      <span>Order ID</span>
                      <span>Customer</span>
                      <span>Model/File</span>
                      <span>Material</span>
                      <span>Color</span>
                      <span>Price <ArrowUpDown size={12} /></span>
                      <span>Status <ArrowUpDown size={12} /></span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedPrintOrders.length ? (
                      paginatedPrintOrders.map((order, idx) => {
                        const rowNum = (safePrintPage - 1) * printPerPage + idx + 1;
                        const customerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Guest";
                        const colorHex = order.color_hex || order.custom_color_hex || "#cbd5e1";
                        const colorName = order.color_name || (order.custom_color_hex ? "Custom" : "—");
                        const created = formatPrintDate(order.created_at);
                        return (
                          <div className="admin-print-table-row" key={order.id}>
                            <input
                              type="checkbox"
                              checked={selectedPrintIds.includes(order.id)}
                              onChange={() => togglePrintSelect(order.id)}
                              aria-label={`Select order ${order.order_number}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <button
                                type="button"
                                className="admin-print-order-link"
                                onClick={() => loadPrintOrderDetails(order.id)}
                                title="View order details"
                              >
                                #{order.order_number}
                              </button>
                              <span className="admin-print-sub">ID {order.id}</span>
                            </span>
                            <span>
                              <strong className="admin-print-customer">{customerName}</strong>
                              <span className="admin-print-sub">{order.email || "—"}</span>
                            </span>
                            <span>
                              <span className="admin-print-file">
                                <span className="admin-print-file-thumb">
                                  <Box size={22} />
                                </span>
                                <span>
                                  <strong className="admin-print-file-name">{order.file_name || "model.stl"}</strong>
                                  <span className="admin-print-sub">{order.file_size ? `${order.file_size} MB` : `${order.quantity || 1} pc(s)`}</span>
                                </span>
                              </span>
                            </span>
                            <span>
                              {order.material_name ? (
                                <span className="admin-print-material">{order.material_name}</span>
                              ) : "—"}
                            </span>
                            <span>
                              <span className="admin-print-color">
                                <i style={{ backgroundColor: colorHex }} />
                                {colorName}
                              </span>
                            </span>
                            <strong className="admin-print-price">{money(order.total_amount)}</strong>
                            <span>
                              <span className={`admin-print-status ${printStatusTone(order.status)}`}>
                                <Clock size={13} />
                                {(order.status || "pending").replace(/_/g, " ")}
                              </span>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn view"
                                onClick={() => loadPrintOrderDetails(order.id)}
                                title="View details"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => loadPrintOrderDetails(order.id)}
                                title="Edit production status"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Cancel print order #${order.order_number}?`)) {
                                    updatePrintOrder(order.id, "cancelled");
                                  }
                                }}
                                title="Cancel order"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">
                        {printOrders.length ? "No print orders match these filters" : "No 3D print orders yet"}
                      </div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={printPerPage}
                        onChange={(e) => { setPrintPerPage(Number(e.target.value)); setPrintPage(1); }}
                        aria-label="Print orders per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredPrintOrders.length
                          ? `Showing ${(safePrintPage - 1) * printPerPage + 1} to ${Math.min(safePrintPage * printPerPage, filteredPrintOrders.length)} of ${filteredPrintOrders.length} orders`
                          : "No orders to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safePrintPage <= 1}
                        onClick={() => setPrintPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safePrintPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safePrintPage >= printTotalPages}
                        onClick={() => setPrintPage((p) => Math.min(printTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {printSubTab === "orders" && selectedPrintOrderDetail && (
                  <AdminPrintOrderDetail
                    order={selectedPrintOrderDetail}
                    loading={detailLoading}
                    onBack={() => setSelectedPrintOrderDetail(null)}
                    onStatusUpdate={async (id, status) => {
                      // Wait for the PUT to finish before re-fetching details,
                      // otherwise the detail view reloads the old status.
                      if (await updatePrintOrder(id, status)) {
                        loadPrintOrderDetails(id);
                      }
                    }}
                    onNotesUpdate={async (id, value) => {
                      if (await updatePrintOrderNotes(id, value)) {
                        loadPrintOrderDetails(id);
                      }
                    }}
                    onShipmentChange={(id) => {
                      loadAdminData();
                      loadPrintOrderDetails(id);
                    }}
                    statusOptions={printStatusOptions}
                    money={money}
                  />
                )}

                {printSubTab === "materials" && (
                <div className="admin-panel admin-section-panel admin-materials-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-print-orders-ico">
                        <Box size={22} />
                      </span>
                      <div>
                        <h2>Materials</h2>
                        <p className="admin-panel-subtitle">Manage 3D printing materials, their properties, pricing and availability.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-colors-tools">
                      <label className="admin-search admin-colors-search">
                        <Search size={15} />
                        <input
                          value={materialSearch}
                          onChange={(e) => { setMaterialSearch(e.target.value); setMaterialPage(1); }}
                          placeholder="Search materials..."
                        />
                      </label>
                      <label className="admin-filter-wrap">
                        <Filter size={15} />
                        <select
                          className="admin-filter-select"
                          value={materialTypeFilter}
                          onChange={(e) => { setMaterialTypeFilter(e.target.value); setMaterialPage(1); }}
                          aria-label="Filter materials by type"
                        >
                          <option value="all">Filter by type</option>
                          {materialTypeOptions.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetMaterialForm(); setActiveModal("material"); }}>
                        <Plus size={16} />
                        <span>Add Material</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-print-stats">
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico blue"><Layers size={22} /></span>
                      <div>
                        <strong>{materialStats.total}</strong>
                        <span className="admin-print-stat-label">Total Materials</span>
                        <span className="admin-print-stat-sub up">↑ {materialStats.growth}% from last month</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico green"><CheckCircle2 size={22} /></span>
                      <div>
                        <strong>{materialStats.active}</strong>
                        <span className="admin-print-stat-label">Active Materials</span>
                        <span className="admin-print-stat-sub">{materialStats.pct(materialStats.active)}</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico red"><CirclePause size={22} /></span>
                      <div>
                        <strong>{materialStats.inactive}</strong>
                        <span className="admin-print-stat-label">Inactive Materials</span>
                        <span className="admin-print-stat-sub">{materialStats.pct(materialStats.inactive)}</span>
                      </div>
                    </article>
                    <article className="admin-print-stat">
                      <span className="admin-print-stat-ico purple"><Tag size={22} /></span>
                      <div>
                        <strong>Rs. {Number(materialStats.avgPrice || 0).toFixed(2)}</strong>
                        <span className="admin-print-stat-label">Avg. Price per Gram</span>
                        <span className="admin-print-stat-sub">Across all materials</span>
                      </div>
                    </article>
                  </div>

                  <div className="admin-materials-table-wrap">
                    <div className="admin-materials-table-head">
                      <span>#</span>
                      <span>Material</span>
                      <span>Type</span>
                      <span>Density (g/cm³)</span>
                      <span>Price / g (Rs.)</span>
                      <span>Status</span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedMaterials.length ? (
                      paginatedMaterials.map((material, idx) => {
                        const rowNum = (safeMaterialPage - 1) * materialPerPage + idx + 1;
                        const meta = getMaterialMeta(material);
                        const created = formatPrintDate(material.created_at);
                        return (
                          <div className="admin-materials-table-row" key={material.id}>
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-material-cell">
                                <img
                                  className="admin-material-thumb"
                                  src={meta.image}
                                  alt={`${material.name} filament spool`}
                                  onError={(e) => { e.currentTarget.src = "/images/products/blue_filament.png"; }}
                                />
                                <span>
                                  <strong className="admin-material-name">{material.name}</strong>
                                  <span className="admin-print-sub">{meta.chemical}</span>
                                  <span className="admin-print-sub">{material.description || material.best_for || material.code || "—"}</span>
                                </span>
                              </span>
                            </span>
                            <span>
                              <span className={`admin-material-type ${meta.tone}`}>{meta.type}</span>
                            </span>
                            <span className="admin-material-value">{Number(material.density_g_cm3 || 0).toFixed(2)}</span>
                            <span className="admin-material-value">{Number(material.price_per_gram || 0).toFixed(2)}</span>
                            <span>
                              <button
                                type="button"
                                className={`admin-status-pill-btn ${material.is_active ? "active" : "inactive"}`}
                                onClick={() => updateMaterial(material.id, { is_active: !material.is_active })}
                                title={material.is_active ? "Deactivate material" : "Activate material"}
                              >
                                <i className="admin-status-dot" />
                                {material.is_active ? "Active" : "Inactive"}
                              </button>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => openEditMaterial(material)}
                                title="Edit material"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn copy"
                                onClick={() => duplicateMaterial(material)}
                                title="Duplicate material"
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete material "${material.name}"?`)) {
                                    deleteMaterial(material.id);
                                  }
                                }}
                                title="Delete material"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No materials found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={materialPerPage}
                        onChange={(e) => { setMaterialPerPage(Number(e.target.value)); setMaterialPage(1); }}
                        aria-label="Materials per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredMaterials.length
                          ? `Showing ${(safeMaterialPage - 1) * materialPerPage + 1} to ${Math.min(safeMaterialPage * materialPerPage, filteredMaterials.length)} of ${filteredMaterials.length} materials`
                          : "No materials to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeMaterialPage <= 1}
                        onClick={() => setMaterialPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeMaterialPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeMaterialPage >= materialTotalPages}
                        onClick={() => setMaterialPage((p) => Math.min(materialTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {printSubTab === "colors" && (
                <div className="admin-panel admin-section-panel admin-colors-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-colors-ico">
                        <Palette size={22} />
                      </span>
                      <div>
                        <h2>Colors</h2>
                        <p className="admin-panel-subtitle">Manage visible colors for 3D print orders. These colors will be available for customers to choose.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-colors-tools">
                      <label className="admin-search admin-colors-search">
                        <Search size={15} />
                        <input
                          value={colorSearch}
                          onChange={(e) => { setColorSearch(e.target.value); setColorPage(1); }}
                          placeholder="Search colors..."
                        />
                      </label>
                      <label className="admin-filter-wrap">
                        <Filter size={15} />
                        <select
                          className="admin-filter-select"
                          value={colorStatusFilter}
                          onChange={(e) => { setColorStatusFilter(e.target.value); setColorPage(1); }}
                          aria-label="Filter colors by status"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetColorForm(); setActiveModal("color"); }}>
                        <Plus size={16} />
                        <span>Add Color</span>
                      </button>
                    </div>
                  </div>
                  <div className="admin-colors-table-wrap">
                    <div className="admin-colors-table-head">
                      <span>#</span>
                      <span>Color</span>
                      <span>Name</span>
                      <span>HEX Code</span>
                      <span>Preview</span>
                      <span>Status</span>
                      <span>Usage</span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedColors.length ? (
                      paginatedColors.map((color, idx) => {
                        const rowNum = (safeColorPage - 1) * colorPerPage + idx + 1;
                        const usage = colorUsageMap[color.id] || 0;
                        return (
                        <div className="admin-colors-table-row" key={color.id}>
                          <span className="admin-colors-num">{rowNum}</span>
                          <span>
                            <i className="admin-colors-dot" style={{ backgroundColor: color.hex_code }} />
                          </span>
                          <strong>{color.name}</strong>
                          <span>
                            <code className="admin-colors-hex">{color.hex_code}</code>
                          </span>
                          <span>
                            <i className="admin-colors-preview" style={{ backgroundColor: color.hex_code }} />
                          </span>
                          <span>
                            <button
                              type="button"
                              className={`admin-status-pill-btn ${color.is_active ? "active" : "inactive"}`}
                              onClick={() => updateColor(color.id, { is_active: !color.is_active })}
                              title={color.is_active ? "Deactivate color" : "Activate color"}
                            >
                              <i className="admin-status-dot" />
                              {color.is_active ? "Active" : "Inactive"}
                            </button>
                          </span>
                          <span className="admin-colors-usage">
                            <Cuboid size={15} />
                            {usage} orders
                          </span>
                          <span className="admin-colors-date">{formatColorDate(color.created_at)}</span>
                          <span className="admin-colors-actions">
                            <button
                              type="button"
                              className="admin-icon-btn edit"
                              onClick={() => openEditColor(color)}
                              title="Edit color"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn delete"
                              onClick={() => deleteColor(color.id)}
                              title="Delete color"
                            >
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No colors found</div>
                    )}
                  </div>
                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={colorPerPage}
                        onChange={(e) => { setColorPerPage(Number(e.target.value)); setColorPage(1); }}
                        aria-label="Colors per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredColors.length
                          ? `Showing ${(safeColorPage - 1) * colorPerPage + 1} to ${Math.min(safeColorPage * colorPerPage, filteredColors.length)} of ${filteredColors.length} colors`
                          : "No colors to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeColorPage <= 1}
                        onClick={() => setColorPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeColorPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeColorPage >= colorTotalPages}
                        onClick={() => setColorPage((p) => Math.min(colorTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                )}

              </section>
            )}

            {activeTab === "users" && !selectedUserDetail && (
              <section className="admin-users-layout">
                <div className="admin-print-stats admin-users-stats">
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico blue"><Users size={22} /></span>
                    <div>
                      <strong>{userStats.total}</strong>
                      <span className="admin-print-stat-label">Total Users</span>
                      <span className="admin-print-stat-sub up">↑ 100% from last month</span>
                    </div>
                    <Sparkline tone="blue" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico green"><User size={22} /></span>
                    <div>
                      <strong>{userStats.customers}</strong>
                      <span className="admin-print-stat-label">Customers</span>
                      <span className="admin-print-stat-sub">{userStats.pct(userStats.customers)}</span>
                    </div>
                    <Sparkline tone="green" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico purple"><ShieldCheck size={22} /></span>
                    <div>
                      <strong>{userStats.admins}</strong>
                      <span className="admin-print-stat-label">Admins</span>
                      <span className="admin-print-stat-sub">{userStats.pct(userStats.admins)}</span>
                    </div>
                    <Sparkline tone="purple" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico red"><Ban size={22} /></span>
                    <div>
                      <strong>{userStats.inactive}</strong>
                      <span className="admin-print-stat-label">Inactive Users</span>
                      <span className="admin-print-stat-sub">{userStats.pct(userStats.inactive)}</span>
                    </div>
                    <Sparkline tone="red" />
                  </article>
                </div>

                <div className="admin-panel admin-users-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-users-title">
                      <h2>Users</h2>
                      <p className="admin-panel-subtitle">Manage customer and administrative accounts.</p>
                    </div>
                    <div className="admin-actions compact admin-users-tools">
                      <label className="admin-search admin-users-search">
                        <Search size={15} />
                        <input
                          value={userSearch}
                          onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                          placeholder="Search users..."
                        />
                      </label>
                      <select
                        className="admin-filter-select"
                        value={userRoleFilter}
                        onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}
                        aria-label="Filter users by role"
                      >
                        <option value="all">All Roles</option>
                        <option value="customer">Customer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <select
                        className="admin-filter-select"
                        value={userStatusFilter}
                        onChange={(e) => { setUserStatusFilter(e.target.value); setUserPage(1); }}
                        aria-label="Filter users by status"
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetUserForm(); setActiveModal("user"); }}>
                        <Plus size={16} />
                        <span>Add User</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-users-table-wrap">
                    <div className="admin-users-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedUserIds.includes(u.id))}
                        onChange={toggleUserSelectAll}
                        aria-label="Select all users on page"
                      />
                      <span>#</span>
                      <span>Name</span>
                      <span>Email</span>
                      <span>Role</span>
                      <span>Status</span>
                      <span>Joined On</span>
                      <span>Last Login</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedUsers.length ? (
                      paginatedUsers.map((user, idx) => {
                        const rowNum = (safeUserPage - 1) * userPerPage + idx + 1;
                        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed";
                        const joined = formatPrintDate(user.created_at);
                        const lastLogin = user.last_login ? formatPrintDate(user.last_login) : null;
                        return (
                          <div className="admin-users-table-row" key={user.id}>
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(user.id)}
                              onChange={() => toggleUserSelect(user.id)}
                              aria-label={`Select user ${fullName}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-user-cell">
                                <span className={`admin-user-avatar ${userAvatarTone(fullName)}`}>
                                  {userInitials(user)}
                                </span>
                                <span>
                                  <strong className="admin-product-name">{fullName}</strong>
                                  <span className="admin-print-sub">{user.phone ? `+91 ${user.phone}` : "No phone"}</span>
                                </span>
                              </span>
                            </span>
                            <span className="admin-user-email">{user.email}</span>
                            <span>
                              <span className={`admin-role-pill ${user.role === "admin" ? "admin" : "customer"}`}>
                                {user.role === "admin" ? "Admin" : "Customer"}
                              </span>
                            </span>
                            <span>
                              <span className={`admin-user-status ${user.is_active ? "active" : "inactive"}`}>
                                <i className="admin-status-dot" />
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{joined.date}</strong>
                              <span className="admin-print-sub">{joined.time}</span>
                            </span>
                            <span>
                              {lastLogin ? (
                                <>
                                  <strong className="admin-print-date-text">{lastLogin.date}</strong>
                                  <span className="admin-print-sub">{lastLogin.time}</span>
                                </>
                              ) : (
                                <span className="admin-print-sub">—</span>
                              )}
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => openEditUser(user)}
                                title="Edit user"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn view"
                                onClick={() => loadUserDetails(user)}
                                title="View details"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete user "${fullName}"? Their orders, cart and addresses will be removed too.`)) {
                                    deleteUser(user.id, fullName);
                                  }
                                }}
                                title="Delete user"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No users found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={userPerPage}
                        onChange={(e) => { setUserPerPage(Number(e.target.value)); setUserPage(1); }}
                        aria-label="Users per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredUsers.length
                          ? `Showing ${(safeUserPage - 1) * userPerPage + 1} to ${Math.min(safeUserPage * userPerPage, filteredUsers.length)} of ${filteredUsers.length} users`
                          : "No users to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeUserPage <= 1}
                        onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeUserPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeUserPage >= userTotalPages}
                        onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {showUserTip && (
                  <div className="admin-pro-tip">
                    <span className="admin-pro-tip-ico">
                      <Lightbulb size={22} />
                    </span>
                    <div>
                      <strong>Pro Tip</strong>
                      <p>Keep user accounts up to date and assign the right roles to ensure security and a smooth experience.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-pro-tip-close"
                      onClick={() => setShowUserTip(false)}
                      aria-label="Dismiss tip"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTab === "users" && selectedUserDetail && (
              <section className="admin-detail-view">
                <button type="button" className="admin-detail-back" onClick={() => setSelectedUserDetail(null)}>
                  <ArrowLeft size={15} />
                  <span>Back to users</span>
                </button>
                <div className="admin-detail-header">
                  <div className="admin-detail-header-left admin-user-detail-head">
                    <span className={`admin-user-avatar large ${userAvatarTone(`${selectedUserDetail.first_name} ${selectedUserDetail.last_name}`)}`}>
                      {userInitials(selectedUserDetail)}
                    </span>
                    <div>
                      <h2>{selectedUserDetail.first_name} {selectedUserDetail.last_name}</h2>
                      <span className="admin-detail-date">{selectedUserDetail.email}{selectedUserDetail.phone ? ` · +91 ${selectedUserDetail.phone}` : ""}</span>
                      <span className="admin-row-meta">
                        <span className={`admin-role-pill ${selectedUserDetail.role === "admin" ? "admin" : "customer"}`}>
                          {selectedUserDetail.role}
                        </span>
                        <span className={`admin-user-status ${selectedUserDetail.is_active ? "active" : "inactive"}`}>
                          <i className="admin-status-dot" />
                          {selectedUserDetail.is_active ? "Active" : "Inactive"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="admin-actions compact">
                    <button type="button" className="admin-secondary" onClick={() => { setSelectedUserDetail(null); openEditUser(selectedUserDetail); }}>
                      <Pencil size={15} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
                {userDetailLoading ? (
                  <div className="admin-empty">Loading user details...</div>
                ) : (
                  <>
                    <div className="admin-print-stats">
                      <article className="admin-print-stat">
                        <span className="admin-print-stat-ico blue"><ClipboardList size={22} /></span>
                        <div>
                          <strong>{selectedUserDetail.total_orders ?? (selectedUserDetail.orders || []).length}</strong>
                          <span className="admin-print-stat-label">Product Orders</span>
                        </div>
                      </article>
                      <article className="admin-print-stat">
                        <span className="admin-print-stat-ico green"><BadgePercent size={22} /></span>
                        <div>
                          <strong>{money(selectedUserDetail.total_spent || 0)}</strong>
                          <span className="admin-print-stat-label">Total Spent</span>
                        </div>
                      </article>
                      <article className="admin-print-stat">
                        <span className="admin-print-stat-ico amber"><Cuboid size={22} /></span>
                        <div>
                          <strong>{(selectedUserDetail.printOrders || []).length}</strong>
                          <span className="admin-print-stat-label">3D Print Orders</span>
                        </div>
                      </article>
                      <article className="admin-print-stat">
                        <span className="admin-print-stat-ico purple"><MapPin size={22} /></span>
                        <div>
                          <strong>{(selectedUserDetail.addresses || []).length}</strong>
                          <span className="admin-print-stat-label">Saved Addresses</span>
                        </div>
                      </article>
                    </div>
                    <div className="admin-detail-card">
                      <div className="admin-detail-card-head">
                        <ClipboardList size={18} />
                        <h3>Recent Product Orders</h3>
                      </div>
                      <div className="admin-detail-card-body">
                        {(selectedUserDetail.orders || []).length ? (
                          selectedUserDetail.orders.map((o) => (
                            <div className="admin-user-order-row" key={o.id}>
                              <strong>#{o.order_number}</strong>
                              <span className={`admin-print-status ${orderStatusTone(o.status)}`}>{(o.status || "").replace(/_/g, " ")}</span>
                              <strong>{money(o.total_amount)}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="admin-detail-muted">No product orders yet.</p>
                        )}
                      </div>
                    </div>
                    <div className="admin-detail-card">
                      <div className="admin-detail-card-head">
                        <Cuboid size={18} />
                        <h3>3D Print Orders</h3>
                      </div>
                      <div className="admin-detail-card-body">
                        {(selectedUserDetail.printOrders || []).length ? (
                          selectedUserDetail.printOrders.map((o) => (
                            <div className="admin-user-order-row" key={o.id}>
                              <strong>#{o.order_number}</strong>
                              <span className={`admin-print-status ${printStatusTone(o.status)}`}>{(o.status || "").replace(/_/g, " ")}</span>
                              <strong>{money(o.total_amount)}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="admin-detail-muted">No 3D print orders yet.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {activeTab === "coupons" && (
              <section className="admin-coupons-layout">
                <div className="admin-print-stats admin-coupons-stats">
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico blue"><Ticket size={22} /></span>
                    <div>
                      <strong>{couponStats.total}</strong>
                      <span className="admin-print-stat-label">Total Coupons</span>
                      <span className="admin-print-stat-sub up">↑ 100% from last month</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico green"><CheckCircle2 size={22} /></span>
                    <div>
                      <strong>{couponStats.active}</strong>
                      <span className="admin-print-stat-label">Active Coupons</span>
                      <span className="admin-print-stat-sub">{couponStats.pct(couponStats.active)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico amber"><Clock size={22} /></span>
                    <div>
                      <strong>{couponStats.scheduled}</strong>
                      <span className="admin-print-stat-label">Scheduled Coupons</span>
                      <span className="admin-print-stat-sub">{couponStats.pct(couponStats.scheduled)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico red"><XCircle size={22} /></span>
                    <div>
                      <strong>{couponStats.expired}</strong>
                      <span className="admin-print-stat-label">Expired Coupons</span>
                      <span className="admin-print-stat-sub">{couponStats.pct(couponStats.expired)}</span>
                    </div>
                  </article>
                </div>

                <div className="admin-panel admin-coupons-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-coupons-ico">
                        <Tag size={22} />
                      </span>
                      <div>
                        <h2>Coupons</h2>
                        <p className="admin-panel-subtitle">Create and manage promotional codes for your 3D printing store.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-colors-tools">
                      <label className="admin-search admin-colors-search">
                        <Search size={15} />
                        <input
                          value={couponSearch}
                          onChange={(e) => { setCouponSearch(e.target.value); setCouponPage(1); }}
                          placeholder="Search coupons..."
                        />
                      </label>
                      <label className="admin-filter-wrap">
                        <Filter size={15} />
                        <select
                          className="admin-filter-select"
                          value={couponStatusFilter}
                          onChange={(e) => { setCouponStatusFilter(e.target.value); setCouponPage(1); }}
                          aria-label="Filter coupons by status"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="expired">Expired</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetCouponForm(); setActiveModal("coupon"); }}>
                        <Plus size={16} />
                        <span>Add Coupon</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-coupons-table-wrap">
                    <div className="admin-coupons-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedCoupons.length > 0 && paginatedCoupons.every((c) => selectedCouponIds.includes(c.id))}
                        onChange={toggleCouponSelectAll}
                        aria-label="Select all coupons on page"
                      />
                      <span>#</span>
                      <span>Code</span>
                      <span>Discount</span>
                      <span>Minimum Order</span>
                      <span>Usage</span>
                      <span>Validity</span>
                      <span>Status</span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedCoupons.length ? (
                      paginatedCoupons.map((coupon, idx) => {
                        const rowNum = (safeCouponPage - 1) * couponPerPage + idx + 1;
                        const state = getCouponState(coupon);
                        const used = Number(coupon.used_count || 0);
                        const limit = coupon.usage_limit ? Number(coupon.usage_limit) : null;
                        const usagePct = limit ? Math.min(100, Math.round((used / limit) * 100)) : used > 0 ? 12 : 0;
                        const created = formatPrintDate(coupon.created_at);
                        return (
                          <div className="admin-coupons-table-row" key={coupon.id}>
                            <input
                              type="checkbox"
                              checked={selectedCouponIds.includes(coupon.id)}
                              onChange={() => toggleCouponSelect(coupon.id)}
                              aria-label={`Select coupon ${coupon.code}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-coupon-code-cell">
                                <code className="admin-coupon-chip">{coupon.code}</code>
                                <button
                                  type="button"
                                  className="admin-coupon-copy"
                                  onClick={() => copyCouponCode(coupon.code)}
                                  title="Copy code"
                                >
                                  <Copy size={14} />
                                </button>
                              </span>
                            </span>
                            <span>
                              <span className="admin-coupon-discount">
                                {coupon.discount_type === "percentage"
                                  ? `${coupon.discount_value}%`
                                  : `Rs. ${Number(coupon.discount_value || 0).toLocaleString("en-IN")}`}
                              </span>
                            </span>
                            <span className="admin-material-value">Rs. {Number(coupon.min_order_amount || 0).toLocaleString("en-IN")}</span>
                            <span>
                              <span className="admin-coupon-usage-top">{used} / {limit || "∞"}</span>
                              <span className="admin-coupon-bar">
                                <i style={{ width: `${usagePct}%` }} />
                              </span>
                              <span className="admin-print-sub">{limit ? `${Math.max(0, limit - used)} left` : "Unlimited"}</span>
                            </span>
                            <span className="admin-coupon-validity">
                              {coupon.valid_from || coupon.valid_until ? (
                                <>
                                  <span>{formatShortDate(coupon.valid_from)} -</span>
                                  <span>{formatShortDate(coupon.valid_until)}</span>
                                </>
                              ) : "—"}
                            </span>
                            <span>
                              <span className={`admin-coupon-status ${state}`}>
                                <i className="admin-status-dot" />
                                {state.charAt(0).toUpperCase() + state.slice(1)}
                              </span>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className={`admin-icon-btn announce ${coupon.show_in_announcement ? "on" : ""}`}
                                onClick={() => toggleCouponAnnouncement(coupon)}
                                title={coupon.show_in_announcement ? "Showing in announcement bar — click to remove" : "Show in announcement bar (only one at a time)"}
                              >
                                <Megaphone size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => openEditCoupon(coupon)}
                                title="Edit coupon"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn copy"
                                onClick={() => duplicateCoupon(coupon)}
                                title="Duplicate coupon"
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete coupon "${coupon.code}"?`)) {
                                    deleteCoupon(coupon.id);
                                  }
                                }}
                                title="Delete coupon"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No coupons found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={couponPerPage}
                        onChange={(e) => { setCouponPerPage(Number(e.target.value)); setCouponPage(1); }}
                        aria-label="Coupons per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredCoupons.length
                          ? `Showing ${(safeCouponPage - 1) * couponPerPage + 1} to ${Math.min(safeCouponPage * couponPerPage, filteredCoupons.length)} of ${filteredCoupons.length} coupons`
                          : "No coupons to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeCouponPage <= 1}
                        onClick={() => setCouponPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeCouponPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeCouponPage >= couponTotalPages}
                        onClick={() => setCouponPage((p) => Math.min(couponTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {showCouponTip && (
                  <div className="admin-pro-tip">
                    <span className="admin-pro-tip-ico">
                      <Lightbulb size={22} />
                    </span>
                    <div>
                      <strong>Pro Tip</strong>
                      <p>Use coupons to boost first-time orders, clear inventory, or run special campaigns during festivals.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-pro-tip-close"
                      onClick={() => setShowCouponTip(false)}
                      aria-label="Dismiss tip"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTab === "catalog" && (
              <section className="admin-catalog-layout">
                <div className="admin-print-stats admin-catalog-stats">
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico blue"><Layers size={22} /></span>
                    <div>
                      <strong>{categoryStats.total}</strong>
                      <span className="admin-print-stat-label">Total Categories</span>
                      <span className="admin-print-stat-sub up">↑ {categoryStats.growth}% from last month</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico green"><CheckCircle2 size={22} /></span>
                    <div>
                      <strong>{categoryStats.active}</strong>
                      <span className="admin-print-stat-label">Active Categories</span>
                      <span className="admin-print-stat-sub">{categoryStats.pct(categoryStats.active)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico amber"><Box size={22} /></span>
                    <div>
                      <strong>{categoryStats.inactive}</strong>
                      <span className="admin-print-stat-label">Inactive Categories</span>
                      <span className="admin-print-stat-sub">{categoryStats.pct(categoryStats.inactive)}</span>
                    </div>
                  </article>
                  <article className="admin-print-stat">
                    <span className="admin-print-stat-ico purple"><Tag size={22} /></span>
                    <div>
                      <strong>{categoryStats.totalProducts}</strong>
                      <span className="admin-print-stat-label">Total Products</span>
                      <span className="admin-print-stat-sub">Across all categories</span>
                    </div>
                  </article>
                </div>

                <div className="admin-panel admin-catalog-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-catalog-ico">
                        <Layers size={22} />
                      </span>
                      <div>
                        <h2>Product Categories</h2>
                        <p className="admin-panel-subtitle">Manage catalog categories used by storefront products.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-colors-tools">
                      <label className="admin-search admin-colors-search">
                        <Search size={15} />
                        <input
                          value={categorySearch}
                          onChange={(e) => { setCategorySearch(e.target.value); setCategoryPage(1); }}
                          placeholder="Search categories..."
                        />
                      </label>
                      <label className="admin-filter-wrap">
                        <Filter size={15} />
                        <select
                          className="admin-filter-select"
                          value={categoryStatusFilter}
                          onChange={(e) => { setCategoryStatusFilter(e.target.value); setCategoryPage(1); }}
                          aria-label="Filter categories by status"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetCategoryForm(); setActiveModal("category"); }}>
                        <Plus size={16} />
                        <span>Add Category</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-catalog-table-wrap">
                    <div className="admin-catalog-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedCategories.length > 0 && paginatedCategories.every((c) => selectedCategoryIds.includes(c.id))}
                        onChange={toggleCategorySelectAll}
                        aria-label="Select all categories on page"
                      />
                      <span>#</span>
                      <span>Category</span>
                      <span>Description</span>
                      <span>Products</span>
                      <span>Status</span>
                      <span>Created At</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedCategories.length ? (
                      paginatedCategories.map((category, idx) => {
                        const rowNum = (safeCategoryPage - 1) * categoryPerPage + idx + 1;
                        const CategoryIcon = categoryIconFor(category.name);
                        const active = isCategoryActive(category);
                        const created = formatPrintDate(category.created_at);
                        return (
                          <div className="admin-catalog-table-row" key={category.id}>
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.includes(category.id)}
                              onChange={() => toggleCategorySelect(category.id)}
                              aria-label={`Select category ${category.name}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-category-cell">
                                <span className="admin-category-ico-sm">
                                  <CategoryIcon size={20} />
                                </span>
                                <strong className="admin-category-name">{category.name}</strong>
                              </span>
                            </span>
                            <span className="admin-catalog-desc">{category.description || "—"}</span>
                            <span className="admin-material-value">{category.product_count || 0}</span>
                            <span>
                              <button
                                type="button"
                                className={`admin-status-pill-btn ${active ? "active" : "inactive"}`}
                                onClick={() => toggleCategory(category)}
                                title={active ? "Deactivate category" : "Activate category"}
                              >
                                <i className="admin-status-dot" />
                                {active ? "Active" : "Inactive"}
                              </button>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{created.date}</strong>
                              <span className="admin-print-sub">{created.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn edit"
                                onClick={() => openEditCategory(category)}
                                title="Edit category"
                              >
                                <Pencil size={16} />
                              </button>
                              <Link
                                to={`/products?category=${encodeURIComponent(category.slug || category.name)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="admin-icon-btn view"
                                title="View on storefront"
                              >
                                <Eye size={16} />
                              </Link>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete category "${category.name}"?`)) {
                                    deleteCategory(category.id);
                                  }
                                }}
                                title="Delete category"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No categories found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={categoryPerPage}
                        onChange={(e) => { setCategoryPerPage(Number(e.target.value)); setCategoryPage(1); }}
                        aria-label="Categories per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredCategories.length
                          ? `Showing ${(safeCategoryPage - 1) * categoryPerPage + 1} to ${Math.min(safeCategoryPage * categoryPerPage, filteredCategories.length)} of ${filteredCategories.length} categories`
                          : "No categories to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeCategoryPage <= 1}
                        onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeCategoryPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeCategoryPage >= categoryTotalPages}
                        onClick={() => setCategoryPage((p) => Math.min(categoryTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "brands" && (
              <section className="admin-grid">
                <div className="admin-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Brands</h2>
                      <p className="admin-panel-subtitle">Manage product brands shown in the storefront filters.</p>
                    </div>
                    <div className="admin-actions compact">
                      <span className="admin-count-badge">{brands.length} brands</span>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetBrandForm(); setActiveModal("brand"); }}>
                        <Plus size={16} />
                        <span>Add Brand</span>
                      </button>
                    </div>
                  </div>
                  <div className="admin-list">
                    {brands.length ? (
                      brands.map((brand) => (
                        <article className="admin-user-row" key={brand.id} style={{ gridTemplateColumns: "52px minmax(0, 1fr) 110px 44px 44px" }}>
                          <div className="admin-avatar" style={{ borderRadius: 8 }}>
                            {brand.logo_url ? (
                              <img src={brand.logo_url} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }} />
                            ) : (
                              brand.name?.[0]?.toUpperCase()
                            )}
                          </div>
                          <div>
                            <strong>{brand.name}</strong>
                            <span>
                              {brand.product_count || 0} product(s){brand.website_url ? ` · ${brand.website_url}` : ""}
                            </span>
                            {brand.description && <span>{brand.description}</span>}
                          </div>
                          <button
                            type="button"
                            className={`admin-toggle ${brand.is_active || brand.is_active === undefined ? "active" : ""}`}
                            onClick={() => updateBrand(brand.id, { is_active: !(brand.is_active || brand.is_active === undefined) })}
                          >
                            {brand.is_active || brand.is_active === undefined ? "Active" : "Inactive"}
                          </button>
                          <button
                            type="button"
                            className="admin-icon"
                            onClick={() => openEditBrand(brand)}
                            title="Edit brand"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon danger"
                            onClick={() => deleteBrand(brand.id)}
                            title="Delete brand"
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="admin-empty small">No brands found</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === "reviews" && (
              <section className="admin-grid">
                <div className="admin-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Product Reviews</h2>
                      <p className="admin-panel-subtitle">Approve or remove customer reviews before they appear on the storefront.</p>
                    </div>
                    <span className="admin-count-badge">{reviews.length} reviews</span>
                  </div>
                  <div className="admin-list">
                    {reviews.length ? (
                      reviews.map((review) => (
                        <article className="admin-user-row" key={review.id} style={{ gridTemplateColumns: "64px minmax(0, 1fr) 90px 44px 44px" }}>
                          <span className="admin-avatar">{review.rating}★</span>
                          <div>
                            <strong>{review.title || review.comment?.slice(0, 60) || "Review"}</strong>
                            <span>
                              {review.first_name} {review.last_name} · {review.product_title || "Product"}
                            </span>
                            <span className="admin-stars" aria-label={`${review.rating} out of 5 stars`}>
                              {"★".repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}
                              {"☆".repeat(5 - Math.max(0, Math.min(5, Number(review.rating) || 0)))}
                            </span>
                          </div>
                          <span className={`admin-status-pill ${review.is_approved ? "delivered" : "pending"}`}>
                            {review.is_approved ? "Approved" : "Pending"}
                          </span>
                          <button
                            type="button"
                            className="admin-icon"
                            onClick={() => toggleReview(review.id, Boolean(review.is_approved))}
                            title={review.is_approved ? "Unapprove" : "Approve"}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon danger"
                            onClick={() => deleteReview(review.id)}
                            title="Delete review"
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="admin-empty small">No reviews found</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === "subscribers" && (
              <section className="admin-grid">
                <div className="admin-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Newsletter Subscribers</h2>
                      <p className="admin-panel-subtitle">People who subscribed to the newsletter.</p>
                    </div>
                    <span className="admin-count-badge">{subscribers.length} subscribers</span>
                  </div>
                  <div className="admin-list">
                    {subscribers.length ? (
                      subscribers.map((sub) => (
                        <article className="admin-user-row" key={sub.id} style={{ gridTemplateColumns: "44px minmax(0, 1fr) 110px 44px" }}>
                          <div className="admin-avatar"><Mail size={17} /></div>
                          <div>
                            <strong>{sub.email}</strong>
                            <span>Subscribed {new Date(sub.subscribed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                          </div>
                          <span className={`admin-status-pill ${sub.is_active ? "delivered" : "cancelled"}`}>{sub.is_active ? "Active" : "Inactive"}</span>
                          <button
                            type="button"
                            className="admin-icon danger"
                            onClick={() => deleteSubscriber(sub.id)}
                            title="Remove subscriber"
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="admin-empty small">No subscribers yet</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === "contacts" && !selectedContactDetail && (
              <section className="admin-contacts-layout">
                <div className="admin-print-stats admin-contacts-stats">
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico blue"><Mail size={22} /></span>
                    <div>
                      <strong>{contactStats.total}</strong>
                      <span className="admin-print-stat-label">Total Inquiries</span>
                      <span className="admin-print-stat-sub up">↑ 100% from last month</span>
                    </div>
                    <Sparkline tone="blue" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico green"><MessageSquare size={22} /></span>
                    <div>
                      <strong>{contactStats.replied}</strong>
                      <span className="admin-print-stat-label">Replied</span>
                      <span className="admin-print-stat-sub">{contactStats.pct(contactStats.replied)}</span>
                    </div>
                    <Sparkline tone="green" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico amber"><Clock size={22} /></span>
                    <div>
                      <strong>{contactStats.pending}</strong>
                      <span className="admin-print-stat-label">Pending</span>
                      <span className="admin-print-stat-sub">{contactStats.pct(contactStats.pending)}</span>
                    </div>
                    <Sparkline tone="amber" />
                  </article>
                  <article className="admin-print-stat admin-stat-spark">
                    <span className="admin-print-stat-ico red"><XCircle size={22} /></span>
                    <div>
                      <strong>{contactStats.closed}</strong>
                      <span className="admin-print-stat-label">Closed</span>
                      <span className="admin-print-stat-sub">{contactStats.pct(contactStats.closed)}</span>
                    </div>
                    <Sparkline tone="red" />
                  </article>
                </div>

                <div className="admin-panel admin-contacts-panel">
                  <div className="admin-panel-title-row admin-colors-head">
                    <div className="admin-colors-title">
                      <span className="admin-contacts-ico">
                        <Mail size={22} />
                      </span>
                      <div>
                        <h2>Customer Inquiries</h2>
                        <p className="admin-panel-subtitle">Manage customer inquiries submitted through the contact page.</p>
                      </div>
                    </div>
                    <div className="admin-actions compact admin-contacts-tools">
                      <label className="admin-search admin-contacts-search">
                        <Search size={15} />
                        <input
                          value={contactSearch}
                          onChange={(e) => { setContactSearch(e.target.value); setContactPage(1); }}
                          placeholder="Search inquiries..."
                        />
                      </label>
                      <select
                        className="admin-filter-select"
                        value={contactStatusFilter}
                        onChange={(e) => { setContactStatusFilter(e.target.value); setContactPage(1); }}
                        aria-label="Filter inquiries by status"
                      >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="read">Read</option>
                        <option value="replied">Replied</option>
                        <option value="archived">Archived</option>
                      </select>
                      <label className="admin-print-date">
                        <Calendar size={15} />
                        <input
                          type="date"
                          value={contactDateFilter}
                          onChange={(e) => { setContactDateFilter(e.target.value); setContactPage(1); }}
                          aria-label="Filter inquiries by date"
                        />
                        {!contactDateFilter && <span className="admin-print-date-ph">Select date range</span>}
                      </label>
                      <button
                        type="button"
                        className="admin-secondary"
                        onClick={() => { setContactSearch(""); setContactStatusFilter("all"); setContactDateFilter(""); setContactPage(1); setSelectedContactIds([]); }}
                        title="Clear filters"
                        aria-label="Clear filters"
                      >
                        <Filter size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="admin-contacts-table-wrap">
                    <div className="admin-contacts-table-head">
                      <input
                        type="checkbox"
                        checked={paginatedContacts.length > 0 && paginatedContacts.every((m) => selectedContactIds.includes(m.id))}
                        onChange={toggleContactSelectAll}
                        aria-label="Select all inquiries on page"
                      />
                      <span>#</span>
                      <span>Name</span>
                      <span>Email</span>
                      <span>Subject</span>
                      <span>Message Preview</span>
                      <span>Status</span>
                      <span>Received On</span>
                      <span className="actions">Actions</span>
                    </div>
                    {paginatedContacts.length ? (
                      paginatedContacts.map((message, idx) => {
                        const rowNum = (safeContactPage - 1) * contactPerPage + idx + 1;
                        const received = formatPrintDate(message.created_at);
                        return (
                          <div className="admin-contacts-table-row" key={message.id}>
                            <input
                              type="checkbox"
                              checked={selectedContactIds.includes(message.id)}
                              onChange={() => toggleContactSelect(message.id)}
                              aria-label={`Select inquiry from ${message.name}`}
                            />
                            <span className="admin-print-num">{rowNum}</span>
                            <span>
                              <span className="admin-user-cell">
                                <span className={`admin-user-avatar small ${userAvatarTone(message.name || "")}`}>
                                  {`${message.name?.trim()?.[0] || "?"}`.toUpperCase()}
                                </span>
                                <span>
                                  <strong className="admin-product-name">{message.name}</strong>
                                  <span className="admin-print-sub">{contactTicketNo(message.id)}</span>
                                </span>
                              </span>
                            </span>
                            <span className="admin-user-email">{message.email}</span>
                            <span className="admin-contact-subject">{message.subject || "—"}</span>
                            <span>
                              <button
                                type="button"
                                className="admin-contact-preview"
                                onClick={() => loadContactDetails(message.id)}
                                title="Open conversation"
                              >
                                {(message.message || "").slice(0, 60)}{(message.message || "").length > 60 ? "…" : ""}
                              </button>
                            </span>
                            <span>
                              <span className={`admin-contact-status ${contactStatusTone(message.status)}`}>
                                <i className="admin-status-dot" />
                                {(message.status || "pending").charAt(0).toUpperCase() + (message.status || "pending").slice(1)}
                              </span>
                            </span>
                            <span>
                              <strong className="admin-print-date-text">{received.date}</strong>
                              <span className="admin-print-sub">{received.time}</span>
                            </span>
                            <span className="admin-print-actions">
                              <button
                                type="button"
                                className="admin-icon-btn view"
                                onClick={() => loadContactDetails(message.id)}
                                title="View conversation"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn reply"
                                onClick={() => loadContactDetails(message.id)}
                                title="Reply"
                              >
                                <Reply size={16} />
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn delete"
                                onClick={() => {
                                  if (window.confirm(`Delete inquiry from "${message.name}"?`)) {
                                    deleteContact(message.id);
                                  }
                                }}
                                title="Delete inquiry"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="admin-empty small">No inquiries found</div>
                    )}
                  </div>

                  <div className="admin-colors-foot">
                    <div className="admin-colors-page-info">
                      <select
                        className="admin-filter-select"
                        value={contactPerPage}
                        onChange={(e) => { setContactPerPage(Number(e.target.value)); setContactPage(1); }}
                        aria-label="Inquiries per page"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                      <span>
                        {filteredContacts.length
                          ? `Showing ${(safeContactPage - 1) * contactPerPage + 1} to ${Math.min(safeContactPage * contactPerPage, filteredContacts.length)} of ${filteredContacts.length} inquiries`
                          : "No inquiries to show"}
                      </span>
                    </div>
                    <div className="admin-colors-pagination">
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeContactPage <= 1}
                        onClick={() => setContactPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="admin-page-current">{safeContactPage}</span>
                      <button
                        type="button"
                        className="admin-page-btn"
                        disabled={safeContactPage >= contactTotalPages}
                        onClick={() => setContactPage((p) => Math.min(contactTotalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {showContactTip && (
                  <div className="admin-pro-tip">
                    <span className="admin-pro-tip-ico">
                      <Lightbulb size={22} />
                    </span>
                    <div>
                      <strong>Pro Tip</strong>
                      <p>Respond to inquiries promptly to improve customer satisfaction and increase conversions.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-pro-tip-close"
                      onClick={() => setShowContactTip(false)}
                      aria-label="Dismiss tip"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTab === "contacts" && selectedContactDetail && (
              <section className="admin-inquiry-detail">
                <button type="button" className="admin-detail-back" onClick={() => setSelectedContactDetail(null)}>
                  <ArrowLeft size={15} />
                  <span>Back to Inquiries</span>
                </button>
                {contactDetailLoading || !selectedContactDetail.id ? (
                  <div className="admin-empty">Loading inquiry...</div>
                ) : (
                  <>
                    <header className="admin-inquiry-head">
                      <div>
                        <span className="admin-kicker">PrintyNozzle Control Room</span>
                        <h1>Inquiry {contactTicketNo(selectedContactDetail.id)}</h1>
                        <p className="admin-header-sub">View conversation and reply to the customer.</p>
                        <span className="admin-header-meta">
                          <i className="admin-live-dot" />
                          {new Date(selectedContactDetail.created_at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </div>
                      <div className="admin-actions compact">
                        <select
                          className={`admin-inquiry-status ${contactStatusTone(selectedContactDetail.status)}`}
                          value={selectedContactDetail.status || "pending"}
                          onChange={(e) => updateContact(selectedContactDetail.id, e.target.value)}
                          aria-label="Change inquiry status"
                        >
                          {["pending", "read", "replied", "archived"].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="admin-icon-btn delete"
                          onClick={() => {
                            if (window.confirm(`Delete inquiry from "${selectedContactDetail.name}"?`)) {
                              deleteContact(selectedContactDetail.id);
                            }
                          }}
                          title="Delete inquiry"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </header>

                    <div className="admin-panel admin-inquiry-customer">
                      <h2>Customer &amp; Inquiry Details</h2>
                      <div className="admin-inquiry-customer-grid">
                        <div className="admin-user-cell">
                          <span className={`admin-user-avatar ${userAvatarTone(selectedContactDetail.name || "")}`}>
                            {`${selectedContactDetail.name?.trim()?.[0] || "?"}`.toUpperCase()}
                          </span>
                          <div>
                            <strong className="admin-product-name">
                              {selectedContactDetail.name}
                              <span className="admin-role-pill customer">Customer</span>
                            </strong>
                            <span className="admin-print-sub">✉ {selectedContactDetail.email}</span>
                            <span className="admin-print-sub">☎ {selectedContactDetail.phone || "—"}</span>
                          </div>
                        </div>
                        <div className="admin-inquiry-meta">
                          <span>Subject</span>
                          <strong>{selectedContactDetail.subject || "—"}</strong>
                        </div>
                        <div className="admin-inquiry-meta">
                          <span>Received</span>
                          <strong>{formatShortDate(selectedContactDetail.created_at)}</strong>
                        </div>
                        <div className="admin-inquiry-meta">
                          <span>Status</span>
                          <span className={`admin-contact-status ${contactStatusTone(selectedContactDetail.status)}`}>
                            <i className="admin-status-dot" />
                            {(selectedContactDetail.status || "pending").charAt(0).toUpperCase() + (selectedContactDetail.status || "pending").slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-panel admin-inquiry-conversation">
                      <div className="admin-panel-title-row">
                        <div className="admin-colors-title">
                          <span className="admin-contacts-ico">
                            <MessageSquare size={20} />
                          </span>
                          <div>
                            <h2>Conversation</h2>
                            <p className="admin-panel-subtitle">Messages submitted through the contact page.</p>
                          </div>
                        </div>
                        <span className="admin-count-badge">
                          {1 + (selectedContactDetail.replies || []).length} messages
                        </span>
                      </div>

                      <article className="admin-convo-msg customer">
                        <span className={`admin-user-avatar small ${userAvatarTone(selectedContactDetail.name || "")}`}>
                          {`${selectedContactDetail.name?.trim()?.[0] || "?"}`.toUpperCase()}
                        </span>
                        <div className="admin-convo-body">
                          <div className="admin-convo-head">
                            <strong>
                              {selectedContactDetail.name}
                              <span className="admin-role-pill customer">Customer</span>
                            </strong>
                            <span className="admin-print-sub">To: Support Team</span>
                          </div>
                          <p>{selectedContactDetail.message}</p>
                          <span className="admin-convo-time">
                            {formatShortDate(selectedContactDetail.created_at)} · {formatPrintDate(selectedContactDetail.created_at).time}
                          </span>
                        </div>
                      </article>

                      {(selectedContactDetail.replies || []).map((reply) => (
                        <article className="admin-convo-msg staff" key={reply.id}>
                          <span className="admin-user-avatar small purple">
                            {(reply.sender_name?.trim()?.[0] || "S").toUpperCase()}
                          </span>
                          <div className="admin-convo-body">
                            <div className="admin-convo-head">
                              <strong>
                                {reply.sender_name || "Support Team"}
                                <span className="admin-role-pill admin">Staff</span>
                              </strong>
                              <span className="admin-print-sub">To: {selectedContactDetail.email}</span>
                            </div>
                            <p>{reply.message}</p>
                            <span className="admin-convo-time">
                              {formatShortDate(reply.created_at)} · {formatPrintDate(reply.created_at).time}
                            </span>
                          </div>
                        </article>
                      ))}

                      <form className="admin-reply-box" onSubmit={sendContactReply}>
                        <span className="admin-reply-label">
                          <Reply size={15} />
                          Reply to Customer
                        </span>
                        <textarea
                          rows={4}
                          placeholder="Type your reply here..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <div className="admin-reply-actions">
                          <span className="admin-print-sub">Replies to {selectedContactDetail.email} by email</span>
                          <button className="admin-primary" type="submit" disabled={sendingReply || !replyText.trim()}>
                            <Send size={15} />
                            <span>{sendingReply ? "Sending..." : "Send Reply"}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                )}
              </section>
            )}

            {activeTab === "settings" && (
              <section className="admin-grid two">
                <div className="admin-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Site Settings</h2>
                      <p className="admin-panel-subtitle">Store-wide configuration used across the storefront.</p>
                    </div>
                  </div>
                  <form className="admin-form" onSubmit={submitSettings}>
                    <div className="admin-form-grid">
                      <input placeholder="Site name" value={settingsForm?.site_name || ""} onChange={(e) => updateSettingField("site_name", e.target.value)} />
                      <input placeholder="Site tagline" value={settingsForm?.site_tagline || ""} onChange={(e) => updateSettingField("site_tagline", e.target.value)} />
                      <input placeholder="Support email" value={settingsForm?.support_email || ""} onChange={(e) => updateSettingField("support_email", e.target.value)} />
                      <input placeholder="Support phone" value={settingsForm?.support_phone || ""} onChange={(e) => updateSettingField("support_phone", e.target.value)} />
                      <input placeholder="WhatsApp number" value={settingsForm?.whatsapp_number || ""} onChange={(e) => updateSettingField("whatsapp_number", e.target.value)} />
                      <input placeholder="Free shipping threshold (Rs.)" value={settingsForm?.free_shipping_threshold || ""} onChange={(e) => updateSettingField("free_shipping_threshold", e.target.value)} />
                      <input placeholder="GST rate (%)" value={settingsForm?.gst_rate || ""} onChange={(e) => updateSettingField("gst_rate", e.target.value)} />
                      <input placeholder="Smooth finish cost / gram (Rs.)" value={settingsForm?.smooth_finish_per_gram || ""} onChange={(e) => updateSettingField("smooth_finish_per_gram", e.target.value)} />
                      <input placeholder="Standard shipping cost (Rs.)" value={settingsForm?.standard_shipping_cost || ""} onChange={(e) => updateSettingField("standard_shipping_cost", e.target.value)} />
                      <input placeholder="Express shipping cost (Rs.)" value={settingsForm?.express_shipping_cost || ""} onChange={(e) => updateSettingField("express_shipping_cost", e.target.value)} />
                      <input placeholder="3D print delivery window" value={settingsForm?.printing_delivery_days || ""} onChange={(e) => updateSettingField("printing_delivery_days", e.target.value)} />
                      <input placeholder="3D print delivery region" value={settingsForm?.printing_delivery_region || ""} onChange={(e) => updateSettingField("printing_delivery_region", e.target.value)} />
                    </div>
                    <textarea placeholder="Company address" value={settingsForm?.company_address || ""} onChange={(e) => updateSettingField("company_address", e.target.value)} />
                    <textarea placeholder="Business hours" value={settingsForm?.business_hours || ""} onChange={(e) => updateSettingField("business_hours", e.target.value)} />
                    <button className="admin-primary" type="submit" disabled={settingsSaving}>
                      <Save size={16} />
                      <span>{settingsSaving ? "Saving..." : "Save Settings"}</span>
                    </button>
                  </form>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Delhivery Shipping</h2>
                      <p className="admin-panel-subtitle">
                        {shipStatus
                          ? shipStatus.ready
                            ? `Connected (${shipStatus.env}) — auto-create ${shipStatus.auto_create ? "ON" : "OFF"}`
                            : `Not ready: ${[
                                !shipStatus.token_configured ? "add DELHIVERY_API_TOKEN in server .env" : null,
                                !shipStatus.pickup_configured ? "set pickup warehouse below" : null,
                              ]
                                .filter(Boolean)
                                .join(" • ")}`
                          : "Checking Delhivery configuration…"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-icon-btn view"
                      onClick={loadShipStatus}
                      title="Refresh Delhivery status"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <form className="admin-form" onSubmit={submitSettings}>
                    <div className="admin-form-grid">
                      <select
                        aria-label="Delhivery environment"
                        value={settingsForm?.delhivery_env || "staging"}
                        onChange={(e) => updateSettingField("delhivery_env", e.target.value)}
                      >
                        <option value="staging">staging</option>
                        <option value="production">production</option>
                      </select>
                      <select
                        aria-label="Auto-create shipment on payment"
                        value={String(settingsForm?.delhivery_auto_create ?? "0")}
                        onChange={(e) => updateSettingField("delhivery_auto_create", e.target.value)}
                      >
                        <option value="0">Manual shipment (admin creates)</option>
                        <option value="1">Auto-create on payment</option>
                      </select>
                      <input placeholder="Fallback package weight (grams)" value={settingsForm?.delhivery_default_weight_g || ""} onChange={(e) => updateSettingField("delhivery_default_weight_g", e.target.value)} />
                      <input placeholder="Pickup warehouse name *" value={settingsForm?.delhivery_pickup_name || ""} onChange={(e) => updateSettingField("delhivery_pickup_name", e.target.value)} />
                      <input placeholder="Pickup address" value={settingsForm?.delhivery_pickup_address || ""} onChange={(e) => updateSettingField("delhivery_pickup_address", e.target.value)} />
                      <input placeholder="Pickup city" value={settingsForm?.delhivery_pickup_city || ""} onChange={(e) => updateSettingField("delhivery_pickup_city", e.target.value)} />
                      <input placeholder="Pickup state" value={settingsForm?.delhivery_pickup_state || ""} onChange={(e) => updateSettingField("delhivery_pickup_state", e.target.value)} />
                      <input placeholder="Pickup pincode *" value={settingsForm?.delhivery_pickup_pincode || ""} onChange={(e) => updateSettingField("delhivery_pickup_pincode", e.target.value)} maxLength={6} />
                      <input placeholder="Pickup phone" value={settingsForm?.delhivery_pickup_phone || ""} onChange={(e) => updateSettingField("delhivery_pickup_phone", e.target.value)} />
                    </div>
                    <p className="admin-panel-subtitle">
                      API token lives only in server .env (DELHIVERY_API_TOKEN) — never in the browser.
                      Webhook URL for the Delhivery panel: /api/webhooks/delhivery
                    </p>
                    <button className="admin-primary" type="submit" disabled={settingsSaving}>
                      <Save size={16} />
                      <span>{settingsSaving ? "Saving..." : "Save Settings"}</span>
                    </button>
                  </form>
                  <div style={{ marginTop: 16, borderTop: "1px dashed #e5e7eb", paddingTop: 12 }}>
                    <p className="admin-panel-subtitle" style={{ fontWeight: 600 }}>
                      Pickup from Delhivery portal
                    </p>
                    <p className="admin-panel-subtitle">
                      Delhivery has no list-all-warehouses API for token auth. Copy the EXACT name from Delhivery One →
                      B2C: Settings → Pickup Locations (PTL: My Facilities → Manage Warehouses), paste it into
                      “Pickup warehouse name” above, then Verify &amp; Save here.
                    </p>
                    {shipStatus?.token_health && (
                      <p className="admin-panel-subtitle">
                        Token check — staging: {shipStatus.token_health.staging?.ok ? "OK" : "FAIL"}
                        {" • "}production: {shipStatus.token_health.production?.ok ? "OK" : "FAIL"}
                        {shipStatus.hint ? ` — ${shipStatus.hint}` : ""}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      <button type="button" className="admin-icon-btn view" onClick={fetchWarehouses} disabled={whLoading} title="Check token + probe warehouses">
                        <RefreshCw size={16} />
                        <span style={{ marginLeft: 6 }}>{whLoading ? "Checking…" : "Check Delhivery connection"}</span>
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      <input
                        placeholder="Exact warehouse name from Delhivery portal"
                        value={whVerifyName || settingsForm?.delhivery_pickup_name || ""}
                        onChange={(e) => setWhVerifyName(e.target.value)}
                        style={{ flex: "1 1 240px" }}
                      />
                      <button type="button" className="admin-primary" onClick={verifyAndSaveWarehouse} disabled={whVerifying}>
                        <ShieldCheck size={16} />
                        <span>{whVerifying ? "Verifying…" : "Verify & Save"}</span>
                      </button>
                    </div>
                    {whInfo?.help && (
                      <p className="admin-panel-subtitle" style={{ marginTop: 8 }}>
                        {whInfo.help.where} — {whInfo.help.next}
                      </p>
                    )}
                  </div>
                </div>

                <div className="admin-panel admin-section-panel">
                  <div className="admin-panel-title-row">
                    <div>
                      <h2>Home Hero Banners</h2>
                      <p className="admin-panel-subtitle">Slides shown at the top of the home page.</p>
                    </div>
                    <div className="admin-actions compact">
                      <span className="admin-count-badge">{banners.length} banners</span>
                      <button type="button" className="admin-primary" onClick={() => { setEditing(null); resetBannerForm(); setActiveModal("banner"); }}>
                        <Plus size={16} />
                        <span>Add Banner</span>
                      </button>
                    </div>
                  </div>
                  <div className="admin-list">
                    {banners.length ? (
                      banners.map((banner) => (
                        <article className="admin-user-row" key={banner.id} style={{ gridTemplateColumns: "52px minmax(0, 1fr) 110px 44px 44px" }}>
                          <div className="admin-avatar" style={{ borderRadius: 8 }}>
                            {banner.image_url && <img src={banner.image_url} alt={banner.title || "Banner"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />}
                          </div>
                          <div>
                            <strong>{banner.title || "Untitled banner"}</strong>
                            <span>{banner.subtitle || "No subtitle"} · {banner.sort_order || 0}</span>
                            {banner.link_url && <span><Link2 size={11} /> {banner.link_url}</span>}
                          </div>
                          <button
                            type="button"
                            className={`admin-toggle ${banner.is_active || banner.is_active === undefined ? "active" : ""}`}
                            onClick={() => updateBanner(banner.id, { is_active: !(banner.is_active || banner.is_active === undefined) })}
                          >
                            {banner.is_active || banner.is_active === undefined ? "Active" : "Inactive"}
                          </button>
                          <button
                            type="button"
                            className="admin-icon"
                            onClick={() => openEditBanner(banner)}
                            title="Edit banner"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon danger"
                            onClick={() => deleteBanner(banner.id)}
                            title="Delete banner"
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="admin-empty small">No banners yet — add one to power the home hero slider.</div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <AdminModal
        open={activeModal === "product"}
        wide
        icon={Box}
        title={editing?.id ? "Edit Product" : "Add Product"}
        subtitle={editing?.id ? "Update the product details shown on the storefront page." : "Create a product with all details customers will see on its page."}
        onClose={closeModal}
      >
        <form className="pf-form" onSubmit={submitProduct}>
          <div className="pf-section">
            <div className="pf-section-head">
              <span className="pf-section-ico"><Boxes size={18} /></span>
              <div>
                <h3>Basic Information</h3>
                <p>Essential product details for your catalog.</p>
              </div>
            </div>
            <div className="pf-grid cols-2">
              <label className="pf-field">
                <span>Product Name <b>*</b></span>
                <input required placeholder="ESP32 WROOM-32 WiFi + Bluetooth" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
              </label>
              <label className="pf-field">
                <span>Short Name / SKU <b>*</b></span>
                <input required placeholder="ESP32-WROOM-32" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
              </label>
              <label className="pf-field">
                <span>Short Description <b>*</b></span>
                <input required maxLength={300} placeholder="High Performance Wireless MCU Module" value={productForm.tagline} onChange={(e) => setProductForm({ ...productForm, tagline: e.target.value })} />
              </label>
              <label className="pf-field">
                <span>Category <b>*</b></span>
                <select required value={productForm.category_id} onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}>
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="pf-grid cols-3">
              <label className="pf-field">
                <span>Brand / Manufacturer</span>
                <select value={productForm.brand_id} onChange={(e) => setProductForm({ ...productForm, brand_id: e.target.value })}>
                  <option value="">Select brand (optional)</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                <span>Price (Rs.) <b>*</b></span>
                <input required type="number" min="0" step="0.01" placeholder="449.00" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
              </label>
              <label className="pf-field">
                <span>MRP / Actual Price (Rs.)</span>
                <input type="number" min="0" step="0.01" placeholder="599.00" value={productForm.compare_price} onChange={(e) => setProductForm({ ...productForm, compare_price: e.target.value })} />
              </label>
            </div>
            <div className="pf-grid cols-2">
              <label className="pf-field">
                <span>Stock Quantity <b>*</b></span>
                <input required type="number" min="0" step="1" placeholder="30" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
              </label>
              <label className="pf-field">
                <span>Status</span>
                <span className="pf-status-wrap">
                  <i className={`pf-status-dot ${productForm.is_active ? "on" : "off"}`} />
                  <select
                    value={productForm.is_active ? "active" : "inactive"}
                    onChange={(e) => setProductForm({ ...productForm, is_active: e.target.value === "active" })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </span>
              </label>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head">
              <span className="pf-section-ico"><FileText size={18} /></span>
              <div>
                <h3>Product Description &amp; Features</h3>
                <p>Detailed product information for customers.</p>
              </div>
            </div>
            <div className="pf-grid cols-2">
              <label className="pf-field">
                <span>Product Description <b>*</b></span>
                <textarea rows={5} maxLength={5000} required placeholder="Full product description shown on the Overview tab" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                <em className="pf-count">{productForm.description.length}/5000</em>
              </label>
              <label className="pf-field">
                <span>Key Features (one per line)</span>
                <textarea rows={5} maxLength={5000} placeholder="One feature per line (shown on Overview tab)" value={productForm.keyFeaturesText} onChange={(e) => setProductForm({ ...productForm, keyFeaturesText: e.target.value })} />
                <em className="pf-count">{productForm.keyFeaturesText.length}/5000</em>
              </label>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-head">
              <span className="pf-section-ico"><Settings2 size={18} /></span>
              <div>
                <h3>Specifications</h3>
                <p>Technical specifications (one per line).</p>
              </div>
            </div>
            <div className="pf-grid cols-2">
              <label className="pf-field">
                <textarea rows={6} maxLength={5000} placeholder="One per line as  Name : Value  (shown on Specifications tab)" value={productForm.specificationsText} onChange={(e) => setProductForm({ ...productForm, specificationsText: e.target.value })} />
                <em className="pf-count">{productForm.specificationsText.length}/5000</em>
              </label>
              <label className="pf-field">
                <span>Applications (one per line)</span>
                <textarea rows={6} maxLength={5000} placeholder="One per line (e.g. IoT Projects)" value={productForm.applicationsText} onChange={(e) => setProductForm({ ...productForm, applicationsText: e.target.value })} />
                <em className="pf-count">{productForm.applicationsText.length}/5000</em>
              </label>
            </div>
          </div>

          <div className="pf-grid cols-2 pf-split">
            <div className="pf-section">
              <div className="pf-section-head">
                <span className="pf-section-ico"><Cpu size={18} /></span>
                <div>
                  <h3>Pinout</h3>
                  <p>Upload pinout diagram (optional).</p>
                </div>
              </div>
              <label className="pf-dropzone">
                <Upload size={20} />
                <strong>Click to upload pinout diagram</strong>
                <span>PNG, JPG (Max 5MB)</span>
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => { handlePinoutSelect(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
              {(productForm.pinoutImageFile || existingPinout) && (
                <div className="pf-file-chip">
                  {productForm.pinoutImageFile ? (
                    <ImageIcon size={26} />
                  ) : (
                    <img src={existingPinout} alt="Pinout diagram" />
                  )}
                  <div>
                    <strong>{productForm.pinoutImageFile ? productForm.pinoutImageFile.name : "Current pinout diagram"}</strong>
                    <span>{productForm.pinoutImageFile ? formatFileSize(productForm.pinoutImageFile.size) : "Upload a new file to replace it"}</span>
                  </div>
                  {productForm.pinoutImageFile && (
                    <button type="button" aria-label="Remove pinout file" onClick={() => setProductForm((prev) => ({ ...prev, pinoutImageFile: null }))}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              <label className="pf-field">
                <span>Pinout description</span>
                <textarea rows={3} maxLength={500} placeholder="Explains the diagram shown on the Pinout tab" value={productForm.pinout_description} onChange={(e) => setProductForm({ ...productForm, pinout_description: e.target.value })} />
                <em className="pf-count">{productForm.pinout_description.length}/500</em>
              </label>
            </div>

            <div className="pf-stack">
              <div className="pf-section">
                <div className="pf-section-head">
                  <span className="pf-section-ico"><Link2 size={18} /></span>
                  <div>
                    <h3>Resources (Datasheets &amp; Downloads)</h3>
                    <p>Add useful links for customers (one per line).</p>
                  </div>
                </div>
                <label className="pf-field">
                  <textarea rows={4} maxLength={1000} placeholder="Name | Type | URL  (types: pdf, github, link, image, file)" value={productForm.resourcesText} onChange={(e) => setProductForm({ ...productForm, resourcesText: e.target.value })} />
                  <em className="pf-count">{productForm.resourcesText.length}/1000</em>
                </label>
              </div>
              <div className="pf-section">
                <div className="pf-section-head">
                  <span className="pf-section-ico"><MessageSquare size={18} /></span>
                  <div>
                    <h3>FAQs</h3>
                    <p>Add frequently asked questions (one per line).</p>
                  </div>
                </div>
                <label className="pf-field">
                  <textarea rows={4} maxLength={1000} placeholder="Question | Answer" value={productForm.faqsText} onChange={(e) => setProductForm({ ...productForm, faqsText: e.target.value })} />
                  <em className="pf-count">{productForm.faqsText.length}/1000</em>
                </label>
              </div>
            </div>
          </div>

          <div className="pf-gallery-row">
            <div className="pf-section pf-gallery">
              <div className="pf-section-head">
                <span className="pf-section-ico"><ImageIcon size={18} /></span>
                <div>
                  <h3>Gallery Images</h3>
                  <p>Add product images (up to 5).</p>
                </div>
              </div>
              <div className="pf-thumbs">
                {existingGallery.map((img) => (
                  <span className="pf-thumb" key={img.id}>
                    <img src={img.image_url} alt="Product gallery" />
                    {img.is_primary ? (
                      <em className="pf-primary-badge"><Star size={11} /> Primary</em>
                    ) : (
                      <button
                        type="button"
                        className="pf-thumb-star"
                        title="Set as primary image"
                        onClick={() => editing?.id && setPrimaryGalleryImage(editing.id, img.id)}
                      >
                        <Star size={13} />
                      </button>
                    )}
                    <button type="button" className="pf-thumb-x" title="Remove image" onClick={() => removeExistingGalleryImage(img.id)}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
                {productForm.galleryFiles.map((file, idx) => (
                  <span className="pf-thumb" key={`${file.name}-${idx}`}>
                    <img src={file.preview} alt="New gallery upload" />
                    <em className="pf-new-badge">New</em>
                    <button
                      type="button"
                      className="pf-thumb-x"
                      title="Remove image"
                      onClick={() => setProductForm((prev) => ({ ...prev, galleryFiles: prev.galleryFiles.filter((_, i) => i !== idx) }))}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
                {(existingGallery.length + productForm.galleryFiles.length) < 5 && (
                  <label className="pf-add-tile">
                    <Plus size={18} />
                    <strong>Add Image</strong>
                    <span>PNG, JPG (Max 5MB)</span>
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      multiple
                      onChange={(e) => { handleGallerySelect(e.target.files); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
              <p className="pf-hint">Star an image to make it the primary storefront photo. New images upload on save.</p>
            </div>

            <div className="pf-section pf-options p-2">
              <div className="pf-section-head">
                <span className="pf-section-ico"><Sparkles size={18} /></span>
                <div>
                  <h3>Additional Options</h3>
                </div>
              </div>
              <label className="pf-check-card">
                <input type="checkbox" checked={productForm.is_featured} onChange={(e) => setProductForm({ ...productForm, is_featured: e.target.checked })} />
                <span>
                  <strong>Featured product</strong>
                  <em>Show on homepage or featured sections</em>
                </span>
              </label>
              <label className="pf-check-card">
                <input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })} />
                <span>
                  <strong>Active (visible on storefront)</strong>
                  <em>Make this product visible to customers</em>
                </span>
              </label>
            </div>
          </div>

          <div className="pf-footer">
            {editing?.id ? (
              <button
                type="button"
                className="pf-delete"
                onClick={() => {
                  if (window.confirm(`Delete "${productForm.name}"? It will be hidden from the storefront.`)) {
                    deleteProduct(editing.id);
                    closeModal();
                  }
                }}
              >
                <Trash2 size={15} />
                <span>Delete Product</span>
              </button>
            ) : (
              <span />
            )}
            <div className="pf-footer-actions">
              <button type="button" className="pf-cancel" onClick={closeModal}>
                Cancel
              </button>
              <button className="admin-primary" type="submit" disabled={savingProduct}>
                <Save size={16} />
                <span>{savingProduct ? "Saving..." : editing?.id ? "Update Product" : "Create Product"}</span>
              </button>
            </div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "material"}
        title={editing?.id ? "Edit Material" : "Add Material"}
        subtitle="Manage a printable material and its price per gram."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitMaterial}>
          <div className="admin-form-grid">
            <input required placeholder="Material name" value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} />
            <input placeholder="Code, e.g. PLA" value={materialForm.code} onChange={(e) => setMaterialForm({ ...materialForm, code: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Price per gram" value={materialForm.price_per_gram} onChange={(e) => setMaterialForm({ ...materialForm, price_per_gram: e.target.value })} />
            <input type="number" step="0.01" placeholder="Density g/cm3" value={materialForm.density_g_cm3} onChange={(e) => setMaterialForm({ ...materialForm, density_g_cm3: e.target.value })} />
          </div>
          <textarea placeholder="Best use or description" value={materialForm.description} onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })} />
          <label className="admin-check">
            <input type="checkbox" checked={materialForm.is_active} onChange={(e) => setMaterialForm({ ...materialForm, is_active: e.target.checked })} />
            Available for customers
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Material" : "Create Material"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "color"}
        title={editing?.id ? "Edit Color" : "Add Color"}
        subtitle="Manage a selectable color for custom 3D print requests."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitColor}>
          <div className="admin-color-form-row">
            <input required placeholder="Color name" value={colorForm.name} onChange={(e) => setColorForm({ ...colorForm, name: e.target.value })} />
            <input type="color" value={colorForm.hex_code} onChange={(e) => setColorForm({ ...colorForm, hex_code: e.target.value })} aria-label="Color value" />
          </div>
          <label className="admin-check">
            <input type="checkbox" checked={colorForm.is_active} onChange={(e) => setColorForm({ ...colorForm, is_active: e.target.checked })} />
            Available for customers
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Color" : "Create Color"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "coupon"}
        title={editing?.id ? "Edit Coupon" : "Add Coupon"}
        subtitle="Manage a discount code for checkout."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitCoupon}>
          <input required placeholder="Code" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} />
          <select value={couponForm.discount_type} onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
          </select>
          <div className="admin-form-grid">
            <input required type="number" placeholder="Discount value" value={couponForm.discount_value} onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })} />
            <input type="number" placeholder="Minimum order" value={couponForm.min_order_amount} onChange={(e) => setCouponForm({ ...couponForm, min_order_amount: e.target.value })} />
            <input type="number" placeholder="Max discount (for % codes)" value={couponForm.max_discount} onChange={(e) => setCouponForm({ ...couponForm, max_discount: e.target.value })} />
            <input type="number" placeholder="Usage limit" value={couponForm.usage_limit} onChange={(e) => setCouponForm({ ...couponForm, usage_limit: e.target.value })} />
          </div>
          <div className="admin-form-grid">
            <input type="date" placeholder="Valid from" value={couponForm.valid_from} onChange={(e) => setCouponForm({ ...couponForm, valid_from: e.target.value })} />
            <input type="date" placeholder="Valid until" value={couponForm.valid_until} onChange={(e) => setCouponForm({ ...couponForm, valid_until: e.target.value })} />
          </div>
          <label className="admin-check">
            <input type="checkbox" checked={couponForm.is_active} onChange={(e) => setCouponForm({ ...couponForm, is_active: e.target.checked })} />
            Active coupon
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={couponForm.show_in_announcement} onChange={(e) => setCouponForm({ ...couponForm, show_in_announcement: e.target.checked })} />
            Show in announcement bar
          </label>
          <small className="admin-hint">Only one coupon shows in the top bar at a time — saving this will replace the current one. Only active, valid coupons are displayed.</small>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Coupon" : "Create Coupon"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "category"}
        title={editing?.id ? "Edit Category" : "Add Category"}
        subtitle="Manage a storefront catalog category."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitCategory}>
          <input required placeholder="Name" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
          <textarea placeholder="Description" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
          <label className="admin-check">
            <input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })} />
            Active category
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Category" : "Create Category"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "user"}
        title={editing?.id ? "Edit User" : "Add User"}
        subtitle={editing?.id ? "Update customer/administrator account details." : "Create a new customer or administrator account."}
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitUser}>
          <div className="admin-form-grid">
            <input required placeholder="First name" value={userForm.first_name} onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })} />
            <input required placeholder="Last name" value={userForm.last_name} onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })} />
            <input required type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            <input placeholder="Phone" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
          </div>
          {!editing?.id && (
            <input required type="password" minLength={6} placeholder="Password (min 6 characters)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} autoComplete="new-password" />
          )}
          <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </select>
          <label className="admin-check">
            <input type="checkbox" checked={userForm.is_active} onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })} />
            Active account
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Save User" : "Create User"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "brand"}
        title={editing?.id ? "Edit Brand" : "Add Brand"}
        subtitle="Brands appear in the storefront filter sidebar with their logo."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitBrand}>
          <input required placeholder="Brand name" value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} />
          <textarea placeholder="Short description" value={brandForm.description} onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })} />
          <input placeholder="Website URL (optional)" value={brandForm.website_url} onChange={(e) => setBrandForm({ ...brandForm, website_url: e.target.value })} />
          <label className="admin-file-row">
            <span>Brand logo</span>
            <input type="file" accept="image/*" onChange={(e) => setBrandForm({ ...brandForm, logoFile: e.target.files?.[0] || null })} />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={brandForm.is_active} onChange={(e) => setBrandForm({ ...brandForm, is_active: e.target.checked })} />
            Active brand
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Brand" : "Create Brand"}</span>
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={activeModal === "banner"}
        title={editing?.id ? "Edit Banner" : "Add Hero Banner"}
        subtitle="Banners power the home page hero slider."
        onClose={closeModal}
      >
        <form className="admin-form" onSubmit={submitBanner}>
          <div className="admin-form-grid">
            <input required placeholder="Title" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
            <input type="number" placeholder="Sort order (lower = first)" value={bannerForm.sort_order} onChange={(e) => setBannerForm({ ...bannerForm, sort_order: e.target.value })} />
            <input placeholder="Subtitle" value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })} />
            <input placeholder="Button text (default Shop Now)" value={bannerForm.button_text} onChange={(e) => setBannerForm({ ...bannerForm, button_text: e.target.value })} />
          </div>
          <input placeholder="Link URL (e.g. /products or /printing)" value={bannerForm.link_url} onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })} />
          {editing?.id && !bannerForm.imageFile ? (
            <small className="admin-hint">Current image is kept — pick a new file only to replace it.</small>
          ) : null}
          <label className="admin-file-row">
            <span>Image</span>
            <input type="file" accept="image/*" onChange={(e) => setBannerForm({ ...bannerForm, imageFile: e.target.files?.[0] || null })} />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={bannerForm.is_active} onChange={(e) => setBannerForm({ ...bannerForm, is_active: e.target.checked })} />
            Active banner
          </label>
          <button className="admin-primary" type="submit">
            <Save size={16} />
            <span>{editing?.id ? "Update Banner" : "Create Banner"}</span>
          </button>
        </form>
      </AdminModal>
    </div>
  );
}

function ProductThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="admin-product-thumb dummy" aria-label="No product image">
        <Box size={22} />
      </span>
    );
  }
  return (
    <img
      className="admin-product-thumb"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function Sparkline({ tone = "blue" }) {
  return (
    <svg className={`admin-spark admin-spark-${tone}`} viewBox="0 0 96 40" aria-hidden="true">
      <path d="M2 30 C 14 28, 18 20, 30 22 S 46 30, 56 18 S 76 8, 94 4" fill="none" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M2 30 C 14 28, 18 20, 30 22 S 46 30, 56 18 S 76 8, 94 4 L 94 40 L 2 40 Z" strokeWidth="0" />
    </svg>
  );
}

function AdminModal({ open, title, subtitle, children, onClose, wide = false, icon: Icon = null }) {
  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`admin-modal${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            {Icon && (
              <span className="admin-modal-ico">
                <Icon size={22} />
              </span>
            )}
            <div>
              <h2 id="admin-modal-title">{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function AdminSalesChart({ monthlySales = [] }) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const byMonth = {};
  monthlySales.forEach((row) => {
    byMonth[Number(row.month)] = Number(row.total_sales || 0);
  });
  const series = MONTHS.map((label, idx) => ({ label, value: byMonth[idx + 1] || 0 }));
  const max = Math.max(...series.map((s) => s.value), 1);

  return (
    <div className="admin-chart">
      <div className="admin-chart-bars">
        {series.map((point) => (
          <div className="admin-chart-col" key={point.label} title={`${point.label}: Rs. ${point.value.toLocaleString("en-IN")}`}>
            <div className="admin-chart-bar-wrap">
              <div
                className={`admin-chart-bar ${point.value > 0 ? "" : "empty"}`}
                style={{ height: `${Math.max(point.value > 0 ? 6 : 2, (point.value / max) * 100)}%` }}
              />
            </div>
            <span>{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminTable({ columns, rows, emptyMessage = "No records yet" }) {
  return (
    <div className="admin-table">
      <div className="admin-table-head" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.length ? rows.map((row, index) => (
        <div className="admin-table-row" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }} key={index}>
          {row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}
        </div>
      )) : <div className="admin-empty small">{emptyMessage}</div>}
    </div>
  );
}

/* ============================================================ */
/* ADMIN SHIPMENT CARD (Delhivery — orders + 3D print orders)    */
/* ============================================================ */
function AdminShipmentCard({ order, orderType, onChanged }) {
  const [busy, setBusy] = useState(null);

  if (!order) return null;
  const awb = order.delhivery_awb || null;

  const refresh = () => {
    if (onChanged) onChanged(order.id);
  };

  const runAction = async (key, fn, successMsg) => {
    setBusy(key);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      refresh();
    } catch (error) {
      let msg = error?.response?.data?.message || "Action failed";
      // Label endpoint returns errors as a blob — read the text out of it.
      try {
        if (error?.response?.data instanceof Blob) {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.message) msg = parsed.message;
        }
      } catch {
        /* keep default message */
      }
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const createShipment = () =>
    runAction(
      "create",
      () => adminService.createShipment({ order_type: orderType, order_id: order.id }),
      "Shipment created — AWB assigned"
    );

  const downloadLabel = () =>
    runAction("label", async () => {
      const res = await adminService.downloadShippingLabel(awb, true);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `delhivery-label-${awb}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    });

  const syncStatus = () =>
    runAction(
      "sync",
      () => adminService.syncShipments({ limit: 50 }),
      "Tracking sync complete"
    );

  const raisePickup = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!window.confirm(`Raise Delhivery pickup for AWB ${awb} on ${tomorrow}?`)) return;
    runAction(
      "pickup",
      () => adminService.raisePickup({ pickup_date: tomorrow, awbs: [awb] }),
      "Pickup request raised"
    );
  };

  return (
    <div className="admin-detail-card">
      <div className="admin-detail-card-head">
        <Truck size={18} />
        <h3>Courier Shipment (Delhivery)</h3>
      </div>
      <div className="admin-detail-card-body">
        {awb ? (
          <>
            <div className="admin-detail-field">
              <span className="admin-detail-label">AWB</span>
              <span className="admin-detail-value" style={{ fontFamily: "monospace" }}>{awb}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Shipping Status</span>
              <span className="admin-detail-value" style={{ textTransform: "capitalize" }}>
                {(order.shipping_status || "manifested").replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
            {order.shipment_created_at && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Created</span>
                <span className="admin-detail-value">
                  {new Date(order.shipment_created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            )}
            {order.pickup_request_id && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Pickup Req.</span>
                <span className="admin-detail-value" style={{ fontFamily: "monospace" }}>{order.pickup_request_id}</span>
              </div>
            )}
          </>
        ) : (
          <p className="admin-detail-value" style={{ marginBottom: 4 }}>
            No courier shipment yet.
            {order.shipping_error ? ` Last attempt: ${order.shipping_error}` : " Create one to get an AWB + label."}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {!awb && (
            <button type="button" className="admin-primary small" disabled={busy !== null} onClick={createShipment}>
              <Printer size={15} />
              <span>{busy === "create" ? "Creating…" : "Create Shipment"}</span>
            </button>
          )}
          {awb && (
            <>
              <button type="button" className="admin-primary small" disabled={busy !== null} onClick={downloadLabel}>
                <Download size={15} />
                <span>{busy === "label" ? "Loading…" : "Download Label"}</span>
              </button>
              <button type="button" className="admin-icon-btn edit" disabled={busy !== null} onClick={syncStatus} title="Sync live tracking status">
                <RefreshCw size={15} />
              </button>
              <button type="button" className="admin-icon-btn view" disabled={busy !== null} onClick={raisePickup} title="Raise pickup request">
                <Truck size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* ADMIN ORDER DETAIL VIEW (Regular product orders)             */
/* ============================================================ */
function AdminOrderDetail({ order, loading, onBack, onStatusUpdate, onTrackingUpdate, onShipmentChange, statusOptions, money }) {
  const [trackingForm, setTrackingForm] = useState({});
  const [trackingSaved, setTrackingSaved] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  useEffect(() => {
    if (order?.id) {
      setTrackingForm({
        tracking_number: order.tracking_number || "",
        shipping_carrier: order.shipping_carrier || "",
        notes: order.notes || "",
      });
      setTrackingSaved(false);
    }
  }, [order?.id]);

  const saveTracking = () => {
    onTrackingUpdate(order.id, {
      tracking_number: trackingForm.tracking_number?.trim() || null,
      shipping_carrier: trackingForm.shipping_carrier?.trim() || null,
      notes: trackingForm.notes?.trim() || null,
    });
    setTrackingSaved(true);
  };

  const downloadInvoice = async () => {
    if (!order?.id || invoiceBusy) return;
    setInvoiceBusy(true);
    try {
      const filename = await adminService.downloadOrderInvoicePdf(order.id);
      toast.success(`Invoice ${filename} downloaded.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to download invoice");
    } finally {
      setInvoiceBusy(false);
    }
  };

  if (loading) return <div className="admin-empty">Loading order details…</div>;
  if (!order) return null;

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  const statusIcon = (status) => {
    switch (status) {
      case "delivered": return <CheckCircle2 size={16} />;
      case "shipped": return <Truck size={16} />;
      case "cancelled": return <XCircle size={16} />;
      case "pending": return <Clock size={16} />;
      default: return <Package size={16} />;
    }
  };

  return (
    <section className="admin-detail-view">
      <button type="button" className="admin-detail-back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Back to Orders</span>
      </button>

      <div className="admin-detail-header">
        <div className="admin-detail-header-left">
          <h2>Order #{order.order_number}</h2>
          <span className="admin-detail-date">{formatDate(order.created_at)}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="admin-primary small" disabled={invoiceBusy} onClick={downloadInvoice}>
            <Download size={15} />
            <span>{invoiceBusy ? "Loading…" : "Download Invoice"}</span>
          </button>
          <span className={`admin-detail-status-badge ${order.status}`}>
            {statusIcon(order.status)}
            <span>{order.status}</span>
          </span>
        </div>
      </div>

      <div className="admin-detail-grid">
        {/* Customer Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <User size={18} />
            <h3>Customer Info</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">Name</span>
              <span className="admin-detail-value">{order.first_name} {order.last_name}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Email</span>
              <span className="admin-detail-value">{order.email}</span>
            </div>
            {order.user_phone && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Phone</span>
                <span className="admin-detail-value">{order.user_phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Shipping Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <MapPin size={18} />
            <h3>Shipping Address</h3>
          </div>
          <div className="admin-detail-card-body">
            <p className="admin-detail-address">
              {order.shipping_name && <strong>{order.shipping_name}<br /></strong>}
              {order.shipping_address1}{order.shipping_address2 && `, ${order.shipping_address2}`}<br />
              {order.shipping_city}, {order.shipping_state} {order.shipping_pincode}<br />
              {order.shipping_phone && <>{order.shipping_phone}</>}
            </p>
          </div>
        </div>

        {/* Payment Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <CreditCard size={18} />
            <h3>Payment</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">Method</span>
              <span className="admin-detail-value">{order.payment_method_label || order.payment_method || "—"}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Payment Status</span>
              <span className={`admin-detail-payment-badge ${order.payment_status}`}>{order.payment_status}</span>
            </div>
            {order.tracking_number && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Tracking</span>
                <span className="admin-detail-value">{order.shipping_carrier} — {order.tracking_number}</span>
              </div>
            )}
          </div>
        </div>

        {/* Order Status Update */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <Package size={18} />
            <h3>Update Status</h3>
          </div>
          <div className="admin-detail-card-body">
            <select
              className="admin-detail-status-select"
              value={order.status}
              onChange={(e) => onStatusUpdate(order.id, e.target.value)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tracking & Notes */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <Truck size={18} />
            <h3>Tracking & Notes</h3>
          </div>
          <div className="admin-detail-card-body admin-tracking-form">
            <input
              placeholder="Tracking number"
              value={trackingForm.tracking_number || ""}
              onChange={(e) => setTrackingForm((prev) => ({ ...prev, tracking_number: e.target.value }))}
            />
            <input
              placeholder="Shipping carrier (e.g. Delhivery, Blue Dart)"
              value={trackingForm.shipping_carrier || ""}
              onChange={(e) => setTrackingForm((prev) => ({ ...prev, shipping_carrier: e.target.value }))}
            />
            <textarea
              placeholder="Admin notes (internal)"
              rows={3}
              value={trackingForm.notes || ""}
              onChange={(e) => setTrackingForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <button type="button" className="admin-primary small" onClick={saveTracking}>
              <Save size={15} />
              <span>{trackingSaved ? "Saved" : "Save Tracking"}</span>
            </button>
          </div>
        </div>

        {/* Delhivery courier shipment */}
        <AdminShipmentCard order={order} orderType="order" onChanged={onShipmentChange} />
      </div>

      {/* Order Items */}
      {order.items && order.items.length > 0 && (
        <div className="admin-detail-card admin-detail-items-card">
          <div className="admin-detail-card-head">
            <Box size={18} />
            <h3>Order Items ({order.items.length})</h3>
          </div>
          <div className="admin-detail-items-table">
            <div className="admin-detail-items-header">
              <span>Product</span>
              <span>Price</span>
              <span>Qty</span>
              <span>Total</span>
            </div>
            {order.items.map((item, idx) => (
              <div className="admin-detail-items-row" key={item.id || idx}>
                <div className="admin-detail-item-product">
                  {item.image_url && <img src={item.image_url} alt={item.product_name} />}
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>{item.category_name || item.variant_value || ""}</span>
                  </div>
                </div>
                <span>{money(item.price)}</span>
                <span>{item.quantity}</span>
                <strong>{money(item.total)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Totals */}
      <div className="admin-detail-card admin-detail-summary-card">
        <div className="admin-detail-card-head">
          <FileText size={18} />
          <h3>Order Summary</h3>
        </div>
        <div className="admin-detail-summary-rows">
          <div className="admin-detail-summary-row">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>
          <div className="admin-detail-summary-row">
            <span>Shipping</span>
            <span>{money(order.shipping_cost)}</span>
          </div>
          {order.discount > 0 && (
            <div className="admin-detail-summary-row">
              <span>Discount</span>
              <span className="admin-detail-discount">-{money(order.discount)}</span>
            </div>
          )}
          <div className="admin-detail-summary-row">
            <span>Tax</span>
            <span>{money(order.tax_amount)}</span>
          </div>
          <div className="admin-detail-summary-row admin-detail-total-row">
            <strong>Total Amount</strong>
            <strong>{money(order.total_amount)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* ADMIN 3D PRINT ORDER DETAIL VIEW                             */
/* ============================================================ */
function AdminPrintOrderDetail({ order, loading, onBack, onStatusUpdate, onNotesUpdate, onShipmentChange, statusOptions, money }) {
  const [notesForm, setNotesForm] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  useEffect(() => {
    if (order?.id) {
      setNotesForm(order.admin_notes || "");
      setNotesSaved(false);
    }
  }, [order?.id]);

  const saveNotes = () => {
    onNotesUpdate(order.id, notesForm);
    setNotesSaved(true);
  };

  const downloadInvoice = async () => {
    if (!order?.id || invoiceBusy) return;
    setInvoiceBusy(true);
    try {
      const filename = await adminService.downloadPrintInvoicePdf(order.id);
      toast.success(`Invoice ${filename} downloaded.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to download invoice");
    } finally {
      setInvoiceBusy(false);
    }
  };
  if (loading) return <div className="admin-empty">Loading order details…</div>;
  if (!order) return null;

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  const statusIcon = (status) => {
    switch (status) {
      case "delivered": return <CheckCircle2 size={16} />;
      case "shipped": return <Truck size={16} />;
      case "cancelled": return <XCircle size={16} />;
      case "pending": return <Clock size={16} />;
      case "printing": case "in_production": return <Cuboid size={16} />;
      default: return <Package size={16} />;
    }
  };

  const dimensions = [order.dimension_x, order.dimension_y, order.dimension_z].filter(Boolean);

  return (
    <section className="admin-detail-view">
      <button type="button" className="admin-detail-back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Back to 3D Print Orders</span>
      </button>

      <div className="admin-detail-header">
        <div className="admin-detail-header-left">
          <h2>3D Print Order #{order.order_number}</h2>
          <span className="admin-detail-date">{formatDate(order.created_at)}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="admin-primary small" disabled={invoiceBusy} onClick={downloadInvoice}>
            <Download size={15} />
            <span>{invoiceBusy ? "Loading…" : "Download Invoice"}</span>
          </button>
          <span className={`admin-detail-status-badge ${order.status}`}>
            {statusIcon(order.status)}
            <span>{order.status?.replace(/_/g, " ")}</span>
          </span>
        </div>
      </div>

      <div className="admin-detail-grid">
        {/* Customer Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <User size={18} />
            <h3>Customer Info</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">Name</span>
              <span className="admin-detail-value">{order.first_name} {order.last_name}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Email</span>
              <span className="admin-detail-value">{order.email}</span>
            </div>
            {order.user_phone && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Phone</span>
                <span className="admin-detail-value">{order.user_phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Print File Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <Download size={18} />
            <h3>3D Model File</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">File Name</span>
              <span className="admin-detail-value">{order.file_name}</span>
            </div>
            {order.file_size && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">File Size</span>
                <span className="admin-detail-value">{order.file_size} MB</span>
              </div>
            )}
            {order.file_url && (
              <a href={order.file_url} target="_blank" rel="noopener noreferrer" className="admin-detail-file-link">
                <Download size={14} />
                <span>Download File</span>
              </a>
            )}
          </div>
        </div>

        {/* Print Specifications */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <Cuboid size={18} />
            <h3>Print Specifications</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">Material</span>
              <span className="admin-detail-value">{order.material_name || "—"}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Color</span>
              <span className="admin-detail-value admin-detail-color-value">
                {order.color_hex && <span className="admin-detail-color-dot" style={{ backgroundColor: order.color_hex }} />}
                {order.color_name || order.custom_color_hex || "—"}
              </span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Infill Density</span>
              <span className="admin-detail-value">{order.infill_density || 50}%</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Surface Finish</span>
              <span className="admin-detail-value" style={{ textTransform: "capitalize" }}>{order.surface_finish || "standard"}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Quantity</span>
              <span className="admin-detail-value">{order.quantity}</span>
            </div>
            {dimensions.length > 0 && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Dimensions (mm)</span>
                <span className="admin-detail-value">{dimensions.join(" × ")}</span>
              </div>
            )}
            {order.estimated_weight && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Estimated Weight</span>
                <span className="admin-detail-value">{order.estimated_weight}g</span>
              </div>
            )}
          </div>
        </div>

        {/* Shipping Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <MapPin size={18} />
            <h3>Shipping Address</h3>
          </div>
          <div className="admin-detail-card-body">
            {order.shipping_name ? (
              <p className="admin-detail-address">
                <strong>{order.shipping_name}</strong><br />
                {order.shipping_address1}<br />
                {order.shipping_city}, {order.shipping_state} {order.shipping_pincode}<br />
                {order.shipping_phone && <>{order.shipping_phone}</>}
              </p>
            ) : (
              <span className="admin-detail-muted">No shipping address provided</span>
            )}
          </div>
        </div>

        {/* Payment Info */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <CreditCard size={18} />
            <h3>Payment</h3>
          </div>
          <div className="admin-detail-card-body">
            <div className="admin-detail-field">
              <span className="admin-detail-label">Method</span>
              <span className="admin-detail-value" style={{ textTransform: "uppercase" }}>{order.payment_method || "—"}</span>
            </div>
            <div className="admin-detail-field">
              <span className="admin-detail-label">Payment Status</span>
              <span className={`admin-detail-payment-badge ${order.payment_status}`}>{order.payment_status}</span>
            </div>
          </div>
        </div>

        {/* Status Update */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <Package size={18} />
            <h3>Update Status</h3>
          </div>
          <div className="admin-detail-card-body">
            <select
              className="admin-detail-status-select"
              value={order.status}
              onChange={(e) => onStatusUpdate(order.id, e.target.value)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Admin Notes */}
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <FileText size={18} />
            <h3>Admin Notes</h3>
          </div>
          <div className="admin-detail-card-body admin-tracking-form">
            <textarea
              placeholder="Internal notes about this print job"
              rows={3}
              value={notesForm}
              onChange={(e) => setNotesForm(e.target.value)}
            />
            {order.admin_notes && (
              <div className="admin-detail-field">
                <span className="admin-detail-label">Current</span>
                <span className="admin-detail-value" style={{ textAlign: "left", fontWeight: 600 }}>{order.admin_notes}</span>
              </div>
            )}
            <button type="button" className="admin-primary small" onClick={saveNotes}>
              <Save size={15} />
              <span>{notesSaved ? "Saved" : "Save Notes"}</span>
            </button>
          </div>
        </div>

        {/* Delhivery courier shipment */}
        <AdminShipmentCard order={order} orderType="print" onChanged={onShipmentChange} />
      </div>

      {/* Pricing Summary */}
      <div className="admin-detail-card admin-detail-summary-card">
        <div className="admin-detail-card-head">
          <FileText size={18} />
          <h3>Pricing Breakdown</h3>
        </div>
        <div className="admin-detail-summary-rows">
          <div className="admin-detail-summary-row">
            <span>Material Cost</span>
            <span>{money(order.material_cost)}</span>
          </div>
          {order.color_cost > 0 && (
            <div className="admin-detail-summary-row">
              <span>Color Cost</span>
              <span>{money(order.color_cost)}</span>
            </div>
          )}
          {order.finish_cost > 0 && (
            <div className="admin-detail-summary-row">
              <span>Finish Cost</span>
              <span>{money(order.finish_cost)}</span>
            </div>
          )}
          <div className="admin-detail-summary-row">
            <span>Subtotal</span>
            <span>{money(order.subtotal)}</span>
          </div>
          <div className="admin-detail-summary-row">
            <span>Tax (GST)</span>
            <span>{money(order.tax_amount)}</span>
          </div>
          <div className="admin-detail-summary-row admin-detail-total-row">
            <strong>Total Amount</strong>
            <strong>{money(order.total_amount)}</strong>
          </div>
        </div>
      </div>

      {/* Admin Notes */}
      {order.admin_notes && (
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <FileText size={18} />
            <h3>Admin Notes</h3>
          </div>
          <div className="admin-detail-card-body">
            <p className="admin-detail-notes">{order.admin_notes}</p>
          </div>
        </div>
      )}

      {order.notes && (
        <div className="admin-detail-card">
          <div className="admin-detail-card-head">
            <FileText size={18} />
            <h3>Customer Notes</h3>
          </div>
          <div className="admin-detail-card-body">
            <p className="admin-detail-notes">{order.notes}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminPanel;
