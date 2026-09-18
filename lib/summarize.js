const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

function fallbackSummary({ studentName, title }) {
  const firstName = studentName.split(' ')[0];
  return `${firstName}'s submission "${title}" is ready for review. Connect an AI key to draft a summary automatically, or write one below.`;
}

async function callClaude({ studentName, title, classOrTeam, year, rawDescription }) {
  const prompt = `You are helping a teacher build a student's portfolio artifact summary. ` +
    `Write a warm, specific, third-person summary (2-4 sentences, under 90 words) of the ` +
    `student's work below. Avoid generic praise ("did a great job") — mention concrete ` +
    `details from their description. Never invent achievements, grades, or claims that ` +
    `aren't supported by what the student wrote. This draft will be reviewed and edited by ` +
    `a teacher before it's shown to anyone, so it's fine to stay close to what they wrote.\n\n` +
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

// Returns { text, aiGenerated } — aiGenerated is false whenever the caller
// should show a "no AI key configured" badge instead of trusting the text
// as a real drafted summary.
async function generateSummary(input) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: fallbackSummary(input), aiGenerated: false };
  }
  try {
    return { text: await callClaude(input), aiGenerated: true };
  } catch (err) {
    console.error('AI summary failed, falling back:', err.message);
    return { text: fallbackSummary(input), aiGenerated: false };
  }
}

module.exports = { generateSummary };
