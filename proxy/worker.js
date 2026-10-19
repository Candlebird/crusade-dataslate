/**
 * CORS proxy for Army Forge, so the app can fetch army books in the browser.
 * Only forwards GET requests to army-forge.onepagerules.com/api/…; anything else is refused.
 * Usage: https://<worker>.workers.dev/?url=<encoded Army Forge API url>
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const reply = (body, status) => new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain' } });

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET') return reply('Only GET is allowed', 405);

    let target;
    try {
      target = new URL(new URL(req.url).searchParams.get('url') ?? '');
    } catch {
      return reply('Pass the Army Forge API url as ?url=', 400);
    }
    if (target.origin !== 'https://army-forge.onepagerules.com' || !target.pathname.startsWith('/api/'))
      return reply('Only Army Forge API requests are allowed', 403);

    const res = await fetch(target, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 300 } });
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  },
};
