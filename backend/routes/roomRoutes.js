const express = require("express");
const router = express.Router();

const { createRoom, getRooms } = require("../controllers/roomController");
const { verifyToken } = require("../middleware/authMiddleware");

// Only admin can create rooms
router.post("/", verifyToken, createRoom);

// Anyone logged in can get rooms
router.get("/", verifyToken, getRooms);

module.exports = router;
