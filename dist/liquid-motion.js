/* Input-driven motion only; never a looping filter or a hidden-content dependency. */
(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 document.addEventListener('pointerdown',event=>{
  if(reduced.matches||event.button!==0)return;
  const control=event.target.closest('button:not(:disabled),a.button,a.ap-button,.end-contact,.ap-size');
  if(!control||control.matches('[data-zoom]'))return;
  control.animate([{scale:'1 1'},{scale:'.975 .95',offset:.35},{scale:'1.008 1.015',offset:.72},{scale:'1 1'}],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)'});
 });
 document.querySelectorAll('details').forEach(details=>details.addEventListener('toggle',()=>{
  if(!details.open||reduced.matches)return;
  [...details.children].filter(node=>node.tagName!=='SUMMARY').forEach(node=>node.animate([{opacity:.3,filter:'blur(3px)',transform:'translateY(-5px)'},{opacity:1,filter:'blur(0px)',transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)'}));
 }));
})();
