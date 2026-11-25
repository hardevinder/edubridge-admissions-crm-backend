const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    User
} = require('./index');

const FieldActivityPlan = sequelize.define(
    'field_activity_plans',
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

        executive_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        created_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        activity_date: {
            type: D.DATEONLY,
            allowNull: false
        },

        start_time: {
            type: D.TIME,
            allowNull: false
        },

        end_time: D.TIME,

        activity_type: {
            type: D.ENUM(
                'SCHOOL_VISIT',
                'COLLEGE_VISIT',
                'COACHING_VISIT',
                'PRINCIPAL_MEETING',
                'PRESENTATION',
                'EDUCATION_FAIR',
                'STUDENT_COUNSELLING',
                'FOLLOW_UP',
                'OTHER'
            ),
            allowNull: false
        },

        organization_name: {
            type: D.STRING(200),
            allowNull: false
        },

        city: D.STRING(100),
        address: D.TEXT,
        contact_person: D.STRING(150),
        contact_phone: D.STRING(30),

        expected_enquiries: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        actual_enquiries: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        status: {
            type: D.ENUM(
                'PLANNED',
                'IN_PROGRESS',
                'COMPLETED',
                'POSTPONED',
                'CANCELLED'
            ),
            defaultValue: 'PLANNED',
            allowNull: false
        },

        objective: D.TEXT,
        completion_remarks: D.TEXT,

        started_at: D.DATE,
        completed_at: D.DATE

    },
    {
        indexes: [
            {
                fields: [
                    'institution_id',
                    'activity_date'
                ]
            },
            {
                fields: [
                    'institution_id',
                    'executive_id',
                    'activity_date'
                ]
            }
        ]
    }
);

FieldActivityPlan.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution',
    onDelete: 'RESTRICT'
});

FieldActivityPlan.belongsTo(User, {
    foreignKey: 'executive_id',
    as: 'executive',
    onDelete: 'RESTRICT'
});

FieldActivityPlan.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator',
    onDelete: 'RESTRICT'
});

module.exports = FieldActivityPlan;
