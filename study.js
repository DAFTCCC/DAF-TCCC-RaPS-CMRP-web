(() => {
'use strict';
const arms=['Control','Frequency-Based','Deliberate Practice'];
const phases={unclassified:'Unclassified',baseline:'Post-training baseline',pre:'Before reinforcement',post:'After reinforcement',retest:'Retest',practice:'Practice'};
const pid=value=>String(value||'').trim().toUpperCase();
function enrollment(rows){
 const entries=rows.map(r=>r.p.enrollment).filter(Boolean);
 if(!entries.length)return {value:null,issue:'Enrollment not recorded'};
 const first=entries[0];
 if(!first.id||!arms.includes(first.arm)||!validDate(first.trainingDate)||!validDate(first.enrolledDate))return {value:null,issue:'Enrollment incomplete'};
 if(entries.some(x=>['id','arm','trainingDate','enrolledDate'].some(k=>x[k]!==first[k])))return {value:null,issue:'Conflicting enrollment records'};
 if(rows.some(r=>r.e.studyArm!==first.arm))return {value:null,issue:'Event arm conflicts with enrollment'};
 return {value:first,issue:null};
}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function select(rows,timepoint,phase){
 const candidates=rows.filter(r=>r.e.timepoint===timepoint&&r.ev?.finalizedAt&&r.ev.assessment?.phase===phase&&validDate(r.ev.assessment?.date));
 if(candidates.length!==1)return {row:null,issue:candidates.length?'Multiple formal measurements — review required':'No classified finalized measurement'};
 return {row:candidates[0],issue:null};
}
function pair(rows,timepoint,phase,score){
 const enrolled=enrollment(rows);
 if(enrolled.issue)return {issue:enrolled.issue};
 const base=select(rows,'baseline','baseline'),follow=select(rows,timepoint,phase);
 if(base.issue||follow.issue)return {issue:base.issue||follow.issue};
 const b=base.row,f=follow.row;
 if(!b.ev.skillSource||!f.ev.skillSource||!b.ev.scenarioVersion||!f.ev.scenarioVersion)return {issue:'Source or scenario version not recorded'};
 if(b.ev.skillSource!==f.ev.skillSource||b.ev.scenarioVersion!==f.ev.scenarioVersion)return {issue:'Source or scenario version differs'};
 const baseDate=b.ev.assessment.date,followDate=f.ev.assessment.date;
 if(baseDate<enrolled.value.trainingDate||followDate<baseDate)return {issue:'Assessment dates are out of order'};
 const tested=r=>Object.entries(r.ev.ratings||{}).filter(([,v])=>v==='pass'||v==='fail').map(([k])=>k).sort();
 if(JSON.stringify(tested(b))!==JSON.stringify(tested(f)))return {issue:'Scored criterion set differs (including NT exclusions)'};
 const bs=score(b),fs=score(f);
 if(!Number.isFinite(bs)||!Number.isFinite(fs))return {issue:'Score unavailable'};
 return {baseline:b,followup:f,delta:(fs-bs)*100,days:Math.round((Date.parse(followDate)-Date.parse(baseDate))/86400000),arm:enrolled.value.arm,issue:null};
}
function exposures(rows){
 const byId=new Map();
 rows.forEach(r=>(r.p.trainingExposures||[]).forEach(x=>{if(x.id&&!byId.has(x.id))byId.set(x.id,x);}));
 return [...byId.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
window.FieldReadyStudy=Object.freeze({arms,phases,pid,enrollment,validDate,select,pair,exposures});
})();
