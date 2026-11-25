const bcrypt = require('bcryptjs');

const {
    sequelize,
    Institution,
    User,
    Role,
    Branch,
    Lead
} = require('../models');

const FieldVisit = require('../models/FieldVisit');

const cities = [
    'Ludhiana',
    'Patiala',
    'Mohali',
    'Khanna',
    'Ambala',
    'Sirhind',
    'Ropar',
    'Jalandhar'
];

const names = [
    'Gurpreet Singh',
    'Amrit Kaur',
    'Manoj Kumar',
    'Sukhdeep Singh'
];

const pick = items =>
    items[Math.floor(Math.random() * items.length)];

async function seed() {

    try {

        const password = process.env.DEMO_PASSWORD;

        if (
            !password ||
            password.length < 12 ||
            Buffer.byteLength(password, 'utf8') > 72
        ) {
            throw new Error('Valid demo password required');
        }

        await sequelize.transaction(async transaction => {

            const institution = await Institution.findOne({
                where: {
                    code: 'DEMO_COLLEGE'
                },
                transaction
            });

            if (!institution) {
                throw new Error('Demo college not found');
            }

            const institution_id = institution.id;

            const branch = await Branch.findOne({
                where: {
                    institution_id,
                    code: 'MAIN'
                },
                transaction
            });

            const role = await Role.findOne({
                where: {
                    code: 'FIELD_EXECUTIVE'
                },
                transaction
            });

            if (!branch || !role) {
                throw new Error('Required master data missing');
            }

            const existing = await FieldVisit.count({
                where: {
                    institution_id,
                    remarks: 'SYNTHETIC_FIELD_VISIT_V1'
                },
                transaction
            });

            if (existing) {
                console.log('Field demo already initialized');
                return;
            }

            const password_hash = await bcrypt.hash(
                password, 12
            );

            for (let i = 0; i < names.length; i++) {

                await User.findOrCreate({
                    where: {
                        email: `executive${i + 2}@demo.example`
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

            const executives = await User.findAll({
                where: {
                    institution_id,
                    role_id: role.id,
                    is_active: true
                },
                transaction
            });

            const leads = await Lead.findAll({
                where: {
                    institution_id,
                    remarks: 'SYNTHETIC_ADMISSION_DEMO_V1'
                },
                order: sequelize.random(),
                limit: 300,
                transaction
            });

            for (const lead of leads) {

                await lead.update({
                    created_by: pick(executives).id
                }, {
                    transaction,
                    silent: true
                });
            }

            const visits = [];

            for (let i = 0; i < 60; i++) {

                const executive = pick(executives);
                const city = pick(cities);

                const type =
                    i < 40 ? 'SCHOOL' :
                    i < 50 ? 'COACHING_CENTRE' :
                    'EDUCATION_FAIR';

                const visitDate = new Date(
                    Date.now() -
                    Math.floor(Math.random() * 30) * 86400000
                );

                const followup = i % 5 === 0;

                visits.push({
                    institution_id,

                    branch_id: branch.id,

                    executive_id: executive.id,

                    organization_name:
                        `Demo ${city} ${type.replaceAll('_', ' ')} ${i + 1}`,

                    organization_type: type,

                    city,

                    visit_date:
                        visitDate.toISOString().slice(0, 10),

                    students_interacted:
                        20 + Math.floor(Math.random() * 150),

                    outcome:
                        followup
                            ? 'FOLLOWUP_REQUIRED'
                            : 'COMPLETED',

                    next_visit_date:
                        followup
                            ? new Date(
                                Date.now() + 3 * 86400000
                            ).toISOString().slice(0, 10)
                            : null,

                    remarks: 'SYNTHETIC_FIELD_VISIT_V1'
                });
            }

            await FieldVisit.bulkCreate(visits, {
                transaction
            });

            console.log(
                `✅ ${executives.length} field executives available`
            );

            console.log(
                `✅ ${leads.length} synthetic enquiries attributed`
            );

            console.log('✅ 60 synthetic field visits created');

        });

    } catch (error) {
        console.error('❌', error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

seed();
