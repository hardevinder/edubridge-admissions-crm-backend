const { DataTypes: D } = require('sequelize');
const {
    sequelize,
    Institution,
    User,
    AcademicSession,
    LeadSource
} = require('./index');

const QR = sequelize.define('enquiry_qr_codes', {

    id: {
        type: D.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },

    institution_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    executive_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    academic_session_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    lead_source_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: false
    },

    token: {
        type: D.STRING(64),
        allowNull: false,
        unique: 'uq_enquiry_qr_token'
    },

    title: {
        type: D.STRING(200),
        allowNull: false
    },

    is_active: {
        type: D.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },

    registrations: {
        type: D.INTEGER.UNSIGNED,
        defaultValue: 0
    }

}, {

    indexes: [{
        name: 'idx_qr_inst_exec',
        fields: ['institution_id', 'executive_id']
    }]

});

QR.belongsTo(Institution, {
    foreignKey: 'institution_id'
});

QR.belongsTo(User, {
    foreignKey: 'executive_id',
    as: 'executive'
});

QR.belongsTo(AcademicSession, {
    foreignKey: 'academic_session_id'
});

QR.belongsTo(LeadSource, {
    foreignKey: 'lead_source_id'
});

module.exports = QR;
