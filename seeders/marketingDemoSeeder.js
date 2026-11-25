const {

    sequelize,

    User,

    AcademicSession,

    LeadSource

} = require('../models');

const Budget = require('../models/MarketingBudget');
const Expense = require('../models/MarketingExpense');

const samples = [

    { budget: 80000, spent: 45000 },

    { budget: 100000, spent: 65000 },

    { budget: 60000, spent: 38000 },

    { budget: 50000, spent: 28000 },

    { budget: 40000, spent: 42000 },

    { budget: 75000, spent: 35000 },

    { budget: 50000, spent: 24000 },

    { budget: 35000, spent: 18000 },

    { budget: 25000, spent: 12000 },

    { budget: 40000, spent: 26000 }
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

function getCategory(name) {

    const value = name.toLowerCase();

    if (/facebook|google|instagram|digital|online|social/.test(value)) {

        return 'DIGITAL_ADVERTISING';
    }

    if (/school|field|visit|outreach/.test(value)) {

        return 'TRAVEL';
    }

    if (/fair|expo/.test(value)) {

        return 'EDUCATION_FAIR';
    }

    if (/seminar|event/.test(value)) {

        return 'SEMINAR';
    }

    if (/newspaper|print/.test(value)) {

        return 'NEWSPAPER';
    }

    return 'OTHER';
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

            const institution_id = director.institution_id;

            const sessions = await AcademicSession.findAll({

                where: { institution_id },

                order: [['id', 'DESC']],

                transaction
            });

            const session = sessions.find(
                item => item.is_active
            ) || sessions[0];

            if (!session) {
                throw new Error('Academic session not found');
            }

            const sources = await LeadSource.findAll({

                where: { institution_id },

                order: [['id', 'ASC']],

                transaction
            });

            for (const [index, source] of sources.entries()) {

                const sample = samples[index % samples.length];

                const where = {

                    institution_id,

                    academic_session_id: session.id,

                    lead_source_id: source.id
                };

                await Budget.findOrCreate({

                    where,

                    defaults: {

                        allocated_budget: sample.budget,

                        updated_by: director.id,

                        notes: 'Synthetic demo marketing budget'
                    },

                    transaction
                });

                const portions = [

                    Math.round(sample.spent * 0.4),

                    Math.round(sample.spent * 0.35)
                ];

                portions.push(

                    sample.spent - portions[0] - portions[1]
                );

                for (let j = 0; j < 3; j++) {

                    const reference_number =
                        `DEMO-MKT-${session.id}-${source.id}-${j + 1}`;

                    await Expense.findOrCreate({

                        where: {

                            ...where,

                            reference_number
                        },

                        defaults: {

                            created_by: director.id,

                            expense_date: date(-(j * 7 + 2)),

                            title:
                                `Demo ${source.name} Marketing Activity ${j + 1}`,

                            category: getCategory(source.name),

                            amount: portions[j],

                            vendor: 'Demo Marketing Vendor',

                            remarks:
                                'Synthetic expenditure for CRM demonstration.'
                        },

                        transaction
                    });
                }

                console.log(

                    '✅',

                    source.name,

                    '| Budget:', sample.budget,

                    '| Expenses:', sample.spent
                );
            }

            console.log('✅ Marketing demo dataset ready');
            console.log('✅ Existing records preserved');

        });

    } catch (error) {

        console.error(error.message);

        process.exitCode = 1;

    } finally {

        await sequelize.close();
    }
}

seed();
