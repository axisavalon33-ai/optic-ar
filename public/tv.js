/* TV screen */
(function () {
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const story = $('story');
  const homeVideo = $('homeVideo');
  let S = null;
  let unlocked = false;

  /* ---------- scale the 1920x1080 stage to any window ---------- */
  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transformOrigin = '50% 50%';
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  window.addEventListener('resize', fit); fit();

  /* ---------- start button: fullscreen + allow sound ---------- */
  function unlock() {
    unlocked = true;
    $('soundHint').classList.add('hidden');
    $('startOverlay').classList.add('hidden');
    if (S) { syncHomeVideo(); syncStory(); }
  }
  $('startBtn').addEventListener('click', e => { e.stopPropagation(); TB.fullscreen(); unlock(); });
  document.addEventListener('click', () => { if (!unlocked) unlock(); else if ($('soundHint').offsetParent) { unlock(); } });
  document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') TB.fullscreen(); });
  // If nobody clicks, shrink the start box to a small corner button so the game stays visible
  setTimeout(() => $('startOverlay').classList.add('small'), 20000);
  // Shrink long text until it fits its box
  function fitText(el, max, min) {
    let size = max;
    el.style.fontSize = size + 'px';
    while (size > min && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) {
      size -= 2; el.style.fontSize = size + 'px';
    }
  }

  const lang = () => (S && S.subtitleLang) || 'en';
  const t = (k, l) => TB.t(k, l || lang());

  /* ---------- connection ---------- */
  TB.connect({ role: 'tv' }, {
    config: onConfig,
    state: s => { const prev = S; S = s; try { render(prev); } catch (e) { console.error(e); } },
    connection: ok => $('conn').classList.toggle('hidden', ok)
  });
  TB.socket.on('penalty', p => showPenalty(p.team, p.amount));

  /* ---------- media set-up ---------- */
  let preloaded = {};
  function onConfig(c) {
    const vf = c.videoFile ? '/media/' + encodeURIComponent(c.videoFile) : '';
    if (story.dataset.src !== vf) {
      story.dataset.src = vf;
      [...story.querySelectorAll('track')].forEach(tr => tr.remove());
      if (vf) {
        story.src = vf;
        for (const l of ['en', 'ta', 'si']) {
          if (!c.subtitles[l]) continue;
          const tr = document.createElement('track');
          tr.kind = 'subtitles'; tr.srclang = l; tr.label = l; tr.src = '/media/' + encodeURIComponent(c.subtitles[l]);
          story.appendChild(tr);
        }
        story.load();
        setupTracks();
      } else story.removeAttribute('src');
    }
    const hf = c.homeVideoFile ? '/media/' + encodeURIComponent(c.homeVideoFile) : '';
    if (homeVideo.dataset.src !== hf) {
      homeVideo.dataset.src = hf;
      if (hf) { homeVideo.src = hf; homeVideo.load(); } else homeVideo.removeAttribute('src');
    }
    // preload explanation pictures
    for (const m of c.preload || []) {
      if (preloaded[m.file] || m.type !== 'image') continue;
      const img = new Image(); img.src = '/media/' + encodeURIComponent(m.file); preloaded[m.file] = img;
    }
    if (S) render(S);
  }

  /* ---------- subtitles (drawn by us so they are big and clear) ---------- */
  let activeTrack = null;
  function setupTracks() {
    for (const tr of story.textTracks) tr.mode = 'disabled';
    chooseTrack();
  }
  function chooseTrack() {
    const l = lang();
    activeTrack = null;
    for (const tr of story.textTracks) {
      if (tr.language === l) { tr.mode = 'hidden'; activeTrack = tr; tr.oncuechange = drawSubs; }
      else { tr.mode = 'disabled'; tr.oncuechange = null; }
    }
    drawSubs();
  }
  function drawSubs() {
    const box = $('subs');
    if (!activeTrack || !activeTrack.activeCues || !activeTrack.activeCues.length || (S && S.phase !== 'VIDEO' && S.phase !== 'TEST_VIDEO')) { box.innerHTML = ''; return; }
    const text = [...activeTrack.activeCues].map(c => c.text.replace(/<[^>]+>/g, '')).join('\n');
    box.innerHTML = text ? `<span>${TB.esc(text).replace(/\n/g, '<br>')}</span>` : '';
  }
  let lastSubLang = null;

  /* ---------- story video control ---------- */
  let playingRev = -1, segEnded = false, testRev = -1, testReached = false;
  function segStart(seg) { const p = TB.config.pauses; return seg === 2 ? p.round1 : seg === 3 ? p.round2 : 0; }
  function segEnd(seg) { const p = TB.config.pauses; return seg === 1 ? p.round1 : seg === 2 ? p.round2 : Infinity; }
  function seekTo(time) {
    const go = () => { try { story.currentTime = time; } catch (e) { /* ignore */ } };
    if (story.readyState >= 1) go(); else story.addEventListener('loadedmetadata', go, { once: true });
  }
  function playStory() {
    if (!story.paused) return;
    story.muted = false;
    const p = story.play();
    if (p && p.catch) p.catch(() => {
      story.muted = true;
      story.play().catch(() => {});
      $('soundHint').classList.remove('hidden');
    });
  }
  function noVideo(msg, done) {
    $('videoMsg').textContent = msg;
    $('videoMsg').classList.remove('hidden');
    clearTimeout(noVideo.timer);
    noVideo.timer = setTimeout(done, 3000);
  }
  function syncStory() {
    if (!S || !TB.config) return;
    const hasVideo = !!TB.config.videoFile;
    if (S.phase === 'VIDEO') {
      const seg = S.video.segment;
      if (playingRev !== S.video.rev) {
        playingRev = S.video.rev; segEnded = false;
        $('videoMsg').classList.add('hidden');
        if (!hasVideo) {
          noVideo(`Story video not found (media/${'stroke.mp4'}). Skipping to the questions…`, () => endSegment(seg, S.video.rev));
          return;
        }
        const start = segStart(seg), end = segEnd(seg), pos = S.video.pos;
        seekTo(pos > start + 0.5 && pos < end - 0.3 ? pos : start);
      }
      if (!hasVideo) return;
      if (S.paused || segEnded) story.pause(); else playStory();
    } else if (S.phase === 'TEST_VIDEO' && S.test) {
      if (testRev !== S.test.rev) {
        testRev = S.test.rev; testReached = false;
        $('videoMsg').classList.add('hidden');
        if (!hasVideo) { noVideo('Story video not found in the media folder.', () => TB.socket.emit('testDone', { rev: testRev })); return; }
        seekTo(S.test.from);
      }
      if (hasVideo && !testReached) playStory();
    } else {
      if (!story.paused) story.pause();
    }
  }
  function endSegment(seg, rev) {
    if (segEnded) return;
    segEnded = true;
    story.pause();
    TB.socket.emit('videoSegmentEnd', { segment: seg, rev });
  }
  story.addEventListener('ended', () => {
    if (S && S.phase === 'VIDEO' && S.video.segment === 3) endSegment(3, S.video.rev);
    if (S && S.phase === 'VIDEO' && S.video.segment < 3) endSegment(S.video.segment, S.video.rev);
  });
  story.addEventListener('error', () => {
    if (S && S.phase === 'VIDEO' && !segEnded) noVideo('The story video could not be played. Skipping…', () => endSegment(S.video.segment, S.video.rev));
  });
  function videoWatch() {
    if (S && TB.config) {
      if (S.phase === 'VIDEO' && !segEnded && playingRev === S.video.rev && !story.paused) {
        const end = segEnd(S.video.segment);
        if (story.currentTime >= end) { story.currentTime = end; endSegment(S.video.segment, S.video.rev); }
      }
      if (S.phase === 'TEST_VIDEO' && S.test && !testReached && !story.paused && story.currentTime >= S.test.to) {
        testReached = true; story.pause();
        const b = $('testBadge');
        b.textContent = `✓ Pause point reached: ${S.test.to.toFixed(1)} s — this is where Round ${S.test.which === 'round1' ? 1 : 2} starts`;
        const rev = S.test.rev;
        setTimeout(() => TB.socket.emit('testDone', { rev }), 4000);
      } else if (S.phase === 'TEST_VIDEO' && S.test && !testReached) {
        $('testBadge').textContent = `TEST ${S.test.which}: ${story.currentTime.toFixed(1)} s → pauses at ${S.test.to.toFixed(1)} s`;
      }
    }
    requestAnimationFrame(videoWatch);
  }
  requestAnimationFrame(videoWatch);
  setInterval(() => {
    if (S && S.phase === 'VIDEO' && !story.paused) TB.socket.emit('videoProgress', { t: story.currentTime, rev: S.video.rev });
  }, 1000);

  function syncHomeVideo() {
    if (!S) return;
    if (S.phase === 'HOME' && TB.config && TB.config.homeVideoFile) {
      homeVideo.muted = !(S.homeSound && unlocked);
      if (homeVideo.paused) homeVideo.play().catch(() => { homeVideo.muted = true; homeVideo.play().catch(() => {}); });
    } else if (!homeVideo.paused) homeVideo.pause();
  }

  /* ---------- screens ---------- */
  const SCREENS = { HOME: 's-home', VIDEO: 's-video', TEST_VIDEO: 's-video', ROUND_INTRO: 's-intro', QUESTION: 's-question', EXPLANATION: 's-explain', RESULTS: 's-results' };
  let shownScreen = null;
  function showScreen(id) {
    if (shownScreen === id) return;
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('on', el.id === id));
    shownScreen = id;
  }
  function secondLang() {
    if (!S) return null;
    const langs = S.participants.map(p => S.teams[p].lang).filter(Boolean);
    const l2 = langs.find(l => l !== lang());
    return l2 || null;
  }
  function roundTitle(r, l) { return t('round' + r, l); }

  function render(prev) {
    if (!TB.config) return;
    showScreen(SCREENS[S.phase] || 's-home');
    if (lastSubLang !== S.subtitleLang) { lastSubLang = S.subtitleLang; chooseTrack(); }
    $('pausedOverlay').classList.toggle('hidden', !S.paused);
    $('pausedText').textContent = t('paused').toUpperCase();
    $('testBadge').classList.toggle('hidden', S.phase !== 'TEST_VIDEO');
    syncHomeVideo();
    syncStory();
    drawSubs();
    const counterPhases = ['ROUND_INTRO', 'QUESTION', 'EXPLANATION'];
    $('counters').classList.toggle('hidden', !counterPhases.includes(S.phase));
    if (S.phase === 'HOME') renderHome();
    if (S.phase === 'ROUND_INTRO') renderIntro();
    if (S.phase === 'QUESTION') renderQuestion(prev);
    if (S.phase === 'EXPLANATION') renderExplain(prev);
    if (S.phase === 'RESULTS') renderResults(prev);
    if (counterPhases.includes(S.phase)) renderCounters();
  }

  /* HOME */
  let tagIdx = 0;
  function rotateTagline() {
    const l = ['en', 'ta', 'si'][tagIdx++ % 3];
    const p = $('tagline');
    p.style.opacity = 0;
    setTimeout(() => { p.textContent = TB.t('tagline', l); p.style.opacity = 1; }, 400);
  }
  setInterval(rotateTagline, 6000); setTimeout(rotateTagline, 300);
  let boardKey = '';
  function renderHome() {
    const key = JSON.stringify(S.scores);
    if (key !== boardKey) {
      boardKey = key;
      $('board').innerHTML = S.scores.length ? S.scores.map((s, i) => `
        <div class="brow" style="animation-delay:${i * 60}ms">
          <div class="rk">${i + 1}</div>
          <div style="min-width:0"><div class="nm">${TB.esc(s.name)}</div><div class="meta">✗ ${s.wrongTaps} · ${TB.date(s.date)}</div></div>
          <div class="nv num">${TB.fmt(s.neurons)}<small>neurons lost</small></div>
        </div>`).join('') : `<div class="board-empty">${TB.esc(TB.t('noScores', 'en'))}<br><br>${TB.esc(TB.t('noScores', 'ta'))}<br><br>${TB.esc(TB.t('noScores', 'si'))}</div>`;
    }
    const pill = team => {
      const x = S.teams[team];
      const nm = team === 'red' ? 'RED' : 'BLUE';
      let st = x.connected ? (x.ready ? `✓ ${TB.esc(x.name)} is ready` : (x.step === 'lang' ? 'free — come and play!' : 'getting ready…')) : 'tablet offline';
      return `<div class="pill ${team}">${nm}: ${st}</div>`;
    };
    $('homeJoin').innerHTML = `<div class="play">👉 Play now on the tablets!</div><div class="pills">${pill('red')}${pill('blue')}</div>`;
  }

  /* ROUND INTRO */
  function renderIntro() {
    $('introRound').textContent = `${t('round')} ${S.round}`;
    $('introTitle').textContent = roundTitle(S.round);
    const l2 = secondLang();
    $('introTitle2').textContent = l2 ? roundTitle(S.round, l2) : '';
  }

  /* QUESTION */
  let fcards = {}, fQid = null;
  function renderQuestion() {
    const q = S.question; if (!q) return;
    $('qRound').textContent = `${t('round')} ${q.round} · ${roundTitle(q.round)}`;
    $('qNum').textContent = `${t('question')} ${S.qNumber} / ${S.qTotal}`;
    $('qPrimary').textContent = TB.tx(q.text, lang());
    const l2 = secondLang();
    $('qSecondary').textContent = l2 ? TB.tx(q.text, l2) : '';
    const qKey = q.id + ':' + lang() + ':' + (l2 || '');
    if ($('qPrimary').dataset.k !== qKey) { $('qPrimary').dataset.k = qKey; fitText($('qPrimary'), 66, 40); }
    const list = $('foundList');
    if (fQid !== q.id + ':' + S.qStart) { fQid = q.id + ':' + S.qStart; fcards = {}; list.innerHTML = ''; }
    const ids = S.foundOrder.slice();
    for (const p of S.participants) for (const m of S.teams[p].missing) if (!ids.includes(m)) ids.push(m);
    for (const id of ids) {
      const opt = q.options.find(o => o.id === id); if (!opt) continue;
      let el = fcards[id];
      if (!el) {
        el = document.createElement('div');
        el.className = 'fcard';
        el.innerHTML = `<div class="ticks"></div><div class="ft"></div>`;
        el.querySelector('.ft').textContent = TB.tx(opt.text, lang());
        list.appendChild(el); fcards[id] = el;
      }
      const ticks = S.participants.filter(p => S.teams[p].found.includes(id));
      el.classList.toggle('missed', !ticks.length);
      const html = ticks.length ? ticks.map(p => `<div class="tick ${p}">✓</div>`).join('') : `<div class="tick miss">${TB.esc(t('missed'))}</div>`;
      const tk = el.querySelector('.ticks');
      if (tk.dataset.h !== html) { tk.dataset.h = html; tk.innerHTML = html; }
    }
  }

  /* EXPLANATION */
  let eKey = '';
  function renderExplain() {
    const q = S.question; if (!q || !q.correct) return;
    $('eTitle').textContent = '✓ ' + t('correctAnswers');
    $('eNum').textContent = `${t('question')} ${S.qNumber} / ${S.qTotal}`;
    $('eHold').classList.toggle('hidden', !S.hold);
    const key = q.id + ':' + S.explStartsAt + ':' + lang();
    if (eKey === key) return;
    eKey = key;
    $('eAnswers').innerHTML = q.correct.map((id, i) => {
      const opt = q.options.find(o => o.id === id);
      const ticks = S.participants.filter(p => S.teams[p].found.includes(id)).map(p => `<div class="tick ${p}">✓</div>`).join('');
      return `<div class="eans" style="animation-delay:${i * 120}ms"><span>${TB.esc(TB.tx(opt && opt.text, lang()))}</span><div class="ticks">${ticks}</div></div>`;
    }).join('');
    const l2 = secondLang();
    $('eText').innerHTML = TB.esc(TB.tx(q.explanation, lang())) + (l2 ? `<span class="sec">${TB.esc(TB.tx(q.explanation, l2))}</span>` : '');
    setTimeout(() => fitText($('eText'), 44, 24), 0);
    const m = $('eMedia');
    m.innerHTML = '';
    m.classList.toggle('empty', !q.media);
    if (q.media) {
      const src = '/media/' + encodeURIComponent(q.media);
      if (q.mediaType === 'video') {
        const v = document.createElement('video');
        v.src = src; v.playsInline = true; v.autoplay = true; v.muted = !unlocked;
        v.addEventListener('ended', () => TB.socket.emit('clipEnded', { id: q.id }));
        v.addEventListener('error', () => TB.socket.emit('clipEnded', { id: q.id }));
        m.appendChild(v);
        v.play().catch(() => { v.muted = true; v.play().catch(() => TB.socket.emit('clipEnded', { id: q.id })); });
      } else {
        const img = document.createElement('img');
        img.src = src; img.onerror = () => { m.innerHTML = ''; m.classList.add('empty'); };
        m.appendChild(img);
      }
    }
  }

  /* RESULTS */
  let resKey = '';
  function renderResults() {
    const r = S.results; if (!r) return;
    const key = S.gameId + ':' + lang();
    if (resKey === key) return;
    resKey = key;
    const names = Object.keys(r.teams);
    const banner = $('resBanner');
    banner.className = 'res-banner';
    if (r.mode === 'team' && r.winner && r.winner !== 'draw') {
      banner.classList.add(r.winner);
      banner.innerHTML = `🏆 ${TB.esc(TB.teamName(r.winner, lang()))} ${TB.esc(t('wins'))}<small>${TB.esc(r.teams[r.winner].name)} — ${TB.esc(t('winner'))}</small>`;
    } else if (r.mode === 'team') {
      banner.innerHTML = `🤝 ${TB.esc(t('draw'))}`;
    } else {
      banner.classList.add(names[0]);
      banner.innerHTML = `🎉 ${TB.esc(t('wellDone'))}<small>${TB.esc(r.teams[names[0]].name)}</small>`;
    }
    $('resPanels').innerHTML = names.map(tm => {
      const x = r.teams[tm];
      const win = r.winner === tm;
      return `<div class="rpanel ${tm} ${win ? 'win' : ''}">
        ${win ? '<div class="crown">👑</div>' : ''}
        <div class="rn">${TB.esc(x.name)}</div>
        <div class="rt">${TB.esc(TB.teamName(tm, lang()))}</div>
        <div class="rv num" data-count="${x.neurons}">0</div>
        <div class="rl">${TB.esc(t('neuronsLost'))}</div>
        <div class="rw">✗ ${x.wrongTaps} ${TB.esc(t('wrongTaps'))}</div>
        ${x.rank && x.rank <= 10 ? `<div class="rr">🏆 #${x.rank} TOP 10!</div>` : ''}
      </div>`;
    }).join('');
    // count-up animation
    const els = [...$('resPanels').querySelectorAll('[data-count]')];
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / 1600);
      const e = 1 - Math.pow(1 - k, 3);
      els.forEach(el => { el.textContent = TB.fmt(Number(el.dataset.count) * e); });
      if (k < 1) requestAnimationFrame(step);
    })(t0);
    $('resFoot').innerHTML = `<span>🚑 ${TB.esc(t('callAmbulance'))}</span>`;
    confetti(r.winner && r.winner !== 'draw' ? r.winner : names[0]);
  }
  function confetti(team) {
    const cv = $('confetti'); const cx = cv.getContext('2d');
    const cols = team === 'blue' ? ['#2e8bff', '#6fb0ff', '#ffc83d', '#ffffff', '#22c55e'] : ['#ff3b4e', '#ff8aa0', '#ffc83d', '#ffffff', '#22c55e'];
    const P = Array.from({ length: 220 }, () => ({ x: Math.random() * 1920, y: -Math.random() * 1080, w: 10 + Math.random() * 14, h: 6 + Math.random() * 10, vy: 4 + Math.random() * 6, vx: -2 + Math.random() * 4, r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function frame(now) {
      cx.clearRect(0, 0, 1920, 1080);
      const fade = Math.max(0, 1 - (now - t0 - 5000) / 1500);
      cx.globalAlpha = fade;
      for (const p of P) {
        p.y += p.vy; p.x += p.vx; p.r += p.vr;
        if (p.y > 1100 && now - t0 < 4500) { p.y = -20; p.x = Math.random() * 1920; }
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
      }
      if (fade > 0 && S && S.phase === 'RESULTS') requestAnimationFrame(frame); else cx.clearRect(0, 0, 1920, 1080);
    })(t0);
  }

  /* COUNTERS */
  function renderCounters() {
    const solo = S.participants.length === 1;
    $('counters').classList.toggle('solo', solo);
    $('counters').classList.toggle('mini', S.phase === 'EXPLANATION');
    for (const tm of ['red', 'blue']) {
      const on = S.participants.includes(tm);
      const box = $('c-' + tm);
      box.classList.toggle('hidden', !on);
      if (!on) continue;
      const x = S.teams[tm];
      $('cn-' + tm).textContent = `${TB.teamName(tm, lang())} · ${x.name}`;
      $('cl-' + tm).textContent = '🧠 ' + t('neuronsLost') + (x.wrongTaps ? `   ·   ✗ ${x.wrongTaps}` : '');
      const st = $('cs-' + tm);
      let cls = '', txt = '';
      if (S.phase === 'QUESTION' && x.finished) { cls = 'done'; txt = '✓ ' + t('done').split('!')[0] + '!'; }
      else if (S.phase === 'QUESTION' && x.timedOut) { cls = 'timeout'; txt = '⏰ ' + t('timeUp'); }
      else if (S.phase === 'QUESTION' && !x.connected) { cls = 'timeout'; txt = '📶 offline'; }
      st.className = 'c-status' + (cls ? ' on ' + cls : '');
      st.textContent = txt;
      box.classList.toggle('paused', S.phase !== 'QUESTION');
    }
  }
  function showPenalty(team, amount) {
    if (!S || !S.participants.includes(team)) return;
    const box = $('c-' + team);
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    const el = document.createElement('div');
    el.className = 'penalty num';
    el.textContent = '−' + TB.fmt(amount);
    const solo = S.participants.length === 1;
    if (solo) { el.style.left = '1320px'; }
    else if (team === 'red') el.style.left = '770px';
    else el.style.right = '770px';
    stage.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  /* ---------- live ticking ---------- */
  function tick() {
    if (S) {
      if (['ROUND_INTRO', 'QUESTION', 'EXPLANATION'].includes(S.phase)) {
        for (const tm of S.participants) $('cv-' + tm).textContent = TB.fmt(TB.neurons(tm));
      }
      if (S.phase === 'QUESTION') {
        const lim = S.cfg.questionTimeLimitSeconds * 1000;
        const el = Math.min(lim, Math.max(0, TB.gnow() - S.qStart));
        $('timefill').style.width = (el / lim * 100) + '%';
        const left = Math.ceil((lim - el) / 1000);
        $('qSecs').textContent = left + ' s';
        $('qSecs').classList.toggle('low', left <= 10);
      }
      if (S.phase === 'EXPLANATION') {
        const tot = S.explEndsAt - S.explStartsAt;
        const k = S.explWaitingClip ? 0 : Math.min(1, Math.max(0, (TB.gnow() - S.explStartsAt) / tot));
        $('eFill').style.width = (k * 100) + '%';
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
