// Vercel Edge Function: combined live gold/silver spot price (USD) + forex rates,
// for the Zakat calculator. Both upstream sources are free/no-key; this endpoint
// exists because open.er-api.com does not send CORS headers, so the browser can't
// call it directly, and to let us cache/rate-limit upstream calls sensibly.
export const config = { runtime: 'edge' };
const CUR = ['USD','BDT','SAR','AED','INR','PKR','GBP','EUR','MYR','IDR','TRY','CAD','AUD','QAR','KWD','SGD','EGP','JOD','OMR','BHD'];
export default async function handler() {
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  try {
    const [gj, sj, fj] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('https://api.gold-api.com/price/XAG').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('https://open.er-api.com/v6/latest/USD').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (!gj || !gj.price) throw new Error('gold unavailable');
    const fx = { USD: 1 };
    if (fj && fj.rates) for (const c of CUR) if (fj.rates[c]) fx[c] = fj.rates[c];
    const body = {
      ts: new Date().toISOString(),
      gold_usd_oz: gj.price,
      silver_usd_oz: sj && sj.price ? sj.price : null,
      fx,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...cors, 'cache-control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: cors });
  }
}
