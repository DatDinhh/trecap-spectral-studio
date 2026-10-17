/* Static recorded FPGA viewer. Every displayed output comes from an included capture. */
"use strict";
const $ = id => document.getElementById(id);
const flow = new TRecapPipeline.View(document);
const spectralExplorer = typeof TRecapSpectrogramPanel === "object" ? new TRecapSpectrogramPanel.View(document) : null;
const signalLab = typeof TreCapSignalLab === "object" ? new TreCapSignalLab.View($("signal-lab"), {seek:seekTo,listen:selectAudio,pause}) : null;
const COLORS = {original:"#71a9ff",processed:"#45e2be",ink:"#e6eef8",muted:"#96a8bb",grid:"#263346",orange:"#ffbd73"};
const superscript = {0:"⁰",1:"¹",2:"²",3:"³",4:"⁴",5:"⁵",6:"⁶",7:"⁷",8:"⁸",9:"⁹"};
const state = {config:null,result:null,raw:null,sourceId:null,pendingThreshold:1e10,availableThresholds:[],loadedEntry:null,audioReady:false,busy:false,replaying:false,replayVersion:0,audioContext:null,buffers:{},audioMode:"original",node:null,gain:null,playing:false,position:0,startedAt:0,frame:-1,group:-1,autoTimer:null,loadVersion:0,requestVersion:0,spectrumPeak:1,heat:{},lastRender:0,preview:null,playVersion:0,audioStarting:false};
const fmt = (x,d=2) => Number.isFinite(Number(x)) && x !== null && x !== undefined ? Number(x).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d}) : "N/A";
const thresholdLabel = n => n === 0 ? "0 (off)" : `10${String(Math.round(Math.log10(n))).split("").map(v=>superscript[v]).join("")}`;
const clockTime = n => `${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,"0")}`;
const finite = n => n !== null && n !== undefined && Number.isFinite(Number(n));
function displayText(value){return String(value ?? "").replace(/[\u2013\u2014]/g," - ");}
function setText(id,value){const element=$(id);if(element)element.textContent=displayText(value);}
function updateCaptureSummary(){
 const r=state.result;
 setText("session-mode",state.replaying?"Recorded run replay":"Recorded FPGA demo");
 setText("capture-summary",r?`Recorded FPGA output · ${fmt(r.duration,2)} s · Epoch ${r.provenance.epoch ?? "N/A"}`:"Choose a recorded capture to start your comparison.");
}
function message(text,kind=""){setText("run-message",text);$("run-status").className=`run-status ${kind}`;$("run-status").hidden=false;}
function sourceLabel(id){return (state.config?.sources||[]).find(s=>String(s.id)===String(id))?.label||id;}
async function request(url){const r=await fetch(url);if(!r.ok)throw new Error(`Recorded data request failed (${r.status}).`);return r.json();}
function selectedSource(){return (state.config?.sources||[]).find(s=>String(s.id)===String(state.sourceId));}
function captureEntry(source=selectedSource(),threshold=state.pendingThreshold){return (source?.cached_results||[]).find(r=>Number(r.threshold)===Number(threshold))||null;}
function stopPreview(){if(state.preview){state.preview.pause();state.preview.currentTime=0;state.preview=null;}setText("preview-source","▶ Preview input");}
async function previewSource(){const source=selectedSource();if(!source?.original_audio_url)return;if(state.preview){stopPreview();return;}pause();const audio=new Audio(source.original_audio_url);audio.volume=Number($("volume").value);state.preview=audio;audio.addEventListener("ended",()=>{if(state.preview===audio)stopPreview();});try{await audio.play();if(state.preview!==audio){audio.pause();return;}setText("preview-source","Ⅱ Stop preview");message(`Previewing ${source.label||source.id}: the exact prepared input sent to the FPGA. Charts show the currently loaded capture.`);}catch(e){stopPreview();message(`Input preview unavailable: ${e.message}`,"error");}}
function refreshPending(){
 const r=state.result,entry=captureEntry();
 const changed=!!r&&(String(r.sourceId)!==String(state.sourceId)||r.threshold!==state.pendingThreshold);
 $("pending-threshold").classList.toggle("hidden",!changed);
 setText("pending-threshold",`Not loaded: ${r&&String(r.sourceId)!==String(state.sourceId)?"new source · ":""}${thresholdLabel(state.pendingThreshold)}`);
 setText("threshold-value",thresholdLabel(state.pendingThreshold));
 $("threshold").setAttribute("aria-valuetext",state.pendingThreshold===0?"Recorded threshold disabled":`Recorded threshold 10 to the power of ${Math.round(Math.log10(state.pendingThreshold))}`);
 $("run").disabled=!entry||state.busy;
 setText("run-label",state.busy?"Loading capture...":"Load capture");
 $("replay").classList.toggle("hidden",!entry?.replay_url);
 $("replay").disabled=state.busy||changed||!r||state.loadedEntry?.result_id!==entry?.result_id;
 setText("replay-label",state.replaying?"Stop recorded replay":"Replay recorded run");
 setText("replay-help",entry?.replay_url?(changed?"Load this capture to replay its recorded run.":"Replays saved job events at their original timing. No board is connected."):"No event history was saved for this capture. Its completed signal path remains available.");
 updateCaptureSummary();
}
function showSource(){
 const s=selectedSource();
 state.availableThresholds=[...new Set((s?.cached_results||[]).map(r=>Number(r.threshold)))].filter(Number.isFinite).sort((a,b)=>a-b);
 if(!state.availableThresholds.includes(state.pendingThreshold))state.pendingThreshold=state.availableThresholds[0]??0;
 $("threshold").max=Math.max(0,state.availableThresholds.length-1);
 $("threshold").value=Math.max(0,state.availableThresholds.indexOf(state.pendingThreshold));
 $("threshold").disabled=state.availableThresholds.length<2;
 const labels=$("threshold-labels");labels.replaceChildren();
 for(const threshold of state.availableThresholds){const label=document.createElement("span");label.textContent=threshold===0?"Off":thresholdLabel(threshold);labels.append(label);}
 setText("source-description",s?.description||s?.kind||"Recorded FPGA input");
 $("preview-source").disabled=!s?.original_audio_url;
 refreshPending();
}
function populateSources(){
 const sources=state.config.sources||[];$("source").replaceChildren();
 for(const s of sources){const option=document.createElement("option");option.value=s.id;option.textContent=displayText(s.label||s.id);$("source").append(option);}
 if(!sources.length){const option=document.createElement("option");option.textContent="No recorded captures available";$("source").append(option);}
 $("source").disabled=!sources.length;
 if(!sources.some(s=>String(s.id)===String(state.sourceId)))state.sourceId=sources[0]?.id||null;
 $("source").value=state.sourceId||"";showSource();
}
function stopRecordedReplay(restore=true){
 ++state.replayVersion;flow.stop();state.replaying=false;
 if(restore&&state.result)flow.completed(state.result,{source:sourceLabel(state.result.sourceId),hasReplay:!!state.loadedEntry?.replay_url,audioReady:state.audioReady});
 refreshPending();
}
async function loadCapture(){
 clearTimeout(state.autoTimer);
 const entry=captureEntry();if(!entry?.result_url)return;
 stopRecordedReplay(false);
 const version=++state.requestVersion;state.busy=true;refreshPending();message("Loading a recorded physical FPGA capture...","busy");
 try{
  const outcome=await loadResult(entry.result_url);
  if(version!==state.requestVersion||!outcome)return;
  state.loadedEntry=entry;state.audioReady=outcome.audioReady;
  flow.completed(state.result,{source:sourceLabel(state.result.sourceId),hasReplay:!!entry.replay_url,audioReady:state.audioReady});
  if(outcome.audioReady)message("Recorded capture ready. Listen before and after, then compare the measured spectra and monitor response.","success");
 }catch(e){if(version===state.requestVersion)message(`Could not load recorded capture: ${e.message}`,"error");}
 finally{if(version===state.requestVersion){state.busy=false;refreshPending();}}
}
async function replayCapture(){
 if(state.replaying){stopRecordedReplay();message("Recorded replay stopped. The saved capture remains ready for playback.");return;}
 const entry=state.loadedEntry;if(!entry?.replay_url||state.busy)return;
 const version=++state.replayVersion;state.replaying=true;refreshPending();message("Loading the saved run event history...","busy");
 try{
  const history=await request(entry.replay_url);
  if(version!==state.replayVersion)return;
  if(String(history.result_id)!==String(entry.result_id)||String(history.source_id)!==String(state.result.sourceId)||Number(history.threshold)!==state.result.threshold)throw new Error("This event history does not match the loaded capture");
  message("Replaying recorded events at 1× original timing. The physical board is not running.");
  const completed=await flow.replay(history,{source:sourceLabel(state.result.sourceId),audioReady:state.audioReady});
  if(version!==state.replayVersion)return;
  if(completed)message(state.audioReady?"Recorded run replay complete. Its actual outputs are ready to hear and inspect.":"Recorded run replay complete. Measurements are available, but browser audio could not be loaded.",state.audioReady?"success":"error");
 }catch(e){if(version===state.replayVersion){flow.completed(state.result,{source:sourceLabel(state.result.sourceId),hasReplay:true,audioReady:state.audioReady});message(`Recorded replay unavailable: ${e.message}`,"error");}}
 finally{if(version===state.replayVersion){state.replaying=false;refreshPending();}}
}
function normalize(raw){const rec=raw.record||{};const sp=raw.spectra||raw.spectrum||{};const mon=raw.monitor||{};const c=raw.consumer||{};const id=raw.result_id||raw.id;const base=mon.before||{},after=mon.after||{};return {id,sourceId:rec.id||raw.source_id,label:rec.label||raw.source_label||"Audio recording",threshold:Number(raw.threshold),duration:Number(rec.duration_seconds||raw.duration_seconds||8),sampleRate:Number(raw.geometry?.sample_rate||raw.sample_rate||48000),record:rec,provenance:raw.provenance||{},audio:raw.audio||{},spectra:{times:sp.frame_end_seconds||sp.times_seconds||[],frequencies:sp.frequencies_hz||[],before:sp.before_power||sp.original_power||[],after:sp.after_power||sp.processed_power||[]},monitor:{times:base.ends||after.ends||c.times_seconds||[],before:base.bands||c.original_bands||[],after:after.bands||c.processed_bands||[],beforeEvents:base.events||c.original_events||[],afterEvents:after.events||c.processed_events||c.events||[]},waveform:raw.waveform||{},metrics:raw.metrics||{},timing:raw.cpu_timing||{},hardware:raw.timing||raw.provenance?.timing||{},notes:raw.notes||[]};}
async function loadResult(urlOrData,display={}){const version=++state.loadVersion;const raw=typeof urlOrData==="string"?await request(urlOrData):urlOrData;if(version!==state.loadVersion)return;const next=normalize(raw),sameSource=String(state.result?.sourceId)===String(next.sourceId),resume=state.playing&&sameSource,position=sameSource?playPosition():0;stopPreview();pause();const resumeVersion=state.playVersion;state.raw=raw;state.result=next;state.position=Math.min(position,next.duration);state.frame=-1;state.group=-1;state.heat={};state.buffers={};setText("result-title",state.result.label);setText("applied-threshold",`Applied: ${thresholdLabel(state.result.threshold)}`);const provenance=state.result.provenance;const mode=provenance.mode||provenance.kind||"";state.result.fresh=display.fresh===true&&mode==="new_physical";const physical=/physical|fpga/i.test(mode);$("provenance-tag").classList.remove("hidden");$("provenance-tag").classList.toggle("physical",physical);setText("provenance-tag",(mode==="archived_physical"||mode==="new_physical")?(state.result.fresh?"Recorded FPGA capture":"Recorded FPGA capture"):provenance.label||(physical?"Physical FPGA capture":"Provenance unverified"));$("seek").max=state.result.duration;$("seek").disabled=false;setText("total-time",clockTime(state.result.duration));setText("current-time",clockTime(state.position));refreshPending();let peak=1;for(const frame of state.result.spectra.before)for(const p of frame)if(p>peak)peak=p;state.spectrumPeak=peak;updateMetrics();updateProvenance();updateAudioDownload();drawAll();$("download-result").disabled=false;$("play").disabled=true;document.querySelectorAll("[data-audio]").forEach(b=>b.disabled=true);try{await loadAudio(state.result,version);if(version!==state.loadVersion)return;$("play").disabled=false;document.querySelectorAll("[data-audio]").forEach(b=>b.disabled=!state.buffers[b.dataset.audio]);setAudioDescription();drawAll();if(resume&&resumeVersion===state.playVersion)play();updateCaptureSummary();return {audioReady:true};}catch(e){if(version===state.loadVersion)message(`Measurements loaded; audio playback unavailable: ${e.message}`,"error");return {audioReady:false};}}
function ensureAudio(){if(!state.audioContext){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error("This browser does not support Web Audio.");state.audioContext=new Context();state.gain=state.audioContext.createGain();state.gain.gain.value=Number($("volume").value);state.gain.connect(state.audioContext.destination);}return state.audioContext;}
async function decodeAudio(url){const r=await fetch(url);if(!r.ok)throw new Error(`Audio request failed (${r.status}).`);return ensureAudio().decodeAudioData(await r.arrayBuffer());}
async function loadAudio(result,version){const urls=result.audio;const [original,processed]=await Promise.all([decodeAudio(urls.original_url||urls.original),decodeAudio(urls.processed_url||urls.processed)]);if(version!==state.loadVersion)return;state.buffers={original,processed};if(urls.difference_url||urls.difference){try{const difference=await decodeAudio(urls.difference_url||urls.difference);if(version===state.loadVersion)state.buffers.difference=difference;}catch{makeDifference();}}else makeDifference();}
function makeDifference(){const a=state.buffers.original,b=state.buffers.processed;if(!a||!b||a.sampleRate!==b.sampleRate)return;const n=Math.min(a.length,b.length);const d=ensureAudio().createBuffer(1,n,a.sampleRate),out=d.getChannelData(0),x=a.getChannelData(0),y=b.getChannelData(0);for(let i=0;i<n;i++)out[i]=x[i]-y[i];state.buffers.difference=d;}
function playPosition(){return state.playing?Math.min(state.result.duration,state.position+state.audioContext.currentTime-state.startedAt):state.position;}
function pause(){++state.playVersion;if(state.playing)state.position=playPosition();state.playing=false;state.audioStarting=false;if(state.node){state.node.onended=null;try{state.node.stop();}catch{}state.node.disconnect();state.node=null;}setText("play-symbol","▶");$("play").setAttribute("aria-label","Play audio");$("play").setAttribute("aria-busy","false");setAudioDescription();}
function finishPlayback(){const loop=$("loop").checked;pause();state.position=loop?0:state.result.duration;drawAll();if(loop)play();else if(!state.busy)message("Playback finished. Replay the clip or choose another audio mode to compare it.");}
async function resumeAudio(context){let timer;try{await Promise.race([context.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("The browser did not enable its audio device within 3 seconds")),3000);})]);if(context.state!=="running")throw new Error(`The browser audio device is ${context.state}`);}finally{clearTimeout(timer);}}
async function play(){if(!state.result||!state.buffers[state.audioMode])return;const version=++state.playVersion;stopPreview();state.audioStarting=true;setText("play-symbol","…");$("play").setAttribute("aria-label","Cancel starting audio");$("play").setAttribute("aria-busy","true");setAudioDescription();if(!state.busy)message("Starting browser audio...","busy");try{await resumeAudio(ensureAudio());if(version!==state.playVersion)return;state.audioStarting=false;$("play").setAttribute("aria-busy","false");if(state.position>=state.result.duration-.005)state.position=0;const source=state.audioContext.createBufferSource();source.buffer=state.buffers[state.audioMode];source.connect(state.gain);state.node=source;state.startedAt=state.audioContext.currentTime;state.playing=true;source.onended=()=>{if(state.node===source)finishPlayback();};source.start(0,Math.min(state.position,Math.max(0,source.buffer.duration-.001)),Math.max(.001,state.result.duration-state.position));setText("play-symbol","Ⅱ");$("play").setAttribute("aria-label","Pause audio");setAudioDescription();if(!state.busy)message(`Playing ${audioModeName()}. Switch between Before FPGA and After FPGA to compare the same moment.`);requestAnimationFrame(tick);}catch(e){if(version!==state.playVersion)return;pause();message(`Audio playback is unavailable: ${e.message}. Allow sound in your browser and press Play again. The measured results and seek controls remain available.`,"error");}}
function audioModeName(){return {original:"Before FPGA",processed:"After FPGA",difference:"Difference"}[state.audioMode];}
function updateAudioDownload(){
 const link=$("download-processed-audio"),r=state.result,url=r?.audio.processed_url||r?.audio.processed;
 link.classList.toggle("hidden",!url);
 if(url){link.href=url;link.download=`${r.id}-after-fpga.wav`;}
 else link.removeAttribute("href");
}
function setAudioDescription(){
 syncSignalLab();
 const descriptions={original:"Before FPGA: the prepared input sent to the board.",processed:"After FPGA: the captured IFFT output, aligned with the original.",difference:"Difference: the original input minus the captured FPGA output."};
 setText("audio-description",`${descriptions[state.audioMode]} All modes use the same playback gain.`);
 const status=!state.result?"Audio not loaded":state.audioStarting?"Starting":state.playing?"Now playing":state.buffers[state.audioMode]?"Ready to play":"Loading audio";
 setText("listening-state",state.result?`${status}: ${audioModeName()}`:status);
 $("listening-state").classList.toggle("is-playing",state.playing);
}
function selectAudio(mode){
 if(!state.buffers[mode]||(mode===state.audioMode&&(state.playing||state.audioStarting)))return;
 pause();state.audioMode=mode;
 document.querySelectorAll("[data-audio]").forEach(b=>{const active=b.dataset.audio===mode;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
 setAudioDescription();play();
}
function seekTo(value){if(!state.result)return;const wasPlaying=state.playing;pause();state.position=Math.max(0,Math.min(value,state.result.duration));drawAll();if(wasPlaying)play();}
function tick(now){if(!state.playing)return;if(now-state.lastRender>30){state.lastRender=now;drawAll();}if(playPosition()>=state.result.duration){finishPlayback();}else requestAnimationFrame(tick);}

function cpuRoute(id){return(state.result?.timing.routes||[]).find(r=>r.id===id);}
function updateMetrics(){const r=state.result,m=r.metrics;setText("metric-error",finite(m.waveform_nrmse_percent)?`${fmt(m.waveform_nrmse_percent,2)}%`:"Not measured");setText("metric-bytes",finite(m.packet_reduction_percent)?`${fmt(Math.abs(m.packet_reduction_percent),1)}% ${Number(m.packet_reduction_percent)>=0?"smaller":"larger"}`:"Not measured");setText("metric-byte-detail",finite(m.sparse_bytes)&&finite(m.dense_bytes)?`${fmt(m.sparse_bytes/1000,1)} / ${fmt(m.dense_bytes/1000,1)} kB · sparse / dense`:"Sparse versus dense spectra");const sparse=cpuRoute("processed_sparse")?.median_ms??m.sparse_consumer_ms??m.consumer_sparse_ms;const dense=cpuRoute("processed_dense")?.median_ms??m.dense_consumer_ms??m.consumer_dense_ms;setText("metric-consumer",finite(sparse)?`${fmt(sparse,2)} ms`:"Not measured");setText("metric-consumer-detail",finite(dense)?`Original laptop · dense: ${fmt(dense,2)} ms`:"Decode + monitor, per clip");const hw=r.hardware.board_wall_ns??r.provenance.board_wall_ns;const service=finite(hw)?Number(hw)/1e6:m.hardware_service_ms;setText("metric-board",finite(service)?`${fmt(service,1)} ms`:"Not measured");setText("metric-host",finite(r.hardware.host_roundtrip_ns)?`Host round trip: ${fmt(Number(r.hardware.host_roundtrip_ns)/1e6,1)} ms (includes network)`:"Host round trip: not measured");const pcm=finite(m.sparse_over_pcm16)?` Sparse packets are ${fmt(m.sparse_over_pcm16,2)}× the original PCM16 bytes.`:"";setText("measurement-note",`Recorded on original laptop. These are saved benchmark results, not measurements of this device. Consumer timing excludes FPGA processing and network transport. Spectral packet reduction is not WAV compression.${pcm}`);const tbody=$("timing-routes");tbody.replaceChildren();const routes=r.timing.routes||[];const labels={original_dense:["Original spectrum · threshold 0","Validate + decode + monitor"],processed_dense:["Processed spectrum · dense","Validate + decode + monitor"],processed_sparse:["Processed spectrum · sparse","Validate + decode + monitor"],cpu_pcm_monitor:["Original PCM · CPU-only path","FFT + selected threshold + features + monitor"]};for(const route of routes){const tr=document.createElement("tr");if(route.id==="processed_sparse")tr.className="highlight";const desc=labels[route.id]||[route.label||route.id,route.scope||"See measurement notes"];for(const value of [...desc,`${fmt(route.median_ms,3)} ms`]){const td=document.createElement("td");td.textContent=displayText(value);tr.append(td);}tbody.append(tr);}if(!routes.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=3;td.textContent="No per-route timing recorded for this capture.";tr.append(td);tbody.append(tr);}setText("timing-trials",r.timing.trials?`${r.timing.trials} measured trials · median`:`${fmt(r.duration,2)} s audio clip`);setText("route-scope","Recorded on original laptop. "+(typeof r.timing.scope==="string"?r.timing.scope:"The CPU-only route includes FFT processing. The spectral routes begin with already processed data; their difference is not a whole-system FPGA speedup."));}
function updateProvenance(){const r=state.result,p=r.provenance;const entries=[["Demo mode","Recorded physical FPGA outputs. Hardware execution is available only in the original local app."],["Host benchmarks","Recorded on original laptop. No timings are measured on this device."],["Capture type",p.mode||p.kind||"Not specified"],["Result ID",r.id||"Not specified"],["Applied threshold",thresholdLabel(r.threshold)],["Audio duration",`${fmt(r.duration,3)} seconds`],["Sample rate",`${r.sampleRate.toLocaleString()} Hz`],["Original input","Exact mono, 48 kHz, signed 12-bit PCM supplied to the FPGA, after source-file preparation."],["Board run",p.board_run_id||p.run_id||p.capture_id],["Verification",p.verification||p.validation_status||(p.full_reference_exact===true?"Full output exactly matches the fixed-point software reference":null)],["FPGA image SHA-256",p.sof_sha256],["Source identity",p.source_id],["Capture epoch",p.epoch],["Baseline epoch",p.baseline_epoch],["Baseline capture type",p.baseline_mode],["Captured",p.processed_at||p.recorded_at||p.timestamp],["Host round trip",finite(r.hardware.host_roundtrip_ns)?`${fmt(Number(r.hardware.host_roundtrip_ns)/1e6,2)} ms, including board service and Ethernet transport`:null],["Attribution",typeof r.record.attribution==="string"?r.record.attribution:JSON.stringify(r.record.attribution||{})],["Playback gain",r.audio.shared_pcm16_gain?`Shared ×${r.audio.shared_pcm16_gain} integer conversion; no independent normalization`:"Shared gain for original, processed, and difference"]];const dl=$("provenance-list");dl.replaceChildren();for(const [label,value] of entries){if(value===null||value===undefined||value==="")continue;const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=displayText(typeof value==="string"?value:JSON.stringify(value));dl.append(dt,dd);}const notes=[...(Array.isArray(r.notes)?r.notes:[]),p.physical_timing_scope,p.playback_scope,state.raw.physical_timing_scope,r.metrics.byte_scope].filter(Boolean);const ul=$("result-notes");ul.replaceChildren();for(const note of notes){const li=document.createElement("li");li.textContent=displayText(typeof note==="string"?note:JSON.stringify(note));ul.append(li);}}

function chart(id){const el=$(id),rect=el.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);if(!rect.width||!rect.height)return null;const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);if(el.width!==width||el.height!==height){el.width=width;el.height=height;}const ctx=el.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.font="11px Consolas, monospace";ctx.lineWidth=1;return {ctx,w:rect.width,h:rect.height,p:{l:60,r:16,t:14,b:32}};}
function empty(c,text="Load a measured FPGA result to view this chart"){if(!c)return;c.ctx.fillStyle=COLORS.muted;c.ctx.textAlign="center";c.ctx.fillText(text,c.w/2,c.h/2);}
function axes(c,xMax,yMin,yMax,xTicks,yTicks,xLabel,yFormatter){const {ctx,w,h,p}=c,ww=w-p.l-p.r,hh=h-p.t-p.b;ctx.textAlign="right";ctx.textBaseline="middle";for(const y of yTicks){const py=p.t+hh*(yMax-y)/(yMax-yMin);ctx.strokeStyle=COLORS.grid;ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(w-p.r,py);ctx.stroke();ctx.fillStyle=COLORS.muted;ctx.fillText(yFormatter?yFormatter(y):String(y),p.l-7,py);}ctx.textAlign="center";ctx.textBaseline="top";for(const x of xTicks){const px=p.l+ww*x/xMax;ctx.fillStyle=COLORS.muted;ctx.fillText(xLabel?xLabel(x):String(x),px,h-p.b+8);}return {x:v=>p.l+ww*v/xMax,y:v=>p.t+hh*(yMax-v)/(yMax-yMin),ww,hh};}
function nearestIndex(times,t){if(!times.length)return 0;let lo=0,hi=times.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(times[mid]<=t)lo=mid;else hi=mid-1;}return lo;}
function clipped(c,draw){const {ctx,w,h,p}=c;ctx.save();ctx.beginPath();ctx.rect(p.l,p.t,w-p.l-p.r,h-p.t-p.b);ctx.clip();draw();ctx.restore();}
function drawSpectrum(){const c=chart("spectrum"),r=state.result;if(!c)return;if(!r||!r.spectra.before.length)return empty(c);const s=r.spectra;if(s.times.length&&playPosition()<s.times[0]&&state.playing){setText("spectrum-time",`First frame: ${fmt(s.times[0],3)} s`);return empty(c,"Waiting for the first complete FFT frame");}const i=nearestIndex(s.times,playPosition()),before=s.before[i]||[],after=s.after[i]||[],frequencies=s.frequencies.length?s.frequencies:before.map((_,k)=>k*r.sampleRate/256),maxHz=frequencies.at(-1)||r.sampleRate/2;setText("spectrum-time",`${playPosition()<(s.times[0]||0)?"Preview · ":""}${fmt(s.times[i]||0,3)} s`);const scale=axes(c,maxHz,-100,0,[0,maxHz/4,maxHz/2,maxHz*3/4,maxHz],[-100,-75,-50,-25,0],x=>x===0?"0 Hz":`${fmt(x/1000,0)}k`,y=>`${y} dB`);clipped(c,()=>{for(const [values,color] of [[before,COLORS.original],[after,COLORS.processed]]){c.ctx.beginPath();values.forEach((v,k)=>{const db=Math.max(-100,10*Math.log10(Math.max(Number(v),1e-12)/state.spectrumPeak));const x=scale.x(frequencies[k]),y=scale.y(Math.min(0,db));k?c.ctx.lineTo(x,y):c.ctx.moveTo(x,y);});c.ctx.strokeStyle=color;c.ctx.lineWidth=1.7;c.ctx.stroke();}});}
function drawWaveform(){const c=chart("waveform"),r=state.result;if(!c)return;if(!r)return empty(c);const current=playPosition(),span=Math.min(2,r.duration),start=Math.max(0,Math.min(current-span/2,r.duration-span)),wf=r.waveform;let bound=1;for(const key of ["before_min","before_max","after_min","after_max"])for(const v of wf[key]||[])bound=Math.max(bound,Math.abs(v));bound=Math.ceil(bound*10)/10;const scale=axes(c,span,-bound,bound,[0,span/2,span],[-bound,-bound/2,0,bound/2,bound],x=>`${fmt(start+x,1)} s`,y=>y===0?"0":fmt(y,1));const rows=[["original",wf.before_min,wf.before_max,COLORS.original],["processed",wf.after_min,wf.after_max,COLORS.processed]];let available=false;clipped(c,()=>{for(const [key,mins,maxs,color] of rows){const ctx=c.ctx;ctx.strokeStyle=color;ctx.globalAlpha=key==="original"?.5:.85;ctx.lineWidth=1;if(Array.isArray(mins)&&Array.isArray(maxs)&&wf.times_seconds){available=true;ctx.beginPath();for(let i=0;i<wf.times_seconds.length;i++){const t=wf.times_seconds[i]-start;if(t<0||t>span)continue;const x=scale.x(t);ctx.moveTo(x,scale.y(mins[i]));ctx.lineTo(x,scale.y(maxs[i]));}ctx.stroke();}else{const buf=state.buffers[key];if(!buf)continue;available=true;const values=buf.getChannelData(0),from=Math.floor(start*buf.sampleRate),to=Math.min(values.length,Math.ceil((start+span)*buf.sampleRate)),step=Math.max(1,Math.floor((to-from)/scale.ww));ctx.beginPath();for(let i=from;i<to;i+=step){let lo=1,hi=-1;for(let j=i;j<Math.min(i+step,to);j++){lo=Math.min(lo,values[j]);hi=Math.max(hi,values[j]);}const x=scale.x(i/buf.sampleRate-start);ctx.moveTo(x,scale.y(lo));ctx.lineTo(x,scale.y(hi));}ctx.stroke();}ctx.globalAlpha=1;}const x=scale.x(current-start);c.ctx.strokeStyle=COLORS.orange;c.ctx.lineWidth=1;c.ctx.beginPath();c.ctx.moveTo(x,c.p.t);c.ctx.lineTo(x,c.h-c.p.b);c.ctx.stroke();});if(!available)empty(c,"Audio waveform is loading…");}
function heatColor(t){const colors=[[10,18,30],[24,54,87],[25,119,126],[69,226,190],[249,238,165]];const x=Math.max(0,Math.min(1,t))*(colors.length-1),i=Math.min(colors.length-2,Math.floor(x)),a=x-i;return colors[i].map((v,k)=>Math.round(v+(colors[i+1][k]-v)*a));}
function makeHeat(key,frames){if(!frames.length)return null;const n=frames.length,bins=frames[0].length,canvas=document.createElement("canvas");canvas.width=n;canvas.height=bins;const ctx=canvas.getContext("2d"),img=ctx.createImageData(n,bins);for(let f=0;f<n;f++)for(let k=0;k<bins;k++){const db=Math.max(-100,10*Math.log10(Math.max(Number(frames[f][k]),1e-12)/state.spectrumPeak));const rgb=heatColor((db+100)/100),idx=((bins-1-k)*n+f)*4;img.data[idx]=rgb[0];img.data[idx+1]=rgb[1];img.data[idx+2]=rgb[2];img.data[idx+3]=255;}ctx.putImageData(img,0,0);state.heat[key]=canvas;return canvas;}
function drawSpectrogram(key){const c=chart(`spectrogram-${key}`),r=state.result;if(!c)return;if(!r)return empty(c);const frames=key==="original"?r.spectra.before:r.spectra.after;if(!frames.length)return empty(c,"No spectra were recorded for this result");const maxHz=(r.spectra.frequencies.at(-1)||r.sampleRate/2)/1000;const scale=axes(c,r.duration,0,maxHz,[0,r.duration/4,r.duration/2,3*r.duration/4,r.duration],[0,maxHz/2,maxHz],x=>`${fmt(x,1)} s`,y=>`${fmt(y,0)}k`);const heat=state.heat[key]||makeHeat(key,frames);c.ctx.imageSmoothingEnabled=false;c.ctx.drawImage(heat,c.p.l,c.p.t,scale.ww,scale.hh);const x=scale.x(playPosition());c.ctx.strokeStyle="#fff";c.ctx.lineWidth=1.5;c.ctx.beginPath();c.ctx.moveTo(x,c.p.t);c.ctx.lineTo(x,c.h-c.p.b);c.ctx.stroke();c.ctx.fillStyle="#fff";c.ctx.beginPath();c.ctx.moveTo(x-4,c.p.t);c.ctx.lineTo(x+4,c.p.t);c.ctx.lineTo(x,c.p.t+6);c.ctx.fill();}
function drawBands(){const c=chart("bands"),r=state.result;if(!c)return;if(!r||!r.monitor.before.length)return empty(c,"No consumer features recorded");const m=r.monitor;if(m.times.length&&playPosition()<m.times[0]&&state.playing){setText("consumer-time",`First block: ${fmt(m.times[0],3)} s`);return empty(c,"Waiting for the first complete monitor block");}const i=nearestIndex(m.times,playPosition()),a=m.before[i]||[],b=m.after[i]||[],total=a.reduce((sum,v)=>sum+Number(v),0);setText("consumer-time",`${playPosition()<(m.times[0]||0)?"Preview · ":""}${fmt(m.times[i]||0,3)} s block`);const av=a.map(v=>total?100*Number(v)/total:0),bv=b.map(v=>total?100*Number(v)/total:0),yMax=Math.max(1,...av,...bv)*1.1;const scale=axes(c,16,0,yMax,[],[0,yMax/2,yMax],null,y=>`${fmt(y,yMax<5?1:0)}%`);const groupW=scale.ww/16;for(let k=0;k<16;k++){const left=scale.x(k)+groupW*.15,width=groupW*.3;c.ctx.fillStyle=COLORS.original;c.ctx.fillRect(left,scale.y(av[k]||0),width,scale.y(0)-scale.y(av[k]||0));c.ctx.fillStyle=COLORS.processed;c.ctx.fillRect(left+width+1,scale.y(bv[k]||0),width,scale.y(0)-scale.y(bv[k]||0));c.ctx.fillStyle=COLORS.muted;c.ctx.textAlign="center";c.ctx.textBaseline="top";c.ctx.fillText(String(k),scale.x(k+.5),c.h-c.p.b+8);}if(!total){c.ctx.fillStyle=COLORS.muted;c.ctx.textAlign="center";c.ctx.fillText("Zero-energy block",c.w/2,c.p.t+8);}}
function eventTime(e){return Number(e.time_seconds??e.time??e.timestamp_seconds??0);}
function drawEvents(){const c=chart("events"),r=state.result;if(!c)return;if(!r)return empty(c);const m=r.monitor;c.p.l=78;const {ctx,w,h,p}=c,ww=w-p.l-p.r,dur=r.duration||1,rows=[{events:m.beforeEvents,y:58,label:"Original",color:COLORS.original},{events:m.afterEvents,y:125,label:"FPGA",color:COLORS.processed}];const x=t=>p.l+ww*t/dur;for(const row of rows){ctx.strokeStyle=COLORS.grid;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.l,row.y);ctx.lineTo(w-p.r,row.y);ctx.stroke();ctx.fillStyle=COLORS.muted;ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillText(row.label,p.l-12,row.y);for(const e of row.events){const px=x(eventTime(e));ctx.strokeStyle=row.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,row.y-14);ctx.lineTo(px,row.y+14);ctx.stroke();ctx.fillStyle=row.color;ctx.beginPath();ctx.arc(px,row.y,4,0,Math.PI*2);ctx.fill();}if(!row.events.length){ctx.fillStyle=COLORS.muted;ctx.textAlign="left";ctx.fillText("No persistent changes detected",p.l+9,row.y-13);}}ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle=COLORS.muted;for(const t of[0,dur/4,dur/2,3*dur/4,dur])ctx.fillText(`${fmt(t,1)} s`,x(t),h-20);const px=x(playPosition());ctx.strokeStyle=COLORS.orange;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(px,p.t);ctx.lineTo(px,h-p.b);ctx.stroke();ctx.setLineDash([]);setText("event-count",`${m.beforeEvents.length} original · ${m.afterEvents.length} processed`);}
function syncSignalLab(t=state.result?playPosition():0){signalLab?.update({result:state.result,raw:state.raw,buffers:state.buffers,position:t,playing:state.playing,audioMode:state.audioMode,peak:state.spectrumPeak});}
function drawAll(){
 const t=state.result?playPosition():0;
 $("seek").value=t;
 $("seek").setAttribute("aria-valuetext",`${fmt(t,2)} of ${fmt(state.result?.duration||0,2)} seconds`);
 setText("current-time",clockTime(t));
 drawSpectrum();drawWaveform();drawSpectrogram("original");drawSpectrogram("processed");drawBands();drawEvents();
 spectralExplorer?.update(state.result,t,state.spectrumPeak);
 syncSignalLab(t);
}


$("source").addEventListener("change",()=>{stopPreview();++state.requestVersion;++state.loadVersion;state.busy=false;clearTimeout(state.autoTimer);stopRecordedReplay();state.sourceId=$("source").value;showSource();loadCapture();});
$("threshold").addEventListener("input",()=>{state.pendingThreshold=state.availableThresholds[Number($("threshold").value)];stopRecordedReplay();refreshPending();clearTimeout(state.autoTimer);if($("auto-apply").checked)state.autoTimer=setTimeout(loadCapture,350);});
$("auto-apply").addEventListener("change",()=>{if($("auto-apply").checked)message("Moving the slider loads the corresponding recorded capture after a short pause.");else clearTimeout(state.autoTimer);});
$("run").addEventListener("click",loadCapture);
$("replay").addEventListener("click",replayCapture);
$("preview-source").addEventListener("click",previewSource);
$("play").addEventListener("click",()=>{if(state.playing||state.audioStarting){pause();if(!state.busy)message("Playback paused. Switch audio modes or seek to inspect a different moment.");}else play();});
$("seek").addEventListener("input",e=>seekTo(Number(e.target.value)));
$("volume").addEventListener("input",()=>{$("volume").setAttribute("aria-valuetext",`${Math.round(Number($("volume").value)*100)} percent`);if(state.preview)state.preview.volume=Number($("volume").value);if(state.gain)state.gain.gain.setTargetAtTime(Number($("volume").value),state.audioContext.currentTime,.01);});
document.querySelectorAll("[data-audio]").forEach(b=>b.addEventListener("click",()=>selectAudio(b.dataset.audio)));
$("download-result").addEventListener("click",()=>{if(!state.raw)return;const url=URL.createObjectURL(new Blob([JSON.stringify(state.raw,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`trecap-${state.result.id||"result"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener("resize",()=>requestAnimationFrame(drawAll));
window.addEventListener("pagehide",()=>{pause();stopPreview();flow.stop();});
document.addEventListener("keydown",e=>{if(e.code==="Space"&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)&&state.result){e.preventDefault();state.playing||state.audioStarting?pause():play();}});
function selectView(name,focus=false){
 const tabs=[...document.querySelectorAll("[data-view]")];
 if(!tabs.some(t=>t.dataset.view===name))return;
 for(const tab of tabs){const selected=tab.dataset.view===name;tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus();}
 for(const panel of document.querySelectorAll("[data-view-panel]"))panel.hidden=panel.dataset.viewPanel!==name;
 requestAnimationFrame(drawAll);
}
for(const tab of document.querySelectorAll("[data-view]")){
 tab.addEventListener("click",()=>selectView(tab.dataset.view));
 tab.addEventListener("keydown",event=>{
  const names=[...document.querySelectorAll("[data-view]")].map(el=>el.dataset.view),i=names.indexOf(tab.dataset.view);
  const key=event.key;if(!["ArrowRight","ArrowLeft","Home","End"].includes(key))return;event.preventDefault();
  const target=key==="Home"?0:key==="End"?names.length-1:(i+(key==="ArrowRight"?1:-1)+names.length)%names.length;
  selectView(names[target],true);
 });
}
async function initialize(){
 drawAll();$("volume").setAttribute("aria-valuetext",`${Math.round(Number($("volume").value)*100)} percent`);
 try{
  state.config=await request("demo/catalog.json");
  if(!state.config.portable||!Array.isArray(state.config.sources))throw new Error("The recorded demo catalog is missing or invalid");
  const first=state.config.sources.find(s=>/chainsaw/i.test(`${s.id} ${s.label}`))||state.config.sources[0];
  state.sourceId=state.config.initial_source_id||first?.id||null;
  state.pendingThreshold=Number(state.config.initial_threshold??1e10);
  populateSources();await loadCapture();
 }catch(e){message(`The recorded demo could not load: ${e.message}. Serve this folder over HTTP and reload the page.`,"error");}
}
initialize();
