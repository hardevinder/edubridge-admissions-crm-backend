const { Op, fn, col } = require('sequelize');

const {
    Lead,
    User,
    Role
} = require('../models');

function findField(model, candidates) {
    return candidates.find(
        field => model.rawAttributes[field]
    );
}

function assignmentField() {

    return findField(Lead, [

        'assigned_to',
        'assigned_user_id',
        'assigned_to_id',
        'counsellor_id',
        'assigned_counsellor_id'

    ]);
}

async function recommendCounsellor({

    institutionId,
    branchId,
    transaction

}) {

    const field = assignmentField();

    if (!field) {
        throw new Error('Lead assignment field not found');
    }

    const role = await Role.findOne({

        where: { code: 'COUNSELLOR' },

        transaction
    });

    if (!role) return null;

    const userWhere = {

        institution_id: institutionId,

        role_id: role.id,

        is_active: true
    };

    if (branchId && User.rawAttributes.branch_id) {
        userWhere.branch_id = branchId;
    }

    const users = await User.findAll({

        where: userWhere,

        attributes: ['id', 'name'],

        order: [['id', 'ASC']],

        transaction
    });

    if (!users.length) return null;

    const rows = await Lead.findAll({

        where: {

            institution_id: institutionId,

            [field]: {
                [Op.in]: users.map(user => user.id)
            },

            status: {

                [Op.notIn]: [
                    'ADMITTED',
                    'LOST',
                    'NOT_INTERESTED'
                ]
            }
        },

        attributes: [

            field,

            [fn('COUNT', col('id')), 'workload']

        ],

        group: [field],

        raw: true,

        transaction
    });

    const workload = new Map(

        rows.map(row => [

            Number(row[field]),

            Number(row.workload)

        ])
    );

    const candidates = users.map(user => ({

        id: user.id,

        name: user.name,

        workload: workload.get(Number(user.id)) || 0

    }));

    candidates.sort((a, b) =>

        a.workload - b.workload ||

        a.id - b.id

    );

    return candidates[0];
}

module.exports = {

    recommendCounsellor,

    assignmentField,

    findField

};
