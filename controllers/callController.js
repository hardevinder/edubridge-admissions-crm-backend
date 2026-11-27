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
        source: 'MANUAL', called_at: { [Op.gte]: start, [Op.lte]: end } },
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

const exotel = require('../services/exotelService');
const sequelize = require('../config/database');
exports.testConnect = wrap(async (req, res) => {
    if (!exotel.enabledFor(req.institutionId)) return reject(res, 403, 'Test calling disabled');
    if (req.body?.participants_consented !== true) return reject(res, 400, 'Both test participants must agree to the call');
    const row = await sequelize.transaction(async t => {
        const user = await User.findOne({where:{id:req.user.id,institution_id:req.institutionId,is_active:true}, attributes:['id','phone'], transaction:t, lock:t.LOCK.UPDATE});
        if (!user) return null;
        const lead = await Lead.findOne({where:{...leadScope(req),id:req.params.leadId}, attributes:['id','phone'], transaction:t, lock:t.LOCK.UPDATE});
        if (!lead) return null;
        const from = exotel.normalize(user.phone), to = exotel.normalize(lead.phone);
        if (!exotel.permitted(from,to)) return null;
        const pending = await CrmCallLog.findOne({where:{institution_id:req.institutionId,user_id:user.id,source:'EXOTEL', [Op.or]:[{completed_at:null},{called_at:{[Op.gte]:new Date(Date.now()-60000)}}]},transaction:t});
        if (pending) return null;
        const log = await CrmCallLog.create({institution_id:req.institutionId,lead_id:lead.id,user_id:user.id,direction:'OUTBOUND',status:'INITIATED',source:'EXOTEL',called_at:new Date(),initiated_at:new Date(),recording_consent:false}, {transaction:t});
        return {log,from,to};
    });
    if (!row) return reject(res, 409, 'Test participants not approved or another call is pending');
    try {
        const call = await exotel.connect(row.from,row.to,req.institutionId);
        // Persist the verified SID before mapping status so a mapping failure is recoverable.
        await row.log.update({exotel_call_sid:call.Sid});
        const fields = exotel.map(call);
        if (['failed','busy','no-answer'].includes(fields.provider_status) || (fields.provider_status === 'completed' && fields.status !== 'UNKNOWN')) fields.completed_at = new Date();
        await row.log.update(fields);
    } catch (error) {
        const reason = exotel.safeError(error);
        console.warn('[exotel] connect log=%d: %s', row.log.id, reason);
        await row.log.update({status:'UNKNOWN',failure_reason:reason + '; reconcile in provider dashboard before retrying'});
        return reject(res, 502, 'Provider result uncertain; do not retry until reconciled');
    }
    res.status(201).json({success:true,data:row.log});
});
exports.refresh = wrap(async (req,res) => {
    if (!exotel.enabledFor(req.institutionId)) return reject(res,403,'Test calling disabled');
    const lead = await accessibleLead(req);
    if (!lead || !/^\d+$/.test(req.params.callId)) return reject(res,404,'Call not found');
    const row = await CrmCallLog.findOne({where:{id:req.params.callId,lead_id:lead.id,institution_id:req.institutionId,user_id:req.user.id,source:'EXOTEL'}});
    if (!row || !row.exotel_call_sid) return reject(res,404,'Call not found or requires reconciliation');
    let call;
    try { call = await exotel.details(row.exotel_call_sid,req.institutionId); }
    catch (error) {
        console.warn('[exotel] refresh log=%d: %s', row.id, exotel.safeError(error));
        return reject(res,502,'Unable to refresh provider status');
    }
    const fields = exotel.map(call);
    if (['failed','busy','no-answer'].includes(fields.provider_status) || (fields.provider_status === 'completed' && fields.status !== 'UNKNOWN')) {
        fields.completed_at = row.completed_at || new Date();
        fields.failure_reason = null;
    }
    // Do not overwrite terminal state with a delayed non-terminal response.
    if (row.completed_at && !fields.completed_at) return res.json({success:true,data:row});
    await row.update(fields);
    res.json({success:true,data:row});
});
