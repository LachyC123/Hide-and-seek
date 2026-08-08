/* Fast-forwards a full solo match with bots and no dev shortcuts except time. */
const fs=require('fs');const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/#dev',beforeParse:stubAll});
const w=dom.window;
w.addEventListener('error',e=>errors.push(e.message));
const stub=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):(()=>{})});
w.HTMLCanvasElement.prototype.getContext=()=>stub;
w.requestAnimationFrame=()=>0;
w.navigator.geolocation={watchPosition:ok=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:8}});return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},
  createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),
  createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
const D=()=>w.document;
const click=s=>D().querySelector(s).click();
const dev=t=>[...D().querySelectorAll('#dev button')].find(b=>b.textContent===t).click();
const phases=[];const alerts=[];
setTimeout(()=>{
  click('#b-begin');D().querySelector('#nameInput').value='LACHY';
  click('#b-name-next');click('#b-char-next');click('#b-safety-ok');click('#b-solo');
  dev('start match');
  let n=0;
  const iv=setInterval(()=>{
    const dbg=D().querySelector('#devlog');
    D().querySelector('#dev').classList.add('show');
    const t=D().querySelector('#alertTitle').textContent;
    if(t&&alerts[alerts.length-1]!==t)alerts.push(t);
    const p=(dbg&&dbg.textContent||'').split('  ')[0];
    if(p&&phases[phases.length-1]!==p)phases.push(p);
    dev(n%4===0?'+2 min':'+2 min');
    if(++n>34||D().querySelector('.screen.active').id==='s-results'){
      clearInterval(iv);
      setTimeout(()=>{
        console.log('\nFALSE SAFE — full match fast-forward');
        console.log('─'.repeat(38));
        console.log('  phases: '+phases.join(' > ').replace(/phase /g,''));
        console.log('  alerts seen: '+[...new Set(alerts)].filter(Boolean).join(' | '));
        console.log('  final screen: '+D().querySelector('.screen.active').id);
        console.log('  result: '+D().querySelector('#resTitle').textContent);
        console.log('  final state: '+(D().querySelector('#devlog').textContent||'').split('\n').join(' / '));
        console.log(errors.length?('  ERRORS: '+errors.join('; ')):'  no runtime errors');
        process.exit(errors.length?1:0);
      },600);
    }
  },260);
},300);
process.on('uncaughtException',e=>{console.log('uncaught',e.message);process.exit(1);});
setTimeout(()=>{console.log('timeout');process.exit(1);},30000);
