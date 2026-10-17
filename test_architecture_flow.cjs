'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createArchitecture, normalizeEvent} = require('./architecture-flow.js');

// Lifecycle/state contract only. SVG layout and visible interaction are checked in a browser.
function harness(reducedMotion=false) {
  let serial=0;
  const frames=new Map(), timers=new Map(), listeners=new Map(), fields=new Map();
  const node=()=>({dataset:{},style:{},isConnected:true,disabled:false,hidden:false,
    classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},
    appendChild(){},getTotalLength(){return 100;},getPointAtLength(n){return{x:n,y:0};},
    focus(){},addEventListener(){},removeEventListener(){}});
  const win={matchMedia(){return{matches:reducedMotion,addEventListener(){},removeEventListener(){}};},
    requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
  const doc={defaultView:win,hidden:false,body:{style:{}},createElementNS:node,
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const mount=Object.assign(node(),{ownerDocument:doc,querySelector(selector){if(!fields.has(selector))fields.set(selector,node());return fields.get(selector);},querySelectorAll(){return[];},contains(){return true;}});
  const controller=createArchitecture(mount);
  return{controller,mount,fields,frames,timers,listeners,doc,
    advance(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}

test('walkthrough advances locally, pause freezes it and destroy releases scheduling',()=>{
  const h=harness();
  h.controller.playWalkthrough();
  assert.equal(h.controller.getState().step,0);
  h.advance();assert.equal(h.controller.getState().step,1);
  assert.equal(h.controller.getState().moving,true);
  h.controller.pause();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
  h.controller.next();assert.equal(h.controller.getState().step,2);
  assert.equal(h.controller.getState().playing,false);
  h.controller.destroy();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
});

test('live processing takes priority and terminal or unknown status stops all packet motion',()=>{
  for(const status of ['complete','error','unknown','superseded','idle']){
    const h=harness();h.controller.playWalkthrough();
    h.controller.handleEvent({mode:'live',phase:'processing',status:'active',threshold:1e8});
    assert.equal(h.controller.getState().mode,'observation');assert.equal(h.controller.getState().moving,true);
    assert.equal(h.timers.size,0);
    h.controller.handleEvent({mode:'live',phase:status==='complete'?'complete':'processing',status});
    assert.equal(h.controller.getState().moving,false,status);assert.equal(h.frames.size,0,status);
    h.controller.destroy();
  }
});

test('cached results, queued work and unknown phases never animate board activity',()=>{
  const h=harness();
  for(const phase of ['cached','queued','requesting','admission','starting','reference','unknown']){
    h.controller.handleEvent({mode:'live',phase,status:'active'});
    assert.equal(h.controller.getState().moving,false,phase);
  }
  h.controller.destroy();
});

test('repeated idle observations do not interrupt an explanatory walkthrough',()=>{
  const h=harness(), event={mode:'live',phase:'idle',status:'idle',source:'fixture',threshold:1e8};
  h.controller.handleEvent(event);h.controller.playWalkthrough();h.advance();
  h.controller.handleEvent(event);
  assert.equal(h.controller.getState().mode,'walkthrough');assert.equal(h.controller.getState().playing,true);
  h.controller.destroy();
});

test('completed capture polls do not restart an idle animation or interrupt manual exploration',()=>{
  const h=harness(), event={mode:'recorded',phase:'complete',status:'complete',threshold:1e8};
  h.controller.handleEvent(event);assert.equal(h.controller.getState().moving,false);
  h.controller.next();h.controller.handleEvent(event);
  assert.equal(h.controller.getState().mode,'walkthrough');assert.equal(h.controller.getState().playing,false);
  h.controller.destroy();
});

test('reduced motion retains step controls without packet animation',()=>{
  const h=harness(true);h.controller.playWalkthrough();h.advance();
  assert.equal(h.controller.getState().step,1);assert.equal(h.controller.getState().moving,false);assert.equal(h.frames.size,0);
  h.controller.next();assert.equal(h.controller.getState().step,2);h.controller.destroy();
});

test('hidden pages suspend walkthrough progression and resume when visible',()=>{
  const h=harness();h.controller.playWalkthrough();h.advance();
  h.doc.hidden=true;h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
  h.doc.hidden=false;h.listeners.get('visibilitychange')();assert.equal(h.timers.size,1);
  h.controller.destroy();
});

test('invalid status does not imply active hardware and invalid elapsed is ignored',()=>{
  const result=normalizeEvent({mode:'anything',phase:'unknown',status:'whatever',elapsedMs:-1});
  assert.equal(result.status,'idle');assert.equal(result.elapsedMs,null);
});
