export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { alienNumber, nationality } = req.query;
  if (!alienNumber || !nationality) {
    return res.status(400).json({ error: 'alienNumber and nationality required' });
  }

  const anum = String(alienNumber).replace(/\D/g, '').padStart(9, '0');
  const url = `https://acis.eoir.justice.gov/api/GetCaseInfo?alienNumber=${anum}&nationality=${encodeURIComponent(nationality)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://acis.eoir.justice.gov/en/caseInformation/',
        'Origin': 'https://acis.eoir.justice.gov',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(200).json({ success: false, status: response.status, raw: text });
    }

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({ success: true, data, status: response.status });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
