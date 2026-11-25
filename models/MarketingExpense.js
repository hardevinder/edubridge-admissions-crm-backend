const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    AcademicSession,
    LeadSource,
    User
} = require('./index');

const MarketingExpense = sequelize.define(
    'marketing_expenses',
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

        academic_session_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        lead_source_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        created_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        expense_date: {
            type: D.DATEONLY,
            allowNull: false
        },

        category: {
            type: D.ENUM(
                'DIGITAL_ADVERTISING',
                'TRAVEL',
                'PRINTING',
                'SEMINAR',
                'EDUCATION_FAIR',
                'NEWSPAPER',
                'PROMOTIONAL_EVENT',
                'AGENCY_FEE',
                'OTHER'
            ),
            allowNull: false
        },

        title: {
            type: D.STRING(200),
            allowNull: false
        },

        amount: {
            type: D.DECIMAL(14, 2),
            allowNull: false
        },

        vendor: D.STRING(200),

        reference_number: D.STRING(100),

        remarks: D.TEXT

    },
    {
        indexes: [
            {
                name: 'idx_mkt_exp_inst_session_source',
                fields: [
                    'institution_id',
                    'academic_session_id',
                    'lead_source_id'
                ]
            },
            {
                fields: [
                    'institution_id',
                    'expense_date'
                ]
            }
        ]
    }
);

MarketingExpense.belongsTo(Institution, {
    foreignKey: 'institution_id'
});

MarketingExpense.belongsTo(AcademicSession, {
    foreignKey: 'academic_session_id'
});

MarketingExpense.belongsTo(LeadSource, {
    foreignKey: 'lead_source_id',
    as: 'source'
});

MarketingExpense.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator'
});

module.exports = MarketingExpense;
