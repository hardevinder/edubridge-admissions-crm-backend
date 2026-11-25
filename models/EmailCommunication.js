const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    Lead,
    User
} = require('./index');

const EmailCommunication = sequelize.define(
    'email_communications',
    {
        id: {
            type: D.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },

        institution_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        lead_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        sent_by: D.INTEGER.UNSIGNED,

        recipient: {
            type: D.STRING(190),
            allowNull: false
        },

        subject: {
            type: D.STRING(255),
            allowNull: false
        },

        body: {
            type: D.TEXT,
            allowNull: false
        },

        type: {
            type: D.ENUM('AUTOMATIC', 'MANUAL'),
            defaultValue: 'MANUAL'
        },

        status: {
            type: D.ENUM(
                'PENDING',
                'DEMO',
                'SENT',
                'FAILED'
            ),
            defaultValue: 'PENDING'
        },

        message_id: D.STRING(255),
        error_message: D.TEXT,
        sent_at: D.DATE

    },
    {
        indexes: [
            {
                fields: ['institution_id', 'lead_id']
            },
            {
                fields: ['institution_id', 'status']
            }
        ]
    }
);

EmailCommunication.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution',
    onDelete: 'RESTRICT'
});

EmailCommunication.belongsTo(Lead, {
    foreignKey: 'lead_id',
    as: 'lead',
    onDelete: 'RESTRICT'
});

EmailCommunication.belongsTo(User, {
    foreignKey: 'sent_by',
    as: 'sender',
    onDelete: 'RESTRICT'
});

module.exports = EmailCommunication;
