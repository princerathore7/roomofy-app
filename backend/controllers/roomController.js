const Room = require("../models/Room");

// Create a new room (Admin only)
exports.createRoom = async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const { title, location, price, description, isHidden } = req.body;
  if (!title || !location || !price) {
    return res.status(400).json({ message: "Title, location, and price are required" });
  }

  try {
    const room = new Room({
      title,
      location,
      price,
      description,
      isHidden: isHidden || false // default false unless specified
    });
    await room.save();
    res.status(201).json({ message: "Room created", room });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all visible rooms for customers
exports.getRooms = async (req, res) => {
  try {
    const query = req.user && req.user.isAdmin
      ? {} // Admin can see all rooms
      : { isHidden: false }; // Customers only see visible rooms

    const rooms = await Room.find(query).sort({ createdAt: -1 });
    res.status(200).json({ rooms });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Hide a room (Admin only)
exports.hideRoom = async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { isHidden: true },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json({ message: "Room hidden successfully", room });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Unhide a room (Admin only)
exports.unhideRoom = async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { isHidden: false },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json({ message: "Room unhidden successfully", room });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
