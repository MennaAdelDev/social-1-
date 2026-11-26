const User = require('../models/User');
const Follow = require('../models/Follow');
const Token = require('../models/Token');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { issueTokens, revokeAllUserTokens } = require('../utils/tokens');

const PUBLIC = 'username name avatar bio isPrivate followersCount followingCount';
const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- helpers ----------
async function relationship(meId, otherId) {
  if (String(meId) === String(otherId)) return { isSelf: true };
  const rows = await Follow.find({
    $or: [{ follower: meId, following: otherId }, { follower: otherId, following: meId }],
  });
  const out = { isSelf: false, isFollowing: false, isRequested: false, followsYou: false };
  rows.forEach((r) => {
    if (String(r.follower) === String(meId)) {
      if (r.status === 'accepted') out.isFollowing = true;
      else out.isRequested = true;
    } else if (r.status === 'accepted') out.followsYou = true;
  });
  return out;
}

async function ensureCanView(meId, target) {
  if (String(meId) === String(target._id) || !target.isPrivate) return;
  const rel = await relationship(meId, target._id);
  if (!rel.isFollowing) throw new ApiError(403, 'This account is private');
}

const adjustCounts = (followerId, followingId, delta) =>
  Promise.all([
    User.updateOne({ _id: followerId }, { $inc: { followingCount: delta } }),
    User.updateOne({ _id: followingId }, { $inc: { followersCount: delta } }),
  ]);

// ---------- profile ----------
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (username && username !== req.user.username && (await User.exists({ username }))) {
    throw new ApiError(409, 'Username already taken');
  }
  Object.assign(req.user, req.body);
  await req.user.save();
  res.json({ success: true, data: { user: req.user } });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const target = await User.findOne({ username: req.params.username, isEmailVerified: true }).select(PUBLIC);
  if (!target) throw new ApiError(404, 'User not found');
  const rel = await relationship(req.user._id, target._id);
  res.json({
    success: true,
    data: {
      user: target,
      relationship: rel,
      canViewContent: Boolean(rel.isSelf || !target.isPrivate || rel.isFollowing),
    },
  });
});

// ---------- settings & privacy ----------
exports.updateSettings = asyncHandler(async (req, res) => {
  const { isPrivate } = req.body;
  const me = req.user;
  if (me.isPrivate && !isPrivate) {
    // switching to public: auto-accept pending requests
    const pending = await Follow.find({ following: me._id, status: 'pending' }).select('follower');
    if (pending.length) {
      await Follow.updateMany({ following: me._id, status: 'pending' }, { status: 'accepted' });
      await User.updateOne({ _id: me._id }, { $inc: { followersCount: pending.length } });
      await User.bulkWrite(
        pending.map((p) => ({ updateOne: { filter: { _id: p.follower }, update: { $inc: { followingCount: 1 } } } }))
      );
    }
  }
  me.isPrivate = isPrivate;
  await me.save();
  res.json({ success: true, data: { user: await User.findById(me._id) } });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (user.password) {
    if (!req.body.currentPassword || !(await user.comparePassword(req.body.currentPassword))) {
      throw new ApiError(401, 'Current password is incorrect');
    }
  }
  user.password = req.body.newPassword;
  await user.save();
  await revokeAllUserTokens(user._id);
  const tokens = await issueTokens(user, req);
  res.json({ success: true, message: 'Password changed', data: tokens });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (user.password && !(await user.comparePassword(req.body.password || ''))) {
    throw new ApiError(401, 'Password is incorrect');
  }
  const accepted = await Follow.find({
    status: 'accepted', $or: [{ follower: user._id }, { following: user._id }],
  });
  const ops = accepted.map((f) =>
    String(f.follower) === String(user._id)
      ? { updateOne: { filter: { _id: f.following }, update: { $inc: { followersCount: -1 } } } }
      : { updateOne: { filter: { _id: f.follower }, update: { $inc: { followingCount: -1 } } } }
  );
  if (ops.length) await User.bulkWrite(ops);
  await Follow.deleteMany({ $or: [{ follower: user._id }, { following: user._id }] });
  await Promise.all([
    RefreshToken.deleteMany({ user: user._id }),
    Token.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
  res.json({ success: true, message: 'Account deleted' });
});

// ---------- follow system ----------
exports.follow = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const target = await User.findById(req.params.id).select('isPrivate');
  if (!target) throw new ApiError(404, 'User not found');
  if (String(target._id) === String(me)) throw new ApiError(400, 'You cannot follow yourself');

  const status = target.isPrivate ? 'pending' : 'accepted';
  try {
    await Follow.create({ follower: me, following: target._id, status });
  } catch (e) {
    if (e.code === 11000) throw new ApiError(409, 'Already following or requested');
    throw e;
  }
  if (status === 'accepted') await adjustCounts(me, target._id, 1);
  res.status(201).json({ success: true, data: { status } });
});

// Unfollow, or cancel a pending request
exports.unfollow = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const removed = await Follow.findOneAndDelete({ follower: me, following: req.params.id });
  if (!removed) throw new ApiError(404, 'You are not following this user');
  if (removed.status === 'accepted') await adjustCounts(me, req.params.id, -1);
  res.json({ success: true, message: removed.status === 'pending' ? 'Request cancelled' : 'Unfollowed' });
});

exports.getFollowRequests = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const filter = { following: req.user._id, status: 'pending' };
  const [rows, total] = await Promise.all([
    Follow.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('follower', PUBLIC),
    Follow.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: rows.filter((r) => r.follower).map((r) => ({ user: r.follower, requestedAt: r.createdAt })),
    pagination: paginate(page, limit, total),
  });
});

exports.acceptRequest = asyncHandler(async (req, res) => {
  const row = await Follow.findOneAndUpdate(
    { follower: req.params.requesterId, following: req.user._id, status: 'pending' },
    { status: 'accepted' }
  );
  if (!row) throw new ApiError(404, 'Follow request not found');
  await adjustCounts(row.follower, req.user._id, 1);
  res.json({ success: true, message: 'Request accepted' });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const row = await Follow.findOneAndDelete({
    follower: req.params.requesterId, following: req.user._id, status: 'pending',
  });
  if (!row) throw new ApiError(404, 'Follow request not found');
  res.json({ success: true, message: 'Request rejected' });
});

const listConnections = (direction) =>
  asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id).select('isPrivate');
    if (!target) throw new ApiError(404, 'User not found');
    await ensureCanView(req.user._id, target);

    const { page, limit } = req.query;
    const key = direction === 'followers' ? 'following' : 'follower';
    const populateField = direction === 'followers' ? 'follower' : 'following';
    const filter = { [key]: target._id, status: 'accepted' };
    const [rows, total] = await Promise.all([
      Follow.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate(populateField, PUBLIC),
      Follow.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: rows.map((r) => r[populateField]).filter(Boolean),
      pagination: paginate(page, limit, total),
    });
  });
exports.getFollowers = listConnections('followers');
exports.getFollowing = listConnections('following');

// ---------- search & suggestions ----------
exports.search = asyncHandler(async (req, res) => {
  const { q, page, limit } = req.query;
  const rx = escapeRegex(q.toLowerCase());
  const filter = {
    isEmailVerified: true,
    _id: { $ne: req.user._id },
    $or: [{ username: { $regex: `^${rx}` } }, { name: { $regex: rx, $options: 'i' } }],
  };
  const [users, total] = await Promise.all([
    User.find(filter).select(PUBLIC).sort({ followersCount: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = users.map((u) => u._id);
  const rels = await Follow.find({ follower: req.user._id, following: { $in: ids } });
  const map = new Map(rels.map((r) => [String(r.following), r.status]));
  res.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      isFollowing: map.get(String(u._id)) === 'accepted',
      isRequested: map.get(String(u._id)) === 'pending',
    })),
    pagination: paginate(page, limit, total),
  });
});

// "People you may know": friends-of-friends ranked by mutual count, padded with popular users
exports.suggestions = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { limit } = req.query;

  const mine = await Follow.find({ follower: me }).select('following status');
  const exclude = [me, ...mine.map((m) => m.following)];
  const accepted = mine.filter((m) => m.status === 'accepted').map((m) => m.following);

  const mutual = accepted.length
    ? await Follow.aggregate([
        { $match: { follower: { $in: accepted }, status: 'accepted', following: { $nin: exclude } } },
        { $group: { _id: '$following', mutualCount: { $sum: 1 } } },
        { $sort: { mutualCount: -1 } },
        { $limit: limit },
      ])
    : [];

  const mutualIds = mutual.map((m) => m._id);
  const mutualUsers = await User.find({ _id: { $in: mutualIds }, isEmailVerified: true }).select(PUBLIC).lean();
  const byId = new Map(mutualUsers.map((u) => [String(u._id), u]));
  const result = mutual
    .map((m) => byId.get(String(m._id)) && { ...byId.get(String(m._id)), mutualCount: m.mutualCount })
    .filter(Boolean);

  if (result.length < limit) {
    const filler = await User.find({
      _id: { $nin: [...exclude, ...mutualIds] }, isEmailVerified: true,
    }).select(PUBLIC).sort({ followersCount: -1 }).limit(limit - result.length).lean();
    filler.forEach((u) => result.push({ ...u, mutualCount: 0 }));
  }
  res.json({ success: true, data: result });
});
