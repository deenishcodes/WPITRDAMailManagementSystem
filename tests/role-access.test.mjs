import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, change, DJANGO_GROUP_PERMISSIONS } from '../lib/model.ts';

test('operational capabilities do not leak into other roles', () => {
  const state = seed();
  const peon=state.people.find(p=>p.id==='COL-p'),hod=state.people.find(p=>p.id==='COL-h1'),officer=state.people.find(p=>p.id==='COL-o1'),authority=state.people.find(p=>p.id==='gov');
  const form={type:'register',subject:'Access test',sender:'QA',received:new Date().toISOString()};
  const {id}=change(state,peon,form);
  for(const actor of [hod,officer,authority]) {
    assert.throws(()=>change(state,actor,form));
    assert.throws(()=>change(state,actor,{type:'handover-hod',id,recipient:'QA'}));
    assert.throws(()=>change(state,actor,{type:'edit',id,subject:'Changed',sender:'QA',received:new Date().toISOString()}));
  }
  for(const actor of [peon,officer,authority]) {
    assert.throws(()=>change(state,actor,{type:'assign',id,person:officer.id,note:'QA'}));
    assert.throws(()=>change(state,actor,{type:'forward',id,office:'KOT'}));
  }
  change(state,hod,{type:'assign',id,person:officer.id,note:'Review'});
  for(const actor of [peon,authority])assert.throws(()=>change(state,actor,{type:'action',id,status:'In progress',note:'QA'}));
  change(state,officer,{type:'action',id,status:'In progress',note:'Working'});
  for(const actor of [peon,hod,officer])assert.throws(()=>change(state,actor,{type:'person',name:'Test',email:'test@example.test',office:'COL',role:'Officer'}));
  assert.deepEqual(DJANGO_GROUP_PERMISSIONS.Government,['correspondence.view_all','correspondence.view_secret_contents','accounts.manage']);
});
