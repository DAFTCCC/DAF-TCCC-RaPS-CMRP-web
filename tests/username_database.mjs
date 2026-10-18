// Isolated real PostgreSQL engine (PGlite); never connects to the NUC.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.FIELDREADY_TEST_PGLITE||'/tmp/fieldready-sql-test/node_modules/@electric-sql/pglite/dist/index.js').href);

test('username migration, permissions, uniqueness and durable throttling in PostgreSQL',async()=>{
 const db=new PGlite();
 const owner='11111111-1111-1111-1111-111111111111',admin='22222222-2222-2222-2222-222222222222',inactive='33333333-3333-3333-3333-333333333333';
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema auth;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table public.fr_profiles(user_id uuid primary key references auth.users(id),email text,active boolean,role text,updated_at timestamptz);
   create function public.fr_is_enterprise() returns boolean language sql security definer as $$select exists(select 1 from public.fr_profiles where user_id=auth.uid() and active and role='enterprise')$$;
   insert into auth.users values ('${owner}','owner@example.invalid'),('${admin}','admin@example.invalid'),('${inactive}','inactive@example.invalid');
   insert into public.fr_profiles(user_id,active,role) values ('${owner}',true,'evaluator'),('${admin}',true,'enterprise'),('${inactive}',false,'evaluator');
  `);
  const migration=await readFile(new URL('../supabase/013_username_login.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration); // Safe reapplication preserves assigned names.
  assert.equal((await db.query('select distinct username from public.fr_profiles')).rows.length,3);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
  assert.equal((await db.query(`select public.fr_set_username('${owner}',' Nurse.One ') as username`)).rows[0].username,'nurse.one');
  await assert.rejects(db.query(`select public.fr_set_username('${admin}','stolen')`),/owner or Enterprise/);
  await assert.rejects(db.query(`select public.fr_set_username('${owner}','bad@name')`),/3–48/);
  await assert.rejects(db.query(`select * from public.fr_login_limits`),/permission denied/);
  await assert.rejects(db.query(`select public.fr_resolve_login('nurse.one')`),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${admin}';`);
  await assert.rejects(db.query(`select public.fr_set_username('${admin}','NURSE.ONE')`),/unavailable/);
  await db.query(`select public.fr_set_username('${owner}','nurse.renamed')`);
  await db.exec(`set request.jwt.claim.sub='${inactive}';`);
  await assert.rejects(db.query(`select public.fr_set_username('${inactive}','reactivated')`),/owner or Enterprise/);
  await db.exec('reset role;set role anon;');
  await assert.rejects(db.query(`select public.fr_resolve_login('nurse.renamed')`),/permission denied/);
  await assert.rejects(db.query(`select public.fr_set_username('${owner}','anonymous')`),/permission denied/);
  await db.exec('reset role;set role service_role;');
  const resolve=async name=>(await db.query('select public.fr_resolve_login($1) as result',[name])).rows[0].result;
  assert.deepEqual(await resolve('Nurse.Renamed'),{email:'owner@example.invalid'});
  assert.deepEqual(await resolve('unknown'),{email:null});
  assert.deepEqual(await resolve('fr.'+inactive.replaceAll('-','')),{email:null});
  for(let i=0;i<19;i++)assert.equal((await resolve('nurse.renamed')).limited,undefined);
  assert.deepEqual(await resolve('nurse.renamed'),{limited:true});
  await db.exec('reset role;');
  await db.exec(`update public.fr_login_limits set reset_at=now()-interval '1 second';set role service_role;`);
  assert.equal((await resolve('nurse.renamed')).email,'owner@example.invalid');
  for(let i=0;i<119;i++)await resolve('other-'+i);
  assert.deepEqual(await resolve('global-throttled'),{limited:true});
  await db.exec('reset role;');
  const next='44444444-4444-4444-4444-444444444444';
  await db.exec(`insert into auth.users values('${next}','new@example.invalid');insert into public.fr_profiles(user_id,active,role) values('${next}',true,'evaluator');`);
  assert.equal((await db.query(`select username from public.fr_profiles where user_id='${next}'`)).rows[0].username,'fr.'+next.replaceAll('-',''));
 }finally{await db.close();}
});
