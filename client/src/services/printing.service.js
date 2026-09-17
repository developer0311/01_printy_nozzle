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

const printingService = {
  getMaterials: () => api.get("/printing/materials"),
  getColors: () => api.get("/printing/colors"),
  calculatePrice: (payload) => api.post("/printing/calculate-price", payload),
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/printing/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  createOrder: (payload) => api.post("/printing/order", payload),
  getUserPrintOrders: (params = {}) => api.get("/printing/orders", { params }),
  getPrintOrderById: (id) => api.get(`/printing/orders/${id}`),
  getPrintInvoice: (id) => api.get(`/printing/orders/${id}/invoice`),
  downloadInvoicePdf: async (id) => {
    const clean = String(id || "").replace(/^#/, "");
    const response = await api.get(`/printing/orders/${encodeURIComponent(clean)}/invoice`, {
      params: { format: "pdf" },
      responseType: "blob",
    });
    return downloadPdf(response, `Invoice-INV-${clean}.pdf`);
  },
};

export default printingService;
