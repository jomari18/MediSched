import test from 'node:test';import assert from 'node:assert/strict';
const {attendanceLabel,formatVisitRange}=await import('../attendance.js');
test('cancellation overrides attendance; missing historical outcome is explicit',()=>{assert.equal(attendanceLabel({status:'cancelled'},{state:'checked_in'}),'Cancelled');assert.equal(attendanceLabel({status:'active'},null),'Attendance not recorded');assert.equal(attendanceLabel({status:'active'},{state:'no_show'}),'No show')});
test('full visit range preserves quarter-hour minutes in Philippine time',()=>{const text=formatVisitRange({start_at:'2090-10-09T01:45:00Z',end_at:'2090-10-09T02:45:00Z'});assert.match(text,/9:45.*10:45/);assert.match(text,/Philippine time/)});
