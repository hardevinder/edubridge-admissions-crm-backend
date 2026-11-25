const { Op, fn, col } = require('sequelize');

const {
    sequelize,
    User,
    Role
} = require('../models');

const Organization = require('../models/OutreachInstitution');
const Interaction = require('../models/OutreachInteraction');
const Plan = require('../models/FieldActivityPlan');

const TYPES = [
    'SCHOOL',
    'COACHING_CENTRE',
    'COLLEGE',
    'TRAINING_INSTITUTE',
    'OTHER'
];

const RELATIONSHIPS = [
    'NEW',
    'DEVELOPING',
    'ACTIVE',
    'STRONG',
    'INACTIVE'
];

const INTERACTION_TYPES = [
    'SCHOOL_VISIT',
    'PRINCIPAL_MEETING',
    'PHONE_CALL',
    'PRESENTATION',
    'SEMINAR',
    'EMAIL',
    'FOLLOW_UP',
    'OTHER'
];

const PHYSICAL_VISITS = [
    'SCHOOL_VISIT',
    'PRINCIPAL_MEETING',
    'PRESENTATION',
    'SEMINAR'
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

function today() {

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
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

function text(value, max, required = false) {

    if (value == null || value === '') {

        if (required) fail('Required field missing');

        return null;
    }

    if (
        typeof value !== 'string' ||
        value.length > max
    ) fail('Invalid text value');

    const result = value.trim();

    if (required && !result) {
        fail('Required field missing');
    }

    return result || null;
}

function count(value) {

    const n = Number(value || 0);

    if (
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n > 100000
    ) fail('Invalid quantity');

    return n;
}

function scope(req) {

    return {

        institution_id: req.institutionId,

        ...(req.user.role === 'FIELD_EXECUTIVE'
            ? { assigned_to: req.user.id }
            : {})
    };
}

async function verifyExecutive(req, id) {

    const user = await User.findOne({

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

    if (!user) fail('Invalid field executive');

    return user;
}

function organizationFields(body, current = {}) {

    const value = key =>
        Object.hasOwn(body, key)
            ? body[key]
            : current[key];

    const organization_type =
        value('organization_type') || 'SCHOOL';

    const relationship_status =
        value('relationship_status') || 'NEW';

    const priority = value('priority') || 'MEDIUM';

    if (!TYPES.includes(organization_type)) {
        fail('Invalid organization type');
    }

    if (!RELATIONSHIPS.includes(relationship_status)) {
        fail('Invalid relationship status');
    }

    if (!['HIGH', 'MEDIUM', 'LOW'].includes(priority)) {
        fail('Invalid priority');
    }

    return {

        name: text(value('name'), 200, true),

        organization_type,

        city: text(value('city'), 100),

        district: text(value('district'), 100),

        state: text(value('state'), 100),

        address: text(value('address'), 2000),

        board: text(value('board'), 100),

        principal_name: text(value('principal_name'), 150),

        contact_person: text(value('contact_person'), 150),

        phone: text(value('phone'), 30),

        email: text(value('email'), 200),

        website: text(value('website'), 255),

        class_12_strength:
            count(value('class_12_strength')),

        relationship_status,

        priority,

        notes: text(value('notes'), 5000)
    };
}

// GET OPTIONS

exports.options = handle(async (req, res) => {

    const executives = await User.findAll({

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
        data: {
            executives,
            types: TYPES,
            relationships: RELATIONSHIPS,
            interaction_types: INTERACTION_TYPES
        }
    });
});

// LIST DIRECTORY AND PERFORMANCE

exports.list = handle(async (req, res) => {

    const where = {
        ...scope(req),
        is_active: true
    };

    const organizations = await Organization.findAll({

        where,

        include: [{
            model: User,
            as: 'executive',
            attributes: ['id', 'name']
        }],

        order: [['name', 'ASC']]
    });

    const ids = organizations.map(item => item.id);

    const history = ids.length
        ? await Interaction.findAll({

            where: {

                institution_id: req.institutionId,

                outreach_institution_id: {
                    [Op.in]: ids
                }
            },

            attributes: [
                'outreach_institution_id',
                'interaction_type',
                'interaction_date',
                'reported_enquiries',
                'next_visit_date'
            ],

            order: [
                ['interaction_date', 'DESC'],
                ['id', 'DESC']
            ],

            raw: true

        })
        : [];

    const historyMap = new Map();

    for (const item of history) {

        const id = Number(item.outreach_institution_id);

        if (!historyMap.has(id)) {
            historyMap.set(id, []);
        }

        historyMap.get(id).push(item);
    }

    const rows = organizations.map(item => {

        const visits = historyMap.get(Number(item.id)) || [];

        const physical = visits.filter(v =>
            PHYSICAL_VISITS.includes(v.interaction_type)
        );

        const nextVisit = visits[0]?.next_visit_date || null;

        return {

            ...item.toJSON(),

            total_interactions: visits.length,

            total_visits: physical.length,

            reported_enquiries: visits.reduce(
                (sum, v) =>
                    sum + Number(v.reported_enquiries || 0),
                0
            ),

            last_visit: physical[0]?.interaction_date || null,

            next_visit_date: nextVisit
        };
    });

    const cutoff = new Date(
        Date.now() - 30 * 86400000
    ).toISOString().slice(0, 10);

    const summary = {

        total: rows.length,

        schools: rows.filter(
            r => r.organization_type === 'SCHOOL'
        ).length,

        coaching_centres: rows.filter(
            r => r.organization_type === 'COACHING_CENTRE'
        ).length,

        active_relationships: rows.filter(r =>
            ['ACTIVE', 'STRONG'].includes(r.relationship_status)
        ).length,

        strong_relationships: rows.filter(
            r => r.relationship_status === 'STRONG'
        ).length,

        total_visits: rows.reduce(
            (sum, r) => sum + r.total_visits, 0
        ),

        reported_enquiries: rows.reduce(
            (sum, r) => sum + r.reported_enquiries, 0
        ),

        needs_visit: rows.filter(r =>
            !r.last_visit || r.last_visit < cutoff
        ).length,

        upcoming_visits: rows.filter(r =>
            r.next_visit_date &&
            r.next_visit_date >= today()
        ).length
    };

    res.json({
        success: true,
        data: {
            summary,
            organizations: rows
        }
    });
});

// CREATE INSTITUTION

exports.create = handle(async (req, res) => {

    const body = req.body || {};

    const assignedId =
        req.user.role === 'FIELD_EXECUTIVE'
            ? req.user.id
            : body.assigned_to;

    const executive = await verifyExecutive(req, assignedId);

    const item = await Organization.create({

        ...organizationFields(body),

        institution_id: req.institutionId,

        assigned_to: executive.id,

        created_by: req.user.id
    });

    res.status(201).json({
        success: true,
        message: 'Institution registered successfully',
        data: item
    });
});

// GET INSTITUTION PROFILE

exports.detail = handle(async (req, res) => {

    const organization = await Organization.findOne({

        where: {
            ...scope(req),
            id: req.params.id,
            is_active: true
        },

        include: [{
            model: User,
            as: 'executive',
            attributes: ['id', 'name']
        }]
    });

    if (!organization) fail('Institution not found', 404);

    const interactions = await Interaction.findAll({

        where: {

            institution_id: req.institutionId,

            outreach_institution_id: organization.id
        },

        include: [{
            model: User,
            as: 'executive',
            attributes: ['id', 'name']
        }],

        order: [
            ['interaction_date', 'DESC'],
            ['id', 'DESC']
        ]
    });

    res.json({
        success: true,
        data: {
            organization,
            interactions
        }
    });
});

// UPDATE INSTITUTION

exports.update = handle(async (req, res) => {

    const body = req.body || {};

    await sequelize.transaction(async transaction => {

        const item = await Organization.findOne({

            where: {
                ...scope(req),
                id: req.params.id,
                is_active: true
            },

            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!item) fail('Institution not found', 404);

        const fields = organizationFields(
            body,
            item.toJSON()
        );

        if (
            req.user.role === 'FIELD_MANAGER' &&
            body.assigned_to
        ) {

            const executive = await verifyExecutive(
                req,
                body.assigned_to
            );

            fields.assigned_to = executive.id;
        }

        await item.update(fields, { transaction });
    });

    res.json({
        success: true,
        message: 'Institution updated successfully'
    });
});

// RECORD MEETING OR INTERACTION

exports.interact = handle(async (req, res) => {

    const body = req.body || {};

    const item = await Organization.findOne({

        where: {
            ...scope(req),
            id: req.params.id,
            is_active: true
        }
    });

    if (!item) fail('Institution not found', 404);

    if (!INTERACTION_TYPES.includes(body.interaction_type)) {
        fail('Invalid interaction type');
    }

    if (
        !validDate(body.interaction_date) ||
        body.interaction_date > today()
    ) fail('Select a valid past or current interaction date');

    if (
        body.next_visit_date &&
        (
            !validDate(body.next_visit_date) ||
            body.next_visit_date < body.interaction_date
        )
    ) fail('Invalid next visit date');

    const record = await Interaction.create({

        institution_id: req.institutionId,

        outreach_institution_id: item.id,

        executive_id: req.user.id,

        interaction_date: body.interaction_date,

        interaction_type: body.interaction_type,

        meeting_with: text(body.meeting_with, 150),

        outcome: text(body.outcome, 5000, true),

        reported_enquiries: count(body.reported_enquiries),

        next_visit_date: body.next_visit_date || null
    });

    res.status(201).json({

        success: true,

        message: 'Interaction recorded successfully',

        data: record
    });
});

// INTEGRATION WITH DAILY ACTIVITY PLANNER

exports.planVisit = handle(async (req, res) => {

    const body = req.body || {};

    const item = await Organization.findOne({

        where: {
            ...scope(req),
            id: req.params.id,
            is_active: true
        }
    });

    if (!item) fail('Institution not found', 404);

    if (
        !validDate(body.activity_date) ||
        body.activity_date < today()
    ) fail('Select today or a future date');

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!timePattern.test(body.start_time || '')) {
        fail('Invalid start time');
    }

    if (
        body.end_time &&
        (
            !timePattern.test(body.end_time) ||
            body.end_time <= body.start_time
        )
    ) fail('Invalid end time');

    const activityTypes = {

        SCHOOL: 'SCHOOL_VISIT',

        COACHING_CENTRE: 'COACHING_VISIT',

        COLLEGE: 'COLLEGE_VISIT',

        TRAINING_INSTITUTE: 'OTHER',

        OTHER: 'OTHER'
    };

    const executive = await verifyExecutive(req, item.assigned_to);

    const plan = await Plan.create({

        institution_id: req.institutionId,

        executive_id: executive.id,

        created_by: req.user.id,

        activity_date: body.activity_date,

        start_time: body.start_time,

        end_time: body.end_time || null,

        activity_type:
            activityTypes[item.organization_type],

        organization_name: item.name,

        city: item.city,

        address: item.address,

        contact_person:
            item.contact_person || item.principal_name,

        contact_phone: item.phone,

        expected_enquiries:
            count(body.expected_enquiries),

        objective:
            text(body.objective, 5000),

        status: 'PLANNED'
    });

    res.status(201).json({

        success: true,

        message: 'Visit added to Daily Activity Planner',

        data: plan
    });
});
