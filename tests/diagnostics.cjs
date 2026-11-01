// Beta diagnostics: scrubbing must never let study data through.
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../diagnostics.js');

test('scrub removes IDs, emails, tokens, quoted values and digit-bearing tokens',()=>{
  const s=D.scrub('Participant P-001 (SSgt Jones) uuid 3f2b1c4d-1111-2222-3333-444455556666 email jane.doe@us.af.mil token eyJhbGciOi.eyJzdWIiOi.sig "John Smith" score 87%');
  assert.doesNotMatch(s,/P-001|3f2b1c4d|jane|doe|af\.mil|eyJ|John|Smith|87/);
  assert.match(s,/:id/);assert.match(s,/:email/);assert.match(s,/:token/);
});

test('scrub removes Postgres key values',()=>{
  const s=D.scrub('duplicate key value violates unique constraint "fr_participants_event_id_participant_code_key" Key (event_id, participant_code)=(abc, ALPHA-SEVEN) already exists');
  assert.doesNotMatch(s,/ALPHA-SEVEN|abc\)/);
  assert.match(s,/=\(…\)/);
});

test('scrub keeps plain technical wording and caps length',()=>{
  assert.equal(D.scrub('Cannot read properties of undefined'),'Cannot read properties of undefined');
  assert.equal(D.scrub('x'.repeat(1000)).length,300);
});

test('cleanPath strips host, base path, IDs and query values',()=>{
  const p=D.cleanPath('https://raps-supabase.asuscomm.com/fieldready/rest/v1/fr_participants?id=eq.3f2b1c4d-1111-2222-3333-444455556666&server_revision=eq.7','https://raps-supabase.asuscomm.com/fieldready');
  assert.equal(p,'/rest/v1/fr_participants?id&server_revision');
  assert.equal(D.cleanPath('https://h/fieldready/rest/v1/rpc/fr_close_event','https://h/fieldready'),'/rest/v1/rpc/fr_close_event');
  assert.equal(D.cleanPath('https://h/x/P0012/y'),'/x/:n/y');
});

test('stackFrames keeps code locations only (Chrome and Firefox formats)',()=>{
  const f=D.stackFrames('TypeError: x\n    at renderEvent (https://daftccc.github.io/DAF-TCCC-RaPS-CMRP-web/app.js?v=4:643:12)\n    at HTMLButtonElement.<anonymous> (https://h/sync.js:41:3)\nfinalize@https://h/app.js:700:9');
  assert.deepEqual(f,['renderEvent app.js:643:12','HTMLButtonElement.<anonymous> sync.js:41:3','finalize app.js:700:9']);
});

test('rage detector fires once per burst on the same control',()=>{
  let t=0;const r=D.makeRageDetector(()=>t);
  const hits=[];for(let i=0;i<6;i++){t+=200;hits.push(r('button#finalizeBtn'));}
  assert.deepEqual(hits,[false,false,false,true,false,false]);
  t+=5000;assert.equal(r('button#finalizeBtn'),false);
});

test('rage detector ignores slow or alternating clicks',()=>{
  let t=0;const r=D.makeRageDetector(()=>t);
  for(let i=0;i<6;i++){t+=900;assert.equal(r('a'),false);}
  t=0;const r2=D.makeRageDetector(()=>t);
  for(let i=0;i<8;i++){t+=100;assert.equal(r2(i%2?'a':'b'),false);}
});

test('capQueue keeps the newest entries',()=>{
  assert.deepEqual(D.capQueue([1,2,3,4,5],3),[3,4,5]);
});

test('describeTarget uses ids/classes, never visible text',()=>{
  const el={tagName:'BUTTON',id:'',className:'btn primary extra',textContent:'P-001 John Smith',getAttribute:()=>null,
    parentElement:{tagName:'DIV',id:'rosterList',className:'',getAttribute:()=>null,parentElement:null}};
  const d=D.describeTarget(el);
  assert.equal(d,'div#rosterList>button.btn.primary');
  assert.doesNotMatch(d,/John|P-001/);
});
