const bcrypt = require('bcryptjs');

const {
    sequelize,
    Institution,
    Branch,
    Role,
    User,
    AcademicSession,
    Program,
    LeadSource
} = require('../models');

async function seed() {
    try {
        await sequelize.authenticate();

        const password = process.env.DEMO_PASSWORD;

        if (!password || password.length < 12) {
            throw new Error('DEMO_PASSWORD must contain at least 12 characters');
        }

        await sequelize.transaction(async transaction => {

            const [institution] = await Institution.findOrCreate({
                where: { code: 'DEMO_COLLEGE' },
                defaults: {
                    name: 'EduBridge Demo College',
                    address: 'Punjab, India',
                    is_active: true
                },
                transaction
            });

            const [branch] = await Branch.findOrCreate({
                where: {
                    institution_id: institution.id,
                    code: 'MAIN'
                },
                defaults: {
                    name: 'Main Campus',
                    is_active: true
                },
                transaction
            });

            const accounts = [
                ['SUPER_ADMIN', 'System Administrator', 'admin'],
                ['DIRECTOR', 'Demo Director', 'director'],
                ['ADMISSION_HEAD', 'Admission Head', 'admission'],
                ['COUNSELLOR', 'Demo Counsellor', 'counsellor'],
                ['FIELD_MANAGER', 'Field Manager', 'fieldmanager'],
                ['FIELD_EXECUTIVE', 'Field Executive', 'executive']
            ];

            const passwordHash = await bcrypt.hash(password, 12);

            for (const [code, name, username] of accounts) {

                const role = await Role.findOne({
                    where: { code },
                    transaction
                });

                await User.findOrCreate({
                    where: {
                        email: `${username}@demo.example`
                    },
                    defaults: {
                        name,
                        role_id: role.id,
                        institution_id: code === 'SUPER_ADMIN'
                            ? null : institution.id,
                        branch_id: code === 'SUPER_ADMIN'
                            ? null : branch.id,
                        password_hash: passwordHash,
                        is_active: true
                    },
                    transaction
                });
            }

            await AcademicSession.findOrCreate({
                where: {
                    institution_id: institution.id,
                    name: '2027-28'
                },
                defaults: {
                    start_date: '2027-04-01',
                    end_date: '2028-03-31',
                    is_active: true
                },
                transaction
            });

            const programs = [
                ['BBA', 'Bachelor of Business Administration'],
                ['BCA', 'Bachelor of Computer Applications'],
                ['BCOM', 'Bachelor of Commerce'],
                ['BTECH', 'Bachelor of Technology'],
                ['MBA', 'Master of Business Administration'],
                ['MCA', 'Master of Computer Applications'],
                ['BPHARM', 'Bachelor of Pharmacy'],
                ['BHMCT', 'Hotel Management']
            ];

            for (const [code, name] of programs) {
                await Program.findOrCreate({
                    where: {
                        institution_id: institution.id,
                        branch_id: branch.id,
                        code
                    },
                    defaults: {
                        name,
                        total_seats: 120,
                        admission_target: 100,
                        is_active: true
                    },
                    transaction
                });
            }

            const sources = [
                'College Website',
                'Walk-in',
                'School Visit',
                'Student Referral',
                'Facebook',
                'Instagram',
                'Google Ads',
                'Education Fair',
                'Telecalling',
                'Other'
            ];

            for (const name of sources) {
                await LeadSource.findOrCreate({
                    where: {
                        institution_id: institution.id,
                        name
                    },
                    transaction
                });
            }
        });

        console.log('✅ Demo institution created');
        console.log('✅ Main campus created');
        console.log('✅ Six demo accounts created');
        console.log('✅ Academic session initialized');
        console.log('✅ Eight programs initialized');
        console.log('✅ Ten lead sources initialized');

    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

seed();
