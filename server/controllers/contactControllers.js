const db = require("../config/db");

/* ===================== GET CONTACT PAGE DATA ===================== */
const getContactPageData = async (req, res) => {
  try {
    // Fetch site settings for contact
    const [settings] = await db.query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('site_name', 'support_email', 'support_phone', 'whatsapp_number', 'company_address', 'business_hours')"
    );

    const contactInfo = {};
    settings.forEach((s) => {
      contactInfo[s.setting_key] = s.setting_value;
    });

    // Contact FAQs
    const [faqs] = await db.query(
      "SELECT id, question, answer, category FROM faqs WHERE category IN ('contact', 'general') AND is_active = 1 ORDER BY sort_order ASC"
    );

    // Support pillars
    const supportPillars = [
      {
        id: "expert-support",
        title: "Expert Support",
        subtitle: "Get help from our knowledgeable team",
        icon: "headset",
      },
      {
        id: "quick-response",
        title: "Quick Response",
        subtitle: "We usually reply within a few hours",
        icon: "clock",
      },
      {
        id: "reliable-service",
        title: "Reliable Service",
        subtitle: "Quality products & trust you can count on",
        icon: "shield-check",
      },
      {
        id: "fast-delivery",
        title: "Fast Delivery",
        subtitle: "Quick delivery across India",
        icon: "truck",
      },
    ];

    // Help capabilities list
    const helpCapabilities = [
      "Pre & Post Sales Support",
      "Product & Technical Assistance",
      "3D Printing Service Enquiries",
      "Bulk Orders & Partnerships",
    ];

    // Subject options for contact dropdown
    const subjectOptions = [
      "Product Inquiry",
      "3D Printing Service",
      "Order Status & Tracking",
      "Technical Assistance",
      "Bulk Order & Quotation",
      "Feedback / Other",
    ];

    return res.status(200).json({
      success: true,
      data: {
        contactInfo: {
          companyName: contactInfo.site_name || "Printynozzle",
          address: contactInfo.company_address || "Indira Nagar Block 3, Sodepur, Panihati, Opposite Shree Krishna Sweets, North 24 Parganas, 700110, West Bengal, India",
          phone: contactInfo.support_phone || "9836609063",
          email: contactInfo.support_email || "info.printynozzle@gmail.com",
          whatsapp: contactInfo.whatsapp_number || "+919836609063",
          whatsappUrl: `https://wa.me/${(contactInfo.whatsapp_number || "+919836609063").replace(/[^0-9]/g, "")}?text=Hi%20Printynozzle%20Support!`,
          businessHours: contactInfo.business_hours || "Mon - Sat: 10:00 AM - 7:00 PM | Sunday: Closed",
          coordinates: { lat: 22.69, lng: 88.38 },
          mapQuery: "Sodepur, Panihati, Kolkata, West Bengal 700110",
        },
        supportPillars,
        helpCapabilities,
        subjectOptions,
        faqs,
      },
    });
  } catch (error) {
    console.error("Get contact page data error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== SUBMIT CONTACT FORM ===================== */
const submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Full name, email address, and message are required",
      });
    }

    if (!email.includes("@") || !email.includes(".")) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const [result] = await db.query(
      "INSERT INTO contact_messages (name, email, phone, subject, message, status) VALUES (?, ?, ?, ?, ?, ?)",
      [name.trim(), email.trim(), phone ? phone.trim() : null, subject ? subject.trim() : "General Inquiry", message.trim(), "pending"]
    );

    return res.status(201).json({
      success: true,
      message: "Message sent successfully! Our support team will get back to you within 24 hours.",
      data: { messageId: result.insertId },
    });
  } catch (error) {
    console.error("Submit contact error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getContactPageData,
  submitContact,
};
