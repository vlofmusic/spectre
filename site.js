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
  const hide = () => nav.classList.remove('is-nav-active');
  const move = item => {
    glide.style.setProperty('--glide-x', `${item.offsetLeft}px`);
    glide.style.top = `${item.offsetTop}px`;
    glide.style.width = `${item.offsetWidth}px`;
    glide.style.height = `${item.offsetHeight}px`;
    nav.classList.add('is-nav-active');
  };
  nav.querySelectorAll('.nav-link').forEach(item => {
    item.addEventListener('pointerenter', () => move(item));
    item.addEventListener('focus', () => move(item));
  });
  const logo = nav.querySelector('.nav-logo');
  logo?.addEventListener('pointerenter', hide);
  logo?.addEventListener('focus', hide);
  nav.addEventListener('pointermove', event => { if (!event.target.closest('.nav-link')) hide(); });
  nav.addEventListener('pointerleave', hide);
  nav.addEventListener('focusout', event => { if (!event.relatedTarget?.matches('.nav-link')) hide(); });
  window.addEventListener('resize', hide, { passive: true });
})();
