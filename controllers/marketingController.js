const {
    AcademicSession,
    LeadSource,
    sequelize
} = require('../models');

const Budget = require('../models/MarketingBudget');
const Expense = require('../models/MarketingExpense');

const {
    buildMarketingSnapshot
} = require('../services/marketingIntelligenceService');

const CATEGORIES = [

    'DIGITAL_ADVERTISING',
    'TRAVEL',
    'PRINTING',
    'SEMINAR',
    'EDUCATION_FAIR',
    'NEWSPAPER',
    'PROMOTIONAL_EVENT',
    'AGENCY_FEE',
    'OTHER'
];

function fail(message, status = 400) {

    const error = new Error(message);
    error.status = status;
    throw error;
}

const handle = fn => async (req, res, next) => {

    try {

        await fn(req, res);

    } catch (error) {

        if ([400, 403, 404, 409].includes(error.status)) {

            return res.status(error.status).json({

                success: false,

                message: error.message
            });
        }

        next(error);
    }
};

function amount(value, allowZero = false) {

    const n = Number(value);

    if (
        value === '' ||
        value == null ||
        !Number.isFinite(n) ||
        n < 0 ||
        (!allowZero && n === 0) ||
        n > 1000000000
    ) fail('Invalid amount');

    return Math.round(n * 100) / 100;
}

function text(value, max, required = false) {

    if (value == null || value === '') {

        if (required) fail('Required field missing');

        return null;
    }

    if (
        typeof value !== 'string' ||
        value.length > max
    ) fail('Invalid text field');

    const result = value.trim();

    if (required && !result) {
        fail('Required field missing');
    }

    return result || null;
}

function validDate(value) {

    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) return false;

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function today() {

    return new Intl.DateTimeFormat('en-CA', {

        timeZone: 'Asia/Kolkata',

        year: 'numeric',

        month: '2-digit',

        day: '2-digit'

    }).format(new Date());
}

async function getSession(req, id) {

    const sessions = await AcademicSession.findAll({

        where: {

            institution_id: req.institutionId
        },

        order: [['id', 'DESC']]
    });

    const session = id

        ? sessions.find(
            item => Number(item.id) === Number(id)
        )

        : sessions.find(
            item => item.is_active
        ) || sessions[0];

    if (!session) {
        fail('Academic session not found', 404);
    }

    return session;
}

async function getSource(req, id) {

    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) {
        fail('Invalid lead source');
    }

    const source = await LeadSource.findOne({

        where: {

            id,

            institution_id: req.institutionId
        }
    });

    if (!source) fail('Lead source not found', 404);

    return source;
}

// GET MASTER DATA

exports.options = handle(async (req, res) => {

    const where = {

        institution_id: req.institutionId
    };

    const [sessions, sources] = await Promise.all([

        AcademicSession.findAll({

            where,

            order: [['id', 'DESC']]
        }),

        LeadSource.findAll({

            where,

            order: [['name', 'ASC']]
        })

    ]);

    res.json({

        success: true,

        data: {

            sessions,

            sources,

            categories: CATEGORIES
        }
    });
});

// MARKETING DASHBOARD

exports.dashboard = handle(async (req, res) => {

    const session = await getSession(
        req,
        req.query.session_id
    );

    const snapshot = await buildMarketingSnapshot(

        req.institutionId,

        session.id
    );

    const expenses = await Expense.findAll({

        where: {

            institution_id: req.institutionId,

            academic_session_id: session.id
        },

        include: [{

            model: LeadSource,

            as: 'source',

            attributes: ['id', 'name']
        }],

        order: [

            ['expense_date', 'DESC'],

            ['id', 'DESC']
        ],

        limit: 200
    });

    res.json({

        success: true,

        data: {

            session,

            ...snapshot,

            expenses
        }
    });
});

// CREATE OR UPDATE BUDGET

exports.saveBudget = handle(async (req, res) => {

    const body = req.body || {};

    const session = await getSession(
        req,
        body.academic_session_id
    );

    const source = await getSource(
        req,
        body.lead_source_id
    );

    await Budget.upsert({

        institution_id: req.institutionId,

        academic_session_id: session.id,

        lead_source_id: source.id,

        allocated_budget:
            amount(body.allocated_budget, true),

        updated_by: req.user.id,

        notes: text(body.notes, 5000)
    });

    res.json({

        success: true,

        message: 'Marketing budget saved successfully'
    });
});

function expenseFields(body) {

    if (!CATEGORIES.includes(body.category)) {
        fail('Invalid expense category');
    }

    if (
        !validDate(body.expense_date) ||
        body.expense_date > today()
    ) fail('Invalid expense date');

    return {

        expense_date: body.expense_date,

        category: body.category,

        title: text(body.title, 200, true),

        amount: amount(body.amount),

        vendor: text(body.vendor, 200),

        reference_number:
            text(body.reference_number, 100),

        remarks: text(body.remarks, 5000)
    };
}

// RECORD MARKETING EXPENSE

exports.createExpense = handle(async (req, res) => {

    const body = req.body || {};

    const session = await getSession(
        req,
        body.academic_session_id
    );

    const source = await getSource(
        req,
        body.lead_source_id
    );

    const expense = await Expense.create({

        ...expenseFields(body),

        institution_id: req.institutionId,

        academic_session_id: session.id,

        lead_source_id: source.id,

        created_by: req.user.id
    });

    res.status(201).json({

        success: true,

        message: 'Marketing expense recorded',

        data: expense
    });
});

// EDIT EXISTING EXPENSE

exports.updateExpense = handle(async (req, res) => {

    const body = req.body || {};

    await sequelize.transaction(async transaction => {

        const expense = await Expense.findOne({

            where: {

                id: req.params.id,

                institution_id: req.institutionId
            },

            transaction,

            lock: transaction.LOCK.UPDATE
        });

        if (!expense) fail('Expense not found', 404);

        const source = await getSource(

            req,

            body.lead_source_id || expense.lead_source_id
        );

        await expense.update({

            ...expenseFields({

                ...expense.toJSON(),

                ...body
            }),

            lead_source_id: source.id

        }, { transaction });
    });

    res.json({

        success: true,

        message: 'Marketing expense updated successfully'
    });
});
