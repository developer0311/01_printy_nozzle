import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  UploadCloud,
  Trash2,
  Plus,
  Minus,
  Truck,
  ShieldCheck,
  Headphones,
  Box,
  Layers,
  HelpCircle,
  Check,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Info,
  X,
  AlertTriangle,
} from "lucide-react";
import defaultPricingData from "../data/materialPrices.json";
import ModelViewer3D from "../components/ModelViewer3D";
import printingService from "../services/printing.service";
import catalogService from "../services/catalog.service";
import cartService from "../services/cart.service";
import { syncCartBadge } from "../utils/cartSync";
import "../../public/css/printing.css";

// Maximum Printable Dimensions from .env (-1 means no limit)
const MAX_PRINT_WIDTH_MM = parseFloat(import.meta.env.VITE_MAX_PRINT_WIDTH_MM ?? 250);
const MAX_PRINT_DEPTH_MM = parseFloat(import.meta.env.VITE_MAX_PRINT_DEPTH_MM ?? 250);
const MAX_PRINT_HEIGHT_MM = parseFloat(import.meta.env.VITE_MAX_PRINT_HEIGHT_MM ?? 250);

// Maximum File Size in MB from .env (-1 means no limit)
const MAX_FILE_SIZE_MB = parseFloat(import.meta.env.VITE_MAX_FILE_SIZE_MB ?? 100);

export default function Printing() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const optionsSectionRef = useRef(null);

  /* =========================================================
     PRICING CONFIGURATION (DB settings with JSON fallback)
     ========================================================= */
  const [serverMaterials, setServerMaterials] = useState(null);
  const [serverColors, setServerColors] = useState(null);
  const [serverSiteSettings, setServerSiteSettings] = useState(null);
  const [serverTimeRates, setServerTimeRates] = useState(null);
  const [serverSlabsRaw, setServerSlabsRaw] = useState(null);
  const [serverHoursPerGram, setServerHoursPerGram] = useState(null);
  const defaultPricingConfig = defaultPricingData;
  const parseSlabs = (raw) => {
    let arr = raw;
    if (typeof arr === "string") {
      try {
        arr = JSON.parse(arr);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const clean = [];
    for (const s of arr) {
      const min = Number(s.min);
      const max = s.max === null || s.max === undefined || s.max === "" ? null : Number(s.max);
      const rate = Number(s.rate);
      if (!Number.isFinite(min) || min < 0 || !Number.isFinite(rate) || rate < 0) return null;
      if (max !== null && (!Number.isFinite(max) || max <= min)) return null;
      clean.push({ min, max, rate });
    }
    clean.sort((a, b) => a.min - b.min);
    return clean;
  };
  const defaultSlabs = parseSlabs(defaultPricingConfig?.timeSlabs) || [
    { min: 0, max: 5, rate: 50 },
    { min: 5, max: 10, rate: 45 },
    { min: 10, max: 20, rate: 40 },
    { min: 20, max: null, rate: 35 },
  ];
  // Hourly slabs: admin Hourly Rates tab (JSON) wins, legacy 4 keys are fallback.
  const slabs = useMemo(() => {
    if (serverSlabsRaw) return serverSlabsRaw;
    if (serverTimeRates && [serverTimeRates.rate_0_5, serverTimeRates.rate_5_10, serverTimeRates.rate_10_20, serverTimeRates.rate_20_plus].every((v) => v !== undefined && v !== null && v !== "")) {
      return [
        { min: 0, max: 5, rate: Number(serverTimeRates.rate_0_5) },
        { min: 5, max: 10, rate: Number(serverTimeRates.rate_5_10) },
        { min: 10, max: 20, rate: Number(serverTimeRates.rate_10_20) },
        { min: 20, max: null, rate: Number(serverTimeRates.rate_20_plus) },
      ];
    }
    return defaultSlabs;
  }, [serverSlabsRaw, serverTimeRates]);
  const slabLabelFor = (slab) => (slab.max === null ? `${slab.min}+ hours` : `${slab.min}–${slab.max} hours`);
  const timeRates = {
    rate_0_5: Number(serverTimeRates?.rate_0_5 ?? defaultPricingConfig?.siteSettings?.timeRates?.rate_0_5 ?? 50),
    rate_5_10: Number(serverTimeRates?.rate_5_10 ?? defaultPricingConfig?.siteSettings?.timeRates?.rate_5_10 ?? 45),
    rate_10_20: Number(serverTimeRates?.rate_10_20 ?? defaultPricingConfig?.siteSettings?.timeRates?.rate_10_20 ?? 40),
    rate_20_plus: Number(serverTimeRates?.rate_20_plus ?? defaultPricingConfig?.siteSettings?.timeRates?.rate_20_plus ?? 35),
  };
  const hoursPerGram = Number(serverHoursPerGram ?? defaultPricingConfig?.siteSettings?.hoursPerGram ?? 0.15) || 0.15;
  const pricingConfig = {
    ...defaultPricingConfig,
    siteSettings: {
      ...defaultPricingConfig.siteSettings,
      ...(serverSiteSettings || {}),
      gstRate: serverSiteSettings?.gstRate ?? defaultPricingConfig.siteSettings?.gstRate ?? 0.18,
      estimatedDeliveryDays:
        serverSiteSettings?.estimatedDeliveryDays ??
        defaultPricingConfig.siteSettings?.estimatedDeliveryDays ??
        "3 – 5 Working Days",
      deliveryRegion:
        serverSiteSettings?.deliveryRegion ??
        defaultPricingConfig.siteSettings?.deliveryRegion ??
        "Across India",
    },
    surfaceFinishes: (defaultPricingConfig.surfaceFinishes || []).map((finish) =>
      finish.id === "smooth"
        ? {
            ...finish,
            pricePerGram:
              serverSiteSettings?.smoothFinishPerGram !== undefined
                ? serverSiteSettings.smoothFinishPerGram
                : finish.pricePerGram,
            tag: `+ ₹${serverSiteSettings?.smoothFinishPerGram ?? finish.pricePerGram} / gram`,
          }
        : finish
    ),
  };
  const [isInfillModalOpen, setIsInfillModalOpen] = useState(false);

  /* =========================================================
     3D MODEL STATE
     ========================================================= */
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [useSample, setUseSample] = useState(true);
  const [modelAnalysis, setModelAnalysis] = useState({
    fileName: "rocket.stl",
    fileSizeMB: 2.45,
    dimensions: { x: 80, y: 80, z: 150 },
    volumeCm3: 16.1,
    weightGrams: 20,
  });

  const handleModelAnalysis = useCallback((stats) => {
    setModelAnalysis(stats);
  }, []);

  // Validation: Check if model dimensions exceed printable limits (-1 = no limit)
  const isWidthExceeded =
    MAX_PRINT_WIDTH_MM !== -1 &&
    !isNaN(MAX_PRINT_WIDTH_MM) &&
    (modelAnalysis?.dimensions?.x || 0) > MAX_PRINT_WIDTH_MM;

  const isDepthExceeded =
    MAX_PRINT_DEPTH_MM !== -1 &&
    !isNaN(MAX_PRINT_DEPTH_MM) &&
    (modelAnalysis?.dimensions?.y || 0) > MAX_PRINT_DEPTH_MM;

  const isHeightExceeded =
    MAX_PRINT_HEIGHT_MM !== -1 &&
    !isNaN(MAX_PRINT_HEIGHT_MM) &&
    (modelAnalysis?.dimensions?.z || 0) > MAX_PRINT_HEIGHT_MM;

  const isOversized = isWidthExceeded || isDepthExceeded || isHeightExceeded;

  /* =========================================================
     PRINT OPTIONS STATE
     ========================================================= */
  const materials = serverMaterials !== null ? serverMaterials : (pricingConfig.materials || []);
  const colors = serverColors !== null ? serverColors : (pricingConfig.colors || []);
  const infillOptions = pricingConfig.infillOptions || defaultPricingData.infillOptions;
  const surfaceFinishes = pricingConfig.surfaceFinishes || defaultPricingData.surfaceFinishes;

  const [selectedMaterialId, setSelectedMaterialId] = useState(materials[0]?.id || "pla");
  const [selectedColorHex, setSelectedColorHex] = useState("#1E88E5");
  const [customHexInput, setCustomHexInput] = useState("");
  const [selectedInfillId, setSelectedInfillId] = useState("50");
  const [selectedFinishId, setSelectedFinishId] = useState("standard");
  const [quantity, setQuantity] = useState(1);
  const [placingPrintOrder, setPlacingPrintOrder] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPrintingOptions = async () => {
      try {
        const [materialsResponse, colorsResponse, configResponse] = await Promise.all([
          printingService.getMaterials(),
          printingService.getColors(),
          catalogService.getPrintingConfig(),
        ]);

        if (!active) return;

        const serverConfig = configResponse.data.settings || {};
        setServerSiteSettings({
          gstRate: serverConfig.gst_rate !== undefined ? Number(serverConfig.gst_rate) / 100 : undefined,
          smoothFinishPerGram: serverConfig.smooth_finish_per_gram !== undefined ? Number(serverConfig.smooth_finish_per_gram) : undefined,
          freeShippingThreshold: serverConfig.free_shipping_threshold !== undefined ? Number(serverConfig.free_shipping_threshold) : undefined,
          estimatedDeliveryDays: serverConfig.printing_delivery_days || undefined,
          deliveryRegion: serverConfig.printing_delivery_region || undefined,
        });
        setServerHoursPerGram(
          serverConfig.print_hours_per_gram !== undefined && serverConfig.print_hours_per_gram !== null && serverConfig.print_hours_per_gram !== ""
            ? Number(serverConfig.print_hours_per_gram)
            : null
        );
        setServerTimeRates({
          rate_0_5: serverConfig.print_rate_0_5 !== undefined ? Number(serverConfig.print_rate_0_5) : undefined,
          rate_5_10: serverConfig.print_rate_5_10 !== undefined ? Number(serverConfig.print_rate_5_10) : undefined,
          rate_10_20: serverConfig.print_rate_10_20 !== undefined ? Number(serverConfig.print_rate_10_20) : undefined,
          rate_20_plus: serverConfig.print_rate_20_plus !== undefined ? Number(serverConfig.print_rate_20_plus) : undefined,
        });
        setServerSlabsRaw(parseSlabs(serverConfig.print_time_slabs) || null);

        const mappedMaterials = (materialsResponse.data.materials || []).map((material) => ({
          id: material.id,
          slug: material.slug,
          name: material.name,
          description: material.description,
          pricePerGram: Number(material.price_per_gram || 0),
          density: Number(material.density_g_cm3 || 1.24),
          bestFor: material.best_for,
          image: "/images/products/blue_filament.png",
        }));

        const mappedColors = (colorsResponse.data.colors || []).map((color) => ({
          id: color.id,
          name: color.name,
          hex: color.hex_code,
          priceAdjustment: Number(color.price_adjustment || 0),
        }));

        setServerMaterials(mappedMaterials);
        if (mappedMaterials.length > 0) {
          setSelectedMaterialId(mappedMaterials[0].id);
        }

        setServerColors(mappedColors);
        if (mappedColors.length > 0) {
          setSelectedColorHex(mappedColors[0].hex);
        }
      } catch (error) {
        setServerMaterials([]);
        setServerColors([]);
      }
    };

    loadPrintingOptions();

    return () => {
      active = false;
    };
  }, []);

  // Selected option objects
  const selectedMaterial = useMemo(() => {
    return materials.find((m) => m.id === selectedMaterialId) || materials[0];
  }, [materials, selectedMaterialId]);

  const selectedColor = useMemo(() => {
    const matched = colors.find((c) => c.hex.toLowerCase() === selectedColorHex.toLowerCase());
    if (matched) return matched;
    return { id: "custom", name: "Custom", hex: selectedColorHex, priceAdjustment: 0 };
  }, [colors, selectedColorHex]);

  const selectedInfill = useMemo(() => {
    return infillOptions.find((inf) => inf.id === selectedInfillId) || infillOptions[3];
  }, [infillOptions, selectedInfillId]);

  const selectedFinish = useMemo(() => {
    return surfaceFinishes.find((f) => f.id === selectedFinishId) || surfaceFinishes[0];
  }, [surfaceFinishes, selectedFinishId]);

  // Infill multipliers mirror the server price calculator so the on-screen
  // quote matches what is actually charged (server scales base weight).
  const INFILL_MULTIPLIERS = { 10: 0.4, 20: 0.55, 30: 0.7, 50: 1.0, 100: 1.5 };

  const getTimeSlabForHours = (hours) => {
    const h = Number(hours || 0);
    const match =
      slabs.find((s) => h > s.min && (s.max === null || h <= s.max)) ||
      slabs[slabs.length - 1] ||
      slabs[0];
    return { label: slabLabelFor(match), rate: match.rate };
  };

  const getBaseWeight = () =>
    Math.max(2, Math.round(modelAnalysis?.fileName?.includes("rocket") && useSample ? 20 : modelAnalysis?.weightGrams || 20));

  const getInfillMultiplier = (inf) => {
    const key = Number(inf?.id);
    if (INFILL_MULTIPLIERS[key] !== undefined) return INFILL_MULTIPLIERS[key];
    return inf?.factor || 1.0;
  };

  const quoteForWeight = (effectiveWeight) => {
    const materialCost = Math.round(effectiveWeight * (selectedMaterial?.pricePerGram || 4.5));
    const printTimeHours = Math.round(effectiveWeight * hoursPerGram * 100) / 100;
    const slab = getTimeSlabForHours(printTimeHours);
    const timeCost = Math.round(printTimeHours * (slab.rate || 0) * 100) / 100;
    const finishCost = Math.round(effectiveWeight * (selectedFinish?.pricePerGram || 0));
    return { materialCost, printTimeHours, slab, timeCost, finishCost };
  };

  const getInfillCardPrice = (inf) => {
    const baseWeight = getBaseWeight();
    const weight = Math.max(2, Math.round(baseWeight * getInfillMultiplier(inf)));
    const { materialCost, timeCost, finishCost } = quoteForWeight(weight);
    return materialCost + timeCost + finishCost + (inf.priceAdjustment || 0);
  };

  /* =========================================================
     LIVE PRICE CALCULATION ENGINE — Final = Material + Time
     Weight auto-derives from STL volume × material density × infill.
     Time auto-derives from effective weight × hours-per-gram.
     ========================================================= */
  const calculations = useMemo(() => {
    const rawBase = modelAnalysis?.fileName?.includes("rocket") && useSample ? 20 : (modelAnalysis?.weightGrams || 20);
    const safeBase = Math.max(2, Math.round(rawBase));
    const key = Number(selectedInfill?.id);
    const multiplier = INFILL_MULTIPLIERS[key] !== undefined ? INFILL_MULTIPLIERS[key] : selectedInfill?.factor || 1.0;
    const weight = Math.max(2, Math.round(safeBase * multiplier));

    // Material charge = weight × selling rate (₹/g)
    const materialCost = Math.round(weight * (selectedMaterial?.pricePerGram || 4.5));

    // Estimated print time from file + material (weight already embeds both)
    const printTimeHours = Math.round(weight * hoursPerGram * 100) / 100;
    const slab = getTimeSlabForHours(printTimeHours);
    const timeRate = slab.rate || 0;

    // Printing-time charge = time × slab rate
    const timeCost = Math.round(printTimeHours * timeRate * 100) / 100;

    // Color adjustment (usually 0)
    const colorCost = selectedColor?.priceAdjustment || 0;

    // Infill price adjustment (from JSON or admin settings)
    const infillCost = selectedInfill?.priceAdjustment || 0;

    // Surface finish cost = weight * finishPricePerGram
    const finishCost = Math.round(weight * (selectedFinish?.pricePerGram || 0));

    // Unit subtotal — Final price = Material charge + Printing-time charge (+ extras)
    const unitPrice = materialCost + timeCost + colorCost + infillCost + finishCost;

    // Total subtotal for quantity
    const subtotal = unitPrice * quantity;

    // GST (18%)
    const gstRate = pricingConfig.siteSettings?.gstRate || 0.18;
    const gstAmount = +(subtotal * gstRate).toFixed(2);

    // Grand total
    const grandTotal = +(subtotal + gstAmount).toFixed(2);

    return {
      baseWeight: safeBase,
      weight,
      materialCost,
      printTimeHours,
      timeRate,
      timeRateLabel: slab.label,
      timeCost,
      colorCost,
      infillCost,
      finishCost,
      unitPrice,
      subtotal,
      gstAmount,
      grandTotal,
    };
  }, [modelAnalysis, useSample, selectedMaterial, selectedColor, selectedInfill, selectedFinish, quantity, pricingConfig, hoursPerGram, slabs]);

  const hasUploadedModel = Boolean(uploadedFile && !useSample);
  const summaryModel = hasUploadedModel
    ? modelAnalysis
    : {
        ...modelAnalysis,
        dimensions: { x: 0, y: 0, z: 0 },
      };
  const summaryCalculations = hasUploadedModel
    ? calculations
    : {
        baseWeight: 0,
        weight: 0,
        materialCost: 0,
        printTimeHours: 0,
        timeRate: 0,
        timeRateLabel: "0–5 hours",
        timeCost: 0,
        colorCost: 0,
        infillCost: 0,
        finishCost: 0,
        unitPrice: 0,
        subtotal: 0,
        gstAmount: 0,
        grandTotal: 0,
      };
  const summaryQuantity = hasUploadedModel ? quantity : 0;

  /* =========================================================
     FILE UPLOAD HANDLERS
     ========================================================= */
  const handleFileUpload = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["stl", "obj", "3mf"].includes(ext)) {
      toast.error("Please upload an .STL, .OBJ, or .3MF file.");
      return;
    }
    if (MAX_FILE_SIZE_MB !== -1 && !isNaN(MAX_FILE_SIZE_MB)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`File exceeds maximum size limit of ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }
    }
    setUploadedFile(file);
    setUseSample(false);
    toast.success(`Loaded ${file.name}`);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveModel = () => {
    setUploadedFile(null);
    setUseSample(false);
    setModelAnalysis({
      fileName: "No file loaded",
      fileSizeMB: 0,
      dimensions: { x: 0, y: 0, z: 0 },
      volumeCm3: 0,
      weightGrams: 0,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info("Model removed. Upload a 3D model to calculate prices.");
  };

  const handleLoadSample = () => {
    setUploadedFile(null);
    setUseSample(true);
  };

  const handleCustomHexChange = (e) => {
    const val = e.target.value;
    setCustomHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setSelectedColorHex(val);
    }
  };

  const handleCustomColorPickerChange = (e) => {
    const val = e.target.value;
    setSelectedColorHex(val);
    setCustomHexInput(val.toUpperCase());
  };

  /* =========================================================
     3D PRINT ORDER — supports both Add to Cart (unified checkout
     with products, coupons incl. GST, shipping) and direct order
     ========================================================= */
  const buildPrintPayload = (uploaded) => ({
    file_name: uploaded?.name || modelAnalysis.fileName || "model.stl",
    file_url: uploaded?.url,
    file_public_id: uploaded?.public_id || null,
    file_size: uploaded?.size || modelAnalysis.fileSizeMB,
    dimension_x: modelAnalysis.dimensions.x,
    dimension_y: modelAnalysis.dimensions.y,
    dimension_z: modelAnalysis.dimensions.z,
    material_id: selectedMaterial.id,
    color_id: selectedColor.id === "custom" ? null : selectedColor.id,
    custom_color_hex: selectedColor.id === "custom" ? selectedColorHex : null,
    infill_density: Number(selectedInfill.id || 50),
    surface_finish: selectedFinish.id === "smooth" ? "smooth" : "standard",
    quantity,
    // Base (unscaled) weight — the server applies its infill multiplier
    estimated_weight: calculations.baseWeight,
  });

  const validatePrintSelection = () => {
    if (!hasUploadedModel || !modelAnalysis || modelAnalysis.weightGrams <= 0) {
      toast.warning("Please upload a 3D model first.");
      return false;
    }
    if (!localStorage.getItem("token")) {
      toast.info("Please login before ordering a 3D print");
      navigate("/login", { state: { from: "/3d-printing" } });
      return false;
    }
    if (isOversized) {
      toast.error(
        `Model exceeds maximum printable volume (${MAX_PRINT_WIDTH_MM === -1 ? "No limit" : MAX_PRINT_WIDTH_MM + "mm"} × ${MAX_PRINT_DEPTH_MM === -1 ? "No limit" : MAX_PRINT_DEPTH_MM + "mm"} × ${MAX_PRINT_HEIGHT_MM === -1 ? "No limit" : MAX_PRINT_HEIGHT_MM + "mm"}). Please scale down your model.`
      );
      return false;
    }
    if (typeof selectedMaterial?.id !== "number") {
      toast.warning("Pricing data is still loading. Please wait a moment and try again.");
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    if (!validatePrintSelection()) return;
    setAddingToCart(true);
    try {
      let uploaded = null;
      if (uploadedFile) {
        const uploadResponse = await printingService.uploadFile(uploadedFile);
        uploaded = uploadResponse.data.file;
      }
      await cartService.addPrintItem(buildPrintPayload(uploaded));
      await syncCartBadge();
      toast.success("Custom 3D print added to cart!");
      navigate("/cart");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to add 3D print to cart");
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!validatePrintSelection()) return;
    setPlacingPrintOrder(true);
    try {
      let uploaded = null;
      if (uploadedFile) {
        const uploadResponse = await printingService.uploadFile(uploadedFile);
        uploaded = uploadResponse.data.file;
      }

      const response = await printingService.createOrder({
        ...buildPrintPayload(uploaded),
        payment_method: "cod",
      });

      toast.success(response.data.message || "3D print order placed");
      const orderNumber = response.data.order?.order_number;
      navigate(orderNumber ? `/orders/${orderNumber}` : "/orders");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to place 3D print order");
    } finally {
      setPlacingPrintOrder(false);
    }
  };

  return (
    <div className="printing-page">
      {/* =====================================================
          HERO BANNER
          ===================================================== */}
      <section className="printing-hero">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6 mb-4 mb-lg-0">
              <h1 className="hero-title">
                Your Ideas.
                <span className="hero-title-highlight">Printed in 3D.</span>
              </h1>
              <p className="hero-subtitle">
                Upload your 3D model, choose your material and color, and we'll print it
                with precision and deliver to your door.
              </p>

              <div className="hero-pills">
                <div className="hero-pill">
                  <div className="hero-pill-icon">
                    <Sparkles size={20} />
                  </div>
                  <div className="hero-pill-text">
                    <span className="hero-pill-title">High Quality Prints</span>
                    <span className="hero-pill-desc">Precision & detail you can trust</span>
                  </div>
                </div>

                <div className="hero-pill">
                  <div className="hero-pill-icon">
                    <Box size={20} />
                  </div>
                  <div className="hero-pill-text">
                    <span className="hero-pill-title">Wide Material</span>
                    <span className="hero-pill-desc">PLA, ABS, PETG and more</span>
                  </div>
                </div>

                <div className="hero-pill">
                  <div className="hero-pill-icon">
                    <Truck size={20} />
                  </div>
                  <div className="hero-pill-text">
                    <span className="hero-pill-title">Fast Delivery</span>
                    <span className="hero-pill-desc">Quick turnaround across India</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="hero-image-wrapper">
                <img
                  src="/images/3d_printer_hero.jpg"
                  alt="3D Printer Printing Rocket"
                  className="hero-printer-image"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          PROCESS STEPPER
          ===================================================== */}
      <section className="stepper-section">
        <div className="container">
          <h2 className="stepper-heading">Get Your 3D Print in 3 Easy Steps</h2>
          <div className="stepper-container">
            <div className="step-item">
              <div className="step-badge">1</div>
              <div className="step-content">
                <span className="step-title">Upload Model</span>
                <span className="step-subtitle">Upload your .STL or .OBJ file</span>
              </div>
            </div>

            <div className="step-arrow">
              <ArrowRight size={20} />
            </div>

            <div className="step-item">
              <div className="step-badge">2</div>
              <div className="step-content">
                <span className="step-title">Choose Options</span>
                <span className="step-subtitle">Select material, color & quantity</span>
              </div>
            </div>

            <div className="step-arrow">
              <ArrowRight size={20} />
            </div>

            <div className="step-item">
              <div className="step-badge">3</div>
              <div className="step-content">
                <span className="step-title">Place Order</span>
                <span className="step-subtitle">Secure payment & fast delivery</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          MAIN BUILDER: 2 COLUMNS
          ===================================================== */}
      <section className="builder-section">
        <div className="container">
          <div className="row">
            {/* ---------------- LEFT COLUMN (Upload & Options) ---------------- */}
            <div className="col-lg-8 mb-4 mb-lg-0">
              {/* STEP 1: UPLOAD */}
              <div className="mb-5">
                <h3 className="section-label">
                  <span className="section-label-number">1.</span> Upload Your 3D Model
                </h3>

                <div className="upload-viewer-grid">
                  {/* Dropzone Card */}
                  <div
                    className={`upload-dropzone-card ${isDragActive ? "drag-active" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".stl,.obj,.3mf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                      }}
                    />
                    <div className="dropzone-icon-wrap">
                      <UploadCloud size={28} />
                    </div>
                    <div className="dropzone-title">Drag & drop your file here</div>
                    <div className="dropzone-or">or</div>
                    <button
                      type="button"
                      className="btn-choose-file"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Choose File
                    </button>
                    <div className="dropzone-supports">
                      Supports: .STL, .OBJ, .3MF{" "}
                      {MAX_FILE_SIZE_MB === -1
                        ? "(No file size limit)"
                        : `(Max file size: ${MAX_FILE_SIZE_MB}MB)`}
                    </div>
                  </div>

                  {/* 3D Model Display Card */}
                  <div className="viewer-display-card">
                    {useSample || uploadedFile ? (
                      <>
                        <ModelViewer3D
                          file={uploadedFile}
                          color={selectedColorHex}
                          materialType={selectedMaterial.id}
                          density={selectedMaterial.density}
                          infillFactor={selectedInfill.factor}
                          useSample={useSample}
                          onAnalysis={handleModelAnalysis}
                        />
                        <div className="viewer-meta-bar">
                          <div className="viewer-meta-left">
                            <span className="viewer-filename">{modelAnalysis.fileName}</span>
                            {useSample && (
                              <span className="viewer-demo-badge">Demo model</span>
                            )}
                            <div className="viewer-specs">
                              <span>Size: {modelAnalysis.fileSizeMB} MB</span>
                              <span className={isOversized ? "text-danger fw-semibold" : ""}>
                                Dimensions: {modelAnalysis.dimensions.x} x {modelAnalysis.dimensions.y} x{" "}
                                {modelAnalysis.dimensions.z} mm
                              </span>
                            </div>
                            {isOversized && (
                              <div className="dimension-warning-pill">
                                <AlertTriangle size={13} />
                                <span>
                                  Exceeds max build volume (
                                  {MAX_PRINT_WIDTH_MM === -1 ? "∞" : `${MAX_PRINT_WIDTH_MM}`} ×{" "}
                                  {MAX_PRINT_DEPTH_MM === -1 ? "∞" : `${MAX_PRINT_DEPTH_MM}`} ×{" "}
                                  {MAX_PRINT_HEIGHT_MM === -1 ? "∞" : `${MAX_PRINT_HEIGHT_MM}`} mm)
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn-remove-model"
                            onClick={handleRemoveModel}
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div
                        className="d-flex flex-column align-items-center justify-content-center h-100 p-4 text-center"
                        style={{ minHeight: "300px", background: "#f8fafc" }}
                      >
                        <Box size={44} className="text-muted mb-2" />
                        <span className="text-secondary small mb-3">No 3D Model loaded</span>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={handleLoadSample}
                        >
                          Load Sample Rocket Model
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 2: CHOOSE YOUR OPTIONS */}
              <div ref={optionsSectionRef} className="options-container">
                <h3 className="section-label">
                  <span className="section-label-number">2.</span> Choose Your Options
                </h3>

                {/* Material & Color in Row */}
                <div className="options-row-flex">
                  {/* Material */}
                  <div>
                    <div className="option-group-label">Material</div>
                    <div className="material-cards-grid">
                      {materials.length ? materials.map((mat) => {
                        const isSelected = mat.id === selectedMaterialId;
                        return (
                          <div
                            key={mat.id}
                            className={`material-card ${isSelected ? "active" : ""}`}
                            onClick={() => setSelectedMaterialId(mat.id)}
                          >
                            <div className="material-name">{mat.name}</div>
                            <div className="material-price">₹{mat.pricePerGram} / gram</div>
                          </div>
                        );
                      }) : <div className="text-muted py-2">No materials available</div>}
                    </div>
                  </div>

                  {/* Color Swatches */}
                  <div>
                    <div className="option-group-label">Color</div>
                    <div className="color-swatches-box">
                      <div className="color-swatches-grid">
                        {colors.length ? colors.map((c) => {
                          const isSelected = selectedColorHex.toLowerCase() === c.hex.toLowerCase();
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`color-swatch-item ${isSelected ? "active" : ""}`}
                              style={{
                                backgroundColor: c.hex,
                                border: c.hex.toLowerCase() === "#ffffff" ? "1px solid #cbd5e1" : "none",
                              }}
                              onClick={() => setSelectedColorHex(c.hex)}
                              title={c.name}
                              aria-label={c.name}
                            />
                          );
                        }) : <div className="text-muted py-2">No colors available</div>}
                      </div>

                      {/* Custom Color Input */}
                      <div className="custom-color-row">
                        <span className="custom-color-label">Custom Color (Optional)</span>
                        <div className="custom-color-input-wrap">
                          <input
                            type="text"
                            placeholder="Enter HEX code (e.g. #1E88E5)"
                            className="custom-color-input"
                            value={customHexInput}
                            onChange={handleCustomHexChange}
                          />
                          <input
                            type="color"
                            className="color-picker-native"
                            value={selectedColorHex}
                            onChange={handleCustomColorPickerChange}
                            title="Open Color Picker"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Infill Density */}
                <div>
                  <div className="option-group-label">
                    <span>Infill Density</span>
                    <button
                      type="button"
                      className="what-is-infill-link btn btn-link p-0"
                      onClick={() => setIsInfillModalOpen(true)}
                    >
                      What is Infill?
                    </button>
                  </div>

                  <div className="infill-cards-grid">
                    {infillOptions.map((inf) => {
                      const isSelected = inf.id === selectedInfillId;
                      const cardPrice = getInfillCardPrice(inf);
                      return (
                        <div
                          key={inf.id}
                          className={`infill-card ${isSelected ? "active" : ""}`}
                          onClick={() => setSelectedInfillId(inf.id)}
                        >
                          <div className="infill-percentage">{inf.label}</div>
                          <div className="infill-tag">
                            ₹{cardPrice} {inf.tag ? `(${inf.tag})` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quantity & Surface Finish */}
                <div className="qty-finish-row">
                  {/* Quantity */}
                  <div>
                    <div className="option-group-label">Quantity</div>
                    <div className="qty-stepper-box">
                      <button
                        type="button"
                        className="qty-stepper-btn"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus size={15} />
                      </button>
                      <span className="qty-stepper-val">{quantity}</span>
                      <button
                        type="button"
                        className="qty-stepper-btn"
                        onClick={() => setQuantity((q) => q + 1)}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Surface Finish */}
                  <div>
                    <div className="option-group-label">Surface Finish</div>
                    <div className="finish-cards-grid">
                      {surfaceFinishes.map((f) => {
                        const isSelected = f.id === selectedFinishId;
                        return (
                          <div
                            key={f.id}
                            className={`finish-card ${isSelected ? "active" : ""}`}
                            onClick={() => setSelectedFinishId(f.id)}
                          >
                            <div className="finish-name">{f.name}</div>
                            <div className="finish-price">{f.tag}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* Auto estimate note — weight & time from STL + material */}
                <div className="summary-delivery-box" style={{ marginTop: 12 }}>
                  <Info size={20} className="summary-delivery-icon" />
                  <div className="summary-delivery-text">
                    <span className="summary-delivery-label">Auto estimate from your STL</span>
                    <span className="summary-delivery-time">
                      {hasUploadedModel ? (
                        <>Weight {calculations.weight}g • Time {Number(calculations.printTimeHours || 0).toFixed(2)}h ({calculations.timeRateLabel} @ ₹{calculations.timeRate}/h) • Final = Material ₹{calculations.materialCost} + Time ₹{calculations.timeCost}</>
                      ) : (
                        <>Upload an STL to auto-calculate weight, print time and final price.</>
                      )}
                    </span>
                    <span className="summary-delivery-time" style={{ marginTop: 4 }}>
                      Time slabs: {slabs.map((s) => `${slabLabelFor(s)} ₹${s.rate}/h`).join(" • ")}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* ---------------- RIGHT COLUMN (Sticky Order Summary) ---------------- */}
            <div className="col-lg-4">
              <div className="order-summary-card">
                <h3 className="summary-heading">Order Summary</h3>

                {/* Model Info Header */}
                <div className="summary-model-item">
                  <div className="summary-model-thumb-wrap">
                    <img
                      src="/images/rocket.png"
                      alt="3D Model Preview"
                      className="summary-model-thumb"
                    />
                  </div>
                  <div className="summary-model-details">
                    <div className="summary-model-filename">{summaryModel.fileName}</div>
                    <div className="summary-model-dim">
                      {summaryModel.dimensions.x} x {summaryModel.dimensions.y} x{" "}
                      {summaryModel.dimensions.z} mm
                    </div>
                    <div className="summary-model-tags">
                      {selectedMaterial.name} • {selectedColor.name} • {selectedInfill.label} Infill
                    </div>
                    <div className="summary-model-qty">Qty: {summaryQuantity}</div>
                    <button
                      type="button"
                      className="btn-summary-edit"
                      onClick={() => {
                        optionsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Edit Model
                    </button>
                  </div>
                </div>

                {/* Breakdown Items — Final price = Material charge + Printing-time charge */}
                <div className="summary-breakdown">
                  <div className="breakdown-row">
                    <span className="breakdown-label">Material ({selectedMaterial.name} • ₹{selectedMaterial.pricePerGram}/g)</span>
                    <div className="breakdown-value-group">
                      <span className="breakdown-weight">{summaryCalculations.weight}g</span>
                      <span className="breakdown-price">₹{summaryCalculations.materialCost}</span>
                    </div>
                  </div>

                  <div className="breakdown-row">
                    <span className="breakdown-label">Printing time ({summaryCalculations.timeRateLabel} • ₹{summaryCalculations.timeRate}/h)</span>
                    <div className="breakdown-value-group">
                      <span className="breakdown-weight">{Number(summaryCalculations.printTimeHours || 0).toFixed(2)}h</span>
                      <span className="breakdown-price">₹{summaryCalculations.timeCost}</span>
                    </div>
                  </div>

                  <div className="breakdown-row">
                    <span className="breakdown-label">Color</span>
                    <div className="breakdown-value-group">
                      <span className="breakdown-weight">{selectedColor.name}</span>
                      <span className="breakdown-price">₹0</span>
                    </div>
                  </div>

                  <div className="breakdown-row">
                    <span className="breakdown-label">Infill Density ({selectedInfill.label})</span>
                    <div className="breakdown-value-group">
                      <span className="breakdown-weight">{selectedInfill.tag || `${selectedInfill.percentage}%`}</span>
                      <span className="breakdown-price">₹{summaryCalculations.infillCost}</span>
                    </div>
                  </div>

                  <div className="breakdown-row">
                    <span className="breakdown-label">Surface Finish</span>
                    <div className="breakdown-value-group">
                      <span className="breakdown-weight">{selectedFinish.name}</span>
                      <span className="breakdown-price">₹{summaryCalculations.finishCost}</span>
                    </div>
                  </div>
                </div>

                <div className="summary-divider" />

                {/* Subtotal & GST */}
                <div className="summary-subtotal-row">
                  <span>Subtotal</span>
                  <span className="fw-semibold">₹{summaryCalculations.subtotal}</span>
                </div>

                <div className="summary-subtotal-row">
                  <span>GST ({Math.round((pricingConfig.siteSettings?.gstRate || 0.18) * 100)}%)</span>
                  <span className="fw-semibold">₹{summaryCalculations.gstAmount.toFixed(2)}</span>
                </div>

                <div className="summary-divider" />

                {/* Grand Total */}
                <div className="summary-total-row">
                  <span className="summary-total-label">Total</span>
                  <span className="summary-total-value">₹{summaryCalculations.grandTotal.toFixed(2)}</span>
                </div>

                {/* Delivery Guarantee Pill */}
                <div className="summary-delivery-box">
                  <Truck size={22} className="summary-delivery-icon" />
                  <div className="summary-delivery-text">
                    <span className="summary-delivery-label">Estimated Delivery</span>
                    <span className="summary-delivery-time">
                      {pricingConfig.siteSettings?.estimatedDeliveryDays || "3 – 5 Working Days"}{" "}
                      {pricingConfig.siteSettings?.deliveryRegion || "Across India"}
                    </span>
                  </div>
                </div>

                {/* Oversized Warning Alert */}
                {hasUploadedModel && isOversized && (
                  <div className="summary-oversized-alert">
                    <AlertTriangle size={18} className="flex-shrink-0" />
                    <span>
                      Model exceeds maximum build volume (
                      {MAX_PRINT_WIDTH_MM === -1 ? "∞" : `${MAX_PRINT_WIDTH_MM}`} ×{" "}
                      {MAX_PRINT_DEPTH_MM === -1 ? "∞" : `${MAX_PRINT_DEPTH_MM}`} ×{" "}
                      {MAX_PRINT_HEIGHT_MM === -1 ? "∞" : `${MAX_PRINT_HEIGHT_MM}`} mm).
                      Please scale down to place order.
                    </span>
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="summary-actions" style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="btn-buy-now"
                    onClick={handleAddToCart}
                    disabled={!hasUploadedModel || isOversized || addingToCart || placingPrintOrder}
                    style={{ flex: 1, background: "#ffffff", color: "#2563eb", border: "1.5px solid #2563eb" }}
                    title="Add this 3D model configuration to cart"
                  >
                    <span>{addingToCart ? "Adding..." : "Add to Cart"}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-buy-now"
                    onClick={handleBuyNow}
                    disabled={!hasUploadedModel || isOversized || addingToCart || placingPrintOrder}
                    style={{ flex: 1 }}
                  >
                    <span>{placingPrintOrder ? "Placing..." : "Place 3D Print Order"}</span>
                  </button>
                </div>

                <div className="summary-help-note">
                  Need help?{" "}
                  <Link to="/contact" className="summary-help-link">
                    Contact us
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          WHY CHOOSE OUR 3D PRINTING SERVICE?
          ===================================================== */}
      <section className="why-choose-section">
        <div className="container">
          <h2 className="why-choose-heading">Why Choose Our 3D Printing Service?</h2>
          <div className="why-features-grid">
            <div className="why-feature-card">
              <div className="why-icon-box">
                <Sparkles size={22} />
              </div>
              <div className="why-content">
                <span className="why-title">Precision & Quality</span>
                <span className="why-desc">High accuracy prints with smooth finish</span>
              </div>
            </div>

            <div className="why-feature-card">
              <div className="why-icon-box">
                <Layers size={22} />
              </div>
              <div className="why-content">
                <span className="why-title">Wide Material Range</span>
                <span className="why-desc">Multiple materials to suit your needs</span>
              </div>
            </div>

            <div className="why-feature-card">
              <div className="why-icon-box">
                <ShieldCheck size={22} />
              </div>
              <div className="why-content">
                <span className="why-title">Secure & Reliable</span>
                <span className="why-desc">Your files are safe and secure with us</span>
              </div>
            </div>

            <div className="why-feature-card">
              <div className="why-icon-box">
                <Headphones size={22} />
              </div>
              <div className="why-content">
                <span className="why-title">Customer Support</span>
                <span className="why-desc">We're here to help you at every step</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          POPULAR MATERIALS GUIDE
          ===================================================== */}
      <section className="materials-guide-section">
        <div className="container">
          <div className="guide-header-row">
            <h2 className="guide-heading">Popular Materials Guide</h2>
            <Link to="/products" className="guide-all-link">
              <span>View all materials</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="guide-cards-grid">
            {materials.map((mat) => (
              <div key={mat.id} className="guide-card">
                <div className="guide-spool-wrap">
                  <img
                    src={mat.image || "/images/products/blue_filament.png"}
                    alt={mat.name}
                    className="guide-spool-img"
                  />
                </div>
                <div className="guide-material-title">{mat.name}</div>
                <div className="guide-material-desc">{mat.description}</div>
                <div className="guide-material-best">
                  <span>Best for:</span> {mat.bestFor}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* =====================================================
          "WHAT IS INFILL?" INFO MODAL
          ===================================================== */}
      {isInfillModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsInfillModalOpen(false)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <span className="admin-modal-title">What is Infill Density?</span>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsInfillModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="text-secondary small mb-3">
                Infill refers to the internal structure of a 3D print. 3D prints are rarely printed
                100% solid inside to save weight, material, and printing time.
              </p>
              <div className="d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3">
                  <div className="fw-bold text-dark">10% - 20% (Fast / Lightweight)</div>
                  <div className="text-muted small">
                    Ideal for figurines, architectural models, visual prototypes, and display items.
                  </div>
                </div>
                <div className="p-3 bg-light rounded-3">
                  <div className="fw-bold text-dark">30% - 50% (Standard / Strong)</div>
                  <div className="text-muted small">
                    Recommended for functional everyday objects, phone stands, brackets, and enclosures.
                  </div>
                </div>
                <div className="p-3 bg-light rounded-3">
                  <div className="fw-bold text-dark">100% (Solid Mechanical)</div>
                  <div className="text-muted small">
                    Maximum structural rigidity for heavy-duty gears, mechanical tools, and high stress parts.
                  </div>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsInfillModalOpen(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
