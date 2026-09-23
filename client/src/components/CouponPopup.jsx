import React, { useEffect, useState, useCallback } from "react";
import api from "../services/api.js";
import "../../public/css/coupon-popup.css";

const STORAGE_KEY = "printy_coupon_popup_dismissed";
const COOLDOWN_MS = 5 * 60 * 60 * 1000; // 5 hours
const SHOW_DELAY_MS = 2500; // delay before popup appears

function CouponPopup() {
  const [coupon, setCoupon] = useState(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── Check cooldown ── */
  const isCoolingDown = useCallback(() => {
    try {
      const ts = localStorage.getItem(STORAGE_KEY);
      if (!ts) return false;
      return Date.now() - Number(ts) < COOLDOWN_MS;
    } catch {
      return false;
    }
  }, []);

  /* ── Save dismiss time ── */
  const saveDismissTime = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  /* ── Close with animation ── */
  const handleClose = useCallback(() => {
    setClosing(true);
    saveDismissTime();
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 420); // match exit animation duration
  }, [saveDismissTime]);

  /* ── Copy code ── */
  const handleCopy = useCallback(async () => {
    if (!coupon?.code || copied) return;
    try {
      await navigator.clipboard.writeText(coupon.code);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = coupon.code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch {
        /* copy unavailable */
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [coupon, copied]);

  /* ── Fetch coupon & show ── */
  useEffect(() => {
    if (isCoolingDown()) return;

    let active = true;
    api
      .get("/coupons/announcement")
      .then((res) => {
        if (!active) return;
        const c = res.data?.coupon;
        if (!c) return;
        setCoupon(c);
        // Delayed entrance
        setTimeout(() => {
          if (active) setVisible(true);
        }, SHOW_DELAY_MS);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isCoolingDown]);

  /* ── Auto-dismiss after 15s ── */
  useEffect(() => {
    if (!visible || closing) return;
    const timer = setTimeout(handleClose, 15000);
    return () => clearTimeout(timer);
  }, [visible, closing, handleClose]);

  /* ── Escape key ── */
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible, handleClose]);

  if (!visible || !coupon) return null;

  const discountEmoji = coupon.text?.toLowerCase().includes("off")
    ? "🎉"
    : "🎁";

  return (
    <div
      className={`cpop-overlay ${closing ? "cpop-overlay--closing" : ""}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Special coupon offer"
    >
      <div
        className={`cpop-card ${closing ? "cpop-card--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative confetti dots */}
        <div className="cpop-confetti">
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
        </div>

        {/* Close button */}
        <button
          type="button"
          className="cpop-close"
          onClick={handleClose}
          aria-label="Close offer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Top badge */}
        <div className="cpop-badge">
          <i className="bi bi-stars"></i>
          <span>Exclusive Offer</span>
        </div>

        {/* Emoji */}
        <div className="cpop-emoji">{discountEmoji}</div>

        {/* Offer text */}
        <h3 className="cpop-title">{coupon.text}</h3>

        <p className="cpop-subtitle">Use this code at checkout to claim your discount</p>

        {/* Coupon code + copy */}
        <div className="cpop-code-wrap">
          <button
            type="button"
            className={`cpop-code ${copied ? "cpop-code--copied" : ""}`}
            onClick={handleCopy}
            title="Click to copy"
          >
            <span className="cpop-code-text">{coupon.code}</span>
            <span className="cpop-code-icon">
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </span>
          </button>
          {copied && <span className="cpop-copied-msg">Copied to clipboard!</span>}
        </div>

        {/* CTA */}
        <a href="/products" className="cpop-cta" onClick={handleClose}>
          Shop Now
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>

        {/* Fine print */}
        <p className="cpop-fine">Limited time offer · Terms apply</p>
      </div>
    </div>
  );
}

export default CouponPopup;
