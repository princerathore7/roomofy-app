// server.js (Roomofy backend)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'roomofysecret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomofy_db';

// -------- MongoDB connection --------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// -------- Schemas --------
const roomSchema = new mongoose.Schema({
  title: String,
  price: Number,
  ac: String,
  location: String,
  photoUrl: String,
  description: String,
});

const userSchema = new mongoose.Schema({
  username: String,
  passwordHash: String,
});

const Room = mongoose.model('Room', roomSchema);
const User = mongoose.model('User', userSchema);

// -------- Routes --------

// GET all rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find();
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// POST create room (admin only, simple auth)
app.post('/rooms', async (req, res) => {
  try {
    const { title, price, ac, location, photoUrl, description } = req.body;
    const room = new Room({ title, price, ac, location, photoUrl, description });
    await room.save();
    res.json({ success: true, room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// -------- Auth routes --------
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username & password required' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash });
    await user.save();

    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -------- Start server --------
app.listen(PORT, () => {
  console.log(`✅ Roomofy server running at http://localhost:${PORT}`);
});
