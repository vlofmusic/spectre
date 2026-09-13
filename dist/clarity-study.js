(() => {
  'use strict';
  const study = document.querySelector('[data-clarity-study]');
  if (!study) return;
  const button = study.querySelector('[data-clarity-replay]');
  const lines = [...study.querySelectorAll('[data-clarity-text]')];
  const originals = lines.map(line => line.textContent);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const forced = window.matchMedia('(forced-colors: active)');
  const canObserve = 'IntersectionObserver' in window;
  const glyphs = '+/<>:*=#%{}[]';
  const duration = 3600;
  let frame = 0;
  let start = 0;
  let lastPaint = -Infinity;
  let visible = false;
  let played = false;

  const motionAllowed = () => !reduced.matches && !forced.matches;
  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    lines.forEach((line, index) => { line.textContent = originals[index]; });
    study.dataset.clarityState = 'clear';
    button.textContent = 'Replay';
    button.setAttribute('aria-label', 'Replay the transition from noise to direction');
    button.hidden = !motionAllowed() || !canObserve;
  }
  function paint(elapsed) {
    lines.forEach((line, index) => {
      const progress = Math.max(0, Math.min(1, (elapsed - 850 - index * 760) / 1000));
      const count = Math.floor(originals[index].length * progress);
      line.textContent = [...originals[index]].map((letter, position) => {
        if (position < count || letter === ' ') return letter;
        return glyphs[Math.floor(Math.random() * glyphs.length)];
      }).join('');
    });
  }
  function tick(now) {
    if (!visible || document.hidden || !motionAllowed()) { finish(); return; }
    const elapsed = now - start;
    if (elapsed >= duration) { finish(); return; }
    // A gentle 10fps symbol change; no text duplication or overlapping layer.
    if (now - lastPaint >= 100) { paint(elapsed); lastPaint = now; }
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (!visible || document.hidden || !motionAllowed()) { finish(); return; }
    cancelAnimationFrame(frame);
    played = true;
    start = performance.now();
    lastPaint = -Infinity;
    study.dataset.clarityState = 'noise';
    button.textContent = 'Show result';
    button.setAttribute('aria-label', 'Show result immediately');
    paint(0);
    frame = requestAnimationFrame(tick);
  }
  button.addEventListener('click', () => { if (frame) finish(); else play(); });
  const preferencesChanged = () => {
    finish();
    if (visible && !played && motionAllowed()) play();
  };
  reduced.addEventListener('change', preferencesChanged);
  forced.addEventListener('change', preferencesChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  window.addEventListener('pagehide', finish);
  window.addEventListener('pageshow', () => { if (played) finish(); });
  finish();
  if (canObserve) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
      if (!visible) finish();
      else if (!played) play();
    }, { threshold: [0, .25] });
    observer.observe(study);
  } else {
    // Without visibility observation, retain the readable static explanation.
    button.hidden = true;
  }
})();
