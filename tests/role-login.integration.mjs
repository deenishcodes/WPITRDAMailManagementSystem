import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base=process.env.WPITRDA_TEST_URL || 'http://localhost:5173';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Run these checks against a local preview.');
const details=fs.readFileSync(process.argv[2] || process.env.WPITRDA_TEST_CREDENTIALS,'utf8');
const accounts=details.trim().startsWith('[')?JSON.parse(details):[...details.matchAll(/^\| ([^ ]+@wpitrda.lk) \| ([^ ]+) \| (\/[^ ]+) \|$/gm)].map(([,email,password,home])=>({email,password,home,role:home==='/authority'?'super_authority':home.slice(1)}));
async function request(url,jar,body,method){const r=await fetch(base+url,{method:method||(body?'POST':'GET'),redirect:'manual',headers:{cookie:jar,origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return{r,data};}
assert(accounts.length >= 5, 'Supply all four roles and the second HOD for login tests');
const platform=await request('/signin-with-chatgpt?return_to=/login','');
const platformCookie=platform.r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert(platformCookie,'Platform preview sign-in cookie missing');
for(const url of ['/api/desk','/api/peon','/api/scan','/api/correspondence'])assert.equal((await request(url,platformCookie)).r.status,401,url+' must require role login');
for(const account of accounts){
 const login=await request('/api/auth/session',platformCookie,{email:account.email,password:account.password,role:'super_authority'});
 assert.equal(login.r.status,200,JSON.stringify(login.data));assert.equal(login.data.user.role,account.role);assert.equal(login.data.redirect,account.home);
 const cookie=login.r.headers.getSetCookie()[0];assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));
 const jar=platformCookie+'; '+cookie.split(';')[0];account.jar=jar;
 const self=await request('/api/auth/session',jar);assert.equal(self.data.user.role,account.role);
 const desk=await request('/api/desk',jar);assert.equal(desk.r.status,200,JSON.stringify(desk.data));assert.equal(desk.data.actor.accountEmail,account.email);
 for(const other of accounts){const page=await request(other.home,jar);if(other.home===account.home)assert.equal(page.r.status,200,account.home+String(page.data).slice(0,80));else {assert([303,307,308].includes(page.r.status),`${account.role} -> ${other.home}: ${page.r.status}`);assert.equal(page.r.headers.get('location'),account.home);}}
 for(const [route,role] of [['peon','peon'],['hod','hod'],['officer','officer'],['admin','super_authority']]){const page=await request('/correspondence/'+route,jar);assert.equal(page.r.status,307,account.role+' -> corr '+route);assert.equal(page.r.headers.get('location'),account.home);}
 const corr=await request('/api/correspondence',jar);assert.equal(corr.r.status,410,'Parallel workflow is retired');
 if(account.role!=='peon'){
  assert.equal((await request('/api/peon',jar)).r.status,403);
  assert.equal((await request('/api/peon/scan?id=fake',jar)).r.status,403);
  assert.equal((await request('/api/desk',jar,{type:'register',subject:'DENIED',sender:'QA',received:new Date().toISOString()})).r.status,400);
  assert.equal((await request('/api/correspondence',jar,{type:'letter.register',subject:'DENIED',senderName:'QA',referenceNumber:'DENIED'})).r.status,410);
 }
 if(account.role!=='hod')assert.equal((await request('/api/correspondence',jar,{type:'letter.assign',letterId:'fake',officerId:'fake'})).r.status,410);
 if(account.role!=='super_authority')assert.equal((await request('/api/correspondence',jar,{type:'office.create',name:'DENIED'})).r.status,410);
 const bad=await request('/api/auth/session',platformCookie,{email:account.email,password:'wrong-password'});assert.equal(bad.r.status,401);
 const logout=await request('/api/auth/session',jar,undefined,'DELETE');assert.equal(logout.r.status,200);
 assert.equal((await request('/api/desk',jar)).r.status,401,'Logged-out token must not be reusable');
 console.log(`PASS ${account.email}: login, 8 route guards, APIs, wrong password, logout/replay`);
}
assert.equal((await request('/api/auth/session',platformCookie,{email:'unknown@wpitrda.lk',password:'anything'})).r.status,401);
assert.equal((await request('/api/desk',platformCookie+'; wpitrda_session='+'a'.repeat(64))).r.status,401);
assert.equal((await request('/api/desk',platformCookie+'; lsf_peon_session='+'a'.repeat(64))).r.status,401);
console.log('PASS anonymous/platform-only, unknown account, forged token, obsolete PEON cookie');

// Expire only this test's session in the local database; no correspondence changes.
const expiryLogin=await request('/api/auth/session',platformCookie,accounts[0]);
assert.equal(expiryLogin.r.status,200);
const expiryCookie=expiryLogin.r.headers.getSetCookie()[0].split(';')[0];
const tokenHash=createHash('sha256').update(expiryCookie.split('=')[1]).digest('hex');
execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',`UPDATE role_sessions SET expires=0 WHERE token='${tokenHash}'`],{stdio:'pipe'});
assert.equal((await request('/api/auth/session',platformCookie+'; '+expiryCookie)).r.status,401);
assert.equal((await request('/api/desk',platformCookie+'; '+expiryCookie)).r.status,401);
console.log('PASS expired sessions are rejected by both session and correspondence APIs');
