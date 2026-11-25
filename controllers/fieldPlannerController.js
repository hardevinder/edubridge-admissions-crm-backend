const {
    sequelize,
    User,
    Role
} = require('../models');

const Plan = require('../models/FieldActivityPlan');

const TYPES = [
    'SCHOOL_VISIT',
    'COLLEGE_VISIT',
    'COACHING_VISIT',
    'PRINCIPAL_MEETING',
    'PRESENTATION',
    'EDUCATION_FAIR',
    'STUDENT_COUNSELLING',
    'FOLLOW_UP',
    'OTHER'
];

const today = () =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

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

function clean(value, max, required = false) {

    if (value == null || value === '') {

        if (required) fail('Required field missing');

        return null;
    }

    if (
        typeof value !== 'string' ||
        value.length > max
    ) {
        fail('Invalid text value');
    }

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

function validTime(value) {

    return typeof value === 'string' &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function countValue(value) {

    const number = Number(value || 0);

    if (
        !Number.isSafeInteger(number) ||
        number < 0 ||
        number > 10000
    ) {
        fail('Invalid enquiry count');
    }

    return number;
}

function scope(req) {

    return {

        institution_id: req.institutionId,

        ...(req.user.role === 'FIELD_EXECUTIVE'
            ? { executive_id: req.user.id }
            : {})

    };
}

async function verifyExecutive(req, id) {

    const executive = await User.findOne({

        where: {
            id,
            institution_id: req.institutionId,
            is_active: true
        },

        include: [{
            model: Role,
            as: 'role',
            where: {
                code: 'FIELD_EXECUTIVE'
            }
        }]
    });

    if (!executive) {
        fail('Invalid field executive');
    }

    return executive;
}

// GET FIELD EXECUTIVES

exports.executives = handle(async (req, res) => {

    const data = await User.findAll({

        where: {
            institution_id: req.institutionId,
            is_active: true,

            ...(req.user.role === 'FIELD_EXECUTIVE'
                ? { id: req.user.id }
                : {})
        },

        attributes: ['id', 'name'],

        include: [{
            model: Role,
            as: 'role',
            attributes: [],
            where: {
                code: 'FIELD_EXECUTIVE'
            }
        }],

        order: [['name', 'ASC']]
    });

    res.json({
        success: true,
        data
    });
});

// GET DAILY PLAN

exports.list = handle(async (req, res) => {

    const date = req.query.date || today();

    if (!validDate(date)) {
        fail('Invalid activity date');
    }

    const where = {
        ...scope(req),
        activity_date: date
    };

    if (
        req.query.executive_id &&
        req.user.role !== 'FIELD_EXECUTIVE'
    ) {

        const executive = await verifyExecutive(
            req,
            req.query.executive_id
        );

        where.executive_id = executive.id;
    }

    const plans = await Plan.findAll({

        where,

        include: [{
            model: User,
            as: 'executive',
            attributes: ['id', 'name']
        }],

        order: [
            ['start_time', 'ASC'],
            ['id', 'ASC']
        ]
    });

    const active = plans.filter(item =>
        !['CANCELLED', 'POSTPONED'].includes(item.status)
    );

    const completed = active.filter(
        item => item.status === 'COMPLETED'
    ).length;

    const expected = active.reduce(
        (sum, item) =>
            sum + Number(item.expected_enquiries || 0),
        0
    );

    const actual = active.reduce(
        (sum, item) =>
            sum + Number(item.actual_enquiries || 0),
        0
    );

    res.json({

        success: true,

        data: {

            date,

            summary: {

                total_planned: active.length,

                completed,

                in_progress: active.filter(
                    p => p.status === 'IN_PROGRESS'
                ).length,

                pending: active.filter(
                    p => p.status === 'PLANNED'
                ).length,

                postponed: plans.filter(
                    p => p.status === 'POSTPONED'
                ).length,

                cancelled: plans.filter(
                    p => p.status === 'CANCELLED'
                ).length,

                expected_enquiries: expected,

                actual_enquiries: actual,

                completion_rate: active.length
                    ? Math.round(
                        completed / active.length * 100
                    )
                    : 0,

                target_achievement: expected
                    ? Math.round(
                        actual / expected * 100
                    )
                    : 0
            },

            plans
        }
    });
});

// CREATE ACTIVITY

exports.create = handle(async (req, res) => {

    const body = req.body || {};

    if (
        !validDate(body.activity_date) ||
        body.activity_date < today()
    ) {
        fail('Select today or a future date');
    }

    if (!validTime(body.start_time)) {
        fail('Invalid start time');
    }

    if (
        body.end_time &&
        (
            !validTime(body.end_time) ||
            body.end_time <= body.start_time
        )
    ) {
        fail('End time must be after start time');
    }

    if (!TYPES.includes(body.activity_type)) {
        fail('Invalid activity type');
    }

    const executiveId =
        req.user.role === 'FIELD_EXECUTIVE'
            ? req.user.id
            : body.executive_id;

    if (!executiveId) {
        fail('Select field executive');
    }

    const executive = await verifyExecutive(
        req,
        executiveId
    );

    const plan = await Plan.create({

        institution_id: req.institutionId,

        executive_id: executive.id,

        created_by: req.user.id,

        activity_date: body.activity_date,

        start_time: body.start_time,

        end_time: body.end_time || null,

        activity_type: body.activity_type,

        organization_name:
            clean(body.organization_name, 200, true),

        city: clean(body.city, 100),

        address: clean(body.address, 2000),

        contact_person:
            clean(body.contact_person, 150),

        contact_phone:
            clean(body.contact_phone, 30),

        expected_enquiries:
            countValue(body.expected_enquiries),

        objective: clean(body.objective, 5000),

        status: 'PLANNED'
    });

    res.status(201).json({
        success: true,
        message: 'Activity planned successfully',
        data: plan
    });
});

// UPDATE ACTIVITY STATUS

exports.updateStatus = handle(async (req, res) => {

    const body = req.body || {};

    const transitions = {

        PLANNED: [
            'IN_PROGRESS',
            'COMPLETED',
            'POSTPONED',
            'CANCELLED'
        ],

        IN_PROGRESS: [
            'COMPLETED',
            'POSTPONED',
            'CANCELLED'
        ],

        COMPLETED: [],

        POSTPONED: [],

        CANCELLED: []
    };

    const updated = await sequelize.transaction(
        async transaction => {

            const plan = await Plan.findOne({

                where: {
                    ...scope(req),
                    id: req.params.id
                },

                transaction,

                lock: transaction.LOCK.UPDATE
            });

            if (!plan) {
                fail('Activity not found', 404);
            }

            if (
                !transitions[plan.status]
                    ?.includes(body.status)
            ) {
                fail('Invalid activity status change', 409);
            }

            const update = {
                status: body.status
            };

            if (
                ['IN_PROGRESS', 'COMPLETED']
                    .includes(body.status) &&
                plan.activity_date > today()
            ) {
                fail('Future activity cannot be started');
            }

            if (body.status === 'IN_PROGRESS') {

                update.started_at = new Date();
            }

            if (body.status === 'COMPLETED') {

                update.actual_enquiries =
                    countValue(body.actual_enquiries);

                update.completion_remarks =
                    clean(
                        body.completion_remarks,
                        5000,
                        true
                    );

                update.completed_at = new Date();
            }

            if (
                ['POSTPONED', 'CANCELLED']
                    .includes(body.status)
            ) {

                update.completion_remarks =
                    clean(
                        body.completion_remarks,
                        5000,
                        true
                    );
            }

            await plan.update(update, {
                transaction
            });

            return plan;
        }
    );

    res.json({

        success: true,

        message: 'Activity updated successfully',

        data: updated
    });
});

// EDIT OR RESCHEDULE FIELD ACTIVITY

exports.update = handle(async (req, res) => {

    const body = req.body || {};

    const updated = await sequelize.transaction(
        async transaction => {

            const plan = await Plan.findOne({

                where: {
                    ...scope(req),
                    id: req.params.id
                },

                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!plan) {
                fail('Activity not found', 404);
            }

            if (
                ['COMPLETED', 'CANCELLED']
                    .includes(plan.status)
            ) {
                fail(
                    'Completed or cancelled activities cannot be edited',
                    409
                );
            }

            const update = {};

            const textFields = {

                organization_name: [200, true],
                city: [100, false],
                address: [2000, false],
                contact_person: [150, false],
                contact_phone: [30, false],
                objective: [5000, false]

            };

            const limitedFields = [
                'address',
                'contact_person',
                'contact_phone',
                'objective'
            ];

            for (
                const [field, settings]
                of Object.entries(textFields)
            ) {

                if (!Object.hasOwn(body, field)) {
                    continue;
                }

                if (
                    plan.status === 'IN_PROGRESS' &&
                    !limitedFields.includes(field)
                ) {
                    continue;
                }

                update[field] = clean(
                    body[field],
                    settings[0],
                    settings[1]
                );
            }

            // Preserve internal demo seeder marker
            const marker =
                '[SYNTHETIC_FIELD_PLANNER_V1]';

            if (
                plan.objective?.includes(marker) &&
                Object.hasOwn(update, 'objective') &&
                !update.objective?.includes(marker)
            ) {
                update.objective =
                    `${update.objective || ''}\n\n${marker}`;
            }

            if (plan.status !== 'IN_PROGRESS') {

                const date =
                    body.activity_date ??
                    plan.activity_date;

                const start =
                    body.start_time ??
                    String(plan.start_time).slice(0, 5);

                const end = Object.hasOwn(body, 'end_time')
                    ? body.end_time
                    : plan.end_time
                        ? String(plan.end_time).slice(0, 5)
                        : null;

                if (
                    !validDate(date) ||
                    date < today()
                ) {
                    fail('Select today or a future date');
                }

                if (!validTime(start)) {
                    fail('Invalid start time');
                }

                if (
                    end &&
                    (
                        !validTime(end) ||
                        end <= start
                    )
                ) {
                    fail('End time must be after start time');
                }

                update.activity_date = date;
                update.start_time = start;
                update.end_time = end || null;

                if (Object.hasOwn(body, 'activity_type')) {

                    if (!TYPES.includes(body.activity_type)) {
                        fail('Invalid activity type');
                    }

                    update.activity_type =
                        body.activity_type;
                }

                if (
                    Object.hasOwn(
                        body,
                        'expected_enquiries'
                    )
                ) {
                    update.expected_enquiries =
                        countValue(body.expected_enquiries);
                }

                // Only Field Manager can reassign activity

                if (
                    req.user.role === 'FIELD_MANAGER' &&
                    body.executive_id
                ) {

                    const executive =
                        await verifyExecutive(
                            req,
                            body.executive_id
                        );

                    update.executive_id = executive.id;
                }

                // Reactivate postponed activity

                if (plan.status === 'POSTPONED') {

                    update.status = 'PLANNED';
                    update.started_at = null;
                    update.completed_at = null;
                    update.actual_enquiries = 0;
                    update.completion_remarks = null;
                }
            }

            await plan.update(update, {
                transaction
            });

            return plan;
        }
    );

    res.json({

        success: true,

        message: 'Activity updated successfully',

        data: updated
    });
});
