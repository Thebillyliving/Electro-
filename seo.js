// ELECTRO SEO pages: runs on Vercel, reads your public Firestore data and returns
// crawlable HTML for products, categories, cities and policies, plus sitemap and robots.
const PROJECT = 'electroap';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const CITIES = ['Lagos','Abuja','Port Harcourt','Ibadan','Kano','Benin City','Enugu','Kaduna','Warri','Abeokuta','Owerri','Asaba','Uyo','Jos','Ilorin'];
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const fprice = p => Math.round((Number(p.price) || 0) * (1 - (Number(p.discount) || 0) / 100));

function dec(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f) { const o = {}; for (const k in f) o[k] = dec(f[k]); return o; }
function decDoc(d) { return { id: d.name.split('/').pop(), ...decFields(d.fields || {}) }; }

async function list(col) {
  const out = []; let token = '';
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${BASE}/${col}?pageSize=300${token ? '&pageToken=' + token : ''}`);
    if (!r.ok) throw new Error(col + ' ' + r.status);
    const j = await r.json();
    (j.documents || []).forEach(d => out.push(decDoc(d)));
    if (!j.nextPageToken) break;
    token = encodeURIComponent(j.nextPageToken);
  }
  return out;
}
async function settings() {
  try { const r = await fetch(`${BASE}/settings/main`); if (r.ok) return decDoc(await r.json()); } catch (e) {}
  return {};
}

const origin = req => `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const imgUrl = (p, o) => !p.image ? o + '/icon-512.png' : p.image.startsWith('data:') ? `${o}/img/${p.id}` : p.image;
const pUrl = (p, o) => `${o}/p/${p.id}/${slugify(p.name)}`;

const CSS = `:root{--acc:#ff6a00;--green:#16a34a}*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf7;color:#141414;line-height:1.5}a{color:inherit}.top{background:#141414;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}.top b{font-size:20px}.top b span{color:var(--acc)}.top a{text-decoration:none}.wrap{max-width:900px;margin:0 auto;padding:16px}h1{font-size:24px;margin:8px 0}h2{font-size:18px;margin:18px 0 8px}.mut{color:#6b7280;font-size:13px}.price{font-size:26px;font-weight:700;color:var(--acc);margin:8px 0}.old{color:#9ca3af;text-decoration:line-through;font-size:15px;margin-left:8px;font-weight:400}.btn{display:inline-block;background:var(--acc);color:#fff;padding:12px 20px;border-radius:10px;font-weight:600;text-decoration:none;margin:6px 6px 6px 0}.btn.g{background:var(--green)}.btn.d{background:#141414}.pd{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pd img{width:100%;border-radius:12px;background:#fff}@media(max-width:640px){.pd{grid-template-columns:1fr}}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.card{background:#fff;border:1px solid #e8e8e3;border-radius:12px;padding:10px;text-decoration:none;display:block}.card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}.card .n{font-size:13px;margin:6px 0 2px}.card .p{color:var(--acc);font-weight:700}table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #e8e8e3}.foot{background:#141414;color:#cbd5e1;padding:20px 16px;margin-top:30px;font-size:13px;text-align:center}.foot a{color:#86efac;margin:0 6px}.crumb{font-size:13px;color:#6b7280}`;

function shell(o, s, { title, desc, canonical, image, body, ld, noindex }) {
  const name = s.name || 'ELECTRO';
  const gaId = /^G-[A-Z0-9]{4,}$/i.test(s.gaId || '') ? s.gaId : '';
  const ga = gaId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}')</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image || o + '/icon-512.png')}">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#ff6a00"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon-192.png">
${ga}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body>
<div class="top"><a href="/"><b>ELEC<span>TRO</span></b></a><a href="/">Shop all</a></div>
<div class="wrap">${body}</div>
<div class="foot"><div>${esc(name)} · ${esc(s.address || 'Nigeria')} · ${esc(s.phone || '')}</div>
<div style="margin-top:8px"><a href="/info/privacy">Privacy</a><a href="/info/terms">Terms</a><a href="/info/returns">Returns</a><a href="/info/delivery">Delivery</a><a href="/info/about">About</a></div></div>
</body></html>`;
}

function card(p, o) {
  return `<a class="card" href="${pUrl(p, o)}"><img loading="lazy" src="${esc(imgUrl(p, o))}" alt="${esc(p.name)}"><div class="n">${esc(p.name)}</div><div class="p">${money(fprice(p))}</div></a>`;
}

function reviewStats(revs) {
  const a = revs.filter(r => r.approved);
  return a.length ? { n: a.length, avg: a.reduce((t, r) => t + (Number(r.rating) || 0), 0) / a.length, list: a } : null;
}

function productPage(o, s, p, cats, prods, reviews) {
  const c = cats.find(x => x.id === p.cat) || { name: 'Electronics' };
  const rs = reviewStats(reviews.filter(r => r.pid === p.id));
  const url = pUrl(p, o), price = fprice(p);
  const desc = (p.seoDesc || `${p.name} for ${money(price)} in Nigeria. ${(p.desc || '').slice(0, 110)} Warranty: ${p.warranty || 'N/A'}. Delivery nationwide.`).slice(0, 158);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: [imgUrl(p, o)],
    description: p.desc || p.name, sku: p.sku || p.id, brand: { '@type': 'Brand', name: p.brand || 'ELECTRO' }, category: c.name,
    offers: { '@type': 'Offer', url, priceCurrency: 'NGN', price: String(price), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: s.name || 'ELECTRO' } },
    ...(rs ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rs.avg.toFixed(1), reviewCount: rs.n }, review: rs.list.slice(0, 5).map(r => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, reviewRating: { '@type': 'Rating', ratingValue: r.rating }, reviewBody: r.text })) } : {})
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: o + '/' },
      { '@type': 'ListItem', position: 2, name: c.name, item: `${o}/c/${c.id}/${slugify(c.name)}` },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }]
  }];
  const specs = (p.specs || '').split('\n').filter(Boolean).map(l => { const i = l.indexOf(':'); return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)]; });
  const rel = prods.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  const wa = `https://wa.me/${esc(s.whatsapp || '')}?text=${encodeURIComponent('Hi, I am interested in: ' + p.name + ' ' + url)}`;
  const body = `<div class="crumb"><a href="/">Home</a> › <a href="/c/${c.id}/${slugify(c.name)}">${esc(c.name)}</a> › ${esc(p.name)}</div>
<div class="pd"><div><img src="${esc(imgUrl(p, o))}" alt="${esc(p.name)}"></div><div>
<h1>${esc(p.name)}</h1><div class="mut">${esc(p.brand || '')} · SKU ${esc(p.sku || '')}</div>
${rs ? `<div class="mut">★ ${rs.avg.toFixed(1)} (${rs.n} reviews)</div>` : ''}
<div class="price">${money(price)}${p.discount ? `<span class="old">${money(p.price)}</span>` : ''}</div>
<p>${p.stock > 0 ? 'In stock' : 'Out of stock'} · Warranty: ${esc(p.warranty || 'N/A')}</p>
<a class="btn" href="/#p=${esc(p.id)}">Buy now</a><a class="btn g" href="${wa}">WhatsApp us</a></div></div>
<h2>Description</h2><p>${esc(p.desc || '')}</p>
${specs.length ? `<h2>Specifications</h2><table>${specs.map(x => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td></tr>`).join('')}</table>` : ''}
<h2>Delivery and payment</h2><p>Pay securely online, then add your delivery address. Delivery to all Nigerian states, fee shown at checkout. <a href="/info/delivery">Delivery info</a> · <a href="/info/returns">Returns</a></p>
${rs ? `<h2>Customer reviews</h2>${rs.list.slice(0, 5).map(r => `<p><b>${esc(r.name)}</b> ★${esc(r.rating)}<br>${esc(r.text)}</p>`).join('')}` : ''}
${rel.length ? `<h2>Related products</h2><div class="grid">${rel.map(x => card(x, o)).join('')}</div>` : ''}`;
  return shell(o, s, { title: (p.seoTitle || `${p.name} price in Nigeria | ${s.name || 'ELECTRO'}`).slice(0, 70), desc, canonical: url, image: imgUrl(p, o), body, ld });
}

function categoryPage(o, s, c, prods, city) {
  const list = prods.filter(p => p.cat === c.id);
  const where = city ? ` in ${city}` : ' in Nigeria';
  const url = city ? `${o}/city/${slugify(city)}` : `${o}/c/${c.id}/${slugify(c.name)}`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name + where, url, mainEntity: { '@type': 'ItemList', itemListElement: list.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: pUrl(p, o), name: p.name })) } };
  const body = `<h1>Buy ${esc(c.name)}${where}</h1><p class="mut">${list.length} products · genuine, warrantied, delivered nationwide</p>
<div class="grid" style="margin-top:12px">${list.map(p => card(p, o)).join('') || '<p>No products yet.</p>'}</div>`;
  return shell(o, s, { title: `Buy ${c.name}${where} | ${s.name || 'ELECTRO'}`, desc: `Shop ${c.name}${where}. Genuine products, warranty, secure online payment and nationwide delivery from ${s.name || 'ELECTRO'}.`, canonical: url, body, ld });
}

function cityPage(o, s, city, cats, prods) {
  const url = `${o}/city/${slugify(city)}`;
  const body = `<h1>Electronics and machines in ${esc(city)}</h1>
<p>${esc(s.name || 'ELECTRO')} delivers genuine electronics, appliances and machines to ${esc(city)} and all states in Nigeria. Pay securely online, add your address, and we ship with a tracked delivery.</p>
${cats.map(c => { const l = prods.filter(p => p.cat === c.id).slice(0, 4); return l.length ? `<h2>${esc(c.name)} in ${esc(city)}</h2><div class="grid">${l.map(p => card(p, o)).join('')}</div>` : ''; }).join('')}
<h2>Why buy from us</h2><p>Brand new products, warranty on every item, secure Paystack payment and delivery to ${esc(city)}. <a href="/info/delivery">Delivery info</a></p>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Store', name: s.name || 'ELECTRO', url: o, telephone: s.phone || undefined, areaServed: { '@type': 'City', name: city } };
  return shell(o, s, { title: `Buy electronics and machines in ${city} | ${s.name || 'ELECTRO'}`, desc: `Order electronics, appliances and machines online and get delivery to ${city}. Genuine products, warranty, secure payment.`, canonical: url, body, ld });
}

function infoPage(o, s, id) {
  const n = s.name || 'ELECTRO', em = s.email || '', ph = s.phone || '';
  const P = {
    privacy: ['Privacy Policy', `<p>${esc(n)} collects the details you give us (name, phone, email, delivery address) only to process and deliver your orders and to contact you about them. Payments are handled by Paystack; we never see or store your card number. We do not sell your data. We share your name, phone and address with delivery partners only to deliver your order. You can ask us to delete your account and data at any time by contacting ${esc(em)}.</p>`],
    terms: ['Terms of Service', `<p>By using ${esc(n)} you agree to these terms. Prices are in Naira and may change without notice. An order is confirmed after payment is received. Delivery fees are shown at checkout by state. We may cancel an order if a product is out of stock and will refund any payment in full. Product images are for illustration. Warranty terms are stated on each product page. Contact: ${esc(ph)} ${esc(em)}.</p>`],
    returns: ['Returns and Refunds', `<p>If your item arrives damaged, faulty or different from what you ordered, contact us within 48 hours of delivery with photos or a short video. We will repair, replace or refund after confirming the issue. Items must be unused and in original packaging unless faulty. Refunds go back to the original payment method within 7 working days of approval. Contact: ${esc(ph)} ${esc(em)}.</p>`],
    delivery: ['Delivery Information', `<p>We deliver to all states in Nigeria. The delivery fee is calculated by state at checkout. Pay first, then add your delivery address on the confirmation screen or from My Orders. Orders are dispatched after payment and address confirmation. Delivery time depends on your location, typically 1-3 working days in major cities and 3-7 days elsewhere. We will contact you by phone or WhatsApp on dispatch.</p>`],
    about: ['About ' + n, `<p>${esc(n)} is a Nigerian online store for genuine electronics, appliances and machines. ${esc(s.tagline || '')} Visit us: ${esc(s.address || '')}. Call ${esc(ph)} or email ${esc(em)}.</p>`]
  };
  const x = P[id]; if (!x) return null;
  return shell(o, s, { title: `${x[0]} | ${n}`, desc: `${x[0]} for ${n}, an online electronics store in Nigeria.`, canonical: `${o}/info/${id}`, body: `<h1>${esc(x[0])}</h1>${x[1]}` });
}

function sitemap(o, cats, prods) {
  const u = [[o + '/', 1.0]].concat(cats.map(c => [`${o}/c/${c.id}/${slugify(c.name)}`, 0.8]), CITIES.map(c => [`${o}/city/${slugify(c)}`, 0.6]), prods.map(p => [pUrl(p, o), 0.9]), ['privacy', 'terms', 'returns', 'delivery', 'about'].map(i => [`${o}/info/${i}`, 0.3]));
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u.map(([l, pr]) => `<url><loc>${esc(l)}</loc><priority>${pr}</priority></url>`).join('')}</urlset>`;
}

module.exports = async (req, res) => {
  const q = req.query || {}, t = q.t, id = q.id, o = origin(req);
  const html = (code, b, cache = 's-maxage=300, stale-while-revalidate=3600') => { res.statusCode = code; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', cache); res.end(b); };
  try {
    if (t === 'robots') { res.setHeader('Content-Type', 'text/plain'); res.setHeader('Cache-Control', 's-maxage=3600'); return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${o}/sitemap.xml\n`); }
    if (t === 'img') {
      const r = await fetch(`${BASE}/products/${encodeURIComponent(id)}`); if (!r.ok) { res.statusCode = 404; return res.end(); }
      const p = decDoc(await r.json()), m = /^data:([^;]+);base64,(.*)$/.exec(p.image || '');
      if (!m) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', m[1]); res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=86400'); return res.end(Buffer.from(m[2], 'base64'));
    }
    if (t === 'file') {
      const f = String(id || '').toLowerCase();
      const nf = c => { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('Not found'); };
      if (!/^google[a-z0-9]+\.html$/.test(f)) return nf();
      const s0 = await settings();
      if (String(s0.gscFile || '').toLowerCase() !== f) return nf();
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 's-maxage=60');
      return res.end('google-site-verification: ' + f);
    }
    if (t === 'info') { const s = await settings(); const h = infoPage(o, s, id); return h ? html(200, h, 's-maxage=3600') : html(404, shell(o, s, { title: 'Not found', desc: 'Not found', canonical: o, body: '<h1>Page not found</h1><a class="btn" href="/">Shop</a>', noindex: true }), 'no-store'); }
    const [s, cats, prodsAll] = await Promise.all([settings(), list('categories'), list('products')]);
    const prods = prodsAll.filter(p => p.active !== false);
    if (t === 'sitemap') { res.setHeader('Content-Type', 'application/xml'); res.setHeader('Cache-Control', 's-maxage=1800'); return res.end(sitemap(o, cats, prods)); }
    if (t === 'p') {
      const p = prodsAll.find(x => x.id === id);
      if (!p || p.active === false) return html(404, shell(o, s, { title: 'Product not found', desc: 'Not found', canonical: o, body: '<h1>Product no longer available</h1><a class="btn" href="/">Browse products</a>', noindex: true }), 'no-store');
      const reviews = await list('reviews').catch(() => []);
      return html(200, productPage(o, s, p, cats, prods, reviews));
    }
    if (t === 'c') {
      const c = cats.find(x => x.id === id);
      if (!c) return html(404, shell(o, s, { title: 'Not found', desc: 'Not found', canonical: o, body: '<h1>Category not found</h1><a class="btn" href="/">Shop</a>', noindex: true }), 'no-store');
      return html(200, categoryPage(o, s, c, prods));
    }
    if (t === 'city') {
      const city = CITIES.find(c => slugify(c) === id);
      if (!city) return html(404, shell(o, s, { title: 'Not found', desc: 'Not found', canonical: o, body: '<h1>Page not found</h1><a class="btn" href="/">Shop</a>', noindex: true }), 'no-store');
      return html(200, cityPage(o, s, city, cats, prods));
    }
    res.statusCode = 404; res.end('Not found');
  } catch (e) {
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); res.end('Temporarily unavailable');
  }
};
