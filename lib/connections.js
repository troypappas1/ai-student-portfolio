const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

class NoApiKeyError extends Error {}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in AI response');
  return JSON.parse(text.slice(start, end + 1));
}

// Given a student's approved artifacts, asks Claude to find genuine thematic
// or skill connections between them (not every pair — only ones grounded in
// what's actually written) and a short narrative of growth over time.
// Returns { narrative, edges: [{from, to, label}] }. Never invents artifacts
// that aren't in the input list.
async function generateConnectionsMap({ studentName, artifacts }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new NoApiKeyError('ANTHROPIC_API_KEY is not configured');
  if (artifacts.length < 2) throw new Error('Need at least two approved artifacts to map connections');

  const list = artifacts
    .map((a) => `- id ${a.id} | ${a.academic_year} | ${a.context || 'Personal project'} | "${a.title}": ${a.summary}`)
    .join('\n');

  const prompt = `Below is ${studentName}'s approved portfolio artifacts, oldest first. Find genuine ` +
    `connections between them — shared skills, recurring interests, or visible growth from one to ` +
    `the next. Only connect artifacts where there's a real, specific link you can name; it's fine to ` +
    `leave some artifacts unconnected rather than invent a weak link. Do not invent facts, grades, or ` +
    `achievements beyond what's written below.\n\n${list}\n\n` +
    `Respond with ONLY a JSON object, no other text, in this exact shape:\n` +
    `{"narrative": "one short paragraph (2-3 sentences) describing the student's growth across these artifacts", ` +
    `"edges": [{"from": <id>, "to": <id>, "label": "short phrase naming the connection, under 8 words"}]}\n` +
    `Use only the ids listed above. Include at most ${Math.min(artifacts.length * 2, 20)} edges.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
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

  const parsed = extractJson(text);
  const validIds = new Set(artifacts.map((a) => a.id));
  const edges = (parsed.edges || []).filter(
    (e) => validIds.has(e.from) && validIds.has(e.to) && e.from !== e.to && e.label
  );
  return { narrative: parsed.narrative || '', edges };
}

module.exports = { generateConnectionsMap, NoApiKeyError };
