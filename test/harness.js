/* FALSE SAFE — headless test harness. Extracts CORE from game.js and tests pure logic. */
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'..','src','game.js'),'utf8');
const a=src.indexOf('CORE_START'), b=src.indexOf('CORE_END');
if(a<0||b<0){console.error('Could not extract CORE block');process.exit(1);}
const m=[null, src.slice(src.indexOf('*/',a)+2, src.lastIndexOf('/*',b))];
const sandbox={module:{exports:{}},console};sandbox.exports=sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(m[1],sandbox,{filename:'core.js'});
const C=sandbox.module.exports;

let pass=0,fail=0,failures=[];
function t(name,fn){try{const r=fn();if(r===false)throw new Error('returned false');pass++;}
  catch(e){fail++;failures.push(name+' :: '+e.message);}}
function eq(a,b,msg){if(a!==b)throw new Error((msg||'')+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a));return true;}
function ok(v,msg){if(!v)throw new Error(msg||'not truthy');return true;}

const O={lat:-33.8688,lng:151.2093}; // Sydney-ish origin
const rng=C.mulberry32(12345);

/* ---- geo ---- */
t('metersBetween zero',()=>eq(Math.round(C.metersBetween(O,O)),0));
t('offset 100m east measures ~100m',()=>{
  const p=C.offsetLatLng(O,100,0);return ok(Math.abs(C.metersBetween(O,p)-100)<1.5);});
t('offset 250m north measures ~250m',()=>{
  const p=C.offsetLatLng(O,0,250);return ok(Math.abs(C.metersBetween(O,p)-250)<2);});
t('rng deterministic',()=>{const a=C.mulberry32(7),b=C.mulberry32(7);return eq(a(),b());});

/* ---- zone ---- */
t('next zone always contained (400 samples)',()=>{
  const r=C.mulberry32(99);let cur={lat:O.lat,lng:O.lng,r:450};
  for(let i=0;i<400;i++){const n=C.nextZone(r,cur);
    if(!C.zoneContains(cur,n))throw new Error('escaped at i='+i);
    cur=(i%5===4)?{lat:O.lat,lng:O.lng,r:450}:n;}
  return true;});
t('next zone shrinks',()=>{const n=C.nextZone(C.mulberry32(3),{lat:O.lat,lng:O.lng,r:400});return ok(n.r<400);});
t('zone respects minimum radius',()=>{
  const n=C.nextZone(C.mulberry32(3),{lat:O.lat,lng:O.lng,r:50});return ok(n.r>=C.CFG.zoneMinR-0.01);});
t('zone centre is offset, not concentric',()=>{
  const r=C.mulberry32(5);let moved=0;
  for(let i=0;i<50;i++){const n=C.nextZone(r,{lat:O.lat,lng:O.lng,r:400});
    if(C.metersBetween(O,n)>20)moved++;}
  return ok(moved>40,'only '+moved+'/50 offset');});
t('zone offsets spread across all quadrants',()=>{
  const r=C.mulberry32(11);const q={};
  for(let i=0;i<80;i++){const n=C.nextZone(r,{lat:O.lat,lng:O.lng,r:400});
    q[(n.lat>O.lat?'N':'S')+(n.lng>O.lng?'E':'W')]=1;}
  return eq(Object.keys(q).length,4,'quadrants covered:');});
t('zone stage times ascending and inside match',()=>{
  const s=C.zoneStageTimes({matchLen:2700});
  for(let i=1;i<s.length;i++) if(s[i]<=s[i-1]) throw new Error('not ascending');
  return ok(s[s.length-1]<C.schedule({matchLen:2700}).end);});

/* ---- schedule ---- */
t('phase order across a standard match',()=>{
  const cfg={matchLen:2700},seen=[];
  for(let t0=0;t0<C.CFG.scatter+C.schedule(cfg).end+10;t0+=5){
    const p=C.phaseFor(t0,cfg); if(seen[seen.length-1]!==p) seen.push(p);}
  return eq(seen.join('>'),'SCATTER>HUNT_1>TRIBUNAL_1>HUNT_2>FINAL_TRIBUNAL>HUNT_ENDGAME>RESULTS');});
t('tribunal 1 near one third of match',()=>{
  const cfg={matchLen:2700};const s=C.schedule(cfg);return ok(Math.abs(s.t1-900)<1);});
t('final tribunal near two thirds',()=>{
  const s=C.schedule({matchLen:2700});return ok(Math.abs(s.t2-(1800+60))<1);});
t('scatter is the first phase at t=0',()=>eq(C.phaseFor(0,{matchLen:1800}),'SCATTER'));

/* ---- roles ---- */
t('roles: exactly one seeker and one imposter',()=>{
  const ids=['a','b','c','d','e','f'];const r=C.assignRoles(ids,C.mulberry32(1),1);
  const vals=Object.values(r.roles);
  eq(vals.filter(v=>v==='seeker').length,1,'seekers');
  eq(vals.filter(v=>v==='imposter').length,1,'imposters');
  return eq(vals.filter(v=>v==='hider').length,4,'hiders');});
t('roles: seeker and imposter are different players',()=>{
  const r=C.assignRoles(['a','b','c','d'],C.mulberry32(2),1);return ok(r.seekerId!==r.imposterId);});
t('roles: no imposter when disabled',()=>{
  const r=C.assignRoles(['a','b','c','d'],C.mulberry32(2),0);return eq(r.imposterId,null);});
t('roles: every player gets exactly one role',()=>{
  const ids=['a','b','c','d','e'];const r=C.assignRoles(ids,C.mulberry32(9),1);
  return eq(Object.keys(r.roles).sort().join(''),ids.sort().join(''));});
t('roles vary between seeds',()=>{
  const a=C.assignRoles(['a','b','c','d','e','f','g','h'],C.mulberry32(1),1).seekerId;
  let diff=false;for(let s=2;s<40;s++){if(C.assignRoles(['a','b','c','d','e','f','g','h'],C.mulberry32(s),1).seekerId!==a)diff=true;}
  return ok(diff);});

/* ---- catching ---- */
const now=1000000;
const seeker={id:'s',role:'seeker',lat:O.lat,lng:O.lng,locT:now};
function hiderAt(dx){const p=C.offsetLatLng(O,dx,0);return {id:'h',role:'hider',lat:p.lat,lng:p.lng,locT:now,caught:false};}
t('catch inside radius',()=>ok(C.canCatch(seeker,hiderAt(6),now)));
t('no catch outside radius',()=>ok(!C.canCatch(seeker,hiderAt(30),now)));
t('no catch on stale target location',()=>{
  const h=hiderAt(5);h.locT=now-40000;return ok(!C.canCatch(seeker,h,now));});
t('no catch on stale seeker location',()=>{
  const s={...seeker,locT:now-40000};return ok(!C.canCatch(s,hiderAt(5),now));});
t('hider cannot catch',()=>{
  const s={...seeker,role:'hider'};return ok(!C.canCatch(s,hiderAt(5),now));});
t('cannot catch an already caught player',()=>{
  const h=hiderAt(5);h.caught=true;return ok(!C.canCatch(seeker,h,now));});
t('cannot catch another seeker',()=>{
  const h=hiderAt(5);h.role='seeker';return ok(!C.canCatch(seeker,h,now));});
t('converting seeker cannot catch',()=>{
  const s={...seeker,converting:true};return ok(!C.canCatch(s,hiderAt(5),now));});
t('imposter is catchable like any hider',()=>{
  const h=hiderAt(5);h.role='imposter';return ok(C.canCatch(seeker,h,now));});
t('cannot catch self',()=>{
  const s={...seeker};const t2={...seeker,role:'hider'};t2.id='s';return ok(!C.canCatch(s,t2,now));});

/* ---- voting ---- */
t('majority accusation resolves',()=>{
  const r=C.resolveVote({a:'x',b:'x',c:'x',d:'y'},['a','b','c','d']);
  eq(r.outcome,'accuse');return eq(r.target,'x');});
t('plurality below majority is a skip',()=>{
  const r=C.resolveVote({a:'x',b:'y',c:'z',d:'skip'},['a','b','c','d']);return eq(r.outcome,'skip');});
t('tie resolves to skip',()=>{
  const r=C.resolveVote({a:'x',b:'y'},['a','b']);return eq(r.outcome,'skip');});
t('non-voters count as skip',()=>{
  const r=C.resolveVote({a:'x'},['a','b','c']);return eq(r.outcome,'skip');});
t('skip majority resolves to skip',()=>{
  const r=C.resolveVote({a:'skip',b:'skip',c:'x'},['a','b','c']);return eq(r.outcome,'skip');});
t('correct accusation flagged correct',()=>{
  const r=C.resolveVote({a:'imp',b:'imp',c:'x'},['a','b','c']);
  return eq(C.voteConsequence(r,'imp',true).kind,'correct');});
t('wrong accusation flagged wrong',()=>{
  const r=C.resolveVote({a:'x',b:'x',c:'imp'},['a','b','c']);
  return eq(C.voteConsequence(r,'imp',true).kind,'wrong');});
t('accusing an already exposed imposter counts as wrong',()=>{
  const r=C.resolveVote({a:'imp',b:'imp',c:'x'},['a','b','c']);
  return eq(C.voteConsequence(r,'imp',false).kind,'wrong');});
t('only uncaught non-seekers may vote',()=>{
  const P={a:{role:'hider',caught:false},b:{role:'seeker',caught:false},
           c:{role:'hider',caught:true},d:{role:'imposter',caught:false}};
  return eq(C.eligibleVoters(P).sort().join(''),'ad');});
t('full signal is longer after the final tribunal',()=>ok(C.CFG.fullSignal[2]>C.CFG.fullSignal[1]));

/* ---- win conditions ---- */
function st(players,extra){return Object.assign({players:players,imposterId:'imp',imposterEligible:true,cfg:{matchLen:2700}},extra||{});}
t('imposter wins when last genuine hider is caught',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},imp:{role:'imposter',caught:false}});
  const w=C.checkWin(s);return eq(w&&w.winner,'imposter');});
t('no imposter win while a genuine hider survives',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:false},imp:{role:'imposter',caught:false}});
  return eq(C.checkWin(s),null);});
t('seekers win when everyone including imposter is caught',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},imp:{role:'imposter',caught:true}});
  return eq(C.checkWin(s).winner,'seekers');});
t('exposed imposter alone does NOT give imposter victory',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},imp:{role:'imposter',caught:false}},{imposterEligible:false});
  return eq(C.checkWin(s),null);});
t('exposed imposter surviving to the end gives hider victory',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},imp:{role:'imposter',caught:false}},{imposterEligible:false});
  const T=C.CFG.scatter+C.schedule(s.cfg).end+1;
  return eq(C.checkWin(s,T).winner,'hiders');});
t('hiders win at time with survivors',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:false},imp:{role:'imposter',caught:true}});
  const T=C.CFG.scatter+C.schedule(s.cfg).end+1;
  return eq(C.checkWin(s,T).winner,'hiders');});
t('imposter victory beats the clock',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},imp:{role:'imposter',caught:false}});
  const T=C.CFG.scatter+C.schedule(s.cfg).end+1;
  return eq(C.checkWin(s,T).winner,'imposter');});
t('no premature win mid match',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider'},h2:{role:'hider'},imp:{role:'imposter'}});
  return eq(C.checkWin(s,600),null);});
t('faction counts exclude seekers and caught players',()=>{
  const s=st({s1:{role:'seeker'},h1:{role:'hider',caught:true},h2:{role:'hider'},imp:{role:'imposter'}});
  const c=C.factionCounts(s);
  eq(c.uncaught.length,2);eq(c.genuine.length,1);return eq(c.impUncaught,true);});

/* ---- tracking ---- */
t('tracking tightens over the match',()=>{
  const a=C.trackingBand(0.1),b=C.trackingBand(0.5),c=C.trackingBand(0.9);
  return ok(a.max>b.max&&b.max>c.max&&a.every>c.every);});
t('early blips land within early uncertainty band',()=>{
  const r=C.mulberry32(4);
  for(let i=0;i<200;i++){const b=C.makeBlip(r,O,0.1,false);
    if(C.metersBetween(O,b)>200.5)throw new Error('blip too far: '+C.metersBetween(O,b));}
  return true;});
t('late blips are tighter than early blips on average',()=>{
  const r=C.mulberry32(8);let e=0,l=0;
  for(let i=0;i<300;i++){e+=C.metersBetween(O,C.makeBlip(r,O,0.1,false));l+=C.metersBetween(O,C.makeBlip(r,O,0.9,false));}
  return ok(l<e*0.6);});
t('jammer widens uncertainty',()=>{
  const r=C.mulberry32(6);let n=0,j=0;
  for(let i=0;i<200;i++){n+=C.makeBlip(r,O,0.9,false).r;j+=C.makeBlip(r,O,0.9,true).r;}
  return ok(j>n*1.5);});

/* ---- zone pressure ---- */
t('inside zone is never outside',()=>{
  const p=C.offsetLatLng(O,50,0);
  return eq(C.outsideState({lat:p.lat,lng:p.lng},{lat:O.lat,lng:O.lng,r:200},now).outside,false);});
t('just outside gives grace, not punishment',()=>{
  const p=C.offsetLatLng(O,260,0);
  const s=C.outsideState({lat:p.lat,lng:p.lng,outsideSince:now-5000},{lat:O.lat,lng:O.lng,r:200},now);
  return ok(s.outside&&s.level===0);});
t('staying outside escalates exposure',()=>{
  const p=C.offsetLatLng(O,260,0);
  const s1=C.outsideState({lat:p.lat,lng:p.lng,outsideSince:now-60000},{lat:O.lat,lng:O.lng,r:200},now);
  const s2=C.outsideState({lat:p.lat,lng:p.lng,outsideSince:now-160000},{lat:O.lat,lng:O.lng,r:200},now);
  return ok(s1.level===1&&s2.level===2);});
t('gps slop near the boundary is forgiven',()=>{
  const p=C.offsetLatLng(O,208,0);
  return eq(C.outsideState({lat:p.lat,lng:p.lng},{lat:O.lat,lng:O.lng,r:200},now).outside,false);});

/* ---- imposter missions ---- */
t('follow mission completes when staying close',()=>{
  const players={t1:{id:'t1',role:'hider',caught:false,lat:O.lat,lng:O.lng}};
  const imp=C.offsetLatLng(O,10,0);
  const m={type:'FOLLOW',targetId:'t1',need:30,progress:0};
  let done=false;for(let i=0;i<40;i++){done=C.missionTick(m,imp,players,1).done;if(done)break;}
  return ok(done);});
t('follow mission decays when target is far',()=>{
  const players={t1:{id:'t1',role:'hider',caught:false,lat:O.lat,lng:O.lng}};
  const near=C.offsetLatLng(O,10,0),far=C.offsetLatLng(O,300,0);
  const m={type:'FOLLOW',targetId:'t1',need:30,progress:0};
  for(let i=0;i<10;i++)C.missionTick(m,near,players,1);
  const peak=m.progress;
  for(let i=0;i<10;i++)C.missionTick(m,far,players,1);
  return ok(m.progress<peak&&m.progress>=0);});
t('follow mission fails if target is caught',()=>{
  const players={t1:{id:'t1',role:'hider',caught:true,lat:O.lat,lng:O.lng}};
  const m={type:'FOLLOW',targetId:'t1',need:30,progress:0};
  return eq(C.missionTick(m,C.offsetLatLng(O,5,0),players,1).active,false);});
t('lure mission completes at the marked spot',()=>{
  const m={type:'LURE',lat:O.lat,lng:O.lng,need:15,progress:0};
  let done=false;for(let i=0;i<20;i++){done=C.missionTick(m,{lat:O.lat,lng:O.lng},{},1).done;if(done)break;}
  return ok(done);});
t('mission target is never the imposter',()=>{
  const s={players:{imp:{role:'imposter'},h1:{role:'hider'}},imposterId:'imp',imposterEligible:true,
    zone:{lat:O.lat,lng:O.lng,r:300}};
  for(let i=0;i<40;i++){const m=C.pickMission(C.mulberry32(i),s);
    if(m.type==='FOLLOW'&&m.targetId==='imp')throw new Error('targeted self');}
  return true;});
t('mission falls back to LURE with no valid targets',()=>{
  const s={players:{imp:{role:'imposter'},s1:{role:'seeker'}},imposterId:'imp',imposterEligible:true,
    zone:{lat:O.lat,lng:O.lng,r:300}};
  return eq(C.pickMission(C.mulberry32(1),s).type,'LURE');});
t('lure spot is inside the safe zone',()=>{
  const s={players:{imp:{role:'imposter'}},imposterId:'imp',imposterEligible:true,zone:{lat:O.lat,lng:O.lng,r:300}};
  for(let i=0;i<50;i++){const m=C.pickMission(C.mulberry32(i),s);
    if(m.type==='LURE'&&C.metersBetween(O,m)>300)throw new Error('outside zone');}
  return true;});


/* ---- settings sanitising ---- */
t('sanitiseCfg clamps a silly match length',()=>{
  const c=C.sanitiseCfg({matchLen:999999});return eq(c.matchLen,5400);});
t('sanitiseCfg clamps catch distance',()=>{
  eq(C.sanitiseCfg({catchRadius:400}).catchRadius,30);
  return eq(C.sanitiseCfg({catchRadius:1}).catchRadius,5);});
t('sanitiseCfg keeps a sane head start relative to match length',()=>{
  const c=C.sanitiseCfg({matchLen:600,scatter:600});return ok(c.scatter<=240);});
t('sanitiseCfg allows zero zone moves, votes and imposters',()=>{
  const c=C.sanitiseCfg({zoneStages:0,tribunals:0,imposters:0});
  eq(c.zoneStages,0);eq(c.tribunals,0);return eq(c.imposters,0);});
t('sanitiseCfg rejects an unknown map style',()=>eq(C.sanitiseCfg({mapStyle:'hologram'}).mapStyle,'real'));
t('applyCfg changes live behaviour then resets',()=>{
  C.applyCfg(C.sanitiseCfg({catchRadius:25,tribunals:1}));
  const wide=C.CFG.catchRadius, tri=C.CFG.tribunals;
  C.applyCfg(C.sanitiseCfg({}));
  return ok(wide===25&&tri===1&&C.CFG.catchRadius===10&&C.CFG.tribunals===2);});
t('one tribunal is scheduled at halfway',()=>{
  C.applyCfg(C.sanitiseCfg({tribunals:1}));
  const s=C.schedule({matchLen:1800});
  const r=(s.marks.length===1&&Math.abs(s.marks[0]-900)<1&&Math.abs(s.end-1860)<1);
  C.applyCfg(C.sanitiseCfg({}));return ok(r);});
t('zero tribunals means the match is pure hunt time',()=>{
  C.applyCfg(C.sanitiseCfg({tribunals:0}));
  const s=C.schedule({matchLen:1800});
  const r=(s.marks.length===0&&s.end===1800&&C.phaseFor(C.CFG.scatter+1000,{matchLen:1800})==='HUNT_1');
  C.applyCfg(C.sanitiseCfg({}));return ok(r);});
t('two tribunals still produce the standard phase order',()=>{
  const cfg={matchLen:2700},seen=[];
  for(let x=0;x<C.CFG.scatter+C.schedule(cfg).end+10;x+=5){
    const p=C.phaseFor(x,cfg); if(seen[seen.length-1]!==p) seen.push(p);}
  return eq(seen.join('>'),'SCATTER>HUNT_1>TRIBUNAL_1>HUNT_2>FINAL_TRIBUNAL>HUNT_ENDGAME>RESULTS');});
t('tighter signal setting shrinks blip uncertainty',()=>{
  const r1=C.mulberry32(3);let a=0;for(let i=0;i<200;i++)a+=C.makeBlip(r1,O,0.5,false).r;
  C.applyCfg(C.sanitiseCfg({trackScale:0.6}));
  const r2=C.mulberry32(3);let b=0;for(let i=0;i<200;i++)b+=C.makeBlip(r2,O,0.5,false).r;
  C.applyCfg(C.sanitiseCfg({}));
  return ok(b<a*0.7);});

/* ---- GPS allowance on catching ---- */
t('catch distance grows with poor accuracy',()=>{
  const d=C.catchDistance({acc:40},{acc:40},10);return ok(d>10&&d<=25);});
t('catch distance is unchanged with good accuracy',()=>eq(C.catchDistance({acc:5},{acc:6},10),10));
t('catch allowance is capped',()=>ok(C.catchDistance({acc:400},{acc:400},10)<=10+C.CFG.catchSlopMax));
t('strict mode ignores accuracy entirely',()=>{
  C.applyCfg(C.sanitiseCfg({gpsForgive:0}));
  const d=C.catchDistance({acc:60},{acc:60},10);
  C.applyCfg(C.sanitiseCfg({}));return eq(d,10);});
t('a marginal tag succeeds with allowance and fails without',()=>{
  const p=C.offsetLatLng(O,16,0);
  const s={id:'s',role:'seeker',lat:O.lat,lng:O.lng,locT:now,acc:35};
  const h={id:'h',role:'hider',caught:false,lat:p.lat,lng:p.lng,locT:now,acc:35};
  const withAllowance=C.canCatch(s,h,now);
  C.applyCfg(C.sanitiseCfg({gpsForgive:0}));
  const strict=C.canCatch(s,h,now);
  C.applyCfg(C.sanitiseCfg({}));
  return ok(withAllowance&&!strict);});

/* ---- GPS filter ---- */
t('filter accepts the first fix as-is',()=>{
  const f=C.makeGpsFilter();const p=f.push({lat:O.lat,lng:O.lng,acc:12,t:1000});
  return ok(Math.abs(C.metersBetween(p,O))<0.01);});
t('filter rejects a junk fix',()=>{
  const f=C.makeGpsFilter();f.push({lat:O.lat,lng:O.lng,acc:8,t:1000});
  const jump=C.offsetLatLng(O,180,0);
  const p=f.push({lat:jump.lat,lng:jump.lng,acc:180,t:2000});
  return ok(C.metersBetween(p,O)<5&&f.rejected===1);});
t('filter rejects a teleport no runner could make',()=>{
  const f=C.makeGpsFilter();f.push({lat:O.lat,lng:O.lng,acc:8,t:1000});
  const jump=C.offsetLatLng(O,300,0);
  f.push({lat:jump.lat,lng:jump.lng,acc:10,t:2000});
  return eq(f.rejected,1);});
t('filter converges on a steady real position',()=>{
  const f=C.makeGpsFilter();const truth=C.offsetLatLng(O,40,0);
  let p;for(let i=0;i<30;i++){
    const noise=C.offsetLatLng(truth,(Math.sin(i*3)*12),(Math.cos(i*5)*12));
    p=f.push({lat:noise.lat,lng:noise.lng,acc:14,t:1000+i*1000});}
  return ok(C.metersBetween(p,truth)<9,'off by '+C.metersBetween(p,truth));});
t('filter smooths jitter better than raw fixes',()=>{
  const truth=C.offsetLatLng(O,40,0);const f=C.makeGpsFilter();
  let rawErr=0,fErr=0,p;
  for(let i=0;i<40;i++){
    const noise=C.offsetLatLng(truth,Math.sin(i*2.3)*15,Math.cos(i*1.7)*15);
    rawErr+=C.metersBetween(noise,truth);
    p=f.push({lat:noise.lat,lng:noise.lng,acc:15,t:1000+i*1000});
    fErr+=C.metersBetween(p,truth);}
  return ok(fErr<rawErr*0.75,'filtered '+Math.round(fErr)+' vs raw '+Math.round(rawErr));});
t('filter still follows a real walk',()=>{
  const f=C.makeGpsFilter();let cur=O,p;
  for(let i=0;i<40;i++){
    cur=C.offsetLatLng(cur,1.4,0);
    p=f.push({lat:cur.lat,lng:cur.lng,acc:10,t:1000+i*1000});}
  return ok(C.metersBetween(p,cur)<12,'lagging '+C.metersBetween(p,cur));});
t('filter recovers after a long dropout',()=>{
  const f=C.makeGpsFilter();f.push({lat:O.lat,lng:O.lng,acc:8,t:1000});
  const far=C.offsetLatLng(O,600,0);
  const p=f.push({lat:far.lat,lng:far.lng,acc:70,t:60000});
  return ok(C.metersBetween(p,O)>100);});
t('gps quality labels step down with accuracy',()=>{
  return ok(C.gpsQuality(6).level===3&&C.gpsQuality(20).level===2&&
            C.gpsQuality(50).level===1&&C.gpsQuality(200).level===0);});

/* ---- map tile maths ---- */
t('tile x/y round-trips back to the same coordinates',()=>{
  const z=17,x=C.lon2tile(O.lng,z),y=C.lat2tile(O.lat,z);
  const lng=C.tile2lon(x,z),lat=C.tile2lat(y,z);
  return ok(Math.abs(lat-O.lat)<1e-6&&Math.abs(lng-O.lng)<1e-6);});
t('tile indices stay inside the world at every zoom',()=>{
  for(let z=14;z<=19;z++){
    const x=C.lon2tile(179.9,z),y=C.lat2tile(-84,z),n=Math.pow(2,z);
    if(x<0||x>n||y<0||y>n) throw new Error('out of range at z'+z);}
  return true;});
t('zoom is chosen so tiles are at least as sharp as the view',()=>{
  [0.4,1,2,3].forEach(mpp=>{
    const z=C.zoomForMpp(O.lat,mpp);
    if(C.tileMpp(O.lat,z)>mpp*1.6) throw new Error('too coarse at mpp '+mpp);});
  return true;});
t('zoom is clamped to sane tile levels',()=>{
  return ok(C.zoomForMpp(O.lat,0.01)===19&&C.zoomForMpp(O.lat,500)===14);});
t('metres per pixel halves as zoom increases',()=>
  ok(Math.abs(C.tileMpp(O.lat,17)-C.tileMpp(O.lat,16)/2)<1e-9));


/* ---- settings preview: real-world scale ---- */
t('walking time matches a sane human pace',()=>{
  const m=C.walkMins(450*2);return ok(m>9&&m<13,'got '+m.toFixed(1)+' min');});
t('a 60 second head start is roughly a couple of hundred metres',()=>{
  const d=C.runDistance(60);return ok(d>150&&d<250,'got '+d);});
t('car lengths convert sensibly',()=>ok(Math.abs(C.carLengths(22)-4.9)<0.2));
t('short distances read as steps, long ones as walking minutes',()=>{
  return ok(/steps/.test(C.paceText(15))&&/min walk/.test(C.paceText(900)));});
t('zone plan has one radius per stage plus the start',()=>{
  C.applyCfg(C.sanitiseCfg({zoneStages:5}));
  const p=C.zonePlan({areaR:450});
  C.applyCfg(C.sanitiseCfg({}));
  return eq(p.length,6);});
t('zone plan shrinks monotonically to the floor',()=>{
  C.applyCfg(C.sanitiseCfg({zoneStages:8,zoneShrink:0.5}));
  const p=C.zonePlan({areaR:1500});
  C.applyCfg(C.sanitiseCfg({}));
  for(let i=1;i<p.length;i++) if(p[i]>p[i-1]) throw new Error('grew at '+i);
  return ok(p[p.length-1]>=C.CFG.zoneMinR-0.01);});
t('no zone moves means the circle never changes',()=>{
  C.applyCfg(C.sanitiseCfg({zoneStages:0}));
  const p=C.zonePlan({areaR:450});
  C.applyCfg(C.sanitiseCfg({}));
  return eq(p.length,1)&&eq(p[0],450);});
t('preview fits the play area on screen',()=>{
  const mpp=C.previewMpp('area',{areaR:450},340);
  return ok(450*2/mpp<=340,'circle overflows');});
t('preview zooms right in for catch distance',()=>{
  const wide=C.previewMpp('area',{areaR:450},340);
  C.applyCfg(C.sanitiseCfg({catchRadius:10}));
  const close=C.previewMpp('catch',{areaR:450},340);
  C.applyCfg(C.sanitiseCfg({}));
  return ok(close<wide/10,'not zoomed enough');});
t('catch preview keeps two runners visible at max distance',()=>{
  C.applyCfg(C.sanitiseCfg({catchRadius:30}));
  const mpp=C.previewMpp('catch',{},340);
  C.applyCfg(C.sanitiseCfg({}));
  return ok(30/mpp<170,'runners fall off screen');});
t('preview scale never collapses for a tiny play area',()=>{
  const mpp=C.previewMpp('area',{areaR:100},340);
  return ok(mpp>0&&isFinite(mpp));});
t('scale bar picks a round number that fits',()=>{
  const b=C.scaleBarFor(1.5,140);
  return ok([5,10,20,25,50,100,200,250,500,1000].indexOf(b.m)>=0&&b.px<=140);});
t('scale bar shrinks its label as you zoom in',()=>{
  const far=C.scaleBarFor(3,140).m, near=C.scaleBarFor(0.1,140).m;
  return ok(near<far);});
t('scale bar still returns something when very zoomed out',()=>{
  const b=C.scaleBarFor(50,140);return ok(b.m>0&&isFinite(b.px));});


/* ---- OpenStreetMap street data ---- */
t('highways are classified into drawable tiers',()=>{
  eq(C.classifyWay({highway:'motorway'}),'major');
  eq(C.classifyWay({highway:'residential'}),'minor');
  eq(C.classifyWay({highway:'footway'}),'path');
  eq(C.classifyWay({building:'yes'}),'building');
  return eq(C.classifyWay({natural:'water'}),'water');});
t('irrelevant features are ignored',()=>{
  return ok(C.classifyWay({amenity:'bench'})===null&&C.classifyWay(null)===null&&C.classifyWay({})===null);});
t('parks and pitches count as green space',()=>{
  return ok(C.classifyWay({leisure:'park'})==='park'&&C.classifyWay({landuse:'forest'})==='park');});
t('query is bounded to the play area and the right centre',()=>{
  const q=C.overpassQuery(O,450);
  return ok(q.indexOf('around:450')>0&&q.indexOf(O.lat.toFixed(6))>0&&q.indexOf('out geom')>0);});
t('query radius is capped so we never scrape a whole city',()=>
  ok(C.overpassQuery(O,99999).indexOf('around:1600')>0));
t('buildings are skipped for large play areas',()=>{
  return ok(C.overpassQuery(O,400).indexOf('building')>0&&C.overpassQuery(O,1200).indexOf('building')<0);});
const fakeOSM={elements:[
  {type:'way',tags:{highway:'residential'},geometry:[{lat:O.lat,lon:O.lng},{lat:O.lat+0.001,lon:O.lng+0.001}]},
  {type:'way',tags:{building:'yes'},geometry:[{lat:O.lat,lon:O.lng},{lat:O.lat,lon:O.lng+0.0005},
    {lat:O.lat+0.0005,lon:O.lng+0.0005},{lat:O.lat,lon:O.lng}]},
  {type:'way',tags:{amenity:'cafe'},geometry:[{lat:O.lat,lon:O.lng},{lat:O.lat,lon:O.lng+0.001}]},
  {type:'way',tags:{highway:'footway'},geometry:[{lat:O.lat,lon:O.lng}]}
]};
t('parsing keeps only usable ways',()=>{
  const w=C.parseOverpass(fakeOSM,O);return eq(w.length,2);});
t('parsed geometry lands in metres relative to the centre',()=>{
  const w=C.parseOverpass(fakeOSM,O)[0];
  return ok(Math.abs(w.p[0])<0.2&&Math.abs(w.p[1])<0.2&&Math.abs(w.p[2]-92)<8&&Math.abs(w.p[3]-111)<8);});
t('closed shapes are flagged as fillable areas',()=>{
  const w=C.parseOverpass(fakeOSM,O);
  return ok(w[1].a===true&&w[0].a===false);});
t('every way carries a bounding box for culling',()=>{
  const w=C.parseOverpass(fakeOSM,O)[0];
  return ok(w.b[0]<=w.b[2]&&w.b[1]<=w.b[3]&&w.b.length===4);});
t('parsing survives an empty response',()=>eq(C.parseOverpass({elements:[]},O).length,0));
t('parsing survives junk',()=>ok(C.parseOverpass(null,O).length===0&&C.parseOverpass({},O).length===0));
t('coordinates are rounded to keep the cache small',()=>{
  const w=C.parseOverpass(fakeOSM,O)[0];
  return ok(w.p.every(v=>Math.abs(v*10-Math.round(v*10))<1e-9));});
t('culling drops ways outside the view',()=>{
  const near={b:[0,0,10,10]},far={b:[5000,5000,5100,5100]};
  const view=[-100,-100,100,100];
  return ok(C.wayVisible(near,view)&&!C.wayVisible(far,view));});
t('culling keeps a way that only clips the edge',()=>
  ok(C.wayVisible({b:[90,90,300,300]},[-100,-100,100,100])));
t('cache key is stable for the same area but differs elsewhere',()=>{
  const a=C.streetsCacheKey(O,450), b=C.streetsCacheKey({lat:O.lat+0.0001,lng:O.lng},450);
  const c=C.streetsCacheKey({lat:O.lat+0.5,lng:O.lng},450);
  return ok(a===b&&a!==c);});
t('cache key buckets nearby radii together',()=>
  eq(C.streetsCacheKey(O,440),C.streetsCacheKey(O,449)));
t('bigger roads draw wider than lanes and paths',()=>{
  return ok(C.ROAD_STYLE('major').w>C.ROAD_STYLE('minor').w&&
            C.ROAD_STYLE('minor').w>C.ROAD_STYLE('path').w&&
            C.ROAD_STYLE('building')===null);});
t('paths are dashed, roads are not',()=>
  ok(C.ROAD_STYLE('path').dash&&!C.ROAD_STYLE('major').dash));

/* ---- road classification, now that the query and the classifier must agree ---- */
t('bus lanes and busways count as roads',()=>
  ok(C.classifyWay({highway:'busway'})==='road'&&C.classifyWay({highway:'bus_guideway'})==='road'));
t('a road that has not been built yet is not a road',()=>
  ok(C.classifyWay({highway:'construction'})===null&&C.classifyWay({highway:'proposed'})===null&&
     C.classifyWay({highway:'razed'})===null));
t('station platforms and lifts are not somewhere you can run',()=>
  ok(C.classifyWay({highway:'platform'})===null&&C.classifyWay({highway:'elevator'})===null));
t('a private driveway is not a public street',()=>
  eq(C.classifyWay({highway:'service',access:'private'}),null));
t('a pedestrian square is ground, not a line to run along',()=>
  eq(C.classifyWay({highway:'pedestrian',area:'yes'}),'park'));
t('rivers and canals read as water',()=>
  ok(C.classifyWay({waterway:'river'})==='water'&&C.classifyWay({waterway:'canal'})==='water'));
t('every classifier case is actually fetched',()=>{
  const q=C.overpassQuery(O,450);
  return ok(q.indexOf('landuse')>0&&q.indexOf('waterway')>0&&q.indexOf('leisure')>0&&
            q.indexOf('natural')>0&&q.indexOf('highway')>0);});
t('the leisure filter is anchored so it cannot match parking',()=>
  ok(C.overpassQuery(O,450).indexOf('"^(park|pitch|garden|playground|recreation_ground)$"')>0));
t('there is more than one Overpass mirror to fall back on',()=>
  ok(C.OVERPASS.length>1&&C.OVERPASS.every(u=>u.indexOf('https://')===0)));

/* ---- road graph ---- */
const roadWays=[
  {k:'minor',p:[0,0,200,0],b:[0,0,200,0],a:false},
  {k:'minor',p:[100,-100,100,100],b:[100,-100,100,100],a:false},
  {k:'path',p:[0,0,0,-60],b:[0,-60,0,0],a:false},
  {k:'building',p:[10,10,30,10,30,30,10,10],b:[10,10,30,30],a:true},
  {k:'park',p:[0,50,50,50,50,80,0,50],b:[0,50,50,80],a:true},
  {k:'water',p:[-80,-80,-40,-80],b:[-80,-80,-40,-80],a:false}
];
const RG=C.buildRoadGraph(roadWays);
t('the graph keeps roads and paths and nothing else',()=>eq(RG.n,3));
t('buildings and parks never become somewhere to walk',()=>
  ok(!C.isWalkable('building')&&!C.isWalkable('water')&&!C.isWalkable('park')&&C.isWalkable('path')));
t('a multi-point way becomes one segment per leg',()=>
  eq(C.buildRoadGraph([{k:'minor',p:[0,0,10,0,10,10,20,10],a:false}]).n,3));
t('a graph built from nothing is harmless',()=>{
  const g=C.buildRoadGraph([]);return ok(g.n===0&&C.snapToRoad(g,0,0,50)===null);});
t('snapping finds the nearest road, not just any road',()=>{
  const s=C.snapToRoad(RG,50,20,60);
  return ok(Math.abs(s.x-50)<0.01&&Math.abs(s.y)<0.01&&Math.abs(s.d-20)<0.01);});
t('snapping refuses to drag you across town',()=>
  eq(C.snapToRoad(RG,50,400,45),null));
t('snapping reports which way the street runs',()=>{
  const s=C.snapToRoad(RG,150,10,40);
  return ok(Math.abs(Math.abs(s.dir.x)-1)<0.01&&Math.abs(s.dir.y)<0.01);});
t('snapping past the end of a street lands on its end, not its middle',()=>{
  const s=C.snapToRoad(RG,260,0,80);
  return ok(Math.abs(s.x-200)<0.01&&Math.abs(s.y)<0.01);});
t('points on the far side of the grid are still found',()=>{
  const g=C.buildRoadGraph([{k:'minor',p:[900,900,1000,900],a:false}]);
  return ok(C.snapToRoad(g,950,930,45)!==null);});
t('closest point on a segment clamps to the ends',()=>{
  const a=C.closestOnSegment(-50,0,0,0,10,0), b=C.closestOnSegment(999,0,0,0,10,0);
  return ok(a.x===0&&b.x===10);});
t('a zero-length segment does not divide by zero',()=>{
  const p=C.closestOnSegment(5,5,3,3,3,3);return ok(p.x===3&&p.y===3);});
t('a spawn point picked near a junction lands on tarmac',()=>{
  const r=C.mulberry32(4);
  for(let i=0;i<20;i++){
    const p=C.roadPointNear(RG,r,100,0,120);
    if(!p) throw new Error('no point found on attempt '+i);
    const s=C.snapToRoad(RG,p.x,p.y,5);
    if(!s||s.d>0.01) throw new Error('spawned '+ (s?s.d:'off') +' m off the road');
  }
  return true;});
t('a spawn point stays inside the radius it was asked for',()=>{
  const r=C.mulberry32(8);
  for(let i=0;i<20;i++){
    const p=C.roadPointNear(RG,r,100,0,60);
    if(p&&Math.sqrt((p.x-100)*(p.x-100)+p.y*p.y)>60.01) throw new Error('escaped the radius');
  }
  return true;});
t('asking for a road where there are none returns nothing rather than lying',()=>
  eq(C.roadPointNear(C.buildRoadGraph([]),C.mulberry32(1),0,0,100),null));
t('a mover heading into the houses is pulled back onto the street',()=>{
  const f=C.followRoad(RG,50,10,0,-1,0.5);
  return ok(f.on&&Math.abs(f.y)<10&&Math.abs(f.y)>0);});
t('road following turns you along the street, not across it',()=>{
  const f=C.followRoad(RG,50,4,0.2,-0.98,0.9);
  return ok(Math.abs(f.vx)>Math.abs(f.vy));});
t('road following keeps the direction you were already going',()=>{
  const east=C.followRoad(RG,50,2,1,0,0.6), west=C.followRoad(RG,50,2,-1,0,0.6);
  return ok(east.vx>0&&west.vx<0);});
t('road following in open country leaves you alone',()=>{
  const f=C.followRoad(RG,50,900,0,1,0.5);
  return ok(!f.on&&f.x===50&&f.y===900);});
t('a reachable spot uses the roads when there are roads',()=>{
  const roads={centre:O,graph:RG};
  const p=C.reachableSpot(C.mulberry32(21),{lat:O.lat,lng:O.lng},150,roads);
  const l=C.localFrom(O,p), s=C.snapToRoad(RG,l.x,l.y,10);
  return ok(s&&s.d<1.5,'landed '+(s?s.d:'nowhere')+' m off a road');});
t('a reachable spot still works with no road data at all',()=>{
  const p=C.reachableSpot(C.mulberry32(21),{lat:O.lat,lng:O.lng},150,null);
  return ok(C.metersBetween(O,p)<=151);});
t('local coordinates round-trip back to the same place',()=>{
  const p=C.offsetLatLng(O,120,-45), l=C.localFrom(O,p);
  return ok(Math.abs(l.x-120)<0.5&&Math.abs(l.y+45)<0.5);});
t('a lure spot lands on a street the imposter can stand on',()=>{
  const st={players:{i:{role:'imposter',caught:false}},imposterId:'i',imposterEligible:true,
    zone:{lat:O.lat,lng:O.lng,r:150}};
  const m=C.pickMission(C.mulberry32(33),st,{centre:O,graph:RG});
  eq(m.type,'LURE');
  const l=C.localFrom(O,m), s=C.snapToRoad(RG,l.x,l.y,10);
  return ok(s&&s.d<1.5,'lure landed '+(s?s.d:'nowhere')+' m off a road');});
t('a lure spot is still placed when the map never loaded',()=>{
  const st={players:{i:{role:'imposter',caught:false}},imposterId:'i',imposterEligible:true,
    zone:{lat:O.lat,lng:O.lng,r:150}};
  const m=C.pickMission(C.mulberry32(33),st);
  return ok(m.type==='LURE'&&C.metersBetween(O,m)<=151);});

/* ---- multiplayer plumbing ---- */
t('only actions the host has not seen are replayed',()=>{
  const a=C.newActions([{seq:1},{seq:2},{seq:3}],2);
  return ok(a.length===1&&a[0].seq===3);});
t('actions are applied in the order they were taken',()=>{
  const a=C.newActions([{seq:3},{seq:1},{seq:2}],0);
  return eq(a.map(x=>x.seq).join(''),'123');});
t('an empty or junk action list is survivable',()=>
  ok(C.newActions(null,0).length===0&&C.newActions([null,undefined],0).length===0));
t('a newer position from a player is accepted',()=>{
  const p={lat:O.lat,lng:O.lng,locSrc:1000,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:O.lat+0.001,lng:O.lng,locT:2000,ts:2000},5000);
  return ok(p.locSrc===2000&&p.stats.dist>100);});
t('a late-arriving old position never rewinds a player',()=>{
  const p={lat:O.lat,lng:O.lng,locSrc:9000,locT:9000,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:O.lat+0.01,lng:O.lng,locT:1000,ts:1000},5000);
  return ok(p.locT===9000&&p.stats.dist===0);});
t('a fix is aged on the sender\'s clock and re-based onto ours',()=>{
  // phone's clock is an hour fast; the fix was 4s old when it was sent
  const p={lat:null,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:O.lat,lng:O.lng,locT:3600000+1000,ts:3600000+5000},50000);
  return eq(p.locT,46000);});
t('a fix sent the instant it was taken is as fresh as it gets',()=>{
  const p={lat:null,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:O.lat,lng:O.lng,locT:7000,ts:7000},50000);
  return eq(p.locT,50000);});
t('a fix cannot claim to come from the future',()=>{
  const p={lat:null,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:O.lat,lng:O.lng,locT:9000,ts:1000},50000);
  return eq(p.locT,50000);});
t('a fresh input counts as the player still being there',()=>{
  const p={locT:0,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:null,locT:0,ts:5},7777);
  return eq(p.online,7777);});
t('re-reading a dead phone\'s last row does not bring it back to life',()=>{
  const p={locT:0,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:null,locT:0,ts:5},1000);   // last thing it ever sent
  C.mergePlayerInput(p,{lat:null,locT:0,ts:5},90000);  // same row, read again later
  return eq(p.online,1000);});
t('presence is stamped on the host clock, not the phone\'s',()=>{
  const p={locT:0,stats:{dist:0}};
  C.mergePlayerInput(p,{lat:null,locT:0,ts:9e12},4242); // phone's clock is years fast
  return eq(p.online,4242);});
t('an acknowledged action stops being resent',()=>{
  const out=[{seq:1},{seq:2},{seq:3}];
  return eq(C.pendingActions(out,2).length,1);});
t('nothing is dropped before the host confirms it',()=>
  eq(C.pendingActions([{seq:1},{seq:2}],0).length,2));
t('a phone reporting right now is live',()=>eq(C.presence({online:10000},10000),'live'));
t('a phone quiet for a minute is flagged, not written off',()=>
  eq(C.presence({online:0},60*1000),'stale'));
t('a phone quiet for several minutes is treated as lost',()=>
  eq(C.presence({online:0},200*1000),'lost'));
t('bots and the host never look disconnected',()=>
  ok(C.presence({bot:true,online:0},999999)==='live'&&C.presence({},999999)==='live'));
t('quorum is counted from the phones still answering',()=>{
  const players={a:{role:'hider',caught:false,online:200000},
                 b:{role:'hider',caught:false,online:200000},
                 c:{role:'hider',caught:false,online:0},
                 s:{role:'seeker',caught:false,online:200000}};
  return eq(C.presentVoters(players,200000).length,2);});
t('a merely flaky phone still gets a vote',()=>{
  const players={a:{role:'hider',caught:false,online:100000},
                 b:{role:'hider',caught:false,online:0}};       // 100s quiet: stale, not lost
  return eq(C.presentVoters(players,100000).length,2);});
t('a dropped hider is found so the match can still end',()=>{
  const players={a:{role:'hider',caught:false,online:0},
                 b:{role:'hider',caught:false,online:200000},
                 c:{role:'hider',caught:true,online:0},
                 s:{role:'seeker',caught:false,online:0}};
  const l=C.lostHiders(players,200000);
  return ok(l.length===1&&l[0]==='a');});
t('a hider who is merely quiet is left alone',()=>
  eq(C.lostHiders({a:{role:'hider',caught:false,online:0}},100000).length,0));
t('a host that stopped writing is noticed',()=>
  ok(C.hostAlive({hostAt:100000},100000)&&!C.hostAlive({hostAt:0},100000)));

/* ---- pausing ---- */
const pausedState=()=>({
  t0:100000, phase:'HUNT_1', pausedAt:null,
  fullSignalUntil:150000, jammedUntil:0, missionNextAt:160000, zoneCloseAt:170000,
  tribunal:{endsAt:180000,done:false}, closing:{at:120000},
  blips:[{until:130000},{until:140000}],
  players:{a:{convertAt:190000,exposedUntil:125000,liveUntil:0,outsideSince:110000,
              online:115000,lastBlip:105000,locT:118000}}
});
t('a paused match is recognised however it is asked',()=>
  ok(C.isPaused({pausedAt:5})&&!C.isPaused({pausedAt:null})&&!C.isPaused({})&&!C.isPaused(null)));
t('resuming moves the match clock forward by the time nobody was playing',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return eq(st.t0,130000);});
t('every match deadline survives a pause',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return ok(st.fullSignalUntil===180000&&st.missionNextAt===190000&&
            st.zoneCloseAt===200000&&st.tribunal.endsAt===210000&&st.closing.at===150000);});
t('a pause does not make every blip expire the moment play restarts',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return ok(st.blips[0].until===160000&&st.blips[1].until===170000);});
t('a caught player does not convert early because of a pause',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return eq(st.players.a.convertAt,220000);});
t('a pause does not make everyone look disconnected',()=>{
  const st=pausedState(); C.resumeShift(st,300000);   // a five minute break
  return ok(C.presence(st.players.a,415000)==='live');});
t('a pause does not silently make someone outside the zone for ages',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return eq(st.players.a.outsideSince,140000);});
t('a deadline that was never set stays unset',()=>{
  const st=pausedState(); C.resumeShift(st,30000);
  return ok(st.jammedUntil===0&&st.players.a.liveUntil===0);});
t('resuming with no elapsed time changes nothing',()=>{
  const st=pausedState(), before=JSON.stringify(st);
  C.resumeShift(st,0); C.resumeShift(st,-5);
  return eq(JSON.stringify(st),before);});
t('resuming a state with no tribunal or blips does not crash',()=>{
  const st={t0:1000,players:{}};
  C.resumeShift(st,500);
  return eq(st.t0,1500);});

/* ---- host succession ---- */
const roomOf=(hostId,players,phase)=>({hostId:hostId,phase:phase||'HUNT_1',hostAt:0,players:players});
t('the heir is the same on every phone, because they all read the same room',()=>{
  const p={zeta:{online:9e9},alpha:{online:9e9},mid:{online:9e9},host:{online:9e9}};
  const st=roomOf('host',p);
  return eq(C.hostHeir(st,9e9),'alpha');});
t('the phone that vanished is never elected to replace itself',()=>{
  const st=roomOf('host',{host:{online:9e9},bravo:{online:9e9}});
  return eq(C.hostHeir(st,9e9),'bravo');});
t('a bot cannot host a match',()=>{
  const st=roomOf('host',{host:{online:9e9},aaa:{bot:true,online:9e9},bbb:{online:9e9}});
  return eq(C.hostHeir(st,9e9),'bbb');});
t('a phone that has also gone quiet is skipped over',()=>{
  const st=roomOf('host',{host:{online:0},aaa:{online:0},bbb:{online:200000}});
  return eq(C.hostHeir(st,200000),'bbb');});
t('a host still writing is never replaced',()=>{
  const st=roomOf('host',{host:{online:9e9},aaa:{online:9e9}}); st.hostAt=200000;
  return ok(!C.shouldClaimHost(st,'aaa',200000));});
t('the heir takes over once the host stops writing',()=>{
  const st=roomOf('host',{host:{online:0},aaa:{online:200000},bbb:{online:200000}});
  return ok(C.shouldClaimHost(st,'aaa',200000));});
t('only the heir takes over, so two phones cannot both claim it',()=>{
  const st=roomOf('host',{host:{online:0},aaa:{online:200000},bbb:{online:200000}});
  return ok(!C.shouldClaimHost(st,'bbb',200000));});
t('nobody takes over a match that has already finished',()=>{
  const st=roomOf('host',{host:{online:0},aaa:{online:200000}},'RESULTS');
  return ok(!C.shouldClaimHost(st,'aaa',200000));});
t('a lobby whose host walked off is rescued too',()=>{
  const st=roomOf('host',{host:{online:0},aaa:{online:200000}},'LOBBY');
  return ok(C.shouldClaimHost(st,'aaa',200000));});
t('the last phone standing hosts rather than nobody',()=>{
  const st=roomOf('host',{host:{online:0},solo:{online:200000}});
  return ok(C.shouldClaimHost(st,'solo',200000));});
t('a room with nobody left to promote elects no one',()=>{
  const st=roomOf('host',{host:{online:0}});
  return ok(C.hostHeir(st,200000)===null&&!C.shouldClaimHost(st,'host',200000));});

/* ---- Supabase transport shaping ---- */
const MP={url:'https://abc.supabase.co',key:'x'.repeat(40)};
t('a call carries the key both ways round',()=>{
  const r=C.supaRequest(MP,'rpc/fs_get_room',{method:'POST',body:{p_code:'ABCDE'}});
  return ok(r.url==='https://abc.supabase.co/rest/v1/rpc/fs_get_room'&&
            r.headers.apikey===MP.key&&r.headers.Authorization==='Bearer '+MP.key&&
            r.method==='POST'&&r.body==='{"p_code":"ABCDE"}');});
t('no Prefer header is sent unless one is asked for',()=>
  eq(C.supaRequest(MP,'rpc/fs_get_room',{method:'POST',body:{}}).headers.Prefer,undefined));
t('a Prefer header is passed through when it is wanted',()=>
  ok(C.supaRequest(MP,'x',{prefer:'count=exact'}).headers.Prefer==='count=exact'));
t('a trailing slash on the project URL does not double up',()=>
  eq(C.supaRequest({url:'https://abc.supabase.co/',key:MP.key},'rpc/fs_get_room').url,
     'https://abc.supabase.co/rest/v1/rpc/fs_get_room'));
const ALL_OPS=['putState','getState','dropRoom','putInput','listInputs','clearInputs','dropInput'];
t('every room operation names the room it is for',()=>{
  ALL_OPS.forEach(op=>{
    const c=C.rpcFor(op,'ABCDE','p1',{x:1});
    if(!c) throw new Error(op+' has no stored routine');
    if(c.args.room!=='ABCDE') throw new Error(op+' does not pass the room code');
  });
  return true;});
t('an operation the client does not have is refused, not guessed at',()=>
  eq(C.rpcFor('deleteEverything','ABCDE'),null));
t('reading a room is impossible without naming it',()=>{
  const c=C.rpcFor('getState','ABCDE');
  return ok(c.fn==='fs_rpc'&&c.args.op==='get_room'&&
            Object.keys(c.args).length===2&&c.args.room==='ABCDE');});
t('a player-scoped call names the player too',()=>{
  const c=C.rpcFor('putInput','ABCDE','p1',{lat:1});
  return ok(c.args.pid==='p1'&&c.args.body.lat===1);});
t('no two operations collide on the same name',()=>{
  const names=ALL_OPS.map(op=>C.rpcFor(op,'A').args.op);
  return eq(new Set(names).size,names.length);});
t('every operation the client sends has a branch in the SQL it ships',()=>{
  // the SQL block is the install instructions; an operation with no matching branch
  // fails silently as a no-op, which is worse than an error
  const missing=ALL_OPS
    .map(op=>C.rpcFor(op,'A').args.op)
    .filter(name=>C.MP_SQL.indexOf("op = '"+name+"'")<0);
  if(missing.length) throw new Error('MP_SQL handles no such operation: '+missing.join(', '));
  return true;});
t('the routine the client calls is the one the SQL creates and grants',()=>{
  const fn=C.rpcFor('getState','A').fn;
  return ok(C.MP_SQL.indexOf('function '+fn+'(')>=0&&
            C.MP_SQL.slice(C.MP_SQL.indexOf('grant execute')).indexOf(fn+'(')>=0);});
t('the SQL leaves the tables unreachable from a browser',()=>
  ok(C.MP_SQL.indexOf('revoke all on fs_rooms, fs_inputs')>=0&&
     C.MP_SQL.indexOf('enable row level security')>=0));
t('the SQL clears out the earlier multi-routine version',()=>
  ok(C.MP_SQL.indexOf('drop function if exists fs_put_room')>=0));
t('the SQL stays short enough to paste on a phone',()=>{
  const lines=C.MP_SQL.split('\n').length;
  return ok(lines<=50,'grown to '+lines+' lines');});
t('the SQL tells the API to reload, so the routine is not 404 for a while',()=>
  ok(/notify pgrst, 'reload schema'/.test(C.MP_SQL)));
t('a project on the older seven-function schema is still fully playable',()=>{
  // whatever the dialect, every operation must resolve to something callable
  ALL_OPS.forEach(op=>{
    const c=C.rpcLegacyFor(op,'ABCDE','p1',{x:1});
    if(!c) throw new Error(op+' has no routine in the older schema');
    if(c.args.p_code!=='ABCDE') throw new Error(op+' does not pass the room code');
  });
  return true;});
t('the older schema still names the player for player-scoped calls',()=>{
  const c=C.rpcLegacyFor('putInput','ABCDE','p1',{lat:1});
  return ok(c.args.p_player==='p1'&&c.args.p_input.lat===1);});
t('every operation exists in both dialects',()=>{
  const missing=ALL_OPS.filter(op=>!C.rpcFor(op,'A')||!C.rpcLegacyFor(op,'A'));
  return eq(missing.length,0,'missing in one dialect: '+missing.join(', '));});
t('the two dialects use different routine names, or detection is pointless',()=>{
  const a=C.rpcDialect('rpc','getState','A').fn, b=C.rpcDialect('legacy','getState','A').fn;
  return ok(a!==b&&a==='fs_rpc');});
t('an unknown dialect falls back to the current schema, not to nothing',()=>
  eq(C.rpcDialect(undefined,'getState','A').fn,'fs_rpc'));
t('a missing routine is recognised however PostgREST phrases it',()=>
  ok(C.isMissingFn(404,'')&&C.isMissingFn(400,'{"code":"PGRST202"}')&&
     !C.isMissingFn(401,'')&&!C.isMissingFn(500,'boom')));
t('a stale schema cache is offered as an explanation, not just a missing install',()=>
  ok(/try again in a few seconds/.test(C.supaErrorText(404,''))));
t('a missing function is explained as unrun SQL, not as a 404',()=>
  ok(/SQL/.test(C.supaErrorText(404,''))&&/SQL/.test(C.supaErrorText(400,'{"code":"PGRST202"}'))));
t('a rejected key points at the service_role mix-up',()=>
  ok(/anon public/.test(C.supaErrorText(401,''))&&/anon public/.test(C.supaErrorText(403,''))));
t('a plausible project and key are accepted',()=>ok(C.validMp(MP)));
t('an http URL or a stub key is refused',()=>
  ok(!C.validMp({url:'http://abc.supabase.co',key:MP.key})&&
     !C.validMp({url:'https://abc.supabase.co',key:'short'})&&
     !C.validMp(null)&&!C.validMp({})));
t('the REST endpoint is accepted as the project URL',()=>{
  // the dashboard shows this one more prominently than the bare project URL
  const mp={url:'https://abc.supabase.co/rest/v1/',key:MP.key};
  return ok(C.validMp(mp)&&
    C.supaRequest(mp,'rpc/fs_rpc').url==='https://abc.supabase.co/rest/v1/rpc/fs_rpc');});
t('any of the other API paths are trimmed off too',()=>
  ok(C.normaliseMpUrl('https://a.supabase.co/auth/v1')==='https://a.supabase.co'&&
     C.normaliseMpUrl('https://a.supabase.co/storage/v1/')==='https://a.supabase.co'&&
     C.normaliseMpUrl('https://a.supabase.co/functions/v2')==='https://a.supabase.co'));
t('surrounding whitespace from a sloppy copy is forgiven',()=>
  eq(C.normaliseMpUrl('  https://a.supabase.co/rest/v1/  '),'https://a.supabase.co'));
t('a tidy project URL is left exactly as it is',()=>
  eq(C.normaliseMpUrl('https://a.supabase.co'),'https://a.supabase.co'));
t('a join link built from a REST endpoint still connects',()=>{
  const link=C.buildJoinLink('https://x.io/','ABCDE',{url:'https://a.supabase.co/rest/v1/',key:MP.key});
  return eq(C.parseHash(link).mp.url,'https://a.supabase.co');});
t('the built-in connection, if there is one, is usable',()=>{
  // an unusable MP_DEFAULT would ship a page that looks connected and is not
  const d=C.MP_DEFAULT;
  if(!d||!(d.url||d.key)) return true;                       // left blank on purpose
  if(!C.validMp(d)) throw new Error('MP_DEFAULT is filled in but not valid');
  if(/service_role/.test(d.key)) throw new Error('MP_DEFAULT holds a service_role key');
  const role=JSON.parse(Buffer.from(d.key.split('.')[1],'base64').toString()).role;
  return eq(role,'anon','baked-in key role:');});

t('a blank built-in connection is not mistaken for a real one',()=>
  ok(!C.validMp({url:'',key:''})));

/* ---- join links ---- */
t('a join link carries the room and the connection',()=>{
  const link=C.buildJoinLink('https://me.github.io/fs/','K7P2Q',MP);
  const h=C.parseHash(link.slice(link.indexOf('#')));
  return ok(h.code==='K7P2Q'&&h.mp.url===MP.url&&h.mp.key===MP.key);});
t('an old hash on the link is replaced, not appended',()=>
  eq(C.buildJoinLink('https://me.github.io/fs/#room=OLD','NEW',null),
     'https://me.github.io/fs/#room=NEW'));
t('a link with no connection details is still a valid invite',()=>{
  const h=C.parseHash(C.buildJoinLink('https://x.io/','ABCDE',null));
  return ok(h.code==='ABCDE'&&h.mp===null);});
t('a lowercase code typed into a link still finds the room',()=>
  eq(C.parseHash('#room=k7p2q').code,'K7P2Q'));
t('a garbled hash is ignored rather than crashing the boot',()=>{
  const h=C.parseHash('#mp=notaconfig&room=');
  return ok(h.code===null&&h.mp===null);});
t('an empty hash means a normal cold start',()=>{
  const h=C.parseHash('');
  return ok(h.code===null&&h.mp===null);});
t('connection details survive characters that need escaping',()=>{
  const mp={url:'https://a-b.supabase.co',key:'ab+/=cd'.repeat(6)};
  return eq(C.decodeMpConfig(C.encodeMpConfig(mp)).key,mp.key);});

console.log('\nFALSE SAFE — core harness');
console.log('─'.repeat(38));
failures.forEach(f=>console.log('  FAIL  '+f));
console.log(`  ${pass}/${pass+fail} passing`);
process.exit(fail?1:0);
