const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const passwordValidation = require("../utils/passwordValidation");
require("dotenv").config();

const saltRounds = Number(process.env.SALT_ROUNDS) || 10;

/* ===================== AUTO-SYNC ADMIN USER FROM .ENV ===================== */
const ensureAdminUser = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) return;

    const [existing] = await db.query("SELECT id, password_hash FROM users WHERE email = ?", [adminEmail]);
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    if (existing.length === 0) {
      await db.query(
        "INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active, is_verified) VALUES (?, ?, ?, ?, ?, 'admin', 1, 1)",
        ["Admin", "Printynozzle", adminEmail, "9836609063", hashedPassword]
      );
      console.log(`👑 Admin user initialized from .env: ${adminEmail}`);
    } else {
      // Keep password and role in sync with .env
      const isMatch = await bcrypt.compare(adminPassword, existing[0].password_hash);
      if (!isMatch) {
        await db.query("UPDATE users SET password_hash = ?, role = 'admin', is_active = 1 WHERE id = ?", [
          hashedPassword,
          existing[0].id,
        ]);
        console.log(`👑 Admin password updated from .env: ${adminEmail}`);
      }
    }
  } catch (err) {
    // Database may still be connecting on boot
    console.warn("⚠️ Admin user sync notice:", err.message);
  }
};

// Run auto-sync on load
ensureAdminUser();

/* ===================== REGISTER ===================== */
const register = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;

    /* -------- Validation -------- */
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (phone && phone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    if (!(await passwordValidation(password))) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long with uppercase, lowercase, number and special character",
      });
    }

    /* -------- Existing User Check -------- */
    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    /* -------- Role check (admin if matches .env ADMIN_EMAIL) -------- */
    const role = process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
      ? "admin"
      : "customer";

    /* -------- Insert User -------- */
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await db.query(
      "INSERT INTO users (first_name, last_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
      [first_name, last_name, email, phone || null, hashedPassword, role]
    );

    const userId = result.insertId;

    /* -------- JWT -------- */
    const token = jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: userId,
        first_name,
        last_name,
        email,
        phone: phone || null,
        role,
      },
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

/* ===================== LOGIN ===================== */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const envAdminEmail = process.env.ADMIN_EMAIL;
    const envAdminPassword = process.env.ADMIN_PASSWORD;

    // Check if logging in as .env Admin
    const isAdminEmail = envAdminEmail && email.trim().toLowerCase() === envAdminEmail.trim().toLowerCase();

    let [rows] = await db.query(
      "SELECT id, first_name, last_name, email, phone, password_hash, role, is_active, avatar_url FROM users WHERE email = ?",
      [email.trim()]
    );

    // If admin does not exist in DB yet, create it on the fly
    if (rows.length === 0 && isAdminEmail && envAdminPassword && password === envAdminPassword) {
      const hashedPassword = await bcrypt.hash(envAdminPassword, saltRounds);
      const [insertRes] = await db.query(
        "INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active, is_verified) VALUES (?, ?, ?, ?, ?, 'admin', 1, 1)",
        ["Admin", "Printynozzle", envAdminEmail, "9836609063", hashedPassword]
      );
      rows = [{
        id: insertRes.insertId,
        first_name: "Admin",
        last_name: "Printynozzle",
        email: envAdminEmail,
        phone: "9836609063",
        password_hash: hashedPassword,
        role: "admin",
        is_active: 1,
      }];
    }

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated. Contact support.",
      });
    }

    // Check password: either against DB hash or .env ADMIN_PASSWORD if admin
    let isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch && isAdminEmail && envAdminPassword && password === envAdminPassword) {
      isMatch = true;
      // Update hash in database
      const newHash = await bcrypt.hash(envAdminPassword, saltRounds);
      await db.query("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?", [newHash, user.id]);
      user.role = "admin";
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    delete user.password_hash;

    // Track last login for the admin Users table (guarded so login
    // never fails on DBs where the column hasn't been added yet).
    db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

/* ===================== GET PROFILE ===================== */
const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, first_name, last_name, email, phone, role, avatar_url, dob, gender, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user: rows[0] });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE PROFILE ===================== */
const updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone, dob, gender } = req.body;

    await db.query(
      "UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone), dob = COALESCE(?, dob), gender = COALESCE(?, gender) WHERE id = ?",
      [first_name || null, last_name || null, phone || null, dob || null, gender || null, req.user.id]
    );

    return res.status(200).json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== ADD ADDRESS ===================== */
const addAddress = async (req, res) => {
  try {
    const { type = "Home", full_name, phone, email, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

    if (!full_name || !phone || !address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: "All required address fields must be provided" });
    }

    if (is_default) {
      await db.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [req.user.id]);
    }

    const [result] = await db.query(
      "INSERT INTO addresses (user_id, type, full_name, phone, email, address_line1, address_line2, city, state, pincode, country, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, type, full_name, phone, email || null, address_line1, address_line2 || null, city, state, pincode, country || "India", is_default ? 1 : 0]
    );

    return res.status(201).json({ success: true, message: "Address added successfully", id: result.insertId });
  } catch (error) {
    console.error("Add address error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== UPDATE ADDRESS ===================== */
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, full_name, phone, email, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

    const [existing] = await db.query("SELECT id FROM addresses WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    if (is_default) {
      await db.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [req.user.id]);
    }

    await db.query(
      "UPDATE addresses SET type = COALESCE(?, type), full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = ?, address_line1 = COALESCE(?, address_line1), address_line2 = ?, city = COALESCE(?, city), state = COALESCE(?, state), pincode = COALESCE(?, pincode), country = COALESCE(?, country), is_default = COALESCE(?, is_default) WHERE id = ? AND user_id = ?",
      [type || null, full_name || null, phone || null, email !== undefined ? email : null, address_line1 || null, address_line2 !== undefined ? address_line2 : null, city || null, state || null, pincode || null, country || null, is_default !== undefined ? (is_default ? 1 : 0) : null, id, req.user.id]
    );

    return res.status(200).json({ success: true, message: "Address updated successfully" });
  } catch (error) {
    console.error("Update address error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===================== DELETE ADDRESS ===================== */
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM addresses WHERE id = ? AND user_id = ?", [id, req.user.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    return res.status(200).json({ success: true, message: "Address deleted successfully" });
  } catch (error) {
    console.error("Delete address error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  ensureAdminUser,
};
