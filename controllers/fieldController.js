const { Op } = require('sequelize');

const {
    User,
    Role,
    Lead,
    Program
} = require('../models');

const FieldVisit = require('../models/FieldVisit');

const percent = (a, b) =>
    b ? Number((a / b * 100).toFixed(1)) : 0;

const todayIST = () =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

const organizationTypes = [
    'SCHOOL',
    'COLLEGE',
    'COACHING_CENTRE',
    'EDUCATION_FAIR',
    'OTHER'
];

const outcomes = [
    'POSITIVE',
    'FOLLOWUP_REQUIRED',
    'NOT_INTERESTED',
    'COMPLETED'
];

function validateDate(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) return false;

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function clean(value, max) {
    if (value == null) return null;

    if (typeof value !== 'string' || value.length > max) {
        const error = new Error('Invalid text field');
        error.status = 400;
        throw error;
    }

    return value.trim() || null;
}

exports.dashboard = async (req, res, next) => {

    try {

        const institution_id = req.institutionId;

        const personal =
            req.user.role === 'FIELD_EXECUTIVE';

        const executives = await User.findAll({

            where: {
                institution_id,
                is_active: true,
                ...(personal ? { id: req.user.id } : {})
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

            raw: true
        });

        const ids = executives.map(item => item.id);

        const [leads, visits] = await Promise.all([

            Lead.findAll({
                where: {
                    institution_id,
                    created_by: {
                        [Op.in]: ids
                    }
                },
                attributes: [
                    'id',
                    'created_by',
                    'status',
                    'priority',
                    'city',
                    'createdAt'
                ],
                raw: true
            }),

            FieldVisit.findAll({
                where: {
                    institution_id,
                    executive_id: {
                        [Op.in]: ids
                    }
                },
                raw: true
            })
        ]);

        const today = todayIST();

        const admissions = leads.filter(
            item => item.status === 'ADMITTED'
        ).length;

        const teamPerformance = executives.map(user => {

            const enquiries = leads.filter(
                item => item.created_by === user.id
            );

            const userVisits = visits.filter(
                item => item.executive_id === user.id
            );

            const admitted = enquiries.filter(
                item => item.status === 'ADMITTED'
            ).length;

            return {
                id: user.id,
                name: user.name,
                enquiries: enquiries.length,
                admissions: admitted,
                visits: userVisits.length,
                conversion: percent(
                    admitted, enquiries.length
                )
            };

        }).sort((a, b) => b.admissions - a.admissions);

        const cityMap = {};

        for (const lead of leads) {

            const city = lead.city || 'Unknown';

            if (!Object.hasOwn(cityMap, city)) {
                Object.defineProperty(cityMap, city, {
                    value: {
                        city,
                        enquiries: 0,
                        admissions: 0
                    },
                    enumerable: true
                });
            }

            cityMap[city].enquiries++;

            if (lead.status === 'ADMITTED') {
                cityMap[city].admissions++;
            }
        }

        const recentEnquiries = await Lead.findAll({
            where: {
                institution_id,
                created_by: {
                    [Op.in]: ids
                }
            },
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
                    model: User,
                    as: 'creator',
                    attributes: ['name']
                },
                {
                    model: Program,
                    as: 'program',
                    attributes: ['name', 'code']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 15
        });

        const recentVisits = await FieldVisit.findAll({
            where: {
                institution_id,
                executive_id: {
                    [Op.in]: ids
                }
            },
            include: [{
                model: User,
                as: 'executive',
                attributes: ['id', 'name']
            }],
            order: [
                ['visit_date', 'DESC'],
                ['id', 'DESC']
            ],
            limit: 30
        });

        res.json({

            success: true,

            data: {

                summary: {
                    total_executives: executives.length,
                    total_enquiries: leads.length,
                    total_admissions: admissions,

                    conversion_rate: percent(
                        admissions, leads.length
                    ),

                    total_visits: visits.length,

                    school_visits: visits.filter(
                        v => v.organization_type === 'SCHOOL'
                    ).length,

                    students_interacted: visits.reduce(
                        (sum, v) =>
                            sum + Number(v.students_interacted || 0),
                        0
                    ),

                    pending_visits: visits.filter(
                        v => v.next_visit_date &&
                        v.outcome === 'FOLLOWUP_REQUIRED'
                    ).length,

                    todays_visits: visits.filter(
                        v => v.visit_date === today
                    ).length
                },

                teamPerformance,

                regionalPerformance:
                    Object.values(cityMap).sort(
                        (a, b) => b.enquiries - a.enquiries
                    ),

                recentEnquiries,
                recentVisits
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.createVisit = async (req, res, next) => {

    try {

        const body = req.body || {};

        const organization_name =
            clean(body.organization_name, 200);

        if (!organization_name) {
            return res.status(400).json({
                success: false,
                message: 'Organization name is required'
            });
        }

        if (
            !organizationTypes.includes(
                body.organization_type
            ) ||
            !outcomes.includes(body.outcome)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid organization type or outcome'
            });
        }

        if (
            !validateDate(body.visit_date) ||
            body.visit_date > todayIST() ||
            (
                body.next_visit_date &&
                (
                    !validateDate(body.next_visit_date) ||
                    body.next_visit_date < body.visit_date
                )
            )
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid visit date'
            });
        }

        if (
            body.outcome === 'FOLLOWUP_REQUIRED' &&
            !body.next_visit_date
        ) {
            return res.status(400).json({
                success: false,
                message: 'Next visit date is required'
            });
        }

        const students = Number(
            body.students_interacted || 0
        );

        if (
            !Number.isSafeInteger(students) ||
            students < 0 ||
            students > 100000
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid student count'
            });
        }

        const visit = await FieldVisit.create({

            institution_id: req.institutionId,
            branch_id: req.user.branch_id,
            executive_id: req.user.id,

            organization_name,

            organization_type:
                body.organization_type,

            city: clean(body.city, 100),

            contact_person:
                clean(body.contact_person, 150),

            contact_phone:
                clean(body.contact_phone, 30),

            visit_date: body.visit_date,

            students_interacted: students,

            outcome: body.outcome,

            next_visit_date:
                body.next_visit_date || null,

            remarks: clean(body.remarks, 5000)

        });

        res.status(201).json({
            success: true,
            message: 'Field visit recorded successfully',
            data: visit
        });

    } catch (error) {

        if (error.status === 400) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};
