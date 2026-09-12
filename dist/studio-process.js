/* Native disclosures, latest-selection image loading, one finite random-tile reveal. */
(() => {
  const surface=document.querySelector('[data-stage-surface]');
  const caption=document.querySelector('[data-stage-caption]');
  const steps=[...document.querySelectorAll('.delivery-step[data-stage]')];
  if(!surface||!caption||!steps.length)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const sources=['knowledge-form','detail-form','prototype-form','perspective-form'];
  const captions=['Find the structure inside the idea.','Bring the product into working form.','Give the idea a visual language.','Bring the product into the world.'];
  let revision=0,frame=0,release=0,overlay=null,visible=true,initialRevealed=false,initialPending=false;
  const bodyAnimations=new Map();
  const canMove=()=>!reduced.matches&&!forced.matches&&!document.hidden&&visible;
  const stopPixels=()=>{
    cancelAnimationFrame(frame);clearTimeout(release);frame=0;release=0;
    overlay?.remove();overlay=null;
  };
  const stopBody=step=>{bodyAnimations.get(step)?.cancel();bodyAnimations.delete(step);};
  const stopMotion=()=>{stopPixels();steps.forEach(stopBody);};
  const cover=(ctx,img,width,height)=>{
    const scale=Math.max(width/img.naturalWidth,height/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
  };
  const revealPixels=previous=>{
    if(!canMove())return;
    const bounds=surface.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const width=Math.round(bounds.width),height=Math.round(bounds.height);
    const columns=Math.min(56,Math.max(16,Math.ceil(width/17)));
    const rows=Math.min(52,Math.max(12,Math.round(height/(width/columns))));
    const ratio=Math.min(devicePixelRatio||1,1.5,900/width);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    const coarse=document.createElement('canvas');coarse.width=columns;coarse.height=rows;
    const low=coarse.getContext('2d');
    if(!ctx||!low)return;
    low.fillStyle='#dcd5e3';low.fillRect(0,0,columns,rows);
    if(previous?.naturalWidth)cover(low,previous,columns,rows);
    low.fillStyle='#e9e5ef44';low.fillRect(0,0,columns,rows);
    const colors=low.getImageData(0,0,columns,rows).data;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    canvas.className='delivery-pixel-overlay';canvas.setAttribute('aria-hidden','true');
    ctx.scale(ratio,ratio);ctx.imageSmoothingEnabled=false;
    const tiles=Array.from({length:columns*rows},(_,i)=>i);
    for(let i=tiles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]];}
    const symbols='·─+~:*|/\\';
    const cells=tiles.map((id,rank)=>({
      x:id%columns,y:Math.floor(id/columns),seed:id,delay:rank/tiles.length*610,
      ink:colors[id*4]*.2126+colors[id*4+1]*.7152+colors[id*4+2]*.0722>145?'#28232f':'#f7f3fb'
    }));
    const cellW=width/columns,cellH=height/rows;
    ctx.font=`${Math.min(12,Math.max(8,cellW*.64))}px ui-monospace,monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const draw=elapsed=>{
      ctx.clearRect(0,0,width,height);
      const tick=Math.floor(elapsed/75);
      cells.forEach(cell=>{
        const progress=Math.max(0,Math.min(1,(elapsed-cell.delay)/170));
        if(progress===1)return;
        ctx.globalAlpha=1-progress;
        ctx.drawImage(coarse,cell.x,cell.y,1,1,cell.x*cellW,cell.y*cellH,cellW+.2,cellH+.2);
        ctx.globalAlpha=(1-progress)*.82;
        ctx.fillStyle=cell.ink;
        ctx.fillText(symbols[(cell.seed*13+tick*17+((cell.seed+tick)%7)*11)%symbols.length],(cell.x+.5)*cellW,(cell.y+.5)*cellH);
      });
      ctx.globalAlpha=1;
    };
    draw(0);surface.append(canvas);overlay=canvas;
    const start=performance.now();let last=-Infinity;
    const paint=now=>{
      frame=0;
      if(!canMove()||now-start>=800){stopPixels();return;}
      try{if(now-last>=32){draw(now-start);last=now;}}catch{stopPixels();return;}
      frame=requestAnimationFrame(paint);
    };
    release=setTimeout(stopPixels,900);
    frame=requestAnimationFrame(paint);
  };
  const swap=async (index,animate=true)=>{
    initialRevealed=true;
    const request=++revision;
    stopPixels();surface.setAttribute('aria-busy','true');
    const next=new Image();next.alt='';next.width=5504;next.height=3072;
    next.sizes='(max-width:720px) 100vw, 45vw';
    next.srcset=`assets/${sources[index]}-800.webp 800w, assets/${sources[index]}-1400.webp 1400w`;
    next.src=`assets/${sources[index]}-800.webp`;
    let timeout;
    try{
      await Promise.race([next.decode(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Image timeout')),6500);})]);
      if(request!==revision||!steps[index].open)return;
      const previous=surface.querySelector('img');
      next.setAttribute('data-stage-image','');
      surface.append(next);previous?.remove();
      surface.dataset.stage=String(index);caption.textContent=captions[index];
      if(animate)try{revealPixels(previous);}catch{stopPixels();}
    }catch{
      if(request===revision&&steps[index].open)caption.textContent='The illustration could not be loaded. You can still explore the step.';
    }finally{
      clearTimeout(timeout);
      if(request===revision)surface.removeAttribute('aria-busy');
    }
  };
  steps.forEach((step,index)=>{
    step.addEventListener('toggle',()=>{
      stopBody(step);
      const body=step.querySelector('.delivery-step-body');
      body?.getAnimations?.().forEach(animation=>animation.cancel());
      if(!step.open){
        if(!steps.some(item=>item.open)){revision++;stopPixels();surface.removeAttribute('aria-busy');}
        return;
      }
      steps.forEach(other=>{if(other!==step)other.open=false;});
      if(!reduced.matches&&!forced.matches&&!document.hidden&&body?.animate){
        const animation=body.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)'});
        bodyAnimations.set(step,animation);
        animation.onfinish=()=>{if(bodyAnimations.get(step)===animation)bodyAnimations.delete(step);};
      }
      swap(index);
    });
    step.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&step.open){event.preventDefault();step.open=false;step.querySelector('summary').focus({preventScroll:true});}
    });
  });
  const revealInitial=()=>{
    if(initialRevealed||initialPending||!canMove())return;
    const rect=surface.getBoundingClientRect();
    const shown=Math.min(rect.bottom,innerHeight)-Math.max(0,rect.top);
    if(!rect.height||shown/rect.height<.18)return;
    const initial=surface.querySelector('img');
    const request=revision;
    const reveal=()=>{
      initialPending=false;
      if(request!==revision||!canMove())return;
      initialRevealed=true;stopPixels();
      try{revealPixels(initial);}catch{stopPixels();}
    };
    if(initial?.complete&&initial.naturalWidth)reveal();
    else if(initial){
      initialPending=true;
      initial.decode().then(reveal).catch(()=>{initialPending=false;});
    }
  };
  [reduced,forced].forEach(query=>query.addEventListener('change',()=>{stopMotion();revealInitial();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMotion();else revealInitial();});
  addEventListener('resize',stopMotion,{passive:true});
  addEventListener('pagehide',()=>{revision++;stopMotion();surface.removeAttribute('aria-busy');});
  addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    const index=steps.findIndex(step=>step.open);
    if(index!==-1)swap(index,false);else revealInitial();
  });
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
    const entry=entries[0];visible=entry.isIntersecting;
    if(!visible){stopPixels();return;}
    if(entry.intersectionRatio>=.18)revealInitial();
  },{threshold:[0,.18]}).observe(surface);
})();
