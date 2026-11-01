/* Live, admin-editable settings stored in SQLite: game odds, disabled games, announcement banner, tipping rules.
 * Odds changes bump a version number; the browser sends the version it is displaying with every bet and the
 * server refuses the bet if it is stale, so a player is never paid differently from what they were shown. */
'use strict';
const L = require('../js/lib.js');
const { db, q } = require('./db');
const bus = require('./bus');

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const get = (k, d) => { const r = q('SELECT value FROM settings WHERE key = ?').get(k); return r ? JSON.parse(r.value) : d; };
const put = (k, v) => q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

const PLINKO_DEFAULT = Object.fromEntries(Object.entries(L.PLINKO_CFG).map(([k, v]) => [k, v.target]));
const LIMITS = { edgeMin: 0.005, edgeMax: 0.5, plinkoMin: 0.5, plinkoMax: 0.99 };

function apply() {
  const o = get('odds', {});
  for (const k of Object.keys(L.DEFAULT_EDGE)) L.EDGE[k] = (o.edge && o.edge[k] != null) ? o.edge[k] : L.DEFAULT_EDGE[k];
  for (const r of Object.keys(PLINKO_DEFAULT)) L.PLINKO_CFG[r].target = (o.plinko && o.plinko[r] != null) ? o.plinko[r] : PLINKO_DEFAULT[r];
}
apply();

const version = () => get('oddsVersion', 1);
const disabled = () => get('disabledGames', []);
const odds = () => ({ v: version(), edge: { ...L.EDGE }, plinko: Object.fromEntries(Object.entries(L.PLINKO_CFG).map(([k, v]) => [k, v.target])), disabled: disabled() });

/** Update odds and/or disabled games. edge/plinko values are fractions (0.08 = 8%). */
function setOdds({ edge, plinko, disabledGames }) {
  const cur = get('odds', {});
  const next = { edge: { ...(cur.edge || {}) }, plinko: { ...(cur.plinko || {}) } };
  for (const [k, v] of Object.entries(edge || {})) {
    if (!(k in L.DEFAULT_EDGE)) throw new Error('Unknown game: ' + k);
    const x = Number(v); if (!(x >= LIMITS.edgeMin && x <= LIMITS.edgeMax)) throw new Error(`House edge must be between ${LIMITS.edgeMin * 100}% and ${LIMITS.edgeMax * 100}%`);
    next.edge[k] = Math.round(x * 10000) / 10000;
  }
  for (const [k, v] of Object.entries(plinko || {})) {
    if (!(k in PLINKO_DEFAULT)) throw new Error('Unknown Plinko risk: ' + k);
    const x = Number(v); if (!(x >= LIMITS.plinkoMin && x <= LIMITS.plinkoMax)) throw new Error(`Plinko RTP must be between ${LIMITS.plinkoMin * 100}% and ${LIMITS.plinkoMax * 100}%`);
    next.plinko[k] = Math.round(x * 10000) / 10000;
  }
  put('odds', next);
  if (Array.isArray(disabledGames)) put('disabledGames', [...new Set(disabledGames.map(String))]);
  put('oddsVersion', version() + 1);
  apply();
  bus.emit('odds', odds());
  return odds();
}
function resetOdds() { put('odds', {}); put('oddsVersion', version() + 1); apply(); bus.emit('odds', odds()); return odds(); }

const announcement = () => get('announcement', null);
function setAnnouncement(a) {
  const v = a && String(a.text || '').trim() ? { id: Date.now(), text: String(a.text).trim().slice(0, 280), tone: ['info', 'promo', 'warning'].includes(a.tone) ? a.tone : 'info', link: /^(#[a-z0-9-]+|https:\/\/[^\s"'<>]{1,200})$/i.test(a.link || '') ? a.link : '' } : null;
  put('announcement', v); bus.emit('announce', v); return v;
}

const TIP_DEFAULT = { enabled: true, minWagered: 100, dailyMax: 5000 }; // credits
const tipping = () => ({ ...TIP_DEFAULT, ...get('tipping', {}) });
function setTipping(t) {
  const v = { enabled: !!t.enabled, minWagered: Math.max(0, Number(t.minWagered) || 0), dailyMax: Math.max(0, Number(t.dailyMax) || 0) };
  put('tipping', v); return v;
}

module.exports = { get, put, odds, version, disabled, setOdds, resetOdds, announcement, setAnnouncement, tipping, setTipping, LIMITS };
