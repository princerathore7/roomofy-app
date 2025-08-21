const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const { verifyToken } = require("../middleware/authMiddleware");
const Room = require("../models/Room");

// cloudinary config
cloudinary.config({ secure: true });
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "roomofy_rooms",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 600, crop: "limit" }],
  },
});
const upload = multer({ storage });

// ✅ POST room (with multiple photos)
router.post("/", verifyToken, upload.array("photos", 5), async (req, res) => {
  try {
    const { title, price, location, description, ac, photoUrls } = req.body;

    if (!title || !price || !location || !ac) {
      return res.status(400).json({ message: "Title, price, location and AC/Non-AC required" });
    }

    let photos = [];

    if (req.files && req.files.length > 0) {
      photos = req.files.map(f => f.path);
    }

    if (photoUrls) {
      if (Array.isArray(photoUrls)) {
        photos = photos.concat(photoUrls);
      } else {
        photos = photos.concat(photoUrls.split(",").map(url => url.trim()));
      }
    }

    if (photos.length === 0) {
      return res.status(400).json({ message: "At least one room photo is required" });
    }

    const newRoom = new Room({
      title,
      price: Number(price),
      location,
      description,
      ac,
      photos,
    });

    await newRoom.save();
    res.status(201).json({ message: "Room posted successfully", room: newRoom });
  } catch (err) {
    console.error("Add room error:", err);
    res.status(500).json({
      message: "Failed to add room",
      error: err.message,
    });
  }
});

module.exports = router;
