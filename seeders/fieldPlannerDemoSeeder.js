const {
    sequelize,
    Institution,
    User,
    Role
} = require('../models');

const Plan = require('../models/FieldActivityPlan');

const MARKER = 'SYNTHETIC_FIELD_PLANNER_V1';

const cities = [
    'Khanna',
    'Mandi Gobindgarh',
    'Sirhind',
    'Patiala',
    'Mohali',
    'Ludhiana',
    'Ropar',
    'Ambala'
];

const activities = [
    {
        type: 'SCHOOL_VISIT',
        organization: 'Demo Public School',
        start: '09:00',
        end: '10:00',
        target: 15,
        objective: 'Interact with Class XII students and introduce available college programs.'
    },
    {
        type: 'PRINCIPAL_MEETING',
        organization: 'Demo International School',
        start: '10:30',
        end: '11:30',
        target: 5,
        objective: 'Meet the principal and discuss an admission awareness seminar.'
    },
    {
        type: 'PRESENTATION',
        organization: 'Demo Senior Secondary School',
        start: '12:00',
        end: '13:00',
        target: 30,
        objective: 'Conduct a career guidance and admission presentation.'
    },
    {
        type: 'COACHING_VISIT',
        organization: 'Demo Career Academy',
        start: '14:00',
        end: '15:00',
        target: 15,
        objective: 'Introduce professional courses and collect interested student enquiries.'
    },
    {
        type: 'STUDENT_COUNSELLING',
        organization: 'Demo Counselling Centre',
        start: '15:30',
        end: '16:30',
        target: 10,
        objective: 'Counsel prospective students regarding eligibility and admission opportunities.'
    }
];

const remarks = [
    'Successful interaction. Students showed interest in professional courses.',
    'Positive response received. Admission brochures shared.',
    'Meeting completed. Interested students identified for follow-up.',
    'Career guidance session completed successfully.',
    'Admission opportunities discussed. Further counselling recommended.'
];

const pick = items =>
    items[Math.floor(Math.random() * items.length)];

function dateIST(offset = 0) {

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(
        new Date(Date.now() + offset * 86400000)
    );
}

function timestamp(date, time) {

    return new Date(
        `${date}T${time}:00+05:30`
    );
}

async function seed() {

    try {

        await sequelize.authenticate();

        console.log('✅ Database connected');

        await sequelize.transaction(async transaction => {

            const institution = await Institution.findOne({
                where: {
                    code: 'DEMO_COLLEGE'
                },
                transaction
            });

            if (!institution) {
                throw new Error('Demo institution not found');
            }

            const institution_id = institution.id;

            const role = await Role.findOne({
                where: {
                    code: 'FIELD_EXECUTIVE'
                },
                transaction
            });

            if (!role) {
                throw new Error('Field Executive role not found');
            }

            const executives = await User.findAll({

                where: {
                    institution_id,
                    role_id: role.id,
                    is_active: true
                },

                order: [['id', 'ASC']],

                limit: 5,

                transaction
            });

            if (!executives.length) {
                throw new Error('No active field executives found');
            }

            const manager = await User.findOne({

                where: {
                    institution_id,
                    email: 'fieldmanager@demo.example',
                    is_active: true
                },

                transaction
            });

            const { Op } = require('sequelize');

            const existing = await Plan.count({

                where: {
                    institution_id,
                    objective: {
                        [Op.like]: `%${MARKER}%`
                    }
                },

                transaction
            });

            if (existing > 0) {

                console.log(
                    '⚠️ Field Planner demo data already exists'
                );

                console.log(
                    `Existing demo activities: ${existing}`
                );

                return;
            }

            const rows = [];
            const now = new Date();

            for (const offset of [-1, 0, 1]) {

                const date = dateIST(offset);

                for (const executive of executives) {

                    for (let i = 0; i < activities.length; i++) {

                        const activity = activities[i];

                        const city = pick(cities);

                        let status = 'PLANNED';

                        let actual_enquiries = 0;

                        let started_at = null;

                        let completed_at = null;

                        let completion_remarks = null;

                        const start = timestamp(
                            date, activity.start
                        );

                        const end = timestamp(
                            date, activity.end
                        );

                        if (offset < 0 || (
                            offset === 0 && end <= now
                        )) {

                            status = 'COMPLETED';

                            actual_enquiries = Math.round(
                                activity.target *
                                (0.65 + Math.random() * 0.65)
                            );

                            started_at = start;
                            completed_at = end;

                            completion_remarks = pick(remarks);

                        } else if (
                            offset === 0 &&
                            start <= now &&
                            end > now
                        ) {

                            status = 'IN_PROGRESS';
                            started_at = start;

                        }

                        // Add variety to yesterday's activities
                        if (offset === -1 && i === 4) {

                            status = 'POSTPONED';

                            actual_enquiries = 0;
                            started_at = null;
                            completed_at = null;

                            completion_remarks =
                                'Appointment rescheduled due to institution availability.';
                        }

                        rows.push({

                            institution_id,

                            executive_id: executive.id,

                            created_by:
                                i % 2 === 0 && manager
                                    ? manager.id
                                    : executive.id,

                            activity_date: date,

                            start_time: activity.start,

                            end_time: activity.end,

                            activity_type: activity.type,

                            organization_name:
                                `${activity.organization}, ${city}`,

                            city,

                            address:
                                `Demo Campus, ${city}, Punjab`,

                            contact_person:
                                'Demo Admission Coordinator',

                            contact_phone:
                                '0000000000',

                            expected_enquiries:
                                activity.target,

                            actual_enquiries,

                            status,

                            objective:
                                `${activity.objective}\n\n[${MARKER}]`,

                            completion_remarks,

                            started_at,

                            completed_at

                        });

                    }
                }
            }

            await Plan.bulkCreate(rows, {
                transaction,
                validate: true
            });

            console.log(
                `✅ ${executives.length} Field Executives`
            );

            console.log(
                `✅ ${rows.length} demo activities created`
            );

            console.log(
                `✅ Yesterday: ${dateIST(-1)}`
            );

            console.log(
                `✅ Today: ${dateIST(0)}`
            );

            console.log(
                `✅ Tomorrow: ${dateIST(1)}`
            );

            console.log('✅ Enquiry targets populated');
            console.log('✅ Completed activities populated');
            console.log('✅ Future appointments populated');
            console.log('✅ Field Planner demo ready');

        });

    } catch (error) {

        console.error('❌ Seeder failed:', error.message);

        process.exitCode = 1;

    } finally {

        await sequelize.close();

    }
}

seed();
