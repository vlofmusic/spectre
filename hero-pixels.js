/* One cached pixel field. Only the cursor neighbourhood is recomputed during input. */
(() => {
  const hero = document.querySelector('[data-pixel-hero]');
  const canvas = document.querySelector('[data-pixel-field]');
  if (!hero || !canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  const base = document.createElement('canvas');
  const baseContext = base.getContext('2d', { alpha: true });
  if (!context || !baseContext) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let width = 1, height = 1, step = 10, cols = 0, rows = 0;
  let frame = 0, visible = true, lastTime = 0;
  let x = 0, y = 0, targetX = 0, targetY = 0, strength = 0, targetStrength = 0;
  let rect = null;
  let points = [];
  const enabled = () => visible && !document.hidden && !reduced.matches && fine.matches;
  const paintBase = () => {
    context.clearRect(0, 0, width, height);
    context.drawImage(base, 0, 0, width, height);
  };
  const stop = () => {
    const needsReset = strength > 0 || targetStrength > 0;
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    targetStrength = strength = 0;
    rect = null;
    if (needsReset) paintBase();
  };
  const requestDraw = () => {
    if (!frame && enabled()) frame = requestAnimationFrame(draw);
  };
  const draw = now => {
    frame = 0;
    if (!enabled()) { stop(); return; }
    const dt = lastTime ? Math.min(50, now - lastTime) : 16.67;
    lastTime = now;
    const blend = 1 - Math.exp(-dt / 65);
    x += (targetX - x) * blend;
    y += (targetY - y) * blend;
    strength += (targetStrength - strength) * blend;
    paintBase();
    const radius = Math.max(110, Math.min(220, width * .19));
    const minCol = Math.max(0, Math.floor((x - radius) / step));
    const maxCol = Math.min(cols - 1, Math.ceil((x + radius) / step));
    const minRow = Math.max(0, Math.floor((y - radius) / step));
    const maxRow = Math.min(rows - 1, Math.ceil((y + radius) / step));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const point = points[row * cols + col];
        const distance = Math.hypot(point.x - x, point.y - y) / radius;
        if (distance >= 1) continue;
        const light = Math.pow(1 - distance * distance, 2) * strength;
        const size = point.size + light * 2.5;
        context.fillStyle = `rgba(218,201,240,${(light * .62).toFixed(3)})`;
        context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      }
    }
    const unsettled = Math.abs(targetStrength - strength) > .004 ||
      (strength > .004 && Math.hypot(targetX - x, targetY - y) > .3);
    if (unsettled) requestDraw();
    else {
      lastTime = 0;
      if (targetStrength === 0) { strength = 0; paintBase(); }
    }
  };
  const resize = () => {
    const next = hero.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(next.width));
    const nextHeight = Math.max(1, Math.round(next.height));
    if (nextWidth === width && nextHeight === height && points.length) return;
    cancelAnimationFrame(frame);
    frame = 0;
    targetStrength = strength = 0;
    width = nextWidth; height = nextHeight; rect = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = base.width = Math.round(width * dpr);
    canvas.height = base.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    step = Math.max(10, Math.ceil(Math.sqrt(width * height / 12000)));
    cols = Math.ceil(width / step); rows = Math.ceil(height / step);
    points = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * step + step / 2, py = row * step + step / 2;
        const nx = px / width, ny = py / height;
        const wave = (Math.sin(nx * 12 + ny * 7) + Math.sin(nx * 21 - ny * 11) + 2) / 4;
        const size = 1.2 + wave * 2;
        points.push({ x: px, y: py, size });
        baseContext.fillStyle = `rgba(204,191,224,${(.045 + wave * wave * .24).toFixed(3)})`;
        baseContext.fillRect(px - size / 2, py - size / 2, size, size);
      }
    }
    paintBase();
    canvas.classList.add('is-ready');
  };
  const move = event => {
    if (!enabled() || event.pointerType === 'touch') return;
    if (!rect) rect = hero.getBoundingClientRect();
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!strength) { x = targetX; y = targetY; }
    targetStrength = 1;
    requestDraw();
  };
  hero.addEventListener('pointerenter', move, { passive: true });
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', () => { targetStrength = 0; rect = null; requestDraw(); });
  hero.addEventListener('pointercancel', stop);
  window.addEventListener('scroll', stop, { passive: true });
  document.addEventListener('visibilitychange', stop);
  reduced.addEventListener('change', stop);
  fine.addEventListener('change', stop);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) stop(); }).observe(hero);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize, { passive: true });
  resize();
})();
