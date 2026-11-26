const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('crm_call_logs', {
    id: { type: D.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    institution_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    lead_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    user_id: { type: D.INTEGER.UNSIGNED, allowNull: false },
    direction: { type: D.ENUM('INBOUND', 'OUTBOUND'), allowNull: false },
    status: { type: D.ENUM('ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MISSED'), allowNull: false },
    duration_seconds: { type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    called_at: { type: D.DATE, allowNull: false },
    remarks: { type: D.STRING(1000), allowNull: true },
    source: { type: D.ENUM('MANUAL'), allowNull: false, defaultValue: 'MANUAL' }
}, { indexes: [
    { fields: ['institution_id', 'lead_id', 'called_at'] },
    { fields: ['institution_id', 'user_id', 'called_at'] }
] });
