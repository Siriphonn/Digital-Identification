const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // ปรับ path ตามที่เก็บไฟล์ User.js

// helper สร้าง token
const createToken = (user) => {
  return jwt.sign({ id: user._id }, "your_jwt_secret", { expiresIn: "1h" });
};

// ตรวจ device / risk
const calculateRisk = (user, deviceId) => {
  if (!user.devices.includes(deviceId)) return "medium"; // device ใหม่
  return "low"; // device เคยใช้
};

// =====================
// REGISTER
// =====================
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// =====================
// LOGIN
// =====================
router.post("/login", async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    const risk = calculateRisk(user, deviceId);

    if (risk === "low") {
      // device เก่า → login ได้ทันที
      const token = createToken(user);
      return res.json({ status: "ok", token });
    } else if (risk === "medium") {
      // device ใหม่ → ต้อง OTP
      const otpSecret = Math.floor(100000 + Math.random() * 900000).toString();
      user.otpSecret = otpSecret;
      await user.save();
      console.log(`OTP for ${email}: ${otpSecret}`); // ปกติส่ง mail/SMS
      return res.json({ status: "otp_required" });
    } else {
      return res.json({ status: "blocked", message: "Login blocked due to suspicious activity" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// =====================
// VERIFY OTP
// =====================
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, deviceId } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otpSecret === otp) {
      user.otpSecret = null; // ล้าง OTP
      if (!user.devices.includes(deviceId)) user.devices.push(deviceId); // บันทึก device ใหม่
      await user.save();

      const token = createToken(user);
      return res.json({ status: "ok", token });
    } else {
      return res.status(400).json({ message: "Invalid OTP" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;