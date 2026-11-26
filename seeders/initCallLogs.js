const sequelize = require('../config/database');
require('../models');
const CrmCallLog = require('../models/CrmCallLog');
(async () => {
    try {
        await sequelize.authenticate();
        await CrmCallLog.sync({ force: false, alter: false });
        console.log('Call logs table ready');
    } catch (error) {
        console.error('Call logs initialization failed:', error.message);
        process.exitCode = 1;
    } finally { await sequelize.close(); }
})();
