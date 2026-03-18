module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, alienNumber, nationality, taskId } = req.query;

  const NAT_CODES = {
    'Brazil':'BR','Mexico':'MX','Guatemala':'GT','Honduras':'HN',
    'El Salvador':'SV','Colombia':'CO','Venezuela':'VE','Cuba':'CU',
    'Haiti':'HT','Dominican Republic':'DO','Ecuador':'EC','Peru':'PE',
    'Nicaragua':'NI','India':'IN','China':'CN','Philippines':'PH',
    'Jamaica':'JM','Other':'XX'
  };

  const CAPTCHA_KEY = 'b4e108a1f4e9c82e8b47330fa68e98b9';
  const SITE_KEY = 'b46c896b-8715-4099-8b60-b80e5b77c54e';
  const PAGE_URL = 'https://acis.eoir.justice.gov/en/caseInformation/';

  // ACTION: start — cria tarefa no 2captcha
  if (action === 'start') {
    if (!alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });
    const r = await fetch('https://api.2captcha.com/createTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: CAPTCHA_KEY,
        task: { type: 'HCaptchaTaskProxyless', websiteURL: PAGE_URL, websiteKey: SITE_KEY }
      })
    });
    const d = await r.json();
    console.log('createTask:', JSON.stringify(d));
    if (d.errorId !== 0) return res.status(200).json({ success: false, error: d.errorDescription || 'createTask failed', raw: d });
    return res.status(200).json({ success: true, taskId: d.taskId });
  }

  // ACTION: finish — busca resultado e chama ACIS
  if (action === 'finish') {
    if (!taskId || !alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });
    const r = await fetch('https://api.2captcha.com/getTaskResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: CAPTCHA_KEY, taskId: parseInt(taskId) })
    });
    const d = await r.json();
    console.log('getTaskResult:', JSON.stringify(d));
    if (d.status === 'processing') return res.status(200).json({ success: false, pending: true });
    if (d.errorId !== 0 || d.status !== 'ready') return res.status(200).json({ success: false, error: d.errorDescription || 'failed', raw: d });

    const captchaToken = d.solution?.gRecaptchaResponse;
    if (!captchaToken) return res.status(200).json({ success: false, error: 'No token', raw: d });

    const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
    const natCode = NAT_CODES[nationality] || 'XX';
    const acisUrl = `https://eoir-ws.eoir.justice.gov/api/Case/GetCaseInfo?alienNumber=${anum}&languageCode=EN&natCode=${natCode}`;

    const acisR = await fetch(acisUrl, {
      headers: {
        'Accept': '*/*',
        'Origin': 'https://acis.eoir.justice.gov',
        'Referer': 'https://acis.eoir.justice.gov/',
        'Captcha-Token': captchaToken,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    });

    const text = await acisR.text();
    console.log('ACIS STATUS:', acisR.status, 'RAW:', text.slice(0, 400));

    let data;
    try { data = JSON.parse(text); } catch { return res.status(200).json({ success: false, error: 'Invalid JSON', raw: text.slice(0, 300) }); }

    const dd = data?.Data;
    const s = data?.Schedule;
    if (!dd) return res.status(200).json({ success: false, error: 'No Data field', raw: text.slice(0, 300) });
    if (dd.ValidAlienNumber === false) return res.status(200).json({ success: true, found: false });

    const fmtDate = (iso) => { if (!iso) return null; const dt = new Date(iso); return (dt.getMonth()+1)+'/'+dt.getDate()+'/'+dt.getFullYear(); };
    const calTypes = { 'M':'MASTER','I':'INDIVIDUAL','B':'BOND' };
    const mediums = { 'P':'IN PERSON','V':'VIDEO','T':'TELEPHONIC' };

    return res.status(200).json({
      success: true, found: true,
      name: dd.AlienName,
      hearingDate: fmtDate(s?.AdjDate || dd.LatestHearingDate),
      hearingTime: s?.AdjTime || dd.LatestHearingTime || null,
      hearingType: calTypes[s?.CalType || dd.LatestCalType] || s?.CalType || null,
      medium: mediums[s?.HearingMedium] || null,
      judge: s?.IJ_Name || null,
      court: s?.HearingLocationAddress ? s.HearingLocationAddress.replace(/\|/g, ', ') : null,
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
