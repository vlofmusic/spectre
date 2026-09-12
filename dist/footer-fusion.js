(() => {
  'use strict';

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  const canAnimate = () => finePointer.matches && !reducedMotion.matches && !forcedColors.matches && !document.hidden;
  const glyphs = '·─+~:*|/\\';

  document.querySelectorAll('.signature-stage').forEach(seal => {
    const host = seal.closest('.signature-footer');
    const mark = seal.querySelector('img[src^="assets/spectre-fusion.svg"]');
    if (!mark) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'footer-fusion-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const sample = document.createElement('canvas');
    let context;
    let sampler;
    try {
      context = canvas.getContext('2d');
      sampler = sample.getContext('2d', { willReadFrequently: true });
    } catch { return; }
    if (!context || !sampler) return;
    seal.append(canvas);

    let cells = [];
    let frame = 0;
    let lastPaint = -Infinity;
    let dirty = true;
    let failed = false;
    let inView = false;
    let width = 0;
    let height = 0;
    let cellSize = 8;
    let bounds;
    let previousPoint;
    let lastPulse = -Infinity;

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      cells.forEach(cell => { cell.born = -Infinity; });
      try { context.clearRect(0, 0, width, height); }
      catch { failed = true; canvas.remove(); }
      seal.classList.remove('is-fusion-pulsing');
      previousPoint = undefined;
    }

    function disable() {
      clear();
      failed = true;
      canvas.remove();
      cells = [];
    }

    function prepare() {
      if (failed || !canAnimate() || !inView || !mark.complete || !mark.naturalWidth) return false;
      if (!dirty) return !!cells.length;
      clear();
      if (failed) return false;
      bounds = seal.getBoundingClientRect();
      width = seal.clientWidth;
      height = seal.clientHeight;
      if (width < 1 || height < 1) return false;

      try {
        const ratio = Math.min(devicePixelRatio || 1, 1.25, 1600 / width);
        canvas.width = Math.ceil(width * ratio);
        canvas.height = Math.ceil(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        sample.width = width;
        sample.height = height;

        // Match the oversized SVG's exact crop in the full-footer field.
        const rect = mark.getBoundingClientRect();
        sampler.drawImage(mark, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
        const pixels = sampler.getImageData(0, 0, width, height).data;
        cellSize = 17;
        cells = [];
        for (let y = cellSize / 2, row = 0; y < height; y += cellSize, row++) {
          for (let x = cellSize / 2, col = 0; x < width; x += cellSize, col++) {
            let alpha = 0;
            for (const dy of [-.25, 0, .25]) {
              for (const dx of [-.25, 0, .25]) {
                const px = Math.min(width - 1, Math.max(0, Math.floor(x + dx * cellSize)));
                const py = Math.min(height - 1, Math.max(0, Math.floor(y + dy * cellSize)));
                alpha += pixels[(py * width + px) * 4 + 3] / 255;
              }
            }
            alpha /= 9;
            if (alpha < .18) continue;
            const seed = (col * 17 + row * 29) % 31;
            cells.push({ x, y, alpha, seed, born: -Infinity, delay: 0 });
          }
        }
        context.font = `500 ${11}px ui-monospace, SFMono-Regular, Consolas, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        dirty = false;
        return !!cells.length;
      } catch {
        disable();
        return false;
      }
    }

    function draw(now) {
      try { render(now); }
      catch { disable(); }
    }

    function render(now) {
      frame = 0;
      if (!canAnimate() || !inView || failed) { clear(); return; }
      if (now - lastPaint < 32) { frame = requestAnimationFrame(draw); return; }
      lastPaint = now;
      context.clearRect(0, 0, width, height);
      let active = false;
      for (const cell of cells) {
        const elapsed = now - cell.born - cell.delay;
        if (elapsed < 0) { active = true; continue; }
        const progress = elapsed / 690;
        if (progress >= 1) continue;
        active = true;
        const intensity = Math.pow(Math.sin(progress * Math.PI), 1.5) * cell.alpha;
        if (cell.seed % 3 === 0) {
          context.globalAlpha = intensity * .12;
          context.fillStyle = cell.seed % 2 ? '#93899f' : '#55505e';
          context.fillRect(cell.x - cellSize / 2 + .5, cell.y - cellSize / 2 + .5, cellSize - 1, cellSize - 1);
        }
        context.globalAlpha = intensity * .32;
        context.fillStyle = cell.seed % 4 ? '#423b4d' : '#80738e';
        context.fillText(glyphs[(cell.seed * 13 + Math.floor(elapsed / 75) * 17) % glyphs.length], cell.x, cell.y + .5);
      }
      context.globalAlpha = 1;
      if (active) frame = requestAnimationFrame(draw);
      else seal.classList.remove('is-fusion-pulsing');
    }

    function pulse(event) {
      if (event.pointerType === 'touch' || !canAnimate() || !inView || failed) return;
      if (!prepare()) return;
      // The full seal rectangle receives pointer input, including gaps between the arms.
      bounds = seal.getBoundingClientRect();
      const x = event.clientX - bounds.left - seal.clientLeft;
      const y = event.clientY - bounds.top - seal.clientTop;
      const now = performance.now();
      if (now - lastPulse < 65 || (previousPoint && Math.hypot(x - previousPoint.x, y - previousPoint.y) < cellSize)) return;
      lastPulse = now;
      previousPoint = { x, y };
      let nearest = cells[0];
      for (const cell of cells) {
        if (Math.hypot(cell.x - x, cell.y - y) < Math.hypot(nearest.x - x, nearest.y - y)) nearest = cell;
      }
      const radius = Math.max(140, Math.min(250, width * .2));
      for (const cell of cells) {
        const distance = Math.hypot(cell.x - nearest.x, cell.y - nearest.y);
        if (distance > radius) continue;
        // Let a cell finish its short wave before a later move starts another one.
        if (now - cell.born < 690 + cell.delay) continue;
        cell.born = now;
        cell.delay = (cell.seed * 19 + Math.floor(cell.x)) % 180;
      }
      seal.classList.add('is-fusion-pulsing');
      if (!frame) frame = requestAnimationFrame(draw);
    }

    host.addEventListener('pointerenter', event => pulse(event));
    host.addEventListener('pointermove', event => pulse(event));
    host.addEventListener('pointerleave', () => { previousPoint = undefined; });
    mark.addEventListener('load', () => { dirty = true; });
    canvas.addEventListener('contextlost', disable);

    // Each response ends within 900ms. There is no perpetual animation loop.
    const onModeChange = () => { clear(); dirty = true; };
    [finePointer, reducedMotion, forcedColors].forEach(query => query.addEventListener('change', onModeChange));
    document.addEventListener('visibilitychange', onModeChange);
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', onModeChange);
    window.addEventListener('resize', onModeChange, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(onModeChange).observe(seal);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting);
        if (!inView) clear();
      }).observe(seal);
    } else {
      // Older browsers retain the original static mark.
      disable();
    }
  });
})();
