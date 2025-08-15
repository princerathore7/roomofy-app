const express = require("express");
const router = express.Router();

const { createRoom, getRooms, hideRoom, unhideRoom } = require("../controllers/roomController");
const { verifyToken } = require("../middleware/authMiddleware");

// Only admin can create rooms
router.post("/", verifyToken, createRoom);

// Anyone logged in can get rooms
router.get("/", verifyToken, getRooms);

// Admin hide/unhide room
router.patch("/hide/:id", verifyToken, hideRoom);
router.patch("/unhide/:id", verifyToken, unhideRoom);

module.exports = router;
