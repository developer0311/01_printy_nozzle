import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Truck,
  Zap,
  ShieldCheck,
  RotateCcw,
  Headphones,
  Lock,
  Tag,
  Info,
  MapPin,
} from "lucide-react";
import "../../public/css/checkout.css";
import cartService from "../services/cart.service";
import checkoutService from "../services/checkout.service";
import catalogService from "../services/catalog.service";
import shippingService from "../services/shipping.service";
import profileService from "../services/profile.service";
import { notifyCartChange } from "../utils/cartSync";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Delhi",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
];

export default function Checkout() {
  const navigate = useNavigate();

  // Load items from the server cart (no fake fallback data)
  const [checkoutItems, setCheckoutItems] = useState(() => {
    try {
      const saved = localStorage.getItem("printy_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [placingOrder, setPlacingOrder] = useState(false);

  // Payment success popup (shown after verified Razorpay payment)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);

  // Saved addresses from the backend (My Profile → My Addresses)
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");

  // Shipping Form State
  const [formData, setFormData] = useState({
    fullName: "",
    phoneNumber: "",
    emailAddress: "",
    pincode: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "West Bengal",
    country: "India",
    saveAddress: true,
  });

  // Shipping Option: "standard" | "express"
  const [shippingOption, setShippingOption] = useState("standard");

  // Live Delhivery rate for the entered pincode + selected mode.
  // Applied to totals when fresh; flat Settings rates are the fallback.
  const [liveQuote, setLiveQuote] = useState({ amount: null, pin: "", mode: "", loading: false });

  // Payment method: "razorpay" (UPI / cards / netbanking / wallets via
  // Razorpay popup) or "qr" (pay to merchant QR, attach screenshot proof).
  const [paymentMethod, setPaymentMethod] = useState("razorpay");

  // Merchant QR config (Admin → Settings) + customer screenshot proof.
  const [qrConfig, setQrConfig] = useState({ upi_id: "", payee_name: "Printynozzle", image_url: "" });
  const [qrScreenshot, setQrScreenshot] = useState(null);
  const [qrPreview, setQrPreview] = useState("");
  const [qrUploading, setQrUploading] = useState(false);
  // Bundled merchant QR (client/public/images/payment-qr.jpg) is the fallback
  // until the admin uploads a QR from Settings. Hidden if the file is missing.
  const [qrImgError, setQrImgError] = useState(false);
  const qrImgSrc = qrConfig.image_url || "/images/payment-qr.jpg";

  useEffect(() => {
    setQrImgError(false);
  }, [qrConfig.image_url]);

  // Coupon State
  const [couponCode, setCouponCode] = useState("");
  const [serverDiscount, setServerDiscount] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [serverTax, setServerTax] = useState(null);

  // Store configuration from Admin → Settings (via checkout initiate)
  const [storeConfig, setStoreConfig] = useState({
    gstRate: 18,
    freeShippingThreshold: 999,
    shippingOptions: {
      standard: { cost: 0, label: "Standard Delivery", eta: "3-5 Working Days" },
      express: { cost: 99, label: "Express Delivery", eta: "1-2 Working Days" },
    },
  });

  useEffect(() => {
    let active = true;

    const loadCheckout = async () => {
      if (!localStorage.getItem("token")) return;

      try {
        const [cartResponse, checkoutResponse] = await Promise.all([
          cartService.getCart(),
          checkoutService.initiate(),
        ]);
        const serverCart = cartResponse.data.cart;
        const checkout = checkoutResponse.data.checkout;
        if (!active) return;

        setCheckoutItems(
          (serverCart.items || []).map((item) => {
            const isPrint = item.item_type === "print" || item.is_print || item.product_id == null;
            if (isPrint) {
              const material = item.material_name || "3D Print";
              const colorLabel = item.color_name || item.custom_color_hex || "Custom";
              const infill = item.infill_density || 50;
              const finish = item.surface_finish === "smooth" ? "Smooth" : "Standard";
              return {
                id: item.id,
                productId: null,
                name: item.name || (item.file_name ? `3D Print — ${item.file_name}` : "Custom 3D Print"),
                subtitle: item.variant_value || `${material} • ${colorLabel} • ${infill}% • ${finish}`,
                image: item.image || "/images/rocket.png",
                price: Number(item.unit_price ?? item.print_unit_price ?? item.price ?? 0),
                quantity: Number(item.quantity || 1),
                isCustomPrint: true,
              };
            }
            return {
              id: item.id,
              productId: item.product_id,
              name: item.name,
              subtitle: item.variant_value || item.category_name || item.slug,
              image: item.image || "/images/products/01.png",
              price: Number(item.unit_price || item.price || 0),
              quantity: Number(item.quantity || 1),
              isCustomPrint: false,
            };
          })
        );
        setServerDiscount(Number(checkout.discount || serverCart.discount || 0));
        setServerTax(Number(serverCart.taxAmount || 0));
        setAppliedCouponCode(checkout.coupon?.code || serverCart.coupon?.code || "");
        if (checkout.qrPayment) {
          setQrConfig({
            upi_id: checkout.qrPayment.upi_id || "",
            payee_name: checkout.qrPayment.payee_name || "Printynozzle",
            image_url: checkout.qrPayment.image_url || "",
          });
        }
        if (checkout.gstRate || checkout.freeShippingThreshold || checkout.shippingOptions) {
          setStoreConfig((prev) => ({
            gstRate: Number(checkout.gstRate || prev.gstRate),
            freeShippingThreshold: Number(
              checkout.freeShippingThreshold || prev.freeShippingThreshold
            ),
            shippingOptions: checkout.shippingOptions || prev.shippingOptions,
          }));
        }

        const defaultAddress = checkout.savedAddresses?.find((address) => address.is_default) || checkout.savedAddresses?.[0];
        setSavedAddresses(checkout.savedAddresses || []);
        if (defaultAddress) {
          setSelectedSavedAddressId(String(defaultAddress.id || ""));
          setFormData((prev) => ({
            ...prev,
            fullName: defaultAddress.full_name || prev.fullName,
            phoneNumber: defaultAddress.phone || prev.phoneNumber,
            emailAddress: defaultAddress.email || prev.emailAddress,
            pincode: defaultAddress.pincode || prev.pincode,
            addressLine1: defaultAddress.address_line1 || prev.addressLine1,
            addressLine2: defaultAddress.address_line2 || prev.addressLine2,
            city: defaultAddress.city || prev.city,
            state: defaultAddress.state || prev.state,
            country: defaultAddress.country || prev.country,
          }));
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Unable to load checkout");
      }
    };

    loadCheckout();
    return () => {
      active = false;
    };
  }, []);

  // Financial calculations
  const subtotal = useMemo(() => {
    return checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [checkoutItems]);

  // Fetch the live Delhivery quote whenever a full pincode or the
  // shipping mode changes (debounced; silent fallback to flat rates).
  useEffect(() => {
    const pin = String(formData.pincode || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      setLiveQuote({ amount: null, pin: "", mode: "", loading: false });
      return;
    }
    let active = true;
    setLiveQuote((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await shippingService.getCharges({ d_pin: pin, mode: shippingOption });
        if (!active) return;
        const amount = Number(res.data?.amount);
        setLiveQuote(
          Number.isFinite(amount)
            ? { amount, pin, mode: shippingOption, loading: false }
            : { amount: null, pin: "", mode: "", loading: false }
        );
      } catch {
        if (active) setLiveQuote({ amount: null, pin: "", mode: "", loading: false });
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.pincode, shippingOption]);

  const liveRateActive =
    liveQuote.amount != null &&
    liveQuote.pin === String(formData.pincode || "").trim() &&
    liveQuote.mode === shippingOption;

  const shippingFee = useMemo(() => {
    if (liveRateActive) return Number(liveQuote.amount);
    const options = storeConfig.shippingOptions || {};
    if (shippingOption === "express") return Number(options.express?.cost ?? 99);
    return Number(options.standard?.cost ?? 0);
  }, [shippingOption, storeConfig, liveQuote, liveRateActive, formData.pincode]);

  const discount = useMemo(() => {
    return Number(serverDiscount || 0);
  }, [serverDiscount]);

  const gstTax = useMemo(() => {
    // GST is always on the full subtotal; coupon discount is applied on
    // (subtotal + GST). Server provides the authoritative taxAmount.
    if (serverTax != null) return Number(serverTax);
    const rate = Number(storeConfig.gstRate || 18) / 100;
    return +(subtotal * rate).toFixed(2);
  }, [subtotal, serverTax, storeConfig]);

  const grandTotal = useMemo(() => {
    return +(subtotal - discount + gstTax + shippingFee).toFixed(2);
  }, [subtotal, discount, gstTax, shippingFee]);

  // Dynamic UPI QR: scanning it opens any UPI app with the payee AND the
  // exact order total pre-filled — no manual amount typing.
  const upiPayUrl = useMemo(() => {
    const pa = String(qrConfig.upi_id || "").trim();
    if (!pa) return "";
    const params = new URLSearchParams({
      pa,
      pn: String(qrConfig.payee_name || "Printynozzle").trim() || "Printynozzle",
      am: Number(grandTotal || 0).toFixed(2),
      cu: "INR",
      tn: "Printynozzle store payment",
    });
    return `upi://pay?${params.toString()}`;
  }, [qrConfig.upi_id, qrConfig.payee_name, grandTotal]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCheckPincode = async () => {
    if (!formData.pincode || formData.pincode.trim().length < 6) {
      toast.error("Please enter a valid 6-digit PIN code");
      return;
    }
    try {
      const response = await catalogService.checkPincode(formData.pincode.trim());
      if (response.data?.is_serviceable === false) {
        toast.warn(response.data?.message || `PIN code ${formData.pincode} is not serviceable yet.`);
      } else {
        toast.success(response.data?.message || `PIN code ${formData.pincode} is serviceable for Fast Delivery!`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to check PIN code serviceability");
    }
  };

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      toast.warn("Please enter a coupon code");
      return;
    }
    if (!localStorage.getItem("token")) {
      toast.info("Please login to apply a coupon");
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }
    setCouponBusy(true);
    try {
      const response = await cartService.applyCoupon(code);
      const cartResponse = await cartService.getCart();
      const serverCart = cartResponse.data.cart;
      setServerDiscount(Number(response.data.coupon?.discount_amount || serverCart.discount || 0));
      setServerTax(Number(serverCart.taxAmount || 0));
      setAppliedCouponCode(response.data.coupon?.code || code);
      setCouponCode("");
      toast.success(response.data.message || `Coupon ${code} applied!`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Invalid coupon code");
    } finally {
      setCouponBusy(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponBusy(true);
    try {
      await cartService.removeCoupon();
      const cartResponse = await cartService.getCart();
      const serverCart = cartResponse.data.cart;
      setServerDiscount(Number(serverCart.discount || 0));
      setServerTax(Number(serverCart.taxAmount || 0));
      setAppliedCouponCode("");
      toast.success("Coupon removed");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to remove coupon");
    } finally {
      setCouponBusy(false);
    }
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const buildOrderPayload = (extra = {}) => ({
    shipping_name: formData.fullName,
    shipping_phone: formData.phoneNumber,
    shipping_email: formData.emailAddress,
    shipping_address1: formData.addressLine1,
    shipping_address2: formData.addressLine2,
    shipping_city: formData.city,
    shipping_state: formData.state,
    shipping_pincode: formData.pincode,
    shipping_country: formData.country,
    delivery_option: shippingOption,
    // Razorpay orders store a generic online method; QR stores "qr".
    payment_method: paymentMethod === "qr" ? "qr" : "upi",
    ...extra,
  });

  const handleQrScreenshotSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please attach an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot must be under 5MB.");
      return;
    }
    if (qrPreview) URL.revokeObjectURL(qrPreview);
    setQrScreenshot(file);
    setQrPreview(URL.createObjectURL(file));
  };

  const copyUpiId = async () => {
    if (!qrConfig.upi_id) return;
    try {
      await navigator.clipboard.writeText(qrConfig.upi_id);
      toast.success("UPI ID copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  // Persist the typed checkout address into My Profile → My Addresses.
  // Skips saving when the exact same address is already stored, so repeat
  // orders don't create duplicates. Returns true when saved, reused,
  // or when the user opted out.
  const saveTypedAddress = async () => {
    if (!formData.saveAddress) return true;
    const normText = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    const normPhone = (v) => String(v ?? "").replace(/\D/g, "");
    const typed = {
      full_name: normText(formData.fullName),
      phone: normPhone(formData.phoneNumber),
      email: normText(formData.emailAddress),
      address_line1: normText(formData.addressLine1),
      address_line2: normText(formData.addressLine2),
      city: normText(formData.city),
      state: normText(formData.state),
      pincode: normPhone(formData.pincode),
      country: normText(formData.country || "India"),
    };
    const isSame = (addr) =>
      normText(addr.full_name) === typed.full_name &&
      normPhone(addr.phone) === typed.phone &&
      normText(addr.email) === typed.email &&
      normText(addr.address_line1) === typed.address_line1 &&
      normText(addr.address_line2) === typed.address_line2 &&
      normText(addr.city) === typed.city &&
      normText(addr.state) === typed.state &&
      normPhone(addr.pincode) === typed.pincode &&
      normText(addr.country || "India") === typed.country;
    // Refresh first so the check runs against the latest saved list.
    let existing = savedAddresses;
    try {
      const res = await profileService.getAddresses();
      existing = res.data?.addresses || [];
      setSavedAddresses(existing);
    } catch (e) {
      /* fall back to the picker state */
    }
    const match = (existing || []).find(isSame);
    if (match) {
      setSelectedSavedAddressId(String(match.id));
      return true;
    }
    try {
      const res = await profileService.addAddress({
        type: "Home",
        full_name: formData.fullName,
        phone: formData.phoneNumber,
        email: formData.emailAddress || undefined,
        address_line1: formData.addressLine1,
        address_line2: formData.addressLine2 || undefined,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        country: formData.country || "India",
        is_default: false,
      });
      const newId = res.data?.address_id;
      if (newId) setSelectedSavedAddressId(String(newId));
      // Refresh the saved-address picker so the new address appears immediately.
      try {
        const res2 = await profileService.getAddresses();
        setSavedAddresses(res2.data?.addresses || []);
      } catch (e) {
        /* picker refresh is best-effort */
      }
      return true;
    } catch (error) {
      toast.warn(error?.response?.data?.message || "Order placed, but the address could not be saved to your profile.");
      return false;
    }
  };

  const applySavedAddress = (id) => {
    setSelectedSavedAddressId(id);
    if (!id) return;
    const addr = savedAddresses.find((a) => String(a.id) === String(id));
    if (!addr) return;
    setFormData((prev) => ({
      ...prev,
      fullName: addr.full_name || prev.fullName,
      phoneNumber: addr.phone || prev.phoneNumber,
      emailAddress: addr.email || prev.emailAddress,
      pincode: addr.pincode || prev.pincode,
      addressLine1: addr.address_line1 || prev.addressLine1,
      addressLine2: addr.address_line2 || prev.addressLine2,
      city: addr.city || prev.city,
      state: addr.state || prev.state,
      country: addr.country || prev.country,
    }));
    toast.success("Saved address applied");
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!localStorage.getItem("token")) {
      toast.info("Please login before placing your order");
      navigate("/login", { state: { from: "/checkout" } });
      return;
    }

    if (!formData.fullName?.trim() || !formData.phoneNumber?.trim() || !formData.addressLine1?.trim() || !formData.city?.trim() || !formData.pincode?.trim()) {
      toast.warn("Please fill in your name, phone, address, city and pincode.");
      return;
    }
    if (formData.phoneNumber.replace(/\D/g, "").length < 10) {
      toast.warn("Please enter a valid 10-digit phone number.");
      return;
    }
    if (formData.pincode.trim().length !== 6) {
      toast.warn("Please enter a valid 6-digit pincode.");
      return;
    }

    setPlacingOrder(true);
    try {
      // ── Pay-with-QR flow: screenshot is mandatory — the order is placed
      // only after the customer pays and attaches the payment proof. ──
      if (paymentMethod === "qr") {
        if (!qrScreenshot) {
          toast.warn("Please pay using the QR code and attach your payment screenshot.");
          setPlacingOrder(false);
          return;
        }
        let screenshotUrl = "";
        try {
          setQrUploading(true);
          const uploadResponse = await checkoutService.uploadPaymentScreenshot(qrScreenshot);
          screenshotUrl = uploadResponse.data?.screenshot?.url || "";
          if (!screenshotUrl) throw new Error("Upload failed");
        } catch (uploadError) {
          toast.error(uploadError?.response?.data?.message || "Screenshot upload failed. Please try again.");
          return;
        } finally {
          setQrUploading(false);
        }

        let placedOrder;
        try {
          const orderResponse = await checkoutService.placeOrder(
            buildOrderPayload({ payment_screenshot_url: screenshotUrl })
          );
          placedOrder = orderResponse.data.order;
        } catch (orderError) {
          toast.error(orderError?.response?.data?.message || "Order creation failed. No order was placed.");
          return;
        }

        // Stock is now reserved — clear the cart and persist the address.
        localStorage.removeItem("printy_cart");
        notifyCartChange();
        await saveTypedAddress();

        // Order placed + GST invoice emailed (same as COD); the payment is
        // confirmed by the admin after verifying the screenshot.
        setSuccessOrder({
          order_number: placedOrder.order_number,
          total: grandTotal,
          payment_id: null,
          email: formData.emailAddress,
          pendingVerification: true,
        });
        setShowSuccessPopup(true);
        return;
      }

      // Razorpay gateway must be available before we start.
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) {
        toast.error("Payment gateway failed to load. Please check your connection and try again.");
        return;
      }

      // 1️⃣ Create the order FIRST (payment pending). It is visible under
      // My Orders no matter what happens with the gateway afterwards.
      let placedOrder;
      try {
        const orderResponse = await checkoutService.placeOrder(buildOrderPayload());
        placedOrder = orderResponse.data.order;
      } catch (orderError) {
        toast.error(orderError?.response?.data?.message || "Order creation failed. No payment was taken.");
        return;
      }

      // Stock is now reserved — clear the cart and persist the address.
      localStorage.removeItem("printy_cart");
      notifyCartChange();
      await saveTypedAddress();

      // 2️⃣ Create the linked Razorpay order.
      let gateway;
      try {
        const rzResponse = await checkoutService.createRazorpayOrder({
          amount: grandTotal,
          order_id: placedOrder.id,
          order_type: placedOrder.is_print_only ? "print" : "order",
          print_order_ids: placedOrder.print_order_ids || [],
        });
        gateway = rzResponse.data;
      } catch (gatewayError) {
        toast.warn("Order placed! Online payment is temporarily unavailable — complete it from My Orders.");
        navigate(`/orders/${placedOrder.order_number}`);
        return;
      }

      // 3️⃣ Open the Razorpay popup (UPI / cards / netbanking / wallets).
      const paymentResult = await new Promise((resolve) => {
        const rzp = new window.Razorpay({
          key: gateway.key_id,
          amount: gateway.amount,
          currency: gateway.currency || "INR",
          name: "PrintyNozzle",
          description: `Order ${placedOrder.order_number}`,
          order_id: gateway.razorpay_order_id,
          prefill: {
            name: formData.fullName,
            email: formData.emailAddress,
            contact: formData.phoneNumber,
          },
          theme: { color: "#2563eb" },
          handler: (resp) => resolve({ ok: true, resp }),
          modal: { ondismiss: () => resolve({ ok: false }) },
        });
        rzp.on("payment.failed", () => resolve({ ok: false, failed: true }));
        rzp.open();
      });

      if (!paymentResult.ok) {
        if (paymentResult.failed) {
          toast.error("Payment failed. Your order is saved under My Orders — please try again.");
        } else {
          toast.info("Payment window closed. Your order is saved under My Orders.");
        }
        navigate(`/orders/${placedOrder.order_number}`);
        return;
      }

      // 4️⃣ Verify the payment signature with the backend.
      try {
        await checkoutService.verifyPayment({
          razorpay_order_id: paymentResult.resp.razorpay_order_id,
          razorpay_payment_id: paymentResult.resp.razorpay_payment_id,
          razorpay_signature: paymentResult.resp.razorpay_signature,
          order_id: placedOrder.id,
          order_type: placedOrder.is_print_only ? "print" : "order",
          print_order_ids: placedOrder.print_order_ids || [],
        });
      } catch (verifyError) {
        toast.warn("Payment received but verification is pending. Our support team will confirm shortly.");
        navigate(`/orders/${placedOrder.order_number}`);
        return;
      }

      // 5️⃣ Success! Show the payment-success popup (confirmation email
      // is sent by the server). Navigation happens from the popup.
      setSuccessOrder({
        order_number: placedOrder.order_number,
        total: grandTotal,
        payment_id: paymentResult.resp.razorpay_payment_id,
        email: formData.emailAddress,
      });
      setShowSuccessPopup(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Order creation failed");
    } finally {
      setPlacingOrder(false);
    }
  };

  const closeSuccessPopup = (destination) => {
    setShowSuccessPopup(false);
    if (destination === "order" && successOrder?.order_number) {
      navigate(`/orders/${successOrder.order_number}`);
    } else {
      navigate("/products");
    }
  };

// Show an empty-cart state instead of checkout with no items
  if (checkoutItems.length === 0) {
    return (
      <div className="checkout-page-wrapper">
        <div className="checkout-page-container">
          <div className="checkout-header">
            <h1 className="checkout-title">Checkout</h1>
          </div>
          <div className="p-5 text-center">
            <i className="bi bi-cart-x text-warning display-4 d-block mb-3"></i>
            <h2>Your cart is empty</h2>
            <p className="text-muted">Add some products before proceeding to checkout.</p>
            <Link to="/products" className="btn btn-primary px-4 py-2 mt-3">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page-wrapper">
      <div className="checkout-page-container">
        {/* ================= PAYMENT SUCCESS POPUP ================= */}
        {showSuccessPopup && successOrder && (
          <div className="pay-success-backdrop" onClick={() => closeSuccessPopup("order")}>
            <div className="pay-success-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Payment successful">
              <div className="pay-success-icon">
                <CheckCircle2 size={54} strokeWidth={2.2} />
              </div>
              <h2 className="pay-success-title">{successOrder.pendingVerification ? "Order Placed!" : "Payment Successful!"}</h2>
              <p className="pay-success-sub">
                Thank you! Your order <strong>#{successOrder.order_number}</strong> is {successOrder.pendingVerification ? "placed" : "confirmed"}.
                {successOrder.pendingVerification ? (
                  <>
                    <br />Your payment screenshot has been received — our team will verify it and confirm your order shortly.
                  </>
                ) : null}
                {successOrder.email ? (
                  <>
                    <br />A confirmation email{successOrder.pendingVerification ? " with your invoice " : " "}was sent to <strong>{successOrder.email}</strong>.
                  </>
                ) : null}
              </p>
              <div className="pay-success-details">
                <div className="pay-success-row">
                  <span>Order ID</span>
                  <strong>#{successOrder.order_number}</strong>
                </div>
                <div className="pay-success-row">
                  <span>{successOrder.pendingVerification ? "Order Total" : "Amount Paid"}</span>
                  <strong>₹{Number(successOrder.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                {successOrder.payment_id && (
                  <div className="pay-success-row">
                    <span>Payment ID</span>
                    <strong className="pay-success-payid">{successOrder.payment_id}</strong>
                  </div>
                )}
              </div>
              <div className="pay-success-actions">
                <button type="button" className="btn-checkout-primary" onClick={() => closeSuccessPopup("order")}>
                  <span>View My Order</span>
                  <ArrowRight size={18} />
                </button>
                <button type="button" className="btn-continue-shopping" onClick={() => closeSuccessPopup("shop")}>
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ================= HEADER & BREADCRUMB ================= */}
        <div className="checkout-header">
          <h1 className="checkout-title">Checkout</h1>
          <div className="checkout-breadcrumb">
            <Link to="/">Home</Link>
            <span>&gt;</span>
            <span className="checkout-breadcrumb-current">Checkout</span>
          </div>
        </div>

        {/* ================= PROGRESS STEPPER ================= */}
        <div className="checkout-stepper">
          {/* Step 1: Cart */}
          <Link to="/cart" className="step-item completed" style={{ textDecoration: "none" }}>
            <span className="step-circle">
              <Check size={16} strokeWidth={3} />
            </span>
            <span>Cart</span>
          </Link>

          <div className="step-connector active" />

          {/* Step 2: Shipping */}
          <div className="step-item active">
            <span className="step-circle">2</span>
            <span>Shipping</span>
          </div>

          <div className="step-connector" />

          {/* Step 3: Payment */}
          <div className="step-item">
            <span className="step-circle">3</span>
            <span>Payment</span>
          </div>

          <div className="step-connector" />

          {/* Step 4: Review & Place Order */}
          <div className="step-item">
            <span className="step-circle">4</span>
            <span>Review &amp; Place Order</span>
          </div>
        </div>

        {/* ================= MAIN 2-COLUMN LAYOUT ================= */}
        <form onSubmit={handlePlaceOrder}>
          <div className="checkout-layout-grid">
            {/* ================= LEFT COLUMN ================= */}
            <div className="checkout-left-col">
              {/* Card 1: Shipping Information */}
              <div className="checkout-card">
                <div className="checkout-card-header">
                  <h2 className="checkout-card-title">Shipping Information</h2>
                  <p className="checkout-card-sub">Enter your delivery address</p>
                </div>

                {savedAddresses.length > 0 && (
                  <div className="checkout-field-group" style={{ marginBottom: "16px" }}>
                    <label className="checkout-label">
                      <MapPin size={14} />
                      <span>Use a saved address</span>
                    </label>
                    <select
                      className="checkout-select"
                      value={selectedSavedAddressId}
                      onChange={(e) => applySavedAddress(e.target.value)}
                    >
                      <option value="">Type a new address below…</option>
                      {savedAddresses.map((addr) => (
                        <option key={addr.id} value={addr.id}>
                          {addr.full_name} — {addr.address_line1}, {addr.city} {addr.pincode}
                          {addr.is_default ? " (Default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="checkout-form-grid">
                  {/* Full Name */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Full Name</span>
                      <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="Enter your full name"
                      className="checkout-input"
                      required
                    />
                  </div>

                  {/* Phone Number */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Phone Number</span>
                      <span className="required">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      placeholder="Enter 10 digit mobile number"
                      className="checkout-input"
                      required
                    />
                  </div>

                  {/* Email Address */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Email Address</span>
                      <span className="required">*</span>
                    </label>
                    <input
                      type="email"
                      name="emailAddress"
                      value={formData.emailAddress}
                      onChange={handleInputChange}
                      placeholder="Enter your email address"
                      className="checkout-input"
                      required
                    />
                  </div>

                  {/* Pincode with Check Pincode button */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Pincode</span>
                      <span className="required">*</span>
                    </label>
                    <div className="checkout-input-wrapper">
                      <input
                        type="text"
                        name="pincode"
                        value={formData.pincode}
                        onChange={handleInputChange}
                        placeholder="Enter pincode"
                        className="checkout-input"
                        maxLength={6}
                        required
                      />
                      <button
                        type="button"
                        className="btn-check-pincode"
                        onClick={handleCheckPincode}
                      >
                        Check Pincode
                      </button>
                    </div>
                  </div>

                  {/* Address Line 1 */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Address Line 1</span>
                      <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="addressLine1"
                      value={formData.addressLine1}
                      onChange={handleInputChange}
                      placeholder="House no., Building, Street"
                      className="checkout-input"
                      required
                    />
                  </div>

                  {/* Address Line 2 (Optional) */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>Address Line 2 (Optional)</span>
                    </label>
                    <input
                      type="text"
                      name="addressLine2"
                      value={formData.addressLine2}
                      onChange={handleInputChange}
                      placeholder="Apartment, Landmark, Area"
                      className="checkout-input"
                    />
                  </div>

                  {/* City */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>City</span>
                      <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Enter city"
                      className="checkout-input"
                      required
                    />
                  </div>

                  {/* State */}
                  <div className="checkout-field-group">
                    <label className="checkout-label">
                      <span>State</span>
                      <span className="required">*</span>
                    </label>
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="checkout-select"
                      required
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Country */}
                  <div className="checkout-field-group form-group-full">
                    <label className="checkout-label">
                      <span>Country</span>
                      <span className="required">*</span>
                    </label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="checkout-select"
                    >
                      <option value="India">India</option>
                    </select>
                  </div>

                  {/* Save address checkbox */}
                  <div className="checkout-checkbox-row">
                    <input
                      type="checkbox"
                      id="saveAddress"
                      name="saveAddress"
                      checked={formData.saveAddress}
                      onChange={handleInputChange}
                      className="checkout-checkbox"
                    />
                    <label htmlFor="saveAddress" className="checkout-checkbox-label">
                      Save this address for faster checkout next time
                    </label>
                  </div>
                </div>
              </div>

              {/* Card 2: Shipping Options */}
              <div className="checkout-card">
                <div className="checkout-card-header">
                  <h2 className="checkout-card-title">Shipping Options</h2>
                  <p className="checkout-card-sub">Choose a delivery option</p>
                </div>

                <div className="shipping-options-list">
                  {/* Option 1: Standard Delivery */}
                  <div
                    className={`shipping-option-item ${shippingOption === "standard" ? "selected" : ""}`}
                    onClick={() => setShippingOption("standard")}
                  >
                    <div className="shipping-opt-left">
                      <div className="shipping-radio-dot">
                        <div className="shipping-radio-inner" />
                      </div>
                      <div className="shipping-opt-icon">
                        <Truck size={20} />
                      </div>
                      <div className="shipping-opt-info">
                        <span className="shipping-opt-title">{storeConfig.shippingOptions?.standard?.label || "Standard Delivery"}</span>
                        <span className="shipping-opt-time">{storeConfig.shippingOptions?.standard?.eta || "3-5 Working Days"}</span>
                      </div>
                    </div>
                    <div className="shipping-opt-price-group">
                      {liveRateActive && shippingOption === "standard" ? (
                        <>
                          <span className="shipping-opt-price">₹{liveQuote.amount}</span>
                          <div className="shipping-opt-threshold">Live Delhivery rate</div>
                        </>
                      ) : Number(storeConfig.shippingOptions?.standard?.cost || 0) === 0 ? (
                        <>
                          <span className="shipping-opt-price free">FREE</span>
                          <div className="shipping-opt-threshold">on orders above ₹{storeConfig.freeShippingThreshold}</div>
                        </>
                      ) : (
                        <span className="shipping-opt-price">₹{storeConfig.shippingOptions.standard.cost}</span>
                      )}
                    </div>
                  </div>

                  {/* Option 2: Express Delivery */}
                  <div
                    className={`shipping-option-item ${shippingOption === "express" ? "selected" : ""}`}
                    onClick={() => setShippingOption("express")}
                  >
                    <div className="shipping-opt-left">
                      <div className="shipping-radio-dot">
                        <div className="shipping-radio-inner" />
                      </div>
                      <div className="shipping-opt-icon">
                        <Zap size={20} />
                      </div>
                      <div className="shipping-opt-info">
                        <span className="shipping-opt-title">{storeConfig.shippingOptions?.express?.label || "Express Delivery"}</span>
                        <span className="shipping-opt-time">{storeConfig.shippingOptions?.express?.eta || "1-2 Working Days"}</span>
                      </div>
                    </div>
                    <div className="shipping-opt-price-group">
                      <span className="shipping-opt-price">
                        ₹{liveRateActive && shippingOption === "express" ? liveQuote.amount : (storeConfig.shippingOptions?.express?.cost ?? 99)}
                      </span>
                      {liveRateActive && shippingOption === "express" && (
                        <div className="shipping-opt-threshold">Live Delhivery rate</div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Dispatch notice */}
                <div className="shipping-dispatch-notice">
                  <Info size={16} />
                  <span>Orders placed before 2:00 PM are dispatched the same day</span>
                </div>
              </div>

              {/* Card 3: Payment Method */}
              <div className="checkout-card">
                <div className="checkout-card-header">
                  <h2 className="checkout-card-title">Payment Method</h2>
                  <p className="checkout-card-sub">Choose how you want to pay</p>
                </div>

                <div className="shipping-options-list">
                  {/* Option 1: Razorpay */}
                  <div
                    className={`shipping-option-item ${paymentMethod === "razorpay" ? "selected" : ""}`}
                    onClick={() => setPaymentMethod("razorpay")}
                  >
                    <div className="shipping-opt-left">
                      <div className="shipping-radio-dot">
                        <div className="shipping-radio-inner" />
                      </div>
                      <div className="shipping-opt-icon">
                        <Lock size={20} />
                      </div>
                      <div className="shipping-opt-info">
                        <span className="shipping-opt-title">Online Payment</span>
                        <span className="shipping-opt-time">UPI, cards, net banking &amp; wallets via Razorpay</span>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Pay with QR */}
                  <div
                    className={`shipping-option-item ${paymentMethod === "qr" ? "selected" : ""}`}
                    onClick={() => setPaymentMethod("qr")}
                  >
                    <div className="shipping-opt-left">
                      <div className="shipping-radio-dot">
                        <div className="shipping-radio-inner" />
                      </div>
                      <div className="shipping-opt-icon">
                        <Tag size={20} />
                      </div>
                      <div className="shipping-opt-info">
                        <span className="shipping-opt-title">Pay with QR</span>
                        <span className="shipping-opt-time">Scan, pay &amp; attach payment screenshot</span>
                      </div>
                    </div>
                  </div>
                </div>

                {paymentMethod === "razorpay" && (
                  <div className="razorpay-only-box" style={{ marginTop: "14px" }}>
                    <div className="razorpay-only-badge">
                      <Lock size={18} />
                      <div>
                        <span className="razorpay-only-title">Razorpay Secure Checkout</span>
                        <span className="razorpay-only-sub">
                          Pay with UPI, credit / debit cards, net banking or wallets — all inside Razorpay's protected popup. No card details are ever stored on our servers.
                        </span>
                      </div>
                    </div>
                    <div className="razorpay-only-note">
                      <ShieldCheck size={15} />
                      <span>256-bit SSL encrypted • PCI-DSS compliant • Instant email confirmation after payment</span>
                    </div>
                  </div>
                )}

                {paymentMethod === "qr" && (
                  <div className="qr-pay-box">
                    <div className="qr-pay-steps">Step 1 — Scan the QR and pay ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="qr-pay-qr-wrap">
                      {upiPayUrl ? (
                        <div className="qr-pay-dynamic">
                          <QRCodeSVG
                            value={upiPayUrl}
                            size={220}
                            level="M"
                            className="qr-pay-img"
                          />
                          <span className="qr-pay-amount-note">
                            Scan with any UPI app — ₹{Number(grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} comes pre-filled
                          </span>
                        </div>
                      ) : !qrImgError ? (
                        <img
                          src={qrImgSrc}
                          alt="Payment QR code"
                          className="qr-pay-img"
                          onError={() => setQrImgError(true)}
                        />
                      ) : (
                        <div className="qr-pay-noimg">
                          <span>QR code will appear here once the store adds it.</span>
                          {qrConfig.upi_id && <strong>Pay to UPI ID below</strong>}
                        </div>
                      )}
                    </div>
                    {(qrConfig.upi_id || qrConfig.payee_name) && (
                      <div className="qr-pay-upi-row">
                        <div className="qr-pay-upi-meta">
                          <span className="qr-pay-payee">{qrConfig.payee_name || "Printynozzle"}</span>
                          {qrConfig.upi_id && <span className="upi-id-badge">UPI ID: {qrConfig.upi_id}</span>}
                        </div>
                        {qrConfig.upi_id && (
                          <button type="button" className="btn-check-pincode" onClick={copyUpiId}>
                            Copy ID
                          </button>
                        )}
                      </div>
                    )}
                    <div className="qr-pay-steps">Step 2 — Attach your payment screenshot below, then place the order</div>
                    <label className="qr-pay-upload">
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleQrScreenshotSelect(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                      <span className="qr-pay-upload-btn">Choose Screenshot</span>
                      <span className="qr-pay-upload-hint">JPG, PNG or WebP • Max 5MB</span>
                    </label>
                    {qrPreview && (
                      <div className="qr-pay-preview-row">
                        <img src={qrPreview} alt="Payment screenshot preview" className="qr-pay-preview" />
                        <button
                          type="button"
                          className="cart-coupon-remove"
                          onClick={() => {
                            if (qrPreview) URL.revokeObjectURL(qrPreview);
                            setQrPreview("");
                            setQrScreenshot(null);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div className="razorpay-only-note">
                      <ShieldCheck size={15} />
                      <span>Your order is placed only after the screenshot is attached. Our team verifies the payment and confirms your order.</span>
                    </div>
                  </div>
                )}
              </div>
                    {/* Razorpay-only checkout — legacy method panels disabled */ false && (
                      <div>
                        <div className="upi-section-title">Pay using UPI</div>
                        <div className="upi-apps-row">
                          <div className="upi-app-badge">GPay</div>
                          <div className="upi-app-badge">PhonePe</div>
                          <div className="upi-app-badge">Paytm</div>
                          <div className="upi-app-badge">BHIM</div>
                          <div className="upi-app-badge">CRED</div>
                        </div>

                        <div className="upi-scan-title">Or scan &amp; pay</div>
                        <div className="upi-qr-box">
                          {/* Clean SVG QR code representation */}
                          <svg
                            className="upi-qr-img"
                            viewBox="0 0 100 100"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect width="100" height="100" fill="white" />
                            {/* Corner 1 */}
                            <rect x="10" y="10" width="24" height="24" rx="2" fill="#0f172a" />
                            <rect x="14" y="14" width="16" height="16" fill="white" />
                            <rect x="18" y="18" width="8" height="8" fill="#0f172a" />
                            {/* Corner 2 */}
                            <rect x="66" y="10" width="24" height="24" rx="2" fill="#0f172a" />
                            <rect x="70" y="14" width="16" height="16" fill="white" />
                            <rect x="74" y="18" width="8" height="8" fill="#0f172a" />
                            {/* Corner 3 */}
                            <rect x="10" y="66" width="24" height="24" rx="2" fill="#0f172a" />
                            <rect x="14" y="70" width="16" height="16" fill="white" />
                            <rect x="18" y="74" width="8" height="8" fill="#0f172a" />
                            {/* Random clean matrix dots */}
                            <rect x="42" y="12" width="6" height="6" fill="#0f172a" />
                            <rect x="52" y="18" width="6" height="6" fill="#0f172a" />
                            <rect x="42" y="28" width="6" height="6" fill="#0f172a" />
                            <rect x="12" y="44" width="6" height="6" fill="#0f172a" />
                            <rect x="24" y="44" width="6" height="6" fill="#0f172a" />
                            <rect x="36" y="44" width="14" height="6" fill="#0f172a" />
                            <rect x="56" y="44" width="6" height="12" fill="#0f172a" />
                            <rect x="72" y="44" width="16" height="6" fill="#0f172a" />
                            <rect x="44" y="60" width="8" height="8" fill="#0f172a" />
                            <rect x="60" y="66" width="12" height="6" fill="#0f172a" />
                            <rect x="78" y="72" width="10" height="10" fill="#0f172a" />
                            <rect x="44" y="80" width="14" height="6" fill="#0f172a" />
                          </svg>
                          <span className="upi-id-badge">UPI ID: printynozzle@upi</span>
                        </div>
                      </div>
                    )}

                    {false && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div className="checkout-field-group">
                          <label className="checkout-label">Card Number</label>
                          <input type="text" placeholder="1234 5678 9012 3456" className="checkout-input" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div className="checkout-field-group">
                            <label className="checkout-label">Expiry Date</label>
                            <input type="text" placeholder="MM/YY" className="checkout-input" />
                          </div>
                          <div className="checkout-field-group">
                            <label className="checkout-label">CVV</label>
                            <input type="password" placeholder="123" maxLength={4} className="checkout-input" />
                          </div>
                        </div>
                        <div className="checkout-field-group">
                          <label className="checkout-label">Cardholder Name</label>
                          <input type="text" placeholder="Name on card" className="checkout-input" />
                        </div>
                      </div>
                    )}

                    {false && (
                      <div>
                        <div className="upi-section-title">Select Popular Banks</div>
                        <div className="upi-apps-row">
                          <div className="upi-app-badge">HDFC Bank</div>
                          <div className="upi-app-badge">State Bank of India</div>
                          <div className="upi-app-badge">ICICI Bank</div>
                          <div className="upi-app-badge">Axis Bank</div>
                        </div>
                        <div className="checkout-field-group" style={{ marginTop: "14px" }}>
                          <label className="checkout-label">Other Banks</label>
                          <select className="checkout-select">
                            <option>Select another bank</option>
                            <option>Kotak Mahindra Bank</option>
                            <option>Punjab National Bank</option>
                            <option>Bank of Baroda</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {false && (
                      <div>
                        <div className="upi-section-title">Select Wallet</div>
                        <div className="upi-apps-row">
                          <div className="upi-app-badge">Amazon Pay</div>
                          <div className="upi-app-badge">PhonePe Wallet</div>
                          <div className="upi-app-badge">Paytm Wallet</div>
                          <div className="upi-app-badge">MobiKwik</div>
                        </div>
                      </div>
                    )}

                    {false && (
                      <div>
                        <div className="upi-section-title">Cash on Delivery</div>
                        <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                          Cash on Delivery is no longer offered. All payments go through Razorpay.
                        </p>
                      </div>
                    )}

              {/* Back to Cart link */}
              <div>
                <Link to="/cart" className="checkout-back-link">
                  <ArrowLeft size={16} />
                  <span>Back to Cart</span>
                </Link>
              </div>
            </div>

            {/* ================= RIGHT COLUMN ================= */}
            <div className="checkout-right-col">
              {/* Card 1: Order Summary */}
              <div className="checkout-card">
                <div className="summary-top-row">
                  <h2 className="checkout-card-title" style={{ margin: 0 }}>
                    Order Summary
                  </h2>
                  <Link to="/cart" className="summary-edit-cart-link">
                    Edit Cart
                  </Link>
                </div>

                <div className="summary-items-count">
                  {checkoutItems.length} items
                </div>

                {/* Products List */}
                <div className="summary-products-list">
                  {checkoutItems.map((item) => (
                    <div key={item.id} className="summary-product-item">
                      <div className="summary-item-left">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="summary-item-thumb"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = item.isCustomPrint ? "/images/rocket.png" : "/images/products/01.png";
                          }}
                        />
                        <div className="summary-item-meta">
                          <span className="summary-item-title">{item.name}</span>
                          <span className="summary-item-qty">
                            {item.subtitle ? `${item.subtitle} • ` : ""}Qty: {item.quantity}
                          </span>
                        </div>
                      </div>
                      <div className="summary-item-price">
                        ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Financials */}
                <div className="summary-financial-rows">
                  <div className="summary-fin-row">
                    <span className="summary-fin-label">Subtotal</span>
                    <span className="summary-fin-val">₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="summary-fin-row">
                    <span className="summary-fin-label">Shipping{liveRateActive ? " (Live rate)" : ""}</span>
                    <span className={`summary-fin-val ${shippingFee === 0 ? "free" : ""}`}>
                      {shippingFee === 0 ? "FREE" : `₹${shippingFee}`}
                    </span>
                  </div>

                  <div className="summary-fin-row">
                    <span className="summary-fin-label">
                      <span>Discount</span>
                      <Tag size={13} color="#2563eb" />
                    </span>
                    <span className="summary-fin-val">-₹{discount.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="summary-fin-row">
                    <span className="summary-fin-label">Tax ({Number(storeConfig.gstRate || 18)}% GST)</span>
                    <span className="summary-fin-val">₹{gstTax.toFixed(2)}</span>
                  </div>

                  <div className="summary-fin-divider" />

                  <div className="summary-total-group">
                    <div>
                      <div className="summary-total-heading">Total Amount</div>
                      <div className="summary-total-sub">(Incl. of all taxes)</div>
                    </div>
                    <div className="summary-total-val">
                      ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Have a coupon code? */}
              <div className="checkout-card">
                <div className="checkout-card-header" style={{ marginBottom: "12px" }}>
                  <h3 className="checkout-card-title" style={{ fontSize: "15px" }}>
                    Have a coupon code?
                  </h3>
                </div>
                {appliedCouponCode ? (
                  <div className="coupon-applied-row">
                    <span className="cart-coupon-chip">{appliedCouponCode}</span>
                    <button
                      type="button"
                      className="cart-coupon-remove"
                      onClick={handleRemoveCoupon}
                      disabled={couponBusy}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="coupon-input-group">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="Enter coupon code"
                      className="checkout-input"
                      disabled={couponBusy}
                    />
                    <button
                      type="button"
                      className="btn-apply-coupon"
                      onClick={handleApplyCoupon}
                      disabled={couponBusy}
                    >
                      {couponBusy ? "..." : "Apply"}
                    </button>
                  </div>
                )}
              </div>

              {/* Card 3: Secure Checkout */}
              <div className="checkout-card">
                <div className="secure-card-content">
                  <div className="secure-card-header">
                    <div className="secure-icon-circle">
                      <Lock size={18} />
                    </div>
                    <div className="secure-header-texts">
                      <span className="secure-title">Secure Checkout</span>
                      <span className="secure-desc">
                        Your data is protected with 256-bit SSL encryption.
                      </span>
                    </div>
                  </div>
                  <div className="secure-badges-row">
                    <span className="card-brand-tag">Verified by VISA</span>
                    <span className="card-brand-tag">Mastercard</span>
                    <span className="card-brand-tag">UPI</span>
                    <span className="card-brand-tag">RuPay</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Why Shop With Printynozzle? */}
              <div className="checkout-card">
                <h3 className="why-shop-title">Why Shop With PrintyNozzle?</h3>
                <div className="why-shop-perks">
                  <div className="why-perk-item">
                    <div className="why-perk-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div className="why-perk-texts">
                      <span className="why-perk-name">Original Products</span>
                      <span className="why-perk-desc">100% authentic and brand new</span>
                    </div>
                  </div>

                  <div className="why-perk-item">
                    <div className="why-perk-icon">
                      <RotateCcw size={18} />
                    </div>
                    <div className="why-perk-texts">
                      <span className="why-perk-name">7 Days Easy Returns</span>
                      <span className="why-perk-desc">Hassle-free return policy</span>
                    </div>
                  </div>

                  <div className="why-perk-item">
                    <div className="why-perk-icon">
                      <Truck size={18} />
                    </div>
                    <div className="why-perk-texts">
                      <span className="why-perk-name">Fast &amp; Safe Delivery</span>
                      <span className="why-perk-desc">Quick delivery across India</span>
                    </div>
                  </div>

                  <div className="why-perk-item">
                    <div className="why-perk-icon">
                      <Headphones size={18} />
                    </div>
                    <div className="why-perk-texts">
                      <span className="why-perk-name">Dedicated Support</span>
                      <span className="why-perk-desc">We're here to help you</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Place order — Razorpay popup or QR + screenshot */}
              <button type="submit" className="btn-checkout-primary" disabled={placingOrder || qrUploading}>
                <Lock size={16} />
                <span>
                  {placingOrder || qrUploading
                    ? "Processing..."
                    : paymentMethod === "qr"
                      ? `Place Order • ₹${grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `Pay ₹${grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Securely`}
                </span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </form>

        {/* ================= BOTTOM FULL-WIDTH TRUST BADGES ================= */}
        <div className="checkout-trust-bar">
          <div className="checkout-trust-item">
            <div className="checkout-trust-icon-box">
              <Truck size={22} />
            </div>
            <div className="checkout-trust-info">
              <span className="checkout-trust-heading">Free Shipping</span>
              <span className="checkout-trust-sub">On orders over ₹{storeConfig.freeShippingThreshold}</span>
            </div>
          </div>

          <div className="checkout-trust-item">
            <div className="checkout-trust-icon-box">
              <RotateCcw size={22} />
            </div>
            <div className="checkout-trust-info">
              <span className="checkout-trust-heading">7 Days Returns</span>
              <span className="checkout-trust-sub">Easy return policy</span>
            </div>
          </div>

          <div className="checkout-trust-item">
            <div className="checkout-trust-icon-box">
              <Lock size={22} />
            </div>
            <div className="checkout-trust-info">
              <span className="checkout-trust-heading">Secure Payments</span>
              <span className="checkout-trust-sub">100% safe &amp; secure</span>
            </div>
          </div>

          <div className="checkout-trust-item">
            <div className="checkout-trust-icon-box">
              <Headphones size={22} />
            </div>
            <div className="checkout-trust-info">
              <span className="checkout-trust-heading">24/7 Support</span>
              <span className="checkout-trust-sub">We're here to help</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
