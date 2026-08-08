#!/usr/bin/env node
/* Inlines src/game.js into src/shell.html and writes index.html at the repo root.
   GitHub Pages serves index.html directly — no bundler, no dependencies. */
const fs=require('fs'), path=require('path');
const root=__dirname;
const shell=fs.readFileSync(path.join(root,'src','shell.html'),'utf8');
const js=fs.readFileSync(path.join(root,'src','game.js'),'utf8');

if(shell.indexOf('<script>\n</script>')<0){
  console.error('build: src/shell.html must contain an empty <script>\\n</script> block');
  process.exit(1);
}
// NOTE: the replacement must be a function. A string replacement would treat $$, $& and $'
// inside game.js as special patterns and silently corrupt the output ($$ collapses to $,
// which is exactly how the selector helpers got clobbered once).
const out=shell.replace('<script>\n</script>',function(){ return '<script>\n'+js+'\n</script>'; });
fs.writeFileSync(path.join(root,'index.html'),out);
console.log('built index.html — '+out.split('\n').length+' lines, '+(out.length/1024).toFixed(0)+' KB');

// Also drop the room schema next to it as a plain .sql file. Copying seventy lines out of a
// phone screen is the step people actually get stuck on; a real file can be opened on a laptop,
// and GitHub puts its own copy button on it. Generated from MP_SQL so it cannot drift.
const vm=require('vm');
const a=js.indexOf('CORE_START'), b=js.indexOf('CORE_END');
const core=js.slice(js.indexOf('*/',a)+2, js.lastIndexOf('/*',b));
const sandbox={module:{exports:{}},console};
sandbox.exports=sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(core,sandbox,{filename:'core.js'});
const sql=sandbox.module.exports.MP_SQL;
if(!sql){ console.error('build: could not read MP_SQL out of the CORE block'); process.exit(1); }
fs.writeFileSync(path.join(root,'supabase.sql'),sql+'\n');
console.log('built supabase.sql — '+sql.split('\n').length+' lines');
