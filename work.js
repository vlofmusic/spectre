/* Manual image viewing. Every image also has a working full-size link without JS. */
(() => {
  const frames = [...document.querySelectorAll('[data-work-image]')];
  const dialog = document.querySelector('.wk-viewer');
  if (!frames.length || typeof dialog?.showModal !== 'function') return;
  const full = dialog.querySelector('[data-work-full]');
  const caption = dialog.querySelector('[data-work-caption]');
  const counter = dialog.querySelector('[data-work-count]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.2,.75,.2,1)';
  let index = 0;
  let opener = null;
  let closing = false;
  let overflow = '';
  let sequence = 0;
  let panelMotion = null;
  let imageMotion = null;

  function renderImage(animate = false) {
    const currentSequence = ++sequence;
    const frame = frames[index];
    const source = frame.querySelector('img');
    imageMotion?.cancel();
    full.src = source.currentSrc || source.src;
    full.alt = source.alt;
    caption.textContent = source.alt;
    counter.textContent = `${index + 1} / ${frames.length}`;
    if (animate && !reduced.matches) {
      imageMotion = full.animate([
        { opacity: .25, filter: 'blur(7px)', transform: 'scale(.985)' },
        { opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }
      ], { duration: 420, easing: ease });
    }
    // Keep the visible thumbnail until the full image is decoded. Fast changes cannot
    // replace the current image with the result of an older request.
    const larger = new Image();
    larger.src = frame.href;
    larger.decode().then(() => {
      if (sequence === currentSequence && dialog.open && !closing) full.src = larger.src;
    }).catch(() => { /* The already-visible source remains a useful fallback. */ });
  }

  function openViewer(event, next) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (closing) return;
    opener = frames[next];
    index = next;
    const rect = opener.getBoundingClientRect();
    overflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    renderImage();
    if (!reduced.matches) {
      const x = (rect.left + rect.width / 2 - innerWidth / 2) * .2;
      const y = (rect.top + rect.height / 2 - innerHeight / 2) * .2;
      panelMotion = dialog.animate([
        { opacity: 0, transform: `translate(${x}px, ${y}px) scale(.88,.94)`, borderRadius: '70px', filter: 'blur(6px)' },
        { opacity: 1, transform: 'translate(0,0) scale(1.004,1.004)', borderRadius: '34px', filter: 'blur(0)', offset: .78 },
        { opacity: 1, transform: 'translate(0,0) scale(1)', borderRadius: getComputedStyle(dialog).borderRadius, filter: 'blur(0)' }
      ], { duration: 480, easing: ease });
    }
  }

  async function closeViewer() {
    if (!dialog.open || closing) return;
    closing = true;
    ++sequence;
    panelMotion?.cancel();
    imageMotion?.cancel();
    if (!reduced.matches) {
      panelMotion = dialog.animate([
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        { opacity: 0, transform: 'scale(.96,.97)', filter: 'blur(5px)' }
      ], { duration: 220, easing: ease });
      await panelMotion.finished.catch(() => {});
    }
    dialog.close();
  }

  function move(direction) {
    if (!dialog.open || closing) return;
    index = (index + direction + frames.length) % frames.length;
    renderImage(true);
  }
  frames.forEach((frame, next) => frame.addEventListener('click', event => openViewer(event, next)));
  dialog.querySelector('[data-work-close]').addEventListener('click', closeViewer);
  dialog.querySelector('[data-work-prev]').addEventListener('click', () => move(-1));
  dialog.querySelector('[data-work-next]').addEventListener('click', () => move(1));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeViewer();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  dialog.addEventListener('close', () => {
    ++sequence;
    panelMotion?.cancel();
    imageMotion?.cancel();
    document.documentElement.style.overflow = overflow;
    closing = false;
    opener?.focus({ preventScroll: true });
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    panelMotion?.cancel();
    imageMotion?.cancel();
  });
})();
