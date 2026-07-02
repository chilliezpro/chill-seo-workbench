export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic protection — only our own frontend can call this
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    systemPrompt,
    userPrompt,
    requiredSections = [],
    temperature = 0.3,
    maxTokens = 1800
  } = req.body;

  const fullSystemPrompt = systemPrompt + buildSelfCheck(requiredSections);

  try {
    let output = await callClaude(fullSystemPrompt, userPrompt, temperature, maxTokens);
    let check = validateOutput(output, requiredSections);

    if (!check.valid) {
      const retryPrompt = userPrompt + `

IMPORTANT: Your previous response was missing these required
sections: ${check.missing.join(', ')}. Regenerate the FULL
response, following the exact format, with ALL required
sections present this time.`;
      output = await callClaude(fullSystemPrompt, retryPrompt, temperature, maxTokens);
    }

    res.status(200).json({ result: cleanOutput(output) });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Generation failed. Please try again.' });
  }
}

// ─── PROVIDER CALL — isolated here so swapping providers ───
// ─── later (Claude → Groq → OpenAI) only touches this fn ───
async function callClaude(systemPrompt, userPrompt, temperature, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function buildSelfCheck(requiredSections) {
  if (!requiredSections.length) return '';
  return `

SELF-CHECK (required before responding):
Before you output your final answer, verify:
1. Does the output include ALL of these exact section headers:
   ${requiredSections.join(', ')}?
2. Did you follow every formatting rule given above exactly?
3. Is every claim grounded in the actual source content provided
   — not invented or generic?
If any check fails, silently correct your response before
outputting it. Do not mention this self-check process.`;
}

function validateOutput(text, requiredSections) {
  if (!requiredSections.length) return { valid: true, missing: [] };
  const missing = requiredSections.filter(section =>
    !text.toUpperCase().includes(section.toUpperCase())
  );
  return { valid: missing.length === 0, missing };
}

function cleanOutput(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
