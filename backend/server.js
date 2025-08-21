// -------------------
// BACKEND SERVER - ROOMOFY (Cleaned)
// Fully ready-to-use with Cloudinary + MongoDB + JWT
// -------------------

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// -------------------
// EXPRESS SETUP
// -------------------
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "hellosecret123";

// -------------------
// CORS setup
// -------------------
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5500"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Postman / curl
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(
        new Error(`CORS policy: Origin ${origin} not allowed`),
        false
      );
    },
    credentials: true,
  })
);

app.use(express.json());

// -------------------
// MONGODB CONNECTION
// -------------------
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// -------------------
// MODELS
// -------------------
const userSchema = new mongoose.Schema({
  mobile: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
});
const User = mongoose.model("User", userSchema);

// -------------------
// AUTH ROUTES
// -------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res
        .status(400)
        .json({ message: "Mobile and password required" });

    const existingUser = await User.findOne({ mobile });
    if (existingUser)
      return res.status(400).json({ message: "Mobile already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ mobile, passwordHash });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res
      .status(500)
      .json({ message: "Server error during signup", error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res
        .status(400)
        .json({ message: "Mobile and password required" });

    const user = await User.findOne({ mobile });
    if (!user)
      return res.status(400).json({ message: "Invalid mobile or password" });

    const validPass = await bcrypt.compare(password, user.passwordHash);
    if (!validPass)
      return res.status(400).json({ message: "Invalid mobile or password" });

    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, user: { mobile: user.mobile, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error("Login error:", err);
    res
      .status(500)
      .json({ message: "Server error during login", error: err.message });
  }
});

// -------------------
// ROOM ROUTES (moved to separate file)
// -------------------
const roomRoutes = require("./routes/roomRoutes");
app.use("/api/rooms", roomRoutes);

// -------------------
// GLOBAL ERROR HANDLER
// -------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    message: "Internal Server Error",
    error: err?.response?.body || err?.message || err,
  });
});

// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
