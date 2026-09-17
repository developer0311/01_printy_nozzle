import api from "./api.js";

const downloadPdf = (response, fallbackName) => {
  const blob = new Blob([response.data], { type: "application/pdf" });
  let filename = fallbackName;
  const disposition = response.headers?.["content-disposition"] || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  if (match?.[1]) filename = match[1];
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return filename;
};

const adminService = {
  getStats: () => api.get("/admin/dashboard/stats"),
  getSalesChart: () => api.get("/admin/dashboard/sales-chart"),
  getProducts: (params = {}) => api.get("/admin/products", { params }),
  getProductById: (id) => api.get(`/admin/products/${id}`),
  createProduct: (payload) =>
    api.post("/admin/products", payload, { headers: { "Content-Type": undefined } }),
  updateProduct: (id, payload) =>
    api.put(`/admin/products/${id}`, payload, { headers: { "Content-Type": undefined } }),
  deleteProduct: (id) => api.delete(`/admin/products/${id}`),
  deleteProductImage: (imageId) => api.delete(`/admin/products/images/${imageId}`),
  setPrimaryProductImage: (productId, imageId) =>
    api.put(`/admin/products/${productId}/images/${imageId}/primary`),
  getOrders: (params = {}) => api.get("/admin/orders", { params }),
  getOrderDetails: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, payload) => api.put(`/admin/orders/${id}/status`, payload),
  getOrderInvoice: (id) => api.get(`/admin/orders/${id}/invoice`),
  downloadOrderInvoicePdf: async (id) => {
    const response = await api.get(`/admin/orders/${id}/invoice`, {
      params: { format: "pdf" },
      responseType: "blob",
    });
    return downloadPdf(response, `Invoice-INV-${id}.pdf`);
  },
  getPrintOrders: (params = {}) => api.get("/admin/printing/orders", { params }),
  getPrintOrderDetails: (id) => api.get(`/admin/printing/orders/${id}`),
  updatePrintOrderStatus: (id, payload) =>
    api.put(`/admin/printing/orders/${id}/status`, payload),
  getPrintOrderInvoice: (id) => api.get(`/admin/printing/orders/${id}/invoice`),
  downloadPrintInvoicePdf: async (id) => {
    const response = await api.get(`/admin/printing/orders/${id}/invoice`, {
      params: { format: "pdf" },
      responseType: "blob",
    });
    return downloadPdf(response, `Invoice-INV-${id}.pdf`);
  },
  getUsers: (params = {}) => api.get("/admin/users", { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  createUser: (payload) => api.post("/admin/users", payload),
  updateUser: (id, payload) => api.put(`/admin/users/${id}`, payload),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getCoupons: () => api.get("/admin/coupons"),
  createCoupon: (payload) => api.post("/admin/coupons", payload),
  updateCoupon: (id, payload) => api.put(`/admin/coupons/${id}`, payload),
  deleteCoupon: (id) => api.delete(`/admin/coupons/${id}`),
  getCategories: () => api.get("/categories"),
  createCategory: (payload) => api.post("/admin/categories", payload),
  updateCategory: (id, payload) => api.put(`/admin/categories/${id}`, payload),
  deleteCategory: (id) => api.delete(`/admin/categories/${id}`),
  getBrands: () => api.get("/admin/brands"),
  createBrand: (payload) => api.post("/admin/brands", payload),
  updateBrand: (id, payload) => api.put(`/admin/brands/${id}`, payload),
  deleteBrand: (id) => api.delete(`/admin/brands/${id}`),
  getMaterials: () => api.get("/admin/printing/materials"),
  createMaterial: (payload) => api.post("/admin/printing/materials", payload),
  updateMaterial: (id, payload) => api.put(`/admin/printing/materials/${id}`, payload),
  deleteMaterial: (id) => api.delete(`/admin/printing/materials/${id}`),
  getColors: () => api.get("/admin/printing/colors"),
  createColor: (payload) => api.post("/admin/printing/colors", payload),
  updateColor: (id, payload) => api.put(`/admin/printing/colors/${id}`, payload),
  deleteColor: (id) => api.delete(`/admin/printing/colors/${id}`),
  getReviews: (params = {}) => api.get("/admin/reviews", { params }),
  toggleReviewApproval: (id, payload) =>
    api.put(`/admin/reviews/${id}/approve`, payload),
  deleteReview: (id) => api.delete(`/admin/reviews/${id}`),
  getSubscribers: (params = {}) => api.get("/admin/newsletter/subscribers", { params }),
  deleteSubscriber: (id) => api.delete(`/admin/newsletter/subscribers/${id}`),
  getContacts: (params = {}) => api.get("/admin/newsletter/contacts", { params }),
  getContactById: (id) => api.get(`/admin/newsletter/contacts/${id}`),
  updateContactStatus: (id, payload) =>
    api.put(`/admin/newsletter/contacts/${id}`, payload),
  replyToContact: (id, payload) => api.post(`/admin/newsletter/contacts/${id}/reply`, payload),
  deleteContact: (id) => api.delete(`/admin/newsletter/contacts/${id}`),
  getSettings: () => api.get("/admin/settings"),
  updateSettings: (payload) => api.put("/admin/settings", payload),
  getShippingStatus: () => api.get("/admin/shipping/status"),
  createShipment: (payload) => api.post("/admin/shipping/shipment", payload),
  downloadShippingLabel: (awb, pdf = true) =>
    api.get("/admin/shipping/label", {
      params: { awb, pdf: pdf ? "true" : "false" },
      responseType: "blob",
    }),
  raisePickup: (payload) => api.post("/admin/shipping/pickup", payload),
  syncShipments: (payload = {}) => api.post("/admin/shipping/sync", payload),
  registerWarehouse: (payload) => api.post("/admin/shipping/warehouse", payload),
  fetchWaybills: (count = 1) => api.get("/admin/shipping/waybills", { params: { count } }),
  getBanners: () => api.get("/admin/settings/banners"),
  createBanner: (payload) =>
    api.post("/admin/settings/banners", payload, { headers: { "Content-Type": undefined } }),
  updateBanner: (id, payload) =>
    api.put(`/admin/settings/banners/${id}`, payload, { headers: { "Content-Type": undefined } }),
  deleteBanner: (id) => api.delete(`/admin/settings/banners/${id}`),
};

export default adminService;