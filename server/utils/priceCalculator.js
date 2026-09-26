/**
 * 3D Print Price Calculator — Printynozzle Selling Rate Chart
 *
 * Final price = Material charge + Printing-time charge (+ color/finish, then GST)
 *
 * - Material charge = effective_weight (grams) × price_per_gram (₹/g, admin editable per material)
 * - Effective weight = estimated_weight (solid, from STL volume × density) × infill multiplier
 * - Print time (hours) = effective_weight × hours_per_gram (admin editable, default 0.15)
 * - Printing-time charge = print_time_hours × slab rate (admin editable):
 *     0–5h → ₹50/h, 5–10h → ₹45/h, 10–20h → ₹40/h, 20+h → ₹35/h
 */

const DEFAULT_TIME_RATES = {
  rate_0_5: 50,
  rate_5_10: 45,
  rate_10_20: 40,
  rate_20_plus: 35,
};

const DEFAULT_HOURS_PER_GRAM = 0.15;

/* Default hourly slabs (admin editable via the Hourly Rates tab).
 * Shape: [{ min: 0, max: 5, rate: 50 }, ..., { min: 20, max: null, rate: 35 }]
 * max: null = no upper limit. Stored as JSON in site_settings.print_time_slabs. */
const DEFAULT_TIME_SLABS = [
  { min: 0, max: 5, rate: 50 },
  { min: 5, max: 10, rate: 45 },
  { min: 10, max: 20, rate: 40 },
  { min: 20, max: null, rate: 35 },
];

const slabLabel = (slab) =>
  slab.max === null || slab.max === undefined ? `${slab.min}+ hours` : `${slab.min}–${slab.max} hours`;

/* Normalize/validate a slabs array (admin input or DB JSON). Returns a clean
 * sorted array, or null when unusable (callers fall back to defaults). */
const parseTimeSlabs = (raw) => {
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
    const min = Number(s.min ?? s.min_hours);
    const maxRaw = s.max ?? s.max_hours;
    const max = maxRaw === null || maxRaw === undefined || maxRaw === "" ? null : Number(maxRaw);
    const rate = Number(s.rate);
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(rate) || rate < 0) return null;
    if (max !== null && (!Number.isFinite(max) || max <= min)) return null;
    clean.push({ min, max, rate });
  }
  clean.sort((a, b) => a.min - b.min);
  return clean;
};

/* Legacy 4-key settings ({ rate_0_5, ... }) → slabs array. */
const timeRatesToSlabs = (timeRates = {}) => {
  const merged = { ...DEFAULT_TIME_RATES, ...(timeRates || {}) };
  return [
    { min: 0, max: 5, rate: Number(merged.rate_0_5) },
    { min: 5, max: 10, rate: Number(merged.rate_5_10) },
    { min: 10, max: 20, rate: Number(merged.rate_10_20) },
    { min: 20, max: null, rate: Number(merged.rate_20_plus) },
  ];
};

const resolveSlabs = ({ timeSlabs, timeRates } = {}) => {
  const parsed = parseTimeSlabs(timeSlabs);
  if (parsed) return parsed;
  if (timeRates && Object.keys(timeRates).length > 0) return timeRatesToSlabs(timeRates);
  return DEFAULT_TIME_SLABS.map((s) => ({ ...s }));
};

/* Accept any slab representation and return a clean slabs array:
 * array | { timeSlabs, timeRates } | legacy { rate_0_5, ... } | undefined */
const normalizeSlabsInput = (input) => {
  if (Array.isArray(input)) {
    const parsed = parseTimeSlabs(input);
    if (parsed) return parsed;
  } else if (input && typeof input === "object") {
    if (input.timeSlabs !== undefined || input.timeRates !== undefined) {
      return resolveSlabs(input);
    }
    if (input.rate_0_5 !== undefined) return timeRatesToSlabs(input);
  }
  return DEFAULT_TIME_SLABS.map((s) => ({ ...s }));
};

const getTimeSlab = (hours, slabsOrOpts) => {
  const h = Number(hours || 0);
  const slabs = normalizeSlabsInput(slabsOrOpts);
  const match =
    slabs.find((s) => h > s.min && (s.max === null || s.max === undefined || h <= s.max)) ||
    slabs[slabs.length - 1] ||
    slabs[0];
  const idx = Math.max(0, slabs.indexOf(match));
  return { key: `slab_${idx}`, label: slabLabel(match), min: match.min, max: match.max ?? null };
};

const resolveTimeRate = (hours, slabsOrOpts) => {
  const slab = getTimeSlab(hours, slabsOrOpts);
  const slabs = normalizeSlabsInput(slabsOrOpts);
  const idx = Number(String(slab.key).split("_")[1] || 0);
  return { slab, rate: Number(slabs[idx]?.rate || 0) };
};

const calculatePrintPrice = ({
  estimatedWeight,    // grams (solid weight from STL volume × density, before infill scaling)
  pricePerGram,       // material selling rate ₹/g
  infillDensity,      // 10, 20, 30, 50, 100
  surfaceFinish,      // 'standard' or 'smooth'
  smoothFinishPerGram, // extra cost per gram for smooth
  colorAdjustment,    // extra cost for color (usually 0)
  quantity,           // number of copies
  gstRate,            // GST percentage (e.g. 18)
  hoursPerGram,       // hours of print time per gram (default 0.15)
  timeRates,          // legacy { rate_0_5, rate_5_10, rate_10_20, rate_20_plus }
  timeSlabs,          // dynamic slabs [{ min, max (null = no limit), rate }] — wins over timeRates
}) => {
  // Infill multiplier — affects effective weight
  const infillMultipliers = {
    10: 0.4,
    20: 0.55,
    30: 0.7,
    50: 1.0,
    100: 1.5,
  };

  const infillMultiplier = infillMultipliers[infillDensity] || 1.0;
  const effectiveWeight = estimatedWeight * infillMultiplier;

  // Material charge = effective weight × selling rate (₹/g)
  const materialCost = Math.round(effectiveWeight * pricePerGram * 100) / 100;

  // Estimated print time = effective weight × hours-per-gram factor.
  // Weight already embeds STL volume × material density × infill, so time
  // automatically depends on the attached file + selected material.
  const hpg = Number(hoursPerGram) > 0 ? Number(hoursPerGram) : DEFAULT_HOURS_PER_GRAM;
  const printTimeHours = Math.round(effectiveWeight * hpg * 100) / 100;

  // Printing-time charge = time × slab rate from the rate chart
  const { slab, rate: timeRate } = resolveTimeRate(printTimeHours, { timeSlabs, timeRates });
  const timeCost = Math.round(printTimeHours * timeRate * 100) / 100;

  // Color cost
  const colorCost = Math.round((colorAdjustment || 0) * 100) / 100;

  // Finish cost
  let finishCost = 0;
  if (surfaceFinish === "smooth") {
    finishCost = Math.round(effectiveWeight * (smoothFinishPerGram || 3) * 100) / 100;
  }

  // Per unit total — Final price = Material charge + Printing-time charge (+ extras)
  const perUnitCost = Math.round((materialCost + timeCost + colorCost + finishCost) * 100) / 100;

  // Subtotal
  const subtotal = Math.round(perUnitCost * quantity * 100) / 100;

  // Tax
  const taxAmount = Math.round(subtotal * (gstRate / 100) * 100) / 100;

  // Grand total
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  return {
    effectiveWeight: Math.round(effectiveWeight * 100) / 100,
    materialCost,
    printTimeHours,
    timeRate,
    timeRateLabel: slab.label,
    timeCost,
    colorCost,
    finishCost,
    perUnitCost,
    subtotal,
    taxAmount,
    totalAmount,
    quantity,
    infillDensity,
    surfaceFinish,
    hoursPerGram: hpg,
  };
};

module.exports = { calculatePrintPrice, getTimeSlab, resolveTimeRate, parseTimeSlabs, timeRatesToSlabs, resolveSlabs, DEFAULT_TIME_RATES, DEFAULT_TIME_SLABS, DEFAULT_HOURS_PER_GRAM };
