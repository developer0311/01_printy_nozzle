import api from "./api.js";

const downloadPdf = (response, fallbackName) => {
  const blob = new Blob([response.data], { type: "application/pdf" });
  // Prefer the server-sent filename (Content-Disposition), else the fallback.
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

const orderService = {
  getOrders: (params = {}) => api.get("/orders", { params }),
  getOrder: (id) => api.get(`/orders/${id}`),
  cancelOrder: (id) => api.put(`/orders/${id}/cancel`),
  reorder: (id) => api.post(`/orders/${id}/reorder`),
  getInvoice: (id) => api.get(`/orders/${id}/invoice`),
  downloadInvoicePdf: async (id) => {
    const clean = String(id || "").replace(/^#/, "");
    const response = await api.get(`/orders/${encodeURIComponent(clean)}/invoice`, {
      params: { format: "pdf" },
      responseType: "blob",
    });
    return downloadPdf(response, `Invoice-INV-${clean}.pdf`);
  },
};

export default orderService;
