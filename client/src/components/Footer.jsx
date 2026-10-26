import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import catalogService from "../services/catalog.service";
// import footerData from "../data/footer.json";
import "../../public/css/footer.css";

let footerData = {
  brand: {
    logo: "/images/logo.png",
    name: "PrintyNozzle",
    description:
      "Print. Build. Innovate. Quality 3D printing solutions, components, and electronics for makers and creators.",
  },

  columns: [
    {
      title: "Shop",
      links: [
        {
          label: "Home",
          url: "/",
        },
        {
          label: "All Products",
          url: "/products",
        },
        {
          label: "3d Printing",
          url: "/3d-printing",
        },
        {
          label: "Filaments",
          url: "/filaments",
        },
        {
          label: "Battery Packs",
          url: "/batteries",
        },
      ],
    },
    {
      title: "My Profile",
      links: [
        
        {
          label: "Profile",
          url: "/profile",
        },
        {
          label: "My Orders",
          url: "/my-orders",
        },
        {
          label: "Cart",
          url: "/cart",
        },
        // {
        //   label: "Wishlist",
        //   url: "/wishlist",
        // },
      ],
    },
    {
      title: "Customer Service",
      links: [
        {
          label: "Contact Us",
          url: "/contact",
        },
        {
          label: "Shipping Policy",
          url: "/shipping",
        },
        {
          label: "Return Policy",
          url: "/returns",
        },
        {
          label: "FAQs",
          url: "/faqs",
        },
      ],
    },
    {
      title: "Company",
      links: [
        {
          label: "About Us",
          url: "/about",
        },
        // {
        //   label: "Blog",
        //   url: "/blog",
        // },
        {
          label: "Terms & Conditions",
          url: "/terms",
        },
        {
          label: "Privacy Policy",
          url: "/privacy",
        },
      ],
    },
  ],

  newsletter: {
    title: "Stay in the loop",
    description:
      "Get updates on new products, 3D printing services, offers and more.",
    placeholder: "Enter your email",
    button: "Subscribe",
  },

  socials: [
    { key: "facebook", name: "Facebook", url: "" },
    { key: "instagram", name: "Instagram", url: "" },
    { key: "youtube", name: "YouTube", url: "" },
    { key: "x", name: "X (Twitter)", url: "" },
    { key: "linkedin", name: "LinkedIn", url: "" },
    { key: "whatsapp", name: "WhatsApp", url: "" },
  ],

  payments: ["VISA", "Mastercard", "UPI", "RuPay"],

  copyright: "PrintyNozzle. All rights reserved.",
};

const normalizeSocialUrl = (url = "", key = "", name = "") => {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed || trimmed === "#") return "";

  const isWhatsapp =
    (key && key.toLowerCase() === "whatsapp") ||
    (name && name.toLowerCase().includes("whatsapp"));

  if (isWhatsapp) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("wa.me/")) return `https://${trimmed}`;
    const cleanDigits = trimmed.replace(/[^0-9]/g, "");
    if (cleanDigits) return `https://wa.me/${cleanDigits}`;
  }

  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  }
  return `https://${trimmed}`;
};

const renderSocialIcon = (item = {}) => {
  const key = String(item.key || item.name || "").toLowerCase();

  if (key.includes("facebook")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (key.includes("instagram")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (key.includes("youtube")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  if (key.includes("twitter") || key === "x" || key.includes("x (") || key.includes("x ")) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (key.includes("linkedin")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
      </svg>
    );
  }
  if (key.includes("whatsapp")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
    );
  }

  if (item.icon) {
    return <i className={item.icon}></i>;
  }
  return <span>{item.name?.charAt(0) || "🔗"}</span>;
};

function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [socials, setSocials] = useState(null);

  const fetchSocials = () => {
    catalogService
      .getContactInfo()
      .then((res) => {
        if (Array.isArray(res.data?.data?.socials)) {
          setSocials(res.data.data.socials);
        }
      })
      .catch(() => {
        /* offline fallback below */
      });
  };

  useEffect(() => {
    fetchSocials();

    const handleWindowFocus = () => fetchSocials();
    const handleSettingsUpdated = () => fetchSocials();

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("socialSettingsUpdated", handleSettingsUpdated);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("socialSettingsUpdated", handleSettingsUpdated);
    };
  }, []);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email || !email.includes("@")) {
      toast.warn("Please enter a valid email address.");
      return;
    }
    setSubscribing(true);
    try {
      const res = await catalogService.subscribeNewsletter(email);
      toast.success(res.data?.message || "Subscribed successfully!");
      setNewsletterEmail("");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Subscription failed. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  // Determine active socials to display
  const activeSocials = (socials && socials.length > 0
    ? socials
    : []
  ).filter((s) => {
    const url = normalizeSocialUrl(s.url, s.key, s.name);
    return Boolean(url);
  });

  return (
    <footer className="pn-footer">
      {/* Decorative glow */}
      <div className="pn-footer-glow"></div>

      <div className="pn-footer-container">
        {/* ================= BRAND ================= */}
        <div className="pn-footer-brand">
          <Link to="/" className="pn-footer-logo">
            <img src={footerData.brand.logo} alt={footerData.brand.name} />
          </Link>

          <p>{footerData.brand.description}</p>

          {activeSocials.length > 0 && (
            <div className="pn-socials">
              {activeSocials.map((social) => {
                const href = normalizeSocialUrl(social.url, social.key, social.name);
                return (
                  <a
                    key={social.key || social.name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.name}
                    title={social.name}
                  >
                    {renderSocialIcon(social)}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* ================= FOOTER COLUMNS ================= */}
        {footerData.columns.map((column) => (
          <div className="pn-footer-column" key={column.title}>
            <h4>{column.title}</h4>

            <div className="pn-footer-links">
              {column.links.map((link) => (
                <Link key={link.label} to={link.url}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* ================= NEWSLETTER ================= */}
        <div className="pn-footer-newsletter">
          <h4>{footerData.newsletter.title}</h4>

          <p>{footerData.newsletter.description}</p>

          <form className="pn-newsletter-form" onSubmit={handleSubscribe}>
            <input
              type="email"
              placeholder={footerData.newsletter.placeholder}
              aria-label="Email address"
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              disabled={subscribing}
            />

            <button type="submit" disabled={subscribing}>
              {subscribing ? "..." : footerData.newsletter.button}
            </button>
          </form>

          <small>No spam. Unsubscribe anytime.</small>
        </div>
      </div>

      {/* ================= FOOTER BOTTOM ================= */}
      <div className="pn-footer-bottom">
        <p>
          © {new Date().getFullYear()} {footerData.copyright}
        </p>

        <div className="pn-payment-methods">
          {footerData.payments.map((payment) => (
            <span
              key={payment}
              className={
                payment.toLowerCase() === "mastercard" ? "pn-mastercard" : ""
              }
            >
              {payment === "Mastercard" && (
                <span className="pn-card-circles">
                  <i></i>
                  <i></i>
                </span>
              )}

              {payment}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default Footer;
