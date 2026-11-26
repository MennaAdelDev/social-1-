const { z } = require('zod');
const { username, password } = require('./auth.validators');

exports.updateProfile = z
  .object({
    name: z.string().trim().min(1).max(60),
    username,
    bio: z.string().trim().max(160),
    avatar: z.string().trim().url().max(500).or(z.literal('')),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field');

exports.settings = z.object({ isPrivate: z.boolean() });
exports.changePassword = z.object({
  currentPassword: z.string().optional(),
  newPassword: password,
});
exports.deleteAccount = z.object({ password: z.string().optional() });
exports.usernameParam = z.object({ username: username });
exports.search = z.object({ q: z.string().trim().min(2).max(50) });
exports.suggestions = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) });
exports.requesterParam = z.object({ requesterId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });
