const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: true, unique: true, lowercase: true, trim: true,
      minlength: 3, maxlength: 30, match: /^[a-z0-9_.]+$/,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    bio: { type: String, maxlength: 160, default: '' },
    avatar: { type: String, default: '' },
    googleId: { type: String, unique: true, sparse: true, select: false },
    isEmailVerified: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });
userSchema.index({ followersCount: -1 });

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.googleId;
    delete ret.__v;
    delete ret.passwordChangedAt;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
