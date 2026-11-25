const express = require('express');

const controller = require(
    '../controllers/marketingController'
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

router.get('/dashboard', controller.dashboard);

router.post('/budget', controller.saveBudget);

router.post('/expenses', controller.createExpense);

router.patch('/expenses/:id', controller.updateExpense);

module.exports = router;
