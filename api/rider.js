// Rocero rider location. The rider opens a private link on his phone; the page sends his GPS here.
// The link holds a secret key. Only a hash of the key is stored on the order, so customers cannot use it.
const crypto = require('crypto');
const { token, getDoc, patch } = require('./paystack.js').h;
const hash = k => crypto.createHash('sha256').update(String(k || '')).digest('hex');

async function load(o, k) {
  if (!/^ORD-[A-Z0-9]+$/.test(String(o || '')) || String(k || '').length < 8) return { err: 'bad_link' };
  const t = await token();
  const ord = await getDoc('orders/' + o, t);
  if (!ord || !ord.riderH || ord.riderH !== hash(k)) return { err: 'bad_link' };
  if (ord.pickup || ord.status === 'Cancelled') return { err: 'not_deliverable' };
  return { t, ord };
}

module.exports = async (req, res) => {
  const send = (c, o) => { res.statusCode = c; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); };
  try {
    if (!process.env.ROBOT_EMAIL || !process.env.ROBOT_PASSWORD) return send(200, { ok: false, status: 'not_configured' });
    // Background tracking: Traccar Client (free Android app) sends GPS even with the screen off.
    // It calls this URL with ?id=ORD-XXXX_KEY&lat=..&lon=.. (GET or POST).
    {
      const P = Object.assign({}, (req.body && typeof req.body === 'object') ? req.body : {}, req.query || {});
      const dev = P.id || P.deviceid;
      if (dev && (P.lat != null || P.location)) {
        const m = /^(ORD-[A-Z0-9]+)_([a-z0-9]{8,})$/.exec(String(dev));
        let lat = Number(P.lat), lng = Number(P.lon != null ? P.lon : P.lng);
        if (P.location && !isFinite(lat)) { const ll = String(P.location).split(','); lat = Number(ll[0]); lng = Number(ll[1]); }
        const text = (c, t) => { res.statusCode = c; res.setHeader('Content-Type', 'text/plain'); res.setHeader('Cache-Control', 'no-store'); res.end(t); };
        if (!m) return text(403, 'bad id');
        if (!isFinite(lat) || !isFinite(lng) || lat < 3 || lat > 15 || lng < 2 || lng > 16) return text(200, 'ignored');
        const r = await load(m[1], m[2]);
        if (r.err) return text(403, r.err);
        if (r.ord.status !== 'Shipped') return text(200, 'not shipped');
        if (r.ord.loc && Date.now() - Number(r.ord.loc.t || 0) < 8000) return text(200, 'ok');
        await patch('orders/' + m[1], { loc: { lat, lng, acc: Math.round(Number(P.accuracy) || 0), t: Date.now() } }, r.t);
        return text(200, 'ok');
      }
    }
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      if (!b || typeof b !== 'object') { let raw = ''; for await (const c of req) raw += c; try { b = JSON.parse(raw); } catch (e) { b = {}; } }
      const lat = Number(b.lat), lng = Number(b.lng), acc = Math.round(Number(b.acc) || 0);
      if (!isFinite(lat) || !isFinite(lng) || lat < 3 || lat > 15 || lng < 2 || lng > 16) return send(200, { ok: false, status: 'bad_position' });
      const r = await load(b.o, b.k);
      if (r.err) return send(200, { ok: false, status: r.err });
      if (r.ord.status !== 'Shipped') return send(200, { ok: false, status: 'not_shipped' });
      if (r.ord.loc && Date.now() - Number(r.ord.loc.t || 0) < 8000) return send(200, { ok: true, status: 'slow' });
      await patch('orders/' + b.o, { loc: { lat, lng, acc, t: Date.now() } }, r.t);
      return send(200, { ok: true, status: 'saved' });
    }
    const q = req.query || {};
    const r = await load(q.o, q.k);
    if (r.err) return send(200, { ok: false, status: r.err });
    const o = r.ord;
    return send(200, { ok: true, status: o.status, name: o.name, phone: o.phone, address: o.address, landmark: o.landmark, city: o.city, state: o.state, notes: o.notes, items: (o.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0) });
  } catch (e) { return send(200, { ok: false, status: 'error' }); }
};
