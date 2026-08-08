const fs=require('fs');const {JSDOM}=require('jsdom');const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse:stubAll});
const w=dom.window;w.addEventListener('error',e=>errors.push(e.message));
const stub=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):(()=>{})});
w.HTMLCanvasElement.prototype.getContext=()=>stub;w.requestAnimationFrame=()=>0;
w.Image=class{set src(v){setTimeout(()=>this.onerror&&this.onerror(),1);}};
// fake Overpass returning a small street grid
const els=[];
for(let i=-3;i<=3;i++){
  els.push({tags:{highway:i%2?'residential':'primary'},geometry:[{lat:-33.8688+i*0.0008,lon:151.2093-0.004},{lat:-33.8688+i*0.0008,lon:151.2093+0.004}]});
  els.push({tags:{highway:'footway'},geometry:[{lat:-33.8688-0.004,lon:151.2093+i*0.0008},{lat:-33.8688+0.004,lon:151.2093+i*0.0008}]});
}
els.push({tags:{leisure:'park'},geometry:[{lat:-33.869,lon:151.209},{lat:-33.869,lon:151.2095},{lat:-33.8685,lon:151.2095},{lat:-33.869,lon:151.209}]});
let fetched=0;
w.fetch=(url,opt)=>{fetched++;return Promise.resolve({ok:true,json:()=>Promise.resolve({elements:els})});};
w.navigator.geolocation={getCurrentPosition:ok=>ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:7}}),
  watchPosition:ok=>{ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:7}});return 1;}};
w.AudioContext=function(){return{currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
const q=s=>w.document.querySelector(s);const out=[];
setTimeout(()=>{
  q('#b-begin').click();q('#nameInput').value='LACHY';q('#b-name-next').click();
  q('#b-char-next').click();q('#b-safety-ok').click();
  q('#b-diag').click();
  setTimeout(()=>{
    const rows=[...w.document.querySelectorAll('#diagBody .diagrow')];
    out.push('diagnostic rows: '+rows.length);
    rows.forEach(r=>out.push('['+r.className.split(' ')[1]+'] '+r.querySelector('b').textContent+' — '+r.querySelector('span').textContent.slice(0,95)));
    out.push('overpass requests: '+fetched);
    q('[data-back="s-home"]').click();
    q('#b-create').click();
    setTimeout(()=>{
      // With no transport there is nowhere to put a room, so Create game must refuse
      // rather than hand out a five-character code nobody on earth can join.
      q('#b-create-go').click();
      if(q('.screen.active').id==='s-lobby') errors.push('created a room with no transport');
      const modalBtns=[...w.document.querySelectorAll('.modal button')].map(b=>b.textContent);
      out.push('no-transport offer: '+modalBtns.join(' / '));
      if(!modalBtns.some(t=>/Multiplayer setup/.test(t))) errors.push('no route to multiplayer setup');
      if(!modalBtns.some(t=>/solo/i.test(t))) errors.push('no offer of solo play');

      [...w.document.querySelectorAll('.modal button')]
        .find(b=>/Multiplayer setup/.test(b.textContent)).click();
      out.push('setup screen: '+q('.screen.active').id);
      const sql=q('#mpSql').textContent;
      if(sql.indexOf('create table if not exists fs_rooms')<0) errors.push('setup screen shows no SQL');
      out.push('SQL on screen: '+sql.split('\n').length+' lines');

      // The clipboard API is unavailable here, exactly as it is inside a frame or on
      // older iOS. The button must still say something rather than appear to do nothing.
      q('#b-copy-sql').click();
      const msg=q('#mpSqlMsg').textContent;
      if(!msg) errors.push('copy button gave no feedback when the clipboard was unavailable');
      out.push('copy fallback said: "'+msg+'"');

      q('#s-mp [data-back="s-home"]').click();
      q('#b-solo').click();
      setTimeout(()=>{
        out.push('solo lobby reached: '+(q('.screen.active').id==='s-lobby'));
        if(q('.screen.active').id!=='s-lobby') errors.push('solo play is unreachable');
        console.log('\nFALSE SAFE — real map & GPS');console.log('─'.repeat(38));
        out.forEach(o=>console.log('  · '+o));
        console.log(errors.length?('  ERRORS '+errors.join(';')):'  no runtime errors');
        process.exit(errors.length?1:0);
      },400);
    },500);
  },700);
},400);
setTimeout(()=>{console.log('timeout');process.exit(1);},20000);
