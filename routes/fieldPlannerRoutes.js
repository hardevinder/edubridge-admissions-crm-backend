const express = require('express');

const controller = require(
    '../controllers/fieldPlannerController'
);

const {
    authenticate,
    authorize,
    requireInstitution
} = require('../middleware/auth');

const router = express.Router();

const viewers = [
    'DIRECTOR',
    'ADMISSION_HEAD',
    'FIELD_MANAGER',
    'FIELD_EXECUTIVE'
];

const editors = [
    'FIELD_MANAGER',
    'FIELD_EXECUTIVE'
];

router.use(
    authenticate,
    requireInstitution
);

router.get(
    '/',
    authorize(...viewers),
    controller.list
);

router.get(
    '/executives',
    authorize(...viewers),
    controller.executives
);

router.post(
    '/',
    authorize(...editors),
    controller.create
);

router.patch(
    '/:id/status',
    authorize(...editors),
    controller.updateStatus
);


router.patch(
    '/:id',
    authorize(...editors),
    controller.update
);

module.exports = router;
