// /api/ai.js — Vercel serverless function.
//
// IMPORTANT — read this if the AI feature isn't answering:
// The app used to rely on a random public "free API" (felix-rdx-unlimited-free-apis).
// That service now returns HTTP 402 (Payment Required) — it has stopped being free.
// No amount of code fixing on our side can make someone else's paid-only API answer
// for free, so this function now talks to Google's official Gemini API instead.
//
// SETUP (one-time, ~2 minutes):
// 1. Get a free Gemini API key: https://aistudio.google.com/apikey  (Google's free tier
//    is generous and needs no credit card for normal personal-app usage).
// 2. In your Vercel project: Settings -> Environment Variables -> add
//      Name:  GEMINI_API_KEY
//      Value: <paste the key>
//    then redeploy (Vercel -> Deployments -> ... -> Redeploy).
// 3. That's it -- this function will automatically use the real Gemini API once the key
//    is present. Until then, it still tries the old free API as a last resort (which may
//    or may not work, since that one is now paid).

const GEMINI_MODEL = 'gemini-2.0-flash';
const REBIX_BASE = 'https://api-rebix.vercel.app/api/gemini';
const FELIX_BASE = 'https://felix-rdx-unlimited-free-apis.vercel.app/api/v1/api/';

async function fetchWithTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms || 25000);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(to);
  }
}

async function askGemini(key, q, sys) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: q }] }],
    systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
  };
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || 'Gemini error ' + r.status);
  const text = (j && j.candidates && j.candidates[0] && j.candidates[0].content &&
    j.candidates[0].content.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error('Gemini returned an empty answer');
  return text;
}

async function askRebix(q, sys) {
  const text = (sys || '') + (sys ? '\n\n' : '') + (q || '');
  const url = `${REBIX_BASE}?q=${encodeURIComponent(text)}`;
  const r = await fetchWithTimeout(url, {});
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch (e) { j = raw; }
  if (!r.ok) throw new Error('Rebix HTTP ' + r.status);
  const val = typeof j === 'string' ? j : (j.message || j.response || j.result || j.answer || j.text);
  if (!val) throw new Error('Rebix returned no text');
  return val;
}

async function askFelix(prov, q, sys) {
  const text = (sys || '') + (sys ? '\n\n' : '') + (q || '');
  const enc = encodeURIComponent;
  const url =
    prov === 'r1' ? `${FELIX_BASE}deepseek-r1?q=${enc(text)}` :
    prov === 'gpt' ? `${FELIX_BASE}gptlogic?q=${enc(q || '')}&prompt=${enc(sys || '')}` :
    `${FELIX_BASE}gemini?q=${enc(text)}`;
  const r = await fetchWithTimeout(url, {});
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch (e) { j = raw; }
  if (!r.ok) throw new Error('Felix HTTP ' + r.status);
  if (typeof j === 'string') return j;
  const val = j.message || j.response || j.result || j.answer || j.text || j.reply || j.output ||
    (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
  if (!val) throw new Error('Felix returned no text');
  return val;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { prov, q, sys } = req.query || {};

  if (!q) {
    res.status(400).json({ error: 'missing q' });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  const attempts = [];
  if (key) attempts.push(() => askGemini(key, String(q), String(sys || '')));
  attempts.push(() => askRebix(String(q), String(sys || '')));
  attempts.push(() => askFelix(String(prov || 'gemini'), String(q), String(sys || '')));

  const errors = [];
  for (const attempt of attempts) {
    try {
      const text = await attempt();
      res.status(200).send(JSON.stringify({ message: text }));
      return;
    } catch (e) {
      errors.push(e && e.message);
    }
  }

  res.status(502).json({
    error: 'All AI backends failed: ' + errors.join(' | ') +
      (key ? '' : '. For a permanent fix, add a free key from https://aistudio.google.com/apikey as GEMINI_API_KEY in Vercel.'),
  });
};
