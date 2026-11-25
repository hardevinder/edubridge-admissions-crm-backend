const { DataTypes: D } = require('sequelize');
const { sequelize } = require('./index');

const BriefingSettings = sequelize.define(
    'daily_briefing_settings',
    {
        id: {
            type: D.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        institution_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false,
            unique: 'uq_briefing_inst'
        },
        enabled: {
            type: D.BOOLEAN,
            defaultValue: false
        },
        send_time: {
            type: D.STRING(5),
            defaultValue: '08:00'
        },
        recipient_ids: {
            type: D.JSON,
            allowNull: false
        }
    }
);

const BriefingHistory = sequelize.define(
    'daily_briefing_history',
    {
        id: {
            type: D.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        institution_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },
        report_date: {
            type: D.DATEONLY,
            allowNull: false
        },
        delivery_key: {
            type: D.STRING(64),
            allowNull: false,
            unique: 'uq_briefing_delivery'
        },
        delivery_type: {
            type: D.ENUM('AUTO', 'MANUAL', 'TEST'),
            allowNull: false
        },
        recipients: {
            type: D.JSON,
            allowNull: false
        },
        subject: D.STRING(255),
        status: {
            type: D.ENUM(
                'PENDING',
                'DEMO',
                'SENT',
                'PARTIAL',
                'FAILED'
            ),
            defaultValue: 'PENDING'
        },
        error_message: D.TEXT,
        sent_at: D.DATE
    },
    {
        indexes: [{
            name: 'idx_briefing_inst_date',
            fields: ['institution_id', 'report_date']
        }]
    }
);

module.exports = {
    BriefingSettings,
    BriefingHistory
};
