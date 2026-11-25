const {
    Branch,
    Program,
    AcademicSession,
    LeadSource,
    User,
    Role
} = require('../models');

exports.getMasters = async (req, res, next) => {
    try {

        const where = {
            institution_id: req.institutionId,
            is_active: true
        };

        const management = [
            'DIRECTOR', 'ADMISSION_HEAD'
        ].includes(req.user.role);

        const branchWhere = {
            ...where,
            ...(!management ? { id: req.user.branch_id } : {})
        };

        const programWhere = {
            ...where,
            ...(!management ? { branch_id: req.user.branch_id } : {})
        };

        const [
            branches,
            programs,
            sessions,
            sources,
            counsellors
        ] = await Promise.all([

            Branch.findAll({
                where: branchWhere,
                order: [['name', 'ASC']]
            }),

            Program.findAll({
                where: programWhere,
                order: [['name', 'ASC']]
            }),

            AcademicSession.findAll({
                where,
                order: [['name', 'DESC']]
            }),

            LeadSource.findAll({
                where,
                order: [['name', 'ASC']]
            }),

            management ? User.findAll({
                where,
                attributes: ['id', 'name', 'email', 'branch_id'],
                include: [{
                    model: Role,
                    as: 'role',
                    attributes: ['code'],
                    where: { code: 'COUNSELLOR' }
                }]
            }) : Promise.resolve([])
        ]);

        res.json({
            success: true,
            data: {
                branches,
                programs,
                sessions,
                sources,
                counsellors
            }
        });

    } catch (error) {
        next(error);
    }
};
