/* Paired spectrogram UI shared by the recorded demo and local FPGA application. */
(function(root){
  "use strict";
  class View {
    constructor(doc){
      this.doc=doc;this.views={};this.result=null;this.referencePeak=1;this.time=0;
      this.mode="3d";this.dataKey=null;this.statuses={};this.disposed=false;
      this.el=id=>doc.getElementById(id);
      this.host=this.el("spectrogram-explorer");
      if(!this.host)return;
      this.modeButtons=[...this.host.querySelectorAll("[data-spectrogram-mode]")];
      this.modeButtons.forEach(button=>button.addEventListener("click",()=>this.setMode(button.dataset.spectrogramMode)));
      for(const id of ["spectrogram-frequency","spectrogram-depth"]){
        this.el(id).addEventListener("change",()=>{this.dataKey=null;this.refresh();});
      }
      this.host.querySelectorAll("[data-spectrogram-preset]").forEach(button=>button.addEventListener("click",()=>{
        for(const view of Object.values(this.views))view.setPreset(button.dataset.spectrogramPreset);
        this.el("spectrogram-camera-state").textContent=button.dataset.spectrogramPreset==="top"?"Top view · cameras linked":"Perspective · cameras linked";
      }));
      this.el("spectrogram-expand").addEventListener("click",()=>this.toggleExpanded());
      this.escape=event=>{
        if(!this.host.classList.contains("is-expanded"))return;
        if(event.key==="Escape"){this.toggleExpanded(false);return;}
        if(event.key==="Tab"){
          const focusable=[...this.host.querySelectorAll("button,select,[tabindex='0']")].filter(el=>el.getClientRects().length&&!el.disabled);
          const first=focusable[0],last=focusable[focusable.length-1];
          if(event.shiftKey&&this.doc.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&this.doc.activeElement===last){event.preventDefault();first?.focus();}
        }
      };
      doc.addEventListener("keydown",this.escape);
      this.setMode("3d");
    }
    createViews(){
      if(Object.keys(this.views).length||!this.result)return;
      if(!root.TRecapSpectrogram3D){this.fallback("3D rendering is unavailable. The 2D spectrogram remains available.");return;}
      for(const name of ["original","processed"]){
        this.views[name]=new root.TRecapSpectrogram3D.View(this.el(`spectrogram3d-${name}`),{
          onCameraChange:camera=>{
            const other=name==="original"?"processed":"original";
            this.views[other]?.setCamera(camera);
            this.el("spectrogram-camera-state").textContent="Custom view · cameras linked";
          },
          onStatus:message=>{
            this.statuses[name]=message;
            if(!this.statusScheduled)this.statusScheduled=requestAnimationFrame(()=>{this.statusScheduled=null;this.showStatus();});
          }
        });
      }
    }
    fallback(message){
      this.el("spectrogram-status").textContent=message;
      this.el("spectrogram-status").hidden=false;
      if(this.mode!=="2d")this.setMode("2d");
    }
    showStatus(){
      if(this.disposed)return;
      const unavailable=Object.values(this.views).some(view=>!view.isAvailable());
      if(unavailable){this.fallback("3D graphics are unavailable or recovering in this browser. Use the 2D map, or retry 3D after graphics are restored.");return;}
      const metadata=this.views.original?.getMetadata();
      if(!metadata)return;
      const frameNote=metadata.pooled?`${metadata.visibleFrameCount.toLocaleString()} recorded rows shown as ${metadata.timeSliceCount} peak-pooled slices`:`${metadata.timeSliceCount.toLocaleString()} recorded time slices`;
      const flushNote=metadata.omittedAfterDuration?` · ${metadata.omittedAfterDuration} flush row${metadata.omittedAfterDuration===1?"":"s"} beyond playback omitted`:"";
      this.el("spectrogram-density").textContent=`${frameNote} · ${metadata.frequencyBinCount} frequency bins${flushNote}`;
      this.el("spectrogram-status").hidden=true;
    }
    setMode(mode){
      if(!this.host)return;
      this.mode=mode==="2d"?"2d":"3d";
      if(this.mode==="3d")this.dataKey=null;
      if(this.mode==="2d"&&this.host.classList.contains("is-expanded"))this.toggleExpanded(false);
      this.modeButtons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.spectrogramMode===this.mode)));
      this.el("spectrogram-map").hidden=this.mode!=="2d";
      this.el("spectrogram-volume").hidden=this.mode!=="3d";
      this.el("spectrogram-3d-controls").hidden=this.mode!=="3d";
      this.el("spectrogram-3d-guide").hidden=this.mode!=="3d";
      this.host.classList.toggle("is-3d",this.mode==="3d");
      this.host.querySelector(".chart-caption").textContent=this.mode==="3d"
        ?"Time × frequency × relative power. Both surfaces share the original peak, camera and display range. The plum cursor follows audio playback. Changing this view does not run the board."
        :"Time × frequency, with color showing relative power from -100 to 0 dB. Both maps share the original peak. The cursor follows audio playback. Changing this view does not run the board.";
      this.refresh();
      // Existing 2D charts redraw after the previously hidden canvases get layout.
      root.dispatchEvent(new Event("resize"));
    }
    toggleExpanded(force){
      const expanded=typeof force==="boolean"?force:!this.host.classList.contains("is-expanded");
      this.host.classList.toggle("is-expanded",expanded);
      this.doc.body.classList.toggle("spectrogram-expanded",expanded);
      this.el("spectrogram-expand").setAttribute("aria-expanded",String(expanded));
      this.el("spectrogram-expand").textContent=expanded?"Exit expanded view":"Expand view";
      if(!expanded)this.el("spectrogram-expand").focus();
      this.refresh();root.dispatchEvent(new Event("resize"));
    }
    update(result,time,referencePeak){
      if(!this.host||this.disposed)return;
      if(result!==this.result){this.result=result;this.dataKey=null;}
      this.referencePeak=Number(referencePeak)||1;this.time=Number(time)||0;
      this.refresh();
    }
    refresh(){
      if(!this.host||this.disposed)return;
      const signals=this.doc.getElementById("panel-signals");
      const visible=this.mode==="3d"&&!signals?.hidden;
      if(visible)this.createViews();
      for(const view of Object.values(this.views))view.setVisible(visible);
      if(!visible||!this.result)return;
      const maxFrequency=Number(this.el("spectrogram-frequency").value);
      const dbFloor=Number(this.el("spectrogram-depth").value);
      const key=`${this.result.id}:${maxFrequency}:${dbFloor}:${this.referencePeak}`;
      if(key!==this.dataKey){
        this.dataKey=key;
        const s=this.result.spectra;
        try{
          for(const name of ["original","processed"]){
            const metadata=this.views[name]?.setData({times:s.times,frequencies:s.frequencies,
              frames:name==="original"?s.before:s.after,duration:this.result.duration,
              referencePeak:this.referencePeak,dbFloor,maxFrequency});
            if(!metadata)throw new Error("Spectral rows are not available for this capture.");
          }
          this.el("spectrogram-scale").textContent=`${dbFloor} to 0 dB · shared original peak`;
          this.showStatus();
        }catch(error){this.fallback(`Cannot build the 3D surface: ${error.message} The 2D map is still available.`);return;}
      }
      for(const view of Object.values(this.views)){view.resize();view.setTime(this.time);}
      this.el("spectrogram-position").textContent=`Playback ${this.time.toFixed(2)} s`;
    }
    dispose(){
      this.disposed=true;
      if(this.statusScheduled)cancelAnimationFrame(this.statusScheduled);
      for(const view of Object.values(this.views))view.dispose();
      this.doc.removeEventListener("keydown",this.escape);
      this.doc.body.classList.remove("spectrogram-expanded");
    }
  }
  root.TRecapSpectrogramPanel={View};
})(typeof window!=="undefined"?window:globalThis);
