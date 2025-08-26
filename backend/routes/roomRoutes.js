const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const Room = require("../models/Room");

// -------------------
// CLOUDINARY CONFIG
// -------------------
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

// -------------------
// ✅ POST new room (public)
// -------------------
router.post("/", upload.array("photos", 5), async (req, res) => {
  try {
    const { title, price, location, description, ac, photoUrls } = req.body;

    if (!title || !price || !location || !ac) {
      return res.status(400).json({ message: "Title, price, location and AC/Non-AC required" });
    }

    let photos = [];

    // If photos uploaded via multer
    if (req.files && req.files.length > 0) {
      photos = req.files.map(f => f.path);
    }

    // If photo URLs provided
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

// -------------------
// ✅ GET all rooms (public)
// -------------------
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch rooms", error: err.message });
  }
});

// -------------------
// ✅ UPDATE (Edit) a room
// -------------------
// -------------------
// ✅ UPDATE (Edit) a room (photo optional)
// -------------------
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // agar request me multipart form hai to multer run karo
    if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
      return upload.array("photos", 5)(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({ error: "Photo upload error", details: err.message });
        }
        await handleRoomUpdate(req, res, id);
      });
    } else {
      // JSON ya urlencoded body directly handle karo
      await handleRoomUpdate(req, res, id);
    }
  } catch (err) {
    console.error("Update room error:", err);
    res.status(500).json({ error: "Failed to update room", details: err.message });
  }
});

// -------------------
// Common update logic
// -------------------
async function handleRoomUpdate(req, res, id) {
  const { title, price, location, description, ac, photoUrls } = req.body;

  let photos = [];

  // Agar nayi files upload hui hain
  if (req.files && req.files.length > 0) {
    photos = req.files.map(f => f.path);
  }

  // Agar external photo URLs aaye hain
  if (photoUrls) {
    if (Array.isArray(photoUrls)) {
      photos = photos.concat(photoUrls);
    } else {
      photos = photos.concat(photoUrls.split(",").map(url => url.trim()));
    }
  }

  // Update fields prepare karo
  const updateFields = {
    ...(title && { title }),
    ...(price && { price: Number(price) }),
    ...(location && { location }),
    ...(description && { description }),
    ...(ac && { ac }),
  };

  // sirf tabhi photos replace karna jab naya photo bheja ho
  if (photos.length > 0) {
    updateFields.photos = photos;
  }

  const updatedRoom = await Room.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true,
  });

  if (!updatedRoom) {
    return res.status(404).json({ error: "Room not found" });
  }

  res.json({ message: "Room updated successfully", room: updatedRoom });
}


// -------------------
// ✅ DELETE a room
// -------------------
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findByIdAndDelete(id);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room", details: err.message });
  }
});

// -------------------
// ✅ HIDE / UNHIDE a room
// -------------------
router.patch("/:id/hide", async (req, res) => {
  try {
    const { id } = req.params;
    const { isHidden } = req.body;

    const room = await Room.findByIdAndUpdate(
      id,
      { isHidden },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({ message: `Room ${isHidden ? "hidden" : "unhidden"} successfully`, room });
  } catch (err) {
    res.status(500).json({ error: "Failed to update room visibility", details: err.message });
  }
});

module.exports = router;
