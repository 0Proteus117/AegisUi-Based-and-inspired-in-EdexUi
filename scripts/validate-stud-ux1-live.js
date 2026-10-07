#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),{pathToFileURL}=require("url");
const port=Number(process.argv[2]),profile=process.argv[3],out=process.argv[4];
assert(Number.isInteger(port)&&port>=1024&&port<=65535);
assert(profile&&path.basename(profile).startsWith("ux1-synthetic-")&&out);
const fixture=JSON.parse(fs.readFileSync(path.join(profile,"synthetic-fixture.json")));
async function main(){
 const page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.title==="AegisUi");
 const packaged=process.argv.find(a=>a.startsWith("--packaged-asar="))?.slice("--packaged-asar=".length);
 if(packaged)assert(/^\/Volumes\/AegisUi[^/]*\/AegisUi\.app\/Contents\/Resources\/app\.asar$/.test(packaged));
 const expected=pathToFileURL(packaged?path.join(packaged,"ui.html"):path.resolve(__dirname,"../src/ui.html")).href;
 assert(page&&page.url===expected,"Use this exact checkout or explicitly selected mounted build, not an older app");
 const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),exceptions=[];let seq=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`${method} timeout`));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{const deadline=Date.now()+45000;while(Date.now()<deadline){if(await run(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error(`UI did not reach ${expression}`);};
 const click=async selector=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Missing actionable control');el.click();})()`);await wait("!!window.workspaceManager.studCommandCenter.simpleNavigation.page && !window.workspaceManager.studCommandCenter.simpleNavigation.busy");};
 const cc="window.workspaceManager.studCommandCenter",nav=`${cc}.simpleNavigation`;
 const results=[];
 fs.mkdirSync(out,{recursive:true});
 try{
  await call("Runtime.enable");
  if(process.argv.includes("--reload")) await call("Page.reload",{ignoreCache:true});
  await wait("typeof window.workspaceManager?.activate==='function'");
  await run("window.workspaceManager.activate('student',false)");await wait(`${nav}?.page && !${nav}.busy`);
  for(const [width,height,scale] of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const theme of ["dark","light","system-dark","system-light"]){
   await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
   await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:theme.endsWith("dark")?"dark":"light"}]});
   await run(`window.applyAegisAppearance(${JSON.stringify(theme.startsWith("system")?"system":theme)})`);
   await run(`${cc}.setActiveView('MODULES');${nav}.load({browse:'YEARS'})`);await inspect("years");
   const yearIndex=await run(`${nav}.page.items.findIndex(y=>y.academicYear==='2026/27')`);
   if(await run(`${nav}.page.preference?.available && ${nav}.page.preference.academicYear==='2026/27'`))await click('[data-stud-simple="current-year"]');
   else await click(`[data-stud-simple="year"][data-value="${yearIndex}"]`);
   assert.equal(await run(`${nav}.page.total`),4);await inspect("subjects");
   if(process.argv.includes("--clarity")){
    if(await run(`!!document.querySelector('[data-stud-simple="set-year"]')`))await click('[data-stud-simple="set-year"]');
    assert.equal(await run(`${nav}.page.preference.academicYear`),"2026/27");
    await click('[data-stud-simple="years"]');await inspect("current-year");
    await click('[data-stud-simple="current-year"]');
   }
   await click(`[data-stud-simple="course"][data-value="${fixture.courses[0].id}"]`);await inspect("course");
   await click('[data-stud-simple="kind"][data-value="RESOURCE"]');await inspect("materials");
   if(process.argv.includes("--clarity")){
    await run(`(()=>{const d=document.querySelector('.stud-simple-list .stud-simple-name');d.querySelector('summary').click();const f=d.querySelector('form');f.querySelector('input').value='My assessment guide';f.requestSubmit(f.querySelector('button'));})()`);
    await wait(`!${nav}.busy && ${nav}.page.items.some(i=>i.presentation.label==='My assessment guide')`);
    await run(`document.querySelector('.stud-simple-list .stud-simple-name summary').click()`);await inspect("corrected-name");
   }
   await click('[data-stud-simple="kind"][data-value="ASSIGNMENT"]');
   await run(`document.querySelector('[data-stud-simple="assignment"]').click()`);await wait(`${nav}.assignment && !${nav}.busy`);await inspect("assignment");
   await run(`document.querySelector('[data-stud-simple="requirements"]').click()`);
   assert.equal(await run(`${cc}.assignmentWorkspace.state.mode`),"REQUIREMENTS");
   await inspect("requirements");
   async function inspect(scenario){
    const r=await run(`(()=>{const root=document.querySelector('[data-stud-main]'),b=root.getBoundingClientRect(),controls=[...root.querySelectorAll('button,input,select,summary')].filter(e=>e.checkVisibility());return {overflow:root.scrollWidth>root.clientWidth+2,escaped:controls.filter(e=>{const x=e.getBoundingClientRect();return x.left<b.left-2||x.right>b.right+2}).length,text:root.innerText.slice(0,120),clip:{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(innerWidth-b.x,b.width),height:Math.min(innerHeight-b.y,b.height),scale:1}}})()`);
    results.push({scenario,width,height,scale,theme,passed:!r.overflow&&!r.escaped&&r.text.length>5});
    if(width===1440&&["light","dark"].includes(theme)&&["years","subjects","assignment"].includes(scenario)){
     const s=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,clip:r.clip});fs.writeFileSync(path.join(out,`${scenario}-${theme}.png`),Buffer.from(s.data,"base64"));
    }
   }
  }
  if(process.argv.includes("--clarity")){
   const invoke=(channel,payload)=>run(`(async()=>{const r=await window.aegis.stud[${JSON.stringify(channel)}](${JSON.stringify(payload)});if(!r.ok)throw Error(r.code+': '+r.message);return r.data})()`);
   let draft=await invoke('stud-requirements-create-draft',{assignmentId:fixture.assignmentId});
   if(draft.lifecycle!=='DRAFT')throw Error('Expected synthetic draft');
   draft=await invoke('stud-requirements-add-manual',{contractId:draft.id,expectedVersion:draft.rowVersion,requirement:{type:'DEPENDENCY',label:'Team measurements',displayValue:'Await measured team data; no values may be invented.',resolutionState:'UNRESOLVED'}});
   await matrixBrief('draft-summary');
   for(const candidate of draft.candidates.filter(c=>c.disposition==='PENDING'))draft=await invoke('stud-requirements-review-candidate',{contractId:draft.id,candidateId:candidate.id,expectedVersion:draft.rowVersion,disposition:'INCLUDED'});
   draft=await invoke('stud-requirements-approve',{contractId:draft.id,expectedVersion:draft.rowVersion,approveAsIncomplete:true});
   await matrixBrief('reviewed-incomplete');
   await invoke('stud-entity-update',{entityType:'ASSIGNMENT',entityId:fixture.assignmentId,value:{description:'Changed synthetic brief: a presentation and updated report are required.'}});
   await matrixBrief('changed-source');
   async function matrixBrief(scenario){
    for(const [width,height,scale]of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const theme of ['dark','light','system-dark','system-light']){
     await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
     await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme.endsWith('dark')?'dark':'light'}]});
     await run(`window.applyAegisAppearance(${JSON.stringify(theme.startsWith('system')?'system':theme)});${cc}.setActiveView('MODULES');`);
     await run(`${nav}.click({target:{closest:()=>({dataset:{studSimple:'continue',value:${JSON.stringify(fixture.assignmentId)}}})}})`);
     await wait(`${nav}.assignment&&!${nav}.busy`);
     const r=await run(`(()=>{const root=document.querySelector('[data-stud-main]'),b=root.getBoundingClientRect();return{overflow:root.scrollWidth>root.clientWidth+2,text:root.innerText,escaped:[...root.querySelectorAll('button,input,summary')].filter(e=>e.checkVisibility()).some(e=>{const r=e.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2}),clip:{x:b.x,y:b.y,width:b.width,height:Math.min(innerHeight-b.y,b.height),scale:1}}})()`);
     const state=scenario==='draft-summary'?r.text.includes('not yet approved'):scenario==='changed-source'?r.text.includes('Source material changed'):r.text.includes('reviewed requirements');
     results.push({scenario,width,height,scale,theme,passed:state&&!r.overflow&&!r.escaped});
     if(width===1440&&theme==='light'){const s=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:r.clip});fs.writeFileSync(path.join(out,scenario+'.png'),Buffer.from(s.data,'base64'));}
    }
   }
  }
  const security=await run(`({nodeAbsent:typeof require==='undefined'&&typeof process==='undefined'&&typeof Buffer==='undefined',rawIpc:!!window.aegis.ipcRenderer})`);
  assert(security.nodeAbsent&&!security.rawIpc);
  const report={packaged:!!packaged,results,exceptions,security,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,scope:"Real click path and geometry; synthetic profile, no model/provider execution, no claim of completed AI flow"};
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,exceptions,security}));
  assert.equal(report.failed,0);assert.equal(exceptions.length,0);
 }finally{for(const p of pending.values())clearTimeout(p.timer);ws.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
