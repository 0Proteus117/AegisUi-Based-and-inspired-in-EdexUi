"use strict";
class StudFinalPackageWorkspace {
    constructor(options) {Object.assign(this,options);this.generation=0;this.reset();}
    reset(){this.generation++;this.state={options:null,history:[],historyBefore:null,package:null,error:"",notice:"",busy:false};}
    assignmentId(){return this.parent.assignment()?.id;}
    redraw(){this.parent.parent.render();}
    async open(){
        const id=this.assignmentId(),generation=this.generation;
        try{const [options,history]=await Promise.all([this.request("stud-final-package-options",{assignmentId:id}),this.request("stud-final-package-list",{assignmentId:id,beforeRevision:this.state.historyBefore})]);if(id===this.assignmentId()&&generation===this.generation)Object.assign(this.state,{options,history,error:""});}
        catch(error){if(generation===this.generation)this.state.error=error.message;}
    }
    render(){
        const e=this.escape,s=this.state,p=s.package,o=s.options,artifacts=Array.isArray(o?.artifacts)?o.artifacts:o?.artifacts?.items||[];
        return `<section class="stud-final-package-workspace"><header><div><h2>Final package</h2><p>Choose a saved Draft, inspect the candidate and its remaining questions, then record your approval.</p></div></header>
        ${s.error?`<p role="alert">${e(s.error)}</p>`:""}${s.notice?`<p role="status">${e(s.notice)}</p>`:""}${s.busy?`<p role="status">Checking package…</p>`:""}
        <div class="stud-final-package-layout"><aside><form data-final-package-form><h3>Create a review copy</h3><label>Saved Draft version<select name="version" required>${(o?.drafts||[]).map(d=>`<option value="${e(d.id)}">${e(d.title)} · V${d.versionNumber}</option>`).join("")}</select></label>
        <label>Reference style<select name="style">${(o?.styles||[]).map(style=>`<option value="${e(style)}" ${style==="harvard1"?"selected":""}>${e(style)}</option>`).join("")}</select></label>
        <details><summary>Choose appendices</summary><p>Managed files are copied. Other objects are included as references. Up to 20 selections. This selector shows the latest 50 Draft versions and up to 100 Artifacts.</p>${artifacts.filter(a=>a.canonicalObjectType!=="FINAL_PACKAGE").map(a=>`<label class="stud-final-package-choice"><input type="checkbox" name="appendix" value="${e(a.id)}">${e(a.label)}</label>`).join("")||"<p>No registered Artifacts.</p>"}</details>
        <button type="submit" ${s.busy||!o?.drafts?.length?"disabled":""}>Build review package</button>${!o?.drafts?.length?"<p>Save a Draft Version in Composition to begin.</p>":""}</form>
        <details ${s.history.length?"open":""}><summary>Saved packages</summary><ul>${s.history.map(h=>`<li><button type="button" data-final-package-action="inspect" data-package-id="${e(h.id)}" ${s.busy?"disabled":""}>${e(h.title)} · Package ${h.revision}</button><small>${h.approvedAt?"Approved":"Awaiting review"}</small></li>`).join("")}</ul></details></aside>
        <main>${s.history.length===25||s.historyBefore?`<nav aria-label="Package history pages">${s.historyBefore?'<button type="button" data-final-package-action="newest">Latest packages</button>':""}${s.history.length===25?'<button type="button" data-final-package-action="older">Older packages</button>':""}</nav>`:""}${p?`<header><h3>Package ${p.revision} · ${e(p.title)}</h3><p>${e(p.state.replace(/_/g," "))}${p.approval?` · ${e(p.approval.approvedAt)}`:""}</p><p>Files: ${e(p.integrity.replace(/_/g," "))} · Sources: ${e(p.freshness.replace(/_/g," "))}</p></header>
        <details class="stud-final-package-issues" open><summary>${p.snapshot.issues.length} review notes${p.snapshot.issues.some(i=>i.blocking)?" · approval blocked":""}</summary><ul>${p.snapshot.issues.map(i=>`<li>${i.blocking?"Action needed: ":""}${e(i.message)}</li>`).join("")}</ul></details>
        <details><summary>Requirements, sources and review evidence</summary><p>Section placement does not establish academic satisfaction. Citation records do not prove support.</p><h4>Requirements</h4><ul>${p.snapshot.requirements.map(r=>`<li>${e(r.label)} · ${e(r.resolutionState)} · ${r.placements.length} placement(s)</li>`).join("")}</ul><h4>Citation integrity</h4><ul>${p.snapshot.citations.map(c=>`<li>${e(c.sourceType)} · ${e(c.citationState)} · ${e(c.freshness.state)}${c.pageStart?` · Page ${c.pageStart}`:""}<p>${e(c.reason)}</p></li>`).join("")||"<li>No placed citations.</li>"}</ul><h4>Committee findings</h4><ul>${p.snapshot.committee.findings.map(f=>`<li>${e(f.title)} · ${e(f.status)}<p>${e(f.explanation)}</p></li>`).join("")||"<li>No findings for this exact version.</li>"}</ul></details>
        <h4>Candidate preview</h4><pre class="stud-final-package-preview">${e(p.preview||"Saved files are unavailable; preview cannot be verified.")}</pre>
        <details><summary>Package contents and fingerprint</summary><ul>${p.files.map(f=>`<li>${e(f.name)} · ${f.byteSize} bytes</li>`).join("")}</ul><code>${e(p.manifestHash)}</code><p>HTML and Markdown candidate; report and audit files are separate. No university submission occurs.</p></details>
        ${!p.approval?`<div class="stud-final-package-approval"><label><input type="checkbox" data-package-reviewed> I have inspected this candidate and its included files.</label><label><input type="checkbox" data-package-acknowledged> I have reviewed the remaining limitations and citation notes.</label><button type="button" data-final-package-action="approve" ${s.busy||p.integrity!=="VERIFIED"||p.freshness!=="CURRENT"||p.snapshot.issues.some(i=>i.blocking)?"disabled":""}>Approve for manual submission</button></div>`:""}
        <button type="button" data-final-package-action="export" ${s.busy||p.integrity!=="VERIFIED"?"disabled":""}>${p.approval?"Export approved package":"Export review copy"}</button>`:`<h3>Inspect before approving</h3><p>Your saved Draft will become an immutable candidate with a bibliography, selected appendices and separate review reports. Building a package does not approve it.</p>`}</main></div></section>`;
    }
    async act(work){
        if(this.state.busy)return;const generation=this.generation,id=this.assignmentId();this.state.busy=true;this.state.error="";this.redraw();
        try{const result=await work(id);if(generation!==this.generation||id!==this.assignmentId())return;
            if(result?.manifestHash)this.state.package=result;else if(result?.verified)this.state.notice=`Export verified: ${result.fileCount} files. ${result.approved?"Approved package.":"Unapproved review copy."}`;
            await this.open();
        }catch(error){if(generation===this.generation)this.state.error=error.message;}
        finally{if(generation===this.generation){this.state.busy=false;this.redraw();}}
    }
    async handleSubmit(event){const form=event.target.closest("[data-final-package-form]");if(!form)return false;event.preventDefault();const version=form.elements.version.value,style=form.elements.style.value,artifactIds=[...form.querySelectorAll('[name="appendix"]:checked')].map(i=>i.value);await this.act(assignmentId=>this.request("stud-final-package-create",{assignmentId,draftVersionId:version,citationStyle:style,artifactIds}));return true;}
    async handleClick(event){const button=event.target.closest("[data-final-package-action]");if(!button)return false;
        const action=button.dataset.finalPackageAction,p=this.state.package,root=button.closest(".stud-final-package-workspace");
        if(action==="older"||action==="newest"){if(!this.state.busy){this.state.historyBefore=action==="newest"?null:this.state.history.at(-1)?.revision;await this.act(async()=>null);}return true;}
        if(!["inspect","approve","export"].includes(action))return true;
        const reviewed=!!root.querySelector("[data-package-reviewed]")?.checked,acknowledged=!!root.querySelector("[data-package-acknowledged]")?.checked;
        await this.act(assignmentId=>action==="inspect"?this.request("stud-final-package-read",{assignmentId,packageId:button.dataset.packageId}):this.request(action==="approve"?"stud-final-package-approve":"stud-final-package-export",{assignmentId,packageId:p.id,expectedManifestHash:p.manifestHash,...(action==="approve"?{confirmReviewed:reviewed,acknowledgeIssues:acknowledged}:{})}));return true;
    }
}
if(typeof window!=="undefined")window.StudFinalPackageWorkspace=StudFinalPackageWorkspace;
module.exports={StudFinalPackageWorkspace};
