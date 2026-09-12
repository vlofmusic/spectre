/* One ASCII pass on entry/selection. The source text, em and br are never replaced. */
(() => {
  const section=document.querySelector('.product-expression');
  const content=section?.querySelector('.expression-content');
  if(!content||!window.IntersectionObserver||!window.MutationObserver)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const panels=[...content.querySelectorAll('.expression-panel')];
  const characters='·─+~:*|/\\';
  const duration=820;
  let entered=false, intersecting=false, frame=0, releaseTimer=0, decoration=null;
  let active=panels.find(panel=>!panel.hidden), animations=[];

  const stop=()=>{
    cancelAnimationFrame(frame);
    clearTimeout(releaseTimer);
    frame=0;
    releaseTimer=0;
    decoration?.remove();
    decoration=null;
    animations.forEach(animation=>animation.cancel());
    animations=[];
  };
  const onScreen=panel=>{
    const bounds=panel.getBoundingClientRect();
    return !panel.hidden&&bounds.bottom>0&&bounds.top<innerHeight;
  };

  const ripple=heading=>{
    const bounds=heading.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const canvas=document.createElement('canvas');
    canvas.className='expression-ripple-canvas';
    canvas.setAttribute('aria-hidden','true');
    const ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.ceil(bounds.width*ratio);
    canvas.height=Math.ceil(bounds.height*ratio);
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.scale(ratio,ratio);
    const letters=[];
    const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
    const range=document.createRange();
    let node, index=0;
    // Measure the existing typeset glyphs once: no width locking, no changed wrapping.
    while((node=walker.nextNode())){
      const style=getComputedStyle(node.parentElement);
      let offset=0;
      for(const letter of node.textContent){
        const start=offset;
        offset+=letter.length;
        if(/\s/.test(letter)){index++;continue;}
        range.setStart(node,start);
        range.setEnd(node,offset);
        const rect=range.getBoundingClientRect();
        if(rect.width&&rect.height)letters.push({
          index,x:rect.left-bounds.left,y:rect.top-bounds.top,
          width:rect.width,height:rect.height,color:style.color,
          font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          size:parseFloat(style.fontSize)
        });
        index++;
      }
    }
    if(!letters.length)return;
    const paper=getComputedStyle(section).backgroundColor;
    heading.classList.add('expression-ripple-heading');
    heading.append(canvas);
    decoration=canvas;
    const start=performance.now();
    let lastPaint=-Infinity;
    const paint=now=>{
      try{
        const elapsed=now-start;
        if(elapsed>=duration||document.hidden||reduced.matches||!onScreen(active)){
          stop();return;
        }
        if(now-lastPaint>=32){
          lastPaint=now;
          ctx.clearRect(0,0,bounds.width,bounds.height);
          const front=-3+(elapsed/duration)*(index+6);
          const wave=letters.filter(letter=>Math.abs(letter.index-front)<2.6);
          // Only the travelling band covers the ink; all other real letters remain visible.
          ctx.fillStyle=paper;
          wave.forEach(letter=>ctx.fillRect(letter.x-.75,letter.y,letter.width+1.5,letter.height));
          wave.forEach(letter=>{
            ctx.save();
            ctx.beginPath();
            ctx.rect(letter.x-.75,letter.y,letter.width+1.5,letter.height);
            ctx.clip();
            ctx.font=letter.font;
            ctx.fillStyle=letter.color;
            ctx.globalAlpha=.68+.26*(1-Math.abs(letter.index-front)/2.6);
            const glyph=characters[(letter.index*3+Math.floor(elapsed/55))%characters.length];
            const metrics=ctx.measureText(glyph);
            const descent=metrics.fontBoundingBoxDescent??letter.size*.22;
            const x=letter.x+(letter.width-metrics.width)/2;
            ctx.fillText(glyph,x,letter.y+letter.height-descent);
            ctx.restore();
          });
        }
        frame=requestAnimationFrame(paint);
      }catch{stop();}
    };
    // Bounded independently of RAF; the CSS fallback also fades any interrupted overlay.
    releaseTimer=setTimeout(stop,duration+60);
    frame=requestAnimationFrame(paint);
  };

  const reveal=panel=>{
    stop();
    if(!panel||reduced.matches||document.hidden||!onScreen(panel))return;
    // studio-story owns tabs/images; replace only its short text-panel entrance.
    panel.getAnimations?.().forEach(animation=>animation.cancel());
    try{
      const heading=panel.querySelector('h3');
      if(heading)ripple(heading);
      [...panel.children].forEach((node,index)=>{
        if(!node.animate)return;
        const animation=node.animate([
          {opacity:.65,transform:'translateY(9px)'},
          {opacity:1,transform:'translateY(0)'}
        ],{duration:480,delay:index*35,easing:'cubic-bezier(.2,.75,.2,1)'});
        animations.push(animation);
      });
    }catch{stop();}
  };

  const observer=new IntersectionObserver(entries=>{
    intersecting=entries[0].isIntersecting;
    if(!intersecting){stop();return;}
    // Wait until the heading, not just the first edge of the tab row, can be seen.
    if(!entered&&entries[0].intersectionRatio>=.35){entered=true;reveal(active);}
  },{threshold:[0,.35],rootMargin:'0px 0px -8% 0px'});
  observer.observe(content);

  const selection=new MutationObserver(()=>{
    const next=panels.find(panel=>!panel.hidden);
    if(next===active)return;
    active=next;
    stop();
    if(intersecting){entered=true;reveal(active);}
  });
  panels.forEach(panel=>selection.observe(panel,{attributes:true,attributeFilter:['hidden']}));
  reduced.addEventListener('change',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('resize',stop,{passive:true});
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',stop);
})();
