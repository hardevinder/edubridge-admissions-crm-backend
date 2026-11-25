require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/database');

const PORT = Number(process.env.PORT || 5055);

async function start() {
    try {

        if (!process.env.JWT_SECRET ||
            process.env.JWT_SECRET.length < 32) {
            throw new Error('Strong JWT_SECRET is required');
        }

        await sequelize.authenticate();

        app.listen(PORT, '127.0.0.1', () => {
            console.log('====================================');
            console.log('🚀 EduBridge Admissions CRM');
            console.log('✅ Database Connected');
            console.log(`✅ Server: http://localhost:${PORT}`);
            console.log('====================================');
        });

    } catch (error) {
        console.error('Startup failed:', error.message);
        process.exit(1);
    }
}

start();


require('./services/dailyBriefingService').startScheduler();
