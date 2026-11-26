const router = require('express').Router();
const c = require('../controllers/auth.controller');
const v = require('../validators/auth.validators');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');

router.post('/register', authLimiter, validate({ body: v.register }), c.register);
router.get('/verify-email', validate({ query: v.verifyEmail }), c.verifyEmail);
router.post('/verify-email', validate({ body: v.verifyEmail }), c.verifyEmail);
router.post('/resend-verification', otpLimiter, validate({ body: v.emailOnly }), c.resendVerification);

router.post('/login', authLimiter, validate({ body: v.login }), c.login);
router.post('/refresh', authLimiter, validate({ body: v.refresh }), c.refresh);
router.post('/logout', validate({ body: v.refresh }), c.logout);
router.post('/logout-all', auth, c.logoutAll);

router.post('/forgot-password', otpLimiter, validate({ body: v.emailOnly }), c.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: v.resetPassword }), c.resetPassword);

router.post('/google', authLimiter, validate({ body: v.google }), c.googleLogin);

module.exports = router;
