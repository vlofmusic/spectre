/* Shared navigation enhancement; all content and links also work without JavaScript. */
(() => {
  document.querySelectorAll('[data-year]').forEach(node => { node.textContent = new Date().getFullYear(); });
  const header = document.querySelector('[data-header]');
  let scrolled = null;
  const updateHeader = () => {
    const next = window.scrollY > 24;
    if (next !== scrolled) header?.classList.toggle('is-scrolled', next);
    scrolled = next;
  };
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
  const nav = document.querySelector('.glass-nav');
  if (!nav) return;
  const glide = document.createElement('span');
  glide.className = 'nav-glide';
  glide.setAttribute('aria-hidden', 'true');
  nav.appendChild(glide);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  let motion = null;
  let currentItem = null;
  let gapTimer = 0;
  const stop = () => { motion?.cancel(); motion = null; };
  const itemBox = item => ({x:item.offsetLeft,y:item.offsetTop,width:item.offsetWidth,height:item.offsetHeight});
  const renderedBox = () => {
    const box = glide.getBoundingClientRect(), parent = nav.getBoundingClientRect();
    return {x:box.left-parent.left-nav.clientLeft,y:box.top-parent.top-nav.clientTop,width:box.width,height:box.height};
  };
  const place = box => {
    glide.style.width = `${box.width}px`;
    glide.style.height = `${box.height}px`;
    glide.style.left = `${box.x}px`;
    glide.style.top = `${box.y}px`;
    glide.style.transform = 'none';
  };
  const hide = () => {
    clearTimeout(gapTimer);gapTimer = 0;
    // Freeze the current highlight before fading, rather than snapping to its old destination.
    const box = motion ? renderedBox() : null;
    stop();if(box)place(box);
    currentItem = null;
    nav.classList.remove('is-nav-active');
  };
  const move = item => {
    clearTimeout(gapTimer);gapTimer = 0;
    if(currentItem === item && nav.classList.contains('is-nav-active'))return;
    const destination = itemBox(item);
    if(!destination.width || !destination.height)return;
    const wasVisible = nav.classList.contains('is-nav-active');
    const start = wasVisible ? renderedBox() : destination;
    const startOpacity = wasVisible ? Number.parseFloat(getComputedStyle(glide).opacity) : 0;
    stop();place(destination);currentItem = item;
    nav.classList.add('is-nav-active');
    if(reduced.matches || forced.matches || typeof glide.animate !== 'function')return;

    // The highlight simply changes location. Optical distortion belongs to the backdrop,
    // not to a stretching control; rapid retargets start at its current rendered position.
    const animation = glide.animate([
      {transform:`translate3d(${start.x-destination.x}px,${start.y-destination.y}px,0)`,opacity:startOpacity},
      {transform:'translate3d(0,0,0)',opacity:1}
    ],{duration:wasVisible?360:240,easing:'cubic-bezier(.22,.65,.3,1)'});
    motion = animation;
    animation.onfinish = () => { if(motion === animation)motion = null; };
  };
  const items = [...nav.querySelectorAll('.nav-link')];
  items.forEach(item => {
    item.addEventListener('pointerenter', () => move(item));
    item.addEventListener('focus', () => move(item));
  });
  const logo = nav.querySelector('.nav-logo');
  logo?.addEventListener('pointerenter', hide);
  logo?.addEventListener('focus', hide);
  nav.addEventListener('pointermove', event => {
    if(event.target.closest('.nav-link')){clearTimeout(gapTimer);gapTimer = 0;return;}
    if(event.target.closest('.nav-logo')){hide();return;}
    // Bridge the small grid gaps during a transition; resting in empty space still clears it.
    if(!gapTimer)gapTimer = setTimeout(hide,75);
  });
  nav.addEventListener('pointerleave', hide);
  nav.addEventListener('focusout', event => { if (!event.relatedTarget?.matches('.nav-link')) hide(); });
  const settle = () => {
    clearTimeout(gapTimer);gapTimer = 0;
    stop();
    if(currentItem && nav.classList.contains('is-nav-active'))place(itemBox(currentItem));
  };
  window.addEventListener('resize', settle, { passive: true });
  if('ResizeObserver' in window){
    const observer = new ResizeObserver(settle);
    observer.observe(nav);items.forEach(item => observer.observe(item));
  }
  [reduced,forced].forEach(query => query.addEventListener('change',settle));
  document.addEventListener('visibilitychange',() => { if(document.hidden)hide(); });
  window.addEventListener('pagehide',hide);
})();
