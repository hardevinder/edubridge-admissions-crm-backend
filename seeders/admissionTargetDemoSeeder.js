const {
    sequelize,
    User,
    Program,
    AcademicSession
} = require('../models');

const Target = require('../models/AdmissionTarget');

const examples = [

    { target: 120, fee: 65000, days: 90 },

    { target: 100, fee: 55000, days: 75 },

    { target: 150, fee: 120000, days: 25 },

    { target: 100, fee: 95000, days: 90 },

    { target: 80, fee: 75000, days: 60 },

    { target: 100, fee: 50000, days: 20 },

    { target: 70, fee: 85000, days: 90 },

    { target: 80, fee: 60000, days: 75 }

];

function deadline(days) {

    return new Intl.DateTimeFormat('en-CA', {

        timeZone: 'Asia/Kolkata',

        year: 'numeric',

        month: '2-digit',

        day: '2-digit'

    }).format(
        new Date(Date.now() + days * 86400000)
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
                throw new Error('Demo director not found');
            }

            const institution_id =
                director.institution_id;

            const sessions =
                await AcademicSession.findAll({

                    where: {
                        institution_id
                    },

                    order: [['id', 'DESC']],

                    transaction
                });

            const session = sessions.find(
                item => item.is_active
            ) || sessions[0];

            if (!session) {
                throw new Error('Academic session not found');
            }

            const programs = await Program.findAll({

                where: {
                    institution_id
                },

                order: [['id', 'ASC']],

                transaction
            });

            let createdCount = 0;

            for (
                const [index, program]
                of programs.entries()
            ) {

                const sample =
                    examples[index % examples.length];

                const [, created] =
                    await Target.findOrCreate({

                        where: {

                            institution_id,

                            academic_session_id:
                                session.id,

                            program_id: program.id
                        },

                        defaults: {

                            admission_target:
                                sample.target,

                            annual_fee:
                                sample.fee,

                            admission_deadline:
                                deadline(sample.days),

                            updated_by:
                                director.id
                        },

                        transaction
                    });

                if (created) createdCount++;

                console.log(

                    created ? '✅ Created:' : 'Skipped:',

                    program.name,

                    '| Target:', sample.target,

                    '| Fee:', sample.fee
                );
            }

            console.log(
                `✅ ${createdCount} new program targets created`
            );

            console.log(
                '✅ Existing configured targets preserved'
            );

            console.log(
                '✅ Admission Revenue Intelligence ready'
            );

        });

    } catch (error) {

        console.error(error.message);

        process.exitCode = 1;

    } finally {

        await sequelize.close();

    }
}

seed();
