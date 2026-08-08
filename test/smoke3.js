const fs=require('fs');const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse:stubAll});
const w=dom.window;w.addEventListener('error',e=>errors.push(e.message));
const stub=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):(()=>{})});
w.HTMLCanvasElement.prototype.getContext=()=>stub;w.requestAnimationFrame=()=>0;
w.navigator.geolocation={watchPosition:ok=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:8}});return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
const D=()=>w.document;const dev=t=>[...D().querySelectorAll('#dev button')].find(b=>b.textContent===t).click();
const out=[];
setTimeout(()=>{
  D().querySelector('#b-begin').click();D().querySelector('#nameInput').value='LACHY';
  D().querySelector('#b-name-next').click();D().querySelector('#b-char-next').click();
  D().querySelector('#b-safety-ok').click();D().querySelector('#b-solo').click();
  dev('start match');setTimeout(function(){D().querySelector('#b-role-ok').click();},1600);
  setTimeout(()=>{
    dev('skip scatter');dev('to tribunal 1');
    setTimeout(()=>{

      const rows=[...D().querySelectorAll('#voteList .voterow')];
      out.push('screen at tribunal: '+D().querySelector('.screen.active').id);
      out.push('vote rows: '+rows.length+' -> '+rows.map(r=>r.querySelector('b').textContent).join(','));
      if(rows.length>1){rows[1].click();D().querySelector('#b-vote-lock').click();
        out.push('locked vote, button: '+D().querySelector('#b-vote-lock').textContent);}
      dev('sim wrong vote');
      setTimeout(()=>{
        out.push('alert after wrong vote: '+D().querySelector('#alertTitle').textContent);
        out.push('screen after: '+D().querySelector('.screen.active').id);
        out.push('task: '+D().querySelector('#taskTitle').textContent+' / '+D().querySelector('#taskBody').textContent.slice(0,60));
        console.log('\nFALSE SAFE — tribunal + full signal');console.log('─'.repeat(38));
        out.forEach(o=>console.log('  · '+o));
        console.log(errors.length?('  ERRORS '+errors.join(';')):'  no runtime errors');
        process.exit(errors.length?1:0);
      },900);
    },3400);
  },2200);
},300);
setTimeout(()=>{console.log('timeout');process.exit(1);},20000);
