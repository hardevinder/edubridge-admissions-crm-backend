const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op } = require('sequelize');

const {

    sequelize,
    Institution,
    User,
    Role,
    Program,
    AcademicSession,
    LeadSource,
    Lead

} = require('../models');

const QR = require('../models/EnquiryQRCode');
const Registration = require('../models/QRRegistration');

const {

    recommendCounsellor,
    assignmentField,
    findField

} = require('../services/smartAssignmentService');

const CONSENT_VERSION = 'ADMISSION_ENQUIRY_V1';

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

const handle = fn => async (req, res, next) => {

    try {
        await fn(req, res);
    } catch (error) {

        if ([400, 403, 404, 409, 429, 503].includes(error.status)) {

            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        if (error.name === 'SequelizeUniqueConstraintError') {

            return res.status(409).json({
                success: false,
                message: 'This enquiry has already been submitted.'
            });
        }

        next(error);
    }
};

function clean(value, max, required = false) {

    if (value == null || value === '') {

        if (required) fail('Required information missing');

        return null;
    }

    if (typeof value !== 'string' || value.length > max) {
        fail('Invalid information');
    }

    const result = value.trim();

    if (required && !result) {
        fail('Required information missing');
    }

    return result || null;
}

function publicEnabled() {

    if (process.env.QR_REGISTRATION_ENABLED !== 'true') {

        fail('Online enquiry registration is unavailable', 503);
    }
}

function publicUrl(token) {

    const base = process.env.CRM_PUBLIC_URL;

    if (!base) {
        throw new Error('CRM_PUBLIC_URL is not configured');
    }

    return `${base.replace(/\/+$/, '')}/enquire/${token}`;
}

function scope(req) {

    return {

        institution_id: req.institutionId,

        ...(req.user.role === 'FIELD_EXECUTIVE'
            ? { executive_id: req.user.id }
            : {})
    };
}

function tokenValid(token) {

    return typeof token === 'string' &&
        /^[a-f0-9]{64}$/.test(token);
}

async function verifyExecutive(req, id) {

    const role = await Role.findOne({
        where: { code: 'FIELD_EXECUTIVE' }
    });

    if (!role) fail('Field executive role unavailable');

    const user = await User.findOne({

        where: {

            id,
            institution_id: req.institutionId,
            role_id: role.id,
            is_active: true
        }
    });

    if (!user) fail('Invalid field executive');

    return user;
}

// MANAGEMENT OPTIONS

exports.options = handle(async (req, res) => {

    const role = await Role.findOne({
        where: { code: 'FIELD_EXECUTIVE' }
    });

    const where = {
        institution_id: req.institutionId
    };

    const [executives, sessions, sources] =
        await Promise.all([

            role ? User.findAll({

                where: {

                    ...where,
                    role_id: role.id,
                    is_active: true,

                    ...(req.user.role === 'FIELD_EXECUTIVE'
                        ? { id: req.user.id }
                        : {})
                },

                attributes: ['id', 'name']

            }) : [],

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
            executives,
            sessions,
            sources
        }
    });
});

// LIST QR CODES

exports.list = handle(async (req, res) => {

    const rows = await QR.findAll({

        where: scope(req),

        include: [{

            model: User,

            as: 'executive',

            attributes: ['id', 'name']

        }],

        order: [['id', 'DESC']],

        limit: 100
    });

    res.json({

        success: true,

        data: rows.map(row => ({

            ...row.toJSON(),

            url: publicUrl(row.token)

        }))
    });
});

// CREATE QR CODE

exports.create = handle(async (req, res) => {

    const body = req.body || {};

    const executiveId =
        req.user.role === 'FIELD_EXECUTIVE'
            ? req.user.id
            : body.executive_id;

    const executive = await verifyExecutive(
        req,
        executiveId
    );

    const session = await AcademicSession.findOne({

        where: {

            id: body.academic_session_id,

            institution_id: req.institutionId
        }
    });

    const source = await LeadSource.findOne({

        where: {

            id: body.lead_source_id,

            institution_id: req.institutionId
        }
    });

    if (!session || !source) {
        fail('Invalid academic session or lead source');
    }

    const row = await QR.create({

        institution_id: req.institutionId,

        executive_id: executive.id,

        academic_session_id: session.id,

        lead_source_id: source.id,

        title: clean(body.title, 200, true),

        token: crypto.randomBytes(32).toString('hex'),

        is_active: true
    });

    res.status(201).json({

        success: true,

        data: {

            id: row.id,

            url: publicUrl(row.token)
        }
    });
});

// GENERATE QR IMAGE

exports.image = handle(async (req, res) => {

    const row = await QR.findOne({

        where: {

            ...scope(req),

            id: req.params.id
        }
    });

    if (!row) fail('QR code not found', 404);

    const image = await QRCode.toDataURL(
        publicUrl(row.token),
        {
            width: 500,
            margin: 3,
            errorCorrectionLevel: 'M'
        }
    );

    res.json({

        success: true,

        data: {
            image,
            url: publicUrl(row.token)
        }
    });
});

// ACTIVATE / DEACTIVATE QR

exports.status = handle(async (req, res) => {

    if (typeof req.body?.is_active !== 'boolean') {
        fail('Invalid status');
    }

    const row = await QR.findOne({

        where: {

            ...scope(req),

            id: req.params.id
        }
    });

    if (!row) fail('QR code not found', 404);

    await row.update({

        is_active: req.body.is_active
    });

    res.json({ success: true });
});

// PUBLIC FORM OPTIONS

exports.publicOptions = handle(async (req, res) => {

    publicEnabled();

    if (!tokenValid(req.params.token)) {
        fail('Registration link unavailable', 404);
    }

    const row = await QR.findOne({

        where: {

            token: req.params.token,

            is_active: true
        }
    });

    if (!row) {
        fail('Registration link unavailable', 404);
    }

    const [institution, programs] = await Promise.all([

        Institution.findByPk(row.institution_id),

        Program.findAll({

            where: {

                institution_id: row.institution_id,

                ...(Program.rawAttributes.is_active
                    ? { is_active: true }
                    : {})
            },

            attributes: ['id', 'name'],

            order: [['name', 'ASC']]
        })

    ]);

    if (!institution || institution.is_active === false) {
        fail('Registration link unavailable', 404);
    }

    res.set('Cache-Control', 'no-store');

    res.json({

        success: true,

        data: {

            institution_name: institution.name,

            programs,

            consent_version: CONSENT_VERSION
        }
    });
});

// PUBLIC ENQUIRY SUBMISSION

exports.register = handle(async (req, res) => {

    publicEnabled();

    if (!tokenValid(req.params.token)) {
        fail('Registration link unavailable', 404);
    }

    const body = req.body || {};

    if (

        body.consent !== true ||

        !['ADULT_STUDENT', 'PARENT_GUARDIAN'].includes(body.submitter)

    ) {

        fail('An adult student or parent/guardian must provide consent');
    }

    // Honeypot field.

    if (body.website) {
        fail('Invalid submission');
    }

    const name = clean(body.student_name, 150, true);

    const city = clean(body.city, 100);

    const email = clean(body.email, 200);

    const phone = String(body.phone || '')
        .replace(/[\s()+-]/g, '');

    if (!/^\d{10,15}$/.test(phone)) {
        fail('Enter a valid contact number');
    }

    const normalizedPhone =
        phone.length === 12 && phone.startsWith('91')
            ? phone.slice(2)
            : phone;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail('Enter a valid email address');
    }

    await sequelize.transaction(async transaction => {

        const row = await QR.findOne({

            where: {

                token: req.params.token,

                is_active: true
            },

            transaction,

            lock: transaction.LOCK.UPDATE
        });

        if (!row) {
            fail('Registration link unavailable', 404);
        }

        // Serialize new QR assignments within the institution.

        const institution = await Institution.findByPk(
            row.institution_id,
            {
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (!institution || institution.is_active === false) {
            fail('Registration unavailable', 404);
        }

        const program = await Program.findOne({

            where: {

                id: body.program_id,

                institution_id: row.institution_id,

                ...(Program.rawAttributes.is_active
                    ? { is_active: true }
                    : {})
            },

            transaction
        });

        if (!program) fail('Invalid program');

        const executive = await User.findOne({

            where: {

                id: row.executive_id,

                institution_id: row.institution_id,

                is_active: true
            },

            transaction
        });

        if (!executive) {
            fail('Registration link unavailable', 404);
        }

        const secret = process.env.JWT_SECRET;

        if (!secret) {
            throw new Error('JWT_SECRET not configured');
        }

        // Do not store raw contact numbers in the audit table.

        const hash = crypto
            .createHmac('sha256', secret)
            .update(
                [
                    normalizedPhone,
                    name.toLowerCase().replace(/\s+/g, ' '),
                    program.id
                ].join('|')
            )
            .digest('hex');

        const previous = await Registration.findOne({

            where: {

                institution_id: row.institution_id,

                academic_session_id: row.academic_session_id,

                submission_hash: hash
            },

            transaction
        });

        if (previous) {
            fail('This enquiry has already been submitted', 409);
        }

        const counsellor = await recommendCounsellor({

            institutionId: row.institution_id,

            branchId: executive.branch_id,

            transaction
        });

        const payload = {

            institution_id: row.institution_id,

            program_id: program.id,

            status: 'NEW'
        };

        // Resolve field names against the existing Lead model.

        function setField(candidates, value, required = false) {

            const key = findField(Lead, candidates);

            if (!key && required) {

                throw new Error(
                    `Lead field not found: ${candidates.join('/')}`
                );
            }

            if (key && value != null) {
                payload[key] = value;
            }
        }

        setField(
            ['student_name', 'full_name', 'name'],
            name,
            true
        );

        setField(
            ['phone', 'mobile', 'mobile_number', 'phone_number'],
            normalizedPhone,
            true
        );

        setField(
            ['email', 'email_address'],
            email?.toLowerCase()
        );

        setField(['city'], city);

        setField(
            ['academic_session_id', 'session_id'],
            row.academic_session_id,
            true
        );

        setField(
            ['lead_source_id', 'source_id'],
            row.lead_source_id,
            true
        );

        setField(
            ['created_by', 'created_by_id'],
            executive.id,
            true
        );

        setField(
            ['branch_id'],
            executive.branch_id
        );

        setField(['priority'], 'WARM');

        const assignedField = assignmentField();

        if (assignedField && counsellor) {
            payload[assignedField] = counsellor.id;
        }

        // Check that all required fields are available.
        // Do not invent values for missing required fields.

        const missing = Object.entries(
            Lead.rawAttributes
        ).filter(([key, attribute]) =>

            !attribute.allowNull &&

            attribute.allowNull === false &&

            !attribute.autoIncrement &&

            attribute.defaultValue === undefined &&

            !['createdAt', 'updatedAt', 'created_at', 'updated_at']
                .includes(key) &&

            payload[key] == null

        ).map(([key]) => key);

        if (missing.length) {

            throw new Error(
                `QR Lead adapter requires fields: ${missing.join(', ')}`
            );
        }

        // Check existing CRM leads as well as previous QR submissions.

        const existingWhere = {

            institution_id: row.institution_id,

            program_id: program.id
        };

        for (const candidates of [

            ['academic_session_id', 'session_id'],

            ['student_name', 'full_name', 'name'],

            ['phone', 'mobile', 'mobile_number', 'phone_number']

        ]) {

            const field = findField(Lead, candidates);

            if (field) existingWhere[field] = payload[field];
        }

        const existing = await Lead.findOne({

            where: existingWhere,

            transaction
        });

        if (existing) {
            fail('This enquiry has already been submitted', 409);
        }

        const lead = await Lead.create(payload, {
            transaction
        });

        await Registration.create({

            institution_id: row.institution_id,

            academic_session_id: row.academic_session_id,

            qr_code_id: row.id,

            lead_id: lead.id,

            submission_hash: hash,

            consent_version: CONSENT_VERSION,

            consent_at: new Date(),

            guardian_submission:
                body.submitter === 'PARENT_GUARDIAN'

        }, { transaction });

        await row.increment('registrations', {

            by: 1,

            transaction
        });

    });

    // No private CRM information is returned to public visitors.

    res.status(201).json({

        success: true,

        message: 'Your admission enquiry has been received successfully.'
    });
});
