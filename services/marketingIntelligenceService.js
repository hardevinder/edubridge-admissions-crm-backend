const { fn, col } = require('sequelize');

const {
    Lead,
    LeadSource
} = require('../models');

const Budget = require('../models/MarketingBudget');
const Expense = require('../models/MarketingExpense');
const Target = require('../models/AdmissionTarget');

const round = value =>
    Math.round(value * 100) / 100;

const divide = (a, b) =>
    b > 0 ? round(a / b) : null;

const percent = (a, b) =>
    b > 0 ? round(a / b * 100) : null;

const sum = (rows, key) =>
    rows.reduce(
        (total, item) =>
            total + Number(item[key] || 0),
        0
    );

async function buildMarketingSnapshot(
    institutionId,
    sessionId
) {

    const sessionField = [
        'academic_session_id',
        'session_id'
    ].find(field => Lead.rawAttributes[field]);

    const sourceField = [
        'lead_source_id',
        'source_id'
    ].find(field => Lead.rawAttributes[field]);

    if (!sessionField || !sourceField) {

        throw new Error(
            'Lead session or source field not found'
        );
    }

    const where = {

        institution_id: institutionId,

        academic_session_id: sessionId
    };

    const [
        sources,
        budgets,
        expenses,
        leads,
        targets
    ] = await Promise.all([

        LeadSource.findAll({

            where: {
                institution_id: institutionId
            },

            order: [['name', 'ASC']]
        }),

        Budget.findAll({ where }),

        Expense.findAll({

            where,

            attributes: [

                'lead_source_id',

                [
                    fn('SUM', col('amount')),
                    'total'
                ]
            ],

            group: ['lead_source_id'],

            raw: true
        }),

        Lead.findAll({

            where: {

                institution_id: institutionId,

                [sessionField]: sessionId
            },

            attributes: [

                sourceField,

                'program_id',

                'status',

                [fn('COUNT', col('id')), 'count']
            ],

            group: [
                sourceField,
                'program_id',
                'status'
            ],

            raw: true
        }),

        Target.findAll({ where })

    ]);

    const budgetMap = new Map(
        budgets.map(item => [
            Number(item.lead_source_id),
            Number(item.allocated_budget)
        ])
    );

    const expenseMap = new Map(
        expenses.map(item => [
            Number(item.lead_source_id),
            Number(item.total)
        ])
    );

    const feeMap = new Map(
        targets.map(item => [
            Number(item.program_id),
            Number(item.annual_fee)
        ])
    );

    const leadMap = new Map();

    let unassignedEnquiries = 0;

    for (const item of leads) {

        const id = Number(item[sourceField]);

        const count = Number(item.count);

        if (!id) {

            unassignedEnquiries += count;

            continue;
        }

        if (!leadMap.has(id)) {

            leadMap.set(id, {

                enquiries: 0,

                admitted: 0,

                projected_revenue: 0,

                admissions_without_fee: 0
            });
        }

        const entry = leadMap.get(id);

        entry.enquiries += count;

        if (item.status === 'ADMITTED') {

            entry.admitted += count;

            const programId = Number(item.program_id);

            if (feeMap.has(programId)) {

                entry.projected_revenue +=
                    count * feeMap.get(programId);

            } else {

                entry.admissions_without_fee += count;
            }
        }
    }

    const rows = sources.map(source => {

        const id = Number(source.id);

        const budget = budgetMap.get(id) || 0;

        const spent = expenseMap.get(id) || 0;

        const performance = leadMap.get(id) || {};

        const enquiries = performance.enquiries || 0;

        const admitted = performance.admitted || 0;

        const projected = performance.projected_revenue || 0;

        let status = 'ACTIVE';

        if (spent > 0 && budget === 0) {

            status = 'BUDGET_NOT_SET';

        } else if (spent > budget) {

            status = 'OVER_BUDGET';

        } else if (budget > 0 && spent / budget >= 0.9) {

            status = 'BUDGET_WARNING';

        } else if (spent > 0 && admitted === 0) {

            status = 'NO_ADMISSIONS';
        }

        return {

            source_id: id,

            source: source.name,

            budget,

            spent,

            remaining_budget: round(budget - spent),

            enquiries,

            admitted,

            conversion_rate:
                percent(admitted, enquiries),

            cost_per_enquiry:
                divide(spent, enquiries),

            cost_per_admission:
                divide(spent, admitted),

            budget_utilization:
                percent(spent, budget),

            projected_revenue: projected,

            admissions_without_fee:
                performance.admissions_without_fee || 0,

            revenue_to_spend_ratio:
                divide(projected, spent),

            status
        };
    });

    const budget = sum(rows, 'budget');

    const spent = sum(rows, 'spent');

    const enquiries = sum(rows, 'enquiries');

    const admitted = sum(rows, 'admitted');

    const revenue = sum(rows, 'projected_revenue');

    // Avoid comparing sources with tiny samples
    // or sources for which no expenses were recorded.

    const comparable = rows.filter(
        item =>
            item.spent > 0 &&
            item.admitted >= 5
    );

    const bestSource = [...comparable].sort(
        (a, b) =>
            a.cost_per_admission -
            b.cost_per_admission
    )[0] || null;

    return {

        summary: {

            total_budget: budget,

            total_spent: spent,

            remaining_budget: round(budget - spent),

            budget_utilization: percent(spent, budget),

            enquiries,

            admitted,

            unassigned_enquiries: unassignedEnquiries,

            conversion_rate: percent(admitted, enquiries),

            cost_per_enquiry: divide(spent, enquiries),

            cost_per_admission: divide(spent, admitted),

            projected_revenue: revenue,

            admissions_without_fee:
                sum(rows, 'admissions_without_fee'),

            revenue_to_spend_ratio:
                divide(revenue, spent),

            best_source: bestSource?.source || null
        },

        sources: rows,

        alerts: rows.filter(
            item => item.status !== 'ACTIVE'
        ),

        limitations: {

            attribution: 'Existing lead source',

            revenue: 'Projected annual tuition, not collected fees',

            expense_coverage: 'Recorded marketing expenses only',

            actual_financial_roi_available: false,

            minimum_admissions_for_source_comparison: 5
        }
    };
}

module.exports = { buildMarketingSnapshot };
