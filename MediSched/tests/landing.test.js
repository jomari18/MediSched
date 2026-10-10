import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneAllowed,initializeLanding} from '../landing.js';
test('landing has no scene toolbar controls and freezes rendering outside pointer interaction',async t=>{
 const originals=new Map();const install=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true})};t.after(()=>{for(const [name,d] of originals){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name]}});
 const node=()=>({dataset:{},events:{},setAttribute(){},removeAttribute(){},append(){},replaceChildren(){},addEventListener(name,fn){this.events[name]=fn}});
 const nodes=Object.fromEntries(['sceneStage','sceneHost','sceneStatus'].map(id=>[id,node()]));let stops=0,plays=0;
 install('document',{getElementById:id=>nodes[id]||null,createElement:node,hidden:false,addEventListener(){}});install('window',{addEventListener(){}});install('navigator',{});install('matchMedia',()=>({matches:false,addEventListener(){}}));install('setTimeout',()=>1);install('clearTimeout',()=>{});
 class Application{async load(){}findObjectByName(){return null}dispose(){}stop(){stops++}play(){plays++}}
 initializeLanding({loadRuntime:async()=>({Application})});await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(stops,1);nodes.sceneStage.events.pointerenter();assert.equal(plays,1);nodes.sceneStage.events.pointerleave();assert.equal(stops,2);
});
test('decorative 3D respects reduced motion, phones, save-data, hidden tabs and pause',()=>{
  assert.equal(sceneAllowed(),true);
  for(const flag of ['reducedMotion','mobile','saveData','hidden','paused'])assert.equal(sceneAllowed({[flag]:true}),false);
});


test('timed-out pending scene is disposed immediately and after a late load',async t=>{
  const originals=new Map();
  const install=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
  t.after(()=>{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const node=()=>({dataset:{},children:[],setAttribute(){},removeAttribute(){},addEventListener(){},replaceChildren(){this.children=[]},append(child){this.children.push(child)}});
  const nodes=Object.fromEntries(['sceneStage','sceneHost','sceneStatus','sceneToggle'].map(id=>[id,node()]));
  let timeout,completeLoad,disposals=0;
  install('document',{getElementById:id=>nodes[id],createElement:node,hidden:false,addEventListener(){}});
  install('window',{addEventListener(){}});
  install('navigator',{});
  install('matchMedia',()=>({matches:false,addEventListener(){}}));
  install('setTimeout',callback=>{timeout=callback;return 1});install('clearTimeout',()=>{});
  const pending=new Promise(resolve=>{completeLoad=resolve});
  class Application {load(){return pending}dispose(){disposals++}findObjectByName(){return null}}
  initializeLanding({loadRuntime:async()=>({Application})});
  await Promise.resolve();
  assert.equal(nodes.sceneHost.children.length,1,'load has constructed a canvas/application');
  timeout();
  assert.equal(nodes.sceneStage.dataset.state,'fallback');
  assert.equal(disposals,1,'timeout must release the in-flight renderer immediately');
  completeLoad();await Promise.resolve();await Promise.resolve();
  assert.equal(nodes.sceneHost.children.length,0,'a late load cannot restore a cancelled scene');
  assert.equal(nodes.sceneStage.dataset.state,'fallback');
  assert.equal(disposals,2,'late resources are cleaned again after load settles');
});

