const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true },
  ac: { type: String, enum: ["AC", "Non-AC"], default: "Non-AC" },

  // ✅ Photos array (can be updated on edit)
  photos: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length > 0,
      message: "At least one photo URL is required"
    }
  },

  // Ratings system
  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      value: { type: Number, min: 1, max: 5 }
    }
  ],

  isHidden: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// ✅ This will allow updating fields safely with `findByIdAndUpdate`
roomSchema.set("toJSON", { virtuals: true });
roomSchema.set("toObject", { virtuals: true });

// ✅ Prevent OverwriteModelError
module.exports = mongoose.models.Room || mongoose.model("Room", roomSchema);
