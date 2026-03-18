const https = require('https');

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: { raw } }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers: headers || {} };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, text: raw, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, text: raw, data: null }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const NAT = {
  'Brazil':'BR','Mexico':'MX','Guatemala':'GT','Honduras':'HN',
  'El Salvador':'SV','Colombia':'CO','Venezuela':'VE','Cuba':'CU',
  'Haiti':'HT','Dominican Republic':'DO','Ecuador':'EC','Peru':'PE',
  'Nicaragua':'NI','India':'IN','China':'CN','Philippines':'PH',
  'Jamaica':'JM','Other':'XX'
};
const CAPTCHA_KEY = 'b4e108a1f4e9c82e8b47330fa68e98b9';
const SITE_KEY = 'b46c896b-8715-4099-8b60-b80e5b77c54e';
const PAGE_URL = 'https://acis.eoir.justice.gov/en/caseInformation/';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, alienNumber, nationality, taskId } = req.query;

  // ACTION: start — cria tarefa no 2captcha
  if (action === 'start') {
    if (!alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });
    try {
      const r = await httpsPost('api.2captcha.com', '/createTask', {
        clientKey: CAPTCHA_KEY,
        task: { type: 'HCaptchaTaskProxyless', websiteURL: PAGE_URL, websiteKey: SITE_KEY }
      });
      console.log('createTask response:', JSON.stringify(r.data));
      if (r.data.errorId !== 0) {
        return res.status(200).json({ success: false, error: r.data.errorDescription || 'createTask failed', raw: r.data });
      }
      return res.status(200).json({ success: true, taskId: r.data.taskId });
    } catch (e) {
      console.error('createTask error:', e.message);
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  // ACTION: finish — busca resultado e chama ACIS
  if (action === 'finish') {
    if (!taskId || !alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });
    try {
      const r = await httpsPost('api.2captcha.com', '/getTaskResult', {
        clientKey: CAPTCHA_KEY,
        taskId: parseInt(taskId)
      });
      console.log('getTaskResult response:', JSON.stringify(r.data));

      if (r.data.status === 'processing') {
        return res.status(200).json({ success: false, pending: true });
      }
      if (r.data.errorId !== 0 || r.data.status !== 'ready') {
        return res.status(200).json({ success: false, error: r.data.errorDescription || 'not ready', raw: r.data });
      }

      const captchaToken = r.data.solution?.gRecaptchaResponse;
      if (!captchaToken) {
        return res.status(200).json({ success: false, error: 'No token in solution', raw: r.data });
      }

      // Chama ACIS com o token
      const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
      const natCode = NAT[nationality] || 'XX';
      const acispath = `/api/Case/GetCaseInfo?alienNumber=${anum}&languageCode=EN&natCode=${natCode}`;

      const acisR = await httpsGet('eoir-ws.eoir.justice.gov', acispath, {
        'Accept': '*/*',
        'Origin': 'https://acis.eoir.justice.gov',
        'Referer': 'https://acis.eoir.justice.gov/',
        'Captcha-Token': captchaToken,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });

      console.log('ACIS STATUS:', acisR.status);
      console.log('ACIS RAW:', acisR.text.slice(0, 400));

      if (!acisR.data) {
        return res.status(200).json({ success: false, error: 'Invalid JSON from ACIS', raw: acisR.text.slice(0, 300) });
      }

      const dd = acisR.data?.Data;
      const s = acisR.data?.Schedule;

      if (!dd) return res.status(200).json({ success: false, error: 'No Data field', raw: acisR.text.slice(0, 300) });
      if (dd.ValidAlienNumber === false) return res.status(200).json({ success: true, found: false });

      const fmt = (iso) => {
        if (!iso) return null;
        const dt = new Date(iso);
        return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear();
      };

      const cal = { 'M': 'MASTER', 'I': 'INDIVIDUAL', 'B': 'BOND' };
      const med = { 'P': 'IN PERSON', 'V': 'VIDEO', 'T': 'TELEPHONIC' };

      return res.status(200).json({
        success: true, found: true,
        name: dd.AlienName,
        hearingDate: fmt(s?.AdjDate || dd.LatestHearingDate),
        hearingTime: s?.AdjTime || dd.LatestHearingTime || null,
        hearingType: cal[s?.CalType || dd.LatestCalType] || s?.CalType || null,
        medium: med[s?.HearingMedium] || null,
        judge: s?.IJ_Name || null,
        court: s?.HearingLocationAddress ? s.HearingLocationAddress.replace(/\|/g, ', ') : null,
      });
    } catch (e) {
      console.error('finish error:', e.message);
      return res.status(200).json({ success: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use action=start or action=finish' });
};
