'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../study.js'),'utf8'),context);
const S=context.window.FieldReadyStudy;
function row(timepoint,phase,score,date){return {e:{timepoint,studyArm:'Control',skillId:'TQ'},p:{enrollment:{id:'enrollment',arm:'Control',trainingDate:'2026-01-01',enrolledDate:'2025-12-31'}},ev:{id:phase,finalizedAt:1,skillSource:'source1',scenarioVersion:'1',assessment:{phase,date},ratings:{a:'pass'},score}};}
const base=()=>row('baseline','baseline',.9,'2026-01-01');
const pre=()=>row('3-month','pre',.7,'2026-04-01');
const post=()=>row('3-month','post',1,'2026-04-01');
const score=r=>r.ev.score;
test('before and after practice remain separate matched comparisons',()=>{
 const rows=[base(),pre(),post()];
 assert.ok(Math.abs(S.pair(rows,'3-month','pre',score).delta+20)<1e-8);
 assert.ok(Math.abs(S.pair(rows,'3-month','post',score).delta-10)<1e-8);
 assert.equal(S.pair(rows,'3-month','pre',score).days,90);
});
test('missing follow-up is excluded rather than scored zero',()=>assert.ok(S.pair([base()],'6-month','pre',score).issue));
test('duplicate formal records are ambiguous rather than replaced by latest',()=>assert.match(S.pair([base(),pre(),pre()],'3-month','pre',score).issue,/Multiple/));
test('retests and unclassified legacy measurements do not replace baseline',()=>{
 const retest=row('baseline','retest',1,'2026-01-02');
 assert.equal(S.select([base(),retest],'baseline','baseline').row.ev.score,.9);
 delete retest.ev.assessment;
 assert.equal(S.select([retest],'baseline','baseline').row,null);
});
test('conflicting enrollment and event arm are excluded',()=>{
 const f=pre();f.p.enrollment.arm='Deliberate Practice';
 assert.match(S.pair([base(),f],'3-month','pre',score).issue,/Conflicting/);
 const b=base();b.e.studyArm='Deliberate Practice';
 assert.match(S.pair([b,pre()],'3-month','pre',score).issue,/conflicts/);
});
test('source, scenario, scored criterion set, and chronology must match',()=>{
 for(const mutate of [r=>r.ev.skillSource='new',r=>r.ev.scenarioVersion='2',r=>r.ev.ratings.a='nt',r=>r.ev.assessment.date='2025-01-01']){
  const f=pre();mutate(f);assert.ok(S.pair([base(),f],'3-month','pre',score).issue);
 }
});
test('invalid dates and unfinished assessments are not selected',()=>{
 const f=pre();f.ev.assessment.date='2026-02-30';assert.equal(S.select([f],'3-month','pre').row,null);
 f.ev.assessment.date='2026-04-01';f.ev.finalizedAt=null;assert.equal(S.select([f],'3-month','pre').row,null);
 assert.equal(S.validDate('2026-02-30'),false);
});
test('exposure sessions are deduplicated by their own identity',()=>{
 const x={id:'one',date:'2026-03-31',repetitions:5};
 assert.equal(S.exposures([{p:{trainingExposures:[x]}},{p:{trainingExposures:[x]}}]).length,1);
});
