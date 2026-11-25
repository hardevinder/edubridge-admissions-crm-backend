const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    User
} = require('./index');

const OutreachInstitution = sequelize.define(
    'outreach_institutions',
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

        assigned_to: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        created_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        name: {
            type: D.STRING(200),
            allowNull: false
        },

        organization_type: {
            type: D.ENUM(
                'SCHOOL',
                'COACHING_CENTRE',
                'COLLEGE',
                'TRAINING_INSTITUTE',
                'OTHER'
            ),
            defaultValue: 'SCHOOL',
            allowNull: false
        },

        city: D.STRING(100),

        district: D.STRING(100),

        state: D.STRING(100),

        address: D.TEXT,

        board: D.STRING(100),

        principal_name: D.STRING(150),

        contact_person: D.STRING(150),

        phone: D.STRING(30),

        email: D.STRING(200),

        website: D.STRING(255),

        class_12_strength: {
            type: D.INTEGER.UNSIGNED,
            defaultValue: 0
        },

        relationship_status: {
            type: D.ENUM(
                'NEW',
                'DEVELOPING',
                'ACTIVE',
                'STRONG',
                'INACTIVE'
            ),
            defaultValue: 'NEW',
            allowNull: false
        },

        priority: {
            type: D.ENUM('HIGH', 'MEDIUM', 'LOW'),
            defaultValue: 'MEDIUM'
        },

        notes: D.TEXT,

        is_active: {
            type: D.BOOLEAN,
            defaultValue: true
        }

    },
    {
        indexes: [
            {
                fields: ['institution_id', 'assigned_to']
            },
            {
                fields: ['institution_id', 'relationship_status']
            }
        ]
    }
);

OutreachInstitution.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution'
});

OutreachInstitution.belongsTo(User, {
    foreignKey: 'assigned_to',
    as: 'executive'
});

OutreachInstitution.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator'
});

module.exports = OutreachInstitution;
