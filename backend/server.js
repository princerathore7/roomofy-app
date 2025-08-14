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

// BASE_URL dynamic: production vs localhost
const BASE_URL = process.env.BASE_URL || (process.env.NODE_ENV === 'production'
  ? 'https://roomofy-backend.onrender.com'
  : `http://localhost:${PORT}`);

// Allowed origins for CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5500', 'https://roomofy.netlify.app'];

// -------------------
// MIDDLEWARES
// -------------------
app.use(cors({
  origin: function(origin, callback){
    console.log('Incoming request from origin:', origin);
    if(!origin) return callback(null, true); // Allow Postman or non-browser requests
    if(ALLOWED_ORIGINS.includes(origin)){
      return callback(null, true);
    } else {
      const msg = `CORS policy: This origin (${origin}) is not allowed`;
      console.error(msg);
      return callback(new Error(msg), false);
    }
  },
  credentials: true
}));

app.use(express.json());
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
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if(!mobile || !password) return res.status(400).json({ message: 'Mobile and password required' });

    const existingUser = await User.findOne({ mobile });
    if(existingUser) return res.status(400).json({ message: 'Mobile already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ mobile, passwordHash });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if(!mobile || !password) return res.status(400).json({ message: 'Mobile and password required' });

    const user = await User.findOne({ mobile });
    if(!user) return res.status(400).json({ message: 'Invalid mobile or password' });

    const validPass = await bcrypt.compare(password, user.passwordHash);
    if(!validPass) return res.status(400).json({ message: 'Invalid mobile or password' });

    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: { mobile: user.mobile, isAdmin: user.isAdmin } });
  } catch(err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// -------------------
// ROOM ROUTES
// -------------------
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.find();
    res.json(rooms);
  } catch(err) {
    console.error('Get rooms error:', err);
    res.status(500).json({ message: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', (req, res, next) => {
  upload.single('photo')(req, res, function(err){
    if(err){
      console.error('Multer error:', err);
      return res.status(400).json({ message: 'File upload error: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { title, price, location, description, ac } = req.body;

    if(!title || !price || !location || !ac){
      return res.status(400).json({ message: 'Title, price, location and AC/Non-AC are required' });
    }

    if(!req.file) return res.status(400).json({ message: 'Room photo is required' });

    const priceNum = Number(price);
    if(isNaN(priceNum) || priceNum <= 0) return res.status(400).json({ message: 'Price must be a valid positive number' });

    const photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    const newRoom = new Room({ title, price: priceNum, location, description, ac, photoUrl });
    await newRoom.save();

    res.status(201).json({ message: 'Room successfully posted', room: newRoom });
  } catch(err){
    console.error('Add room error:', err);
    res.status(500).json({ message: 'Failed to add room' });
  }
});

app.delete('/api/rooms/:id', async (req, res) => {
  try{
    const deleted = await Room.findByIdAndDelete(req.params.id);
    if(!deleted) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Room deleted successfully' });
  } catch(err){
    console.error('Delete room error:', err);
    res.status(500).json({ message: 'Failed to delete room' });
  }
});

app.put('/api/rooms/:id', upload.single('photo'), async (req, res) => {
  try{
    const { title, price, location, description, ac } = req.body;
    const updateData = { title, price: Number(price), location, description, ac };

    if(req.file){
      updateData.photoUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    }

    const updatedRoom = await Room.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if(!updatedRoom) return res.status(404).json({ message: 'Room not found' });

    res.json({ message: 'Room updated successfully', room: updatedRoom });
  } catch(err){
    console.error('Update room error:', err);
    res.status(500).json({ message: 'Failed to update room' });
  }
});

// -------------------
// START SERVER
// -------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`BASE_URL: ${BASE_URL}`);
});
