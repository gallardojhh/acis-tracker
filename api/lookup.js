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

  const { alienNumber, nationality } = req.query;
  if (!alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });

  const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
  const natCode = NAT_CODES[nationality] || 'XX';
  const acisUrl = `https://eoir-ws.eoir.justice.gov/api/Case/GetCaseInfo?alienNumber=${anum}&languageCode=EN&natCode=${natCode}`;

  return new Promise((resolve) => {
    const parsed = new URL(acisUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://acis.eoir.justice.gov',
        'Referer': 'https://acis.eoir.justice.gov/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        console.log('ACIS STATUS:', response.statusCode);
        console.log('ACIS RAW:', data.slice(0, 800));

        let json;
        try { json = JSON.parse(data); } catch { 
          return res.status(200).json({ success: false, raw: data.slice(0, 500) }), resolve();
        }

        const d = json.Data;
        const s = json.Schedule;

        if (!d || !d.ValidAlienNumber) {
          return res.status(200).json({ success: true, found: false, message: 'A-Number not found' }), resolve();
        }

        const fmtDate = (iso) => {
          if (!iso) return null;
          const dt = new Date(iso);
          return (dt.getMonth()+1) + '/' + dt.getDate() + '/' + dt.getFullYear();
        };

        const calTypes = { 'M': 'MASTER', 'I': 'INDIVIDUAL', 'B': 'BOND', 'R': 'RESCHEDULED' };
        const mediums = { 'P': 'IN PERSON', 'V': 'VIDEO', 'T': 'TELEPHONIC' };

        res.status(200).json({
          success: true,
          found: true,
          name: d.AlienName,
          hearingDate: fmtDate(s?.AdjDate || d.LatestHearingDate),
          hearingTime: s?.AdjTime || d.LatestHearingTime || null,
          hearingType: calTypes[s?.CalType || d.LatestCalType] || s?.CalType || null,
          medium: mediums[s?.HearingMedium] || null,
          judge: s?.IJ_Name || null,
          court: s?.HearingLocationAddress ? s.HearingLocationAddress.replace(/\|/g, ', ') : null,
          webex: s?.IJ_WebExURLLink || null,
        });
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('ACIS ERROR:', err.message);
      res.status(200).json({ success: false, error: err.message });
      resolve();
    });

    request.end();
  });
};
