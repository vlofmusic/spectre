/* Manual gallery, native size radios and honest message-based ordering. */
(() => {
  const photos = [
    ['tests15418','Front','Front view of the black Spectre Hoodie on a model'],
    ['tests15497','Back angle','Model turned to show the back and hood'],
    ['tests15453','Back embroidery','Raised black embroidery across the back of the hoodie'],
    ['tests15471','Front emblem','Light front emblem and drawstrings in close-up'],
    ['tests15601','Full fit','Full-length view of the oversized hoodie on a model'],
    ['tests15475','Construction','Kangaroo pocket, ribbed cuff and hem in close-up']
  ];
  // Hydrate shared state: the first API response may arrive before this script loads.
  let available = window.SpectreBagState || null;
  let stockStatus = window.SpectreStockStatus || { status: available ? 'ready' : 'loading', refreshing: false };
  let stockTimeout;
  const $ = selector => document.querySelector(selector);
  const mainImage = $('.ap-main-image');
  const dialog = $('.ap-lightbox');
  const zoomImage = $('[data-zoom-image]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let closingViewer = false;
  const zoomViewport = $('[data-zoom-viewport]');
  const zoomToggle = $('[data-zoom-toggle]');
  const setMagnified = active => {
    zoomViewport.toggleAttribute('data-magnified', active);
    zoomToggle.setAttribute('aria-pressed', String(active));
    zoomToggle.textContent = active ? 'Zoom out −' : 'Zoom in +';
    zoomViewport.scrollTo({
      top:active ? (zoomViewport.scrollHeight-zoomViewport.clientHeight)/2 : 0,
      left:active ? (zoomViewport.scrollWidth-zoomViewport.clientWidth)/2 : 0,
      behavior:'instant'
    });
  };
  zoomToggle.addEventListener('click', () => setMagnified(!zoomViewport.hasAttribute('data-magnified')));
  const thumbs = [...document.querySelectorAll('[data-photo]')];
  let index = 0, selectedSize = '', lastFocus = null, startTouch = null, suppressClickUntil = 0;
  const imagePath = (name,width) => `assets/apparel/${name}-${width}.webp`;
  const selectPhoto = next => {
    setMagnified(false);
    index = (next + photos.length) % photos.length;
    const [name,label,alt] = photos[index];
    mainImage.srcset = `${imagePath(name,960)} 960w, ${imagePath(name,1600)} 1600w`;
    mainImage.src = imagePath(name,960); mainImage.alt = alt;
    zoomImage.src = imagePath(name,1600); zoomImage.alt = alt;
    if(!reducedMotion.matches) {
      mainImage.animate([{opacity:.65,filter:'blur(4px)'},{opacity:1,filter:'blur(0px)'}],{duration:360,easing:'ease-out'});
      if(dialog.open)zoomImage.animate([{opacity:.5,filter:'blur(4px)'},{opacity:1,filter:'blur(0px)'}],{duration:360,easing:'ease-out'});
    }
    $('[data-gallery-status]').textContent = `${String(index+1).padStart(2,'0')} / 06 — ${label}`;
    $('[data-zoom-status]').textContent = `${index+1} / 6 — ${label}`;
    thumbs.forEach((thumb,i) => thumb.setAttribute('aria-pressed',String(i===index)));
  };
  thumbs.forEach((thumb,i) => thumb.addEventListener('click',() => selectPhoto(i)));
  $('[data-gallery-prev]').addEventListener('click',() => selectPhoto(index-1));
  $('[data-gallery-next]').addEventListener('click',() => selectPhoto(index+1));
  $('[data-zoom-prev]').addEventListener('click',() => selectPhoto(index-1));
  $('[data-zoom-next]').addEventListener('click',() => selectPhoto(index+1));
  $('[data-zoom]').addEventListener('click',() => {
    if (Date.now()<suppressClickUntil) return;
    if (typeof dialog.showModal !== 'function') { window.open(imagePath(photos[index][0],1600),'_blank','noopener'); return; }
    lastFocus = document.activeElement;
    setMagnified(false);
    const origin = photoButton.getBoundingClientRect();
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    if(!reducedMotion.matches && dialog.animate){
      const destination=dialog.getBoundingClientRect();
      const dx=(origin.left+origin.width/2)-(destination.left+destination.width/2);
      const dy=(origin.top+origin.height/2)-(destination.top+destination.height/2);
      dialog.getAnimations().forEach(animation=>animation.cancel());
      dialog.animate([
        {opacity:0,filter:'blur(8px)',transform:`translate(${dx*.35}px,${dy*.35}px) scale(.82,.9)`},
        {opacity:1,filter:'blur(0px)',transform:'translate(0,0) scale(1.008,1.005)',offset:.8},
        {opacity:1,filter:'blur(0px)',transform:'translate(0,0) scale(1)'}
      ],{duration:480,easing:'cubic-bezier(.2,.75,.2,1)'});
    }
    $('[data-close-zoom]').focus();
  });
  const closeViewer = () => {
    if(closingViewer || !dialog.open)return;
    if(reducedMotion.matches || !dialog.animate){dialog.close();return;}
    closingViewer=true;
    dialog.getAnimations().forEach(animation=>animation.cancel());
    const animation=dialog.animate([{opacity:1,filter:'blur(0px)',transform:'scale(1)'},{opacity:0,filter:'blur(6px)',transform:'scale(.94)'}],{duration:230,easing:'ease-in',fill:'forwards'});
    animation.finished.catch(()=>{}).then(()=>{dialog.close();animation.cancel();closingViewer=false;});
  };
  $('[data-close-zoom]').addEventListener('click',closeViewer);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeViewer();});
  dialog.addEventListener('close',() => { document.documentElement.style.removeProperty('overflow'); lastFocus?.focus({preventScroll:true}); });
  dialog.addEventListener('click',event => { if(event.target===dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeViewer(); } });
  dialog.addEventListener('keydown',event => {
    if (event.target===zoomViewport && zoomViewport.hasAttribute('data-magnified')) return;
    if (event.key==='ArrowRight') { event.preventDefault(); selectPhoto(index+1); }
    if (event.key==='ArrowLeft') { event.preventDefault(); selectPhoto(index-1); }
  });
  const photoButton = $('[data-zoom]');
  photoButton.addEventListener('pointerdown',event => { if(event.pointerType==='touch')startTouch={x:event.clientX,y:event.clientY}; },{passive:true});
  photoButton.addEventListener('pointerup',event => {
    if(!startTouch)return;
    const dx=event.clientX-startTouch.x,dy=event.clientY-startTouch.y;startTouch=null;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4) { selectPhoto(index+(dx<0?1:-1));suppressClickUntil=Date.now()+400; }
  },{passive:true});
  photoButton.addEventListener('pointercancel',() => { startTouch=null; });
  const order = $('[data-order]');
  const stickyAction = $('[data-sticky-action]');
  const stockLabels = [...document.querySelectorAll('[data-size-stock]')];
  const retryStock = $('[data-stock-retry]');
  const hasStock = () => available && stockLabels.every(node => Number.isInteger(available.available?.[node.dataset.sizeStock]) && available.available[node.dataset.sizeStock] >= 0);
  const paintAvailability = () => {
    const ready = stockStatus.status === 'ready' && hasStock();
    const loading = stockStatus.status === 'loading';
    $('[data-stock-status]').dataset.stockStatus = ready ? 'ready' : loading ? 'loading' : 'error';
    stockLabels.forEach(node => {
      const count = ready ? available.available[node.dataset.sizeStock] : null;
      node.textContent = ready ? `${count} available` : loading ? 'Checking…' : 'Not checked';
      node.closest('label').toggleAttribute('data-stock-empty', ready && count === 0);
    });
    retryStock.hidden = ready || loading;
    if (!ready) {
      $('[data-availability]').textContent = loading ? 'Checking current stock…' : 'Stock could not be checked. Try again or enquire by email.';
      return;
    }
    if (!selectedSize) {
      const total = stockLabels.reduce((sum, node) => sum + available.available[node.dataset.sizeStock], 0);
      $('[data-availability]').textContent = total ? 'Available to reserve now. Choose your size.' : 'All pieces are currently reserved or unavailable. Check again shortly, or enquire by email.';
      return;
    }
    const count = available.available[selectedSize];
    const held = available.items?.[selectedSize] || 0;
    $('[data-availability]').textContent = `${selectedSize} — ${count} ${count === 1 ? 'piece' : 'pieces'} available${held ? ` · ${held} reserved in your bag` : ''}.`;
  };
  const updateSize = () => {
    selectedSize = $('input[name="size"]:checked')?.value || '';
    paintAvailability();
    $('[data-order-label]').textContent = selectedSize ? `Request size ${selectedSize} by email` : 'Request your size';
    $('[data-add-label]').textContent = selectedSize ? `Add size ${selectedSize} to bag` : 'Add to bag';
    if(selectedSize){
      const subject=`Spectre Hoodie — size ${selectedSize}`;
      const body=`Hello, I would like to enquire about the Spectre Hoodie in Black, size ${selectedSize}, CHF 50.\n\nPlease confirm availability, the delivery cost, dispatch date and return terms.\n\nMy delivery location: `;
      order.href=`mailto:hello@spectre-studio.co?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      $('[data-measurements]').href=`mailto:hello@spectre-studio.co?subject=${encodeURIComponent('Spectre Hoodie — measurements for '+selectedSize)}`;
    } else {
      order.href='mailto:hello@spectre-studio.co?subject=Spectre%20Hoodie%20enquiry';
      $('[data-measurements]').href='mailto:hello@spectre-studio.co?subject=Spectre%20Hoodie%20measurements';
    }
    $('[data-sticky-summary]').textContent=`CHF 50 · ${selectedSize ? 'Size '+selectedSize : 'Select a size'}`;
    stickyAction.textContent=selectedSize ? `Add ${selectedSize} to bag +` : 'Choose your size ↑';
    stickyAction.href='#top';
  };
  document.querySelectorAll('input[name="size"]').forEach(input => input.addEventListener('change',()=>{$('[data-size-error]').textContent='';updateSize();}));
  const watchStockLoading = () => {
    clearTimeout(stockTimeout);
    if (stockStatus.status !== 'loading') return;
    // Also provide a recovery path if the reservation script fails to initialise.
    stockTimeout = setTimeout(() => {
      if (stockStatus.status !== 'loading') return;
      stockStatus = { status: 'error', refreshing: false };
      updateSize();
    }, 12000);
  };
  window.addEventListener('spectre:stock', event => {
    available = event.detail || null;
    stockStatus = window.SpectreStockStatus || { status: available ? 'ready' : 'error', refreshing: false };
    watchStockLoading();
    updateSize();
  });
  retryStock.addEventListener('click', () => {
    stockStatus = { status: 'loading', refreshing: true };
    updateSize();
    watchStockLoading();
    window.dispatchEvent(new CustomEvent('spectre:stock-retry'));
  });
  window.addEventListener('pageshow',updateSize);
  updateSize();watchStockLoading();
  order.addEventListener('click',event => {
    if(selectedSize)return;
    event.preventDefault();
    $('[data-size-error]').textContent='Choose your size first.';
    $('input[name="size"]').focus();
  });
  // Expand linked terms. Size-guide navigation never resets the size selection.
  const revealLinkedDetail = () => { const id=location.hash.slice(1); if(id==='delivery'||id==='contact'){document.getElementById(id).open=true;} };
  window.addEventListener('hashchange',revealLinkedDetail);revealLinkedDetail();
  const sticky=$('[data-sticky]');
  if('IntersectionObserver' in window){
    let pastAction=false,footerVisible=false;
    const paintSticky=() => { sticky.hidden=!pastAction||footerVisible; };
    new IntersectionObserver(([entry]) => { pastAction=!entry.isIntersecting&&entry.boundingClientRect.bottom<0;paintSticky(); }).observe($('[data-order-area]'));
    new IntersectionObserver(([entry]) => { footerVisible=entry.isIntersecting;paintSticky(); }).observe($('#footer'));
  }
  document.querySelectorAll('[data-year]').forEach(node=>{node.textContent=new Date().getFullYear();});
})();
