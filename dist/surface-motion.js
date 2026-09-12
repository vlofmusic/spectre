/* Finite editorial image transitions and soft About/Apparel entrances. */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const symbols='·─+~:*|/\\';
  const jobs=new Map(), entrances=new Map();
  let frame=0;
  const allowed=()=>!document.hidden&&!reduced.matches&&!forced.matches;
  const visible=element=>{
    const r=element.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;
  };
  const stop=host=>{
    const job=jobs.get(host);
    if(!job)return;
    clearTimeout(job.timeout); job.canvas.remove(); jobs.delete(host);
    if(!jobs.size){cancelAnimationFrame(frame);frame=0;}
  };
  const stopAll=()=>{
    [...jobs.keys()].forEach(stop);
    entrances.forEach(animation=>animation.cancel());entrances.clear();
  };
  const draw=(job,t)=>{
    const {ctx,w,h,cell,cells}=job;
    ctx.clearRect(0,0,w,h);
    cells.forEach(c=>{
      const p=(t-c.delay)/job.life;
      if(p>=1)return;
      ctx.globalAlpha=1-Math.max(0,p);
      ctx.fillStyle=c.color;ctx.fillRect(c.x,c.y,cell+.4,cell+.4);
      ctx.fillStyle=c.ink;ctx.globalAlpha*=.68;
      ctx.fillText(symbols[(c.seed+Math.floor(t/85))%symbols.length],c.x+cell/2,c.y+cell/2);
    });
    ctx.globalAlpha=1;
  };
  const paint=now=>{
    frame=0;
    if(!allowed()){stopAll();return;}
    jobs.forEach((job,host)=>{
      const t=now-job.start;
      if(t>job.duration){stop(host);return;}
      if(now-job.last<33)return;
      job.last=now;
      try{draw(job,t);}catch{stop(host);}
    });
    if(jobs.size)frame=requestAnimationFrame(paint);
  };
  const wave=(host,{image,previous=null})=>{
    stop(host);
    if(!image||!allowed()||!visible(host))return;
    try{
      const rect=host.getBoundingClientRect(),r=image.getBoundingClientRect();
      const w=Math.round(r.width),h=Math.round(r.height);
      if(!w||!h)return;
      const cell=Math.max(17,Math.ceil(Math.sqrt(w*h/2600)));
      const cols=Math.ceil(w/cell),rows=Math.ceil(h/cell);
      const ratio=Math.min(devicePixelRatio||1,1.25,1200/w);
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      if(!ctx)return;
      canvas.className='surface-pixel-wave';canvas.setAttribute('aria-hidden','true');
      canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);
      canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;
      if(image){canvas.style.left=`${r.left-rect.left}px`;canvas.style.top=`${r.top-rect.top}px`;}
      ctx.scale(ratio,ratio);ctx.font='10px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
      let colors=null;
      if(image){
        const sample=document.createElement('canvas');sample.width=cols;sample.height=rows;
        const s=sample.getContext('2d'); if(!s)return;
        s.fillStyle='#b8babe';s.fillRect(0,0,cols,rows);
        if(previous?.naturalWidth){
          const scale=Math.max(cols/previous.naturalWidth,rows/previous.naturalHeight);
          const sw=previous.naturalWidth*scale,sh=previous.naturalHeight*scale;
          s.drawImage(previous,(cols-sw)/2,(rows-sh)*.44,sw,sh);
        }
        colors=s.getImageData(0,0,cols,rows).data;
      }
      const cells=[];
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const id=y*cols+x,i=id*4;
        // Independent delays resolve the image in a random order.
        const delay=Math.random()*550;
        const color=colors?`rgb(${colors[i]},${colors[i+1]},${colors[i+2]})`:null;
        const light=colors&&(colors[i]*.2126+colors[i+1]*.7152+colors[i+2]*.0722)>145;
        cells.push({x:x*cell,y:y*cell,delay,seed:Math.floor(Math.random()*symbols.length),color,ink:light?'#28232f':'#f5f0fa'});
      }
      const job={canvas,ctx,w,h,cell,cells,start:performance.now(),last:-Infinity,life:220,duration:800,timeout:0};
      // Draw the cover before exposing the new image to the next browser paint.
      draw(job,0);
      host.append(canvas);jobs.set(host,job);
      job.timeout=setTimeout(()=>stop(host),job.duration+100);
      if(!frame)frame=requestAnimationFrame(paint);
    }catch{stop(host);}
  };
  const visibility='IntersectionObserver' in window?new IntersectionObserver(records=>records.forEach(({target,isIntersecting})=>{
    if(!isIntersecting){stop(target);entrances.get(target)?.cancel();entrances.delete(target);}
  })):null;
  // A soft entrance for editorial content; never animate shopping or form controls.
  const targets=[...document.querySelectorAll('.page-about #about-title,.page-about .ab-quote,.page-about .ab-cards article,.page-about #visual-practice-title,.page-about .ab-apparel,.apparel-page #product-title,.apparel-page .ap-editorial-heading,.apparel-page #embroidery-title,.apparel-page #fit-title,.apparel-page #outfits-title,.apparel-page #story-title')];
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(records=>records.forEach(({target,isIntersecting})=>{
      if(!isIntersecting)return;
      observer.unobserve(target);
      if(!allowed()||!target.animate)return;
      const order=target.matches('.ab-cards article')?[...target.parentElement.children].indexOf(target):0;
      const animation=target.animate([
        {opacity:.32,transform:'translateY(14px)',filter:'blur(3px)'},
        {opacity:1,transform:'translateY(0)',filter:'blur(0)'}
      ],{duration:720,delay:order*85,fill:'backwards',easing:'cubic-bezier(.2,.7,.2,1)'});
      entrances.set(target,animation);visibility?.observe(target);
      const release=()=>{if(entrances.get(target)===animation)entrances.delete(target);visibility?.unobserve(target);};
      animation.finished.then(release,release);
    }),{threshold:.18});
    targets.forEach(target=>observer.observe(target));
  }
  // Narrow public API so the Apparel swap shares the same rendering lifecycle.
  window.SpectreSurface=Object.freeze({revealImage:(host,image,previous)=>wave(host,{image,previous}),stop});
  const editorial=document.querySelector('.ap-editorial-large');if(editorial)visibility?.observe(editorial);
  [reduced,forced].forEach(query=>query.addEventListener('change',stopAll));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  addEventListener('resize',stopAll,{passive:true});
  addEventListener('pagehide',stopAll);
  addEventListener('pageshow',event=>{if(event.persisted)stopAll();});
})();
