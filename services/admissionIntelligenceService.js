const { Op, fn, col } = require('sequelize');

const {
    Lead,
    Program,
    AcademicSession
} = require('../models');

const Target = require('../models/AdmissionTarget');

const {
    buildMarketingSnapshot
} = require('./marketingIntelligenceService');


const rate = (actual, total) =>
    total > 0
        ? Math.round(actual / total * 1000) / 10
        : 0;

const sum = (rows, key) =>
    rows.reduce(
        (total, row) =>
            total + Number(row[key] || 0),
        0
    );

function findAttribute(model, candidates) {

    return candidates.find(
        field => model.rawAttributes[field]
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

async function groupLeads(where, field) {

    if (!field) return [];

    const rows = await Lead.findAll({

        where,

        attributes: [

            field,

            'status',

            [fn('COUNT', col('id')), 'count']
        ],

        group: [field, 'status'],

        raw: true
    });

    const groups = new Map();

    for (const row of rows) {

        const id = row[field] ?? 'UNASSIGNED';

        if (!groups.has(id)) {

            groups.set(id, {
                id,
                enquiries: 0,
                admitted: 0,
                statuses: {}
            });
        }

        const item = groups.get(id);

        const count = Number(row.count);

        item.enquiries += count;

        item.statuses[row.status] =
            (item.statuses[row.status] || 0) + count;

        if (row.status === 'ADMITTED') {
            item.admitted += count;
        }
    }

    return [...groups.values()].map(item => ({

        ...item,

        conversion_rate: rate(
            item.admitted,
            item.enquiries
        )
    }));
}

async function buildSnapshot(
    institutionId,
    sessionId
) {

    const sessions = await AcademicSession.findAll({

        where: {
            institution_id: institutionId
        },

        order: [['id', 'DESC']]
    });

    const session = sessionId
        ? sessions.find(
            item => Number(item.id) === Number(sessionId)
        )
        : sessions.find(
            item => item.is_active
        ) || sessions[0];

    if (!session) {

        const error = new Error(
            'Academic session not found'
        );

        error.status = 404;

        throw error;
    }

    const sessionField = findAttribute(
        Lead,
        ['academic_session_id', 'session_id']
    );

    if (!sessionField) {
        throw new Error(
            'Lead academic session field not found'
        );
    }

    const counsellorField = findAttribute(
        Lead,
        [
            'assigned_to',
            'counsellor_id',
            'assigned_user_id',
            'assigned_to_id',
            'assigned_counsellor_id'
        ]
    );

    const sourceField = findAttribute(
        Lead,
        ['lead_source_id', 'source_id']
    );

    const where = {

        institution_id: institutionId,

        [sessionField]: session.id
    };

    const [
        programs,
        targetRows,
        statusRows,
        programGroups,
        counsellorGroups,
        sourceGroups
    ] = await Promise.all([

        Program.findAll({

            where: {
                institution_id: institutionId
            },

            attributes: ['id', 'name']
        }),

        Target.findAll({

            where: {
                institution_id: institutionId,
                academic_session_id: session.id
            }
        }),

        Lead.findAll({

            where,

            attributes: [
                'status',
                [fn('COUNT', col('id')), 'count']
            ],

            group: ['status'],

            raw: true
        }),

        groupLeads(where, 'program_id'),

        groupLeads(where, counsellorField),

        groupLeads(where, sourceField)
    ]);

    const pipeline = Object.fromEntries(
        statusRows.map(row => [
            row.status,
            Number(row.count)
        ])
    );

    const totalEnquiries = sum(statusRows, 'count');

    const totalAdmitted =
        pipeline.ADMITTED || 0;

    const targetMap = new Map(
        targetRows.map(row => [
            Number(row.program_id),
            row
        ])
    );

    const groupMap = new Map(
        programGroups.map(row => [
            Number(row.id),
            row
        ])
    );

    const programPerformance = programs.map(
        (program, index) => {

            const group = groupMap.get(
                Number(program.id)
            ) || {};

            const target = targetMap.get(
                Number(program.id)
            );

            const admitted =
                Number(group.admitted || 0);

            const goal =
                Number(target?.admission_target || 0);

            const fee =
                Number(target?.annual_fee || 0);

            const remaining =
                Math.max(0, goal - admitted);

            const daysRemaining = target
                ? Math.max(
                    0,
                    Math.floor((
                        new Date(
                            target.admission_deadline +
                            'T00:00:00Z'
                        ) -
                        new Date(todayIST() + 'T00:00:00Z')
                    ) / 86400000) + 1
                )
                : null;

            return {

                program: program.name,

                enquiries: group.enquiries || 0,

                admitted,

                conversion_rate:
                    group.conversion_rate || 0,

                configured: Boolean(target),

                target: goal,

                remaining,

                achievement:
                    rate(admitted, goal),

                annual_fee: fee,

                projected_revenue:
                    target ? admitted * fee : null,

                revenue_target:
                    target ? goal * fee : null,

                remaining_revenue:
                    target ? remaining * fee : null,

                deadline:
                    target?.admission_deadline || null,

                days_remaining: daysRemaining,

                required_daily_admissions:
                    daysRemaining > 0
                        ? Math.ceil(
                            remaining / daysRemaining
                        )
                        : null
            };
        }
    );

    const configured = programPerformance.filter(
        item => item.configured
    );

    const target = sum(configured, 'target');

    const admittedAgainstTarget =
        sum(configured, 'admitted');

    // Use anonymous counsellor labels.
    // Do not send staff names or user IDs to OpenAI.

    const counsellors = counsellorGroups
        .sort(
            (a, b) =>
                b.conversion_rate - a.conversion_rate
        )
        .map((item, index) => ({

            counsellor:
                item.id === 'UNASSIGNED'
                    ? 'Unassigned Enquiries'
                    : `Counsellor ${index + 1}`,

            enquiries: item.enquiries,

            admitted: item.admitted,

            conversion_rate:
                item.conversion_rate
        }));

    const sources = sourceGroups
        .sort(
            (a, b) =>
                b.enquiries - a.enquiries
        )
        .map((item, index) => ({

            source:
                item.id === 'UNASSIGNED'
                    ? 'Unknown Source'
                    : `Lead Source ${index + 1}`,

            enquiries: item.enquiries,

            admitted: item.admitted,

            conversion_rate:
                item.conversion_rate
        }));

    const activeWhere = {

        ...where,

        status: {

            [Op.notIn]: [
                'ADMITTED',
                'LOST',
                'NOT_INTERESTED'
            ]
        }
    };

    let hotEnquiries = null;

    if (Lead.rawAttributes.priority) {

        hotEnquiries = await Lead.count({

            where: {
                ...activeWhere,
                priority: 'HOT'
            }
        });
    }

    const followupField = findAttribute(
        Lead,
        [
            'next_followup_date',
            'next_followup_at',
            'next_follow_up_date',
            'followup_date'
        ]
    );

    let overdueFollowups = null;

    if (followupField) {

        overdueFollowups = await Lead.count({

            where: {

                ...activeWhere,

                [followupField]: {

                    [Op.lt]:
                        new Date(
                            todayIST() +
                            'T00:00:00+05:30'
                        )
                }
            }
        });
    }

    const marketing = await buildMarketingSnapshot(
        institutionId,
        session.id
    );

    return {

        marketing,

        generated_at: new Date().toISOString(),

        session:
            session.name ||
            session.session_name ||
            'Selected Academic Session',

        summary: {

            total_enquiries: totalEnquiries,

            total_admitted: totalAdmitted,

            conversion_rate:
                rate(totalAdmitted, totalEnquiries),

            hot_enquiries: hotEnquiries,

            overdue_followups: overdueFollowups,

            admission_target: target,

            admitted_against_target:
                admittedAgainstTarget,

            target_achievement:
                rate(admittedAgainstTarget, target),

            remaining_admissions:
                sum(configured, 'remaining'),

            revenue_target:
                sum(configured, 'revenue_target'),

            projected_revenue:
                sum(configured, 'projected_revenue'),

            remaining_revenue:
                sum(configured, 'remaining_revenue')
        },

        pipeline,

        programs: programPerformance,

        counsellors,

        sources,

        limitations: {

            counsellor_names_anonymized: true,

            source_names_anonymized: true,

            followup_data_available:
                Boolean(followupField),

            financial_figures_are_projections: true,

            historical_daily_trends_available: false
        }
    };
}

function generateInsights(snapshot) {

    const insights = [];

    const s = snapshot.summary;

    const add = (
        severity,
        title,
        description,
        action,
        link
    ) => {

        insights.push({
            severity,
            title,
            description,
            action,
            link
        });
    };

    if (s.overdue_followups > 0) {

        add(

            'CRITICAL',

            'Overdue Student Follow-ups',

            `${s.overdue_followups} active enquiries have overdue follow-up dates.`,

            'Review pending follow-ups and counsellor workload.',

            '/leads'
        );
    }

    if (s.hot_enquiries > 0) {

        add(

            'WARNING',

            'High-Priority Enquiry Opportunities',

            `${s.hot_enquiries} active enquiries are marked HOT.`,

            'Prioritize timely and appropriate follow-up.',

            '/leads'
        );
    }

    if (snapshot.pipeline.APPLICATION > 0) {

        add(

            'OPPORTUNITY',

            'Applications in Progress',

            `${snapshot.pipeline.APPLICATION} enquiries are currently at the application stage.`,

            'Offer application assistance and clarify admission requirements.',

            '/leads'
        );
    }

    if (snapshot.pipeline.CAMPUS_VISIT > 0) {

        add(

            'OPPORTUNITY',

            'Campus Visit Follow-up',

            `${snapshot.pipeline.CAMPUS_VISIT} enquiries are currently in the campus visit stage.`,

            'Review campus visit outcomes and offer counselling support.',

            '/leads'
        );
    }

    for (const program of snapshot.programs) {

        if (!program.configured) continue;

        if (
            program.remaining > 0 &&
            program.days_remaining === 0
        ) {

            add(

                'CRITICAL',

                `${program.program}: Deadline Missed`,

                `${program.remaining} admissions remain against the configured target.`,

                'Review the target and admission strategy.',

                '/admission-targets'
            );

        } else if (
            program.remaining > 0 &&
            program.days_remaining <= 30 &&
            program.achievement < 75
        ) {

            add(

                'CRITICAL',

                `${program.program}: Target at Risk`,

                `${program.achievement}% achieved with ${program.days_remaining} calendar days remaining.`,

                'Review program-specific outreach and counsellor allocation.',

                '/admission-targets'
            );

        } else if (
            program.achievement >= 100
        ) {

            add(

                'POSITIVE',

                `${program.program}: Target Achieved`,

                `${program.admitted} admissions against a target of ${program.target}.`,

                'Review successful admission practices and share lessons with other teams.',

                '/admission-targets'
            );
        }
    }

    const bestProgram = snapshot.programs
        .filter(item => item.enquiries >= 20)
        .sort(
            (a, b) =>
                b.conversion_rate - a.conversion_rate
        )[0];

    if (bestProgram) {

        add(

            'POSITIVE',

            'Strongest Program Conversion',

            `${bestProgram.program} has a ${bestProgram.conversion_rate}% conversion rate among programs with at least 20 enquiries.`,

            'Review successful counselling and outreach practices.',

            '/admission-targets'
        );
    }

    const priorities = {

        CRITICAL: 1,

        WARNING: 2,

        OPPORTUNITY: 3,

        POSITIVE: 4
    };

    return insights.sort(
        (a, b) =>
            priorities[a.severity] -
            priorities[b.severity]
    );
}

module.exports = {

    buildSnapshot,

    generateInsights
};
