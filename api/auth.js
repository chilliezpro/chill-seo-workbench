export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, workspace } = req.body;
  if (!password || !workspace) {
    return res.status(400).json({ error: 'Password and workspace required' });
  }

  const validPasswords = {
    asn: process.env.ASN_PORTAL_PASSWORD,
    ssp: process.env.SSP_PORTAL_PASSWORD
  };

  const correctPassword = validPasswords[workspace];
  if (!correctPassword) {
    return res.status(400).json({ error: 'Invalid workspace' });
  }

  if (password !== correctPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const sessionToken = Buffer.from(
    workspace + ':' + Date.now() + ':' + process.env.INTERNAL_SECRET
  ).toString('base64');

  res.status(200).json({ token: sessionToken });
}
