#!/usr/bin/env node
"use strict";
// Actual Electron renderer, production storage component and theme/CSS. Layout
// states below are synthetic, NOT evidence that a transfer or disk failure ran.
const fs=require("fs"),path=require("path");
const port=Number(process.argv[2]||9274),output=process.argv[3];
function install(scenario){
 const previous=document.getElementById("stud-m14-validation-root");previous?.remove();window.__m14Visual?.reset();
 document.body.classList.add("engineering-mode");const root=document.createElement("div");root.id="stud-m14-validation-root";
 root.style.cssText="position:fixed;inset:0;z-index:999999;background:var(--aegis-surface);overflow:auto;padding:16px;box-sizing:border-box";document.body.appendChild(root);
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let view;const render=()=>{root.innerHTML='<p style="font:12px sans-serif;margin:0 0 10px">SYNTHETIC STORAGE LAYOUT VALIDATION · NO FILES MOVED</p>'+view.render();};
 const parent={state:{mode:"STORAGE"},assignment:()=>({id:"stud_assignment_synthetic"}),parent:{render}};
 view=new window.StudStorageWorkspace({parent,escape:esc,request:async()=>{throw Error("Layout fixture does not execute operations");}});window.__m14Visual=view;
 view.state.profiles=[{id:"local",kind:"LOCAL",label:"On this Mac",availability:"AVAILABLE",availableBytes:50*1024**3},{id:"external",kind:"EXTERNAL",label:"Academic archive",availability:scenario==="offline"?"STORAGE_OFFLINE":"AVAILABLE",availableBytes:90*1024**3}];view.state.targetId="external";
 const files=Array.from({length:scenario==="empty"?0:scenario==="long"?50:4},(_,i)=>({reference:`documents/synthetic_${i}.pdf`,profileId:"local",label:scenario==="long"?"Synthetic comparative multidisciplinary literature and methods — bounded supporting material with a deliberately long descriptive document title ".repeat(3):["Assessment brief","Literature review","Dataset methods","Source appendix"][i],declaredBytes:1024**2*(i+1),shared:i===2}));
 view.state.catalog={files,totalFiles:files.length,nextOffset:null,truncated:scenario==="long"};
 if(!["empty","resting","offline"].includes(scenario))view.setManifest({id:"manifest_synthetic",state:({prepared:"PREPARED",active:"COPYING",indeterminate:"COPYING",failed:"FAILED",applied:"APPLIED",rollback:"APPLIED",details:"PREPARED",long:"PREPARED"})[scenario],rowVersion:1,totalItems:files.length,totalBytes:10*1024**2,sources:[],items:files.map(file=>({reference:file.reference,byteSize:file.declaredBytes,sha256:"a".repeat(64)})),reviewIssues:[{code:"OCR_REQUIRED"}],issueCount:1,omittedFileCount:2,sharedReferenceCount:1,nextOffset:null,
    errorCode:scenario==="failed"?"STORAGE_OFFLINE":scenario==="rollback"?"STORAGE_CANCELLED":null,
    run:["active","indeterminate","failed","applied","rollback"].includes(scenario)?{state:scenario==="failed"?"FAILED":scenario==="rollback"?"CANCELLED":scenario==="applied"?"COMPLETED":"RUNNING",progressMode:scenario==="indeterminate"?"INDETERMINATE":"DETERMINATE",progressCurrent:scenario==="applied"?4:2,progressTotal:4,progressUnit:"files",statusSummary:scenario==="rollback"?"Rollback cancelled; destination is still active":"Synthetic progress state for layout inspection"}:null});
 if(scenario==="offline")view.state.error="Storage is disconnected. Canonical academic metadata remains available.";
 render();if(scenario==="details")root.querySelector('[data-storage-disclosure="verification"]').open=true;
 root.addEventListener("change",event=>view.handleChange(event));
 return true;
}
(async()=>{
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==="page");if(!page)throw Error("No live Electron renderer");
 const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
 await new Promise((yes,no)=>{socket.addEventListener("open",yes,{once:true});socket.addEventListener("error",no,{once:true});});
 socket.addEventListener("message",event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error||m.result?.exceptionDetails)p.reject(Error(JSON.stringify(m.error||m.result.exceptionDetails)));else p.resolve(m.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result.value;
 try{
    const boundary=await evaluate(`(async()=>{const core=await window.aegis.stud['stud-core-status']({}),profiles=await window.aegis.stud['stud-storage-profiles']({});return{nodeAbsent:typeof require==='undefined'&&typeof process==='undefined'&&typeof Buffer==='undefined',schema:core.data?.version,profilesAvailable:profiles.ok,storageComponent:typeof window.StudStorageWorkspace==='function'}})()`);
    if(!boundary.nodeAbsent||!boundary.profilesAvailable||!boundary.storageComponent||boundary.schema!==27)throw Error("Production bridge not available: "+JSON.stringify(boundary));
    let passed=0;const failures=[];
    for(const [width,height,scale] of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const appearance of ["dark","light","system-dark","system-light"]){
      await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
      const theme=appearance.replace(/^system-/,"");await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:theme}]});
      const actual=await evaluate(`window.applyAegisAppearance(${JSON.stringify(appearance.startsWith("system-")?"system":theme)})`);if(actual.resolved!==theme)throw Error("Theme did not resolve");
      for(const scenario of ["empty","resting","prepared","active","indeterminate","failed","applied","rollback","offline","details","long"]){
        await evaluate(`(${install.toString()})(${JSON.stringify(scenario)})`);
        await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        const geometry=await evaluate(`(()=>{const root=document.getElementById('stud-m14-validation-root'),box=root.getBoundingClientRect(),visible=[...root.querySelectorAll('button,input,select,summary')].filter(e=>{for(let p=e.parentElement;p&&p!==root;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&e!==p.querySelector(':scope > summary'))return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});return{overflow:root.scrollWidth>root.clientWidth+3,escaped:visible.filter(e=>{const r=e.getBoundingClientRect();return r.left<box.left-3||r.right>box.right+3;}).map(e=>e.tagName),surface:!!root.querySelector('.stud-storage-workspace')}})()`);
        if(geometry.overflow||geometry.escaped.length||!geometry.surface)failures.push({width,height,scale,appearance,scenario,...geometry});else passed++;
        if(output&&((width===1440&&["dark","light"].includes(appearance)&&["prepared","active"].includes(scenario))||(width===1200&&appearance==="light"&&scenario==="details"))){const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`${width}-${appearance}-${scenario}.png`),Buffer.from(screenshot.data,"base64"));}
      }
    }
    console.log(JSON.stringify({status:failures.length?"FAIL":"PASS",passed,failed:failures.length,failures,boundary,syntheticLayoutOnly:true}));if(failures.length)process.exitCode=1;
 }finally{socket.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
