/* Installs browser stubs BEFORE the page script runs.
   jsdom has no canvas, and newer versions omit getContext entirely rather than throwing,
   so this must be applied via beforeParse or boot() dies on the first draw. */
module.exports=function(w){
  const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?(()=>({width:20})):(()=>{})});
  w.HTMLCanvasElement.prototype.getContext=function(){return ctx;};
  w.requestAnimationFrame=function(){return 0;};
  w.AudioContext=function(){return{currentTime:0,destination:{},
    createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}),
    createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};};
  w.Image=class{set src(v){setTimeout(()=>this.onerror&&this.onerror(),1);}};
};
