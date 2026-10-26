// Joash's admin page: check receipts by hand, hide people from the leaderboard, and download a backup.
// Everything shown here comes from visitors, so it's added as text, never as HTML.
(() => {
  const $ = (s) => document.querySelector(s);
  let pw = '';
  try { pw = sessionStorage.getItem('jj-admin') || ''; } catch (_) { /* no storage */ }
  let tab = 'pending';
  const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 });
  const when = (t) => t ? new Date(t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
    return n;
  }
  async function api(path, opts = {}) {
    const r = await fetch('/api/admin/' + path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + pw } });
    if (r.status === 401 || r.status === 429) { signOut(); }
    if (!r.ok) { let m = 'Something went wrong.'; try { m = (await r.json()).error || m; } catch (_) { /* not JSON */ } throw new Error(m); }
    return r;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const say = (m, bad) => { const n = $('#msg'); n.textContent = m; n.classList.toggle('bad', !!bad); };

  function signOut() {
    pw = ''; try { sessionStorage.removeItem('jj-admin'); } catch (_) { /* no storage */ }
    $('#panel').hidden = true; $('#login').hidden = false;
  }
  async function signIn(p) {
    pw = p;
    try {
      await api('check');
      try { sessionStorage.setItem('jj-admin', pw); } catch (_) { /* no storage */ }
      $('#login').hidden = true; $('#panel').hidden = false; $('#login-err').textContent = '';
      load();
    } catch (e) { $('#login-err').textContent = e.message; pw = ''; }
  }

  async function showImage(id, box) {
    try {
      const r = await api('image?id=' + id);
      const blob = await r.blob(), url = URL.createObjectURL(blob);
      box.replaceChildren(blob.type === 'application/pdf'
        ? el('a', { href: url, target: '_blank', rel: 'noopener', class: 'textlink' }, 'Open the PDF')
        : el('a', { href: url, target: '_blank', rel: 'noopener' }, el('img', { src: url, alt: 'Receipt ' + id })));
    } catch (e) { box.textContent = e.message; }
  }

  function receiptCard(r) {
    const read = r.reading || {};
    const imgBox = el('div', { class: 'adm-img' }, r.has_image ? 'Loading…' : 'No file kept');
    if (r.has_image) showImage(r.id, imgBox);
    const amount = el('input', { type: 'number', min: '1', step: '0.01', value: r.amount ?? read.amount_aud ?? '', 'aria-label': 'Amount in AUD' });
    const facts = [
      ['Donated to', r.donated_to || read.donated_to || '—'],
      ['Donor', r.donor || read.donor_name || '—'],
      ['Amount read', read.amount_aud != null ? AUD.format(read.amount_aud) : (r.amount != null ? AUD.format(r.amount) : '—')],
      ['Receipt no.', r.ref || read.receipt_id || '—'],
      ['Gemini sure?', read.confidence != null ? Math.round(read.confidence * 100) + '%' : (read.busy ? 'Gemini was busy' : 'Not read')],
      ['Leaderboard name', r.player_name || '—'],
      ['Uploaded', when(r.created)]
    ];
    const act = async (action) => {
      try { await post('review', { id: r.id, action, amount: amount.value }); say(action === 'approve' ? 'Approved. Their tokens are added.' : 'Turned down.'); load(); }
      catch (e) { say(e.message, true); }
    };
    return el('article', { class: 'adm-card' }, imgBox,
      el('div', { class: 'adm-info' },
        el('dl', {}, facts.map(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
        r.status === 'ok'
          ? el('div', { class: 'adm-do' }, el('span', {}, 'Counted ' + AUD.format(r.amount || 0)), el('button', { class: 'textlink', type: 'button', onclick: () => confirm('Undo this receipt and take the amount off their total?') && act('reject') }, 'Undo'))
          : el('div', { class: 'adm-do' }, el('label', {}, '$', amount), el('button', { class: 'pbtn', type: 'button', onclick: () => act('approve') }, 'Approve'),
            r.status === 'pending' && el('button', { class: 'textlink', type: 'button', onclick: () => act('reject') }, 'Turn down'))));
  }

  function playerRow(p) {
    const toggle = async (body, done) => { try { await post('player', { player: p.id, ...body }); say(done); load(); } catch (e) { say(e.message, true); } };
    return el('tr', { class: p.hidden ? 'hidden' : '' },
      el('td', {}, p.name || 'Anonymous'), el('td', {}, AUD.format(p.donated)), el('td', {}, p.best == null ? '—' : p.best.toFixed(2) + 's'),
      el('td', {}, String(Math.max(0, p.tokens))),
      el('td', {}, el('button', { class: 'textlink', type: 'button', onclick: () => toggle({ hidden: !p.hidden }, p.hidden ? 'Shown on the leaderboard again.' : 'Hidden from the leaderboard.') }, p.hidden ? 'Show' : 'Hide'),
        ' ', p.best != null && el('button', { class: 'textlink', type: 'button', onclick: () => confirm('Clear their best time?') && toggle({ clearTime: true }, 'Time cleared.') }, 'Clear time')));
  }

  async function load() {
    const list = $('#list');
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    list.replaceChildren(el('p', { class: 'empty' }, 'Loading…'));
    try {
      if (tab === 'players') {
        const people = await (await api('players')).json();
        list.replaceChildren(people.length
          ? el('table', { class: 'adm-table' }, el('thead', {}, el('tr', {}, ['Name', 'Donated', 'Best', 'Tokens left', ''].map(h => el('th', {}, h)))), el('tbody', {}, people.map(playerRow)))
          : el('p', { class: 'empty' }, 'Nobody has donated or played a ranked run yet.'));
      } else {
        const rs = await (await api('receipts?status=' + tab)).json();
        const none = { pending: 'Nothing to check. Every receipt so far was clear enough to add automatically.', rejected: 'No receipts have been turned down.', ok: 'No receipts approved yet.' }[tab];
        list.replaceChildren(...(rs.length ? rs.map(receiptCard) : [el('p', { class: 'empty' }, none)]));
      }
    } catch (e) { list.replaceChildren(el('p', { class: 'err' }, e.message)); }
  }

  async function backup() {
    try {
      const r = await api('backup');
      const url = URL.createObjectURL(await r.blob());
      el('a', { href: url, download: `joash-site-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      say('Backup downloaded.');
    } catch (e) { say(e.message, true); }
  }

  $('#login').addEventListener('submit', (e) => { e.preventDefault(); signIn($('#pw').value); });
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; say(''); load(); }));
  $('#backup').addEventListener('click', backup);
  $('#signout').addEventListener('click', signOut);
  if (pw) signIn(pw);
})();
