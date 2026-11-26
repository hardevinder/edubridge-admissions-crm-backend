const normalize = value => {
    const s = String(value || '').trim().replace(/[\s()-]/g, '');
    if (/^[6-9]\d{9}$/.test(s)) return '+91' + s;
    if (/^0[6-9]\d{9}$/.test(s)) return '+91' + s.slice(1);
    if (/^91[6-9]\d{9}$/.test(s)) return '+' + s;
    return /^\+91[6-9]\d{9}$/.test(s) ? s : null;
};
function enabledFor(institutionId) {
    return process.env.EXOTEL_TEST_ENABLED === 'true' && /^\d+$/.test(process.env.EXOTEL_TEST_INSTITUTION_ID || '') && String(institutionId) === process.env.EXOTEL_TEST_INSTITUTION_ID;
}
function permitted(from, to) {
    const allow = (process.env.EXOTEL_TEST_NUMBERS || '').split(',').map(normalize).filter(Boolean);
    return !!from && !!to && from !== to && allow.includes(from) && allow.includes(to);
}
async function request(path, params) {
    const { EXOTEL_API_BASE_URL: base, EXOTEL_ACCOUNT_SID: sid, EXOTEL_API_KEY: key, EXOTEL_API_TOKEN: token } = process.env;
    if (!['https://api.exotel.com', 'https://api.in.exotel.com'].includes(base) || !/^[\w-]+$/.test(sid || '') || !key || !token) throw new Error('Invalid provider configuration');
    const response = await fetch(`${base}/v1/Accounts/${sid}${path}`, {
        method: params ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${token}`).toString('base64'), ...(params ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) },
        ...(params ? {body: new URLSearchParams(params)} : {})
    });
    if (!response.ok) throw new Error('Provider HTTP ' + response.status);
    const data = await response.json();
    if (!data.Call || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.Call.Sid || '') || String(data.Call.AccountSid) !== sid) throw new Error('Unexpected provider response');
    return data.Call;
}
exports.normalize = normalize;
exports.enabledFor = enabledFor;
exports.permitted = permitted;
exports.connect = (from, to, institutionId) => {
    if (!enabledFor(institutionId) || !permitted(from, to)) throw new Error('Test calling not permitted');
    const caller = process.env.EXOTEL_CALLER_ID;
    if (!/^\+?\d{10,13}$/.test(caller || '')) throw new Error('Invalid caller ID');
    return request('/Calls/connect', {From:from, To:to, CallerId:caller, Record:'false', TimeLimit:'120', TimeOut:'25'});
};
exports.details = async (sid, institutionId) => {
    if (!enabledFor(institutionId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(sid || '')) throw new Error('Test refresh not permitted');
    const call = await request(`/Calls/${sid}.json?details=true`);
    if (call.Sid !== sid) throw new Error('Provider SID mismatch');
    return call;
};
exports.map = call => {
    const p = String(call.Status || '').toLowerCase().slice(0,50);
    const raw = call.Details?.ConversationDuration;
    const seconds = raw != null && raw !== '' && Number.isInteger(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 86400 ? Number(raw) : null;
    const map = {queued:'INITIATED', ringing:'RINGING', 'in-progress':'IN_PROGRESS', failed:'FAILED', busy:'BUSY', 'no-answer':'NO_ANSWER'};
    let status = map[p] || 'UNKNOWN';
    if (p === 'completed') {
        const leg = String(call.Details?.Leg2Status || '').toLowerCase();
        status = seconds > 0 ? 'ANSWERED' : ({busy:'BUSY','no-answer':'NO_ANSWER',failed:'FAILED'}[leg] || 'UNKNOWN');
    }
    return {provider_status:p || null, status, duration_seconds:status === 'ANSWERED' ? seconds : 0};
};
