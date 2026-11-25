const express = require('express');

const controller = require('../controllers/masterController');

const {
    authenticate,
    authorize,
    requireInstitution
} = require('../middleware/auth');

const router = express.Router();

router.get(
    '/',
    authenticate,
    requireInstitution,
    authorize(
        'DIRECTOR',
        'ADMISSION_HEAD',
        'COUNSELLOR',
        'FIELD_MANAGER',
        'FIELD_EXECUTIVE'
    ),
    controller.getMasters
);

module.exports = router;
