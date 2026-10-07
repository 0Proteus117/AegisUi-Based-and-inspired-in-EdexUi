#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),{pathToFileURL}=require("url");
const [port,profile,out]=process.argv.slice(2);
assert(/^\d{4,5}$/.test(port)&&profile&&path.basename(profile).startsWith("ux1-synthetic-")&&out);
async function main(){
 const fixture=JSON.parse(fs.readFileSync(path.join(profile,"synthetic-fixture.json")));
 const page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.title==="AegisUi");
 assert.equal(page?.url,pathToFileURL(path.resolve(__dirname,"../src/ui.html")).href,"Use this checkout only");
 const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),exceptions=[];let seq=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+" timeout"));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{const end=Date.now()+45000;while(Date.now()<end){if(await run(expression))return;await new Promise(r=>setTimeout(r,30));}throw Error("Not reached: "+expression);};
 const cc="window.workspaceManager.studCommandCenter",wb=`${cc}.assignmentWorkspace.workbench`;
 const click=async selector=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Control unavailable: '+${JSON.stringify(selector)});el.click();})()`);await run("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");await wait(`!${wb}.state.busy && !${cc}.simpleNavigation.busy`);};
 const invoke=(channel,payload)=>run(`(async()=>{const r=await window.aegis.stud[${JSON.stringify(channel)}](${JSON.stringify(payload)});if(!r.ok)throw Error(r.code+': '+r.message);return r.data;})()`);
 const type=async text=>run(`(()=>{const t=document.querySelector('[data-stud-workbench-text]');t.value=${JSON.stringify(text)};t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const results=[];fs.mkdirSync(out,{recursive:true});
 try{
  await call("Runtime.enable");await call("Page.reload",{ignoreCache:true});await wait("!!window.workspaceManager");await run("window.workspaceManager.activate('student',false)");await wait(`!!${cc}.simpleNavigation && !${cc}.simpleNavigation.busy`);
  await run(`${cc}.setActiveView('MODULES');${cc}.simpleNavigation.load({browse:'YEARS'})`);await wait(`!${cc}.simpleNavigation.busy`);
  if(process.argv.includes("--restart-only")){
   const expected=JSON.parse(fs.readFileSync(path.join(out,"restart-expected.json")));
   await click(`[data-stud-simple="continue"][data-value="${expected.assignmentId}"]`);
   await click('[data-stud-simple="workspace"]');await click('[data-stud-workbench="manual"]');
   assert.equal(await run(`${wb}.state.draft.id`),expected.draftId);
   assert.equal(await run(`${wb}.state.draft.currentVersion.id`),expected.versionId);
   assert.equal(await run(`${wb}.content()`),expected.content);
   assert.equal(await run("document.querySelector('[data-stud-workbench=save]').disabled"),true);
   await type(expected.content+' Unsaved restart check.');
   assert.equal(await run("document.querySelector('[data-stud-workbench=save]').disabled"),false);
   assert.equal(await run("document.querySelector('[data-stud-workbench=export]').disabled"),true);
   // Explicitly discard this temporary check; canonical saved writing is unchanged.
   await run(`${cc}.render()`);await click('[data-stud-workbench="discard"]');
   assert.equal(await run(`${wb}.content()`),expected.content);
   await click('[data-stud-workbench="panel"][data-value="notes"]');await click('[data-stud-workspace-note-create]');
   await run(`(()=>{const f=document.querySelector('[data-stud-research-form="NOTE"]');f.elements.title.value='Unsaved note must not vanish';f.elements.title.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await click('[data-stud-workbench="panel"][data-value="sources"]');
   assert.equal(await run(`${wb}.state.panel`),'notes');
   assert.equal(await run("document.querySelector('[data-stud-research-form=NOTE]').elements.title.value"),'Unsaved note must not vanish');
   await click('[data-workbench-discard-note]');assert.equal(await run(`${wb}.noteDirty`),false);
   fs.writeFileSync(path.join(out,"restart-result.json"),JSON.stringify({passed:11,failed:0,exactDraft:true,exactVersion:true,exactContent:true,saveControls:true,unsavedNoteProtected:true,providerInvocation:false}));
   console.log("RESTART: 11 passed / 0 failed");return;
  }
  // Actual navigation into the selected synthetic assignment.
  const yearIndex=await run(`${cc}.simpleNavigation.page.items.findIndex(y=>y.academicYear==='2026/27')`);
  if(await run(`${cc}.simpleNavigation.page.preference?.academicYear==='2026/27'`))await click('[data-stud-simple="current-year"]');
  else await click(`[data-stud-simple="year"][data-value="${yearIndex}"]`);
  await click(`[data-stud-simple="course"][data-value="${fixture.courses[0].id}"]`);
  await click('[data-stud-simple="assignment"]');await click('[data-stud-simple="workspace"]');
  await matrix("mode-choice");await click('[data-stud-workbench="manual"]');await matrix("requirements-needed");
  // Synthetic reviewed inputs only, using the same typed, validated main APIs.
  let contract=await invoke("stud-requirements-create-draft",{assignmentId:fixture.assignmentId});
  for(const c of contract.candidates.filter(c=>c.disposition==="PENDING"))contract=await invoke("stud-requirements-review-candidate",{contractId:contract.id,candidateId:c.id,expectedVersion:contract.rowVersion,disposition:"INCLUDED"});
  contract=await invoke("stud-requirements-approve",{contractId:contract.id,expectedVersion:contract.rowVersion,approveAsIncomplete:true});
  await run(`${wb}.load()`);await click('[data-stud-workbench="prepare"]');await matrix("outline-empty");
  await run(`(()=>{const f=document.querySelector('[data-workbench-section]');f.elements.title.value='Comparison and limitations';f.elements.purpose.value='Compare the synthetic alternatives without inventing measurements.';f.requestSubmit();})()`);
  await wait(`!${wb}.state.busy && ${wb}.plan()?.sections.length===1`);await matrix("outline-review");
  await click('[data-stud-workbench="review-outline"]');await click('[data-stud-workbench="create-draft"]');await wait(`!!${wb}.state.draft`);
  const text="Synthetic acceptance writing. The available material does not establish measured superiority. Assumptions require verification. <script>Never executable.</script>";
  await type(text);await matrix("manual-writing");
  await click('[data-stud-workbench="panel"][data-value="sources"]');
  await click('[data-stud-workspace-object-id]');await wait(`!!${cc}.assignmentWorkspace.state.preview`);
  assert.equal(await run(`${wb}.content()`),text);await matrix("source-beside-writing");
  await click('[data-stud-workbench="panel"][data-value="notes"]');await click('[data-stud-workspace-note-create]');
  await wait("!!document.querySelector('[data-stud-editor][contenteditable=true]')");
  await run(`(()=>{const f=document.querySelector('[data-stud-research-form="NOTE"]');f.elements.title.value='Synthetic comparison note';const editor=document.querySelector('[data-stud-editor]');editor.focus();document.execCommand('insertText',false,'Evidence must be checked before asserting performance.');f.requestSubmit();})()`);
  await wait(`!document.querySelector('[data-stud-research-form="NOTE"]') || ${cc}.state.assignmentContext?.notes?.some(n=>n.title==='Synthetic comparison note')`);
  await matrix("notes-beside-writing");assert.equal(await run(`${wb}.content()`),text);
  await click('[data-stud-workbench="save"]');await wait(`!!${wb}.state.draft.currentVersion`);await matrix("saved-writing");
  const draftId=await run(`${wb}.state.draft.id`), versionId=await run(`${wb}.state.draft.currentVersion.id`);
  await click('[data-stud-workbench="export"]');await wait("!!document.querySelector('[data-final-package-form] select[name=version]')");
  assert.equal(await run("document.querySelector('[data-final-package-form] select[name=version]').value"),versionId);
  await run("document.querySelector('[data-final-package-form]').requestSubmit()");await wait(`!!${cc}.assignmentWorkspace.finalPackage.state.package && !${cc}.assignmentWorkspace.finalPackage.state.busy`);
  assert((await run(`${cc}.assignmentWorkspace.finalPackage.state.package.preview`)).includes("Synthetic acceptance writing"));await matrix("review-package");
  await click('[data-stud-workspace-mode="WORK"]');await wait(`!${wb}.state.busy`);
  await type("A conflicting edit that must be kept.");
  const current=await invoke("stud-draft-read",{assignmentId:fixture.assignmentId,draftId});
  await invoke("stud-draft-save-version",{assignmentId:fixture.assignmentId,draftId,expectedVersion:current.rowVersion,sections:[{sectionId:await run(`${wb}.section().id`),content:"Synthetic concurrent writer"}]});
  await click('[data-stud-workbench="save"]');assert.equal(await run(`${wb}.content()`),"A conflicting edit that must be kept.");assert(await run(`${wb}.state.error.includes('unsaved text')`));await matrix("stale-save-preserves-writing");
  await click('[data-stud-workbench="discard"]');await type(text);await click('[data-stud-workbench="save"]');
  fs.writeFileSync(path.join(out,"restart-expected.json"),JSON.stringify({assignmentId:fixture.assignmentId,draftId,content:text,versionId:await run(`${wb}.state.draft.currentVersion.id`)}));
  const security=await run("({nodeAbsent:typeof require==='undefined'&&typeof process==='undefined'&&typeof Buffer==='undefined',rawIpc:!!window.aegis.ipcRenderer})");
  assert(security.nodeAbsent&&!security.rawIpc);assert.equal(exceptions.length,0);
  const report={results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,exceptions,security,scope:"Synthetic real Electron manual workflow; typed setup of reviewed requirements; no AI/provider execution or live native export claimed."};
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(report.failed,0);
  async function matrix(scenario){
   for(const [width,height,scale]of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const theme of ["dark","light","system-dark","system-light"]){
    await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
    await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:theme.endsWith("dark")?"dark":"light"}]});
    await run(`window.applyAegisAppearance(${JSON.stringify(theme.startsWith("system")?"system":theme)})`);
    const r=await run(`(()=>{const root=document.querySelector('[data-stud-main]'),b=root.getBoundingClientRect();return {overflow:root.scrollWidth>root.clientWidth+2,escaped:[...root.querySelectorAll('button,input,textarea,select,summary')].filter(e=>e.checkVisibility()).filter(e=>{const r=e.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2}).map(e=>e.outerHTML.slice(0,100)),clip:{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(innerWidth-b.x,b.width),height:Math.min(innerHeight-b.y,b.height),scale:1}}})()`);
    results.push({scenario,width,height,scale,theme,passed:!r.overflow&&!r.escaped.length,overflow:r.overflow,escaped:r.escaped});
    if(width===1440&&["dark","light"].includes(theme)&&["manual-writing","source-beside-writing","review-package"].includes(scenario)){const png=await call("Page.captureScreenshot",{format:"png",clip:r.clip,captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${scenario}-${theme}.png`),Buffer.from(png.data,"base64"));}
   }
  }
 }finally{for(const p of pending.values())clearTimeout(p.timer);ws.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
