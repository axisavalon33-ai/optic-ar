/* Host control panel */
(function () {
  const $ = id => document.getElementById(id);
  let S = null, info = null, authed = false, formDirty = false;
  const LANG_NAMES = { ta: 'Tamil', si: 'Sinhala', en: 'English' };
  const STEP_NAMES = { lang: 'choosing language', mode: 'choosing mode', name: 'typing name', ready: 'press READY', playing: 'playing' };
  const PHASE_NAMES = { HOME: 'Home screen', VIDEO: 'Story video', ROUND_INTRO: 'Round title', QUESTION: 'Question', EXPLANATION: 'Explanation', RESULTS: 'Results', TEST_VIDEO: 'Testing pause point' };

  const socket = TB.connect({ role: 'host' }, {
    state: s => { S = s; if (authed) render(); },
    connection: ok => {
      $('conn').classList.toggle('ok', ok);
      if (ok) { const pin = sessionStorage.getItem('pin'); if (pin) login(pin, true); }
    }
  });
  socket.on('hostinfo', i => { info = i; if (authed) renderInfo(); });
  socket.on('toast', toast);

  function login(pin, silent) {
    socket.emit('hostAuth', { pin }, r => {
      if (r && r.ok) {
        authed = true; sessionStorage.setItem('pin', pin);
        $('login').classList.add('hidden'); $('panel').classList.remove('hidden');
        render();
      } else if (!silent) { $('loginErr').textContent = 'Wrong PIN'; }
      else { sessionStorage.removeItem('pin'); }
    });
  }
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); login($('pin').value.trim()); });

  function cmd(name, extra) {
    socket.emit('host', Object.assign({ cmd: name }, extra || {}), r => { if (r && !r.ok && r.error) toast(r.error); });
  }
  document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    cmd(b.dataset.cmd);
  }));
  $('subLang').addEventListener('change', e => cmd('subtitle', { lang: e.target.value }));
  document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => {
    const v = $('settingsForm').elements['pauses.' + b.dataset.test].value;
    cmd('testPause', { which: b.dataset.test, value: v });
  }));

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  /* ---------- settings form ---------- */
  const form = $('settingsForm');
  form.addEventListener('input', () => { formDirty = true; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const out = { pauses: {} };
    for (const el of form.elements) {
      if (!el.name) continue;
      let v = el.type === 'number' ? Number(el.value) : el.value;
      if (el.name.startsWith('pauses.')) out.pauses[el.name.slice(7)] = v; else out[el.name] = v;
    }
    cmd('saveSettings', { settings: out });
    formDirty = false;
  });
  function fillForm(st) {
    if (formDirty) return;
    for (const el of form.elements) {
      if (!el.name) continue;
      const v = el.name.startsWith('pauses.') ? st.pauses[el.name.slice(7)] : st[el.name];
      if (v !== undefined && document.activeElement !== el) el.value = v;
    }
  }

  /* ---------- render ---------- */
  function tabCard(team) {
    const x = S.teams[team];
    const inGame = S.participants.includes(team);
    let h = `<div class="t">${team.toUpperCase()} tablet</div>
      <div class="${x.connected ? 'on-line' : 'off-line'}">${x.connected ? '● connected' : '● not connected'}</div>
      <div>Name: <b>${TB.esc(x.name || '—')}</b></div>
      <div>Language: ${x.lang ? LANG_NAMES[x.lang] : '—'} · Mode: ${x.mode || '—'}</div>
      <div>${S.phase === 'HOME' ? (x.ready ? '<b class="ok">✓ READY</b>' : 'Step: ' + (STEP_NAMES[x.step] || x.step)) : (inGame ? '<b>Playing</b>' : 'Not in this game')}</div>`;
    if (S.phase === 'HOME' && x.step !== 'lang') h += `<button class="btn small" data-team-cmd="resetTablet" data-team="${team}">↺ Back to language screen</button>`;
    if (inGame && S.participants.length === 2) h += `<button class="btn small" data-team-cmd="continueSolo" data-team="${team}" title="Use this if the other tablet has stopped working">Continue as SOLO with ${team.toUpperCase()}</button>`;
    return h;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-team-cmd]');
    if (!b) return;
    if (b.dataset.teamCmd === 'continueSolo' && !confirm(`Continue the game with only the ${b.dataset.team.toUpperCase()} team?`)) return;
    cmd(b.dataset.teamCmd, { team: b.dataset.team });
  });

  function render() {
    if (!S) return;
    const ph = $('phase');
    ph.textContent = (S.paused ? '⏸ PAUSED · ' : '') + (PHASE_NAMES[S.phase] || S.phase) + (S.phase === 'QUESTION' || S.phase === 'EXPLANATION' ? ` · Q${S.qNumber}/${S.qTotal}` : '') + (S.mode ? ` · ${S.mode}` : '');
    ph.classList.toggle('paused', S.paused);
    $('pauseBtn').textContent = S.paused ? '▶ Resume everything' : '⏸ Pause everything';
    $('pauseBtn').disabled = S.phase === 'HOME';
    $('holdBtn').disabled = S.phase !== 'EXPLANATION';
    $('holdBtn').classList.toggle('on', S.hold);
    $('holdBtn').textContent = S.hold ? '✋ Holding — press to release' : '✋ Hold';
    document.querySelector('[data-cmd="start"]').disabled = S.phase !== 'HOME';
    document.querySelector('[data-cmd="next"]').disabled = S.phase === 'HOME';
    document.querySelector('[data-cmd="skip"]').disabled = !['QUESTION', 'EXPLANATION', 'ROUND_INTRO'].includes(S.phase);
    document.querySelector('[data-cmd="replay"]').disabled = !['VIDEO', 'ROUND_INTRO'].includes(S.phase);
    if (document.activeElement !== $('subLang')) $('subLang').value = S.subtitleLang;
    $('homeSoundBtn').textContent = S.homeSound ? '🔊 Home video sound: ON' : '🔇 Home video sound: OFF';
    $('tc-red').innerHTML = tabCard('red');
    $('tc-blue').innerHTML = tabCard('blue');
    $('tvLine').innerHTML = S.tvConnected ? '<span class="on-line">● TV screen is open</span>' : '<span class="off-line">● TV screen is NOT open — open http://localhost:' + location.port + '/tv in a second window</span>';
    $('scores').innerHTML = S.scores.length ? '<table><tr><th>#</th><th>Name</th><th>Neurons lost</th><th>Wrong</th><th>Date</th></tr>' +
      S.scores.map((s, i) => `<tr><td>${i + 1}</td><td>${TB.esc(s.name)}</td><td>${TB.fmt(s.neurons)}</td><td>${s.wrongTaps}</td><td>${TB.date(s.date)}</td></tr>`).join('') + '</table>' : '<p class="note">No scores yet.</p>';
  }
  function renderLive() {
    if (!S || !authed) return;
    let h = '';
    if (S.participants.length) {
      h += S.participants.map(t => {
        const x = S.teams[t];
        const st = x.finished ? ' ✓ done' : x.timedOut ? ' ⏰ time up' : '';
        return `<div><b style="color:var(--${t})">${t.toUpperCase()}</b> ${TB.esc(x.name)}: <b>${TB.fmt(TB.neurons(t))}</b> neurons · ✗ ${x.wrongTaps}${S.phase === 'QUESTION' ? st : ''}</div>`;
      }).join('');
    }
    if (S.phase === 'QUESTION') h += `<div>Time left: <b>${Math.max(0, Math.ceil((S.qStart + S.cfg.questionTimeLimitSeconds * 1000 - TB.gnow()) / 1000))} s</b></div>`;
    if (S.phase === 'EXPLANATION') h += `<div>${S.hold ? 'Holding explanation' : S.explWaitingClip ? 'Waiting for the clip to end' : 'Next question in <b>' + Math.max(0, Math.ceil((S.explEndsAt - TB.gnow()) / 1000)) + ' s</b>'}</div>`;
    if (S.phase === 'VIDEO') h += `<div>Story video part ${S.video.segment} of 3 · at ${Number(S.video.pos || 0).toFixed(1)} s</div>`;
    if (S.phase === 'RESULTS') h += `<div>Back to home in <b>${Math.max(0, Math.ceil((S.resultsEndsAt - TB.gnow()) / 1000))} s</b></div>`;
    if (S.phase === 'HOME') h += '<div>Waiting for players. The game starts by itself when the tablets press READY (or press ▶ Start).</div>';
    $('live').innerHTML = h;
  }
  setInterval(renderLive, 250);

  function renderInfo() {
    if (!info) return;
    fillForm(info.settings);
    const u = info.urls;
    $('urls').innerHTML = `
      <div class="u"><b>RED tablet</b><code>${TB.esc(u.red)}</code></div>
      <div class="u"><b>BLUE tablet</b><code>${TB.esc(u.blue)}</code></div>
      <div class="u"><b>TV</b><code>${TB.esc(u.tv)}</code></div>
      <div class="u"><b>Host</b><code>${TB.esc(u.host)}</code></div>
      <div class="note">Laptop addresses: ${u.all.map(TB.esc).join(' · ') || 'none — connect to the Wi-Fi / hotspot'}</div>
      <div class="qrs">${u.qrRed ? `<div><img src="${u.qrRed}" alt="">RED</div>` : ''}${u.qrBlue ? `<div><img src="${u.qrBlue}" alt="">BLUE</div>` : ''}</div>`;
    const f = Object.entries(info.files).map(([n, ok]) => `<div class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗ missing:'} media/${TB.esc(n)}</div>`).join('');
    const q = info.questions;
    $('files').innerHTML = f + `<div class="${q.count ? 'ok' : 'bad'}" style="margin-top:8px">✓ ${q.count} questions loaded</div>` +
      (q.withMedia.length ? `<div class="note">Explanation media: ${q.withMedia.map(TB.esc).join(', ')}</div>` : '<div class="note">No explanation pictures yet (add q1.jpg, q2.jpg … to the media folder).</div>') +
      q.warnings.map(w => `<div class="bad">⚠ ${TB.esc(w)}</div>`).join('') + '<br>';
    $('guestInfo').textContent = `Last guest number: ${info.guestCounter} · Saved games: ${info.scoreCount}`;
    $('errors').innerHTML = info.errors.length ? info.errors.slice().reverse().map(e => `<div>${TB.date(e.time)} — ${TB.esc(e.where)}: ${TB.esc(e.message)}</div>`).join('') : 'No problems. 👍';
  }
})();
