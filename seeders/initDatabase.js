const { sequelize, Role } = require('../models');

async function initialize() {
    try {
        await sequelize.authenticate();

        console.log('✅ Database connected');

        await sequelize.sync({
            force: false,
            alter: false
        });

        console.log('✅ Database tables created');

        const roles = [
            { name: 'Super Admin', code: 'SUPER_ADMIN' },
            { name: 'Director', code: 'DIRECTOR' },
            { name: 'Admission Head', code: 'ADMISSION_HEAD' },
            { name: 'Counsellor', code: 'COUNSELLOR' },
            { name: 'Field Manager', code: 'FIELD_MANAGER' },
            { name: 'Field Executive', code: 'FIELD_EXECUTIVE' }
        ];

        for (const role of roles) {
            await Role.findOrCreate({
                where: { code: role.code },
                defaults: {
                    ...role,
                    permissions: []
                }
            });
        }

        console.log('✅ All six roles initialized');
        console.log('✅ CRM database initialization completed');

    } catch (error) {
        console.error('❌ Initialization failed:', error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

initialize();
