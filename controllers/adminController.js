const bcrypt = require('bcryptjs');

const {
    sequelize,
    Institution,
    Branch,
    User,
    Role,
    Lead,
    AcademicSession
} = require('../models');

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function clean(value, max, required = false) {
    if (value == null || value === '') {
        if (required) fail('Required field missing');
        return null;
    }

    if (
        typeof value !== 'string' ||
        value.length > max
    ) {
        fail('Invalid field value');
    }

    const result = value.trim();

    if (required && !result) {
        fail('Required field missing');
    }

    return result || null;
}

const handle = fn => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {

        if ([400, 403, 404, 409].includes(error.status)) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                success: false,
                message: 'Record already exists'
            });
        }

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid form information'
            });
        }

        next(error);
    }
};

// PLATFORM DASHBOARD

exports.dashboard = handle(async (req, res) => {

    const [
        institutions,
        branches,
        totalUsers,
        activeUsers,
        totalLeads,
        totalAdmissions
    ] = await Promise.all([
        Institution.count(),
        Branch.count(),
        User.count(),
        User.count({
            where: { is_active: true }
        }),
        Lead.count(),
        Lead.count({
            where: { status: 'ADMITTED' }
        })
    ]);

    const activeInstitutions = await Institution.count({
        where: { is_active: true }
    });

    res.json({
        success: true,
        data: {
            total_institutions: institutions,
            active_institutions: activeInstitutions,
            total_branches: branches,
            total_users: totalUsers,
            active_users: activeUsers,
            total_enquiries: totalLeads,
            total_admissions: totalAdmissions
        }
    });
});

// LIST INSTITUTIONS

exports.institutions = handle(async (req, res) => {

    const institutions = await Institution.findAll({
        order: [['createdAt', 'DESC']]
    });

    const data = await Promise.all(
        institutions.map(async institution => {

            const where = {
                institution_id: institution.id
            };

            const [
                users,
                branches,
                enquiries,
                admissions
            ] = await Promise.all([
                User.count({ where }),
                Branch.count({ where }),
                Lead.count({ where }),
                Lead.count({
                    where: {
                        ...where,
                        status: 'ADMITTED'
                    }
                })
            ]);

            return {
                ...institution.toJSON(),
                total_users: users,
                total_branches: branches,
                total_enquiries: enquiries,
                total_admissions: admissions
            };
        })
    );

    res.json({
        success: true,
        data
    });
});

// CREATE INSTITUTION WITH MAIN CAMPUS

exports.createInstitution = handle(async (req, res) => {

    const body = req.body || {};

    const name = clean(body.name, 200, true);

    const code = clean(
        body.code, 50, true
    ).toUpperCase();

    if (!/^[A-Z0-9_-]+$/.test(code)) {
        fail('Invalid institution code');
    }

    const result = await sequelize.transaction(
        async transaction => {

            const institution = await Institution.create({
                name,
                code,
                email: clean(body.email, 190),
                phone: clean(body.phone, 30),
                address: clean(body.address, 2000),
                is_active: true
            }, { transaction });

            const branch = await Branch.create({
                institution_id: institution.id,
                name: 'Main Campus',
                code: 'MAIN',
                address: institution.address,
                is_active: true
            }, { transaction });

            const session = clean(
                body.academic_session || '2027-28',
                30,
                true
            );

            if (!/^\d{4}-\d{2}$/.test(session)) {
                fail('Invalid academic session');
            }

            const startYear = Number(session.slice(0, 4));
            const endYear = startYear + 1;

            if (
                session.slice(-2) !==
                String(endYear).slice(-2)
            ) {
                fail('Invalid academic session');
            }

            await AcademicSession.create({
                institution_id: institution.id,
                name: session,
                start_date: `${startYear}-04-01`,
                end_date: `${endYear}-03-31`,
                is_active: true
            }, { transaction });

            return {
                institution,
                branch
            };
        }
    );

    res.status(201).json({
        success: true,
        message: 'Institution created successfully',
        data: result
    });
});

// ACTIVATE / DEACTIVATE INSTITUTION

exports.institutionStatus = handle(async (req, res) => {

    const institution = await Institution.findByPk(
        req.params.id
    );

    if (!institution) {
        fail('Institution not found', 404);
    }

    if (typeof req.body?.is_active !== 'boolean') {
        fail('Invalid status');
    }

    await institution.update({
        is_active: req.body.is_active
    });

    res.json({
        success: true,
        message: 'Institution status updated'
    });
});

// LIST CAMPUSES

exports.branches = handle(async (req, res) => {

    const data = await Branch.findAll({
        include: [{
            model: Institution,
            as: 'institution',
            attributes: ['id', 'name']
        }],
        order: [['name', 'ASC']]
    });

    res.json({
        success: true,
        data
    });
});

// CREATE CAMPUS

exports.createBranch = handle(async (req, res) => {

    const body = req.body || {};

    const institution = await Institution.findByPk(
        body.institution_id
    );

    if (!institution || !institution.is_active) {
        fail('Active institution required');
    }

    const code = clean(
        body.code, 50, true
    ).toUpperCase();

    if (!/^[A-Z0-9_-]+$/.test(code)) {
        fail('Invalid campus code');
    }

    const branch = await Branch.create({
        institution_id: institution.id,
        name: clean(body.name, 150, true),
        code,
        address: clean(body.address, 2000),
        is_active: true
    });

    res.status(201).json({
        success: true,
        data: branch
    });
});

// LIST ROLES

exports.roles = handle(async (req, res) => {

    const roles = await Role.findAll({
        attributes: ['id', 'name', 'code']
    });

    res.json({
        success: true,
        data: roles.filter(
            role => role.code !== 'SUPER_ADMIN'
        )
    });
});

// LIST USERS

exports.users = handle(async (req, res) => {

    const users = await User.findAll({
        attributes: [
            'id',
            'name',
            'email',
            'phone',
            'institution_id',
            'branch_id',
            'role_id',
            'is_active',
            'last_login'
        ],
        include: [
            {
                model: Role,
                as: 'role',
                attributes: ['name', 'code']
            },
            {
                model: Institution,
                as: 'institution',
                attributes: ['name']
            },
            {
                model: Branch,
                as: 'branch',
                attributes: ['name']
            }
        ],
        order: [['id', 'DESC']]
    });

    res.json({
        success: true,
        data: users
    });
});

// CREATE INSTITUTION USER

exports.createUser = handle(async (req, res) => {

    const body = req.body || {};

    const institution = await Institution.findByPk(
        body.institution_id
    );

    if (!institution || !institution.is_active) {
        fail('Active institution required');
    }

    const role = await Role.findByPk(body.role_id);

    if (!role || role.code === 'SUPER_ADMIN') {
        fail('Invalid institution role');
    }

    const branch = await Branch.findOne({
        where: {
            id: body.branch_id,
            institution_id: institution.id,
            is_active: true
        }
    });

    if (!branch) {
        fail('Invalid campus');
    }

    const password = body.password;

    if (
        typeof password !== 'string' ||
        password.length < 12 ||
        Buffer.byteLength(password, 'utf8') > 72
    ) {
        fail('Password must contain 12–72 bytes');
    }

    const user = await User.create({
        institution_id: institution.id,
        branch_id: branch.id,
        role_id: role.id,
        name: clean(body.name, 150, true),
        email: clean(body.email, 190, true).toLowerCase(),
        phone: clean(body.phone, 30),
        password_hash: await bcrypt.hash(password, 12),
        is_active: true
    });

    res.status(201).json({
        success: true,
        message: 'User account created',
        data: {
            id: user.id,
            name: user.name,
            email: user.email
        }
    });
});

// ACTIVATE / DEACTIVATE USER

exports.userStatus = handle(async (req, res) => {

    const user = await User.findByPk(
        req.params.id,
        {
            include: [{
                model: Role,
                as: 'role'
            }]
        }
    );

    if (!user) fail('User not found', 404);

    if (
        user.id === req.user.id ||
        user.role.code === 'SUPER_ADMIN'
    ) {
        fail('Administrator account cannot be changed here', 403);
    }

    if (typeof req.body?.is_active !== 'boolean') {
        fail('Invalid status');
    }

    await user.update({
        is_active: req.body.is_active
    });

    res.json({
        success: true,
        message: 'User status updated'
    });
});

// UPDATE INSTITUTION USER
exports.updateUser = handle(async (req, res) => {
    const body = req.body || {};
    const user = await User.findByPk(req.params.id, {
        include: [{ model: Role, as: 'role' }]
    });
    if (!user) fail('User not found', 404);
    if (Number(user.id) === Number(req.user.id) || !user.role || user.role.code === 'SUPER_ADMIN') {
        fail('Administrator account cannot be changed here', 403);
    }
    if (String(body.institution_id) !== String(user.institution_id)) {
        fail('Institution transfer is not supported');
    }
    const role = await Role.findByPk(body.role_id);
    if (!role || role.code === 'SUPER_ADMIN') fail('Invalid institution role');
    const branch = await Branch.findOne({ where: {
        id: body.branch_id, institution_id: user.institution_id
    }});
    if (!branch || (!branch.is_active && Number(branch.id) !== Number(user.branch_id))) {
        fail('Invalid campus');
    }
    const updates = {
        name: clean(body.name, 150, true),
        email: clean(body.email, 190, true).toLowerCase(),
        phone: clean(body.phone, 30),
        branch_id: branch.id,
        role_id: role.id
    };
    if (body.password !== undefined && body.password !== '') {
        const password = body.password;
        if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
            fail('Password must contain 12–72 bytes');
        }
        updates.password_hash = await bcrypt.hash(password, 12);
    }
    await user.update(updates);
    res.json({ success: true, message: 'User account updated' });
});
