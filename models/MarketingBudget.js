const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    AcademicSession,
    LeadSource,
    User
} = require('./index');

const MarketingBudget = sequelize.define(
    'marketing_budgets',
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

        allocated_budget: {
            type: D.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0
        },

        updated_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        notes: D.TEXT
    },
    {
        indexes: [
            {
                unique: true,
                name: 'idx_mkt_budget_inst_sess_src',
                fields: [
                    'institution_id',
                    'academic_session_id',
                    'lead_source_id'
                ]
            }
        ]
    }
);

MarketingBudget.belongsTo(Institution, {
    foreignKey: 'institution_id'
});

MarketingBudget.belongsTo(AcademicSession, {
    foreignKey: 'academic_session_id'
});

MarketingBudget.belongsTo(LeadSource, {
    foreignKey: 'lead_source_id',
    as: 'source'
});

MarketingBudget.belongsTo(User, {
    foreignKey: 'updated_by'
});

module.exports = MarketingBudget;
