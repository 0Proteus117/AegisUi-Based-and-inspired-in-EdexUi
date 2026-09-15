"use strict";

// Browser-only view/controller. All identity, approval and file work belongs to
// the fixed main-process APIs. Selection is transient, never shadow persistence.
class StudStorageWorkspace {
    constructor(options){this.request=options.request;this.escape=options.escape;this.parent=options.parent;this.generation=0;this.reset();}
    reset(){this.generation++;this.inspection=0;clearTimeout(this.timer);this.state={profiles:[],catalog:null,history:[],manifest:null,targetId:"",selected:new Set(),courseMaterial:false,error:"",busy:false,operation:false,offset:0,manifestOffset:0,confirmLimited:false,confirmShared:false};}
    active(){return this.state.busy||["COPYING","ROLLING_BACK"].includes(this.state.manifest?.state);}
    setManifest(value){if(value.id!==this.state.manifest?.id){this.state.confirmLimited=false;this.state.confirmShared=false;this.state.manifestOffset=0;}this.state.manifest=value;}
    assignmentId(){return this.parent.assignment()?.id;}
    redraw(){
        const focused=typeof document!=="undefined"?document.activeElement:null,reference=focused?.dataset?.storageFile,target=focused?.hasAttribute?.("data-storage-target");
        const disclosures=typeof document!=="undefined"?[...document.querySelectorAll("[data-storage-disclosure][open]")].map(item=>item.dataset.storageDisclosure):[];
        this.parent.parent.render();
        if(typeof document!=="undefined"){
            for(const item of document.querySelectorAll("[data-storage-disclosure]"))item.open=disclosures.includes(item.dataset.storageDisclosure);
            if(reference)[...document.querySelectorAll("[data-storage-file]")].find(item=>item.dataset.storageFile===reference)?.focus({preventScroll:true});
            else if(target)document.querySelector("[data-storage-target]")?.focus({preventScroll:true});
        }
    }
    size(bytes){return bytes===null||bytes===undefined?"Size not checked":bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GiB`:`${(bytes/1024**2).toFixed(2)} MiB`;}
    async open(){
        const id=this.assignmentId(),generation=this.generation;this.state.error="";
        try{
            const [profiles,history]=await Promise.all([this.request("stud-storage-profiles",{}),this.request("stud-storage-history",{assignmentId:id,limit:20})]);
            if(id!==this.assignmentId()||generation!==this.generation)return;
            this.state.profiles=profiles;this.state.history=history;this.state.targetId=this.state.targetId||profiles.find(profile=>profile.kind==="EXTERNAL")?.id||profiles[0]?.id||"";
            await this.inventory();
            if(id!==this.assignmentId()||generation!==this.generation)return;
            const unfinished=history.find(item=>["COPYING","ROLLING_BACK"].includes(item.state));if(unfinished)await this.inspect(unfinished.id);
        }catch(error){if(generation===this.generation)this.state.error=error.message;}
    }
    async inventory(){
        const id=this.assignmentId(),generation=this.generation;
        const catalog=await this.request("stud-storage-catalog",{assignmentId:id,includeCourseMaterial:this.state.courseMaterial,offset:this.state.offset,limit:50});
        if(id===this.assignmentId()&&generation===this.generation)this.state.catalog=catalog;
    }
    async inspect(manifestId,offset=0){
        const id=this.assignmentId(),generation=this.generation,ticket=++this.inspection,result=await this.request("stud-storage-transfer-read",{assignmentId:id,manifestId,offset,limit:50});
        if(id===this.assignmentId()&&generation===this.generation&&ticket===this.inspection){this.setManifest(result);this.state.manifestOffset=offset;this.schedule();}
    }
    schedule(){
        clearTimeout(this.timer);
        if(!this.state.manifest||(!this.state.operation&&!["COPYING","ROLLING_BACK"].includes(this.state.manifest.state)))return;
        const generation=this.generation,manifestId=this.state.manifest.id;
        this.timer=setTimeout(async()=>{
            if(this.parent.state.mode!=="STORAGE"||generation!==this.generation)return;
            try{await this.inspect(manifestId,this.state.manifestOffset);if(generation===this.generation)this.redraw();}catch(error){if(generation===this.generation){this.state.error=error.message;this.redraw();}}
        },1500);
    }
    renderManifest(){
        const m=this.state.manifest;if(!m)return `<aside class="stud-storage-inspector"><h3>Review before moving</h3><p>Choose a location and select managed files. “Inspect selection” verifies their actual bytes and saves a reviewable manifest. It does not move anything.</p></aside>`;
        const active=["COPYING","ROLLING_BACK"].includes(m.state),run=m.run;
        return `<aside class="stud-storage-inspector"><h3>${this.escape(m.state.replace(/_/g," "))}</h3><p>${m.totalItems} selected files · ${this.size(m.totalBytes)}</p>
            ${run?`<p role="status">${this.escape(run.statusSummary||run.state)}</p>${run.progressMode==="DETERMINATE"?`<label>${run.progressCurrent} / ${run.progressTotal} ${this.escape(run.progressUnit)}<progress value="${run.progressCurrent}" max="${run.progressTotal}"></progress></label>`:""}`:""}
            <p>Original copies are retained. Notes, citations, chunks and other canonical records stay in the local academic database. Ollama models are not copied.</p>
            ${m.omittedFileCount||m.issueCount||m.inventoryTruncated?`<p class="stud-storage-notice">Limited scope: ${m.omittedFileCount} inventoried files not selected; ${m.issueCount} source issues${m.inventoryTruncated?"; inventory limit reached":""}. This is not a complete portable Assignment package.</p>`:""}
            ${m.errorCode?`<p role="alert">${this.escape(m.errorCode.replace(/_/g," "))}</p>`:""}
            ${m.state==="PREPARED"?`<label><input type="checkbox" data-storage-confirm-limited ${this.state.confirmLimited?"checked":""}> I understand this transfers selected managed files only.</label>${m.sharedReferenceCount?`<label><input type="checkbox" data-storage-confirm-shared ${this.state.confirmShared?"checked":""}> I understand ${m.sharedReferenceCount} shared file references will use this location in other academic contexts too.</label>`:""}<button type="button" data-storage-action="execute" ${this.state.busy?"disabled":""}>Confirm transfer</button><button type="button" data-storage-action="cancel">Discard preparation</button>`:""}
            ${active?`<button type="button" data-storage-action="cancel">Cancel transfer</button>`:""}
            ${m.state==="APPLIED"?`<details><summary>Restore retained originals</summary><p>Verifies the originals before restoring their locations. Copies at the destination are kept.</p><button type="button" data-storage-action="rollback" ${this.state.busy?"disabled":""}>Verify and restore originals</button></details>`:""}
            <details data-storage-disclosure="verification"><summary>Source and verification details</summary><p>${m.sources.length} source references on this page. Approved: ${this.escape(m.approvedAt||"Not approved")}</p><ul>${m.reviewIssues.map(issue=>`<li>${this.escape(issue.code.replace(/_/g," "))}</li>`).join("")}</ul><ol start="${this.state.manifestOffset+1}">${m.items.map(item=>`<li><span>${this.escape(item.reference)}</span><small>${this.size(item.byteSize)}</small><code>${this.escape(item.sha256)}</code></li>`).join("")}</ol><nav aria-label="Verified file pages"><button type="button" data-storage-action="manifest-previous" ${this.state.manifestOffset===0||this.active()?"disabled":""}>Previous files</button><span>${this.state.manifestOffset+1}–${this.state.manifestOffset+m.items.length} of ${m.totalItems}</span><button type="button" data-storage-action="manifest-next" ${m.nextOffset===null||this.active()?"disabled":""}>Next files</button></nav></details>
        </aside>`;
    }
    render(){
        const s=this.state,c=s.catalog,e=this.escape,profile=s.profiles.find(item=>item.id===s.targetId);
        return `<section class="stud-storage-workspace ${s.manifest?"has-manifest":""}"><header><div><h2>Academic files</h2><p>Choose where managed files live. Nothing moves until you review and confirm a selection.</p></div><button type="button" data-storage-action="refresh" ${this.active()?"disabled":""}>Refresh</button></header>
            ${s.error?`<p class="stud-storage-notice" role="alert">${e(s.error)}</p>`:""}${s.busy?`<p role="status">${s.operation?"Storage operation in progress":"Reading storage selection"}…</p>`:""}
            <div class="stud-storage-body"><main><label>Destination<select data-storage-target ${this.active()?"disabled":""}>${s.profiles.map(item=>`<option value="${e(item.id)}" ${item.id===s.targetId?"selected":""}>${e(item.label)} · ${e(item.availability.replace(/_/g," "))}</option>`).join("")}</select></label>
            <p>${profile?`${this.size(profile.availableBytes)} available. `:""}New imports remain on this Mac until explicitly relocated.</p>
            <details class="stud-storage-location-options" data-storage-disclosure="locations"><summary>Storage locations and scope</summary><label>New location name<input data-storage-label value="Academic archive" maxlength="120"></label><button type="button" data-storage-action="choose" ${this.active()?"disabled":""}>Choose external folder…</button>${profile?.kind==="EXTERNAL"?`<button type="button" data-storage-action="reconnect" ${this.active()?"disabled":""}>Locate this storage folder…</button>`:""}<label><input type="checkbox" data-storage-course ${s.courseMaterial?"checked":""} ${this.active()?"disabled":""}> Include shared Course material</label></details>
            <div class="stud-storage-file-heading"><h3>Managed files${c?` · ${c.totalFiles}`:""}</h3><button type="button" data-storage-action="select-page" ${this.active()?"disabled":""}>Select this page</button></div>
            ${c?.files.length?`<ul class="stud-storage-file-list">${c.files.map(file=>`<li><label><input type="checkbox" data-storage-file="${e(file.reference)}" ${s.selected.has(file.reference)?"checked":""} ${this.active()||file.profileId===s.targetId?"disabled":""}><span><strong>${e(file.label)}</strong><small>${file.profileId===s.targetId?"Already at destination":this.size(file.declaredBytes)}${file.shared?" · Shared reference":""}</small></span></label></li>`).join("")}</ul>`:`<p>No managed files on this page. Canonical metadata and remote references are not downloaded by this view.</p>`}
            ${c?.truncated?`<p class="stud-storage-notice">Inventory limit reached. This view does not represent complete Assignment coverage.</p>`:""}
            <nav aria-label="Managed file pages"><button type="button" data-storage-action="previous" ${s.offset===0||this.active()?"disabled":""}>Previous</button><span>Page ${Math.floor(s.offset/50)+1}</span><button type="button" data-storage-action="next" ${c?.nextOffset===null||!c||this.active()?"disabled":""}>Next</button></nav>
            <button type="button" data-storage-action="prepare" ${this.active()||!s.selected.size||profile?.availability!=="AVAILABLE"?"disabled":""}>Inspect selection (${s.selected.size})</button>
            <details class="stud-storage-history" data-storage-disclosure="history"><summary>Recent transfers</summary>${s.history.length?`<ul>${s.history.map(item=>`<li><button type="button" data-storage-history="${e(item.id)}" ${this.active()?"disabled":""}>${e(item.purpose)} · ${e(item.state)} · ${e(item.createdAt)}</button></li>`).join("")}</ul>`:`<p>No transfers have been recorded.</p>`}</details></main>${this.renderManifest()}</div></section>`;
    }
    async handleChange(event){
        const field=event.target;if(!field.closest(".stud-storage-workspace"))return false;
        if(this.active())return true;
        if(field.hasAttribute("data-storage-confirm-limited")){this.state.confirmLimited=field.checked;return true;}
        if(field.hasAttribute("data-storage-confirm-shared")){this.state.confirmShared=field.checked;return true;}
        if(field.hasAttribute("data-storage-file")){if(field.checked)this.state.selected.add(field.dataset.storageFile);else this.state.selected.delete(field.dataset.storageFile);this.redraw();return true;}
        if(field.hasAttribute("data-storage-target")){this.state.targetId=field.value;this.state.selected.clear();this.state.manifest=null;this.redraw();return true;}
        if(field.hasAttribute("data-storage-course")){const generation=this.generation;this.state.courseMaterial=field.checked;this.state.selected.clear();this.state.manifest=null;this.state.offset=0;await this.inventory();if(generation===this.generation)this.redraw();return true;}
        return false;
    }
    async handleClick(event){
        const button=event.target.closest("[data-storage-action], [data-storage-history]");if(!button)return false;
        const assignmentId=this.assignmentId(),generation=this.generation,action=button.dataset.storageAction,root=button.closest(".stud-storage-workspace");
        if(!root||button.disabled||this.active()&&action!=="cancel")return true;
        const current=()=>generation===this.generation&&assignmentId===this.assignmentId();
        const manifest=this.state.manifest,profile=this.state.profiles.find(item=>item.id===this.state.targetId);
        const mutation=manifest?{assignmentId,manifestId:manifest.id,expectedVersion:manifest.rowVersion}:null;
        this.state.error="";
        const locked=["prepare","execute","rollback","choose","reconnect","refresh","next","previous"].includes(action);
        if(locked)this.state.busy=true;
        try{
            if(button.hasAttribute("data-storage-history"))await this.inspect(button.dataset.storageHistory);
            else if(action==="refresh")await this.open();
            else if(action==="select-page"){for(const file of this.state.catalog?.files||[])if(file.profileId!==this.state.targetId)this.state.selected.add(file.reference);}
            else if(action==="previous"||action==="next"){this.state.offset=action==="next"?this.state.catalog.nextOffset:Math.max(0,this.state.offset-50);await this.inventory();}
            else if(action==="manifest-previous"||action==="manifest-next")await this.inspect(manifest.id,action==="manifest-next"?manifest.nextOffset:Math.max(0,this.state.manifestOffset-50));
            else if(action==="choose"){
                const result=await this.request("stud-storage-profile-choose",{label:root.querySelector("[data-storage-label]").value});
                if(!result.cancelled&&current()){const profiles=await this.request("stud-storage-profiles",{});if(current()){this.state.profiles=profiles;this.state.targetId=result.profile.id;this.state.selected.clear();this.state.manifest=null;}}
            }else if(action==="reconnect"){await this.request("stud-storage-profile-reconnect",{profileId:profile.id,expectedVersion:profile.rowVersion});if(current())await this.open();}
            else if(action==="prepare"){
                this.state.busy=true;this.redraw();const result=await this.request("stud-storage-transfer-prepare",{assignmentId,targetProfileId:profile.id,expectedTargetVersion:profile.rowVersion,purpose:profile.kind==="LOCAL"?"PORTABLE":"RELOCATE",includeCourseMaterial:this.state.courseMaterial,expectedScopeHash:this.state.catalog.scopeHash,references:[...this.state.selected]});
                if(current())this.setManifest(result);
            }else if(action==="execute"||action==="rollback"){
                const confirmations=action==="execute"?{confirmLimitedScope:!!root.querySelector("[data-storage-confirm-limited]")?.checked,confirmSharedReferences:!!root.querySelector("[data-storage-confirm-shared]")?.checked}:{};
                this.state.busy=true;this.state.operation=true;this.schedule();this.redraw();
                const result=await this.request(action==="execute"?"stud-storage-transfer-execute":"stud-storage-transfer-rollback",{...mutation,...confirmations});
                if(current()){this.setManifest(result);this.state.selected.clear();await this.open();}
            }else if(action==="cancel"){
                const latest=await this.request("stud-storage-transfer-read",{assignmentId,manifestId:manifest.id});if(!current())return true;await this.request("stud-storage-transfer-cancel",{assignmentId,manifestId:manifest.id,expectedVersion:latest.rowVersion});if(current())await this.inspect(manifest.id);
            }
        }catch(error){if(generation===this.generation){this.state.error=error.message;if(manifest&&["execute","rollback"].includes(action))try{await this.inspect(manifest.id);}catch(_error){/* Keep the original typed error. */}}}
        finally{if(current()){if(locked){this.state.busy=false;if(["execute","rollback"].includes(action))this.state.operation=false;}this.schedule();this.redraw();}}
        return true;
    }
}
if(typeof window!=="undefined")window.StudStorageWorkspace=StudStorageWorkspace;
module.exports={StudStorageWorkspace};
