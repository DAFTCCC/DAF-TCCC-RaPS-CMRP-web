'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../skills.js'),'utf8'),context);
const original=context.window.FIELDREADY_SKILLS;
const source=fs.readFileSync(require.resolve('../raps-skills.js'),'utf8');
vm.runInNewContext(source,context);
const skills=context.window.FIELDREADY_SKILLS;
test('imported RaPS source matches the pinned upstream tier definitions',()=>{
 const raw=JSON.parse(source.slice(source.indexOf('const tiers=')+12,source.indexOf(';\nfunction clock')));
 const sha=crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 assert.equal(sha,'5a6344d6cdf344b34f80e56eb722e2d845b459eaca49910c22e22e742a45cf1e');
 for(const tier of Object.values(raw)){
  const imported=skills[tier.shortName];
  assert.equal(JSON.stringify(imported.sections),JSON.stringify(tier.sections));
  assert.equal(imported.threshold,.75);
  assert.equal(imported.stopwatch.maxMs,1800000);
  assert.equal(imported.stopwatch.requiredForPass,true);
  for(const timer of tier.timers.filter(t=>t.timerKind!=='global')){
   const actual=imported.timers.find(t=>t.id===timer.id);
   for(const key of Object.keys(timer))assert.equal(actual[key],timer[key]);
   if(timer.mode==='max')assert.equal(actual.maxMs,timer.seconds*1000);
   if(timer.mode==='min')assert.equal(actual.minMs,timer.seconds*1000);
   if(timer.mode==='range'){assert.equal(actual.minMs,timer.minSeconds*1000);assert.equal(actual.maxMs,timer.maxSeconds*1000);}
  }
 }
});
for(const [key,count] of [['ASM',33],['CLS',71],['CPP',124]])test(key+' retains every criterion and timer link',()=>{
 const skill=skills[key],ids=skill.sections.flatMap(s=>s.items.map(i=>i.id));
 assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);
 assert.ok(skill.sections.flatMap(s=>s.items).some(i=>i.provenance==='daf'));
 for(const timer of skill.timers)assert.ok(ids.includes(timer.linkedItemId),timer.id);
});
test('existing study skills remain unchanged by the RaPS import',()=>{
 for(const key of Object.keys(original))assert.equal(skills[key],original[key]);
});
