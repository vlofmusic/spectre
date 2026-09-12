/* Shared-brand motion: bounded pointer feedback, with quiet/offscreen fallbacks. */
(() => {
  const hero = document.querySelector('[data-apparel-ambient]');
  const photo = document.querySelector('[data-zoom]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let heroVisible = true, frame = 0, bounds = null, pointer = null;
  const resetPointer = () => {
    cancelAnimationFrame(frame); frame = 0; bounds = null; pointer = null;
    photo.classList.remove('is-photo-tracking');
  };
  const sync = () => {
    hero.toggleAttribute('data-ambient-active', heroVisible && !document.hidden && !reduce.matches && !forced.matches);
    if (reduce.matches || forced.matches || !fine.matches || document.hidden || !heroVisible) resetPointer();
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; sync(); }).observe(hero);
  }
  document.addEventListener('visibilitychange',sync);
  reduce.addEventListener('change',sync);
  forced.addEventListener('change',sync);
  fine.addEventListener('change',sync);
  photo.addEventListener('pointermove',event => {
    if (reduce.matches || forced.matches || !fine.matches || event.pointerType==='touch') return;
    pointer = { x:event.clientX, y:event.clientY };
    if (!frame) frame=requestAnimationFrame(() => {
      frame=0;
      if (!pointer) return;
      bounds ||= photo.getBoundingClientRect();
      const x=Math.max(52,Math.min(bounds.width-52,pointer.x-bounds.left));
      const y=Math.max(52,Math.min(bounds.height-52,pointer.y-bounds.top));
      photo.style.setProperty('--photo-x',`${x}px`);
      photo.style.setProperty('--photo-y',`${y}px`);
      photo.classList.add('is-photo-tracking');
    });
  },{passive:true});
  ['pointerleave','pointercancel'].forEach(event=>photo.addEventListener(event,resetPointer));
  window.addEventListener('scroll',resetPointer,{passive:true});
  window.addEventListener('resize',resetPointer,{passive:true});
  const action = document.querySelector('[data-glass-action]');
  let actionFrame = 0, actionPoint = null;
  const clearActionLight = () => {
    cancelAnimationFrame(actionFrame); actionFrame=0; actionPoint=null;
    action.style.removeProperty('--glass-x'); action.style.removeProperty('--glass-y');
  };
  action.addEventListener('pointermove',event => {
    if (reduce.matches || forced.matches || !fine.matches || event.pointerType==='touch') return;
    actionPoint={x:event.clientX,y:event.clientY};
    if (!actionFrame) actionFrame=requestAnimationFrame(() => {
      actionFrame=0;
      const rect=action.getBoundingClientRect();
      action.style.setProperty('--glass-x',`${actionPoint.x-rect.left}px`);
      action.style.setProperty('--glass-y',`${actionPoint.y-rect.top}px`);
    });
  },{passive:true});
  ['pointerleave','pointercancel'].forEach(event=>action.addEventListener(event,clearActionLight));
  reduce.addEventListener('change',clearActionLight);
  forced.addEventListener('change',clearActionLight);
  fine.addEventListener('change',clearActionLight);
  document.addEventListener('visibilitychange',clearActionLight);
  const editorialImage = document.querySelector('.ap-editorial-large img');
  const editorialCaption = document.querySelector('.ap-editorial-large figcaption');
  const views = {
    front: ['tests15419','Another front view of the black Spectre Hoodie','The light emblem, from the front.'],
    back: ['tests15449','Back view showing the tonal embroidery','The silhouette, from another angle.']
  };
  const editorial = editorialImage.closest('.ap-editorial-large');
  const viewButtons = [...document.querySelectorAll('[data-editorial-view]')];
  let viewRevision = 0;
  editorialCaption.setAttribute('aria-live','polite');
  viewButtons.forEach(button => {
    button.addEventListener('click',async () => {
      const request=++viewRevision;
      const [file,alt,caption] = views[button.dataset.editorialView];
      editorial.setAttribute('aria-busy','true');
      const next=new Image();
      next.sizes=editorialImage.sizes;
      next.srcset=`assets/apparel/${file}-960.webp 960w, assets/apparel/${file}-1600.webp 1600w`;
      next.src=`assets/apparel/${file}-960.webp`;
      let timer;
      try {
        await Promise.race([next.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Image timeout')),6500);})]);
        if(request!==viewRevision)return;
        const previous=new Image();previous.src=editorialImage.currentSrc||editorialImage.src;
        try { await previous.decode(); } catch {}
        if(request!==viewRevision)return;
        window.SpectreSurface?.stop(editorial);
        editorialImage.srcset=next.srcset;editorialImage.src=next.src;editorialImage.alt=alt;
        editorialCaption.textContent=caption;
        viewButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
        if(!reduce.matches&&!forced.matches&&!document.hidden) window.SpectreSurface?.revealImage(editorial,editorialImage,previous);
      } catch {
        if(request===viewRevision)editorialCaption.textContent='This view could not be loaded. Please try again.';
      } finally {
        clearTimeout(timer);
        if(request===viewRevision)editorial.removeAttribute('aria-busy');
      }
    });
  });
  addEventListener('pagehide',()=>{viewRevision++;editorial.removeAttribute('aria-busy');resetPointer();clearActionLight();});
  sync();
})();
