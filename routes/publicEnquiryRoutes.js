const express = require('express');
const { rateLimit } = require('express-rate-limit');

const controller = require(
    '../controllers/qrRegistrationController'
);

const router = express.Router();

const readLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    limit: 100,

    standardHeaders: 'draft-7',

    legacyHeaders: false
});

const submitLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    limit: 10,

    standardHeaders: 'draft-7',

    legacyHeaders: false,

    message: {

        success: false,

        message: 'Too many registration attempts. Please try again later.'
    }
});

router.get(
    '/:token',
    readLimiter,
    controller.publicOptions
);

router.post(
    '/:token',
    submitLimiter,
    controller.register
);

module.exports = router;
