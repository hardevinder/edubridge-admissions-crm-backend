const bcrypt = require('bcryptjs');

const {
    sequelize,
    Institution,
    Branch,
    Role,
    User,
    AcademicSession,
    Program,
    LeadSource,
    Lead,
    LeadFollowup,
    LeadStatusHistory
} = require('../models');

const { Op } = require('sequelize');

const pick = items =>
    items[Math.floor(Math.random() * items.length)];

const DAY = 86400000;

async function seed() {

    try {

        const password = process.env.DEMO_PASSWORD;

        if (!password || password.length < 12) {
            throw new Error('Demo password required');
        }

        await sequelize.authenticate();

        await sequelize.transaction(async transaction => {

            const institution = await Institution.findOne({
                where: { code: 'DEMO_COLLEGE' },
                transaction
            });

            if (!institution) {
                throw new Error('Demo institution not found');
            }

            const institution_id = institution.id;

            const where = { institution_id };

            const existing = await Lead.count({
                where: {
                    institution_id,
                    remarks: 'SYNTHETIC_ADMISSION_DEMO_V1'
                },
                transaction
            });

            if (existing > 0) {
                console.log('Demo dataset already exists');
                return;
            }

            const branch = await Branch.findOne({
                where: {
                    ...where,
                    code: 'MAIN'
                },
                transaction
            });

            const session = await AcademicSession.findOne({
                where: {
                    ...where,
                    is_active: true
                },
                transaction
            });

            const role = await Role.findOne({
                where: { code: 'COUNSELLOR' },
                transaction
            });

            const director = await User.findOne({
                where: {
                    ...where,
                    email: 'director@demo.example'
                },
                transaction
            });

            const programs = await Program.findAll({
                where,
                transaction
            });

            const sources = await LeadSource.findAll({
                where,
                transaction
            });

            if (
                !branch || !session || !director ||
                !role || !programs.length || !sources.length
            ) {
                throw new Error('Required master data missing');
            }

            const names = [
                'Simran Kaur',
                'Aman Sharma',
                'Harpreet Singh',
                'Neha Verma',
                'Jaspreet Kaur',
                'Rohit Kumar',
                'Navdeep Singh'
            ];

            const password_hash = await bcrypt.hash(password, 12);

            for (let i = 0; i < names.length; i++) {

                await User.findOrCreate({
                    where: {
                        email: `counsellor${i + 2}@demo.example`
                    },
                    defaults: {
                        institution_id,
                        branch_id: branch.id,
                        role_id: role.id,
                        name: names[i],
                        password_hash,
                        is_active: true
                    },
                    transaction
                });
            }

            const counsellors = await User.findAll({
                where: {
                    ...where,
                    role_id: role.id,
                    is_active: true
                },
                transaction
            });

            const firstNames = [
                'Aman', 'Gurleen', 'Arjun', 'Navneet',
                'Simran', 'Harleen', 'Manpreet', 'Karan',
                'Jaspreet', 'Riya', 'Anmol', 'Prabhjot',
                'Gurkirat', 'Mehak', 'Sahil', 'Navdeep'
            ];

            const lastNames = [
                'Singh', 'Kaur', 'Sharma', 'Verma',
                'Kumar', 'Gupta', 'Gill', 'Sandhu',
                'Sidhu', 'Dhillon'
            ];

            const cities = [
                'Ludhiana',
                'Patiala',
                'Mohali',
                'Chandigarh',
                'Fatehgarh Sahib',
                'Khanna',
                'Ambala',
                'Ropar',
                'Jalandhar',
                'Sirhind'
            ];

            const statusDistribution = [
                ['NEW', 180],
                ['CONTACTED', 220],
                ['INTERESTED', 250],
                ['CAMPUS_VISIT', 100],
                ['APPLICATION', 110],
                ['ADMITTED', 240],
                ['NOT_INTERESTED', 60],
                ['LOST', 40]
            ];

            const statuses = statusDistribution.flatMap(
                ([status, count]) => Array(count).fill(status)
            );

            // Shuffle status distribution
            for (let i = statuses.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [statuses[i], statuses[j]] =
                    [statuses[j], statuses[i]];
            }

            const now = Date.now();
            const rows = [];

            for (let i = 0; i < 1200; i++) {

                const status = statuses[i];
                const program = pick(programs);
                const source = pick(sources);
                const counsellor = pick(counsellors);

                const createdAt = new Date(
                    now - Math.floor(Math.random() * 30 * DAY)
                );

                const closed = [
                    'ADMITTED',
                    'NOT_INTERESTED',
                    'LOST'
                ].includes(status);

                const next_followup_at = closed || status === 'NEW'
                    ? null
                    : new Date(
                        now + (Math.random() * 10 - 3) * DAY
                    );

                rows.push({

                    institution_id,
                    branch_id: branch.id,
                    academic_session_id: session.id,

                    program_id: program.id,
                    source_id: source.id,

                    assigned_to:
                        status === 'NEW' && i % 4 === 0
                            ? null
                            : counsellor.id,

                    created_by: director.id,

                    full_name:
                        `${pick(firstNames)} ${pick(lastNames)}`,

                    phone: `000${String(i).padStart(7, '0')}`,

                    email: `student${i + 1}@demo.example`,

                    city: pick(cities),
                    state: 'Punjab',

                    qualification: 'Class XII',

                    previous_school: 'Demo Senior Secondary School',

                    status,

                    priority: pick(['HOT', 'WARM', 'WARM', 'COLD']),

                    remarks: 'SYNTHETIC_ADMISSION_DEMO_V1',

                    next_followup_at,

                    last_contacted_at:
                        status === 'NEW' ? null : createdAt,

                    createdAt,

                    updatedAt: createdAt
                });
            }

            await Lead.bulkCreate(rows, {
                transaction,
                validate: true
            });

            const demoLeads = await Lead.findAll({
                where: {
                    institution_id,
                    remarks: 'SYNTHETIC_ADMISSION_DEMO_V1'
                },
                transaction
            });

            const history = [];
            const followups = [];

            for (const lead of demoLeads) {

                history.push({
                    institution_id,
                    lead_id: lead.id,
                    changed_by: director.id,
                    previous_status: null,
                    new_status: 'NEW',
                    remarks: 'Demo enquiry registered',
                    createdAt: lead.createdAt,
                    updatedAt: lead.createdAt
                });

                if (lead.status !== 'NEW') {

                    history.push({
                        institution_id,
                        lead_id: lead.id,
                        changed_by: director.id,
                        previous_status: 'NEW',
                        new_status: lead.status,
                        remarks: 'Synthetic admission stage update',
                        createdAt: lead.updatedAt,
                        updatedAt: lead.updatedAt
                    });

                    followups.push({
                        institution_id,
                        lead_id: lead.id,
                        user_id: lead.assigned_to || director.id,
                        type: 'CALL',
                        remarks: 'Discussed program details and admission requirements',
                        outcome: 'Demo interaction recorded',
                        contacted_at: lead.last_contacted_at,
                        next_followup_at: lead.next_followup_at,
                        createdAt: lead.createdAt,
                        updatedAt: lead.updatedAt
                    });
                }
            }

            await LeadStatusHistory.bulkCreate(history, {
                transaction
            });

            await LeadFollowup.bulkCreate(followups, {
                transaction
            });

            console.log('✅ 1,200 synthetic enquiries created');
            console.log('✅ 240 confirmed admissions created');
            console.log('✅ 8 demo counsellors available');
            console.log('✅ Admission history populated');
            console.log('✅ Follow-up records populated');
            console.log('✅ Dashboard demo dataset ready');

        });

    } catch (error) {

        console.error('❌ Seeding failed:', error.message);
        process.exitCode = 1;

    } finally {

        await sequelize.close();
    }
}

seed();
