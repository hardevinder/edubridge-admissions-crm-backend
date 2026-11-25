const express = require('express');

const controller = require(
    '../controllers/emailCampaignController'
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

router.get('/options', controller.options);

router.get('/preview', controller.preview);

router.get('/', controller.list);

router.post('/', controller.create);

router.post('/:id/simulate', controller.simulate);

module.exports = router;
