export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { alienNumber, nationality } = req.query;
  if (!alienNumber || !nationality) {
    return res.status(400).json({ error: 'Missing params' });
  }

  const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
  const url = `https://acis.eoir.justice.gov/api/GetCaseInfo?alienNumber=${anum}&nationality=${encodeURIComponent(nationality)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://acis.eoir.justice.gov/en/caseInformation/',
        'Origin': 'https://acis.eoir.justice.gov',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const text = await response.text();
    console.log('ACIS status:', response.status);
    console.log('ACIS response:', text.slice(0, 500));

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({ success: true, status: response.status, data });
  } catch (err) {
    console.error('fetch error:', err.message);
    return res.status(200).json({ success: false, error: err.message });
  }
}
