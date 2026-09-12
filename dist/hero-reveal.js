/* Adapted from the supplied ASCII ripple idea: one finite pass, original heading untouched. */
(() => {
  'use strict';
  const heading=document.getElementById('hero-title');
  const host=heading?.closest('.hero-copy');
  if(!heading||!host||!window.IntersectionObserver||!window.CSS)return;
  if(!CSS.supports('mask-image','linear-gradient(#000,#000)')&&!CSS.supports('-webkit-mask-image','linear-gradient(#000,#000)'))return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const symbols='·─~+:;=*π┐┌┘┴┬╬║░▒■/\\';
  const duration=1000;
  let canvas=null, frame=0, cleanupTimer=0, readyTimer=0;
  let entered=false, visible=false, ready=false;

  const stop=()=>{
    cancelAnimationFrame(frame);
    clearTimeout(cleanupTimer);
    frame=cleanupTimer=0;
    heading.classList.remove('hero-ripple-active');
    heading.style.removeProperty('--hero-ripple-mask');
    canvas?.remove();
    canvas=null;
  };
  const eligible=()=>!document.hidden&&!reduced.matches&&!forced.matches&&visible;

  const play=()=>{
    if(entered||!ready||!eligible())return;
    entered=true;
    try{
      const bounds=heading.getBoundingClientRect();
      const parent=host.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const overlay=document.createElement('canvas');
      const ctx=overlay.getContext('2d');
      if(!ctx)return;
      const ratio=Math.min(devicePixelRatio||1,1.5);
      overlay.width=Math.ceil(bounds.width*ratio);
      overlay.height=Math.ceil(bounds.height*ratio);
      overlay.className='hero-ripple-canvas';
      overlay.setAttribute('aria-hidden','true');
      Object.assign(overlay.style,{
        left:`${bounds.left-parent.left}px`,top:`${bounds.top-parent.top}px`,
        width:`${bounds.width}px`,height:`${bounds.height}px`
      });
      ctx.scale(ratio,ratio);
      const glyphs=[];
      const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
      const range=document.createRange();
      let node, index=0;
      while((node=walker.nextNode())){
        const style=getComputedStyle(node.parentElement);
        let offset=0;
        for(const letter of node.textContent){
          const from=offset;
          offset+=letter.length;
          if(/\s/.test(letter)){index++;continue;}
          range.setStart(node,from);range.setEnd(node,offset);
          const rect=range.getBoundingClientRect();
          if(rect.width&&rect.height)glyphs.push({
            index,x:rect.left-bounds.left,y:rect.top-bounds.top,width:rect.width,height:rect.height,
            font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
            size:parseFloat(style.fontSize),color:style.color
          });
          index++;
        }
      }
      if(!glyphs.length)return;
      const band=Math.max(32,parseFloat(getComputedStyle(heading).fontSize)*.82);
      const inkWidth=Math.max(...glyphs.map(glyph=>glyph.x+glyph.width));
      let lastPaint=-Infinity;
      const start=performance.now();
      canvas=overlay;
      host.append(overlay);
      const paint=now=>{
        try{
          const elapsed=now-start;
          if(elapsed>=duration||!eligible()){stop();return;}
          if(now-lastPaint>=1000/24){
            lastPaint=now;
            const front=-band+(elapsed/duration)*(inkWidth+band*2);
            const mask=`linear-gradient(90deg,#000 ${front-band}px,transparent ${front-band*.5}px,transparent ${front+band*.5}px,#000 ${front+band}px)`;
            ctx.clearRect(0,0,bounds.width,bounds.height);
            glyphs.forEach(glyph=>{
              if(glyph.x>front+band||glyph.x+glyph.width<front-band)return;
              const centre=glyph.x+glyph.width/2;
              const strength=Math.max(0,1-Math.abs(centre-front)/band);
              ctx.save();
              ctx.beginPath();ctx.rect(glyph.x-1,glyph.y,glyph.width+2,glyph.height);ctx.clip();
              ctx.font=glyph.font;
              ctx.fillStyle=glyph.color;
              ctx.globalAlpha=Math.min(1,strength*1.6);
              const symbol=symbols[(glyph.index*3+Math.floor(elapsed/65))%symbols.length];
              const metrics=ctx.measureText(symbol);
              const descent=metrics.fontBoundingBoxDescent??glyph.size*.22;
              ctx.fillText(symbol,glyph.x+(glyph.width-metrics.width)/2,glyph.y+glyph.height-descent);
              ctx.restore();
            });
            // Only a narrow travelling band is replaced; the rest of the heading stays legible.
            heading.style.setProperty('--hero-ripple-mask',mask);
            heading.classList.add('hero-ripple-active');
          }
          frame=requestAnimationFrame(paint);
        }catch{stop();}
      };
      cleanupTimer=setTimeout(stop,duration+80);
      frame=requestAnimationFrame(paint);
    }catch{stop();}
  };

  const observer=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.25;
    if(!visible)stop();
    else play();
  },{threshold:[0,.25]});
  observer.observe(heading);
  const markReady=()=>{
    clearTimeout(readyTimer);
    if(ready)return;
    ready=true;play();
  };
  // Bound font waiting; essential text is already present while this optional effect waits.
  readyTimer=setTimeout(markReady,700);
  if(document.fonts?.ready)document.fonts.ready.then(markReady).catch(markReady);
  else markReady();
  reduced.addEventListener('change',()=>{stop();if(!reduced.matches)play();});
  forced.addEventListener('change',()=>{stop();if(!forced.matches)play();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else play();});
  addEventListener('resize',stop,{passive:true});
  addEventListener('pagehide',()=>{entered=true;clearTimeout(readyTimer);observer.disconnect();stop();});
})();
