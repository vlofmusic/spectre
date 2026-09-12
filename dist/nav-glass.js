/* A small scroll-responsive lens. No page clones, screenshots or perpetual animation. */
(() => {
  'use strict';
  const nav=document.querySelector('.glass-nav');
  if(!nav)return;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const contrast=matchMedia('(prefers-contrast:more)');
  const forced=matchMedia('(forced-colors:active)');
  const desktop=matchMedia('(min-width:721px) and (pointer:fine)');
  // CSS.supports only checks grammar. WebKit and Gecko accept url() but do not
  // reliably render SVG backdrop filters. Keep their independent CSS glass path.
  // WebKit issue: https://bugs.webkit.org/show_bug.cgi?id=245510
  const chromium=/(Chrome|Chromium|Edg)\//.test(navigator.userAgent)&&!/(CriOS|EdgiOS)\//.test(navigator.userAgent);
  const svgNS='http://www.w3.org/2000/svg';
  let svg=null, lens=null, map=null, displacement=null;
  let frame=0, timer=0, lastPaint=0, lastScroll=scrollY, lastEvent=performance.now();
  let pressure=0, target=0, motionUntil=0, sizeDirty=true, visible=true;
  const allowed=()=>!document.hidden&&visible&&!reduced.matches&&!contrast.matches&&!forced.matches;
  const fullLens=()=>allowed()&&chromium&&desktop.matches;
  const element=(tag,attrs={})=>{
    const node=document.createElementNS(svgNS,tag);
    Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));
    return node;
  };
  const reset=()=>{
    cancelAnimationFrame(frame);clearTimeout(timer);frame=timer=0;pressure=target=0;
    nav.style.removeProperty('--glass-blur');nav.style.removeProperty('--glass-sheen');nav.style.removeProperty('--glass-angle');
    displacement?.setAttribute('scale','26');
    lastScroll=scrollY;lastEvent=performance.now();
  };
  const prepare=()=>{
    if(!fullLens()){nav.dataset.navOptics='soft';return;}
    try {
      if(!svg){
        svg=element('svg',{'aria-hidden':'true',focusable:'false',class:'nav-optics-defs'});
        const defs=element('defs');
        lens=element('filter',{id:'spectre-nav-lens',filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse',x:'0',y:'0','color-interpolation-filters':'sRGB'});
        map=element('feImage',{result:'lensMap',preserveAspectRatio:'none',x:'0',y:'0'});
        displacement=element('feDisplacementMap',{in:'SourceGraphic',in2:'lensMap',scale:'26',xChannelSelector:'R',yChannelSelector:'G'});
        lens.append(map,displacement);defs.append(lens);svg.append(defs);document.body.append(svg);
      }
      if(sizeDirty){
        const width=Math.round(nav.clientWidth),height=Math.round(nav.clientHeight);
        if(width<1||height<1)return;
        // A single low-resolution normal map, recalculated only on size changes.
        const surface=document.createElement('canvas');surface.width=Math.ceil(width/2);surface.height=Math.ceil(height/2);
        const ctx=surface.getContext('2d');if(!ctx)throw new Error('No canvas');
        const pixels=ctx.createImageData(surface.width,surface.height);
        const radius=height/2;
        for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
          const px=(x+.5)*2,py=(y+.5)*2;
          const cx=Math.max(radius,Math.min(width-radius,px));
          const dx=px-cx,dy=py-radius,dist=Math.hypot(dx,dy)||1;
          // Keep the centre calm and concentrate the lens slope toward the capsule rim.
          const rim=Math.max(0,Math.min(1,(dist/radius-.32)/.68));
          const edge=rim*rim*(3-2*rim);
          const i=(y*surface.width+x)*4;
          pixels.data[i]=Math.round(128+dx/dist*edge*112);
          pixels.data[i+1]=Math.round(128+dy/dist*edge*112);
          pixels.data[i+2]=128;pixels.data[i+3]=255;
        }
        ctx.putImageData(pixels,0,0);
        lens.setAttribute('width',width);lens.setAttribute('height',height);
        map.setAttribute('width',width);map.setAttribute('height',height);
        map.setAttribute('href',surface.toDataURL('image/png'));
        sizeDirty=false;
      }
      nav.dataset.navOptics='refraction';
    }catch{nav.dataset.navOptics='soft';}
  };
  const schedule=()=>{if(!frame&&allowed())frame=requestAnimationFrame(paint);};
  function paint(now){
    frame=0;
    if(!allowed()){reset();return;}
    if(now-lastPaint<32){clearTimeout(timer);timer=setTimeout(schedule,32-(now-lastPaint));return;}
    lastPaint=now;
    if(now>motionUntil)target=0;
    pressure+=(target-pressure)*.22;
    if(Math.abs(pressure)<.006&&target===0)pressure=0;
    // Scroll position changes the light direction; speed briefly adds lens tension.
    const phase=Math.sin(scrollY/540);
    nav.style.setProperty('--glass-sheen',`${(46+phase*9+pressure*3).toFixed(2)}%`);
    nav.style.setProperty('--glass-angle',`${(118+phase*4+pressure*2).toFixed(2)}deg`);
    nav.style.setProperty('--glass-blur',`${(9+Math.abs(pressure)).toFixed(2)}px`);
    if(nav.dataset.navOptics==='refraction')displacement?.setAttribute('scale',(26+Math.abs(pressure)*3+phase*.6).toFixed(2));
    if(pressure!==0||target!==0)schedule();
  }
  const onScroll=()=>{
    const now=performance.now(),next=scrollY,elapsed=Math.max(16,now-lastEvent);
    const speed=(next-lastScroll)/elapsed;
    lastScroll=next;lastEvent=now;
    if(!allowed())return;
    target=Math.max(-1,Math.min(1,speed*.22));motionUntil=now+80;schedule();
  };
  const mode=()=>{reset();prepare();};
  [reduced,contrast,forced,desktop].forEach(query=>query.addEventListener('change',mode));
  document.addEventListener('visibilitychange',mode);
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('pagehide',reset);
  addEventListener('pageshow',mode);
  const resize=()=>{reset();sizeDirty=true;prepare();};
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(nav);
  else addEventListener('resize',resize,{passive:true});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)reset();else prepare();}).observe(nav);
  prepare();
})();
