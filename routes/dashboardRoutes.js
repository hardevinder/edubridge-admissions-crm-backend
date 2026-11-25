const express = require('express');

const controller = require('../controllers/dashboardController');

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
        'COUNSELLOR'
    ),
    controller.getDashboard
);

module.exports = router;
