/* Two browsers, one room. Boots the real built file twice against a fake Supabase
   held in this process, then plays a networked match: host creates, guest joins by
   code, roles are dealt, the guest's vote arrives on the host, and a phone that
   stops reporting is caught rather than stalling the match forever.

   This is the only test that exercises the actual multiplayer path end to end —
   the harness can only prove the pieces, not that they are wired together. */
const fs=require('fs');
const {JSDOM}=require('jsdom');
const stubAll=require('./_stub');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');

const PROJECT='https://test.supabase.co';
const KEY='k'.repeat(48);
const MP=encodeURIComponent(PROJECT)+'~'+encodeURIComponent(KEY);

/* ---- the fake backend: two tables, upsert + filtered select ---- */
const DB={rooms:new Map(),inputs:new Map()};
let calls=0,badAuth=0;
function res(status,body){
  return Promise.resolve({ok:status<400,status:status,
    json:()=>Promise.resolve(body),text:()=>Promise.resolve(JSON.stringify(body||''))});
}
function eqParam(qs,name){
  const m=new RegExp('(?:\\?|&)'+name+'=eq\\.([^&]*)').exec(qs);
  return m?decodeURIComponent(m[1]):null;
}
function backend(url,opts){
  calls++;
  opts=opts||{};
  const h=opts.headers||{};
  if(h.apikey!==KEY||h.Authorization!=='Bearer '+KEY){ badAuth++; return res(401,{message:'bad key'}); }
  const rest=url.slice((PROJECT+'/rest/v1/').length);
  const table=rest.split('?')[0], qs=rest.slice(table.length);
  const store=table==='fs_rooms'?DB.rooms:table==='fs_inputs'?DB.inputs:null;
  if(!store) return res(404,{message:'no such table '+table});
  if((opts.method||'GET')==='DELETE'){
    const code=eqParam(qs,'code');
    [...store.keys()].forEach(k=>{ if(store.get(k).code===code) store.delete(k); });
    return res(204,null);
  }
  if((opts.method||'GET')==='POST'){
    const rows=JSON.parse(opts.body);
    rows.forEach(r=>{
      const key=table==='fs_rooms'?r.code:r.code+'|'+r.player_id;
      store.set(key,JSON.parse(JSON.stringify(r)));
    });
    return res(201,null);
  }
  const code=eqParam(qs,'code');
  const out=[];
  store.forEach(r=>{ if(!code||r.code===code) out.push(JSON.parse(JSON.stringify(r))); });
  return res(200,out);
}

/* ---- a device's local storage, which survives a reload of its browser ---- */
function makeStore(){
  const m=new Map();
  return {
    set:(k,v)=>{m.set(k,v);return Promise.resolve();},
    get:k=>Promise.resolve(m.has(k)?{value:m.get(k)}:null),
    list:p=>Promise.resolve({keys:[...m.keys()].filter(k=>k.indexOf(p)===0)}),
    delete:k=>{m.delete(k);return Promise.resolve();}
  };
}

/* ---- one browser ---- */
const errors=[];
function makeWindow(tag,hash,store){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
    url:'https://example.com/'+hash,
    beforeParse(w){
      stubAll(w);
      const stubCtx=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20}))
        :k==='canvas'?{width:100,height:100}:(()=>{})});
      w.HTMLCanvasElement.prototype.getContext=function(){return stubCtx;};
      w.navigator.geolocation={watchPosition:ok=>{
        ok({coords:{latitude:-33.8688,longitude:151.2093,accuracy:8}});return 1;}};
      w.fetch=(url,opts)=>url.indexOf(PROJECT)===0?backend(url,opts)
        :Promise.reject(new Error('offline in tests: '+url));
      if(store) w.storage=store;
    }});
  const w=dom.window;
  w.addEventListener('error',e=>errors.push(tag+' window error: '+e.message));
  return {tag,w,dom,D:w.document,
    click(sel){const el=w.document.querySelector(sel);
      if(!el)throw new Error(tag+': missing '+sel);el.click();},
    dev(label){const b=[...w.document.querySelectorAll('#dev button')]
      .find(x=>x.textContent===label);
      if(!b)throw new Error(tag+': no dev button "'+label+'"');b.click();},
    text(sel){const el=w.document.querySelector(sel);return el?el.textContent:'';},
    screen(){const s=w.document.querySelector('.screen.active');return s?s.id:'none';}};
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(what,fn,ms){
  const until=Date.now()+(ms||8000);
  while(Date.now()<until){
    if(fn()) return true;
    await sleep(80);
  }
  throw new Error('timed out waiting for '+what);
}

const log=[];
function profile(P,name){
  P.click('#b-begin');
  P.D.querySelector('#nameInput').value=name;
  P.click('#b-name-next');
  P.click('#b-char-next');
  P.click('#b-safety-ok');
}
/* both sides push on the next loop tick when flushed — this just stops the test
   from sitting through full sync intervals it does not need to measure */
function pump(...ps){ ps.forEach(p=>{try{p.dev('force sync now');}catch(e){}}); }

(async function run(){
  const guestDisk=makeStore();                     // the guest's phone keeps its profile
  const HOST=makeWindow('host','#mp='+MP,makeStore());
  const GUEST=makeWindow('guest','#mp='+MP,guestDisk);
  await sleep(400);

  try{
    profile(HOST,'LACHY');
    HOST.click('#b-create');
    // Pin the match seed for this one call so role assignment is repeatable: with four
    // players (host, guest, two bots) this seed makes the guest a plain hider, which is
    // the seat that has to be able to vote. Real randomness resumes immediately after.
    const realRandom=HOST.w.Math.random;
    HOST.w.Math.random=()=>0.01;
    HOST.click('#b-create-go');
    HOST.w.Math.random=realRandom;
    await waitFor('the host to open a lobby',()=>HOST.screen()==='s-lobby');
    const code=HOST.text('#lobbyCode');
    if(!/^[A-Z0-9]{5}$/.test(code)) throw new Error('host handed out a junk code: '+code);
    log.push('host created room '+code+' via Supabase');

    await waitFor('the room to be published to the backend',()=>DB.rooms.has(code),8000);
    log.push('room row exists in the backend, state.phase='+DB.rooms.get(code).state.phase);

    const link=HOST.text('#lobbyLink');
    if(link.indexOf('#room='+code)<0||link.indexOf('mp=')<0)
      throw new Error('join link is missing the room or the connection: '+link);
    log.push('join link carries room + connection');

    profile(GUEST,'MAYA');
    GUEST.click('#b-join');
    GUEST.D.querySelector('#codeInput').value=code;
    GUEST.click('#b-join-go');
    await waitFor('the guest to reach the lobby',()=>GUEST.screen()==='s-lobby',10000);
    log.push('guest joined by code');

    await waitFor('the host to see two players',()=>{
      pump(HOST,GUEST);
      return HOST.text('#lobbyCount')==='2 players';
    },12000);
    log.push('host roster: '+HOST.text('#lobbyCount'));

    await waitFor('the guest to see the full roster',()=>{
      pump(HOST,GUEST);
      return GUEST.text('#lobbyCount')==='2 players';
    },12000);
    log.push('guest roster: '+GUEST.text('#lobbyCount'));
    if(GUEST.text('#lobbyRoster').indexOf('LACHY')<0)
      throw new Error('guest cannot see the host in the roster');

    // a third seat so there is an imposter and a real vote to hold
    HOST.dev('+ bot'); HOST.dev('+ bot');
    await waitFor('bots to propagate',()=>{
      pump(HOST,GUEST);
      return GUEST.text('#lobbyCount')==='4 players';
    },12000);
    log.push('bots reached the guest: '+GUEST.text('#lobbyCount'));

    HOST.click('#b-start');
    await waitFor('the guest to be dealt a role',()=>{
      pump(HOST,GUEST);
      return GUEST.screen()==='s-role'&&GUEST.text('#roleTitle').length>0;
    },12000);
    log.push('guest role reveal: "'+GUEST.text('#roleTitle')+'"');

    const revealed=/seeker/.test(GUEST.text('#roleTitle'))?'SEEKER'
      :/imposter/.test(GUEST.text('#roleTitle'))?'IMPOSTER':'HIDER';
    if(revealed!=='HIDER') throw new Error('seeded role assignment drifted: guest is '+revealed);

    GUEST.click('#b-role-ok');
    await waitFor('the guest HUD to come up',()=>GUEST.screen()==='s-match');
    // the HUD must agree with what the reveal promised, not with its own markup default
    await waitFor('the HUD to agree with the role reveal',
      ()=>GUEST.text('#hRole')===revealed,8000);
    log.push('guest HUD role: '+GUEST.text('#hRole')+' (matches the reveal)');
    await waitFor('the guest to report a live room connection',
      ()=>GUEST.text('#hNet')==='SYNCED',10000);
    log.push('guest room chip: '+GUEST.text('#hNet'));

    // ---- an action taken on the guest has to land on the host ----
    HOST.dev('skip scatter');
    HOST.dev('to tribunal 1');
    await waitFor('the guest to be shown the vote',()=>{
      pump(HOST,GUEST); return GUEST.screen()==='s-vote';
    },14000);
    const rows=[...GUEST.D.querySelectorAll('#voteList .voterow')];
    if(!rows.length) throw new Error('vote screen has no candidates');
    rows[0].click();
    GUEST.click('#b-vote-lock');
    log.push('guest locked a vote against '+rows[0].querySelector('b').textContent);
    await waitFor("the guest's vote to arrive on the host",()=>{
      pump(HOST,GUEST);
      const m=/tribunal \d+ votes (\d+)\//.exec(HOST.text('#devlog'));
      return m&&+m[1]>0;
    },14000);
    log.push('host tally: '+/tribunal.*/.exec(HOST.text('#devlog'))[0]);

    // ---- a phone that locks itself and reloads has to get back into the match ----
    GUEST.w.close();                                   // the guest's browser goes away
    const RETURN=makeWindow('guest-again','#room='+code+'&mp='+MP,guestDisk);
    await waitFor('the reloaded guest to land straight back in the match',()=>{
      pump(HOST,RETURN);
      return RETURN.screen()==='s-match';
    },14000);
    await waitFor('the reloaded guest to still be the same player',
      ()=>RETURN.text('#hRole')===revealed,10000);
    log.push('reload rejoined via the link, still '+RETURN.text('#hRole'));
    if(HOST.text('#devlog').indexOf('players 4')<0)
      throw new Error('rejoining created a duplicate player: '+
        /players \d+/.exec(HOST.text('#devlog')));
    log.push('host still sees exactly four players — no ghost seat');

    // ---- a phone that stops reporting must not stall the match ----
    const before=+(/uncaught (\d+)/.exec(HOST.text('#devlog'))||[0,99])[1];
    HOST.dev('drop a player');
    await waitFor('the host to notice the dropped phone',()=>{
      pump(HOST);
      return /presence .* lost [1-9]/.test(HOST.text('#devlog'))||
             +(/uncaught (\d+)/.exec(HOST.text('#devlog'))||[0,99])[1]<before;
    },10000);
    await waitFor('the dropped player to be caught rather than block the match',()=>{
      pump(HOST);
      return +(/uncaught (\d+)/.exec(HOST.text('#devlog'))||[0,99])[1]<before;
    },12000);
    log.push('dropped phone was caught — uncaught went '+before+' -> '+
      (/uncaught (\d+)/.exec(HOST.text('#devlog'))||[])[1]);

    if(badAuth) throw new Error(badAuth+' requests went out without valid credentials');
    log.push('backend calls: '+calls+', all authenticated');

    // bandwidth is the thing that decides whether a free project survives a match
    const wire=DB.rooms.get(code).state;
    const bytes=JSON.stringify(wire).length;
    if(wire._last!==undefined) throw new Error('host-only bookkeeping is going over the wire');
    if((wire.events||[]).length>20) throw new Error('event log is not being trimmed for the wire');
    if((wire.objectives||[]).some(o=>o.prog)) throw new Error('per-player objective progress is being broadcast');
    log.push('room payload: '+bytes+' bytes for '+Object.keys(wire.players).length+' players');
  }catch(e){ errors.push(e.message); }

  console.log('\nFALSE SAFE — networked match (two windows, fake Supabase)');
  console.log('─'.repeat(38));
  log.forEach(l=>console.log('  · '+l));
  if(errors.length){ console.log('\n  ERRORS:'); errors.forEach(e=>console.log('   ! '+e)); }
  else console.log('\n  no runtime errors');
  process.exit(errors.length?1:0);
})();
