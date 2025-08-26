// -------------------
// BACKEND SERVER - ROOMOFY (Hardened CORS + QoL)
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

// If running behind a proxy (Render/Railway/NGINX), trust it for correct protocol detection
app.set("trust proxy", 1);

// -------------------
// CORS setup (multi-origin + preflight + www support)
// -------------------
/**
 * ALLOWED_ORIGINS in .env:
 * ALLOWED_ORIGINS=https://roomofy.online,https://www.roomofy.online,https://netify.roomofymapp.com
 */
const DEFAULT_ALLOWED = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://roomofy.online",
  "https://www.roomofy.online",
];

const envAllowed =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

const ALLOWED_ORIGINS = Array.from(new Set([...DEFAULT_ALLOWED, ...envAllowed]));

// A small helper to handle null origin (Postman/curl) and strict checks
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman / curl / same-origin
    // Normalize trailing slash
    const clean = origin.replace(/\/+$/, "");
    if (ALLOWED_ORIGINS.includes(clean)) return callback(null, true);
    // also allow www.<domain> if bare domain present
    const wwwVariant = clean.replace("://", "://www.");
    const bareVariant = clean.replace("://www.", "://");
    if (ALLOWED_ORIGINS.includes(wwwVariant) || ALLOWED_ORIGINS.includes(bareVariant)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    // console.log("Incoming Origin:", req.headers.origin);
  }
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parser
app.use(express.json({ limit: "1mb" }));

// -------------------
// HEALTH CHECK
// -------------------
app.get("/health", (req, res) => {
  return res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    originsAllowed: ALLOWED_ORIGINS,
  });
});

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

const roomSchema = new mongoose.Schema({
  title: String,
  price: Number,
  description: String,
  ac: String,
  location: String,
  photos: [String],
  isHidden: { type: Boolean, default: false },
});
const Room = mongoose.model("Room", roomSchema);

// -------------------
// AUTH ROUTES
// -------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res.status(400).json({ message: "Mobile and password required" });

    const existingUser = await User.findOne({ mobile });
    if (existingUser)
      return res.status(400).json({ message: "Mobile already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ mobile, passwordHash });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup", error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res.status(400).json({ message: "Mobile and password required" });

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
    res.status(500).json({ message: "Server error during login", error: err.message });
  }
});

// -------------------
// ROOM ROUTES
// -------------------
const roomRoutes = require("./routes/roomRoutes");
app.use("/api/rooms", roomRoutes);


// -------------------
// GLOBAL ERROR HANDLER
// -------------------
app.use((err, req, res, next) => {
  if (err && String(err.message || "").startsWith("CORS policy")) {
    console.error("CORS blocked:", err.message);
    return res.status(403).json({ message: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({
    message: "Internal Server Error",
    error: err?.response?.body || err?.message || err,
  });
});

// -------------------
// AI Suggestion / Smart Search Route
// -------------------
app.post("/api/search/suggest", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ message: "Query required" });
    }

    const normalized = query.toLowerCase();

    const rooms = await Room.find({
      $or: [
        { title: { $regex: normalized, $options: "i" } },
        { description: { $regex: normalized, $options: "i" } },
        { location: { $regex: normalized, $options: "i" } },
      ],
    }).limit(10);

    res.json({ suggestions: rooms });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Error during search", error: err.message });
  }
});

// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Allowed Origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
