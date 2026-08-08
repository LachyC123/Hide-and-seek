/* Boots the real single-file build in jsdom and drives a whole match. */
const fs=require('fs');
const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/#dev',beforeParse:stubAll});
const w=dom.window;
w.addEventListener('error',e=>errors.push('window error: '+e.message));
const origErr=console.error;
// canvas 2d stub
const stubCtx=new Proxy({},{get:(t,k)=>{
  if(k==='measureText')return()=>({width:20});
  if(k==='canvas')return{width:100,height:100};
  if(k==='setTransform'||k==='fillRect')return()=>{};
  if(typeof k==='string')return()=>{};
  return ()=>{};
}});
w.HTMLCanvasElement.prototype.getContext=function(){return stubCtx;};
w.requestAnimationFrame=()=>0;
w.navigator.geolocation={watchPosition:(ok)=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:8}});return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},
  createOscillator:()=>({type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),
  createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};

let step=0,log=[],seenPhases=new Set();
function tick(n){for(let i=0;i<n;i++){/* jsdom timers run on their own */}}

setTimeout(()=>{
  const D=w.document;
  const click=id=>{const el=D.querySelector(id);if(!el)throw new Error('missing '+id);el.click();};
  try{
    click('#b-begin');
    D.querySelector('#nameInput').value='LACHY';
    click('#b-name-next');
    click('#b-char-next');
    click('#b-safety-ok');
    log.push('profile flow ok, screen='+D.querySelector('.screen.active').id);
    click('#b-solo');
    log.push('solo lobby, screen='+D.querySelector('.screen.active').id);
    // reach into the closure via a dev button: start match
    const devBtns=[...D.querySelectorAll('#dev button')];
    const byLabel=t=>devBtns.find(b=>b.textContent===t);
    byLabel('start match').click();
    log.push('match started');
    setTimeout(()=>{
      try{
        byLabel('skip scatter').click();
        setTimeout(()=>{
          const seq=['reveal next zone','close zone now','new mission','complete mission','+1 tip',
                     'catch a hider','convert now','sim wrong vote','full signal OFF','to final tribunal',
                     'sim correct vote','catch a hider','to endgame'];
          let i=0;
          const run=()=>{
            if(i<seq.length){
              try{byLabel(seq[i]).click();log.push('dev: '+seq[i]);}catch(e){errors.push(seq[i]+' -> '+e.message);}
              i++;setTimeout(run,320);
            } else {
              // The fallback catch has to work when GPS will not: a seeker names who they
              // tagged and that player is out, no distance check involved.
              try{
                byLabel('make me seeker').click();
                const before=(/uncaught (\d+)/.exec(D.querySelector('#devlog').textContent)||[0,0])[1];
                setTimeout(()=>{
                  const mb=D.querySelector('#manualbtn');
                  if(mb.classList.contains('hidden')) errors.push('a seeker was offered no manual catch');
                  mb.click();
                  const opts=[...D.querySelectorAll('.modal button')];
                  log.push('manual catch offered '+(opts.length-1)+' names');
                  if(opts.length<2) errors.push('manual catch listed nobody');
                  else opts[0].click();
                  setTimeout(()=>{
                    const after=(/uncaught (\d+)/.exec(D.querySelector('#devlog').textContent)||[0,0])[1];
                    log.push('manual catch: uncaught '+before+' -> '+after);
                    if(!(+after<+before)) errors.push('manual catch did not take anyone out');
                    finishUp();
                  },500);
                },400);
              }catch(e){ errors.push('manual catch: '+e.message); finishUp(); }
              function finishUp(){
              setTimeout(()=>{
                byLabel('imposter win').click();
                setTimeout(()=>{
                  log.push('final screen='+D.querySelector('.screen.active').id);
                  log.push('results title='+D.querySelector('#resTitle').textContent);
                  finish();
                },400);
              },400);
              }
            }
          };
          run();
        },400);
      }catch(e){errors.push('phase2: '+e.message);finish();}
    },400);
  }catch(e){errors.push('flow: '+e.message);finish();}
},300);

function finish(){
  console.log('\nFALSE SAFE — jsdom smoke test');
  console.log('─'.repeat(38));
  log.forEach(l=>console.log('  · '+l));
  if(errors.length){console.log('\n  ERRORS:');errors.forEach(e=>console.log('   ! '+e));}
  else console.log('\n  no runtime errors');
  process.exit(errors.length?1:0);
}
process.on('uncaughtException',e=>{errors.push('uncaught: '+e.message);finish();});
setTimeout(()=>{errors.push('timeout');finish();},20000);
