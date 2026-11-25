const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
    User,
    Role,
    Institution
} = require('../models');

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            email.length > 190 ||
            password.length > 72 ||
            Buffer.byteLength(password, 'utf8') > 72 ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: 'Valid email and password are required'
            });
        }

        const user = await User.scope('withPassword').findOne({
            where: {
                email: email.trim().toLowerCase(),
                is_active: true
            },
            include: [
                { model: Role, as: 'role' },
                { model: Institution, as: 'institution' }
            ]
        });

        if (!user || !await bcrypt.compare(password, user.password_hash)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (
            !user.role ||
            (
                user.role.code !== 'SUPER_ADMIN' &&
                !user.institution?.is_active
            )
        ) {
            return res.status(403).json({
                success: false,
                message: 'Account access unavailable'
            });
        }

        const token = jwt.sign(
            { sub: String(user.id) },
            process.env.JWT_SECRET,
            {
                algorithm: 'HS256',
                expiresIn: process.env.JWT_EXPIRES_IN || '8h',
                issuer: 'edubridge-admissions-crm',
                audience: 'edubridge-crm'
            }
        );

        await user.update({ last_login: new Date() });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role.code,
                institution_id: user.institution_id,
                institution_name: user.institution?.name || null,
                branch_id: user.branch_id
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.me = (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
};
