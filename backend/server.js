require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// -------------------
// CONFIG
// -------------------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'hellosecret123';
const NODE_ENV = process.env.NODE_ENV || 'development';

let BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  BASE_URL = NODE_ENV === 'production'
    ? `https://roomofy-app-1.onrender.com`
    : `http://localhost:${PORT}`;
}

// Allowed origins from .env
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5500', 'http://127.0.0.1:5500'];

console.log('⚡ ALLOWED_ORIGINS:', ALLOWED_ORIGINS);
console.log('⚡ BASE_URL:', BASE_URL);

// -------------------
// MIDDLEWARES
// -------------------
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: Origin ${origin} not allowed`), false);
  },
  credentials: true
}));

app.use(express.json());

// ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// -------------------
// MONGO DB CONNECT
// -------------------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000 // max wait 5 sec
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1); // fail fast so Render stops
});

// -------------------
// SCHEMAS & MODELS
// -------------------
const userSchema = new mongoose.Schema({
  mobile: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
  title: String,
  price: Number,
  ac: { type: String, enum: ['AC', 'Non-AC'], default: 'Non-AC' },
  location: String,
  description: String,
  photoUrl: String,
  isHidden: { type: Boolean, default: false } // 👈 ADD THIS LINE
}, { timestamps: true });

const Room = mongoose.model('Room', roomSchema);

// -------------------
// MULTER CONFIG
// -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// -------------------
// AUTH ROUTES (UNCHANGED)
// -------------------
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) return res.status(400).json({ message: 'Mobile and password required' });

    const existingUser = await User.findOne({ mobile });
    if (existingUser) return res.status(400).json({ message: 'Mobile already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ mobile, passwordHash });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) return res.status(400).json({ message: 'Mobile and password required' });

    const user = await User.findOne({ mobile });
    if (!user) return res.status(400).json({ message: 'Invalid mobile or password' });

    const validPass = await bcrypt.compare(password, user.passwordHash);
    if (!validPass) return res.status(400).json({ message: 'Invalid mobile or password' });

    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: { mobile: user.mobile, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});




app.post('/api/rooms', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;

    if (!title || !price || !location || !ac) {
      return res.status(400).json({ message: 'Title, price, location and AC/Non-AC required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Room photo is required' });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ message: 'Price must be positive number' });
    }

    const photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    const newRoom = new Room({ title, price: priceNum, location, description, ac, photoUrl });
    await newRoom.save();

    res.status(201).json({ message: 'Room successfully posted', room: newRoom });
  } catch (err) {
    console.error('Add room error:', err);
    res.status(500).json({ message: 'Failed to add room' });
  }
});

app.delete('/api/rooms/:id', async (req, res) => {
  try {
    const deleted = await Room.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Room not found' });

    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ message: 'Failed to delete room' });
  }
});

app.put('/api/rooms/:id', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;
    const updateData = { title, price: Number(price), location, description, ac };

    if (req.file) {
      updateData.photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    }

    const updatedRoom = await Room.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedRoom) return res.status(404).json({ message: 'Room not found' });

    res.json({ message: 'Room updated successfully', room: updatedRoom });
  } catch (err) {
    console.error('Update room error:', err);
    res.status(500).json({ message: 'Failed to update room' });
  }
  //hide and UNHIDE ROOMS
});app.patch("/api/rooms/:id/hide", async (req, res) => {
  try {
    const { isHidden } = req.body;
    const room = await Room.findByIdAndUpdate(req.params.id, { isHidden }, { new: true });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ message: "Room status updated", room });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Backend: GET /api/rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const { search, minPrice, maxPrice, showHidden } = req.query;
    let filter = {};

    if (!showHidden || showHidden === 'false') {
      filter.isHidden = false; // dashboard me hidden rooms chhupaye
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const rooms = await Room.find(filter).sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    console.error('Get rooms error:', err);
    res.status(500).json({ message: 'Failed to fetch rooms' });
  }
});


// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`BASE_URL: ${BASE_URL}`);
});
