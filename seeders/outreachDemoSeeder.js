const {
    sequelize,
    User,
    Role
} = require('../models');

const Organization = require('../models/OutreachInstitution');
const Interaction = require('../models/OutreachInteraction');

const cities = [

    'Khanna',
    'Mandi Gobindgarh',
    'Sirhind',
    'Patiala',
    'Mohali',
    'Ludhiana',
    'Ropar',
    'Rajpura',
    'Samrala',
    'Morinda'
];

const schoolNames = [

    'Horizon Public School',
    'Green Valley Senior Secondary School',
    'Sunrise International School',
    'Golden Future Academy',
    'New Vision Public School',
    'Oxford Learning School'
];

const coachingNames = [

    'Future Career Academy',
    'Bright Minds Coaching Centre',
    'Success Learning Institute'
];

const relationships = [

    'STRONG',
    'ACTIVE',
    'ACTIVE',
    'DEVELOPING',
    'NEW',
    'INACTIVE'
];

const interactionTypes = [

    'SCHOOL_VISIT',
    'PRINCIPAL_MEETING',
    'PRESENTATION',
    'FOLLOW_UP'
];

const outcomes = [

    'Career guidance discussion completed. Institution expressed interest in further academic outreach.',

    'Admission brochures shared with the institutional coordinator. Follow-up meeting recommended.',

    'Demo career awareness presentation completed. Reported enquiries require further counselling.',

    'Discussed upcoming admission opportunities and planned future institutional engagement.'
];

function date(offset) {

    return new Intl.DateTimeFormat('en-CA', {

        timeZone: 'Asia/Kolkata',

        year: 'numeric',

        month: '2-digit',

        day: '2-digit'

    }).format(
        new Date(Date.now() + offset * 86400000)
    );
}

async function seed() {

    try {

        await sequelize.authenticate();

        await sequelize.transaction(async transaction => {

            const director = await User.findOne({

                where: {
                    email: 'director@demo.example'
                },

                transaction
            });

            if (!director?.institution_id) {
                throw new Error('Demo institution not found');
            }

            const institution_id = director.institution_id;

            const role = await Role.findOne({

                where: {
                    code: 'FIELD_EXECUTIVE'
                },

                transaction
            });

            if (!role) {
                throw new Error('Field executive role not found');
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

            let organizationsCreated = 0;
            let interactionsCreated = 0;

            for (let i = 0; i < 60; i++) {

                const coaching = i >= 45;

                const city = cities[i % cities.length];

                const executive =
                    executives[i % executives.length];

                const names = coaching
                    ? coachingNames
                    : schoolNames;

                const name = `Demo ${names[i % names.length]} - ${city} ${i + 1}`;

                const [organization, created] =
                    await Organization.findOrCreate({

                        where: {
                            institution_id,
                            name
                        },

                        defaults: {

                            institution_id,

                            assigned_to: executive.id,

                            created_by: executive.id,

                            name,

                            organization_type: coaching
                                ? 'COACHING_CENTRE'
                                : 'SCHOOL',

                            city,

                            state: 'Punjab',

                            address: `Illustrative Demo Campus, ${city}`,

                            board: coaching ? null : 'CBSE',

                            principal_name:
                                coaching ? null : 'Demo Principal',

                            contact_person: 'Demo Coordinator',

                            phone: null,

                            email: null,

                            class_12_strength:
                                80 + (i * 17) % 250,

                            relationship_status:
                                relationships[i % relationships.length],

                            priority: i % 3 === 0
                                ? 'HIGH'
                                : 'MEDIUM',

                            notes:
                                'Synthetic institutional profile for CRM demonstration.'
                        },

                        transaction
                    });

                if (!created) continue;

                organizationsCreated++;

                const lastVisitOffset = -(i % 45);

                const records = [];

                for (let j = 0; j < 4; j++) {

                    records.push({

                        institution_id,

                        outreach_institution_id: organization.id,

                        executive_id: executive.id,

                        interaction_date:
                            date(lastVisitOffset - j * 9),

                        interaction_type:
                            interactionTypes[j],

                        meeting_with:
                            'Demo Institutional Coordinator',

                        outcome: outcomes[j],

                        reported_enquiries:
                            5 + (i * 7 + j * 3) % 25,

                        next_visit_date:
                            j === 0
                                ? date(1 + i % 15)
                                : null
                    });
                }

                await Interaction.bulkCreate(records, {
                    transaction,
                    validate: true
                });

                interactionsCreated += records.length;
            }

            console.log(
                `✅ ${organizationsCreated} new institutions created`
            );

            console.log(
                `✅ ${interactionsCreated} new interactions created`
            );

            console.log(
                `✅ Assigned to ${executives.length} field executives`
            );

            console.log('✅ Existing demo records preserved');

        });

    } catch (error) {

        console.error('❌ Seeder failed:', error.message);

        process.exitCode = 1;

    } finally {

        await sequelize.close();
    }
}

seed();
