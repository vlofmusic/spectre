/* Optional process illustration; all steps and outputs stay visible. */
(() => {
  const image = document.querySelector('[data-stage-image]');
  if(!image)return;
  const sources=['knowledge-form','detail-form','prototype-form','detail-form'];
  const captions=['Find the structure inside the idea.','Make the knowledge usable.','Bring the core interaction together.','Review the detail before going further.'];
  const buttons=[...document.querySelectorAll('[data-stage]')];
  buttons.forEach((button,index)=>button.addEventListener('click',()=>{
    image.srcset=`assets/${sources[index]}-800.webp 800w, assets/${sources[index]}-1400.webp 1400w`;
    image.src=`assets/${sources[index]}-800.webp`;
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)image.animate([{opacity:.55,filter:'blur(5px)'},{opacity:1,filter:'blur(0px)'}],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)'});
    document.querySelector('[data-stage-caption]').textContent=captions[index];
    buttons.forEach((item,i)=>item.setAttribute('aria-pressed',String(i===index)));
  }));
})();
