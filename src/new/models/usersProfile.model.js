// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
//     email: {
//       type: String,
//       required: true,
//       trim: true,
//       lowercase: true,
//       minlength: 3,
//       maxlength: 320,
//     },
//     shortbio: { type: String, maxlength: 200 },
//     avatar: { type: String, required: true, minlength: 1, maxlength: 8 },
//     role: {
//       type: String,
//       enum: ["user", "admin"],
//       default: "user",
//     },
//     roleTitle: { type: String, maxlength: 120 },
//     skills: {
//       type: [{ type: String, maxlength: 80 }],
//       default: [],
//     },
//     emailVerified: { type: Boolean, required: true, default: false },
//     isActive: { type: Boolean, required: true, default: true },
//     deletedAt: { type: Date, default: null },

//     // 🔥 NEW: 2FA enabled flag
//     twoFactorEnabled: { type: Boolean, default: false },

//     // token_version: { type: Number, default: 0 },
//   },
//   {
//     collection: "users",
//     timestamps: true,
//   }
// );

// userSchema.index(
//   { email: 1 },
//   { unique: true, collation: { locale: "en", strength: 2 } }
// );

// module.exports = mongoose.models.User || mongoose.model("User", userSchema);



const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 320,
    },
    shortbio: { type: String, maxlength: 200 },

    avatar: { type: String, required: true, minlength: 1, maxlength: 8 },

    // ROLE FOR AUTHORIZATION
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    roleTitle: { type: String, maxlength: 120 },

    skills: {
      type: [{ type: String, maxlength: 80 }],
      default: [],
    },

    // ADDED — required by the overload calculator's capacity formula
    // (capacity = workingHoursPerDay × remainingWorkingDays). Without
    // this, every person's capacity computed to NaN.
    workingHoursPerDay: {
      type: Number,
      min: 0,
      max: 24,
      default: 8,
    }, //working hrs pper day not mentioned / updated  in the user services 

    twoFactorEnabled: { type: Boolean, default: false },


    emailVerified: { type: Boolean, required: true, default: false },

    isActive: { type: Boolean, required: true, default: true },

    deletedAt: { type: Date, default: null },

    // Numeric counter for token invalidation (increment to invalidate all tokens)
    // token_version: {
    //   type: Number,
    //   default: 0,
    // },
  },
  {
    collection: "users",
    timestamps: true,
  }
);

userSchema.index(
  { email: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);