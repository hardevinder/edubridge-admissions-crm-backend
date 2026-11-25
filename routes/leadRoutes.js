const express = require('express');

const controller = require('../controllers/leadController');

const {
    authenticate,
    authorize,
    requireInstitution
} = require('../middleware/auth');

const router = express.Router();

const management = ['DIRECTOR', 'ADMISSION_HEAD'];

const leadUsers = [
    ...management,
    'COUNSELLOR',
    'FIELD_EXECUTIVE'
];

const followupUsers = [
    ...management,
    'COUNSELLOR'
];

router.use(authenticate, requireInstitution);

router.get(
    '/',
    authorize(...leadUsers),
    controller.list
);

router.post(
    '/',
    authorize(...leadUsers),
    controller.create
);

router.get(
    '/pending-followups',
    authorize(...followupUsers),
    controller.pendingFollowups
);

router.get(
    '/:id',
    authorize(...leadUsers),
    controller.getOne
);

router.patch(
    '/:id/assign',
    authorize(...management),
    controller.assign
);

router.patch(
    '/:id/status',
    authorize(...followupUsers),
    controller.updateStatus
);

router.patch(
    '/:id/priority',
    authorize(...followupUsers),
    controller.updatePriority
);

router.post(
    '/:id/followups',
    authorize(...followupUsers),
    controller.addFollowup
);

module.exports = router;
