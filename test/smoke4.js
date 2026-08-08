const fs=require('fs');const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse:stubAll});
const w=dom.window;w.addEventListener('error',e=>errors.push(e.message));
const stub=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):(()=>{})});
w.HTMLCanvasElement.prototype.getContext=()=>stub;w.requestAnimationFrame=()=>0;
w.Image=class{set src(v){setTimeout(()=>this.onerror&&this.onerror(),1);}};
w.navigator.geolocation={watchPosition:ok=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:9}});
  setTimeout(()=>ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:11}}),200);return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
const D=()=>w.document;const q=s=>D().querySelector(s);
const dev=t=>[...D().querySelectorAll('#dev button')].find(b=>b.textContent===t).click();
const out=[];
setTimeout(()=>{
  q('#b-begin').click();q('#nameInput').value='LACHY';q('#b-name-next').click();
  q('#b-char-next').click();q('#b-safety-ok').click();
  q('#b-create').click();
  const rows=[...D().querySelectorAll('#setupBody .setrow')];
  out.push('setting rows built: '+rows.length);
  out.push('sections: '+[...D().querySelectorAll('#setupBody .setsec')].map(e=>e.textContent).join(', '));
  // pick the Quick preset, then hand-tune catch distance + turn votes off
  [...q('#segPreset').children].find(b=>b.getAttribute('data-v')==='quick').click();
  const label=t=>rows.find(r=>r.querySelector('b').textContent===t);
  out.push('after Quick preset, match length shows: '+label('Match length').querySelector('i').textContent);
  const cd=label('Catch distance').querySelector('input');
  cd.value=22; cd.dispatchEvent(new w.Event('input'));
  out.push('catch distance now: '+label('Catch distance').querySelector('i').textContent);
  [...label('Votes per match').querySelectorAll('button')].find(b=>b.textContent==='1').click();
  [...label('Map style').querySelectorAll('button')].find(b=>b.textContent==='Pixel world').click();
  q('#b-create-go').click();
  out.push('lobby rules: '+q('#lobbyRules').textContent);
  dev('+ bot');dev('+ bot');dev('+ bot');dev('start match');
  setTimeout(()=>{
    q('#b-role-ok') && q('#b-role-ok').click();
    dev('skip scatter');dev('to tribunal 1');
    let n=0;const iv=setInterval(()=>{
      const id=q('.screen.active').id;
      if(id==='s-vote'||++n>24){
        clearInterval(iv);
        out.push('vote screen reached: '+(id==='s-vote'));
        if(id==='s-vote'){
          const vr=[...D().querySelectorAll('#voteList .voterow')];
          out.push('candidates: '+vr.length);
          vr[vr.length-1].click();q('#b-vote-lock').click();
          out.push('lock button: '+q('#b-vote-lock').textContent);
        } else out.push('role was: '+q('#hRole').textContent);
        out.push('gps chip: '+q('#hGps').textContent);
        console.log('\nFALSE SAFE — settings + accuracy');console.log('─'.repeat(38));
        out.forEach(o=>console.log('  · '+o));
        console.log(errors.length?('  ERRORS '+errors.join(';')):'  no runtime errors');
        process.exit(errors.length?1:0);
      }
    },300);
  },1800);
},300);
setTimeout(()=>{console.log('timeout');process.exit(1);},25000);
