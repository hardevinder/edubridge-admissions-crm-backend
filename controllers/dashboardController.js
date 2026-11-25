const { Op } = require('sequelize');

const {
    Lead,
    LeadFollowup,
    Program,
    User,
    Role,
    AcademicSession,
    LeadSource
} = require('../models');

const CLOSED = ['ADMITTED', 'LOST', 'NOT_INTERESTED'];

const percentage = (value, total) =>
    total ? Number(((value / total) * 100).toFixed(1)) : 0;

exports.getDashboard = async (req, res, next) => {
    try {

        const institutionId = req.institutionId;
        const isCounsellor = req.user.role === 'COUNSELLOR';

        const institutionWhere = {
            institution_id: institutionId
        };

        const session = await AcademicSession.findOne({
            where: {
                ...institutionWhere,
                is_active: true,
                ...(req.query.session_id
                    ? { id: req.query.session_id }
                    : {})
            },
            order: [['start_date', 'DESC']]
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Academic session not found'
            });
        }

        const where = {
            ...institutionWhere,
            academic_session_id: session.id,
            ...(isCounsellor
                ? { assigned_to: req.user.id }
                : {})
        };

        const [
            leads,
            programs,
            counsellors,
            sources
        ] = await Promise.all([

            Lead.findAll({
                where,
                attributes: [
                    'id',
                    'status',
                    'priority',
                    'program_id',
                    'source_id',
                    'assigned_to',
                    'next_followup_at',
                    'createdAt'
                ],
                raw: true
            }),

            Program.findAll({
                where: {
                    ...institutionWhere,
                    is_active: true
                },
                raw: true
            }),

            User.findAll({
                where: {
                    ...institutionWhere,
                    is_active: true,
                    ...(isCounsellor ? { id: req.user.id } : {})
                },
                attributes: ['id', 'name'],
                include: [{
                    model: Role,
                    as: 'role',
                    attributes: [],
                    where: { code: 'COUNSELLOR' }
                }],
                raw: true
            }),

            LeadSource.findAll({
                where: institutionWhere,
                raw: true
            })
        ]);

        const now = new Date();

        const istDay = date =>
            new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(date));

        const today = istDay(now);

        const admitted = leads.filter(
            l => l.status === 'ADMITTED'
        );

        const activeLeads = leads.filter(
            l => !CLOSED.includes(l.status)
        );

        const target = isCounsellor
            ? null
            : programs.reduce(
                (sum, p) => sum + Number(p.admission_target || 0),
                0
            );

        const overdue = activeLeads.filter(
            l => l.next_followup_at &&
            new Date(l.next_followup_at) < now
        );

        const todayFollowups = activeLeads.filter(
            l => l.next_followup_at &&
            istDay(l.next_followup_at) === today
        );

        const upcoming = activeLeads.filter(
            l => l.next_followup_at &&
            new Date(l.next_followup_at) >= now
        );

        // Current admission pipeline
        const pipelineStatuses = [
            'NEW',
            'CONTACTED',
            'INTERESTED',
            'CAMPUS_VISIT',
            'APPLICATION',
            'ADMITTED',
            'NOT_INTERESTED',
            'LOST'
        ];

        const pipeline = pipelineStatuses.map(status => ({
            status,
            count: leads.filter(l => l.status === status).length
        }));

        // Course-wise performance
        const programPerformance = programs.map(program => {

            const items = leads.filter(
                l => l.program_id === program.id
            );

            const admissions = items.filter(
                l => l.status === 'ADMITTED'
            ).length;

            const programTarget = isCounsellor
                ? null
                : Number(program.admission_target || 0);

            return {
                id: program.id,
                name: program.name,
                code: program.code,
                enquiries: items.length,
                admissions,
                target: programTarget,
                achievement: programTarget === null
                    ? null
                    : percentage(admissions, programTarget),
                conversion: percentage(admissions, items.length)
            };
        });

        // Counsellor performance
        const counsellorPerformance = counsellors.map(user => {

            const items = leads.filter(
                l => l.assigned_to === user.id
            );

            const admissions = items.filter(
                l => l.status === 'ADMITTED'
            ).length;

            const pending = items.filter(
                l => !CLOSED.includes(l.status) &&
                l.next_followup_at &&
                new Date(l.next_followup_at) < now
            ).length;

            return {
                id: user.id,
                name: user.name,
                assigned_leads: items.length,
                admissions,
                overdue_followups: pending,
                conversion: percentage(admissions, items.length)
            };

        }).sort((a, b) => b.admissions - a.admissions);

        // Marketing source performance
        const sourcePerformance = sources.map(source => {

            const items = leads.filter(
                l => l.source_id === source.id
            );

            const admissions = items.filter(
                l => l.status === 'ADMITTED'
            ).length;

            return {
                id: source.id,
                name: source.name,
                enquiries: items.length,
                admissions,
                conversion: percentage(admissions, items.length)
            };

        }).sort((a, b) => b.enquiries - a.enquiries);

        // Last 30 days enquiry trend
        const dailyTrend = [];

        for (let i = 29; i >= 0; i--) {

            const date = new Date(
                now.getTime() - i * 86400000
            );

            const day = istDay(date);

            dailyTrend.push({
                date: day,
                enquiries: leads.filter(
                    l => istDay(l.createdAt) === day
                ).length
            });
        }

        const recentLeads = await Lead.findAll({
            where,
            attributes: [
                'id',
                'full_name',
                'city',
                'status',
                'priority',
                'createdAt'
            ],
            include: [
                {
                    model: Program,
                    as: 'program',
                    attributes: ['name', 'code']
                },
                {
                    model: User,
                    as: 'counsellor',
                    attributes: ['name']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 10
        });

        res.json({
            success: true,
            data: {
                session: {
                    id: session.id,
                    name: session.name
                },

                summary: {
                    total_enquiries: leads.length,
                    total_admissions: admitted.length,
                    active_leads: activeLeads.length,
                    admission_target: target,
                    target_achievement: target === null
                        ? null
                        : percentage(admitted.length, target),
                    conversion_rate: percentage(
                        admitted.length, leads.length
                    ),
                    today_enquiries: leads.filter(
                        l => istDay(l.createdAt) === today
                    ).length,
                    hot_leads: activeLeads.filter(
                        l => l.priority === 'HOT'
                    ).length,
                    unassigned_leads: activeLeads.filter(
                        l => !l.assigned_to
                    ).length,
                    overdue_followups: overdue.length,
                    today_followups: todayFollowups.length,
                    upcoming_followups: upcoming.length
                },

                pipeline,
                programPerformance,
                counsellorPerformance,
                sourcePerformance,
                dailyTrend,
                recentLeads
            }
        });

    } catch (error) {
        next(error);
    }
};
