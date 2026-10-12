// ELECTRO payment confirmation. Runs on Vercel (free).
// Called by the shop right after a customer pays, and by the Paystack webhook as a backup.
// It never trusts the browser: it asks Paystack directly whether the payment succeeded,
// checks the amount against the order and the catalogue, then marks the order Paid.
const PROJECT = 'electroap';
const API_KEY = 'AIzaSyDe-2OdWJj2lMrOENFxaedGdigAmdtq0fc'; // public Firebase web key
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function dec(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = dec(f[k]); return o; }
  return null;
}
const decDoc = d => { const o = { id: d.name.split('/').pop() }; const f = d.fields || {}; for (const k in f) o[k] = dec(f[k]); return o; };
const enc = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };

let TOK = { v: '', exp: 0 };
async function token() {
  if (TOK.v && Date.now() < TOK.exp) return TOK.v;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ROBOT_EMAIL, password: process.env.ROBOT_PASSWORD, returnSecureToken: true })
  });
  const j = await r.json();
  if (!r.ok || !j.idToken) throw new Error('robot login failed');
  TOK = { v: j.idToken, exp: Date.now() + 45 * 60 * 1000 };
  return TOK.v;
}
async function getDoc(path, t) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('read ' + path + ' ' + r.status);
  return decDoc(await r.json());
}
async function listCol(col, t) {
  const r = await fetch(`${FS}/${col}?pageSize=300`, { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) throw new Error('list ' + col + ' ' + r.status);
  return ((await r.json()).documents || []).map(decDoc);
}
async function patch(path, fields, t) {
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) };
  const r = await fetch(`${FS}/${path}?${mask}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('write ' + path + ' ' + r.status);
}
const fprice = p => (Number(p.price) || 0) * (1 - (Number(p.discount) || 0) / 100);
const money = n => '₦' + Math.round(n).toLocaleString('en-NG');

async function confirm(ref) {
  if (!/^ORD-[A-Z0-9]+-\d{10,}$/.test(ref || '')) return { ok: false, status: 'ignored' };
  const orderId = ref.replace(/-\d+$/, '');
  const pv = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET } });
  const pj = await pv.json().catch(() => ({}));
  if (!pv.ok || !pj.status || !pj.data) return { ok: false, status: 'unverified' };
  const d = pj.data;
  if (d.status !== 'success') return { ok: false, status: 'not_successful' };
  if (d.currency && d.currency !== 'NGN') return { ok: false, status: 'wrong_currency' };
  if (d.metadata && d.metadata.orderId && d.metadata.orderId !== orderId) return { ok: false, status: 'mismatch' };

  const t = await token();
  const o = await getDoc('orders/' + orderId, t);
  if (!o) return { ok: false, status: 'order_not_found' };
  if (o.payStatus === 'Paid') return { ok: true, status: 'already' };

  const paid = Number(d.amount) / 100, why = [];
  if (Math.round(Number(d.amount)) < Math.round((Number(o.total) || 0) * 100)) why.push('amount paid ' + money(paid) + ' is less than order total ' + money(o.total));
  try {
    const [prods, settings, ship, coupons] = await Promise.all([listCol('products', t), getDoc('settings/main', t), listCol('shipping', t), listCol('coupons', t).catch(() => [])]);
    const items = Array.isArray(o.items) ? o.items : [];
    let cat = 0, own = 0;
    for (const it of items) {
      const p = prods.find(x => x.id === it.id);
      if (!p) { why.push('product missing: ' + it.name); continue; }
      cat += fprice(p) * (Number(it.qty) || 0); own += (Number(it.price) || 0) * (Number(it.qty) || 0);
    }
    if (Math.abs(own - (Number(o.subtotal) || 0)) > 1) why.push('item prices do not add up');
    if ((Number(o.subtotal) || 0) < cat * 0.95 - 1) why.push('items priced below the catalogue');
    const disc = Number(o.discount) || 0;
    if (disc > 1) {
      const c = coupons.find(k => String(k.code).toLowerCase() === String(o.coupon || '').toLowerCase() && k.active !== false);
      const max = c ? (c.type === 'percent' ? o.subtotal * c.value / 100 : Math.min(Number(c.value), o.subtotal)) : 0;
      if (!c || disc > max + 1) why.push('discount not valid');
    }
    const vatPct = settings && settings.vat != null ? Number(settings.vat) : 7.5;
    if ((Number(o.vat) || 0) < ((Number(o.subtotal) || 0) - disc) * vatPct / 100 - 1) why.push('VAT too low');
    if (!o.shipAdj) {
      const st = String(o.state || '').toLowerCase();
      const z = ship.find(z => String(z.states).split(',').map(s => s.trim().toLowerCase()).includes(st)) || ship.find(z => z.states === '*');
      if (z && (Number(o.shipping) || 0) < Number(z.fee) - 1) why.push('delivery fee below the state rate');
    }
    if ((Number(o.total) || 0) < (Number(o.subtotal) || 0) - disc + (Number(o.vat) || 0) + (Number(o.shipping) || 0) - 1) why.push('total does not add up');
  } catch (e) { why.push('could not check prices'); }

  if (why.length) {
    await patch('orders/' + orderId, { payNote: ('Paystack ' + money(paid) + ' ref ' + ref + '. CHECK BEFORE SHIPPING: ' + why.join('; ')).slice(0, 400) }, t);
    return { ok: true, status: 'review' };
  }
  const f = { payStatus: 'Paid', payRef: ref, paidAt: new Date().toISOString(), payChannel: String(d.channel || '') };
  if (o.status === 'Cancelled') f.payNote = 'Paid after the order was cancelled. Refund or reinstate.';
  await patch('orders/' + orderId, f, t);
  return { ok: true, status: 'paid' };
}

module.exports = async (req, res) => {
  const post = req.method === 'POST';
  const send = (c, o) => { res.statusCode = c; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); };
  try {
    let ref = '';
    if (post) {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      if (!b || typeof b !== 'object') { let raw = ''; for await (const c of req) raw += c; try { b = JSON.parse(raw); } catch (e) { b = {}; } }
      if (b.event && b.event !== 'charge.success') return send(200, { ok: true, status: 'ignored' });
      ref = b.data && b.data.reference;
    } else ref = (req.query || {}).reference;
    if (!process.env.PAYSTACK_SECRET || !process.env.ROBOT_EMAIL || !process.env.ROBOT_PASSWORD) return send(post ? 500 : 200, { ok: false, status: 'not_configured' });
    return send(200, await confirm(String(ref || '')));
  } catch (e) {
    return send(post ? 500 : 200, { ok: false, status: 'error' });
  }
};
module.exports.confirm = confirm;
