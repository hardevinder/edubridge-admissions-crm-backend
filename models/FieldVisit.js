const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    User,
    Branch
} = require('./index');

const FieldVisit = sequelize.define('field_visits', {

    id: {
        type: D.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },

    institution_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    branch_id: D.INTEGER.UNSIGNED,

    executive_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    organization_name: {
        type: D.STRING(200),
        allowNull: false
    },

    organization_type: {
        type: D.ENUM(
            'SCHOOL',
            'COLLEGE',
            'COACHING_CENTRE',
            'EDUCATION_FAIR',
            'OTHER'
        ),
        allowNull: false
    },

    city: D.STRING(100),
    contact_person: D.STRING(150),
    contact_phone: D.STRING(30),

    visit_date: {
        type: D.DATEONLY,
        allowNull: false
    },

    students_interacted: {
        type: D.INTEGER.UNSIGNED,
        defaultValue: 0
    },

    outcome: {
        type: D.ENUM(
            'POSITIVE',
            'FOLLOWUP_REQUIRED',
            'NOT_INTERESTED',
            'COMPLETED'
        ),
        defaultValue: 'COMPLETED'
    },

    next_visit_date: D.DATEONLY,
    remarks: D.TEXT

}, {
    indexes: [
        {
            fields: ['institution_id', 'executive_id']
        },
        {
            fields: ['institution_id', 'visit_date']
        }
    ]
});

FieldVisit.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution',
    onDelete: 'RESTRICT'
});

FieldVisit.belongsTo(Branch, {
    foreignKey: 'branch_id',
    as: 'branch',
    onDelete: 'RESTRICT'
});

FieldVisit.belongsTo(User, {
    foreignKey: 'executive_id',
    as: 'executive',
    onDelete: 'RESTRICT'
});

module.exports = FieldVisit;
