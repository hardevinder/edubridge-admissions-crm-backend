require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const sequelize = require('./config/database');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(helmet());

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({
        success: true,
        application: 'EduBridge Admissions CRM',
        version: '1.0.0'
    });
});

app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();

        res.json({
            success: true,
            server: 'Healthy',
            database: 'Connected'
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            database: 'Unavailable'
        });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/calls', require('./routes/callRoutes'));
app.use('/api/email', require('./routes/emailRoutes'));
app.use('/api/masters', require('./routes/masterRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/field', require('./routes/fieldRoutes'));

app.use('/api/field-planner', require('./routes/fieldPlannerRoutes'));
app.use('/api/daily-briefing', require('./routes/dailyBriefingRoutes'));
app.use('/api/qr-registration', require('./routes/qrRegistrationRoutes'));
app.use('/api/public-enquiry', require('./routes/publicEnquiryRoutes'));
app.use('/api/marketing', require('./routes/marketingRoutes'));
app.use('/api/outreach', require('./routes/outreachRoutes'));
app.use('/api/admission-targets', require('./routes/admissionTargetRoutes'));
app.use('/api/ai-advisor', require('./routes/aiAdvisorRoutes'));
app.use('/api/email-campaigns', require('./routes/emailCampaignRoutes'));

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

app.use((err, req, res, next) => {
    console.error(err.message);

    const status = err.status === 400 ? 400 : 500;

    res.status(status).json({
        success: false,
        message: status === 400
            ? 'Invalid request'
            : 'Internal server error'
    });
});

module.exports = app;
