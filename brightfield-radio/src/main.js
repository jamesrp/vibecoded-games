(function () {
  'use strict';
  const PLAN = window.RADIO_PLAN;
  const ENG = window.RADIO_ENG;
  const SCN = window.RADIO_SCENES;
  const canvas = document.getElementById('scene');
  const tracksEl = document.getElementById('tracks');
  const playBtn = document.getElementById('play');
  const nowEl = document.getElementById('now');
  const hintEl = document.getElementById('hint');
  const variantEl = document.getElementById('variant');
  const volEl = document.getElementById('vol');
  const sleepEl = document.getElementById('sleep');
  const leftEl = document.getElementById('sleepleft');

  const ACC = { victory: '#e6c35c', greenhouse: '#8fbf7a', night: '#8aa7d4', dawn: '#e89a6a', aqua: '#7fe3ff', skyline: '#9adfff', eco: '#9be06a' };
  const q = new URLSearchParams(location.search);
  const state = {
    track: q.get('track') || 'victory',
    variant: q.get('variant') === 'star' ? 'star' : 'leaf',
    volume: 0.85,
    sceneT: parseFloat(q.get('t') || '0') || 0,
    group: q.get('group') === 'aero' ? 'aero' : 'classic',
    engine: null,
    lastDraw: 0,
  };
  if (q.get('track')) {
    const boot = PLAN.TRACKS.find((t) => t.id === q.get('track'));
    if (boot) state.group = boot.group || 'classic';
  }

  try {
    const saved = JSON.parse(localStorage.getItem('bf-radio') || '{}');
    if (!q.get('track') && saved.track) state.track = saved.track;
    if (!q.get('variant') && saved.variant) state.variant = saved.variant;
    if (typeof saved.volume === 'number' && !q.get('vol')) state.volume = saved.volume;
    if (!q.get('track') && !q.get('group') && saved.group) state.group = saved.group;
    if (saved.track && !q.get('track')) {
      const savedMeta = PLAN.TRACKS.find((t) => t.id === saved.track);
      if (savedMeta) state.group = savedMeta.group || saved.group || 'classic';
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem('bf-radio', JSON.stringify({ track: state.track, variant: state.variant, volume: state.volume, group: state.group })); } catch (e) {}
  }

  function meta() { return PLAN.TRACKS.find((t) => t.id === state.track) || PLAN.TRACKS[0]; }

  function ensure() {
    if (state.engine) return state.engine;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) { hintEl.textContent = 'This browser cannot play Web Audio.'; return null; }
    const ctx = new C();
    state.engine = ENG.create(ctx, {
      track: state.track,
      variant: state.variant,
      volume: state.volume,
      seed: 11,
      progress: state.track === 'dawn' && q.get('progress') ? parseFloat(q.get('progress')) : 0,
    });
    if (state._pendingSleep) state.engine.setSleep(state._pendingSleep);
    return state.engine;
  }

  function renderTracks() {
    document.body.classList.toggle('aero', state.group === 'aero');
    const groupsEl = document.getElementById('groups');
    if (groupsEl) {
      for (const b of groupsEl.querySelectorAll('button')) {
        b.setAttribute('aria-selected', b.getAttribute('data-group') === state.group ? 'true' : 'false');
      }
    }
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = state.group === 'aero' ? 'frutiger aero' : 'a brightfield station';
    tracksEl.innerHTML = '';
    for (const t of PLAN.TRACKS) {
      if ((t.group || 'classic') !== state.group) continue;
      const b = document.createElement('button');
      b.className = 'track';
      b.textContent = t.name;
      b.style.setProperty('--acc', ACC[t.id] || '#e6c35c');
      b.setAttribute('aria-selected', t.id === state.track ? 'true' : 'false');
      b.addEventListener('click', () => select(t.id));
      tracksEl.appendChild(b);
    }
    variantEl.classList.toggle('show', state.track === 'victory');
    for (const b of variantEl.querySelectorAll('button')) {
      b.setAttribute('aria-selected', b.getAttribute('data-var') === state.variant ? 'true' : 'false');
    }
    nowEl.textContent = state.track === 'victory'
      ? (state.variant === 'star' ? 'Brightfield Victory · Star' : 'Brightfield Victory · Leaf')
      : meta().name;
  }

  function select(id, variant) {
    const t = PLAN.TRACKS.find((x) => x.id === id);
    if (t) state.group = t.group || 'classic';
    state.track = id;
    if (variant) state.variant = variant;
    if (state.engine) {
      state.engine.setTrack(id, state.variant);
    }
    renderTracks();
    save();
    hintEl.textContent = meta().blurb;
  }

  function setGroup(g) {
    if (g !== 'classic' && g !== 'aero') return;
    state.group = g;
    const cur = PLAN.TRACKS.find((t) => t.id === state.track);
    if (!cur || (cur.group || 'classic') !== g) {
      const next = PLAN.TRACKS.find((t) => (t.group || 'classic') === g);
      if (next) return select(next.id);
    }
    renderTracks();
    save();
  }

  function setPlayingUi(on) {
    playBtn.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) hintEl.textContent = meta().blurb;
    else hintEl.textContent = 'Tap play to start the music';
  }

  playBtn.addEventListener('click', function () {
    const eng = ensure();
    if (!eng) return;
    if (eng.E.ctx.state === 'suspended') eng.E.ctx.resume();
    eng.toggle();
    setPlayingUi(eng.playing);
  });

  variantEl.addEventListener('click', function (e) {
    const v = e.target.getAttribute('data-var');
    if (!v) return;
    state.variant = v;
    if (state.engine) state.engine.setVariant(v);
    renderTracks();
    save();
  });

  const groupsEl = document.getElementById('groups');
  if (groupsEl) groupsEl.addEventListener('click', function (e) {
    const g = e.target.getAttribute('data-group');
    if (g) setGroup(g);
  });

  volEl.value = String(Math.round(state.volume * 100));
  volEl.addEventListener('input', function () {
    state.volume = parseInt(volEl.value, 10) / 100;
    if (state.engine) state.engine.setVolume(state.volume);
    save();
  });

  sleepEl.addEventListener('click', function (e) {
    const raw = e.target.getAttribute('data-sleep');
    if (raw == null) return;
    const min = parseInt(raw, 10);
    for (const b of sleepEl.querySelectorAll('button')) {
      b.setAttribute('aria-selected', b.getAttribute('data-sleep') === raw ? 'true' : 'false');
    }
    if (state.engine) state.engine.setSleep(min);
    else state._pendingSleep = min;
    leftEl.textContent = min ? ('Sleep in ' + min + ' min') : '';
  });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  function sceneId() {
    return meta().scene;
  }

  function draw(now) {
    requestAnimationFrame(draw);
    if (document.hidden) return;
    if (now - state.lastDraw < 33) return;
    state.lastDraw = now;
    const real = state.sceneT ? state.sceneT : now / 1000;
    // If a fixed ?t= is set (screenshots), freeze; otherwise use clock.
    const t = q.get('t') ? state.sceneT : real;
    const ctx = canvas.getContext('2d');
    const dpr = canvas.width / window.innerWidth;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const progress = state.engine && state.track === 'dawn' ? state.engine.progress
      : (q.get('progress') ? parseFloat(q.get('progress')) : null);
    SCN.draw(ctx, sceneId(), window.innerWidth, window.innerHeight, t, {
      variant: state.variant,
      progress: progress,
    });
    if (state.engine && state.engine.playing && state.engine.sleepLeft > 0) {
      const s = Math.ceil(state.engine.sleepLeft);
      const m = Math.floor(s / 60), r = s % 60;
      leftEl.textContent = 'Sleep in ' + m + ':' + String(r).padStart(2, '0');
    }
    if (state.engine && !state.engine.playing && playBtn.getAttribute('aria-pressed') === 'true') {
      setPlayingUi(false);
    }
  }
  requestAnimationFrame(draw);

  window.__RADIO = {
    select: function (id, variant) { select(id, variant); },
    play: function () { const e = ensure(); if (e.E.ctx.state === 'suspended') e.E.ctx.resume(); e.start(); setPlayingUi(true); },
    pause: function () { if (state.engine) { state.engine.pause(); setPlayingUi(false); } },
    setVolume: function (v) { state.volume = v; volEl.value = String(Math.round(v * 100)); if (state.engine) state.engine.setVolume(v); },
    setSleep: function (min) { if (state.engine) state.engine.setSleep(min); },
    setTime: function (t) { state.sceneT = t; },
    get state() { return { track: state.track, variant: state.variant, group: state.group, playing: !!(state.engine && state.engine.playing), progress: state.engine ? state.engine.progress : 0 }; },
    engine: function () { return state.engine; },
    ensure: ensure,
    PLAN: PLAN,
    ENG: ENG,
  };

  const cur0 = PLAN.TRACKS.find((t) => t.id === state.track);
  if (!cur0 || (cur0.group || 'classic') !== state.group) {
    const next = PLAN.TRACKS.find((t) => (t.group || 'classic') === state.group);
    if (next) state.track = next.id;
  }
  renderTracks();
  hintEl.textContent = meta().blurb;
  if (q.get('track')) select(q.get('track'), q.get('variant') || state.variant);
})();
