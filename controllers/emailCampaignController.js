const { Op } = require('sequelize');

const {
    sequelize,
    Lead,
    Program
} = require('../models');

const Campaign = require('../models/EmailCampaign');

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

const handle = fn => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

function validateFilters(input) {

    const filters = {};

    if (input.program_id) {

        const id = Number(input.program_id);

        if (!Number.isSafeInteger(id) || id < 1) {
            throw new Error('Invalid program');
        }

        filters.program_id = id;
    }

    if (input.status) {

        if (!STATUSES.includes(input.status)) {
            throw new Error('Invalid student status');
        }

        filters.status = input.status;
    }

    if (input.city) {

        if (
            typeof input.city !== 'string' ||
            input.city.length > 100
        ) {
            throw new Error('Invalid city');
        }

        filters.city = input.city.trim();
    }

    return filters;
}

function audienceWhere(req, filters) {

    const where = {

        institution_id: req.institutionId,

        email: {
            [Op.and]: [
                { [Op.ne]: null },
                { [Op.ne]: '' }
            ]
        },

        status: {
            [Op.notIn]: [
                'NOT_INTERESTED',
                'LOST'
            ]
        }
    };

    if (filters.program_id) {
        where.program_id = filters.program_id;
    }

    if (filters.status) {

        where.status = {
            [Op.and]: [
                { [Op.eq]: filters.status },
                {
                    [Op.notIn]: [
                        'NOT_INTERESTED',
                        'LOST'
                    ]
                }
            ]
        };
    }

    if (filters.city) {
        where.city = filters.city;
    }

    return where;
}

async function audienceCount(req, filters, transaction) {

    return Lead.count({

        where: audienceWhere(req, filters),

        distinct: true,

        col: 'email',

        transaction
    });
}

exports.options = handle(async (req, res) => {

    const programs = await Program.findAll({

        where: {
            institution_id: req.institutionId
        },

        order: [['name', 'ASC']]
    });

    res.json({
        success: true,
        data: {
            programs,
            statuses: STATUSES.filter(
                item => ![
                    'NOT_INTERESTED',
                    'LOST'
                ].includes(item)
            )
        }
    });
});

exports.preview = handle(async (req, res) => {

    let filters;

    try {
        filters = validateFilters(req.query || {});
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const count = await audienceCount(req, filters);

    res.json({
        success: true,
        data: {
            audience_count: count,
            filters,
            mode: 'SIMULATION'
        }
    });
});

exports.list = handle(async (req, res) => {

    const where = {
        institution_id: req.institutionId
    };

    const campaigns = await Campaign.findAll({
        where,
        order: [['id', 'DESC']],
        limit: 100
    });

    const total = await Campaign.count({ where });

    const drafts = await Campaign.count({
        where: {
            ...where,
            status: 'DRAFT'
        }
    });

    const simulated = await Campaign.count({
        where: {
            ...where,
            status: 'SIMULATED'
        }
    });

    const sent = await Campaign.sum(
        'simulated_sent',
        { where }
    ) || 0;

    const failed = await Campaign.sum(
        'simulated_failed',
        { where }
    ) || 0;

    res.json({

        success: true,

        data: {

            mode: 'SIMULATION',

            summary: {
                total,
                drafts,
                simulated,
                sent,
                failed
            },

            campaigns
        }
    });
});

exports.create = handle(async (req, res) => {

    const body = req.body || {};

    const limits = {
        campaign_name: 200,
        subject: 255,
        message: 20000
    };

    for (const [key, max] of Object.entries(limits)) {

        if (
            typeof body[key] !== 'string' ||
            !body[key].trim() ||
            body[key].length > max
        ) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${key}`
            });
        }
    }

    let filters;

    try {
        filters = validateFilters(
            body.audience_filters || {}
        );
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const count = await audienceCount(req, filters);

    const campaign = await Campaign.create({

        institution_id: req.institutionId,

        created_by: req.user.id,

        campaign_name: body.campaign_name.trim(),

        subject: body.subject.trim(),

        message: body.message.trim(),

        audience_filters: filters,

        audience_count: count,

        status: 'DRAFT'
    });

    res.status(201).json({
        success: true,
        message: 'Campaign draft created',
        data: campaign
    });
});

exports.simulate = handle(async (req, res) => {

    const result = await sequelize.transaction(
        async transaction => {

            const campaign = await Campaign.findOne({

                where: {
                    id: req.params.id,
                    institution_id: req.institutionId
                },

                transaction,

                lock: transaction.LOCK.UPDATE
            });

            if (!campaign) {
                return { error: 404, message: 'Campaign not found' };
            }

            if (campaign.status !== 'DRAFT') {
                return { error: 409, message: 'Campaign already executed' };
            }

            const count = await audienceCount(
                req,
                campaign.audience_filters,
                transaction
            );

            if (!count) {
                return { error: 400, message: 'No matching email audience' };
            }

            // DEMO ONLY. No SMTP or actual delivery.

            const failed = Math.floor(count * 0.025);

            await campaign.update({

                audience_count: count,

                simulated_sent: count - failed,

                simulated_failed: failed,

                status: 'SIMULATED',

                executed_at: new Date()

            }, { transaction });

            return { campaign };
        }
    );

    if (result.error) {
        return res.status(result.error).json({
            success: false,
            message: result.message
        });
    }

    res.json({

        success: true,

        message:
            'Campaign simulation completed. No real emails were sent.',

        data: result.campaign
    });
});
