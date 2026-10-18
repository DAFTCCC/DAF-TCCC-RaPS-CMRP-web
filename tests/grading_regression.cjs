'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');

function harness(id='NDC'){
 const clock={wall:1000000,mono:0},alerts=[],classifications=[];
 const context={window:{},RUNTIME_ID:'this-runtime',now:()=>clock.wall,monoNow:()=>clock.mono,
  alert:m=>alerts.push(m),confirm:()=>true,prompt:()=> 'Synthetic invalid timing',
  saveDb:()=>{},renderTimers:()=>{},renderCriteria:()=>{},renderEvalKpis:()=>{},
  beginFailureClassification:(...args)=>classifications.push(args)};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../skills.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../raps-skills.js'),'utf8'),context);
 const skill=context.window.FIELDREADY_SKILLS[id];
 const ev={ratings:{},failureDetails:{},timers:{},stopwatch:{completed:true,elapsedMs:60000}};
 skill.sections.flatMap(sec=>sec.items).forEach(i=>ev.ratings[i.id]='pass');
 Object.assign(context,{getEval:()=>ev,skill:()=>skill,eventClosed:()=>false,allItems:s=>s.sections.flatMap(sec=>sec.items)});
 // Execute the actual production functions with only DOM/storage side effects stubbed.
 vm.runInContext(app.slice(app.indexOf('function blankTimerInstance'),app.indexOf('function legacyCmcId')),context);
 vm.runInContext(app.slice(app.indexOf('function timerValidity'),app.indexOf('function timerLiveLabel')),context);
 vm.runInContext(app.slice(app.indexOf('function scoring'),app.indexOf('function renderHome')),context);
 vm.runInContext(app.slice(app.indexOf('function clinicalTimerExport'),app.indexOf('function eventClosed')),context);
 return {context,skill,ev,alerts,classifications,advance:ms=>{clock.wall+=ms;clock.mono+=ms;}};
}

for(const [duration,result] of [[4999,'notmet'],[5000,'met'],[10000,'met'],[10001,'notmet']]){
 test(`NDC 5–10 second standard at ${duration} ms is ${result}`,()=>{
  const h=harness();h.context.timerAction('NDC-HOLD','start');h.advance(duration);h.context.timerAction('NDC-HOLD','stop');
  const x=h.ev.timers['NDC-HOLD'].instances[0];
  assert.equal(x.finalDurationMs,duration);assert.equal(x.result,result);
  assert.equal(h.classifications.length,result==='notmet'?1:0);
 });
}

for(const [mode,expected] of [['wall',15000],['active',9000],['continuous',5000]]){
 test(`${mode} grading clock handles tactical pauses using its source rule`,()=>{
  const h=harness();const d=h.skill.timers[0];d.gradingClock=mode;d.continuousRequired=mode==='continuous';d.maxMs=20000;
  h.context.timerAction(d.id,'start');h.advance(4000);h.context.timerAction(d.id,'pause');h.advance(6000);
  h.context.timerAction(d.id,'start');h.advance(5000);h.context.timerAction(d.id,'stop');
  const x=h.ev.timers[d.id].instances[0];assert.equal(x.finalDurationMs,expected);assert.equal(x.tacticalPauseMs,6000);
 });
}

test('an administrative hold is excluded from the wall grading clock',()=>{
 const h=harness();const d=h.skill.timers[0];d.gradingClock='wall';
 h.context.timerAction(d.id,'start');h.advance(4000);h.context.timerAction(d.id,'admin');h.advance(20000);
 h.context.timerAction(d.id,'start');h.advance(5000);h.context.timerAction(d.id,'stop');
 assert.equal(h.ev.timers[d.id].instances[0].finalDurationMs,9000);
 assert.equal(h.ev.timers[d.id].instances[0].adminPauseMs,20000);
});

test('a reset cannot hide running or paused instances; void preserves its reason',()=>{
 const h=harness();const d=h.skill.timers[0];
 h.context.timerAction(d.id,'start');h.advance(1000);h.context.timerAction(d.id,'reset');
 assert.equal(h.ev.timers[d.id].instances.length,1);assert.match(h.alerts.at(-1),/Stop or void/);
 h.context.timerAction(d.id,'pause');h.context.timerAction(d.id,'reset');assert.equal(h.ev.timers[d.id].instances.length,1);
 h.context.timerAction(d.id,'void');h.context.timerAction(d.id,'reset');
 assert.equal(h.ev.timers[d.id].instances.length,2);
 assert.equal(h.ev.timers[d.id].instances[0].voidReason,'Synthetic invalid timing');
});

test('legacy hidden unfinished timers are surfaced and prevent finalization even when the criterion is FAIL',()=>{
 const h=harness();const d=h.skill.timers[0];
 h.ev.ratings[d.linkedItemId]='fail';h.ev.failureDetails[d.linkedItemId]={mode:'timing-sequence',contributor:'system-context'};
 const old={...h.context.blankTimerInstance(d.id,0),wallStart:900000,runtimeId:'prior-runtime',running:false,paused:false};
 h.ev.timers[d.id]={instances:[old,h.context.blankTimerInstance(d.id,1)],currentIndex:1};
 assert.equal(h.context.currentTimerInstance(d.id).index,1);
 assert.equal(h.context.timerNeedsRecovery(h.context.currentTimerInstance(d.id)),true);
 assert.equal(h.context.finalizable().ok,false);
 assert.equal(h.context.finalizable().activeTimerDefs.length,1);
});

test('a high percentage cannot override a failed critical criterion or unresolved NT/N/O',()=>{
 const h=harness('NPA');const critical=h.skill.sections.flatMap(s=>s.items).find(i=>i.critical);
 h.ev.ratings[critical.id]='fail';h.ev.failureDetails[critical.id]={mode:'incorrect-technique',contributor:'psychomotor'};
 assert.ok(h.context.scoring().percent>.9);assert.equal(h.context.scoring().result,'FAIL');
 for(const rating of ['nt','no']){h.ev.ratings[critical.id]=rating;assert.equal(h.context.finalizable().ok,false);}
});

test('missing classification and missing/still-running assessment timing block finalization',()=>{
 const h=harness('NPA');const item=h.skill.sections[0].items[0];h.ev.ratings[item.id]='fail';
 assert.equal(h.context.finalizable().ok,false);
 h.ev.ratings[item.id]='pass';h.ev.stopwatch.completed=false;assert.equal(h.context.finalizable().ok,false);
 h.ev.stopwatch.completed=true;h.ev.stopwatch.running=true;assert.equal(h.context.finalizable().ok,false);
 h.ev.stopwatch.running=false;h.ev.stopwatch.recoveryRequired=true;assert.equal(h.context.finalizable().ok,false);
});

test('PASS on a timed criterion requires a completed valid timer; a later failed repetition remains visible',()=>{
 const h=harness();const d=h.skill.timers[0];assert.equal(h.context.finalizable().ok,false);
 h.context.timerAction(d.id,'start');h.advance(5000);h.context.timerAction(d.id,'stop');assert.equal(h.context.finalizable().ok,true);
 h.context.timerAction(d.id,'reset');h.context.timerAction(d.id,'start');h.advance(11000);h.context.timerAction(d.id,'stop');
 assert.equal(h.context.timerAggregateStatus(d),'notmet');assert.equal(h.context.finalizable().ok,false);
});

test('criterion exports preserve raw millisecond timing and history without mutating the evaluation',()=>{
 const h=harness();const d=h.skill.timers[0];
 h.context.timerAction(d.id,'start');h.advance(10001);h.context.timerAction(d.id,'stop');
 const before=JSON.stringify(h.ev);
 const exported=JSON.parse(h.context.clinicalTimerExport(h.ev,h.skill,d.linkedItemId));
 assert.equal(exported[0].max_ms,10000);assert.equal(exported[0].instances[0].finalDurationMs,10001);
 assert.equal(JSON.stringify(h.ev),before);
 assert.deepEqual(JSON.parse(h.context.clinicalTimerExport(h.ev,h.skill,'no-linked-clock')),[]);
});
