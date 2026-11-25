const express = require('express');

const controller = require(
    '../controllers/admissionTargetController'
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

router.get(
    '/options',
    controller.options
);

router.get(
    '/dashboard',
    controller.dashboard
);

router.post(
    '/',
    controller.save
);

module.exports = router;
