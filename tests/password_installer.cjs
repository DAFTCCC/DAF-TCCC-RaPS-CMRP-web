'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function run(mode){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fieldready-installer-'));
 try{
  const log=path.join(dir,'calls.jsonl');
  fs.writeFileSync(path.join(dir,'docker'),`#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.MOCK_DOCKER_LOG,JSON.stringify(a)+'\\n');
const s=a.join(' '),mode=process.env.MOCK_DOCKER_MODE;
if(a[0]==='inspect')console.log(mode==='mount'?'':'yes');
else if(s.includes('information_schema.columns'))console.log(mode==='migration'?'f':'t');
else if(s.includes('pg_dump')){if(mode==='dump')process.exit(1);process.stdout.write('synthetic protected backup');}
else if(s.includes('pg_restore')){if(mode==='restore')process.exit(1);}
else if(a[0]==='cp'&&a[1].startsWith('fieldready-edge-functions:'))fs.writeFileSync(a[2],'old function');
`);fs.chmodSync(path.join(dir,'docker'),0o755);
  const result=spawnSync('bash',['deploy/fieldready-temporary-password-update.sh'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,FIELDREADY_BACKUP_DIR:path.join(dir,'backups'),MOCK_DOCKER_LOG:log,MOCK_DOCKER_MODE:mode},encoding:'utf8'});
  const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  return {result,calls};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('installer refuses missing persistent mount or username prerequisite before any mutation',()=>{
 for(const mode of ['mount','migration']){
  const {result,calls}=run(mode);assert.notEqual(result.status,0);
  assert(!calls.some(a=>a.includes('pg_dump')||a[0]==='cp'||a[0]==='restart'||a.join(' ').includes('mkdir')));
 }
});
test('installer refuses failed or invalid backup before applying SQL or replacing runtime code',()=>{
 for(const mode of ['dump','restore']){
  const {result,calls}=run(mode);assert.notEqual(result.status,0);
  assert(!calls.some(a=>a[0]==='cp'||a[0]==='restart'||(a.includes('psql')&&!a.includes('-Atc'))));
 }
});
test('installer backs up before migration and touches only dedicated FieldReady containers',()=>{
 const {result,calls}=run('success');assert.equal(result.status,0,result.stderr);
 assert(calls.every(a=>!a.includes('supabase-db')&&!a.includes('supabase-edge-functions')));
 const verified=calls.findIndex(a=>a.includes('pg_restore'));
 const sql=calls.findIndex(a=>a.includes('psql')&&!a.includes('-Atc'));
 const install=calls.findIndex(a=>a[0]==='cp'&&a[1].endsWith('/supabase/functions/fieldready-account-admin/index.ts'));
 assert(verified>=0&&sql>verified&&install>sql);
 assert.deepEqual(calls.at(-1),['restart','fieldready-edge-functions']);
});
