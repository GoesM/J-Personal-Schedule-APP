import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeScale} from '../src/time-scale.mjs';
test('compress only union gaps, never any occupied minute',()=>{
  const items=[{start:'09:00',end:'10:00'},{start:'12:00',end:'16:00'}];
  const scale=timeScale(items);
  assert.equal(scale.y('12:00')-scale.y('10:00'),6);
  assert.equal((scale.y('16:00')-scale.y('12:00'))/(scale.y('10:00')-scale.y('09:00')),4);
  const shared=timeScale([...items,{start:'10:30',end:'11:30'}]);
  assert.equal(shared.y('12:00')-shared.y('10:00'),120);

});
test('overlaps and events outside default hours preserve exact lengths',()=>{
  const items=[{start:'06:00',end:'10:00'},{start:'09:00',end:'13:00'},{start:'22:30',end:'23:00'}];
  const scale=timeScale(items);
  for(const i of items) assert.equal(scale.y(i.end)-scale.y(i.start),i.start==='22:30'?54:432);
});
