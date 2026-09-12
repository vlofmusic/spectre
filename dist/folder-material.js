/* CSS owns the slow material drift. JavaScript only gates its visibility/lifecycle. */
(() => {
  'use strict';
  const covers=[...document.querySelectorAll('.scope-folder-cover')];
  if(!covers.length||!('IntersectionObserver' in window))return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  let pageActive=true;
  const states=new Map();

  covers.forEach(cover=>{
    let layer=cover.querySelector('.scope-folder-enchantment');
    if(!layer){
      layer=document.createElement('span');
      layer.className='scope-folder-enchantment';
      layer.setAttribute('aria-hidden','true');
      // The logo follows this decorative layer in paint order and stays legible.
      cover.insertBefore(layer,cover.querySelector('.scope-folder-seal'));
    }
    states.set(cover,{layer,visible:false,observed:false});
  });

  const sync=()=>{
    const allowed=pageActive&&!document.hidden&&!reduced.matches&&!forced.matches;
    states.forEach(state=>{
      state.layer.classList.toggle('is-enchantment-running',allowed&&state.visible);
    });
  };
  const refresh=()=>{
    states.forEach((state,cover)=>{
      // A restored page can have a different scroll position. A previous observer
      // result alone must not start the material while its cover is offscreen.
      const rect=cover.getBoundingClientRect();
      state.visible=state.observed&&rect.width>0&&rect.height>0&&
        rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
    });
    sync();
  };
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const state=states.get(entry.target);
      state.observed=true;
      state.visible=entry.isIntersecting&&entry.intersectionRatio>0;
    });
    sync();
  },{threshold:[0,.01]});
  covers.forEach(cover=>observer.observe(cover));
  [reduced,forced].forEach(query=>query.addEventListener('change',sync));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)sync();else refresh();
  });
  addEventListener('pagehide',()=>{pageActive=false;sync();});
  addEventListener('pageshow',()=>{pageActive=true;refresh();});
})();
