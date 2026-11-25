const { DataTypes: D } = require('sequelize');

const {
    sequelize,
    Institution,
    Lead
} = require('./index');

const QR = require('./EnquiryQRCode');

const Registration = sequelize.define('qr_registrations', {

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

    qr_code_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    lead_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    submission_hash: {
        type: D.STRING(64),
        allowNull: false
    },

    consent_version: {
        type: D.STRING(30),
        allowNull: false
    },

    consent_at: {
        type: D.DATE,
        allowNull: false
    },

    guardian_submission: {
        type: D.BOOLEAN,
        defaultValue: false
    }

}, {

    indexes: [{

        name: 'uq_qr_submission',

        unique: true,

        fields: [
            'institution_id',
            'academic_session_id',
            'submission_hash'
        ]

    }, {

        name: 'idx_qr_reg_code',

        fields: ['qr_code_id']

    }]

});

Registration.belongsTo(Institution, {
    foreignKey: 'institution_id'
});

Registration.belongsTo(QR, {
    foreignKey: 'qr_code_id'
});

Registration.belongsTo(Lead, {
    foreignKey: 'lead_id'
});

module.exports = Registration;
