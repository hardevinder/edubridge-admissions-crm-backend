const express = require('express');

const controller = require(
    '../controllers/fieldController'
);

const {
    authenticate,
    authorize,
    requireInstitution
} = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireInstitution);

router.get(
    '/dashboard',
    authorize(
        'DIRECTOR',
        'ADMISSION_HEAD',
        'FIELD_MANAGER',
        'FIELD_EXECUTIVE'
    ),
    controller.dashboard
);

router.post(
    '/visits',
    authorize('FIELD_EXECUTIVE'),
    controller.createVisit
);

module.exports = router;
