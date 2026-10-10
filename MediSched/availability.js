import {DURATION,manilaDateTime} from './domain.js';

function clock(time){
  const [hour,minute]=time.split(':').map(Number);
  return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`;
}

// Fail closed if the server response does not match this date/slot contract.
// The RPC supplies only start_at; no patient rows are needed in the browser.
export function availableOptions(rows,date,now=Date.now()){
  if(!Array.isArray(rows)||rows.length>96)throw Error('Invalid availability response.');
  const seen=new Set();
  return rows.map(row=>{
    if(typeof row?.start_at!=='string')throw Error('Invalid availability response.');
    const start=Date.parse(row.start_at),local=manilaDateTime(row.start_at);
    if(local.date!==date||start%900000!==0||seen.has(local.time))throw Error('Invalid availability response.');
    seen.add(local.time);
    const end=manilaDateTime(new Date(start+DURATION).toISOString());
    return {value:local.time,label:`${clock(local.time)} – ${clock(end.time)}${end.date!==date?' (next day)':''}`,start};
  }).filter(slot=>slot.start>now).sort((a,b)=>a.start-b.start);
}
