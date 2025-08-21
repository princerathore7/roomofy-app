const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  ac: { type: String, enum: ["AC", "Non-AC"], default: "Non-AC" },

  // ✅ Change here
  photos: { type: [String], required: true },

  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      value: { type: Number, min: 1, max: 5 }
    }
  ],
  isHidden: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Room", roomSchema);
