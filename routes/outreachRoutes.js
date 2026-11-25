const express = require('express');

const controller = require(
    '../controllers/outreachController'
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
    requireInstitution,
    authorize(...viewers)
);

router.get('/options', controller.options);

router.get('/', controller.list);

router.get('/:id', controller.detail);

router.post(
    '/',
    authorize(...editors),
    controller.create
);

router.patch(
    '/:id',
    authorize(...editors),
    controller.update
);

router.post(
    '/:id/interactions',
    authorize(...editors),
    controller.interact
);

router.post(
    '/:id/plan-visit',
    authorize(...editors),
    controller.planVisit
);

module.exports = router;
