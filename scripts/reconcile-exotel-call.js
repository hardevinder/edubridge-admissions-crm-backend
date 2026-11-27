// Restricted maintenance CLI: no HTTP POST, no recording access, no new calls.
require('dotenv').config();
const sequelize = require('../config/database');
const { Lead, User } = require('../models');
const Log = require('../models/CrmCallLog');
const exotel = require('../services/exotelService');
const { Op } = require('sequelize');
const check = (ok, message) => { if (!ok) throw new Error(message); };
function dateIST(value) {
    if (typeof value !== 'string') return NaN;
    if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)) return Date.parse(value.replace(' ', 'T') + '+05:30');
    if (/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return Date.parse(value);
    return NaN;
}
async function main() {
    const [id, sid, flag, ...extra] = process.argv.slice(2);
    check(/^\d+$/.test(id || '') && /^[a-zA-Z0-9_-]{1,100}$/.test(sid || '') && (!flag || flag === '--apply') && !extra.length, 'Usage: node scripts/reconcile-exotel-call.js LOG_ID CALL_SID [--apply]');
    check(process.env.EXOTEL_TEST_ENABLED === 'false', 'Disable test calling before maintenance');
    const institution = process.env.EXOTEL_TEST_INSTITUTION_ID;
    check(/^\d+$/.test(institution || ''), 'Invalid test institution');
    const { EXOTEL_API_BASE_URL: base, EXOTEL_ACCOUNT_SID: account, EXOTEL_API_KEY: key, EXOTEL_API_TOKEN: token } = process.env;
    check(['https://api.exotel.com','https://api.in.exotel.com'].includes(base) && /^[\w-]+$/.test(account || '') && key && token, 'Invalid provider configuration');
    await sequelize.transaction(async t => {
        const row = await Log.findOne({where:{id,institution_id:institution,source:'EXOTEL',direction:'OUTBOUND'},transaction:t,lock:t.LOCK.UPDATE});
        check(row && row.status === 'UNKNOWN' && !row.completed_at && (!row.exotel_call_sid || row.exotel_call_sid === sid), 'No matching unresolved call');
        const user = await User.findOne({where:{id:row.user_id,institution_id:institution},attributes:['phone'],transaction:t});
        const lead = await Lead.findOne({where:{id:row.lead_id,institution_id:institution},attributes:['phone'],transaction:t});
        const from = exotel.normalize(user?.phone), to = exotel.normalize(lead?.phone);
        check(exotel.permitted(from,to), 'Participants do not match approved test list');
        const response = await fetch(`${base}/v1/Accounts/${account}/Calls/${sid}.json?details=true`, {method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(`${key}:${token}`).toString('base64')}});
        check(response.ok, 'Provider HTTP '+response.status);
        const {Call: call} = await response.json();
        check(call && call.Sid === sid && call.AccountSid === account && call.Direction === 'outbound-api', 'Provider identity or direction mismatch');
        check(exotel.normalize(call.From) === from && exotel.normalize(call.To) === to, 'Provider participants mismatch');
        const start = dateIST(call.StartTime), end = dateIST(call.EndTime);
        check(Number.isFinite(start) && Number.isFinite(end) && Math.abs(start-new Date(row.called_at).getTime()) <= 10000 && end >= start && end <= Date.now(), 'Provider timestamps do not match');
        const fields = exotel.map(call);
        check(['completed','failed','busy','no-answer'].includes(fields.provider_status) && ['ANSWERED','NO_ANSWER','BUSY','FAILED'].includes(fields.status), 'Provider outcome not definitive');
        const duplicate = await Log.findOne({where:{exotel_call_sid:sid,id:{[Op.ne]:row.id}},transaction:t});
        check(!duplicate, 'Provider reference already linked');
        console.log(JSON.stringify({log_id:row.id,status:fields.status,provider_status:fields.provider_status,duration_seconds:fields.duration_seconds,completed_at:new Date(end).toISOString(),mode:flag ? 'APPLY' : 'PREVIEW'},null,2));
        if (flag === '--apply') await row.update({...fields,exotel_call_sid:sid,completed_at:new Date(end),failure_reason:null},{transaction:t});
    });
    console.log(flag === '--apply' ? 'Reconciliation committed.' : 'Preview only; no database changes.');
}
main().catch(error => { console.error('Reconciliation stopped:', error.name === 'Error' && /^(Usage:|Disable |Invalid |No matching |Participants |Provider |Provider reference )/.test(error.message) ? error.message : 'Provider or database error'); process.exitCode=1; }).finally(()=>sequelize.close());
