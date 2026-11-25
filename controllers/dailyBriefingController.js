const {
    BriefingHistory
} = require('../models/DailyBriefing');

const {
    getSettings,
    eligibleRecipients,
    buildReport,
    deliver
} = require('../services/dailyBriefingService');

const handle = fn => async (req, res, next) => {

    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

exports.dashboard = handle(async (req, res) => {

    const [
        settings,
        recipients,
        history,
        preview
    ] = await Promise.all([

        getSettings(req.institutionId),

        eligibleRecipients(req.institutionId),

        BriefingHistory.findAll({
            where: {
                institution_id: req.institutionId
            },
            order: [['id', 'DESC']],
            limit: 30
        }),

        buildReport(req.institutionId, false)
    ]);

    res.json({
        success: true,
        data: {
            settings,
            recipients,
            history,
            preview,
            email_mode:
                process.env.EMAIL_MODE === 'smtp'
                    ? 'SMTP'
                    : 'DEMO',
            scheduler_enabled:
                process.env.DAILY_BRIEFING_ENABLED === 'true'
        }
    });
});

exports.save = handle(async (req, res) => {

    const body = req.body || {};

    if (
        typeof body.enabled !== 'boolean' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.send_time || '') ||
        !Array.isArray(body.recipient_ids) ||
        body.recipient_ids.length > 20
    ) {

        return res.status(400).json({
            success: false,
            message: 'Invalid briefing settings'
        });
    }

    const allowed = await eligibleRecipients(
        req.institutionId
    );

    const ids = [...new Set(
        body.recipient_ids.map(Number)
    )];

    const valid = ids.every(id =>
        allowed.some(u => Number(u.id) === id)
    );

    if (!valid || (body.enabled && !ids.length)) {

        return res.status(400).json({
            success: false,
            message: 'Select authorized recipients'
        });
    }

    const settings = await getSettings(
        req.institutionId
    );

    await settings.update({
        enabled: body.enabled,
        send_time: body.send_time,
        recipient_ids: ids
    });

    res.json({
        success: true,
        message: 'Daily briefing settings saved'
    });
});

exports.sendNow = handle(async (req, res) => {

    const settings = await getSettings(
        req.institutionId
    );

    if (!settings.recipient_ids?.length) {

        return res.status(400).json({
            success: false,
            message: 'Configure and save recipients first'
        });
    }

    const result = await deliver({
        institutionId: req.institutionId,
        recipientIds: settings.recipient_ids,
        type: 'MANUAL'
    });

    res.json({
        success: true,
        data: result
    });
});

exports.test = handle(async (req, res) => {

    const result = await deliver({
        institutionId: req.institutionId,
        recipientIds: [req.user.id],
        type: 'TEST'
    });

    res.json({
        success: true,
        data: result
    });
});
