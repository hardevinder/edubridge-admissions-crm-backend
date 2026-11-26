const { Op } = require('sequelize');
const { Lead, User } = require('../models');
const CrmCallLog = require('../models/CrmCallLog');
const managers = ['DIRECTOR', 'ADMISSION_HEAD'];
const statuses = ['ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MISSED'];
const directions = ['INBOUND', 'OUTBOUND'];
const wrap = fn => async (req, res, next) => {
    try { await fn(req, res); } catch (error) { next(error); }
};
const reject = (res, status, message) => res.status(status).json({ success: false, message });
function leadScope(req) {
    return { institution_id: req.institutionId,
        ...(req.user.role === 'COUNSELLOR' ? { assigned_to: req.user.id } : {}) };
}
async function accessibleLead(req) {
    if (!/^\d+$/.test(req.params.leadId) || Number(req.params.leadId) > 4294967295) return null;
    return Lead.findOne({ where: { ...leadScope(req), id: req.params.leadId }, attributes: ['id'] });
}
exports.list = wrap(async (req, res) => {
    const lead = await accessibleLead(req);
    if (!lead) return reject(res, 404, 'Lead not found');
    const rows = await CrmCallLog.findAll({ where: {
        institution_id: req.institutionId, lead_id: lead.id,
        ...(managers.includes(req.user.role) ? {} : { user_id: req.user.id })
    }, order: [['called_at', 'DESC'], ['id', 'DESC']], limit: 200 });
    res.json({ success: true, data: rows });
});
exports.create = wrap(async (req, res) => {
    const lead = await accessibleLead(req);
    if (!lead) return reject(res, 404, 'Lead not found');
    const { direction, status, duration_seconds = 0, called_at, remarks = null } = req.body || {};
    const when = called_at == null ? new Date() : new Date(called_at);
    if (!directions.includes(direction) || !statuses.includes(status) ||
        !Number.isInteger(duration_seconds) || duration_seconds < 0 || duration_seconds > 86400 ||
        (status !== 'ANSWERED' && duration_seconds !== 0) ||
        (called_at != null && (typeof called_at !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(called_at))) ||
        !Number.isFinite(when.getTime()) || when.getTime() > Date.now() + 60000 ||
        (remarks !== null && (typeof remarks !== 'string' || remarks.length > 1000))) {
        return reject(res, 400, 'Invalid call details');
    }
    const row = await CrmCallLog.create({ institution_id: req.institutionId, lead_id: lead.id,
        user_id: req.user.id, direction, status, duration_seconds, called_at: when,
        remarks: remarks?.trim() || null, source: 'MANUAL' });
    res.status(201).json({ success: true, data: row });
});
exports.summary = wrap(async (req, res) => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const rows = await CrmCallLog.findAll({ where: { institution_id: req.institutionId,
        called_at: { [Op.gte]: start, [Op.lte]: end } },
        attributes: ['user_id', 'status', 'duration_seconds'], raw: true });
    const map = new Map();
    for (const row of rows) {
        const item = map.get(row.user_id) || { user_id: row.user_id, total_calls: 0, answered_calls: 0, duration_seconds: 0 };
        item.total_calls++;
        if (row.status === 'ANSWERED') item.answered_calls++;
        item.duration_seconds += Number(row.duration_seconds);
        map.set(row.user_id, item);
    }
    const users = await User.findAll({ where: { institution_id: req.institutionId, id: { [Op.in]: [...map.keys()] } }, attributes: ['id', 'name'], raw: true });
    const names = new Map(users.map(u => [u.id, u.name]));
    const data = [...map.values()].map(item => ({ ...item, name: names.get(item.user_id) || null,
        answer_rate: Math.round(1000 * item.answered_calls / item.total_calls) / 10 }));
    res.json({ success: true, source: 'MANUAL', from: start, to: end, data });
});
