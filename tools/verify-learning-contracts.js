/* One automatic release gate. It runs real browser checks, not silent skips. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].filter(Boolean);
const chrome=candidates.find(p=>fs.existsSync(p));
if(!chrome){console.error('Release blocked: Chrome/Chromium/Edge is required for browser verification. Set CHROME_BIN.');process.exit(1);}
const probe=cp.spawnSync(chrome,['--version'],{encoding:'utf8',timeout:10000});
if(probe.status!==0){console.error('Release blocked: browser executable failed its startup check.');process.exit(1);}
const tests=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.js')).sort();
const env={...process.env,CHROME_BIN:chrome};
let next=0;
const results=[];
function run(file){return new Promise(resolve=>{
  const child=cp.spawn(process.execPath,[path.join(root,'tests',file)],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='',timedOut=false;
  child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180000);
  child.on('error',e=>{output+='\n'+e.message;});
  child.on('close',code=>{clearTimeout(timer);const passed=code===0&&!timedOut;const result={test:'tests/'+file,passed,exitCode:code,timedOut,output};results.push(result);console.log((passed?'PASS ':'FAIL ')+result.test);if(!passed)console.error(output);resolve();});
});}
async function worker(){while(next<tests.length){const file=tests[next++];await run(file);}}
(async()=>{
  console.log('Verifying '+tests.length+' test files with '+probe.stdout.trim());
  await Promise.all([worker(),worker()]);
  const failed=results.filter(r=>!r.passed);
  if(process.env.LEARNING_TEST_REPORT)fs.writeFileSync(process.env.LEARNING_TEST_REPORT,JSON.stringify(results,null,2));
  console.log(JSON.stringify({files:results.length,passed:results.length-failed.length,failed:failed.map(r=>r.test)}));
  if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
