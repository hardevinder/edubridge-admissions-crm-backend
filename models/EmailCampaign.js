const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    User
} = require('./index');

const EmailCampaign = sequelize.define(
    'email_campaigns',
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

        created_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        campaign_name: {
            type: D.STRING(200),
            allowNull: false
        },

        subject: {
            type: D.STRING(255),
            allowNull: false
        },

        message: {
            type: D.TEXT('long'),
            allowNull: false
        },

        audience_filters: {
            type: D.JSON,
            allowNull: false
        },

        audience_count: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        simulated_sent: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        simulated_failed: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        status: {
            type: D.ENUM(
                'DRAFT',
                'SIMULATED'
            ),
            defaultValue: 'DRAFT'
        },

        executed_at: D.DATE
    },
    {
        indexes: [
            {
                fields: ['institution_id', 'status']
            }
        ]
    }
);

EmailCampaign.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution'
});

EmailCampaign.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator'
});

module.exports = EmailCampaign;
