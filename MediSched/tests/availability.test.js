import test from 'node:test';
import assert from 'node:assert/strict';
import {availableOptions} from '../availability.js';
const row=time=>({start_at:`2090-10-09T${time}:00+08:00`});
test('slots preserve minutes and show a complete one-hour visit in Manila time',()=>{
  assert.deepEqual(availableOptions([row('13:00'),row('09:45')],'2090-10-09',0).map(({value,label})=>({value,label})),[
    {value:'09:45',label:'9:45 AM – 10:45 AM'},{value:'13:00',label:'1:00 PM – 2:00 PM'}
  ]);
});
test('expired slots disappear at the exact start boundary without losing leading zeros',()=>{
  const options=availableOptions([row('08:00'),row('08:15')],'2090-10-09',Date.parse(row('08:00').start_at));
  assert.equal(options.length,1);assert.equal(options[0].value,'08:15');
});
test('malformed, duplicate, off-grid or wrong-day availability fails closed',()=>{
  for(const rows of [null,[{}],[{start_at:'bad'}],[row('09:45'),row('09:45')],[row('09:46')],[{start_at:'2090-10-10T09:45:00+08:00'}],Array(97).fill(row('09:45'))])assert.throws(()=>availableOptions(rows,'2090-10-09',0));
});
