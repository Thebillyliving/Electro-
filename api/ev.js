// Rocero visitor insights. Counts searches and product views per Nigerian state.
// The browser sends only a search word or a product id. The state comes from Vercel's own
// location headers (no tracking scripts, no personal data stored, no IP stored).
const { token, FS, PROJECT } = require('./paystack.js').h;
const NG = { AB: 'Abia', AD: 'Adamawa', AK: 'Akwa Ibom', AN: 'Anambra', BA: 'Bauchi', BY: 'Bayelsa', BE: 'Benue', BO: 'Borno', CR: 'Cross River', DE: 'Delta', EB: 'Ebonyi', ED: 'Edo', EK: 'Ekiti', EN: 'Enugu', GO: 'Gombe', IM: 'Imo', JI: 'Jigawa', KD: 'Kaduna', KN: 'Kano', KT: 'Katsina', KE: 'Kebbi', KO: 'Kogi', KW: 'Kwara', LA: 'Lagos', NA: 'Nasarawa', NI: 'Niger', OG: 'Ogun', ON: 'Ondo', OS: 'Osun', OY: 'Oyo', PL: 'Plateau', RI: 'Rivers', SO: 'Sokoto', TA: 'Taraba', YO: 'Yobe', ZA: 'Zamfara', FC: 'Abuja (FCT)' };
const key = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
const bt = k => '`' + k + '`';
const inc = path => ({ fieldPath: path.split('.').map(bt).join('.'), increment: { integerValue: '1' } });

async function record(b, headers) {
  const country = String(headers['x-vercel-ip-country'] || '').toUpperCase();
  const reg = country && country !== 'NG' ? 'Outside Nigeria' : (NG[String(headers['x-vercel-ip-country-region'] || '').toUpperCase()] || 'Unknown');
  let city = ''; try { city = decodeURIComponent(String(headers['x-vercel-ip-city'] || '')); } catch (e) {}
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const id = ym + '_' + (key(reg) || 'unknown');
  const t = [];
  if (b.t === 's') { const q = key(b.q); if (!q || String(b.q).length > 40) return 'ignored'; t.push(inc('s'), inc('terms.' + q)); }
  else if (b.t === 'v') { const pid = key(b.pid); if (!pid) return 'ignored'; t.push(inc('v'), inc('prods.' + pid)); }
  else return 'ignored';
  const c = key(city); if (c) t.push(inc('cities.' + c));
  const name = `projects/${PROJECT}/databases/(default)/documents/stats/${id}`;
  const tk = await token();
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [
      { update: { name, fields: { state: { stringValue: reg }, ym: { stringValue: ym } } }, updateMask: { fieldPaths: ['state', 'ym'] } },
      { transform: { document: name, fieldTransforms: t } }
    ] })
  });
  if (!r.ok) throw new Error('commit ' + r.status);
  return 'ok';
}

module.exports = async (req, res) => {
  const send = (c, o) => { res.statusCode = c; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); };
  try {
    if (req.method !== 'POST') return send(200, { ok: false });
    if (!process.env.ROBOT_EMAIL || !process.env.ROBOT_PASSWORD) return send(200, { ok: false, status: 'not_configured' });
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== 'object') { let raw = ''; for await (const c of req) raw += c; try { b = JSON.parse(raw); } catch (e) { b = {}; } }
    return send(200, { ok: true, status: await record(b, req.headers || {}) });
  } catch (e) { return send(200, { ok: false, status: 'error' }); }
};
module.exports.record = record;
