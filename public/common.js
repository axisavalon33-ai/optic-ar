/* Shared helpers for TV, tablets and host page */
(function () {
  const TB = window.TB = {};
  TB.state = null;
  TB.config = null;
  let clockG = 0, clockPaused = true, clockRecv = 0;

  TB.connect = function (query, handlers) {
    const socket = io({ query, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000, timeout: 8000 });
    socket.on('config', c => { TB.config = c; handlers.config && handlers.config(c); });
    socket.on('state', s => {
      clockG = s.clock.g; clockPaused = s.clock.paused; clockRecv = performance.now();
      TB.state = s;
      handlers.state && handlers.state(s);
    });
    socket.on('connect', () => handlers.connection && handlers.connection(true));
    socket.on('disconnect', () => handlers.connection && handlers.connection(false));
    socket.on('connect_error', () => handlers.connection && handlers.connection(false));
    TB.socket = socket;
    return socket;
  };
  // Game clock (ms) as the server sees it, moving smoothly between updates
  TB.gnow = function () { return clockPaused ? clockG : clockG + (performance.now() - clockRecv); };

  TB.fmt = n => Math.max(0, Math.round(n)).toLocaleString('en-US');
  TB.neurons = function (team) {
    const s = TB.state; if (!s) return 0;
    const t = s.teams[team];
    const ms = t.timeMs + (t.running ? Math.max(0, TB.gnow() - t.runStart) : 0);
    return Math.round(t.penalties + ms * s.cfg.neuronsPerSecond / 1000);
  };
  TB.t = function (key, lang) {
    const ui = (TB.config && TB.config.ui) || {};
    const e = ui[key];
    if (!e) return key;
    return e[lang] || e.en || key;
  };
  TB.tx = function (obj, lang) { if (!obj) return ''; return obj[lang] || obj.en || ''; };
  TB.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TB.teamName = (team, lang) => TB.t(team === 'red' ? 'redTeam' : 'blueTeam', lang);
  TB.fullscreen = function () {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { /* ignore */ }
  };
  TB.date = function (iso) {
    try {
      const d = new Date(iso);
      const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
      return `${d.getDate()} ${m} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) { return ''; }
  };
  window.addEventListener('error', e => { try { console.error(e.message); } catch (x) { /* ignore */ } });
})();
