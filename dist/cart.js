/* Shared, server-authoritative reservations. No client stock simulation. */
(() => {
 const product=window.SpectreCatalog,sizes=Object.keys(product.stock),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let state=null,busy=false,refreshing=false,loaded=false,previousFocus=null,closing=false,offset=0,error='',healthy=false,expiryRequested=false,requestVersion=0;
 const money=value=>`${product.currency} ${value.toFixed(2)}`;
 const count=()=>Object.values(state?.items||{}).reduce((a,b)=>a+b,0);
 const dialog=document.createElement('dialog');dialog.className='sc-drawer';dialog.id='bag';dialog.setAttribute('aria-labelledby','bag-title');
 dialog.innerHTML='<div class="sc-head"><div><p>SPECTRE / YOUR SELECTION</p><h2 id="bag-title">Your bag<span data-bag-total-count></span></h2></div><button class="sc-close" type="button" data-bag-close aria-label="Close bag">×</button></div><div class="sc-reservation" data-reservation></div><p class="sc-service" data-service role="status"></p><div class="sc-body" data-bag-body></div><div class="sc-summary" data-bag-summary></div><p class="sc-announcement" data-bag-status role="status"></p>';
 document.body.append(dialog);
 const body=dialog.querySelector('[data-bag-body]'),summary=dialog.querySelector('[data-bag-summary]'),status=dialog.querySelector('[data-bag-status]'),reservation=dialog.querySelector('[data-reservation]');
 const paintAdd=()=>{
  const selected=document.querySelector('input[name="size"]:checked')?.value;
  const add=document.querySelector('[data-add-to-bag]');if(add){add.disabled=busy||!healthy||(selected&&state?.available[selected]===0);add.setAttribute('aria-busy',String(busy));}
 };
 const notifyStock=()=>{
  window.SpectreBagState=state&&healthy?state:null;
  window.SpectreStockStatus={status:healthy?'ready':!loaded||refreshing?'loading':'error',refreshing,message:error};
  window.dispatchEvent(new CustomEvent('spectre:stock',{detail:window.SpectreBagState}));
  paintAdd();
 };
 const tick=()=>{
  if(!state?.expiresAt||!count()){reservation.hidden=true;return;}
  reservation.hidden=false;
  const seconds=Math.max(0,Math.ceil((state.expiresAt-Date.now()-offset)/1000));
  reservation.textContent=seconds?`Reserved for you · ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:'Reservation expired · refreshing availability…';
  if(!seconds&&!expiryRequested&&!busy){expiryRequested=true;refresh();}
 };
 const render=()=>{
  const focused=document.activeElement;
  const restore=body.contains(focused)?{action:focused.dataset.bagAction,size:focused.dataset.size,explore:focused.hasAttribute('data-bag-explore')}:summary.contains(focused)?{checkout:focused.hasAttribute('data-checkout-open'),email:focused.tagName==='A'}:null;
  const total=count(),bag=state?.items||{};
  document.querySelectorAll('[data-bag-count]').forEach(node=>{node.textContent=total;node.hidden=!total;});
  document.querySelectorAll('[data-open-bag]').forEach(node=>node.setAttribute('aria-label',`Open bag, ${total} ${total===1?'item':'items'}`));
  dialog.querySelector('[data-bag-total-count]').textContent=total?` (${total})`:'';
  dialog.querySelector('[data-service]').textContent=error||(busy?'Updating your selection…':'');
  if(!total){body.innerHTML='<div class="sc-empty"><p>A space for your<br /><em>next favourite.</em></p><span>'+(!healthy?(loaded&&!refreshing?'Stock could not be checked. Please try again.':'Checking availability…'):'Your bag is empty.')+'</span><a href="#top" data-bag-explore>Explore the hoodie <span aria-hidden="true">↗</span></a></div>';summary.innerHTML='';}
  else{
   body.innerHTML=sizes.filter(size=>bag[size]).map(size=>`<article class="sc-item" aria-label="${product.name}, size ${size}"><img src="${product.image}" width="180" height="271" alt="Black Spectre Hoodie" /><div class="sc-item-details"><h3>${product.name}</h3><p>Black · Size ${size}</p><strong>${money(product.price)}</strong><div class="sc-item-actions"><div class="sc-quantity" aria-label="Quantity for size ${size}"><button type="button" data-bag-action="decrease" data-size="${size}" aria-label="Decrease size ${size} quantity" ${busy?'disabled':''}>−</button><span>${bag[size]}</span><button type="button" data-bag-action="increase" data-size="${size}" aria-label="Increase size ${size} quantity" ${busy||!healthy||!state.available[size]?'disabled':''}>+</button></div><button class="sc-remove" type="button" data-bag-action="remove" data-size="${size}" ${busy?'disabled':''}>Remove</button></div></div></article>`).join('');
   const lines=sizes.filter(size=>bag[size]).map(size=>`${product.name}, Black, size ${size} × ${bag[size]} — ${money(product.price*bag[size])}`);
   const message=`Hello, I would like to request:\n\n${lines.join('\n')}\n\nSubtotal: ${money(total*product.price)} (delivery additional).\n\nDrawstrings preferred (optional): \nDelivery location: \n\nPlease confirm availability, delivery cost, dispatch date and return terms. I understand the website reservation expires automatically and this email does not complete my order.`;
   summary.innerHTML=`<div class="sc-subtotal"><span>Subtotal</span><strong>${money(total*product.price)}</strong></div><p>Held for 30 minutes from your first addition. Changes and order requests do not extend the timer.</p><button type="button" class="sc-request" data-checkout-open ${busy||!healthy?'disabled':''}>Arrange your order <span aria-hidden="true">↗</span></button><a class="sc-email-alternative" href="mailto:${product.email}?subject=${encodeURIComponent('Spectre Hoodie — bag enquiry')}&body=${encodeURIComponent(message)}">Or enquire by email ↗</a><p>No payment is taken. Delivery is additional. Supplied without drawstrings; ask to add them if you prefer.</p>`;
  }
  tick();notifyStock();
  if(restore&&dialog.open){const next=restore.action?body.querySelector(`[data-bag-action="${restore.action}"][data-size="${restore.size}"]:not(:disabled)`):restore.explore?body.querySelector('[data-bag-explore]'):restore.checkout?summary.querySelector('[data-checkout-open]:not(:disabled)'):summary.querySelector('a');(next||dialog.querySelector('[data-bag-close]')).focus({preventScroll:true});}
 };
 const receive=data=>{if(!data||!Number.isFinite(data.now)||!Number.isFinite(data.expiresAt)||!data.items||!sizes.every(size=>Number.isInteger(data.available?.[size])&&data.available[size]>=0)||!Object.entries(data.items).every(([size,quantity])=>sizes.includes(size)&&Number.isInteger(quantity)&&quantity>0))throw new Error('Invalid stock response');healthy=true;state=data;offset=data.now-Date.now();expiryRequested=false;};
 const request=async(options={})=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch('/api/bag',{...options,cache:'no-store',signal:controller.signal});return {response,data:await response.json()};}finally{clearTimeout(timer);}
 };
 const refresh=async()=>{
  if(busy||refreshing)return;
  const version=++requestVersion;refreshing=true;notifyStock();
  try{const {response,data}=await request();if(!response.ok)throw new Error();if(version!==requestVersion)return;receive(data);error='';}
  catch{if(version!==requestVersion)return;healthy=false;error='Live reservations are unavailable. Please try again or enquire by email.';}
  finally{refreshing=false;loaded=true;}
  if(version!==requestVersion)return;
  render();
 };
 const update=async(size,quantity)=>{
  if(busy)return false;
  ++requestVersion;busy=true;error='';render();let ok=false;
  try{const {response,data}=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size,quantity})});
   if(response.ok||response.status===409)receive(data);
   if(!response.ok){if(response.status!==409)healthy=false;error=data.error||'Unable to update your reservation.';}else ok=true;
  }catch{healthy=false;error='We could not confirm the update. Reopen the bag to check, or enquire by email.';}
  busy=false;loaded=true;render();return ok;
 };
 const open=()=>{
  if(dialog.open)return;previousFocus=document.activeElement;dialog.showModal();document.documentElement.classList.add('sc-bag-open');
  if(!reduced.matches)dialog.animate([{opacity:0,filter:'blur(10px)',transform:'translate(55px,-12px) scale(.88,.94)',borderRadius:'80px 28px 28px 160px'},{opacity:1,filter:'blur(0px)',transform:'translate(0,0) scale(1.008,1)',borderRadius:'36px',offset:.78},{opacity:1,filter:'blur(0px)',transform:'none',borderRadius:'28px'}],{duration:540,easing:'cubic-bezier(.2,.75,.2,1)'});
  dialog.querySelector('[data-bag-close]').focus();refresh();
 };
 const close=async()=>{
  if(!dialog.open||closing)return;closing=true;
  if(!reduced.matches){dialog.getAnimations().forEach(a=>a.cancel());const animation=dialog.animate([{opacity:1,transform:'none',filter:'blur(0px)'},{opacity:0,transform:'translateX(45px) scale(.94,.97)',filter:'blur(7px)'}],{duration:240,easing:'ease-in',fill:'forwards'});await animation.finished.catch(()=>{});dialog.close();animation.cancel();}else dialog.close();
  closing=false;
 };
 document.querySelectorAll('[data-open-bag]').forEach(button=>button.addEventListener('click',open));
 dialog.querySelector('[data-bag-close]').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{document.documentElement.classList.remove('sc-bag-open');previousFocus?.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{
  if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  if(event.target.closest('[data-bag-explore]')){event.preventDefault();close().then(()=>{location.hash='top';document.getElementById('top').scrollIntoView({behavior:reduced.matches?'instant':'smooth'});});}
 });
 body.addEventListener('click',async event=>{
  const button=event.target.closest('[data-bag-action]');if(!button||busy)return;
  const {size,bagAction:action}=button.dataset;const quantity=state?.items[size]||0;
  await update(size,action==='remove'?0:quantity+(action==='increase'?1:-1));
  status.textContent=error||'Selection updated.';
  const next=body.querySelector(`[data-size="${size}"][data-bag-action="${action}"]:not(:disabled)`)||body.querySelector('[data-bag-action]')||dialog.querySelector('[data-bag-close]');next.focus({preventScroll:true});
 });
 const addSelected=async event=>{
  event.preventDefault();if(busy)return;
  const size=document.querySelector('input[name="size"]:checked')?.value,feedback=document.querySelector('[data-size-error]');
  if(!sizes.includes(size)){feedback.textContent='Choose your size first.';document.querySelector('input[name="size"]').focus();return;}
  if(!healthy){await refresh();if(!healthy){feedback.textContent=error;return;}}
  if(await update(size,(state.items[size]||0)+1)){feedback.textContent='';status.textContent=`Size ${size} reserved for you.`;open();}else feedback.textContent=error;
 };
 document.querySelector('[data-add-to-bag]')?.addEventListener('click',addSelected);
 document.querySelectorAll('input[name="size"]').forEach(input=>input.addEventListener('change',paintAdd));
 window.addEventListener('spectre:stock-retry',refresh);
 document.querySelector('[data-sticky-action]')?.addEventListener('click',event=>{if(document.querySelector('input[name="size"]:checked'))addSelected(event);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 window.addEventListener('pageshow',refresh);
 setInterval(()=>{if(!document.hidden)tick();},1000);
 setInterval(()=>{if(!document.hidden)refresh();},15000);
 render();refresh();
})();
