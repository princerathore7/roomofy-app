// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

const app = express();

// -------------------
// CONFIG
// -------------------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/roomofy';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5500'];

// -------------------
// MIDDLEWARES
// -------------------
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json());

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------------------
// MONGO DB CONNECT
// -------------------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// -------------------
// SCHEMAS & MODELS
// -------------------

// User
const userSchema = new mongoose.Schema({
  mobile: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// Room
const roomSchema = new mongoose.Schema({
  title: String,
  price: Number,
  ac: { type: String, enum: ['AC', 'Non-AC'], default: 'Non-AC' },
  location: String,
  description: String,
  photoUrl: String,
});
const Room = mongoose.model('Room', roomSchema);

// -------------------
// MULTER CONFIG
// -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// -------------------
// AUTH ROUTES
// -------------------

// Signup
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

// Login
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

// Get all rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Add new room
app.post('/rooms', (req, res, next) => {
  upload.single('photo')(req, res, function(err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;

    if (!title || !price || !location || !ac) {
      return res.status(400).json({ error: 'Title, price, location and AC/Non-AC are required' });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Room photo is required' });
    }

    const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
    const photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;

    const newRoom = new Room({ title, price: priceNum, location, description, ac, photoUrl });
    await newRoom.save();

    res.status(201).json({ message: 'Room successfully posted', room: newRoom });
  } catch (error) {
    console.error('Error saving room:', error);
    res.status(500).json({ error: 'Failed to add room' });
  }
});

// Delete a room
app.delete('/rooms/:id', async (req, res) => {
  try {
    const roomId = req.params.id;
    const deleted = await Room.findByIdAndDelete(roomId);
    if (!deleted) return res.status(404).json({ error: 'Room not found' });
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Update a room
app.put('/rooms/:id', upload.single('photo'), async (req, res) => {
  try {
    const roomId = req.params.id;
    const { title, price, location, description, ac } = req.body;

    const updateData = { title, price: Number(price), location, description, ac };

    if (req.file) {
      const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
      updateData.photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    }

    const updatedRoom = await Room.findByIdAndUpdate(roomId, updateData, { new: true });
    if (!updatedRoom) return res.status(404).json({ error: 'Room not found' });

    res.json({ message: 'Room updated successfully', room: updatedRoom });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
