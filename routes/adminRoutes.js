const express = require('express');

const controller = require(
    '../controllers/adminController'
);

const {
    authenticate,
    authorize
} = require('../middleware/auth');

const router = express.Router();

router.use(
    authenticate,
    authorize('SUPER_ADMIN')
);

router.get('/dashboard', controller.dashboard);

router.get('/institutions', controller.institutions);
router.post('/institutions', controller.createInstitution);

router.patch(
    '/institutions/:id/status',
    controller.institutionStatus
);

router.get('/branches', controller.branches);
router.post('/branches', controller.createBranch);

router.get('/roles', controller.roles);

router.get('/users', controller.users);
router.post('/users', controller.createUser);

router.patch(
    '/users/:id/status',
    controller.userStatus
);

module.exports = router;
