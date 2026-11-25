const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    User
} = require('./index');

const OutreachInstitution = require('./OutreachInstitution');

const OutreachInteraction = sequelize.define(
    'outreach_interactions',
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

        outreach_institution_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        executive_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        interaction_date: {
            type: D.DATEONLY,
            allowNull: false
        },

        interaction_type: {
            type: D.ENUM(
                'SCHOOL_VISIT',
                'PRINCIPAL_MEETING',
                'PHONE_CALL',
                'PRESENTATION',
                'SEMINAR',
                'EMAIL',
                'FOLLOW_UP',
                'OTHER'
            ),
            allowNull: false
        },

        meeting_with: D.STRING(150),

        outcome: {
            type: D.TEXT,
            allowNull: false
        },

        reported_enquiries: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        next_visit_date: D.DATEONLY

    },
    {
        indexes: [
            {
                fields: [
                    'institution_id',
                    'outreach_institution_id',
                    'interaction_date'
                ]
            }
        ]
    }
);

OutreachInteraction.belongsTo(OutreachInstitution, {
    foreignKey: 'outreach_institution_id',
    as: 'organization'
});

OutreachInteraction.belongsTo(User, {
    foreignKey: 'executive_id',
    as: 'executive'
});

module.exports = OutreachInteraction;
