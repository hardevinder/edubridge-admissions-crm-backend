const {
    Lead,
    User
} = require('../models');

const EmailCommunication = require(
    '../models/EmailCommunication'
);

const {
    sendEmail,
    validEmail
} = require('../services/emailService');

async function getAccessibleLead(req) {

    return Lead.findOne({

        where: {

            id: req.params.id,

            institution_id: req.institutionId,

            ...(req.user.role === 'COUNSELLOR'
                ? { assigned_to: req.user.id }
                : {})

        }
    });
}

exports.history = async (req, res, next) => {

    try {

        const lead = await getAccessibleLead(req);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        const communications =
            await EmailCommunication.findAll({

                where: {

                    institution_id: req.institutionId,

                    lead_id: lead.id

                },

                attributes: {
                    exclude: ['error_message']
                },

                include: [{
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'name']
                }],

                order: [['createdAt', 'DESC']],

                limit: 100

            });

        res.json({
            success: true,
            data: communications
        });

    } catch (error) {
        next(error);
    }
};

exports.send = async (req, res, next) => {

    try {

        const lead = await getAccessibleLead(req);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        if (!validEmail(lead.email)) {
            return res.status(400).json({
                success: false,
                message: 'Student email unavailable'
            });
        }

        const { subject, body } = req.body || {};

        if (
            typeof subject !== 'string' ||
            !subject.trim() ||
            subject.length > 255 ||
            /[\r\n]/.test(subject) ||

            typeof body !== 'string' ||
            !body.trim() ||
            body.length > 10000
        ) {
            return res.status(400).json({
                success: false,
                message: 'Valid subject and email body required'
            });
        }

        const communication = await sendEmail({

            lead,

            subject: subject.trim(),

            body: body.trim(),

            sentBy: req.user.id,

            type: 'MANUAL'

        });

        if (!communication) {
            return res.status(503).json({
                success: false,
                message: 'Email communication is disabled'
            });
        }

        res.status(201).json({

            success: true,

            message:
                communication.status === 'DEMO'
                    ? 'Demo email recorded'
                    : communication.status === 'SENT'
                        ? 'Email accepted by SMTP server'
                        : 'Email sending failed; attempt recorded',

            data: {
                id: communication.id,
                status: communication.status,
                subject: communication.subject
            }

        });

    } catch (error) {
        next(error);
    }
};
