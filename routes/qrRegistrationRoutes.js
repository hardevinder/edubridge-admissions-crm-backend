const express = require('express');

const { rateLimit } = require('express-rate-limit');

const controller = require(
    '../controllers/qrRegistrationController'
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

router.get('/:id/image', controller.image);

router.post(
    '/',
    authorize(...editors),
    controller.create
);

router.patch(
    '/:id/status',
    authorize(...editors),
    controller.status
);

module.exports = router;
