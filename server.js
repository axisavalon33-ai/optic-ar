'use strict';
/*
 * Time is Brain - offline multiplayer stroke-awareness quiz
 * Server: Node.js + Express + Socket.IO. All game logic lives here;
 * the TV, tablets and host page only show what the server tells them.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const MEDIA_DIR = path.join(ROOT, 'media');
const DATA_DIR = path.join(ROOT, 'data');
const LOG_DIR = path.join(ROOT, 'logs');
const SETTINGS_FILE = path.join(ROOT, 'settings.json');
const QUESTIONS_FILE = path.join(ROOT, 'questions.json');
const UI_FILE = path.join(ROOT, 'ui-text.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const COUNTER_FILE = path.join(DATA_DIR, 'guest-counter.json');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const GAME_LOG = path.join(LOG_DIR, 'game.log');

const LANGS = ['en', 'ta', 'si'];
const TEAMS = ['red', 'blue'];
const ROUND_INTRO_MS = 4000;
const QUESTION_END_DELAY_MS = 1800;
const CLIP_SAFETY_MS = 180000;

/* ------------------------------------------------------------------ */
/* Logging - never crash, always write problems to logs/error.log      */
/* ------------------------------------------------------------------ */
let io = null;
const recentErrors = [];
function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* ignore */ } }
function logError(where, err) {
  const msg = (err && err.stack) ? err.stack : String(err);
  const line = `[${new Date().toISOString()}] ${where}: ${msg}\n`;
  console.error('ERROR ' + where + ': ' + (err && err.message ? err.message : msg));
  recentErrors.push({ time: new Date().toISOString(), where, message: err && err.message ? err.message : String(err) });
  if (recentErrors.length > 30) recentErrors.shift();
  try { ensureDir(LOG_DIR); fs.appendFileSync(ERROR_LOG, line); } catch (e) { /* ignore */ }
  scheduleHostInfo();
}
function logGame(text) {
  try { ensureDir(LOG_DIR); fs.appendFileSync(GAME_LOG, `[${new Date().toISOString()}] ${text}\n`); } catch (e) { /* ignore */ }
}
process.on('uncaughtException', e => logError('uncaughtException', e));
process.on('unhandledRejection', e => logError('unhandledRejection', e));

/* ------------------------------------------------------------------ */
/* JSON files                                                          */
/* ------------------------------------------------------------------ */
function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    let text = fs.readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // Notepad BOM
    return JSON.parse(text);
  } catch (e) {
    logError('Could not read ' + path.basename(file) + ' (check commas and quotes)', e);
    return fallback;
  }
}
function writeJSON(file, obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  try {
    ensureDir(path.dirname(file));
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.writeFileSync(file, text, 'utf8'); } catch (e2) { logError('Could not save ' + path.basename(file), e2); }
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  hostPin: '1990',
  port: 3000,
  neuronsPerSecond: 32000,
  wrongTapPenalty: 500000,
  wrongTapFreezeSeconds: 2,
  questionTimeLimitSeconds: 45,
  readLockSeconds: 3,
  explanationSeconds: 10,
  resultsScreenSeconds: 20,
  videoFile: 'stroke.mp4',
  homeVideoFile: 'srilanka.mp4',
  pauses: { round1: 16.4, round2: 81.5 },
  defaultSubtitleLanguage: 'ta',
  homeVideoSound: false
};
const NUMBER_LIMITS = {
  port: [1, 65535],
  neuronsPerSecond: [0, 100000000],
  wrongTapPenalty: [0, 1000000000],
  wrongTapFreezeSeconds: [0, 30],
  questionTimeLimitSeconds: [5, 600],
  readLockSeconds: [0, 60],
  explanationSeconds: [1, 600],
  resultsScreenSeconds: [3, 600]
};
function toNumber(v, fallback, min, max) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function cleanFileName(v, fallback) {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  return path.basename(v.trim());
}
function sanitizeSettings(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const out = {};
  out.hostPin = /^\d{1,10}$/.test(String(src.hostPin || '').trim()) ? String(src.hostPin).trim() : DEFAULT_SETTINGS.hostPin;
  for (const k of Object.keys(NUMBER_LIMITS)) {
    const [min, max] = NUMBER_LIMITS[k];
    out[k] = toNumber(src[k], DEFAULT_SETTINGS[k], min, max);
  }
  out.port = Math.round(out.port);
  out.videoFile = cleanFileName(src.videoFile, DEFAULT_SETTINGS.videoFile);
  out.homeVideoFile = cleanFileName(src.homeVideoFile, DEFAULT_SETTINGS.homeVideoFile);
  const p = (src.pauses && typeof src.pauses === 'object') ? src.pauses : {};
  out.pauses = {
    round1: toNumber(p.round1, DEFAULT_SETTINGS.pauses.round1, 0, 36000),
    round2: toNumber(p.round2, DEFAULT_SETTINGS.pauses.round2, 0, 36000)
  };
  if (out.pauses.round2 <= out.pauses.round1) out.pauses.round2 = out.pauses.round1 + 1;
  out.defaultSubtitleLanguage = LANGS.includes(src.defaultSubtitleLanguage) ? src.defaultSubtitleLanguage : DEFAULT_SETTINGS.defaultSubtitleLanguage;
  out.homeVideoSound = typeof src.homeVideoSound === 'boolean' ? src.homeVideoSound : DEFAULT_SETTINGS.homeVideoSound;
  return out;
}
let settings = sanitizeSettings(readJSON(SETTINGS_FILE, DEFAULT_SETTINGS));
if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, settings);
function reloadSettings() { settings = sanitizeSettings(readJSON(SETTINGS_FILE, settings)); return settings; }

/* ------------------------------------------------------------------ */
/* Questions and UI text                                               */
/* ------------------------------------------------------------------ */
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXT = ['.mp4', '.webm', '.m4v', '.mov'];
let questionWarnings = [];
let lastGoodQuestions = [];

function mediaExists(name) {
  try { return !!name && fs.statSync(path.join(MEDIA_DIR, name)).isFile(); } catch (e) { return false; }
}
function mediaType(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return null;
}
function findMediaFile(q) {
  if (typeof q.media === 'string' && q.media.trim()) {
    const name = path.basename(q.media.trim());
    if (mediaExists(name) && mediaType(name)) return name;
    questionWarnings.push(`Question ${q.id}: media file "${name}" was not found in the media folder.`);
  }
  // Automatic: q1.jpg, q1.png, q1.mp4 ...
  for (const ext of IMAGE_EXT.concat(VIDEO_EXT)) {
    const name = `q${q.id}${ext}`;
    if (mediaExists(name)) return name;
  }
  return '';
}
function langText(v, where) {
  if (typeof v === 'string') v = { en: v };
  if (!v || typeof v !== 'object') throw new Error(`${where} is missing`);
  const en = typeof v.en === 'string' ? v.en : '';
  const out = {};
  for (const l of LANGS) out[l] = (typeof v[l] === 'string' && v[l].trim()) ? v[l] : (en || v.ta || v.si || '');
  if (!out.en && !out.ta && !out.si) throw new Error(`${where} has no text`);
  return out;
}
function loadQuestions() {
  questionWarnings = [];
  const raw = readJSON(QUESTIONS_FILE, null);
  if (!Array.isArray(raw)) {
    questionWarnings.push('questions.json could not be read - using the last good copy. Check the file for missing commas or quotes.');
    return lastGoodQuestions;
  }
  const list = [];
  raw.forEach((q, i) => {
    try {
      if (!q || typeof q !== 'object') throw new Error('is not a question');
      const id = (q.id !== undefined && q.id !== null && String(q.id).trim()) ? String(q.id).trim() : String(i + 1);
      const round = Math.min(3, Math.max(1, Math.round(Number(q.round) || 1)));
      if (!Array.isArray(q.options) || q.options.length < 2) throw new Error('needs at least 2 options');
      const options = q.options.map((o, j) => ({ id: j, text: langText(o && o.text, `option ${j + 1}`), correct: !!(o && o.correct === true) }));
      const correctIds = options.filter(o => o.correct).map(o => o.id);
      if (!correctIds.length) throw new Error('has no correct option');
      const expSec = Number(q.explanationSeconds);
      const nq = {
        id, round,
        text: langText(q.text, 'text'),
        options,
        correctIds,
        explanation: q.explanation ? langText(q.explanation, 'explanation') : { en: '', ta: '', si: '' },
        explanationSeconds: (isFinite(expSec) && expSec > 0) ? Math.min(600, expSec) : null
      };
      nq.media = findMediaFile({ id, media: q.media });
      nq.mediaType = nq.media ? mediaType(nq.media) : null;
      list.push(nq);
    } catch (e) {
      questionWarnings.push(`Question number ${i + 1} was skipped: ${e.message}`);
    }
  });
  if (!list.length) {
    questionWarnings.push('No usable questions found in questions.json.');
    return lastGoodQuestions;
  }
  lastGoodQuestions = list;
  return list;
}
let uiText = {};
function loadUiText() {
  const t = readJSON(UI_FILE, null);
  if (t && typeof t === 'object') uiText = t;
  return uiText;
}
loadQuestions();
loadUiText();

/* ------------------------------------------------------------------ */
/* Scores and guest counter                                            */
/* ------------------------------------------------------------------ */
let scores = readJSON(SCORES_FILE, []);
if (!Array.isArray(scores)) scores = [];
function sortScores(list) {
  return list.slice().sort((a, b) => (a.neurons - b.neurons) || (a.wrongTaps - b.wrongTaps) || String(a.date).localeCompare(String(b.date)));
}
function topScores() {
  return sortScores(scores).slice(0, 10).map(s => ({ name: s.name, neurons: s.neurons, wrongTaps: s.wrongTaps, date: s.date, team: s.team }));
}
let guestCounter = (readJSON(COUNTER_FILE, { guestCounter: 0 }) || {}).guestCounter;
guestCounter = Number.isFinite(guestCounter) ? guestCounter : 0;
function nextGuestName() {
  guestCounter += 1;
  writeJSON(COUNTER_FILE, { guestCounter });
  return 'Guest ' + String(guestCounter).padStart(3, '0');
}
function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[^\p{L}\p{M}\p{N} .'\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
}

/* ------------------------------------------------------------------ */
/* Game clock: only moves when the game is NOT paused                  */
/* ------------------------------------------------------------------ */
let clockBase = 0;
let clockResumedAt = Date.now();
let clockPaused = false;
function gnow() { return clockPaused ? clockBase : clockBase + (Date.now() - clockResumedAt); }
function pauseClock() { if (!clockPaused) { clockBase = gnow(); clockPaused = true; } }
function resumeClock() { if (clockPaused) { clockResumedAt = Date.now(); clockPaused = false; } }

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */
function gameFields() {
  return { timeMs: 0, penalties: 0, wrongTaps: 0, running: false, runStart: 0, found: [], wrong: [], missing: [], finished: false, timedOut: false, frozenUntil: 0 };
}
function newTeam() {
  return Object.assign({ step: 'lang', lang: null, mode: null, name: '', ready: false, lastActivity: Date.now() }, gameFields());
}
const S = {
  phase: 'HOME', // HOME | VIDEO | ROUND_INTRO | QUESTION | EXPLANATION | RESULTS | TEST_VIDEO
  mode: null,
  participants: [],
  subtitleLang: settings.defaultSubtitleLanguage,
  homeSound: settings.homeVideoSound,
  paused: false,
  hold: false,
  round: 0,
  video: { segment: 0, rev: 0, pos: 0 },
  test: null,
  qList: [],
  qIdx: -1,
  q: null,
  foundOrder: [],
  qStart: 0,
  introEndsAt: 0,
  explStartsAt: 0,
  explEndsAt: 0,
  explWaitingClip: false,
  endingAt: 0,
  resultsEndsAt: 0,
  results: null,
  cfg: settings,
  gameId: 0
};
const teams = { red: newTeam(), blue: newTeam() };
const connections = { red: 0, blue: 0, tv: 0, host: 0 };
const other = t => (t === 'red' ? 'blue' : 'red');

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function neuronsOf(t, at) {
  const x = teams[t];
  const ms = x.timeMs + (x.running ? Math.max(0, (at === undefined ? gnow() : at) - x.runStart) : 0);
  return Math.round(x.penalties + ms * S.cfg.neuronsPerSecond / 1000);
}
function stopTeam(t, at) {
  const x = teams[t];
  if (x.running) { x.timeMs += Math.max(0, at - x.runStart); x.running = false; }
}
function segmentStart(seg) { return seg === 2 ? S.cfg.pauses.round1 : seg === 3 ? S.cfg.pauses.round2 : 0; }

function startGame(list) {
  reloadSettings();
  S.cfg = settings;
  const qs = loadQuestions();
  scheduleHostInfo();
  if (!qs.length) { hostToast('Cannot start: no questions in questions.json'); return false; }
  resumeClock();
  S.gameId += 1;
  S.participants = TEAMS.filter(t => list.includes(t));
  S.mode = S.participants.length === 2 ? 'team' : 'solo';
  for (const t of TEAMS) {
    const x = teams[t];
    if (S.participants.includes(t)) {
      Object.assign(x, gameFields());
      if (!x.name) x.name = nextGuestName();
      if (!x.lang) x.lang = S.cfg.defaultSubtitleLanguage;
      x.ready = true;
      x.step = 'playing';
      x.mode = S.mode;
    }
  }
  S.subtitleLang = S.participants.includes('red') ? teams.red.lang : teams[S.participants[0]].lang;
  S.qList = qs.slice().sort((a, b) => a.round - b.round).map(q => Object.assign({}, q, { options: shuffle(q.options) }));
  S.qIdx = -1;
  S.q = null;
  S.round = 0;
  S.paused = false;
  S.hold = false;
  S.results = null;
  S.test = null;
  logGame(`Game ${S.gameId} started (${S.mode}): ` + S.participants.map(t => `${t}=${teams[t].name}/${teams[t].lang}`).join(', '));
  startVideo(1);
  return true;
}
function startVideo(seg) {
  S.phase = 'VIDEO';
  S.video = { segment: seg, rev: S.video.rev + 1, pos: segmentStart(seg) };
  S.q = null;
  broadcast();
}
function startRound(r) {
  S.round = r;
  const first = S.qList.findIndex(q => q.round === r);
  if (first < 0) { afterRoundEnd(r); return; }
  S.qIdx = first - 1;
  S.q = S.qList[first];
  S.phase = 'ROUND_INTRO';
  S.introEndsAt = gnow() + ROUND_INTRO_MS;
  broadcast();
}
function afterRoundEnd(r) {
  if (r < 3) startVideo(r + 1); else showResults();
}
function startQuestion(i) {
  S.qIdx = i;
  S.q = S.qList[i];
  S.foundOrder = [];
  S.endingAt = 0;
  S.hold = false;
  const now = gnow();
  S.qStart = now;
  for (const t of S.participants) {
    const x = teams[t];
    Object.assign(x, { found: [], wrong: [], missing: [], finished: false, timedOut: false, frozenUntil: 0, running: true, runStart: now });
  }
  S.phase = 'QUESTION';
  broadcast();
}
function nextQuestion() {
  const n = S.qList[S.qIdx + 1];
  if (n && n.round === S.round) startQuestion(S.qIdx + 1);
  else afterRoundEnd(S.round);
}
function timeoutTeam(t, at) {
  const x = teams[t];
  stopTeam(t, at);
  x.timedOut = true;
  x.missing = S.q ? S.q.correctIds.filter(id => !x.found.includes(id)) : [];
}
function checkQuestionDone() {
  if (S.phase !== 'QUESTION' || S.endingAt) return;
  if (S.participants.every(t => teams[t].finished || teams[t].timedOut)) {
    S.endingAt = gnow() + QUESTION_END_DELAY_MS;
  }
}
function startExplanation() {
  const now = gnow();
  for (const t of S.participants) {
    const x = teams[t];
    if (!x.finished && !x.timedOut) timeoutTeam(t, now);
    stopTeam(t, now);
  }
  S.phase = 'EXPLANATION';
  S.hold = false;
  S.explStartsAt = now;
  const secs = (S.q && S.q.explanationSeconds) || S.cfg.explanationSeconds;
  if (S.q && S.q.mediaType === 'video') {
    S.explWaitingClip = true;
    S.explEndsAt = now + CLIP_SAFETY_MS;
  } else {
    S.explWaitingClip = false;
    S.explEndsAt = now + secs * 1000;
  }
  broadcast();
}
function showResults() {
  const now = gnow();
  for (const t of S.participants) stopTeam(t, now);
  const res = { mode: S.mode, teams: {}, winner: null };
  const date = new Date().toISOString();
  for (const t of S.participants) {
    const x = teams[t];
    const entry = { name: x.name, team: t, neurons: neuronsOf(t, now), wrongTaps: x.wrongTaps, date, mode: S.mode, lang: x.lang };
    scores.push(entry);
    res.teams[t] = { name: x.name, neurons: entry.neurons, wrongTaps: entry.wrongTaps, lang: x.lang };
  }
  writeJSON(SCORES_FILE, scores);
  const sorted = sortScores(scores);
  for (const t of S.participants) {
    const e = res.teams[t];
    const idx = sorted.findIndex(s => s.date === date && s.team === t);
    e.rank = idx >= 0 ? idx + 1 : null;
  }
  if (S.participants.length === 2) {
    const r = res.teams.red, b = res.teams.blue;
    if (r.neurons !== b.neurons) res.winner = r.neurons < b.neurons ? 'red' : 'blue';
    else if (r.wrongTaps !== b.wrongTaps) res.winner = r.wrongTaps < b.wrongTaps ? 'red' : 'blue';
    else res.winner = 'draw';
  }
  S.results = res;
  S.phase = 'RESULTS';
  S.q = null;
  S.resultsEndsAt = now + S.cfg.resultsScreenSeconds * 1000;
  logGame(`Game ${S.gameId} results: ` + JSON.stringify(res));
  scheduleHostInfo();
  broadcast();
}
function goHome() {
  resumeClock();
  S.phase = 'HOME';
  S.mode = null;
  S.participants = [];
  S.paused = false;
  S.hold = false;
  S.q = null;
  S.qIdx = -1;
  S.qList = [];
  S.round = 0;
  S.results = null;
  S.test = null;
  S.video = { segment: 0, rev: S.video.rev + 1, pos: 0 };
  S.subtitleLang = settings.defaultSubtitleLanguage;
  teams.red = newTeam();
  teams.blue = newTeam();
  broadcast();
}

/* Player actions */
function handleTap(t, optId) {
  if (S.phase !== 'QUESTION' || S.paused || !S.q || !S.participants.includes(t)) return;
  const x = teams[t];
  const now = gnow();
  if (x.finished || x.timedOut) return;
  if (now < S.qStart + S.cfg.readLockSeconds * 1000) return;
  if (now < x.frozenUntil) return;
  const id = Number(optId);
  const opt = S.q.options.find(o => o.id === id);
  if (!opt || x.found.includes(id) || x.wrong.includes(id)) return;
  if (opt.correct) {
    x.found.push(id);
    if (!S.foundOrder.includes(id)) S.foundOrder.push(id);
    if (S.q.correctIds.every(c => x.found.includes(c))) {
      x.finished = true;
      stopTeam(t, now);
      checkQuestionDone();
    }
  } else {
    x.wrong.push(id);
    x.wrongTaps += 1;
    x.penalties += S.cfg.wrongTapPenalty;
    x.frozenUntil = now + S.cfg.wrongTapFreezeSeconds * 1000;
    io.emit('penalty', { team: t, amount: S.cfg.wrongTapPenalty });
  }
  broadcast();
}
function tryAutoStart(t) {
  const x = teams[t];
  if (S.phase !== 'HOME') return;
  if (x.mode === 'solo') { startGame([t]); return; }
  const o = teams[other(t)];
  if (o.ready && o.mode === 'team') startGame(['red', 'blue']);
}
function handleSetup(t, action, data) {
  if (S.phase !== 'HOME') return;
  const x = teams[t];
  x.lastActivity = Date.now();
  switch (action) {
    case 'lang':
      if (!LANGS.includes(data.lang)) return;
      x.lang = data.lang; x.step = 'mode'; x.ready = false; break;
    case 'mode':
      if (!['team', 'solo'].includes(data.mode)) return;
      if (!x.lang) return;
      x.mode = data.mode; x.step = 'name'; x.ready = false; break;
    case 'name': {
      if (!x.mode) return;
      const n = cleanName(data.name);
      x.name = n || nextGuestName();
      x.step = 'ready'; x.ready = false; break;
    }
    case 'skipName':
      if (!x.mode) return;
      x.name = nextGuestName(); x.step = 'ready'; x.ready = false; break;
    case 'ready':
      if (!x.lang || !x.mode || !x.name) return;
      x.ready = true; x.step = 'ready';
      broadcast();
      tryAutoStart(t);
      return;
    case 'soloInstead':
      if (!x.lang || !x.name) return;
      x.mode = 'solo'; x.ready = true;
      broadcast();
      tryAutoStart(t);
      return;
    case 'back':
      if (x.ready) { x.ready = false; }
      else if (x.step === 'ready') x.step = 'name';
      else if (x.step === 'name') x.step = 'mode';
      else if (x.step === 'mode') x.step = 'lang';
      break;
    case 'restart':
      teams[t] = newTeam(); break;
    default: return;
  }
  broadcast();
}

/* Host actions */
function forceStart() {
  if (S.phase !== 'HOME') return hostToast('A game is already running. Press Reset game first.');
  let list = TEAMS.filter(t => teams[t].ready || (connections[t] > 0 && teams[t].lang));
  if (!list.length) list = TEAMS.filter(t => connections[t] > 0);
  if (!list.length) return hostToast('No tablet is connected. Open /tab?team=red on a tablet first.');
  startGame(list);
}
function togglePause() {
  if (S.phase === 'HOME') return;
  if (S.paused) { S.paused = false; resumeClock(); } else { S.paused = true; pauseClock(); }
  broadcast();
}
function hostNext() {
  switch (S.phase) {
    case 'VIDEO': startRound(S.video.segment); break;
    case 'ROUND_INTRO': startQuestion(S.qIdx + 1); break;
    case 'QUESTION': startExplanation(); break;
    case 'EXPLANATION': nextQuestion(); break;
    case 'RESULTS': goHome(); break;
    case 'TEST_VIDEO': goHome(); break;
    default: break;
  }
}
function skipQuestion() {
  if (S.phase === 'QUESTION') {
    const now = gnow();
    for (const t of S.participants) stopTeam(t, now);
    nextQuestion();
  } else if (S.phase === 'EXPLANATION') nextQuestion();
  else if (S.phase === 'ROUND_INTRO') { S.qIdx += 1; nextQuestion(); }
}
function replayVideo() {
  if (S.phase === 'VIDEO') startVideo(S.video.segment);
  else if (S.phase === 'ROUND_INTRO') startVideo(S.round);
  else hostToast('Replay works during the story video or the round title screen.');
}
function testPause(which, value) {
  if (S.phase !== 'HOME' && S.phase !== 'TEST_VIDEO') return hostToast('Test the pause point when no game is running.');
  const at = toNumber(value, S.cfg.pauses[which] || settings.pauses[which], 0, 36000);
  S.phase = 'TEST_VIDEO';
  S.test = { which, from: Math.max(0, at - 5), to: at, rev: (S.test ? S.test.rev : 0) + 1, file: settings.videoFile };
  broadcast();
}
function continueSolo(t) {
  if (!TEAMS.includes(t) || !S.participants.includes(t) || S.participants.length < 2) return;
  const o = other(t);
  stopTeam(o, gnow());
  S.participants = [t];
  S.mode = 'solo';
  teams[t].mode = 'solo';
  teams[o] = newTeam();
  logGame(`Continued as solo with ${t}`);
  checkQuestionDone();
  broadcast();
}

/* Timers: one small loop drives everything that is time based */
setInterval(() => {
  try {
    const now = gnow();
    if (S.paused) return;
    if (S.phase === 'QUESTION' && S.q) {
      const deadline = S.qStart + S.cfg.questionTimeLimitSeconds * 1000;
      let changed = false;
      for (const t of S.participants) {
        const x = teams[t];
        if (!x.finished && !x.timedOut && now >= deadline) { timeoutTeam(t, deadline); changed = true; }
      }
      if (changed) { checkQuestionDone(); broadcast(); }
      if (S.endingAt && now >= S.endingAt) startExplanation();
    } else if (S.phase === 'ROUND_INTRO' && now >= S.introEndsAt) {
      startQuestion(S.qIdx + 1);
    } else if (S.phase === 'EXPLANATION' && !S.hold && now >= S.explEndsAt) {
      nextQuestion();
    } else if (S.phase === 'RESULTS' && now >= S.resultsEndsAt) {
      goHome();
    } else if (S.phase === 'HOME') {
      // A visitor who walked away half-way through setup: start again after 3 minutes
      for (const t of TEAMS) {
        const x = teams[t];
        if (x.step !== 'lang' && !x.ready && Date.now() - x.lastActivity > 180000) { teams[t] = newTeam(); broadcast(); }
      }
    }
  } catch (e) { logError('timer', e); }
}, 100);

/* ------------------------------------------------------------------ */
/* What every screen receives                                          */
/* ------------------------------------------------------------------ */
function teamView(t) {
  const x = teams[t];
  return {
    connected: connections[t] > 0, step: x.step, lang: x.lang, mode: x.mode, name: x.name, ready: x.ready,
    timeMs: x.timeMs, penalties: x.penalties, wrongTaps: x.wrongTaps, running: x.running, runStart: x.runStart,
    found: x.found, wrong: x.wrong, missing: x.missing, finished: x.finished, timedOut: x.timedOut, frozenUntil: x.frozenUntil
  };
}
function publicState() {
  const q = S.q;
  const showQ = q && ['ROUND_INTRO', 'QUESTION', 'EXPLANATION'].includes(S.phase);
  const inExpl = S.phase === 'EXPLANATION';
  return {
    phase: S.phase, mode: S.mode, participants: S.participants, subtitleLang: S.subtitleLang, homeSound: S.homeSound,
    paused: S.paused, hold: S.hold, round: S.round, video: S.video, test: S.test, gameId: S.gameId,
    clock: { g: gnow(), paused: clockPaused },
    cfg: {
      neuronsPerSecond: S.cfg.neuronsPerSecond, questionTimeLimitSeconds: S.cfg.questionTimeLimitSeconds,
      readLockSeconds: S.cfg.readLockSeconds, wrongTapFreezeSeconds: S.cfg.wrongTapFreezeSeconds, wrongTapPenalty: S.cfg.wrongTapPenalty
    },
    qNumber: S.qIdx + 1, qTotal: S.qList.length,
    question: showQ ? {
      id: q.id, round: q.round,
      text: q.text,
      options: q.options.map(o => ({ id: o.id, text: o.text })),
      correct: inExpl ? q.correctIds : null,
      explanation: inExpl ? q.explanation : null,
      media: q.media, mediaType: q.mediaType
    } : null,
    foundOrder: S.foundOrder,
    qStart: S.qStart, introEndsAt: S.introEndsAt, explStartsAt: S.explStartsAt, explEndsAt: S.explEndsAt,
    explWaitingClip: S.explWaitingClip, endingAt: S.endingAt, resultsEndsAt: S.resultsEndsAt,
    teams: { red: teamView('red'), blue: teamView('blue') },
    tvConnected: connections.tv > 0,
    results: S.results,
    scores: topScores()
  };
}
function clientConfig() {
  const subs = {};
  for (const l of LANGS) {
    const base = path.basename(settings.videoFile, path.extname(settings.videoFile));
    const name = `${base}_${l}.vtt`;
    subs[l] = mediaExists(name) ? name : null;
  }
  return {
    ui: uiText,
    videoFile: mediaExists(settings.videoFile) ? settings.videoFile : null,
    homeVideoFile: mediaExists(settings.homeVideoFile) ? settings.homeVideoFile : null,
    subtitles: subs,
    pauses: settings.pauses,
    preload: lastGoodQuestions.filter(q => q.media).map(q => ({ file: q.media, type: q.mediaType }))
  };
}

/* ------------------------------------------------------------------ */
/* Network addresses                                                   */
/* ------------------------------------------------------------------ */
function getAddresses() {
  const list = [];
  const ifs = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) {
        let score = 0;
        if (/wi-?fi|wlan|wireless/i.test(name)) score += 10;
        if (/^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^10\./.test(a.address)) score += 5;
        if (/vethernet|virtual|vmware|vbox|hyper-v|loopback|bluetooth|docker|wsl/i.test(name)) score -= 20;
        list.push({ name, address: a.address, score });
      }
    }
  }
  return list.sort((x, y) => y.score - x.score);
}
let qrCache = {};
async function urlInfo() {
  const port = settings.port;
  const addrs = getAddresses();
  const main = addrs[0] ? addrs[0].address : 'localhost';
  const base = `http://${main}:${port}`;
  const urls = {
    ip: main,
    all: addrs.map(a => `${a.address} (${a.name})`),
    tv: `http://localhost:${port}/tv`,
    host: `http://localhost:${port}/host`,
    red: `${base}/tab?team=red`,
    blue: `${base}/tab?team=blue`
  };
  for (const k of ['red', 'blue']) {
    if (!qrCache[urls[k]]) {
      try { qrCache[urls[k]] = await QRCode.toDataURL(urls[k], { margin: 1, width: 220 }); } catch (e) { qrCache[urls[k]] = ''; }
    }
  }
  urls.qrRed = qrCache[urls.red];
  urls.qrBlue = qrCache[urls.blue];
  return urls;
}

/* ------------------------------------------------------------------ */
/* Web server                                                          */
/* ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
const noCache = (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); };
app.get('/', noCache, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get(['/tv', '/tv/'], noCache, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tv.html')));
app.get(['/tab', '/tab/'], noCache, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tab.html')));
app.get(['/host', '/host/'], noCache, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'host.html')));
app.use('/media', express.static(MEDIA_DIR, { maxAge: '1h', fallthrough: true }));
app.use(noCache, express.static(PUBLIC_DIR, { index: false }));
app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => { logError('web ' + req.url, err); if (!res.headersSent) res.status(500).send('Error'); });

const server = http.createServer(app);
io = new Server(server, { pingInterval: 5000, pingTimeout: 8000, maxHttpBufferSize: 1e5, serveClient: true });

let broadcastPending = false;
function broadcast() {
  if (broadcastPending) return;
  broadcastPending = true;
  setImmediate(() => {
    broadcastPending = false;
    try { io.emit('state', publicState()); } catch (e) { logError('broadcast', e); }
  });
}
let hostInfoPending = false;
function scheduleHostInfo() {
  if (hostInfoPending || !io) return;
  hostInfoPending = true;
  setTimeout(async () => {
    hostInfoPending = false;
    try { io.to('host').emit('hostinfo', await hostInfo()); } catch (e) { /* ignore */ }
  }, 50);
}
async function hostInfo() {
  const files = {};
  const base = path.basename(settings.videoFile, path.extname(settings.videoFile));
  for (const f of [settings.videoFile, settings.homeVideoFile, `${base}_en.vtt`, `${base}_ta.vtt`, `${base}_si.vtt`]) files[f] = mediaExists(f);
  return {
    settings,
    urls: await urlInfo(),
    files,
    questions: { count: lastGoodQuestions.length, warnings: questionWarnings, withMedia: lastGoodQuestions.filter(q => q.media).map(q => `Q${q.id}: ${q.media}`) },
    errors: recentErrors.slice(-10),
    guestCounter,
    scoreCount: scores.length
  };
}
function hostToast(msg) { if (!io) return; try { io.to('host').emit('toast', msg); } catch (e) { /* ignore */ } }

function safe(socket, event, fn) {
  socket.on(event, (data, ack) => {
    try { fn((data && typeof data === 'object') ? data : {}, typeof ack === 'function' ? ack : () => {}); }
    catch (e) { logError(`socket ${event}`, e); }
  });
}

io.on('connection', socket => {
  const q = socket.handshake.query || {};
  const role = ['tv', 'tab', 'host'].includes(q.role) ? q.role : 'other';
  const team = TEAMS.includes(q.team) ? q.team : null;
  socket.data.role = role;
  socket.data.team = team;
  if (role === 'tab' && team) connections[team] += 1;
  if (role === 'tv') connections.tv += 1;
  socket.emit('config', clientConfig());
  socket.emit('state', publicState());
  broadcast();

  socket.on('disconnect', () => {
    try {
      if (role === 'tab' && team) connections[team] = Math.max(0, connections[team] - 1);
      if (role === 'tv') connections.tv = Math.max(0, connections.tv - 1);
      broadcast();
    } catch (e) { logError('disconnect', e); }
  });

  // Tablets
  safe(socket, 'setup', d => { if (team) handleSetup(team, String(d.action || ''), d); });
  safe(socket, 'tap', d => { if (team) handleTap(team, d.option); });

  // TV
  safe(socket, 'videoProgress', d => {
    if (S.phase === 'VIDEO' && Number(d.rev) === S.video.rev && isFinite(Number(d.t))) S.video.pos = Number(d.t);
  });
  safe(socket, 'videoSegmentEnd', d => {
    if (S.phase === 'VIDEO' && Number(d.segment) === S.video.segment && Number(d.rev) === S.video.rev) startRound(S.video.segment);
  });
  safe(socket, 'clipEnded', d => {
    if (S.phase === 'EXPLANATION' && S.q && String(d.id) === String(S.q.id) && S.explWaitingClip) {
      S.explWaitingClip = false;
      const secs = S.q.explanationSeconds || S.cfg.explanationSeconds;
      S.explEndsAt = Math.max(gnow() + 1000, S.explStartsAt + secs * 1000);
      broadcast();
    }
  });
  safe(socket, 'testDone', d => {
    if (S.phase === 'TEST_VIDEO' && S.test && Number(d.rev) === S.test.rev) goHome();
  });

  // Host
  safe(socket, 'hostAuth', async (d, ack) => {
    if (String(d.pin || '') === String(settings.hostPin)) {
      socket.data.isHost = true;
      socket.join('host');
      ack({ ok: true });
      socket.emit('hostinfo', await hostInfo());
    } else ack({ ok: false });
  });
  safe(socket, 'host', async (d, ack) => {
    if (!socket.data.isHost) return ack({ ok: false, error: 'Not logged in' });
    const cmd = String(d.cmd || '');
    logGame('Host: ' + cmd);
    switch (cmd) {
      case 'start': forceStart(); break;
      case 'pause': togglePause(); break;
      case 'next': hostNext(); break;
      case 'hold':
        if (S.phase === 'EXPLANATION') {
          S.hold = !S.hold;
          if (!S.hold && S.explEndsAt - gnow() < 3000) S.explEndsAt = gnow() + 3000;
          broadcast();
        }
        break;
      case 'skip': skipQuestion(); break;
      case 'replay': replayVideo(); break;
      case 'reset': goHome(); break;
      case 'subtitle': if (LANGS.includes(d.lang)) { S.subtitleLang = d.lang; broadcast(); } break;
      case 'homeSound': S.homeSound = !S.homeSound; settings.homeVideoSound = S.homeSound; writeJSON(SETTINGS_FILE, settings); broadcast(); break;
      case 'clearScores': scores = []; writeJSON(SCORES_FILE, scores); logGame('Scoreboard cleared'); broadcast(); break;
      case 'resetGuest': guestCounter = 0; writeJSON(COUNTER_FILE, { guestCounter }); break;
      case 'resetTablet': if (TEAMS.includes(d.team) && S.phase === 'HOME') { teams[d.team] = newTeam(); broadcast(); } break;
      case 'continueSolo': continueSolo(d.team); break;
      case 'testPause': testPause(d.which === 'round2' ? 'round2' : 'round1', d.value); break;
      case 'saveSettings': {
        const merged = Object.assign({}, settings, d.settings || {});
        merged.pauses = Object.assign({}, settings.pauses, (d.settings && d.settings.pauses) || {});
        settings = sanitizeSettings(merged);
        writeJSON(SETTINGS_FILE, settings);
        if (S.phase === 'HOME') { S.cfg = settings; S.subtitleLang = settings.defaultSubtitleLanguage; }
        S.homeSound = settings.homeVideoSound;
        loadQuestions();
        loadUiText();
        io.emit('config', clientConfig());
        broadcast();
        hostToast('Settings saved.' + (S.phase !== 'HOME' ? ' Timing changes apply from the next game.' : ''));
        break;
      }
      case 'reloadFiles':
        reloadSettings(); loadQuestions(); loadUiText();
        io.emit('config', clientConfig());
        broadcast();
        hostToast(`Files reloaded: ${lastGoodQuestions.length} questions.`);
        break;
      default: return ack({ ok: false, error: 'Unknown command' });
    }
    ack({ ok: true });
    scheduleHostInfo();
  });
});

// Keep every screen in sync even if a message is lost
setInterval(() => { broadcast(); }, 5000);
setInterval(() => { scheduleHostInfo(); }, 15000);

/* ------------------------------------------------------------------ */
/* Start and print the addresses in big letters                        */
/* ------------------------------------------------------------------ */
const FONT = {
  '0': ['###', '# #', '# #', '# #', '###'], '1': [' # ', '## ', ' # ', ' # ', '###'], '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'], '4': ['# #', '# #', '###', '  #', '  #'], '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'], '7': ['###', '  #', '  #', '  #', '  #'], '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'], '.': ['   ', '   ', '   ', '   ', ' # '], ':': ['   ', ' # ', '   ', ' # ', '   ']
};
function bigText(s) {
  const rows = ['', '', '', '', ''];
  for (const ch of s) {
    const g = FONT[ch];
    if (!g) continue;
    for (let i = 0; i < 5; i++) rows[i] += g[i].replace(/#/g, '\u2588') + ' ';
  }
  return rows.join('\n');
}
async function printBanner() {
  const u = await urlInfo();
  const line = '='.repeat(70);
  console.log('\n' + line);
  console.log('   TIME IS BRAIN  -  the game is running.  Keep this window open!');
  console.log(line);
  console.log('\n   Laptop address (IP):\n');
  console.log(bigText(u.ip).split('\n').map(r => '   ' + r).join('\n'));
  console.log('\n   TYPE THESE ON EACH DEVICE:\n');
  console.log(`   RED tablet   :  ${u.red}`);
  console.log(`   BLUE tablet  :  ${u.blue}`);
  console.log(`   TV (laptop)  :  ${u.tv}`);
  console.log(`   HOST (laptop):  ${u.host}      PIN: ${settings.hostPin}`);
  if (u.all.length > 1) console.log('\n   Other addresses of this laptop (try these if the first does not work):\n   ' + u.all.join('\n   '));
  if (!getAddresses().length) console.log('\n   !! No Wi-Fi found. Connect the laptop to the phone hotspot, then close this window and start again.');
  console.log('\n   To stop the game: close this window.\n' + line + '\n');
}
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n   The game is ALREADY RUNNING in another window (port ${settings.port} is busy).`);
    console.log('   Close the other black window first, or just use the one that is open.\n');
    process.exit(2);
  }
  logError('server', e);
});
server.listen(settings.port, '0.0.0.0', () => {
  printBanner().catch(e => logError('banner', e));
  logGame('Server started');
});
