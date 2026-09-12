/* Native disclosures keep the content; Scope documents and FAQ resolve from symbols line by line. */
(() => {
  const folder=document.querySelector('[data-scope-folder]');
  const questions=[...document.querySelectorAll('.studio-questions details')];
  const processSteps=[...document.querySelectorAll('details.delivery-step')];
  const perspectives=[...document.querySelectorAll('.starting-questions details')];
  const smoothEntries=[...questions,...processSteps,...perspectives,...(folder?[folder]:[])];
  if(!folder&&!smoothEntries.length)return;
  const documents=folder?.querySelector('.scope-documents');
  const entries=[...(folder?.querySelectorAll('.scope-document')||[])];
  const visualStage=folder?.querySelector('[data-scope-visual-stage]');
  const visualCards=[...(visualStage?.querySelectorAll('[data-scope-visual]')||[])];
  const scopeOwners=new Set([folder,...entries].filter(Boolean));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const symbols='·─+~:*|/\\';
  const jobs=new Map();
  const effects=new Set();
  const accordions=new Map();
  let frame=0;
  let visualAnimation=null;
  let currentVisual=null;
  const motionAllowed=()=>!document.hidden&&!reduced.matches&&!forced.matches;
  const allowed=owner=>motionAllowed()&&owner.open&&(!scopeOwners.has(owner)||folder.open);
  const onScreen=target=>{
    const bounds=target.getBoundingClientRect();
    return bounds.width>0&&bounds.height>0&&bounds.bottom>0&&bounds.top<innerHeight;
  };
  const stopVisualTransition=()=>{
    visualAnimation?.cancel();
    visualAnimation=null;
  };
  const selectVisual=(entry,animate=true)=>{
    const card=visualCards.find(item=>item.dataset.scopeVisual===entry.dataset.scopePreview);
    if(!card||card===currentVisual)return;
    stopVisualTransition();
    visualCards.forEach(item=>{item.hidden=item!==card;});
    entries.forEach(item=>item.classList.toggle('is-preview-current',item===entry));
    currentVisual=card;
    if(!animate||!folder.open||!motionAllowed()||!onScreen(visualStage)||!card.animate)return;
    try{
      const animation=card.animate([
        {opacity:.35,transform:'translateY(8px)',filter:'blur(2px)'},
        {opacity:1,transform:'translateY(0)',filter:'blur(0)'}
      ],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)'});
      visualAnimation=animation;
      const finish=()=>{if(visualAnimation===animation)visualAnimation=null;};
      animation.finished.then(finish,finish);
    }catch{stopVisualTransition();}
  };
  const removeEffect=effect=>{
    effect.canvas.remove();
    effect.target.classList.remove('scope-ripple-source');
    effects.delete(effect);
  };
  const stopJob=owner=>{
    const job=jobs.get(owner);
    if(!job)return;
    clearTimeout(job.timeout);
    job.observer?.disconnect();
    job.effects.forEach(removeEffect);
    job.animations.forEach(animation=>animation.cancel());
    jobs.delete(owner);
    if(!effects.size){cancelAnimationFrame(frame);frame=0;}
  };
  const cancelReveal=targets=>targets.forEach(target=>target?.getAnimations?.().forEach(animation=>animation.cancel()));
  const stopAccordion=entry=>{
    const state=accordions.get(entry);
    if(!state)return;
    accordions.delete(entry);
    clearTimeout(state.timeout);
    state.observer?.disconnect();
    state.animation.cancel();
    entry.classList.remove('is-question-expanding');
  };
  const stopScope=()=>{
    stopVisualTransition();
    scopeOwners.forEach(stopJob);
    documents?.getAnimations?.().forEach(animation=>animation.cancel());
    cancelReveal(entries.map(entry=>entry.querySelector('.scope-document-preview')));
  };
  const questionParagraphs=entry=>[...entry.children].filter(child=>child.tagName==='P');
  const stopAll=()=>{
    [...jobs.keys()].forEach(stopJob);
    [...accordions.keys()].forEach(stopAccordion);
    cancelAnimationFrame(frame);frame=0;
    stopScope();
    questions.forEach(entry=>cancelReveal(questionParagraphs(entry)));
  };

  const toggleDisclosure=(entry,opening=!entry.open)=>{
    try{
      // Close the previous process step before native name-group exclusivity can
      // remove its height. Both blocks then interpolate in the same layout flow.
      if(opening&&processSteps.includes(entry))processSteps.forEach(other=>{
        if(other!==entry&&other.open){
          if(other.animate&&onScreen(other))toggleDisclosure(other,false);
          else other.open=false;
        }
      });
      // Capture the live height before cancelling an interrupted expansion.
      const from=entry.getBoundingClientRect().height;
      stopAccordion(entry);
      stopJob(entry);
      cancelReveal(questionParagraphs(entry));
      entry.open=opening;
      entry.classList.add('is-question-expanding');
      const to=entry.getBoundingClientRect().height;
      if(Math.abs(from-to)<1){entry.classList.remove('is-question-expanding');return;}
      const animation=entry.animate([{height:`${from}px`},{height:`${to}px`}],{
        duration:340,easing:'cubic-bezier(.2,.7,.2,1)'
      });
      const state={animation,open:opening,timeout:0,observer:null};
      accordions.set(entry,state);
      const finish=()=>{if(accordions.get(entry)===state)stopAccordion(entry);};
      animation.finished.then(finish,finish);
      state.timeout=setTimeout(finish,460);
      if(window.IntersectionObserver){
        state.observer=new IntersectionObserver(records=>{
          if(!records[0].isIntersecting)finish();
        });
        state.observer.observe(entry);
      }
    }catch{
      stopAccordion(entry);
      entry.classList.remove('is-question-expanding');
      entry.open=opening;
    }
  };

  const paperBehind=target=>{
    for(let node=target;node;node=node.parentElement){
      const style=getComputedStyle(node);
      // A solid mask must match the real surface; gradients/translucent layers
      // get the readable native fallback rather than a guessed paper colour.
      if(style.backgroundImage!=='none')return null;
      const color=style.backgroundColor;
      if(color==='transparent')continue;
      const components=color.slice(color.indexOf('(')+1,-1);
      const alphaValue=components.includes('/')?components.split('/').pop().trim():
        color.startsWith('rgba(')?components.split(',').pop().trim():'1';
      const alpha=parseFloat(alphaValue)/(alphaValue.endsWith('%')?100:1);
      if(alpha>=.999)return color;
      if(alpha>0)return null;
    }
    return null;
  };

  const makeRipple=(target,owner,delay,duration)=>{
    const bounds=target.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    if(!context)return null;
    const ratio=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.ceil(bounds.width*ratio);
    canvas.height=Math.ceil(bounds.height*ratio);
    canvas.className='scope-ripple-canvas';
    canvas.setAttribute('aria-hidden','true');
    canvas.style.animationDuration=`${delay+duration+100}ms`;
    context.scale(ratio,ratio);
    const letters=[];
    const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);
    const range=document.createRange();
    // Public previews are short. Sampling also bounds work if an excerpt grows later.
    const total=Math.min(target.textContent.length,1500);
    const stride=Math.max(1,Math.ceil(total/100));
    let node,index=0;
    while(index<total&&(node=walker.nextNode())){
      const style=getComputedStyle(node.parentElement);
      let offset=0;
      for(const letter of node.textContent){
        const from=offset;offset+=letter.length;
        const position=index++;
        if(position>=total)break;
        if(/\s/.test(letter)||position%stride)continue;
        range.setStart(node,from);range.setEnd(node,offset);
        const rect=range.getBoundingClientRect();
        if(rect.width&&rect.height)letters.push({
          index:position,x:rect.left-bounds.left,y:rect.top-bounds.top,width:rect.width,height:rect.height,
          font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          size:parseFloat(style.fontSize),color:style.color
        });
      }
    }
    if(!letters.length)return null;
    target.classList.add('scope-ripple-source');
    target.append(canvas);
    return {
      target,owner,canvas,context,letters,width:bounds.width,height:bounds.height,total,
      paper:paperBehind(target)||getComputedStyle(documents).backgroundColor,
      start:performance.now()+delay,duration,lastPaint:-Infinity
    };
  };

  const paintWriting=(effect,elapsed)=>{
    const {context}=effect;
    context.clearRect(0,0,effect.width,effect.height);
    effect.lines.forEach(line=>{
      const local=elapsed-line.start;
      if(local>=line.duration)return;
      const progress=Math.max(0,local/line.duration);
      const unresolved=line.letters.filter((letter,index)=>
        local<0||progress<.2+.72*(index+1)/line.letters.length
      );
      // Future lines wait on the paper. Only the current line shows moving symbols.
      // Clearing a resolved glyph exposes the original HTML, including its emphasis.
      context.fillStyle=effect.paper;
      unresolved.forEach(letter=>context.fillRect(letter.x-.5,letter.y-.5,letter.width+1,letter.height+1));
      if(local<0)return;
      const tick=Math.floor(local/70);
      unresolved.forEach(letter=>{
        context.save();
        context.beginPath();context.rect(letter.x-.5,letter.y-.5,letter.width+1,letter.height+1);context.clip();
        context.font=letter.font;context.fillStyle=letter.color;
        context.globalAlpha=.64+.24*Math.sin(Math.PI*progress);
        const symbol=symbols[(letter.seed*13+tick*17+((letter.seed+tick)%7)*11)%symbols.length];
        const metrics=context.measureText(symbol);
        const descent=metrics.fontBoundingBoxDescent??letter.size*.22;
        const ripple=Math.sin(progress*Math.PI*2-letter.seed*.36)*.65;
        context.fillText(symbol,letter.x+(letter.width-metrics.width)/2,letter.y+letter.height-descent+ripple);
        context.restore();
      });
    });
  };

  const paint=now=>{
    frame=0;
    if(!motionAllowed()){stopAll();return;}
    for(const effect of [...effects]){
      try{
        if(!allowed(effect.owner)||!onScreen(effect.target)){
          removeEffect(effect);continue;
        }
        const elapsed=now-effect.start;
        if(elapsed<0)continue;
        if(elapsed>=effect.duration){removeEffect(effect);continue;}
        if(now-effect.lastPaint<1000/24)continue;
        effect.lastPaint=now;
        if(effect.mode==='writing'){paintWriting(effect,elapsed);continue;}
        const {context,letters,total}=effect;
        context.clearRect(0,0,effect.width,effect.height);
        const front=-3+(elapsed/effect.duration)*(total+6);
        const spread=Math.max(2.6,total/28);
        const wave=letters.filter(letter=>Math.abs(letter.index-front)<spread);
        context.fillStyle=effect.paper;
        wave.forEach(letter=>context.fillRect(letter.x-.5,letter.y,letter.width+1,letter.height));
        wave.forEach(letter=>{
          context.save();
          context.beginPath();context.rect(letter.x-.5,letter.y,letter.width+1,letter.height);context.clip();
          context.font=letter.font;context.fillStyle=letter.color;
          context.globalAlpha=.72+.24*(1-Math.abs(letter.index-front)/spread);
          const symbol=symbols[(letter.index*3+Math.floor(elapsed/60))%symbols.length];
          const metrics=context.measureText(symbol);
          const descent=metrics.fontBoundingBoxDescent??letter.size*.22;
          context.fillText(symbol,letter.x+(letter.width-metrics.width)/2,letter.y+letter.height-descent);
          context.restore();
        });
      }catch{removeEffect(effect);}
    }
    if(effects.size)frame=requestAnimationFrame(paint);
  };

  const reveal=(owner,targets,{duration,step,motion})=>{
    stopJob(owner);
    if(!documents||!allowed(owner))return;
    const job={effects:[],animations:[],timeout:0};
    jobs.set(owner,job);
    let end=0;
    try{
      targets.forEach((target,index)=>{
        if(!onScreen(target))return;
        const delay=index*step;
        const moving=motion(target);
        const effect=makeRipple(target,owner,delay,duration);
        if(effect){effects.add(effect);job.effects.push(effect);}
        if(moving?.animate){
          const animation=moving.animate([
            {opacity:.72,transform:'translateY(7px)',filter:'blur(.6px)'},
            {opacity:1,transform:'translateY(0)',filter:'blur(0)'}
          ],{duration:360,delay,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});
          job.animations.push(animation);
        }
        end=Math.max(end,delay+duration);
      });
      // Timeout and CSS both restore the original ink independently of RAF progress.
      job.timeout=setTimeout(()=>stopJob(owner),end+80);
      if(effects.size&&!frame)frame=requestAnimationFrame(paint);
    }catch{stopJob(owner);}
  };

  // Measure every glyph of these short excerpts so unresolved ink can be covered
  // precisely. Longer or unusually wrapped content keeps its plain HTML fallback.
  const measureWriting=target=>{
    const bounds=target.getBoundingClientRect();
    if(!bounds.width||!bounds.height||target.textContent.length>600)return null;
    const lines=[];
    const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);
    const range=document.createRange();
    let node,seed=0;
    while((node=walker.nextNode())){
      const style=getComputedStyle(node.parentElement);
      let offset=0;
      for(const letter of node.textContent){
        const from=offset;offset+=letter.length;
        if(/\s/.test(letter))continue;
        range.setStart(node,from);range.setEnd(node,offset);
        const rect=range.getBoundingClientRect();
        if(!rect.width||!rect.height)continue;
        let line=lines.find(row=>Math.abs(row.top-(rect.top-bounds.top))<3);
        if(!line){line={top:rect.top-bounds.top,letters:[]};lines.push(line);}
        line.letters.push({
          x:rect.left-bounds.left,y:rect.top-bounds.top,width:rect.width,height:rect.height,seed:seed++,
          font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          size:parseFloat(style.fontSize),color:style.color
        });
      }
    }
    if(!lines.length)return null;
    lines.sort((a,b)=>a.top-b.top);
    lines.forEach(line=>line.letters.sort((a,b)=>a.x-b.x));
    return {target,width:bounds.width,height:bounds.height,lines};
  };

  const makeWriting=(measurement,owner,start)=>{
    const paper=paperBehind(measurement.target);
    if(!paper)return null;
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    if(!context)return null;
    const ratio=Math.min(devicePixelRatio||1,1.5);
    const {target,width,height,lines}=measurement;
    const last=lines[lines.length-1];
    const duration=last.start+last.duration;
    canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
    canvas.className='scope-ripple-canvas';canvas.setAttribute('aria-hidden','true');
    canvas.style.animationDuration=`${duration+220}ms`;
    // The shared release keyframes are an independent fail-open deadline. Do not
    // crossfade waiting lines into view before their scheduled symbol resolve.
    canvas.style.animationTimingFunction='steps(1, end)';
    context.scale(ratio,ratio);
    const effect={
      ...measurement,owner,canvas,context,mode:'writing',start,duration,lastPaint:-Infinity,paper
    };
    paintWriting(effect,-1);
    target.classList.add('scope-ripple-source');target.append(canvas);
    return effect;
  };

  const startWriting=(entry,preview,paragraphs)=>{
    stopJob(entry);
    // FAQ height belongs to its own lifecycle; only replace the generic content
    // reveal, leaving expansion and the measured ASCII lines to run together.
    cancelReveal([...(preview===entry?[]:[preview]),...paragraphs]);
    if(!preview||!allowed(entry)||!onScreen(preview))return;
    const job={effects:[],animations:[],timeout:0,observer:null};
    jobs.set(entry,job);
    try{
      const measurements=paragraphs.slice(0,3).map(measureWriting);
      const count=measurements.reduce((total,item)=>total+(item?.lines.length||0),0);
      if(measurements.some(item=>!item)||!count||count>12){stopJob(entry);return;}
      // Four to six lines take about 2.6–3.8 seconds. Narrow layouts get a modest
      // speed adjustment rather than hiding their last paragraph for a long queue.
      const lineDuration=Math.min(590,Math.max(280,3500/count-50));
      const start=performance.now()+80;
      let offset=0;
      measurements.forEach(measurement=>{
        measurement.lines.forEach(line=>{
          line.start=offset;line.duration=lineDuration;
          offset+=lineDuration+60;
        });
        const effect=makeWriting(measurement,entry,start);
        if(!effect)throw new Error('Disclosure symbol surface is unavailable');
        effects.add(effect);job.effects.push(effect);
        offset+=60;
      });
      job.timeout=setTimeout(()=>stopJob(entry),offset+180);
      if(effects.size&&!frame)frame=requestAnimationFrame(paint);
      if(window.IntersectionObserver){
        job.observer=new IntersectionObserver(records=>{
          if(!records[0].isIntersecting)stopJob(entry);
        });
        job.observer.observe(preview);
      }
    }catch{stopJob(entry);}
  };

  const writeDocument=entry=>{
    const preview=entry.querySelector('.scope-document-preview');
    startWriting(entry,preview,[...(preview?.querySelectorAll('p')||[])]);
  };

  folder?.addEventListener('toggle',()=>{
    stopScope();
    if(!folder.open)return;
    // Replace the global details panel animation with a small, sequential row entrance.
    documents?.getAnimations?.().forEach(animation=>animation.cancel());
    reveal(folder,entries.map(entry=>entry.querySelector('.scope-document-name')).filter(Boolean),{
      duration:480,step:90,motion:target=>target.closest('summary')
    });
    entries.filter(entry=>entry.open).forEach(writeDocument);
  });
  entries.forEach(entry=>{
    entry.addEventListener('pointerenter',event=>{
      if(event.pointerType!=='touch')selectVisual(entry);
    });
    entry.addEventListener('focusin',()=>selectVisual(entry));
    entry.addEventListener('toggle',()=>{
      if(entry.open)selectVisual(entry);
      writeDocument(entry);
    });
  });
  // The first labelled placeholder is also present without JavaScript. Hover,
  // keyboard focus and native tap-to-open all select the same preview thereafter.
  if(entries.length)selectVisual(entries.find(entry=>entry.open)||entries[0],false);
  const activatedQuestions=new WeakSet();
  smoothEntries.forEach(entry=>{
    // Pointer, touch and keyboard all use native summary activation. Existing
    // open items keep their initial state without an automatic height animation.
    entry.querySelector('summary')?.addEventListener('click',event=>{
      if(questions.includes(entry))activatedQuestions.add(entry);
      if(event.defaultPrevented||!motionAllowed()||!entry.animate||!onScreen(entry))return;
      event.preventDefault();
      toggleDisclosure(entry);
    });
  });
  questions.forEach(entry=>{
    entry.addEventListener('toggle',()=>{
      stopJob(entry);
      const paragraphs=questionParagraphs(entry);
      cancelReveal(paragraphs);
      if(entry.open&&activatedQuestions.has(entry))startWriting(entry,entry,paragraphs);
    });
  });
  // Attribute observation cancels a closing/reopening interaction before a queued toggle event.
  if(window.MutationObserver){
    const changes=new MutationObserver(records=>records.forEach(({target})=>{
      if(target===folder)stopScope();else stopJob(target);
      // An unrelated programmatic toggle also releases an in-flight height.
      const accordion=accordions.get(target);
      if(accordion&&accordion.open!==target.open)stopAccordion(target);
    }));
    new Set([...scopeOwners,...smoothEntries]).forEach(entry=>changes.observe(entry,{attributes:true,attributeFilter:['open']}));
  }
  if(window.IntersectionObserver&&folder)new IntersectionObserver(records=>{
    if(!records[0].isIntersecting)stopScope();
  }).observe(documents||folder);
  [reduced,forced].forEach(query=>query.addEventListener('change',stopAll));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  addEventListener('resize',stopAll,{passive:true});
  addEventListener('pagehide',stopAll);
  addEventListener('pageshow',stopAll);

  folder?.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const openDocument=event.target.closest('.scope-document[open]');
    if(openDocument){
      event.preventDefault();
      openDocument.open=false;
      openDocument.querySelector('summary')?.focus({preventScroll:true});
      return;
    }
    if(folder.open){
      event.preventDefault();
      folder.open=false;
      folder.querySelector('summary')?.focus({preventScroll:true});
    }
  });
})();
