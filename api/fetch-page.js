export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Source page returned ${response.status}`
      });
    }

    let html = await response.text();

    // Strip noise tags and their content
    html = html.replace(/<(script|style|nav|footer|header|aside|noscript|iframe|form|svg|figure|picture)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // Strip remaining tags
    let text = html.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    // Collapse whitespace
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

    if (text.length > 3500) {
      text = text.substring(0, 3500) + '...';
    }

    res.status(200).json({ text });
  } catch (error) {
    console.error('Fetch-page error:', error);
    res.status(500).json({
      error: 'Could not reach the source page. It may be blocking automated requests, or the URL may be incorrect.'
    });
  }
}
