/* Tablet */
(function () {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const team = ['red', 'blue'].includes(params.get('team')) ? params.get('team') : null;
  let S = null;
  let nameBuf = '';
  let pending = {};

  /* ---------- lock the tablet down: no zoom, scroll, select, long-press ---------- */
  ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'dblclick'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });

  /* ---------- fullscreen button ---------- */
  const fsBtn = $('fsBtn');
  fsBtn.addEventListener('click', () => TB.fullscreen());
  function fsCheck() { fsBtn.classList.toggle('hidden', !!document.fullscreenElement); }
  document.addEventListener('fullscreenchange', fsCheck); fsCheck();

  /* ---------- tiny sounds (made in the browser, no files needed) ---------- */
  let ac = null;
  function beep(freqs, dur, type) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      let t0 = ac.currentTime;
      for (const f of freqs) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur);
        t0 += dur * 0.7;
      }
    } catch (e) { /* ignore */ }
  }
  const sndOk = () => beep([660, 990], 0.16);
  const sndBad = () => { beep([180, 120], 0.25, 'square'); try { navigator.vibrate && navigator.vibrate(250); } catch (e) { /* ignore */ } };
  const sndDone = () => beep([523, 659, 784, 1047], 0.15);

  const myLang = () => (S && S.teams[team] && S.teams[team].lang) || 'en';
  const t = k => TB.t(k, myLang());

  /* ---------- choose team if the address had none ---------- */
  if (!team) {
    showView('v-team');
    document.querySelectorAll('#v-team [data-team]').forEach(b => b.addEventListener('click', () => {
      location.search = '?team=' + b.dataset.team;
    }));
    return;
  }
  document.body.classList.add(team);

  const socket = TB.connect({ role: 'tab', team }, {
    config: () => S && render(),
    state: s => { const prev = S; S = s; pending = {}; try { render(prev); } catch (e) { console.error(e); } },
    connection: ok => $('offline').classList.toggle('hidden', ok)
  });
  const setup = (action, extra) => socket.emit('setup', Object.assign({ action }, extra || {}));

  /* ---------- buttons ---------- */
  document.querySelectorAll('.langbtn').forEach(b => b.addEventListener('click', () => setup('lang', { lang: b.dataset.lang })));
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setup('mode', { mode: b.dataset.mode })));
  document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => setup('back')));
  $('skipBtn').addEventListener('click', () => { nameBuf = ''; setup('skipName'); });
  $('okBtn').addEventListener('click', () => { if (nameBuf.trim()) setup('name', { name: nameBuf }); else setup('skipName'); nameBuf = ''; });
  $('readyBtn').addEventListener('click', () => { setup('ready'); });
  $('soloInstead').addEventListener('click', () => setup('soloInstead'));

  // on-screen keyboard (Latin letters)
  const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const kbd = $('kbd');
  ROWS.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'krow';
    for (const ch of r) row.appendChild(key(ch, ch));
    if (i === 2) row.appendChild(key('⌫', 'DEL', 'del'));
    kbd.appendChild(row);
  });
  const sp = document.createElement('div'); sp.className = 'krow'; sp.appendChild(key('␣ space', ' ', 'wide')); kbd.appendChild(sp);
  function key(label, val, cls) {
    const b = document.createElement('button');
    b.className = 'key' + (cls ? ' ' + cls : ''); b.textContent = label;
    b.addEventListener('click', () => {
      if (val === 'DEL') nameBuf = nameBuf.slice(0, -1);
      else if (nameBuf.length < 16) {
        if (val === ' ' && (!nameBuf || nameBuf.endsWith(' '))) return;
        nameBuf += nameBuf.length === 0 || nameBuf.endsWith(' ') ? val : val.toLowerCase();
      }
      $('nameText').textContent = nameBuf;
    });
    return b;
  }

  /* ---------- views ---------- */
  function showView(id) {
    document.querySelectorAll('.view').forEach(v => { const on = v.id === id; if (v.classList.contains('on') !== on) v.classList.toggle('on', on); });
  }
  function applyTexts() {
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    $('fsText').textContent = t('fullscreen');
    $('pausedText').textContent = t('paused');
    $('offText').textContent = t('reconnecting');
  }
  let lastLang = null;

  function render(prev) {
    if (!S || !TB.config) return;
    const me = S.teams[team];
    if (lastLang !== myLang()) { lastLang = myLang(); applyTexts(); }
    $('barTeam').textContent = TB.teamName(team, myLang());
    $('barName').textContent = me.name || '';
    $('paused').classList.toggle('hidden', !S.paused);
    const playing = S.participants.includes(team);

    if (S.phase === 'HOME') {
      const step = me.step === 'playing' ? 'lang' : me.step;
      if (step === 'lang') { nameBuf = ''; showView('v-lang'); }
      else if (step === 'mode') showView('v-mode');
      else if (step === 'name') { showView('v-name'); $('nameText').textContent = nameBuf; }
      else if (step === 'ready') {
        showView('v-ready');
        $('readyHello').innerHTML = `${TB.esc(t('youAre'))} <b>${TB.esc(me.name)}</b>`;
        const waiting = me.ready && me.mode === 'team';
        $('readyWrap').classList.toggle('hidden', me.ready);
        $('waitWrap').classList.toggle('hidden', !waiting);
        $('soloInstead').textContent = '🙋 ' + t('modeSolo');
        if (me.ready && me.mode === 'solo') { $('waitWrap').classList.remove('hidden'); }
      }
      return;
    }
    if (!playing) {
      showView('v-busy');
      $('busyText').innerHTML = ['ta', 'si', 'en'].map(l => TB.esc(TB.t('gameBusy', l))).join('<br>');
      return;
    }
    if (S.phase === 'VIDEO' || S.phase === 'TEST_VIDEO') {
      showView('v-watch'); $('watchText').textContent = t('watchTv'); $('watchSub').textContent = '';
    } else if (S.phase === 'ROUND_INTRO') {
      showView('v-watch'); $('watchText').textContent = `${t('round')} ${S.round}: ${t('round' + S.round)}`; $('watchSub').textContent = t('watchTv');
    } else if (S.phase === 'QUESTION') {
      showView('v-question'); renderQuestion(prev);
    } else if (S.phase === 'EXPLANATION') {
      showView('v-watch'); $('watchText').textContent = t('lookTv'); $('watchSub').textContent = '';
    } else if (S.phase === 'RESULTS') {
      showView('v-results'); renderResults();
    }
  }

  /* ---------- question ---------- */
  let optKey = '';
  function renderQuestion(prev) {
    const q = S.question; if (!q) return;
    const me = S.teams[team];
    const key = q.id + ':' + S.qStart + ':' + myLang();
    const box = $('opts');
    if (optKey !== key) {
      optKey = key;
      $('qText').textContent = TB.tx(q.text, myLang());
      $('qInfo').textContent = `${t('round')} ${q.round} · ${t('question')} ${S.qNumber}/${S.qTotal}`;
      box.innerHTML = '';
      for (const o of q.options) {
        const b = document.createElement('button');
        b.className = 'opt'; b.dataset.id = o.id; b.textContent = TB.tx(o.text, myLang());
        b.addEventListener('click', () => tap(o.id, b));
        box.appendChild(b);
      }
    }
    // feedback sounds / shake for new results
    const pm = prev && prev.teams && prev.teams[team];
    const sameQ = prev && prev.question && prev.question.id === q.id && prev.qStart === S.qStart;
    if (sameQ && pm) {
      if (me.wrong.length > pm.wrong.length) { sndBad(); const v = $('v-question'); v.classList.remove('shakeAll'); void v.offsetWidth; v.classList.add('shakeAll'); }
      else if (me.finished && !pm.finished) sndDone();
      else if (me.found.length > pm.found.length) sndOk();
    }
    updateButtons();
    const db = $('doneBanner');
    if (me.finished) { db.className = 'done'; db.textContent = '✓ ' + t('done'); }
    else db.className = 'hidden';
  }
  function updateButtons() {
    if (!S || S.phase !== 'QUESTION') return;
    const me = S.teams[team];
    const now = TB.gnow();
    const locked = now < S.qStart + S.cfg.readLockSeconds * 1000;
    const frozen = now < me.frozenUntil;
    const over = me.finished || me.timedOut;
    document.querySelectorAll('#opts .opt').forEach(b => {
      const id = Number(b.dataset.id);
      const ok = me.found.includes(id), bad = me.wrong.includes(id), miss = me.missing.includes(id);
      let cls = 'opt';
      if (ok) cls += ' ok'; else if (bad) cls += ' bad'; else if (miss) cls += ' miss';
      else if (locked) cls += ' locked'; else if (over) cls += ' off';
      if (pending[id]) cls += ' pending';
      if (b.className !== cls) b.className = cls;
      b.disabled = ok || bad || locked || over || frozen;
    });
    const hint = $('qHint');
    if (locked) hint.textContent = `${t('readQuestion')} ${Math.ceil((S.qStart + S.cfg.readLockSeconds * 1000 - now) / 1000)}`;
    else if (me.timedOut && !me.finished) hint.textContent = '⏰ ' + t('timeUp');
    else if (!over) hint.textContent = '👆 ' + t('selectAll');
    else hint.textContent = '';
    hint.classList.toggle('timeup', me.timedOut && !me.finished);
    const fz = $('freeze');
    if (frozen && !over) {
      fz.classList.remove('hidden');
      $('freezeText').textContent = t('wrong');
      $('freezeNum').textContent = '−' + TB.fmt(S.cfg.wrongTapPenalty) + ' 🧠';
    } else fz.classList.add('hidden');
  }
  function tap(id, btn) {
    if (!S || S.phase !== 'QUESTION' || S.paused || btn.disabled || pending[id]) return;
    pending[id] = true;
    btn.classList.add('pending');
    socket.emit('tap', { option: id });
    setTimeout(() => { if (pending[id]) { delete pending[id]; updateButtons(); } }, 1500);
  }

  /* ---------- results ---------- */
  function renderResults() {
    const r = S.results; if (!r || !r.teams[team]) return;
    const x = r.teams[team];
    let title = '🎉 ' + t('wellDone');
    if (r.mode === 'team') {
      if (r.winner === team) title = '🏆 ' + t('winner') + '!';
      else if (r.winner === 'draw') title = '🤝 ' + t('draw');
    }
    $('resTitle').textContent = title;
    $('resBox').innerHTML = `<div class="v num">${TB.fmt(x.neurons)}</div><div class="l">🧠 ${TB.esc(t('neuronsLost'))}</div>
      <div class="l" style="margin-top:12px">✗ ${x.wrongTaps} ${TB.esc(t('wrongTaps'))}</div>`;
    $('resThanks').textContent = t('thanks') + '  🚑 1990';
  }

  /* ---------- live clock ---------- */
  function frame() {
    if (S && S.phase === 'QUESTION' && S.participants.includes(team)) {
      const lim = S.cfg.questionTimeLimitSeconds * 1000;
      const el = Math.min(lim, Math.max(0, TB.gnow() - S.qStart));
      $('qFill').style.width = (el / lim * 100) + '%';
      const left = Math.ceil((lim - el) / 1000);
      $('qTime').textContent = '⏱ ' + left + ' s';
      $('qTime').classList.toggle('low', left <= 10);
      $('myCounter').innerHTML = `🧠 <b>${TB.fmt(TB.neurons(team))}</b> ${TB.esc(t('neuronsLost'))}`;
      updateButtons();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
