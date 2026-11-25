const jwt = require('jsonwebtoken');

const {
    User,
    Role,
    Institution
} = require('../models');

exports.authenticate = async (req, res, next) => {

    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(
            header.slice(7),
            process.env.JWT_SECRET,
            {
                algorithms: ['HS256'],
                issuer: 'edubridge-admissions-crm',
                audience: 'edubridge-crm'
            }
        );
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }

    try {
        const user = await User.findByPk(decoded.sub, {
            include: [
                { model: Role, as: 'role' },
                { model: Institution, as: 'institution' }
            ]
        });

        if (!user || !user.is_active || !user.role) {
            return res.status(401).json({
                success: false,
                message: 'Account unavailable'
            });
        }

        if (
            user.role.code !== 'SUPER_ADMIN' &&
            !user.institution?.is_active
        ) {
            return res.status(403).json({
                success: false,
                message: 'Institution unavailable'
            });
        }

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.code,
            institution_id: user.institution_id,
            institution_name: user.institution?.name || null,
            branch_id: user.branch_id
        };

        next();

    } catch (error) {
        next(error);
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {

        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        next();
    };
};

exports.requireInstitution = (req, res, next) => {

    if (!req.user?.institution_id) {
        return res.status(403).json({
            success: false,
            message: 'Institution context required'
        });
    }

    req.institutionId = req.user.institution_id;

    next();
};
