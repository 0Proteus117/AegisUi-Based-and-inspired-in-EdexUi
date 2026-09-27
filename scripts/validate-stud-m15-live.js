#!/usr/bin/env node
"use strict";
// Automated Electron acceptance against a disposable seeded database, not
// renderer mocks. Never point this at the user's academic profile.
const fs=require("fs"),path=require("path"),assert=require("assert");
const port=Number(process.argv[2]||9265),profile=process.argv[3],out=process.argv[4];
if(!profile||!path.basename(profile).startsWith("m15-synthetic-")||!out)throw Error("Synthetic profile and output directory required");
const fixture=JSON.parse(fs.readFileSync(path.join(profile,"synthetic-fixture.json")));
async function main(){
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==="page"&&p.title==="AegisUi");assert(page);
 const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 fs.mkdirSync(out,{recursive:true});const results=[];
 try{
  await evaluate(`(async()=>{await window.workspaceManager.activate('student',false);return true;})()`);
  // STUD bootstrap has asynchronous store loading. Poll its actual ready state.
  for(let i=0;i<100;i++){if(await evaluate(`!!window.workspaceManager.studCommandCenter?.state.schema`))break;await new Promise(r=>setTimeout(r,100));}
  if(process.argv.includes("--cycle")){
   const f=fixture.scenarios.find(f=>f.scenario==="review");
   const cycle=await evaluate(`(async()=>{const invoke=async(c,p)=>{const r=await window.aegis.stud[c](p);if(!r.ok)throw Error(r.code);return r.data;},a=${JSON.stringify(f.assignmentId)};
    const p=await invoke('stud-final-package-create',{assignmentId:a,draftVersionId:${JSON.stringify(f.versionId)},citationStyle:'harvard1'});
    if(p.approval||p.integrity!=='VERIFIED'||p.freshness!=='CURRENT')throw Error('Creation incorrectly approved or failed verification');
    const input={assignmentId:a,packageId:p.id,expectedManifestHash:p.manifestHash,acknowledgeIssues:true};
    const denied=await window.aegis.stud['stud-final-package-approve'](input);if(denied.ok||denied.code!=='HUMAN_REVIEW_REQUIRED')throw Error('Approval bypass');
    const approved=await invoke('stud-final-package-approve',{...input,confirmReviewed:true});
    const restored=await invoke('stud-final-package-read',{assignmentId:a,packageId:p.id});
    if(restored.approval?.manifestHash!==p.manifestHash||restored.preview!==p.preview)throw Error('Approved package changed');
    return {assignmentId:a,packageId:p.id,manifestHash:p.manifestHash,approvedAt:approved.approval.approvedAt,integrity:restored.integrity,syntheticTest:true};})()`);
   fs.writeFileSync(path.join(out,"cycle-result.json"),JSON.stringify(cycle,null,2));console.log("M15_PACKAGED_API_CYCLE: PASS (synthetic explicit approval; no submission)");
  }
  if(process.argv.includes("--restart")){
   const prior=JSON.parse(fs.readFileSync(path.join(out,"cycle-result.json")));
   const restored=await evaluate(`window.aegis.stud['stud-final-package-read'](${JSON.stringify({assignmentId:prior.assignmentId,packageId:prior.packageId})})`);
   assert(restored.ok);assert.equal(restored.data.approval.approvedAt,prior.approvedAt);assert.equal(restored.data.manifestHash,prior.manifestHash);assert.equal(restored.data.integrity,"VERIFIED");console.log("M15_PACKAGED_RESTART: PASS immutable approval/files retained");
  }
  for(const [width,height,scale] of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const theme of ["dark","light","system-dark","system-light"]){
   await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
   await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:theme.endsWith("dark")?"dark":"light"}]});
   await evaluate(`window.applyAegisAppearance(${JSON.stringify(theme.startsWith("system")?"system":theme)})`);
   for(const f of fixture.scenarios){
    await evaluate(`(async()=>{const cc=window.workspaceManager.studCommandCenter;await cc.selectAssignment(${JSON.stringify(f.assignmentId)});const v=cc.assignmentWorkspace;v.state.mode='FINAL_PACKAGE';await v.finalPackage.open();${f.packageId?`v.finalPackage.state.package=await v.request('stud-final-package-read',{assignmentId:${JSON.stringify(f.assignmentId)},packageId:${JSON.stringify(f.packageId)}});`:""}cc.render();return true;})()`);
    const r=await evaluate(`(()=>{const root=document.querySelector('.stud-final-package-workspace');if(!root)return {missing:true};const b=root.getBoundingClientRect(),controls=[...root.querySelectorAll('button,input,select,summary')].filter(e=>e.checkVisibility());return {overflow:root.scrollWidth>root.clientWidth+2,escaped:controls.filter(e=>{const r=e.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2;}).map(e=>e.textContent.slice(0,60)),node:typeof require,process:typeof process,buffer:typeof Buffer,appearance:document.documentElement.dataset.aegisAppearance,cpu:window.mods?.cpuinfo?.charts?.flatMap(c=>c.seriesSet.map(s=>s.options.strokeStyle)),error:window.workspaceManager.studCommandCenter.assignmentWorkspace.finalPackage.state.error,clip:{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(innerWidth-b.x,b.width),height:Math.min(innerHeight-b.y,b.height),scale:1}}})()`);
    assert(!r.missing&&!r.overflow&&!r.escaped.length&&!r.error,JSON.stringify(r));assert.equal(r.node,"undefined");assert.equal(r.process,"undefined");assert.equal(r.buffer,"undefined");assert.equal(r.appearance,theme.endsWith("dark")?"dark":"light");
    assert(r.cpu?.length&&r.cpu.every(c=>c===(r.appearance==="dark"?"#7ccbff":"#e8bf58")),"CPU colour did not follow actual theme");
    results.push({width,height,scale,theme,scenario:f.scenario,passed:true});
    if(width===1440&&(theme==="dark"||theme==="light")||width===1200&&theme==="light"&&f.scenario==="review"){
     const png=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,clip:r.clip});fs.writeFileSync(path.join(out,`${width}-${theme}-${f.scenario}.png`),Buffer.from(png.data,"base64"));
     if(f.scenario==="review"){
      const clip=await evaluate(`(()=>{const r=document.querySelector('#mod_cpuinfo').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
      const cpu=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,clip});fs.writeFileSync(path.join(out,`${width}-${theme}-cpu.png`),Buffer.from(cpu.data,"base64"));
     }
    }
   }
  }
  fs.writeFileSync(path.join(out,"layout-results.json"),JSON.stringify(results,null,2));console.log(`M15_LIVE: ${results.length} real-renderer scenarios passed; actual SQLite/IPC; four themes; three viewports; CPU live colours.`);
 }finally{ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
