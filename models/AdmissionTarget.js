const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    Program,
    AcademicSession,
    User
} = require('./index');

const AdmissionTarget = sequelize.define(
    'admission_targets',
    {
        id: {
            type: D.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        institution_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        academic_session_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        program_id: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        },

        admission_target: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        },

        annual_fee: {
            type: D.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0
        },

        admission_deadline: {
            type: D.DATEONLY,
            allowNull: false
        },

        updated_by: {
            type: D.INTEGER.UNSIGNED,
            allowNull: false
        }

    },
    {
        indexes: [
            {
                unique: true,
                fields: [
                    'institution_id',
                    'academic_session_id',
                    'program_id'
                ]
            }
        ]
    }
);

AdmissionTarget.belongsTo(Institution, {
    foreignKey: 'institution_id',
    as: 'institution'
});

AdmissionTarget.belongsTo(Program, {
    foreignKey: 'program_id',
    as: 'program'
});

AdmissionTarget.belongsTo(AcademicSession, {
    foreignKey: 'academic_session_id',
    as: 'academicSession'
});

AdmissionTarget.belongsTo(User, {
    foreignKey: 'updated_by',
    as: 'updatedBy'
});

module.exports = AdmissionTarget;
