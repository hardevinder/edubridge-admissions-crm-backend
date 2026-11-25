const express = require('express');

const { rateLimit } = require('express-rate-limit');

const controller = require(
    '../controllers/aiAdvisorController'
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
        'ADMISSION_HEAD'
    )
);

const aiLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    limit: 15,

    standardHeaders: 'draft-7',

    legacyHeaders: false,

    keyGenerator: req =>
        `${req.institutionId}:${req.user.id}`,

    message: {

        success: false,

        message:
            'AI question limit reached. Please try again later.'
    }
});

router.get(
    '/dashboard',
    controller.dashboard
);

router.post(
    '/ask',
    aiLimiter,
    controller.ask
);

module.exports = router;
