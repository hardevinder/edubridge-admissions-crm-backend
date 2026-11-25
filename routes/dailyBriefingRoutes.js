const express = require('express');
const { rateLimit } = require('express-rate-limit');

const controller = require(
    '../controllers/dailyBriefingController'
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
    authorize('DIRECTOR', 'ADMISSION_HEAD')
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    keyGenerator: req =>
        `${req.institutionId}:${req.user.id}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

router.get('/dashboard', controller.dashboard);

router.post('/settings', controller.save);

router.post('/send', limiter, controller.sendNow);

router.post('/test', limiter, controller.test);

module.exports = router;
