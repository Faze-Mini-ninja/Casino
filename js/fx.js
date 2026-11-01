/* Sound effects (synthesised with WebAudio, no files), mute toggle and the big-win celebration. */
(function () {
  'use strict';
  const C = window.Casino, h = C.h;
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('casino.mute') === '1'; } catch (e) { /* ignore */ }
  const ac = () => { if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function tone(freq, dur, type = 'sine', vol = 0.12, when = 0, slide = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUNDS = {
    bet: () => tone(520, 0.06, 'triangle', 0.06),
    tick: () => tone(1200, 0.025, 'square', 0.02),
    card: () => { tone(300, 0.05, 'triangle', 0.05); tone(180, 0.06, 'sine', 0.04, 0.01); },
    win: () => [659, 784, 988].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, i * 0.08)),
    bigwin: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, 'triangle', 0.1, i * 0.09)),
    lose: () => tone(220, 0.22, 'sine', 0.05, 0, 0.6),
    cash: () => { tone(1318, 0.08, 'square', 0.04); tone(1760, 0.14, 'square', 0.04, 0.06); },
    pop: () => tone(160, 0.18, 'sawtooth', 0.12, 0, 0.3),
  };
  C.sfx = (name) => { if (muted) return; try { (SOUNDS[name] || (() => {}))(); } catch (e) { /* audio unavailable */ } };
  C.isMuted = () => muted;
  C.setMuted = (m) => { muted = m; try { localStorage.setItem('casino.mute', m ? '1' : '0'); } catch (e) { /* ignore */ } paintMute(); };
  const VOL_ON = '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>', VOL_OFF = '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>';
  function paintMute() { const b = document.getElementById('mute-btn'); if (b) b.innerHTML = `<svg class="i" viewBox="0 0 24 24">${muted ? VOL_OFF : VOL_ON}</svg>`; }
  document.addEventListener('DOMContentLoaded', () => {
    const tr = document.querySelector('.top-right'); if (!tr) return;
    const b = h('button', { class: 'icon-btn', id: 'mute-btn', 'aria-label': 'Sound', title: 'Sound on/off', onclick: () => C.setMuted(!muted) });
    tr.prepend(b); paintMute();
  });

  /* big win overlay with confetti (closes on tap or when leaving the page) */
  window.addEventListener('hashchange', () => document.querySelectorAll('.bigwin').forEach((x) => x.remove()));
  C.bigWin = (mult, amount) => {
    const cv = h('canvas', { class: 'confetti' }), wrap = h('div', { class: 'bigwin', onclick: () => wrap.remove() }, cv,
      h('div', { class: 'bw-card' }, h('div', { class: 'bw-k' }, mult >= 50 ? 'MEGA WIN' : 'BIG WIN'), h('div', { class: 'bw-m' }, mult.toFixed(2) + '×'), h('div', { class: 'bw-a' }, '+' + C.fmt(amount))));
    document.body.append(wrap);
    C.sfx('bigwin');
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight), g = cv.getContext('2d');
    const cols = ['#22e58b', '#ffc24b', '#ff4d63', '#3d8bff', '#a855f7', '#fff'];
    const ps = Array.from({ length: 160 }, () => ({ x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
    const t0 = performance.now();
    (function frame(t) {
      if (!document.body.contains(wrap)) return;
      g.clearRect(0, 0, W, H);
      ps.forEach((p) => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.a += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(frame); else wrap.classList.add('out');
      if (t - t0 > 3000) wrap.remove();
    })(t0);
  };
})();
