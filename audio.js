// Vercel Edge Function: CORS-friendly audio proxy so every host can be saved for offline use.
// Usage from the app: /api/audio?u=<encoded https URL>. Only Islamic audio hosts are allowed.
export const config = { runtime: 'edge' };
const ALLOW = /^(.+\.)?(everyayah\.com|islamic\.network|aladhan\.com|archive\.org|mp3quran\.net|qurango\.net|quranicaudio\.com|quran\.com)$/i;
export default async function handler(req) {
  const url = new URL(req.url);
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length,content-range,accept-ranges' };
  if (url.searchParams.get('ping')) return new Response('ok', { headers: cors });
  let t;
  try { t = new URL(url.searchParams.get('u')); } catch (e) { return new Response('bad url', { status: 400, headers: cors }); }
  if (!/^https?:$/.test(t.protocol) || !ALLOW.test(t.hostname)) return new Response('forbidden host', { status: 403, headers: cors });
  const h = new Headers();
  const range = req.headers.get('range');
  if (range) h.set('range', range);
  const r = await fetch(t.toString(), { headers: h, redirect: 'follow' });
  const out = new Headers(cors);
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = r.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set('cache-control', 'public, max-age=86400, s-maxage=2592000');
  if (url.searchParams.get('dl')) {
    const nm = (url.searchParams.get('name') || 'audio.mp3').replace(/[^\w.\- ]+/g, '_');
    out.set('content-disposition', 'attachment; filename="' + nm + '"');
  }
  return new Response(r.body, { status: r.status, headers: out });
}
