const { z } = require('zod');

exports.objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
exports.idParam = z.object({ id: exports.objectId });
exports.pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
