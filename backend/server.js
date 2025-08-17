require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// -------------------
// CLOUDINARY SETUP
// -------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'roomofy_rooms',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 800, height: 600, crop: "limit" }]
  }
});

const upload = multer({ storage });

// -------------------
// EXPRESS SETUP
// -------------------
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'hellosecret123';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5500'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS policy: Origin ${origin} not allowed`), false);
  },
  credentials: true
}));

app.use(express.json());

// -------------------
// MONGODB CONNECT
// -------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

const Room = require("./models/Room");

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

    const token = jwt.sign({ userId: user._id, mobile: user.mobile, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { mobile: user.mobile, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// -------------------
// ROOM ROUTES
// -------------------

// POST room
app.post('/api/rooms', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;
    if (!title || !price || !location || !ac) {
      return res.status(400).json({ message: 'Title, price, location and AC/Non-AC required' });
    }
    if (!req.file) return res.status(400).json({ message: 'Room photo is required' });

    const newRoom = new Room({
      title,
      price: Number(price),
      location,
      description,
      ac,
      photo: req.file.path // Cloudinary URL
    });

    await newRoom.save();
    res.status(201).json({ message: 'Room posted successfully', room: newRoom });
  } catch (err) {
    console.error('Add room error:', err);
    res.status(500).json({ message: 'Failed to add room', error: err.message });
  }
});

// UPDATE room
app.put('/api/rooms/:id', upload.single('photo'), async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;
    const updateData = {
      ...(title && { title }),
      ...(price && { price: Number(price) }),
      ...(location && { location }),
      ...(description && { description }),
      ...(ac && { ac })
    };

    if (req.file) updateData.photo = req.file.path;

    const updatedRoom = await Room.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedRoom) return res.status(404).json({ message: 'Room not found' });

    res.json({ message: 'Room updated successfully', room: updatedRoom });
  } catch (err) {
    console.error('Update room error:', err);
    res.status(500).json({ message: 'Failed to update room' });
  }
});

// GET rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
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
});
