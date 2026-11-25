const { fn, col } = require('sequelize');

const {
    sequelize,
    Lead,
    Program,
    AcademicSession
} = require('../models');

const Target = require('../models/AdmissionTarget');

const handle = fn => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

function getLeadSessionField() {

    const attributes = Lead.rawAttributes;

    if (attributes.academic_session_id) {
        return 'academic_session_id';
    }

    if (attributes.session_id) {
        return 'session_id';
    }

    throw new Error(
        'Academic session field not found in Lead model'
    );
}

function todayIST() {

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

function remainingDays(deadline) {

    const start = new Date(
        `${todayIST()}T00:00:00Z`
    );

    const end = new Date(
        `${deadline}T00:00:00Z`
    );

    return Math.max(
        0,
        Math.ceil(
            (end - start) / 86400000
        ) + 1
    );
}

function percentage(actual, target) {

    return target > 0
        ? Math.round(actual / target * 100)
        : null;
}

// GET ACADEMIC SESSIONS AND PROGRAMS

exports.options = handle(async (req, res) => {

    const where = {
        institution_id: req.institutionId
    };

    const [sessions, programs] = await Promise.all([

        AcademicSession.findAll({
            where,
            order: [['id', 'DESC']]
        }),

        Program.findAll({
            where,
            order: [['name', 'ASC']]
        })

    ]);

    res.json({

        success: true,

        data: {
            sessions,
            programs
        }
    });
});

// CREATE OR UPDATE TARGET

exports.save = handle(async (req, res) => {

    const body = req.body || {};

    const institution_id = req.institutionId;

    const academic_session_id =
        Number(body.academic_session_id);

    const program_id =
        Number(body.program_id);

    const admission_target =
        Number(body.admission_target);

    const annual_fee =
        Number(body.annual_fee);

    if (
        !Number.isSafeInteger(academic_session_id) ||
        academic_session_id < 1 ||

        !Number.isSafeInteger(program_id) ||
        program_id < 1 ||

        !Number.isSafeInteger(admission_target) ||
        admission_target < 1 ||
        admission_target > 100000 ||

        !Number.isFinite(annual_fee) ||
        annual_fee < 0 ||
        annual_fee > 100000000 ||

        !validDate(body.admission_deadline)
    ) {

        return res.status(400).json({
            success: false,
            message: 'Invalid admission target information'
        });
    }

    const [session, program] = await Promise.all([

        AcademicSession.findOne({
            where: {
                id: academic_session_id,
                institution_id
            }
        }),

        Program.findOne({
            where: {
                id: program_id,
                institution_id
            }
        })

    ]);

    if (!session || !program) {

        return res.status(404).json({

            success: false,

            message:
                'Invalid academic session or program'
        });
    }

    await Target.upsert({

        institution_id,

        academic_session_id,

        program_id,

        admission_target,

        annual_fee,

        admission_deadline:
            body.admission_deadline,

        updated_by: req.user.id

    });

    res.json({

        success: true,

        message: 'Admission target saved successfully'

    });
});

// GET TARGET AND REVENUE INTELLIGENCE

exports.dashboard = handle(async (req, res) => {

    const institution_id = req.institutionId;

    const sessionId = Number(
        req.query.session_id
    );

    const session = await AcademicSession.findOne({

        where: {

            institution_id,

            ...(sessionId ? { id: sessionId } : {})
        },

        order: [['id', 'DESC']]
    });

    if (!session) {

        return res.status(404).json({
            success: false,
            message: 'Academic session not found'
        });
    }

    const sessionField = getLeadSessionField();

    const [programs, targets, counts] = await Promise.all([

        Program.findAll({

            where: {
                institution_id
            },

            order: [['name', 'ASC']]
        }),

        Target.findAll({

            where: {

                institution_id,

                academic_session_id: session.id
            }
        }),

        Lead.findAll({

            where: {

                institution_id,

                [sessionField]: session.id,

                status: 'ADMITTED'
            },

            attributes: [

                'program_id',

                [
                    fn('COUNT', col('id')),
                    'admitted'
                ]
            ],

            group: ['program_id'],

            raw: true
        })

    ]);

    const targetMap = new Map(
        targets.map(item => [
            Number(item.program_id),
            item
        ])
    );

    const countMap = new Map(
        counts.map(item => [
            Number(item.program_id),
            Number(item.admitted)
        ])
    );

    const rows = programs.map(program => {

        const target = targetMap.get(
            Number(program.id)
        );

        const admitted = countMap.get(
            Number(program.id)
        ) || 0;

        const goal = Number(
            target?.admission_target || 0
        );

        const fee = Number(
            target?.annual_fee || 0
        );

        const remaining = Math.max(
            0,
            goal - admitted
        );

        const days = target
            ? remainingDays(target.admission_deadline)
            : 0;

        const achievement = percentage(
            admitted,
            goal
        );

        const dailyRequired = target && days > 0
            ? Math.ceil(remaining / days)
            : null;

        let status = 'NOT_CONFIGURED';

        if (target) {

            if (remaining === 0) {
                status = 'ACHIEVED';

            } else if (days === 0) {
                status = 'DEADLINE_MISSED';

            } else if (days <= 30 && achievement < 75) {
                status = 'CRITICAL';

            } else if (achievement < 50) {
                status = 'LOW_ACHIEVEMENT';

            } else {
                status = 'IN_PROGRESS';
            }
        }

        return {

            program_id: program.id,

            program_name: program.name,

            configured: Boolean(target),

            admission_target: goal,

            admitted,

            remaining: target ? remaining : null,

            achievement,

            annual_fee: fee,

            revenue_target:
                goal * fee,

            projected_revenue:
                target ? admitted * fee : null,

            remaining_revenue:
                remaining * fee,

            admission_deadline:
                target?.admission_deadline || null,

            days_remaining:
                target ? days : null,

            daily_required: dailyRequired,

            status
        };
    });

    const configured = rows.filter(
        item => item.configured
    );

    const sum = (items, key) =>
        items.reduce(
            (total, item) =>
                total + Number(item[key] || 0),
            0
        );

    const totalTarget = sum(
        configured,
        'admission_target'
    );

    const admittedAgainstTargets = sum(
        configured,
        'admitted'
    );

    const revenueTarget = sum(
        configured,
        'revenue_target'
    );

    const projectedRevenue = sum(
        configured,
        'projected_revenue'
    );

    const alerts = rows.filter(item =>
        [
            'CRITICAL',
            'DEADLINE_MISSED',
            'LOW_ACHIEVEMENT',
            'NOT_CONFIGURED'
        ].includes(item.status)
    );

    res.json({

        success: true,

        data: {

            session,

            summary: {

                admission_target: totalTarget,

                admitted: admittedAgainstTargets,

                total_confirmed_admissions:
                    sum(counts, 'admitted'),

                remaining: sum(
                    configured,
                    'remaining'
                ),

                achievement: percentage(
                    admittedAgainstTargets,
                    totalTarget
                ),

                revenue_target: revenueTarget,

                projected_revenue: projectedRevenue,

                remaining_revenue: sum(
                    configured,
                    'remaining_revenue'
                ),

                revenue_achievement: percentage(
                    projectedRevenue,
                    revenueTarget
                ),

                configured_programs:
                    configured.length,

                total_programs:
                    programs.length,

                achieved_programs:
                    configured.filter(
                        p => p.status === 'ACHIEVED'
                    ).length,

                critical_programs:
                    configured.filter(
                        p => [
                            'CRITICAL',
                            'DEADLINE_MISSED'
                        ].includes(p.status)
                    ).length

            },

            programs: rows,

            alerts
        }
    });
});
