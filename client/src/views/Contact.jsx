import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import catalogService from "../services/catalog.service";
import useSiteSettings from "../hooks/useSiteSettings";
import {
  Headphones,
  Clock,
  ShieldCheck,
  Truck,
  MapPin,
  Phone,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  ChevronDown,
  Lock,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import "../../public/css/contact.css";

const FAQ_DATA_LEFT = [
  {
    id: 1,
    question: "How can I track my order?",
    answer:
      "Once your order is dispatched, you will receive an SMS and email notification with your tracking number and live courier tracking link. You can also view real-time updates directly from your Profile > My Orders page.",
  },
  {
    id: 2,
    question: "What payment methods do you accept?",
    answer:
      "We accept all major UPI applications (Google Pay, PhonePe, Paytm, CRED), Credit & Debit cards (Visa, MasterCard, RuPay), Net Banking across 50+ Indian banks, Wallets, and Cash on Delivery (COD).",
  },
  {
    id: 3,
    question: "Do you offer bulk discounts?",
    answer:
      "Yes! We offer tiered bulk pricing and corporate rates for schools, universities, robotics clubs, and makerspaces. Submit an inquiry through our contact form with your approximate quantities for a custom quote.",
  },
];

const FAQ_DATA_RIGHT = [
  {
    id: 4,
    question: "How does the 3D printing service work?",
    answer:
      "Simply head over to our 3D Printing section, upload your CAD files (.STL, .OBJ, .STEP), select your preferred material (PLA, PETG, ABS, Resin) and color, choose your infill percentage, and our industrial printers will manufacture and ship it to your doorstep.",
  },
  {
    id: 5,
    question: "What file formats are accepted for 3D printing?",
    answer:
      "We support industry-standard 3D CAD formats including .STL, .OBJ, .STEP, .STP, and .3MF. If your project requires 3D modeling assistance, file optimization, or conversion, our engineering team can help.",
  },
  {
    id: 6,
    question: "What is your return policy?",
    answer:
      "We offer a 7-day hassle-free replacement and return guarantee for defective or damaged electronic components, modules, and filaments. Return pickups are arranged at zero cost to you.",
  },
];

export default function Contact() {
  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [contactInfo, setContactInfo] = useState(null);
  const { freeShippingThreshold } = useSiteSettings();

  // Live contact details from Admin → Settings (falls back to static text)
  useEffect(() => {
    let active = true;
    catalogService
      .getContactInfo()
      .then((res) => {
        if (active && res.data?.data?.contactInfo) {
          setContactInfo(res.data.data.contactInfo);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const infoPhone = contactInfo?.phone || "9836609063";
  const infoEmail = contactInfo?.email || "info.printynozzle@gmail.com";
  const infoWhatsapp = contactInfo?.whatsapp || "+919836609063";
  const infoHours = contactInfo?.businessHours || "Mon - Sat: 10:00 AM - 7:00 PM";
  const infoCompany = contactInfo?.companyName || "PrintyNozzle";

  // Accordion State
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (id) => {
    setOpenFaq((prev) => (prev === id ? null : id));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const SUBJECT_LABELS = {
    general: "General Inquiry",
    order: "Order Status & Tracking",
    "3d-printing": "3D Printing Custom Service",
    technical: "Product Technical Support",
    bulk: "Bulk Orders & B2B Partnerships",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.message) {
      toast.warn("Please fill in all required fields.");
      return;
    }
    setSending(true);
    try {
      const res = await catalogService.submitContact({
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: SUBJECT_LABELS[formData.subject] || "General Inquiry",
        message: formData.message.trim(),
      });
      toast.success(res.data?.message || "Thank you! Your message has been sent successfully.");
      setFormData({ fullName: "", email: "", subject: "", message: "" });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="contact-page-wrapper">
      <div className="contact-container">
        {/* ================= HERO SECTION ================= */}
        <div className="contact-hero-section">
          <div className="contact-hero-grid">
            {/* Left Content */}
            <div className="contact-hero-content">
              <h1 className="contact-main-title">Contact Us</h1>
              <h2 className="contact-hero-subtitle">We're here to help!</h2>
              <p className="contact-hero-desc">
                Have a question about our products, 3D printing service, or your order? Reach out to us and we'll get back to you as soon as possible.
              </p>

              {/* 4 Feature Badges */}
              <div className="contact-badges-row">
                <div className="contact-badge-item">
                  <div className="contact-badge-icon">
                    <Headphones size={20} />
                  </div>
                  <span className="contact-badge-title">Expert Support</span>
                  <p className="contact-badge-desc">Get help from our knowledgeable team</p>
                </div>

                <div className="contact-badge-item">
                  <div className="contact-badge-icon">
                    <Clock size={20} />
                  </div>
                  <span className="contact-badge-title">Quick Response</span>
                  <p className="contact-badge-desc">We usually reply within a few hours</p>
                </div>

                <div className="contact-badge-item">
                  <div className="contact-badge-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <span className="contact-badge-title">Reliable Service</span>
                  <p className="contact-badge-desc">Quality products &amp; trust you can count on</p>
                </div>

                <div className="contact-badge-item">
                  <div className="contact-badge-icon">
                    <Truck size={20} />
                  </div>
                  <span className="contact-badge-title">Fast Delivery</span>
                  <p className="contact-badge-desc">Quick delivery across India</p>
                </div>
              </div>
            </div>

            {/* Right Visual Image */}
            <div className="contact-hero-visual">
              {/* Background circuit diagram */}
              <svg
                className="contact-hero-circuit-bg"
                viewBox="0 0 260 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M 10 50 L 90 50 L 120 20 L 190 20 L 210 40 L 250 40"
                  stroke="#bfdbfe"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 80 L 130 80 L 155 55 L 230 55"
                  stroke="#93c5fd"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="50" r="3" fill="#3b82f6" />
                <circle cx="190" cy="20" r="3" fill="#60a5fa" />
                <circle cx="50" cy="80" r="3" fill="#93c5fd" />
                <circle cx="230" cy="55" r="3" fill="#3b82f6" />
              </svg>

              <img
                src="/images/01_contact.png"
                alt="Contact PrintyNozzle Support Tools &amp; Products"
                className="contact-hero-img"
              />
            </div>
          </div>
        </div>

        {/* ================= MAIN 2-COLUMN SECTION ================= */}
        <div className="contact-main-grid">
          {/* Left Column: Send us a Message */}
          <div className="contact-card">
            <h2 className="contact-card-title">Send us a Message</h2>

            <form onSubmit={handleSubmit} className="contact-form-grid">
              {/* Full Name */}
              <div className="contact-field-group">
                <label className="contact-field-label">
                  <span>Full Name</span>
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  className="contact-input"
                  required
                />
              </div>

              {/* Email Address */}
              <div className="contact-field-group">
                <label className="contact-field-label">
                  <span>Email Address</span>
                  <span className="required">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className="contact-input"
                  required
                />
              </div>

              {/* Subject */}
              <div className="contact-field-group contact-form-full">
                <label className="contact-field-label">
                  <span>Subject</span>
                  <span className="required">*</span>
                </label>
                <select
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  className="contact-select"
                  required
                >
                  <option value="">Choose a subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="order">Order Status &amp; Tracking</option>
                  <option value="3d-printing">3D Printing Custom Service</option>
                  <option value="technical">Product Technical Support</option>
                  <option value="bulk">Bulk Orders &amp; B2B Partnerships</option>
                </select>
              </div>

              {/* Message */}
              <div className="contact-field-group contact-form-full">
                <label className="contact-field-label">
                  <span>Message</span>
                  <span className="required">*</span>
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Type your message here..."
                  className="contact-textarea"
                  rows={5}
                  required
                />
              </div>

              {/* Submit Button */}
              <div className="contact-form-full">
                <button type="submit" className="btn-send-message" disabled={sending}>
                  <Send size={16} />
                  <span>{sending ? "Sending..." : "Send Message"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Get in Touch */}
          <div className="contact-card">
            <h2 className="contact-card-title">Get in Touch</h2>

            <div className="contact-info-list">
              {/* Visit Us */}
              <a
                href="https://maps.app.goo.gl/VcUXaWp4xX7P2L7r8"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-info-item"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="contact-info-icon-box">
                  <MapPin size={20} />
                </div>
                <div className="contact-info-texts">
                  <span className="contact-info-label">Visit Us</span>
                  <span className="contact-info-primary">{infoCompany}</span>
                  <span className="contact-info-sub">View on Google Maps &rarr;</span>
                </div>
              </a>

              {/* Call Us */}
              <div className="contact-info-item">
                <div className="contact-info-icon-box">
                  <Phone size={20} />
                </div>
                <div className="contact-info-texts">
                  <span className="contact-info-label">Call Us</span>
                  <span className="contact-info-primary">{infoPhone}</span>
                  <span className="contact-info-sub">{infoHours}</span>
                </div>
              </div>

              {/* Email Us */}
              <div className="contact-info-item">
                <div className="contact-info-icon-box">
                  <Mail size={20} />
                </div>
                <div className="contact-info-texts">
                  <span className="contact-info-label">Email Us</span>
                  <span className="contact-info-primary">{infoEmail}</span>
                  <span className="contact-info-sub">We reply within a few hours</span>
                </div>
              </div>

              {/* WhatsApp */}
              <div className="contact-info-item">
                <div className="contact-info-icon-box">
                  <MessageSquare size={20} />
                </div>
                <div className="contact-info-texts">
                  <span className="contact-info-label">WhatsApp</span>
                  <span className="contact-info-primary">{infoWhatsapp}</span>
                  <span className="contact-info-sub">Quick chat support</span>
                </div>
              </div>

              {/* Business Hours */}
              <div className="contact-info-item">
                <div className="contact-info-icon-box">
                  <Clock size={20} />
                </div>
                <div className="contact-info-texts">
                  <span className="contact-info-label">Business Hours</span>
                  <span className="contact-info-primary">{infoHours}</span>
                  <span className="contact-info-sub">Sunday: Closed</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= MIDDLE SECTION: MAP & WE'RE HERE TO HELP ================= */}
        <div className="contact-middle-grid">
          {/* Left: Google Map Card */}
          <div className="contact-map-card">
            <iframe
              title="Printynozzle Location"
              src="https://maps.google.com/maps?q=Printynozzle&ll=22.6983543,88.3819912&z=16&output=embed"
              className="contact-map-iframe"
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href="https://maps.app.goo.gl/VcUXaWp4xX7P2L7r8"
              target="_blank"
              rel="noopener noreferrer"
              className="map-open-link-btn"
            >
              <MapPin size={14} />
              <span>Open in Google Maps</span>
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Right: We're Here to Help Banner Card */}
          <div className="contact-help-banner-card">
            <div className="contact-help-left">
              <h3 className="contact-help-title">We're Here to Help</h3>
              <p className="contact-help-desc">
                Whether you need help with an order, product recommendation, or our 3D printing service, our team is ready to assist you.
              </p>

              <div className="contact-help-list">
                <div className="contact-help-point">
                  <CheckCircle2 size={16} className="contact-help-check-icon" />
                  <span>Pre &amp; Post Sales Support</span>
                </div>
                <div className="contact-help-point">
                  <CheckCircle2 size={16} className="contact-help-check-icon" />
                  <span>Product &amp; Technical Assistance</span>
                </div>
                <div className="contact-help-point">
                  <CheckCircle2 size={16} className="contact-help-check-icon" />
                  <span>3D Printing Service Enquiries</span>
                </div>
                <div className="contact-help-point">
                  <CheckCircle2 size={16} className="contact-help-check-icon" />
                  <span>Bulk Orders &amp; Partnerships</span>
                </div>
              </div>
            </div>

            {/* 3D Headset Image 02_contact.png */}
            <img
              src="/images/02_contact.png"
              alt="Customer Support Headset"
              className="contact-help-img"
            />
          </div>
        </div>

        {/* ================= FAQ SECTION ================= */}
        <div className="contact-faq-section">
          <h2 className="contact-faq-heading">Frequently Asked Questions</h2>

          <div className="contact-faq-grid">
            {/* Left Column FAQs */}
            <div className="contact-faq-column">
              {FAQ_DATA_LEFT.map((faq) => {
                const isOpen = openFaq === faq.id;
                return (
                  <div
                    key={faq.id}
                    className={`faq-accordion-item ${isOpen ? "open" : ""}`}
                  >
                    <button
                      type="button"
                      className="faq-accordion-header"
                      onClick={() => toggleFaq(faq.id)}
                    >
                      <span className="faq-accordion-title">{faq.question}</span>
                      <span className="faq-accordion-icon">
                        <ChevronDown size={18} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="faq-accordion-body">{faq.answer}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Column FAQs */}
            <div className="contact-faq-column">
              {FAQ_DATA_RIGHT.map((faq) => {
                const isOpen = openFaq === faq.id;
                return (
                  <div
                    key={faq.id}
                    className={`faq-accordion-item ${isOpen ? "open" : ""}`}
                  >
                    <button
                      type="button"
                      className="faq-accordion-header"
                      onClick={() => toggleFaq(faq.id)}
                    >
                      <span className="faq-accordion-title">{faq.question}</span>
                      <span className="faq-accordion-icon">
                        <ChevronDown size={18} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="faq-accordion-body">{faq.answer}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= BOTTOM TRUST BADGES ================= */}
        <div className="contact-trust-bar">
          <div className="contact-trust-item">
            <div className="contact-trust-icon-box">
              <Truck size={22} />
            </div>
            <div className="contact-trust-info">
              <span className="contact-trust-heading">Free Shipping</span>
              <span className="contact-trust-sub">On orders over ₹{freeShippingThreshold}</span>
            </div>
          </div>

          <div className="contact-trust-item">
            <div className="contact-trust-icon-box">
              <RotateCcw size={22} />
            </div>
            <div className="contact-trust-info">
              <span className="contact-trust-heading">7 Days Returns</span>
              <span className="contact-trust-sub">Hassle-free returns</span>
            </div>
          </div>

          <div className="contact-trust-item">
            <div className="contact-trust-icon-box">
              <Lock size={22} />
            </div>
            <div className="contact-trust-info">
              <span className="contact-trust-heading">Secure Payments</span>
              <span className="contact-trust-sub">100% safe &amp; secure</span>
            </div>
          </div>

          <div className="contact-trust-item">
            <div className="contact-trust-icon-box">
              <Headphones size={22} />
            </div>
            <div className="contact-trust-info">
              <span className="contact-trust-heading">24/7 Support</span>
              <span className="contact-trust-sub">We're here to help</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
