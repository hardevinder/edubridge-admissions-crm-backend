const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');

const id = () => ({
    type: D.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
});

const ref = () => ({
    type: D.INTEGER.UNSIGNED,
    allowNull: false
});

const define = (name, fields, options = {}) =>
    sequelize.define(name, { id: id(), ...fields }, options);

// Institution
const Institution = define('institutions', {
    name: { type: D.STRING(200), allowNull: false },
    code: { type: D.STRING(50), allowNull: false, unique: true },
    email: D.STRING,
    phone: D.STRING(30),
    address: D.TEXT,
    logo_url: D.STRING,
    is_active: { type: D.BOOLEAN, defaultValue: true }
});

// Campus / Branch
const Branch = define('branches', {
    institution_id: ref(),
    name: { type: D.STRING(150), allowNull: false },
    code: { type: D.STRING(50), allowNull: false },
    address: D.TEXT,
    is_active: { type: D.BOOLEAN, defaultValue: true }
}, {
    indexes: [
        { unique: true, fields: ['institution_id', 'code'] }
    ]
});

// Role
const Role = define('roles', {
    name: { type: D.STRING(100), allowNull: false },
    code: { type: D.STRING(50), allowNull: false, unique: true },
    permissions: D.JSON
});

// User
const User = define('users', {
    institution_id: {
        type: D.INTEGER.UNSIGNED,
        allowNull: true
    },
    branch_id: D.INTEGER.UNSIGNED,
    role_id: ref(),
    name: { type: D.STRING(150), allowNull: false },
    email: {
        type: D.STRING(190),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    phone: D.STRING(30),
    password_hash: {
        type: D.STRING,
        allowNull: false
    },
    is_active: { type: D.BOOLEAN, defaultValue: true },
    last_login: D.DATE
}, {
    defaultScope: {
        attributes: { exclude: ['password_hash'] }
    },
    scopes: {
        withPassword: {
            attributes: { include: ['password_hash'] }
        }
    }
});

// Academic Session
const AcademicSession = define('academic_sessions', {
    institution_id: ref(),
    name: { type: D.STRING(30), allowNull: false },
    start_date: D.DATEONLY,
    end_date: D.DATEONLY,
    is_active: { type: D.BOOLEAN, defaultValue: true }
}, {
    indexes: [
        { unique: true, fields: ['institution_id', 'name'] }
    ]
});

// Program
const Program = define('programs', {
    institution_id: ref(),
    branch_id: D.INTEGER.UNSIGNED,
    name: { type: D.STRING(150), allowNull: false },
    code: { type: D.STRING(50), allowNull: false },
    duration: D.STRING(50),
    total_seats: D.INTEGER.UNSIGNED,
    admission_target: D.INTEGER.UNSIGNED,
    annual_fee: D.DECIMAL(12, 2),
    is_active: { type: D.BOOLEAN, defaultValue: true }
});

// Lead Source
const LeadSource = define('lead_sources', {
    institution_id: ref(),
    name: { type: D.STRING(100), allowNull: false },
    is_active: { type: D.BOOLEAN, defaultValue: true }
}, {
    indexes: [
        { unique: true, fields: ['institution_id', 'name'] }
    ]
});

// Lead
const Lead = define('leads', {
    institution_id: ref(),
    branch_id: D.INTEGER.UNSIGNED,
    academic_session_id: ref(),
    program_id: D.INTEGER.UNSIGNED,
    source_id: D.INTEGER.UNSIGNED,
    assigned_to: D.INTEGER.UNSIGNED,
    created_by: ref(),

    full_name: { type: D.STRING(150), allowNull: false },
    phone: { type: D.STRING(30), allowNull: false },
    alternate_phone: D.STRING(30),
    email: D.STRING,
    parent_name: D.STRING(150),
    city: D.STRING(100),
    state: D.STRING(100),
    previous_school: D.STRING(200),
    qualification: D.STRING(100),
    remarks: D.TEXT,

    status: {
        type: D.ENUM(
            'NEW',
            'CONTACTED',
            'INTERESTED',
            'CAMPUS_VISIT',
            'APPLICATION',
            'ADMITTED',
            'NOT_INTERESTED',
            'LOST'
        ),
        defaultValue: 'NEW',
        allowNull: false
    },

    priority: {
        type: D.ENUM('HOT', 'WARM', 'COLD'),
        defaultValue: 'WARM',
        allowNull: false
    },

    next_followup_at: D.DATE,
    last_contacted_at: D.DATE
}, {
    indexes: [
        { fields: ['institution_id', 'status'] },
        { fields: ['institution_id', 'assigned_to'] },
        { fields: ['institution_id', 'phone'] },
        { fields: ['institution_id', 'next_followup_at'] }
    ]
});

// Lead Followup
const LeadFollowup = define('lead_followups', {
    institution_id: ref(),
    lead_id: ref(),
    user_id: ref(),

    type: {
        type: D.ENUM(
            'CALL', 'WHATSAPP', 'EMAIL',
            'MEETING', 'CAMPUS_VISIT', 'OTHER'
        ),
        allowNull: false
    },

    remarks: { type: D.TEXT, allowNull: false },
    outcome: D.STRING(150),
    next_followup_at: D.DATE,

    contacted_at: {
        type: D.DATE,
        defaultValue: D.NOW
    }
});

// Status History
const LeadStatusHistory = define('lead_status_history', {
    institution_id: ref(),
    lead_id: ref(),
    changed_by: ref(),
    previous_status: D.STRING(50),
    new_status: { type: D.STRING(50), allowNull: false },
    remarks: D.TEXT
});

// Relationships
const relation = (parent, child, foreignKey, as) => {
    child.belongsTo(parent, { foreignKey, as, onDelete: 'RESTRICT' });
    parent.hasMany(child, { foreignKey, onDelete: 'RESTRICT' });
};

relation(Institution, Branch, 'institution_id', 'institution');
relation(Institution, User, 'institution_id', 'institution');
relation(Institution, AcademicSession, 'institution_id', 'institution');
relation(Institution, Program, 'institution_id', 'institution');
relation(Institution, LeadSource, 'institution_id', 'institution');
relation(Institution, Lead, 'institution_id', 'institution');
relation(Institution, LeadFollowup, 'institution_id', 'institution');
relation(Institution, LeadStatusHistory, 'institution_id', 'institution');

relation(Role, User, 'role_id', 'role');
relation(Branch, User, 'branch_id', 'branch');
relation(Branch, Program, 'branch_id', 'branch');
relation(Branch, Lead, 'branch_id', 'branch');

relation(AcademicSession, Lead, 'academic_session_id', 'session');
relation(Program, Lead, 'program_id', 'program');
relation(LeadSource, Lead, 'source_id', 'source');

Lead.belongsTo(User, {
    foreignKey: 'assigned_to',
    as: 'counsellor',
    onDelete: 'RESTRICT'
});

Lead.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator',
    onDelete: 'RESTRICT'
});

relation(Lead, LeadFollowup, 'lead_id', 'lead');
relation(User, LeadFollowup, 'user_id', 'user');
relation(Lead, LeadStatusHistory, 'lead_id', 'lead');
relation(User, LeadStatusHistory, 'changed_by', 'changedBy');

module.exports = {
    sequelize,
    Institution,
    Branch,
    Role,
    User,
    AcademicSession,
    Program,
    LeadSource,
    Lead,
    LeadFollowup,
    LeadStatusHistory
};
