const router = require('express').Router();
const c = require('../controllers/user.controller');
const v = require('../validators/user.validators');
const { idParam, pagination } = require('../validators/common');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');

router.use(auth);

// current user (declared before "/:username" routes)
router.get('/me', c.getMe);
router.patch('/me', validate({ body: v.updateProfile }), c.updateMe);
router.delete('/me', validate({ body: v.deleteAccount }), c.deleteMe);
router.patch('/me/settings', validate({ body: v.settings }), c.updateSettings);
router.patch('/me/password', validate({ body: v.changePassword }), c.changePassword);

// follow requests (private accounts)
router.get('/me/follow-requests', validate({ query: pagination }), c.getFollowRequests);
router.post('/me/follow-requests/:requesterId/accept', validate({ params: v.requesterParam }), c.acceptRequest);
router.delete('/me/follow-requests/:requesterId', validate({ params: v.requesterParam }), c.rejectRequest);

// search & suggestions
router.get('/search', validate({ query: v.search.merge(pagination) }), c.search);
router.get('/suggestions', validate({ query: v.suggestions }), c.suggestions);

// follow system
router.post('/:id/follow', validate({ params: idParam }), c.follow);
router.delete('/:id/follow', validate({ params: idParam }), c.unfollow);
router.get('/:id/followers', validate({ params: idParam, query: pagination }), c.getFollowers);
router.get('/:id/following', validate({ params: idParam, query: pagination }), c.getFollowing);

// public profile by username
router.get('/:username', validate({ params: v.usernameParam }), c.getProfile);

module.exports = router;
