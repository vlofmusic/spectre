/* Useful controls and one bounded entrance per section; content is visible without JS. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const tabs=[...document.querySelectorAll('[data-expression]')];
  const stage=document.querySelector('[data-expression-stage]');
  const media={language:'expression-form',interface:'interface-form',identity:'identity-form'};
  let revision=0, current='language';
  const swap=async key=>{
    if(!stage)return;
    const request=++revision;
    if(key===current)return;
    const next=new Image();next.alt='';next.width=5504;next.height=3072;
    next.sizes='(max-width:720px) 100vw, 50vw';
    next.srcset=`assets/${media[key]}-800.webp 800w, assets/${media[key]}-1400.webp 1400w`;
    next.src=`assets/${media[key]}-800.webp`;
    try{await next.decode();}catch{return;}
    if(request!==revision)return;
    current=key;
    const previous=stage.querySelector('img:last-child');
    stage.querySelectorAll('img').forEach(image=>{if(image!==previous)image.remove();});
    stage.append(next);
    document.querySelector('[data-expression-caption]').textContent=`0${Object.keys(media).indexOf(key)+1} / ${key[0].toUpperCase()+key.slice(1)}`;
    if(reduced.matches){previous?.remove();return;}
    previous?.animate([{opacity:1,filter:'blur(0px)'},{opacity:0,filter:'blur(8px)'}],{duration:500,fill:'forwards'});
    const animation=next.animate([
      {opacity:0,filter:'blur(12px)',transform:'scale(1.07)',clipPath:'inset(9% 12% 9% 12% round 44%)'},
      {opacity:1,filter:'blur(1px)',transform:'scale(1.012)',clipPath:'inset(0% round 12%)',offset:.74},
      {opacity:1,filter:'blur(0px)',transform:'scale(1)',clipPath:'inset(0% round 0%)'}
    ],{duration:680,easing:'cubic-bezier(.22,.72,.2,1)'});
    animation.finished.catch(()=>{}).then(()=>{if(next.isConnected&&stage.lastElementChild===next)stage.querySelectorAll('img').forEach(image=>{if(image!==next)image.remove();});});
  };
  const select=button=>{
    swap(button.dataset.expression);
    tabs.forEach(tab=>{const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;});
    const panel=document.getElementById(button.getAttribute('aria-controls'));
    if(!reduced.matches&&panel.animate)panel.animate([{opacity:.55,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out'});
  };
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>select(button));
    button.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();select(tabs[next]);tabs[next].focus();
    });
  });
  if(tabs.length)select(tabs[0]);
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      observer.unobserve(entry.target);
      if(!reduced.matches&&entry.target.animate)entry.target.animate([{opacity:.7,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:620,easing:'cubic-bezier(.2,.75,.2,1)'});
    }),{threshold:.12});
    document.querySelectorAll('[data-story-panel] .starting-copy,[data-story-panel] .home-heading').forEach(node=>observer.observe(node));
  }
  reduced.addEventListener('change',()=>{if(reduced.matches)document.querySelectorAll('[data-story-panel] *').forEach(node=>node.getAnimations?.().forEach(animation=>animation.cancel()));});
})();
