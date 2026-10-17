/* Replays only saved observation times. This module never starts a hardware job. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.TRecapPipeline=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const stages=["prepare","send","board","receive","verify","consumer","ready"];
 const phaseStage={queued:"prepare",preparing:"prepare",admission:"prepare",starting:"prepare",sending:"send",processing:"board",receiving:"receive",verifying:"verify",reference:"verify",consumer:"consumer",rendering:"ready",complete:"ready"};
 const titles={queued:"Waiting for the board",preparing:"Preparing the audio",admission:"Checking the board",starting:"Opening the board service",sending:"Laptop to board",processing:"Board processing",receiving:"Board to laptop",verifying:"Checking the capture",reference:"Verifying the FPGA output",consumer:"Original laptop analysis",rendering:"Preparing playback and charts",complete:"Recorded run complete"};
 const clean=value=>String(value??"").replace(/[\u2013\u2014]/g," - ");
 const thresholdLabel=n=>Number(n)===0?"Off":`10^${Math.round(Math.log10(Number(n)))}`;
 function validateHistory(history){
  if(history?.status!=="complete"||!Array.isArray(history.events)||!history.events.length)throw new Error("No completed recorded event history is available");
  let elapsed=-1,sequence=-1;
  for(const event of history.events){
   if(!Number.isFinite(event.elapsed_ms)||event.elapsed_ms<0||event.elapsed_ms<elapsed||!Number.isFinite(event.sequence)||event.sequence<=sequence||typeof event.phase!=="string")throw new Error("The recorded event history has invalid timing or sequence data");
   elapsed=event.elapsed_ms;sequence=event.sequence;
  }
  if(history.events.at(-1).phase!=="complete")throw new Error("The recorded event history has no completion event");
  return history.events;
 }
 function projectEvents(events){
  const progress=events.at(-1)||{},phase=progress.phase||"queued",pass=progress.pass_kind||"selected";
  const relevant=events.filter(e=>(e.pass_kind||"selected")===pass);
  const states=Object.fromEntries(stages.map(stage=>[stage,"waiting"]));
  for(const event of relevant){const stage=phaseStage[event.phase];if(stage&&event.phase!=="queued")states[stage]="done";}
  const current=phaseStage[phase];
  if(current)states[current]=phase==="complete"?"done":phase==="queued"?"waiting":"active";
  return {phase,pass,states,progress,title:titles[phase]||phase};
 }
 class View{
  constructor(doc){this.doc=doc;this.frame=null;this.resolveReplay=null;this.active=false;this.historySignature=null;}
  el(id){return this.doc.getElementById(id);}
  text(id,value){const element=this.el(id);if(element)element.textContent=clean(value);}
  architecture(values){
   const EventClass=this.doc.defaultView?.CustomEvent;
   if(EventClass&&this.doc.dispatchEvent)this.doc.dispatchEvent(new EventClass("trecap:architecture",{detail:{mode:"recorded",...values}}));
  }
  running(){return this.active;}
  stop(){
   const wasActive=this.active;
   if(this.frame!==null)cancelAnimationFrame(this.frame);
   this.frame=null;this.active=false;
   if(wasActive)this.architecture({phase:"stopped",status:"idle"});
   if(wasActive){for(const node of this.doc.querySelectorAll("[data-flow-stage], [data-flow-part]")){if(node.dataset.state==="active")node.dataset.state="waiting";node.removeAttribute("aria-current");}const panel=this.el("processing-flow");if(panel){panel.dataset.status="complete";panel.dataset.replay="false";panel.setAttribute("aria-busy","false");}this.text("flow-replay-badge","RECORDED REPLAY STOPPED");this.text("flow-status","Recorded replay stopped");this.text("flow-detail","Replay stopped. No hardware is running.");}
   if(this.resolveReplay){const resolve=this.resolveReplay;this.resolveReplay=null;resolve(false);}
  }
  states(values){
   for(const node of this.doc.querySelectorAll("[data-flow-stage], [data-flow-part]")){
    const stage=node.dataset.flowStage||node.dataset.flowPart;
    node.dataset.state=values[stage]||"waiting";
    if(node.dataset.flowStage){if(values[stage]==="active")node.setAttribute("aria-current","step");else node.removeAttribute("aria-current");}
   }
  }
  completed(result,options={}){
   this.stop();const panel=this.el("processing-flow");if(!panel)return;
   panel.dataset.status="complete";panel.dataset.phase="complete";panel.dataset.replay="false";panel.setAttribute("aria-busy","false");
   this.audioReady=options.audioReady!==false;
   this.states(Object.fromEntries(stages.map(stage=>[stage,stage==="ready"&&!this.audioReady?"error":"done"])));this.text("flow-ready-label",this.audioReady?"Listen & compare":"Audio unavailable");
   this.text("flow-replay-badge","RECORDED CAPTURE");this.text("flow-status","Completed physical capture");this.text("flow-elapsed","Saved result");
   this.text("flow-detail",options.hasReplay?"This capture already completed on the physical board. Replay its saved job events to follow the original timing.":"This capture already completed on the physical board. No event history was saved, so the completed signal path is shown without animation.");
   if(!this.audioReady)this.text("flow-detail",this.el("flow-detail").textContent+" Browser audio could not be loaded; recorded measurements remain available.");
   this.text("flow-source",options.source||result.sourceId);this.text("flow-threshold",`Threshold ${thresholdLabel(result.threshold)}`);this.text("flow-pass","Saved physical capture");this.text("flow-queue","No hardware execution");
   this.text("flow-transfer","Transfer timing and sizes are shown only during a replay of saved event data.");
   this.text("flow-observation","Recorded capture. No hardware runs occur here. Internal FFT, threshold and IFFT stages were not separately timed.");
   this.architecture({phase:"complete",status:"complete",source:options.source||result.sourceId,threshold:result.threshold});
   this.history([],options.hasReplay?"A recorded event history is available. Press Replay recorded run to inspect it.":"No event history was saved for this capture.");
  }
  render(history,events,elapsed,source,complete=false){
   const model=projectEvents(events),panel=this.el("processing-flow");if(!panel)return;
   panel.dataset.status=complete?"complete":"active";panel.dataset.phase=model.phase;panel.dataset.replay=complete?"false":"true";panel.setAttribute("aria-busy",String(!complete));
   if(complete&&!this.audioReady)model.states.ready="error";
   this.states(model.states);this.text("flow-ready-label",this.audioReady?"Listen & compare":"Audio unavailable");
   this.text("flow-replay-badge",complete?"RECORDED REPLAY COMPLETE":"RECORDED REPLAY · 1×");
   this.text("flow-status",complete?"Recorded run replay complete":`Replay: ${model.title}`);
   this.text("flow-detail",complete?"Replay finished. These events and the displayed outputs were saved from this completed physical FPGA capture.":`Recorded event: ${model.progress.message||"Waiting for the first saved event."}`);
   this.text("flow-source",source||history.source_id);this.text("flow-threshold",`Threshold ${thresholdLabel(model.progress.threshold??history.threshold)}`);
   this.text("flow-pass",model.pass==="baseline"?"Recorded reference pass":"Recorded selected threshold");this.text("flow-queue","No board is running");
   this.text("flow-elapsed",`${Math.max(0,elapsed/1000).toFixed(1)} s recorded`);
   this.text("flow-observation","Replay of saved operation boundaries at original timing. Motion illustrates the recorded pipeline; internal FFT, threshold and IFFT stages were not separately timed.");
   const transfer=[...events].reverse().find(e=>(e.pass_kind||"selected")===model.pass&&["sending","receiving"].includes(e.phase)&&Number.isFinite(e.total_bytes));
   this.text("flow-transfer",transfer?`Recorded ${transfer.phase==="sending"?"input accepted by socket":"output received"}: ${(Number(transfer.completed_bytes)/1e6).toFixed(2)} / ${(transfer.total_bytes/1e6).toFixed(2)} MB.`:"No transfer observation reached yet.");
   this.history(events,"No recorded event reached yet.");
   this.architecture({phase:model.phase,status:complete?"complete":"active",source:source||history.source_id,threshold:model.progress.threshold??history.threshold,pass:model.pass,elapsedMs:elapsed,states:model.states});
  }
  history(events,emptyText){
   const target=this.el("flow-events");if(!target)return;
   const compact=[];
   for(const event of events){const last=compact.at(-1);if(last&&last.phase===event.phase&&last.pass_kind===event.pass_kind)compact[compact.length-1]=event;else compact.push(event);}
   const signature=JSON.stringify([compact,emptyText]);if(signature===this.historySignature)return;this.historySignature=signature;target.replaceChildren();
   if(!compact.length){const row=this.doc.createElement("li");row.className="flow-history-empty";row.textContent=clean(emptyText);target.append(row);return;}
   for(const event of compact){
    const row=this.doc.createElement("li"),time=this.doc.createElement("time"),body=this.doc.createElement("span");
    time.textContent=`${(event.elapsed_ms/1000).toFixed(2)} s`;
    body.textContent=clean(`${event.pass_kind==="baseline"?"Reference":"Selected"} · ${titles[event.phase]||event.phase}: ${event.message||""}`);
    row.append(time,body);target.append(row);
   }
  }
  replay(history,options={}){
   const events=validateHistory(history);this.stop();this.active=true;this.audioReady=options.audioReady!==false;
   const duration=events.at(-1).elapsed_ms,start=performance.now();let count=0,lastCount=-1;
   return new Promise(resolve=>{
    this.resolveReplay=resolve;
    const tick=now=>{
     if(!this.active)return;
     const elapsed=Math.min(duration,Math.max(0,now-start));
     while(count<events.length&&events[count].elapsed_ms<=elapsed)count++;
     const complete=count===events.length&&elapsed>=duration;
     if(count!==lastCount||complete){this.render(history,events.slice(0,count),elapsed,options.source,complete);lastCount=count;}
     else this.text("flow-elapsed",`${(elapsed/1000).toFixed(1)} s recorded`);
     if(complete){this.active=false;this.frame=null;this.resolveReplay=null;resolve(true);return;}
     this.frame=requestAnimationFrame(tick);
    };
    tick(start);
   });
  }
 }
 return {View,validateHistory,projectEvents,stages};
});
