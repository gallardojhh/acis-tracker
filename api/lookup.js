const https = require('https');
const { URL } = require('url');

const NAT_CODES = {
  'Brazil': 'BR', 'Mexico': 'MX', 'Guatemala': 'GT', 'Honduras': 'HN',
  'El Salvador': 'SV', 'Colombia': 'CO', 'Venezuela': 'VE', 'Cuba': 'CU',
  'Haiti': 'HT', 'Dominican Republic': 'DO', 'Ecuador': 'EC', 'Peru': 'PE',
  'Nicaragua': 'NI', 'India': 'IN', 'China': 'CN', 'Philippines': 'PH',
  'Jamaica': 'JM', 'Other': 'XX'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { alienNumber, nationality, captchaToken } = req.query;
  if (!alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });

  const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
  const natCode = NAT_CODES[nationality] || 'XX';
  const acisUrl = `https://eoir-ws.eoir.justice.gov/api/Case/GetCaseInfo?alienNumber=${anum}&languageCode=EN&natCode=${natCode}`;

  return new Promise((resolve) => {
    const parsed = new URL(acisUrl);
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://acis.eoir.justice.gov',
      'Referer': 'https://acis.eoir.justice.gov/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    if (captchaToken) headers['Captcha-Token'] = captchaToken;

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        console.log('STATUS:', response.statusCode);
        console.log('RAW:', data.slice(0, 500));
        let parsed2;
        try { parsed2 = JSON.parse(data); } catch { parsed2 = { raw: data }; }

        if (!parsed2 || !parsed2.Data) {
          return res.status(200).json({ success: false, status: response.statusCode, raw: data.slice(0, 500) });
          resolve();
          return;
        }

        const d = parsed2.Data;
        const s = parsed2.Schedule;

        const result = {
          success: true,
          name: d.AlienName,
          hearingDate: s?.AdjDate ? new Date(s.AdjDate).toLocaleDateString('en-US') : null,
          hearingTime: s?.AdjTime || null,
          hearingType: s?.CalType === 'M' ? 'MASTER' : s?.CalType || null,
          judge: s?.IJ_Name || null,
          court: s?.HearingLocationAddress ? s.HearingLocationAddress.replace(/\|/g, ', ') : null,
          medium: s?.HearingMedium === 'P' ? 'IN PERSON' : s?.HearingMedium || null,
        };

        res.status(200).json(result);
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('Error:', err.message);
      res.status(200).json({ success: false, error: err.message });
      resolve();
    });

    request.end();
  });
};
