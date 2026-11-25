const {
    sequelize,
    User
} = require('../models');

const Campaign = require('../models/EmailCampaign');

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

            if (!director || !director.institution_id) {
                throw new Error('Demo director not found');
            }

            const examples = [

                {
                    campaign_name: 'Demo – Admissions Open 2027',
                    subject: 'Admissions Open for 2027',
                    message:
                        'Explore our academic programs and contact the Admissions Office to learn more.',
                    audience_count: 320,
                    simulated_sent: 312,
                    simulated_failed: 8,
                    status: 'SIMULATED'
                },

                {
                    campaign_name: 'Demo – Campus Visit Invitation',
                    subject: 'Visit Our Campus',
                    message:
                        'Meet our faculty and admission counsellors. Contact the Admissions Office to arrange a campus visit.',
                    audience_count: 180,
                    simulated_sent: 176,
                    simulated_failed: 4,
                    status: 'SIMULATED'
                },

                {
                    campaign_name: 'Demo – Scholarship Awareness',
                    subject: 'Explore Scholarship Opportunities',
                    message:
                        'Contact the Admissions Office to learn about available scholarships and eligibility requirements.',
                    audience_count: 240,
                    simulated_sent: 234,
                    simulated_failed: 6,
                    status: 'SIMULATED'
                },

                {
                    campaign_name: 'Demo – Career Counselling Session',
                    subject: 'Discover Your Academic Opportunities',
                    message:
                        'Our admission counsellors are available to help you explore academic programs and career opportunities.',
                    audience_count: 0,
                    simulated_sent: 0,
                    simulated_failed: 0,
                    status: 'DRAFT'
                }
            ];

            for (const item of examples) {

                const [, created] = await Campaign.findOrCreate({

                    where: {

                        institution_id: director.institution_id,

                        campaign_name: item.campaign_name
                    },

                    defaults: {

                        ...item,

                        institution_id: director.institution_id,

                        created_by: director.id,

                        audience_filters: {},

                        executed_at:
                            item.status === 'SIMULATED'
                                ? new Date()
                                : null
                    },

                    transaction
                });

                console.log(
                    created ? '✅ Created:' : 'Skipped:',
                    item.campaign_name
                );
            }
        });

        console.log('✅ Demo marketing campaigns ready');
        console.log('✅ No real emails were sent');

    } catch (error) {

        console.error(error.message);

        process.exitCode = 1;

    } finally {

        await sequelize.close();
    }
}

seed();
