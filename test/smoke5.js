const fs=require('fs');const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse:stubAll});
const w=dom.window;w.addEventListener('error',e=>errors.push(e.message));
// a modern phone, so the preview has to be drawn at three device pixels per CSS pixel
Object.defineProperty(w,'devicePixelRatio',{value:3,configurable:true});
const calls=[];
const stub=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):((...a)=>{calls.push(k);})});
w.HTMLCanvasElement.prototype.getContext=()=>stub;w.requestAnimationFrame=()=>0;
w.Image=class{set src(v){setTimeout(()=>this.onerror&&this.onerror(),1);}};
w.navigator.geolocation={watchPosition:ok=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:9}});return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
const q=s=>w.document.querySelector(s);const out=[];
setTimeout(()=>{
  q('#b-begin').click();q('#nameInput').value='LACHY';q('#b-name-next').click();
  q('#b-char-next').click();q('#b-safety-ok').click();q('#b-create').click();
  setTimeout(()=>{
    const rows=()=>[...w.document.querySelectorAll('#setupBody .setrow')];
    const row=t=>rows().find(r=>r.querySelector('b').textContent===t);
    const cap=()=>q('#setupCaption b').textContent+' || '+q('#setupCaption span').textContent;
    const drag=(name,v)=>{const i=row(name).querySelector('input');i.value=v;i.dispatchEvent(new w.Event('input'));};
    drag('Play area',300); out.push(cap());
    drag('Catch distance',22); out.push(cap());
    drag('Head start',180); out.push(cap());
    drag('Zone moves',6); out.push(cap());
    [...row('Seeker signals').querySelectorAll('button')].find(b=>b.textContent==='Tight').click();
    out.push(cap());
    drag('Time to turn seeker',90); out.push(cap());
    out.push('focused row highlighted: '+(row('Time to turn seeker').className.indexOf('focus')>=0));
    out.push('canvas ops fired: '+calls.length);
    // The preview used to be capped at 2x and drawn through a half-size buffer, which is
    // what made it look soft on a phone. Backing store must match the screen's density.
    const pv=q('#setupMap');
    out.push('preview backing store: '+pv.width+'x'+pv.height+' for a 3x screen');
    if(pv.width!==960||pv.height!==570)
      errors.push('preview is not drawn at full device resolution ('+pv.width+'x'+pv.height+')');
    console.log('\nFALSE SAFE — rules preview');console.log('─'.repeat(38));
    out.forEach(o=>console.log('  · '+o));
    console.log(errors.length?('  ERRORS '+errors.join(';')):'  no runtime errors');
    process.exit(errors.length?1:0);
  },400);
},300);
setTimeout(()=>{console.log('timeout');process.exit(1);},15000);
