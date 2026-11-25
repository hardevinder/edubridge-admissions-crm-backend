const express = require('express');
const { rateLimit } = require('express-rate-limit');

const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Too many login attempts. Try again later.'
    }
});

router.post('/login', loginLimiter, controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
