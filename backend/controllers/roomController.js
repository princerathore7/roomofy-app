const Room = require("../models/Room");

exports.createRoom = async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Unauthorized" });

  const { title, location, price, description } = req.body;
  if (!title || !location || !price) return res.status(400).json({ message: "Title, location, price required" });

  try {
    const room = new Room({ title, location, price, description });
    await room.save();
    res.status(201).json({ message: "Room created", room });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.status(200).json({ rooms });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
