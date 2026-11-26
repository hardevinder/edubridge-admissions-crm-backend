const { Op } = require('sequelize');

const {
    sequelize,
    Lead,
    LeadFollowup,
    LeadStatusHistory,
    User,
    Role,
    Branch,
    Program,
    AcademicSession,
    LeadSource
} = require('../models');

const STATUSES = [
    'NEW',
    'CONTACTED',
    'INTERESTED',
    'CAMPUS_VISIT',
    'APPLICATION',
    'ADMITTED',
    'NOT_INTERESTED',
    'LOST'
];

const PRIORITIES = ['HOT', 'WARM', 'COLD'];

const FOLLOWUP_TYPES = [
    'CALL', 'WHATSAPP', 'EMAIL',
    'MEETING', 'CAMPUS_VISIT', 'OTHER'
];

const MANAGEMENT = ['DIRECTOR', 'ADMISSION_HEAD'];

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function isManager(req) {
    return MANAGEMENT.includes(req.user.role);
}

function scope(req) {
    const where = {
        institution_id: req.institutionId
    };

    if (req.user.role === 'COUNSELLOR') {
        where.assigned_to = req.user.id;
    }

    if (req.user.role === 'FIELD_EXECUTIVE') {
        where.created_by = req.user.id;
    }

    return where;
}

const includes = [
    { model: Program, as: 'program', attributes: ['id', 'name', 'code'] },
    { model: Branch, as: 'branch', attributes: ['id', 'name'] },
    { model: AcademicSession, as: 'session', attributes: ['id', 'name'] },
    { model: LeadSource, as: 'source', attributes: ['id', 'name'] },
    { model: User, as: 'counsellor', attributes: ['id', 'name'] },
    { model: User, as: 'creator', attributes: ['id', 'name'] }
];

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

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: error.errors.map(e => e.message).join(', ')
            });
        }

        next(error);
    }
};

function text(value, max, required = false) {
    if (value == null || value === '') {
        if (required) fail('Required text field missing');
        return null;
    }

    if (typeof value !== 'string') {
        fail('Invalid text value');
    }

    const result = value.trim();

    if ((required && !result) || result.length > max) {
        fail('Invalid text length');
    }

    return result || null;
}

function parseDate(value) {
    if (value == null || value === '') return null;

    if (typeof value !== 'string') fail('Invalid date');

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        fail('Invalid date');
    }

    return date;
}

async function validRef(
    Model, value, institutionId, label,
    transaction, extra = {}
) {
    if (value == null) return null;

    const id = Number(value);

    if (!Number.isSafeInteger(id) || id < 1) {
        fail(`Invalid ${label}`);
    }

    const record = await Model.findOne({
        where: {
            id,
            institution_id: institutionId,
            is_active: true,
            ...extra
        },
        transaction
    });

    if (!record) fail(`Invalid ${label}`);

    return record;
}

async function findLead(req, transaction) {
    const lead = await Lead.findOne({
        where: {
            ...scope(req),
            id: req.params.id
        },
        transaction,
        ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
    });

    if (!lead) fail('Lead not found', 404);

    return lead;
}

async function validCounsellor(id, institutionId, transaction) {
    const user = await User.findOne({
        where: {
            id,
            institution_id: institutionId,
            is_active: true
        },
        include: [{
            model: Role,
            as: 'role',
            where: { code: 'COUNSELLOR' },
            required: true
        }],
        transaction
    });

    if (!user) fail('Invalid counsellor');

    return user;
}

// GET ALL LEADS
exports.list = handle(async (req, res) => {

    const {
        search,
        status,
        priority,
        assigned_to,
        program_id
    } = req.query;

    const page = Math.max(
        1, Math.floor(Number(req.query.page) || 1)
    );

    const limit = Math.min(
        100,
        Math.max(1, Math.floor(Number(req.query.limit) || 20))
    );

    const where = scope(req);

    if (status) {
        if (!STATUSES.includes(status)) fail('Invalid status');
        where.status = status;
    }

    if (priority) {
        if (!PRIORITIES.includes(priority)) fail('Invalid priority');
        where.priority = priority;
    }

    if (assigned_to && isManager(req)) {
        where.assigned_to = Number(assigned_to);
    }

    if (program_id) where.program_id = Number(program_id);

    if (search) {
        const value = text(search, 150, true);

        where[Op.or] = [
            { full_name: { [Op.like]: `%${value}%` } },
            { phone: { [Op.like]: `%${value}%` } },
            { email: { [Op.like]: `%${value}%` } },
            { city: { [Op.like]: `%${value}%` } }
        ];
    }

    const result = await Lead.findAndCountAll({
        where,
        include: includes,
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
    });

    res.json({
        success: true,
        data: result.rows,
        pagination: {
            total: result.count,
            page,
            limit,
            totalPages: Math.ceil(result.count / limit)
        }
    });
});

// CREATE LEAD
exports.create = handle(async (req, res) => {

    const body = req.body || {};
    const institutionId = req.institutionId;

    const result = await sequelize.transaction(async transaction => {

        const fullName = text(body.full_name, 150, true);
        const phone = text(body.phone, 30, true);

        const session = await validRef(
            AcademicSession,
            body.academic_session_id,
            institutionId,
            'academic session',
            transaction
        );

        if (!session) fail('Academic session required');

        const branch = await validRef(
            Branch,
            isManager(req)
                ? (body.branch_id ?? req.user.branch_id)
                : req.user.branch_id,
            institutionId,
            'branch',
            transaction
        );

        const program = await validRef(
            Program,
            body.program_id,
            institutionId,
            'program',
            transaction
        );

        if (
            program?.branch_id &&
            branch?.id !== program.branch_id
        ) {
            fail('Program does not belong to selected branch');
        }

        const source = await validRef(
            LeadSource,
            body.source_id,
            institutionId,
            'lead source',
            transaction
        );

        let assignedTo = null;

        if (req.user.role === 'COUNSELLOR') {
            assignedTo = req.user.id;
        }

        if (isManager(req) && body.assigned_to != null) {
            const counsellor = await validCounsellor(
                body.assigned_to, institutionId, transaction
            );

            assignedTo = counsellor.id;
        }

        const priority = body.priority || 'WARM';

        if (!PRIORITIES.includes(priority)) {
            fail('Invalid priority');
        }

        const lead = await Lead.create({
            institution_id: institutionId,
            branch_id: branch?.id || null,
            academic_session_id: session.id,
            program_id: program?.id || null,
            source_id: source?.id || null,
            assigned_to: assignedTo,
            created_by: req.user.id,
            full_name: fullName,
            phone,
            alternate_phone: text(body.alternate_phone, 30),
            email: text(body.email, 190),
            parent_name: text(body.parent_name, 150),
            city: text(body.city, 100),
            state: text(body.state, 100),
            previous_school: text(body.previous_school, 200),
            qualification: text(body.qualification, 100),
            remarks: text(body.remarks, 5000),
            priority,
            status: 'NEW'
        }, { transaction });

        await LeadStatusHistory.create({
            institution_id: institutionId,
            lead_id: lead.id,
            changed_by: req.user.id,
            previous_status: null,
            new_status: 'NEW',
            remarks: 'Enquiry registered'
        }, { transaction });

        return lead;
    });

    let emailStatus = 'NOT_REQUESTED';

    if (result.email) {
        try {
            const communication = await require(
                '../services/emailService'
            ).sendConfirmation(result, req.user.id);

            emailStatus = communication?.status || 'SKIPPED';

        } catch (error) {
            emailStatus = 'FAILED';
            console.error('Confirmation email could not be processed');
        }
    }

    res.status(201).json({
        success: true,
        message: 'Lead created successfully',
        email_status: emailStatus,
        data: result
    });
});

// GET SINGLE LEAD
exports.getOne = handle(async (req, res) => {

    const lead = await Lead.findOne({
        where: {
            ...scope(req),
            id: req.params.id
        },
        include: includes
    });

    if (!lead) fail('Lead not found', 404);

    const followups = await LeadFollowup.findAll({
        where: {
            institution_id: req.institutionId,
            lead_id: lead.id
        },
        include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'name']
        }],
        order: [['contacted_at', 'DESC']]
    });

    const history = await LeadStatusHistory.findAll({
        where: {
            institution_id: req.institutionId,
            lead_id: lead.id
        },
        include: [{
            model: User,
            as: 'changedBy',
            attributes: ['id', 'name']
        }],
        order: [['createdAt', 'DESC']]
    });

    res.json({
        success: true,
        data: lead,
        followups,
        history
    });
});

// UPDATE PERSONAL DETAILS (does not change assignment or admission state)
exports.updateDetails = handle(async (req, res) => {
    const fields = {
        full_name: 150, phone: 30, alternate_phone: 30,
        email: 190, parent_name: 150, city: 100, state: 100,
        previous_school: 200, qualification: 100
    };
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !Object.keys(body).length || Object.keys(body).some(key =>
            !Object.prototype.hasOwnProperty.call(fields, key))) {
        fail('Invalid enquiry details');
    }
    function normalizePhone(value) {
        if (!value) return null;
        const compact = value.replace(/[\s()-]/g, '');
        if (!/^\+?[0-9]{7,15}$/.test(compact)) fail('Invalid mobile number');
        return /^\+91[6-9][0-9]{9}$/.test(compact) ? compact.slice(3)
            : /^0[6-9][0-9]{9}$/.test(compact) ? compact.slice(1) : compact;
    }
    const result = await sequelize.transaction(async transaction => {
        const lead = await findLead(req, transaction);
        const changes = {};
        for (const key of Object.keys(body)) {
            let value = text(body[key], fields[key], ['full_name', 'phone'].includes(key));
            if (['phone', 'alternate_phone'].includes(key)) value = normalizePhone(value);
            if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                fail('Invalid email address');
            }
            if (value !== lead.get(key)) changes[key] = value;
        }
        if (!Object.keys(changes).length) return lead;
        if (changes.phone) {
            const phone = changes.phone;
            const variants = /^[6-9][0-9]{9}$/.test(phone)
                ? [phone, `+91${phone}`, `0${phone}`, `91${phone}`] : [phone];
            const duplicate = await Lead.findOne({
                where: { institution_id: req.institutionId,
                    id: { [Op.ne]: lead.id }, phone: { [Op.in]: variants } },
                attributes: ['id'], transaction
            });
            if (duplicate) fail('Mobile number already exists in another enquiry', 409);
        }
        await lead.update(changes, { transaction });
        await LeadStatusHistory.create({
            institution_id: req.institutionId,
            lead_id: lead.id,
            changed_by: req.user.id,
            previous_status: lead.status,
            new_status: lead.status,
            remarks: `Enquiry details updated: ${Object.keys(changes).join(', ')}`
        }, { transaction });
        return lead;
    });
    res.json({ success: true, message: 'Enquiry details updated', data: result });
});

// ASSIGN COUNSELLOR
exports.assign = handle(async (req, res) => {

    const { assigned_to } = req.body || {};

    if (!assigned_to) fail('Counsellor required');

    await sequelize.transaction(async transaction => {

        const lead = await findLead(req, transaction);

        const counsellor = await validCounsellor(
            assigned_to,
            req.institutionId,
            transaction
        );

        await lead.update({
            assigned_to: counsellor.id
        }, { transaction });
    });

    res.json({
        success: true,
        message: 'Counsellor assigned successfully'
    });
});

// UPDATE STATUS
exports.updateStatus = handle(async (req, res) => {

    const { status, remarks } = req.body || {};

    if (!STATUSES.includes(status)) {
        fail('Invalid status');
    }

    await sequelize.transaction(async transaction => {

        const lead = await findLead(req, transaction);
        const previous = lead.status;

        if (previous === status) return;

        if (
            (status === 'ADMITTED' || previous === 'ADMITTED') &&
            !isManager(req)
        ) {
            fail('Admission Head or Director approval required', 403);
        }

        await lead.update({
            status,
            ...(
                ['ADMITTED', 'LOST', 'NOT_INTERESTED'].includes(status)
                    ? { next_followup_at: null }
                    : {}
            )
        }, { transaction });

        await LeadStatusHistory.create({
            institution_id: req.institutionId,
            lead_id: lead.id,
            changed_by: req.user.id,
            previous_status: previous,
            new_status: status,
            remarks: text(remarks, 5000)
        }, { transaction });
    });

    res.json({
        success: true,
        message: 'Lead status updated'
    });
});

// UPDATE PRIORITY
exports.updatePriority = handle(async (req, res) => {

    const { priority } = req.body || {};

    if (!PRIORITIES.includes(priority)) {
        fail('Invalid priority');
    }

    await sequelize.transaction(async transaction => {
        const lead = await findLead(req, transaction);

        await lead.update({ priority }, { transaction });
    });

    res.json({
        success: true,
        message: 'Priority updated'
    });
});

// ADD FOLLOW-UP
exports.addFollowup = handle(async (req, res) => {

    const {
        type,
        remarks,
        outcome,
        next_followup_at
    } = req.body || {};

    if (!FOLLOWUP_TYPES.includes(type)) {
        fail('Invalid follow-up type');
    }

    const notes = text(remarks, 5000, true);
    const nextDate = parseDate(next_followup_at);

    const followup = await sequelize.transaction(async transaction => {

        const lead = await findLead(req, transaction);

        if (['ADMITTED', 'LOST', 'NOT_INTERESTED'].includes(lead.status)) {
            fail('Reopen the lead before adding a follow-up', 409);
        }

        const now = new Date();

        const record = await LeadFollowup.create({
            institution_id: req.institutionId,
            lead_id: lead.id,
            user_id: req.user.id,
            type,
            remarks: notes,
            outcome: text(outcome, 150),
            next_followup_at: nextDate,
            contacted_at: now
        }, { transaction });

        await lead.update({
            last_contacted_at: now,
            next_followup_at: nextDate
        }, { transaction });

        return record;
    });

    res.status(201).json({
        success: true,
        message: 'Follow-up recorded successfully',
        data: followup
    });
});

// PENDING AND UPCOMING FOLLOW-UPS
exports.pendingFollowups = handle(async (req, res) => {

    const where = {
        ...scope(req),
        next_followup_at: {
            [Op.ne]: null
        },
        status: {
            [Op.notIn]: ['ADMITTED', 'LOST', 'NOT_INTERESTED']
        }
    };

    if (req.query.overdue === 'true') {
        where.next_followup_at = {
            [Op.lt]: new Date()
        };
    }

    const leads = await Lead.findAll({
        where,
        include: includes,
        order: [['next_followup_at', 'ASC']],
        limit: 100
    });

    res.json({
        success: true,
        data: leads
    });
});
