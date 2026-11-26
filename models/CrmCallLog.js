const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('crm_call_logs', {
    id: { type: D.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    institution_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    lead_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    user_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    direction: { type: D.ENUM('INBOUND', 'OUTBOUND'), allowNull: false },
    status: { type: D.ENUM('INITIATED', 'RINGING', 'IN_PROGRESS', 'ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MISSED', 'UNKNOWN'), allowNull: false },
    duration_seconds: { type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    called_at: { type: D.DATE, allowNull: false },
    remarks: { type: D.STRING(1000), allowNull: true },
    source: { type: D.ENUM('MANUAL', 'EXOTEL'), allowNull: false, defaultValue: 'MANUAL' },
    exotel_call_sid: D.STRING(100),
    provider_status: D.STRING(50),
    initiated_at: D.DATE,
    answered_at: D.DATE,
    completed_at: D.DATE,
    recording_consent: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
    failure_reason: D.STRING(500)
}, { indexes: [
    { fields: ['institution_id', 'lead_id', 'called_at'] },
    { fields: ['institution_id', 'user_id', 'called_at'] }
] });
