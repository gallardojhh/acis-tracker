const https = require('https');
const { URL } = require('url');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { alienNumber, nationality } = req.query;
  if (!alienNumber || !nationality) return res.status(400).json({ error: 'Missing params' });

  const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
  const acisUrl = `https://acis.eoir.justice.gov/api/GetCaseInfo?alienNumber=${anum}&nationality=${encodeURIComponent(nationality)}`;

  return new Promise((resolve) => {
    const parsed = new URL(acisUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://acis.eoir.justice.gov/en/caseInformation/',
        'Origin': 'https://acis.eoir.justice.gov',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        console.log('STATUS:', response.statusCode);
        console.log('RAW:', data.slice(0, 1000));
        let parsed2;
        try { parsed2 = JSON.parse(data); } catch { parsed2 = null; }
        // Retorna tudo — raw e parsed
        res.status(200).json({ 
          success: true, 
          status: response.statusCode, 
          raw: data.slice(0, 2000),
          data: parsed2 
        });
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(200).json({ success: false, error: err.message });
      resolve();
    });

    request.end();
  });
};
```

Depois de fazer commit, abre no Chrome:
```
https://acis-tracker.vercel.app/api/lookup?alienNumber=246749387&nationality=Brazil
