const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

function fallbackSummary({ studentName, title, classOrTeam, rawDescription }) {
  const firstName = studentName.split(' ')[0];
  const trimmed = rawDescription.trim().replace(/\s+/g, ' ');
  const clipped = trimmed.length > 220 ? trimmed.slice(0, 217) + '...' : trimmed;
  const context = classOrTeam ? ` for ${classOrTeam}` : '';
  return `[Draft — no AI key configured] ${firstName} submitted "${title}"${context}. In their own words: ${clipped}`;
}

async function callClaude({ studentName, title, classOrTeam, year, rawDescription }) {
  const prompt = `You are helping a teacher build a student's portfolio artifact summary. ` +
    `Write a warm, specific, third-person summary (2-4 sentences, under 90 words) of the ` +
    `student's work below. Avoid generic praise ("did a great job") — mention concrete ` +
    `details from their description. This draft will be reviewed and edited by a teacher ` +
    `before it's shown to anyone, so it's fine to stay close to what they wrote.\n\n` +
    `Student: ${studentName}\n` +
    `Artifact title: ${title}\n` +
    `Class/team: ${classOrTeam || '(not specified)'}\n` +
    `Year: ${year}\n` +
    `Student's own description:\n${rawDescription}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content?.map((block) => block.text).join('').trim();
  if (!text) throw new Error('Anthropic API returned no text');
  return text;
}

async function generateSummary(input) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackSummary(input);
  }
  try {
    return await callClaude(input);
  } catch (err) {
    console.error('AI summary failed, falling back:', err.message);
    return fallbackSummary(input);
  }
}

module.exports = { generateSummary };
