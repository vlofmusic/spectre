/* Scroll-driven material study, adapted from the supplied centre-out dissolve reference. */
(() => {
  'use strict';
  const study=document.querySelector('[data-scroll-dissolve]');
  const stage=study?.querySelector('.ab-dissolve-stage');
  const front=study?.querySelector('[data-dissolve-front]');
  const back=study?.querySelector('[data-dissolve-back]');
  if(!stage||!front||!back||!window.IntersectionObserver)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const desktop=matchMedia('(min-width:901px) and (pointer:fine)');
  let canvas=null, renderer=null, loading=false, visible=false, stopped=false;
  let frame=0, timer=0, epoch=0, lastPaint=-Infinity, lastProgress=-1;
  let loadedImages=null;
  const clamp=value=>Math.max(0,Math.min(1,value));
  const allowed=()=>desktop.matches&&!reduced.matches&&!forced.matches&&!stopped;
  const cancel=()=>{cancelAnimationFrame(frame);clearTimeout(timer);frame=timer=0;};
  const fallback=()=>{cancel();study.classList.remove('is-dissolve-ready');study.dataset.dissolveState='static';};

  const vertex=`
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}
  `;
  const fragment=`
    precision mediump float;
    uniform sampler2D uFront;
    uniform sampler2D uBack;
    uniform float uProgress;
    uniform vec2 uPixel;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
    }
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    float edge(vec2 uv){
      float a=lum(texture2D(uFront,uv+uPixel*vec2(-1.,-1.)).rgb);
      float b=lum(texture2D(uFront,uv+uPixel*vec2(0.,-1.)).rgb);
      float c=lum(texture2D(uFront,uv+uPixel*vec2(1.,-1.)).rgb);
      float d=lum(texture2D(uFront,uv+uPixel*vec2(-1.,0.)).rgb);
      float e=lum(texture2D(uFront,uv+uPixel*vec2(1.,0.)).rgb);
      float f=lum(texture2D(uFront,uv+uPixel*vec2(-1.,1.)).rgb);
      float g=lum(texture2D(uFront,uv+uPixel*vec2(0.,1.)).rgb);
      float h=lum(texture2D(uFront,uv+uPixel*vec2(1.,1.)).rgb);
      return clamp(length(vec2(-a+c-2.*d+2.*e-f+h,-a-2.*b-c+f+2.*g+h)),0.,1.);
    }
    void main(){
      vec3 first=texture2D(uFront,vUv).rgb;
      vec3 second=texture2D(uBack,vUv).rgb;
      if(uProgress<.001){gl_FragColor=vec4(first,1.);return;}
      if(uProgress>.999){gl_FragColor=vec4(second,1.);return;}
      vec2 point=(vUv-.5)*vec2(uAspect,1.);
      float radius=length(point)/length(vec2(uAspect*.5,.5));
      // Noise is spatial, not time-based: pausing the scroll produces a perfectly still frame.
      float organic=noise(vUv*9.)*.09+noise(vUv*27.)*.035;
      float boundary=uProgress*1.29-.1;
      float distance=radius+organic-boundary;
      float revealed=1.-smoothstep(-.035,.035,distance);
      vec3 colour=mix(first,second,revealed);
      float rim=1.-smoothstep(0.,.045,abs(distance));
      if(rim>.01)colour+=vec3(.7,.66,.8)*edge(vUv)*rim*.14;
      gl_FragColor=vec4(colour,1.);
    }
  `;

  const buildRenderer=gl=>{
    const shaders=[],textures=[];
    let program=null,buffer=null;
    const dispose=()=>{
      textures.forEach(texture=>gl.deleteTexture(texture));
      shaders.forEach(shader=>gl.deleteShader(shader));
      if(buffer)gl.deleteBuffer(buffer);
      if(program)gl.deleteProgram(program);
    };
    try{
      const compile=(type,source)=>{
        const shader=gl.createShader(type);shaders.push(shader);
        gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Shader unavailable');
        return shader;
      };
      program=gl.createProgram();
      gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Program unavailable');
      gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'aPosition');
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      loadedImages.forEach((image,index)=>{
        const texture=gl.createTexture();textures.push(texture);
        gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
        gl.uniform1i(gl.getUniformLocation(program,index?'uBack':'uFront'),index);
      });
      const progress=gl.getUniformLocation(program,'uProgress');
      const pixel=gl.getUniformLocation(program,'uPixel');
      const aspect=gl.getUniformLocation(program,'uAspect');
      return {
        dispose,
        draw(value){
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform1f(progress,value);gl.uniform2f(pixel,1/canvas.width,1/canvas.height);
          gl.uniform1f(aspect,canvas.width/canvas.height);
          gl.drawArrays(gl.TRIANGLES,0,6);
        }
      };
    }catch(error){dispose();throw error;}
  };

  const sizeCanvas=()=>{
    if(!canvas)return;
    const box=stage.getBoundingClientRect();
    const ratio=Math.min(devicePixelRatio||1,1.25,800/Math.max(box.width,1));
    canvas.width=Math.max(1,Math.round(box.width*ratio));
    canvas.height=Math.max(1,Math.round(box.height*ratio));
    lastProgress=-1;
  };
  const paint=now=>{
    frame=0;
    if(!allowed()||!visible||document.hidden||!renderer)return;
    const elapsed=now-lastPaint;
    if(elapsed<1000/30){timer=setTimeout(schedule,1000/30-elapsed);return;}
    const box=stage.getBoundingClientRect();
    if(box.bottom<=0||box.top>=innerHeight)return;
    const progress=clamp((innerHeight*.86-box.top)/(innerHeight*.7));
    if(Math.abs(progress-lastProgress)<.0001)return;
    try{
      renderer.draw(progress);lastProgress=progress;lastPaint=now;
      study.classList.add('is-dissolve-ready');
      study.dataset.dissolveState='ready';
    }catch{fallback();}
  };
  function schedule(){
    clearTimeout(timer);timer=0;
    if(frame||!allowed()||!visible||document.hidden||!renderer)return;
    frame=requestAnimationFrame(paint);
  }
  const loadImage=source=>new Promise((resolve,reject)=>{
    const image=new Image();
    const timeout=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error('Image unavailable'));},8000);
    image.onload=()=>{clearTimeout(timeout);resolve(image);};
    image.onerror=()=>{clearTimeout(timeout);reject(new Error('Image unavailable'));};
    image.src=source;
  });
  const initialise=async()=>{
    if(!allowed()||!visible||document.hidden||renderer||loading)return;
    loading=true;const current=++epoch;
    try{
      if(!loadedImages)loadedImages=await Promise.all([
        loadImage(front.currentSrc||front.src),loadImage(back.dataset.dissolveSource||back.currentSrc||back.src)
      ]);
      if(current!==epoch||!allowed())return;
      if(!canvas){
        canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
        canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;lastProgress=-1;fallback();});
        canvas.addEventListener('webglcontextrestored',()=>{renderer=null;initialise();});
        stage.append(canvas);
      }
      const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
      if(!gl)throw new Error('WebGL unavailable');
      sizeCanvas();renderer=buildRenderer(gl);schedule();
    }catch{fallback();}
    finally{loading=false;}
  };
  const reset=()=>{
    ++epoch;loading=false;fallback();
    renderer?.dispose();renderer=null;canvas?.remove();canvas=null;
    lastProgress=-1;
    if(allowed()&&visible)initialise();
  };
  const observer=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(!visible){cancel();return;}
    if(renderer)schedule();else initialise();
  });
  observer.observe(stage);
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',()=>{
    cancel();study.classList.remove('is-dissolve-ready');
    if(!allowed()){reset();return;}
    sizeCanvas();if(renderer)schedule();else initialise();
  },{passive:true});
  [reduced,forced,desktop].forEach(query=>query.addEventListener('change',reset));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)cancel();else if(renderer){lastProgress=-1;schedule();}else initialise();
  });
  addEventListener('pagehide',()=>{stopped=true;reset();});
  addEventListener('pageshow',()=>{stopped=false;if(visible)initialise();});
})();
