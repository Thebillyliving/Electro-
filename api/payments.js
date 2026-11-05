// Rocero admin payments: Paystack balance, transaction history and refunds.
// Only a signed-in Rocero admin can use it (we check the Firebase login against the admins list).
const API_KEY = 'AIzaSyDe-2OdWJj2lMrOENFxaedGdigAmdtq0fc'; // public Firebase web key
const FS = 'https://firestore.googleapis.com/v1/projects/electroap/databases/(default)/documents';
const PS = 'https://api.paystack.co';

async function isAdmin(idToken) {
  if (!idToken) return false;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  const j = await r.json().catch(() => ({}));
  const uid = j.users && j.users[0] && j.users[0].localId;
  if (!uid) return false;
  const d = await fetch(FS + '/admins/' + uid, { headers: { Authorization: 'Bearer ' + idToken } });
  return d.ok;
}
const ps = (path, opt) => fetch(PS + path, Object.assign({ headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET, 'Content-Type': 'application/json' } }, opt)).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

module.exports = async (req, res) => {
  const send = (c, o) => { res.statusCode = c; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); };
  try {
    if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only' });
    if (!process.env.PAYSTACK_SECRET) return send(200, { ok: false, error: 'PAYSTACK_SECRET is not set in Vercel' });
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!(await isAdmin(tok))) return send(401, { ok: false, error: 'Not allowed. Sign in as admin.' });
    if (b.action === 'balance') {
      const r = await ps('/balance');
      if (!r.ok) return send(200, { ok: false, error: r.j.message || 'Paystack refused. Check the secret key.' });
      return send(200, { ok: true, balance: (r.j.data || []).map(x => ({ currency: x.currency, balance: x.balance / 100 })) });
    }
    if (b.action === 'transactions') {
      const r = await ps('/transaction?perPage=100&page=' + (Number(b.page) || 1));
      if (!r.ok) return send(200, { ok: false, error: r.j.message || 'Paystack refused' });
      return send(200, { ok: true, items: (r.j.data || []).map(x => ({ ref: x.reference, amount: x.amount / 100, status: x.status, channel: x.channel, paid_at: x.paid_at || x.created_at, email: x.customer && x.customer.email, orderId: x.metadata && x.metadata.orderId || '' })) });
    }
    if (b.action === 'refund') {
      const ref = String(b.ref || '');
      if (!/^ORD-[A-Z0-9]+/.test(ref)) return send(200, { ok: false, error: 'Not a Rocero payment reference' });
      const body = { transaction: ref };
      if (Number(b.amount) > 0) body.amount = Math.round(Number(b.amount) * 100);
      if (b.note) body.merchant_note = String(b.note).slice(0, 200);
      const r = await ps('/refund', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok || !r.j.status) return send(200, { ok: false, error: r.j.message || 'Paystack could not refund' });
      return send(200, { ok: true, status: r.j.data && r.j.data.status || 'pending', message: r.j.message });
    }
    return send(400, { ok: false, error: 'unknown action' });
  } catch (e) { return send(200, { ok: false, error: 'Server error' }); }
};
