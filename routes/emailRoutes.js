const express = require('express');
const { rateLimit } = require('express-rate-limit');

const controller = require(
    '../controllers/emailController'
);

const {
    authenticate,
    authorize,
    requireInstitution
} = require('../middleware/auth');

const router = express.Router();

router.use(
    authenticate,
    requireInstitution,
    authorize(
        'DIRECTOR',
        'ADMISSION_HEAD',
        'COUNSELLOR'
    )
);

const sendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Email limit reached. Try again later.'
    }
});

router.get('/:id/history', controller.history);

router.post(
    '/:id/send',
    sendLimiter,
    controller.send
);

module.exports = router;
