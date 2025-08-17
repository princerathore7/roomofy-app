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
    if (!origin) return callback(null, true); // e.g. file:// or curl
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
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// -------------------
// MODELS
// -------------------
const userSchema = new mongoose.Schema({
  mobile: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// Room model (must include: title, price, ac, location, description, photoUrl, isHidden, ratings[])
const Room = require("./models/Room");

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
// AUTH ROUTES
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

// -------------------
// ROOM ROUTES
// -------------------

// ✅ Add new room (store only filename, not full URL)
// ✅ Add new room with guaranteed photo URL for frontend
app.post('/api/rooms', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;

    // Required fields check
    if (!title || !price || !location || !ac) {
      return res.status(400).json({ message: 'Title, price, location and AC/Non-AC required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Room photo is required' });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ message: 'Price must be a positive number' });
    }

    // Save room (only filename in DB)
    const newRoom = new Room({
      title,
      price: priceNum,
      location,
      description,
      ac,
      photo: req.file.filename
    });

    await newRoom.save();

    // Return room with full photo URL for frontend
    const roomWithUrl = {
      ...newRoom.toObject(),
      photoUrl: `${BASE_URL}/uploads/${newRoom.photo}`
    };

    res.status(201).json({
      message: 'Room successfully posted',
      room: roomWithUrl
    });
  } catch (err) {
    console.error('Add room error:', err);
    res.status(500).json({ message: 'Failed to add room' });
  }
});


// ✅ Delete room
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

// ✅ Update room
// ✅ Update room
app.put('/api/rooms/:id', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;

    // sirf wahi fields update karo jo aayi hain
    const updateData = {
      ...(title !== undefined && { title }),
      ...(price !== undefined && { price: Number(price) }),
      ...(location !== undefined && { location }),
      ...(description !== undefined && { description }),
      ...(ac !== undefined && { ac })
    };

    // ✅ yaha sirf filename save karo
    if (req.file) {
      updateData.photo = req.file.filename;
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedRoom) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ message: 'Room updated successfully', room: updatedRoom });
  } catch (err) {
    console.error('Update room error:', err);
    res.status(500).json({ message: 'Failed to update room' });
  }
});

// ✅ Hide / Unhide rooms
app.patch("/api/rooms/:id/hide", async (req, res) => {
  try {
    const { isHidden } = req.body;
    const room = await Room.findByIdAndUpdate(req.params.id, { isHidden: !!isHidden }, { new: true });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ message: "Room status updated", room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Add rating
app.post('/api/rooms/:id/rating', async (req, res) => {
  try {
    let { rating } = req.body;
    rating = Number(rating);

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    room.ratings.push(rating);
    await room.save();

    const avgRating = room.ratings.reduce((a, b) => a + b, 0) / room.ratings.length;

    res.json({ message: 'Rating added successfully', avgRating });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add rating' });
  }
});

// ✅ Get rooms (with filters + average rating)
app.get('/api/rooms', async (req, res) => {
  try {
    const { search, minPrice, maxPrice, showHidden } = req.query;
    let filter = {};

    if (!showHidden || showHidden === 'false') {
      filter.isHidden = false;
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

    const roomsWithAvg = rooms.map(r => {
      const ratings = Array.isArray(r.ratings) ? r.ratings : [];
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      return {
        ...r.toObject(),
        averageRating: Number(avg.toFixed(1))
      };
    });

    res.json(roomsWithAvg);
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
