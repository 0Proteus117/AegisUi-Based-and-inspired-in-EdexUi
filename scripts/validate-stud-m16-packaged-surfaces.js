#!/usr/bin/env node
"use strict";

// Explicit test-harness use only, against a mounted build and seeded synthetic
// profile. No acquisition, generation, submission or private-profile fallback.
const assert=require("assert"),fs=require("fs"),path=require("path");
const port=Number(process.argv[2]),profile=process.argv[3],out=process.argv[4];
assert(Number.isInteger(port)&&port>=1024&&port<=65535);
assert(profile&&path.basename(profile).startsWith("m15-synthetic-")&&out);
const fixture=JSON.parse(fs.readFileSync(path.join(profile,"synthetic-fixture.json")));

async function main(){
    const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page=pages.find(item=>item.type==="page"&&item.title==="AegisUi");
    assert(page&&/^file:\/\/\/Volumes\/AegisUi[^/]*\/AegisUi\.app\/Contents\/Resources\/app\.asar\/ui\.html$/.test(decodeURI(page.url)),"Must launch the mounted validation app");
    const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),exceptions=[];let seq=0;
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params.exceptionDetails.text);};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`${method} timed out`));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
    fs.mkdirSync(out,{recursive:true});
    const results=[];
    try{
        await call("Runtime.enable");
        // A mounted cold start may still be booting. Do not confuse that with a
        // broken STUD view; wait for readiness with an explicit deadline.
        const waitFor=async expression=>{
            const deadline=Date.now()+30000;
            while(Date.now()<deadline){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}
            throw Error("Mounted synthetic renderer did not become ready within 30 seconds");
        };
        await waitFor("typeof window.workspaceManager?.activate==='function'");
        await evaluate(`window.workspaceManager.activate('student',false)`);
        await waitFor("!!window.workspaceManager.studCommandCenter?.state.schema");
        const assignmentId=fixture.scenarios.find(item=>item.scenario==="review").assignmentId;
        await evaluate(`window.workspaceManager.studCommandCenter.selectAssignment(${JSON.stringify(assignmentId)})`);
        const baseline=await evaluate(`(async()=>{const cc=window.workspaceManager.studCommandCenter;const r=await cc.request('stud-execution-state',{assignmentId:${JSON.stringify(assignmentId)}});return {plan:r.executionPlan?.id||null};})()`);
        const views=["OVERVIEW","MODULES","ASSIGNMENTS","PROGRESS","REVISION","RESEARCH","DOCUMENTS","KNOWLEDGE","AI","NOTES","TOOLS","WORKBENCH","SERVICES","MOODLE"];
        const modes={WORK:null,REQUIREMENTS:null,WORKFLOW:null,ARTIFACTS:"operational",MISSION:"operational",RESEARCH_PLAN:"researchPlan",EVIDENCE_MAP:"evidenceMap",FACULTY_SCOUT:"facultyScout",COMPOSITION:"composition",HUMANISATION:"humanisation",LECTURER_REVIEW:"lecturerCommittee",STORAGE:"storage",FINAL_PACKAGE:"finalPackage"};
        for(const [width,height,scale] of [[1680,1050,2],[1440,900,2],[1200,780,1]])for(const theme of ["dark","light","system-dark","system-light"]){
            await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
            await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:theme.endsWith("dark")?"dark":"light"}]});
            await evaluate(`window.applyAegisAppearance(${JSON.stringify(theme.startsWith("system")?"system":theme)})`);
            for(const view of views){
                await evaluate(`window.workspaceManager.studCommandCenter.setActiveView(${JSON.stringify(view)})`);
                await inspect(`view-${view}`,false);
            }
            await evaluate(`window.workspaceManager.studCommandCenter.setActiveView('ASSIGNMENTS')`);
            for(const [mode,adapter] of Object.entries(modes)){
                await evaluate(`(async()=>{const cc=window.workspaceManager.studCommandCenter,v=cc.assignmentWorkspace;v.state.mode=${JSON.stringify(mode)};${adapter?`await v[${JSON.stringify(adapter)}].open(${JSON.stringify(mode)});`:""}cc.render();})()`);
                await inspect(`mode-${mode}`,width===1440&&theme==="light"&&["WORK","MISSION","EVIDENCE_MAP","COMPOSITION","LECTURER_REVIEW"].includes(mode));
            }
            async function inspect(surface,capture){
                const r=await evaluate(`(()=>{const root=document.querySelector('[data-stud-main]'),b=root.getBoundingClientRect(),controls=[...root.querySelectorAll('button,input,select,summary')].filter(e=>e.checkVisibility());return {nonempty:root.innerText.trim().length>20,overflow:root.scrollWidth>root.clientWidth+2,escaped:controls.filter(e=>{const r=e.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2;}).length,clip:{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(innerWidth-b.x,b.width),height:Math.min(innerHeight-b.y,b.height),scale:1}};})()`);
                const passed=r.nonempty&&!r.overflow&&!r.escaped;
                results.push({surface,width,height,scale,theme,passed,nonempty:r.nonempty,overflow:r.overflow,escaped:r.escaped});
                if(capture){const shot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,clip:r.clip});fs.writeFileSync(path.join(out,`${surface}.png`),Buffer.from(shot.data,"base64"));}
            }
        }
        const final=await evaluate(`(async()=>{const cc=window.workspaceManager.studCommandCenter;const r=await cc.request('stud-execution-state',{assignmentId:${JSON.stringify(assignmentId)}});const a=await window.aegis.assistant.status(true);return {plan:r.executionPlan?.id||null,ollama:{ok:a.ok,status:a.status},nodeAbsent:typeof require==='undefined'&&typeof process==='undefined'&&typeof Buffer==='undefined',terminal:window.term?.[0]?.socket?.readyState===WebSocket.OPEN};})()`);
        assert.equal(final.plan,baseline.plan,"Opening views must not create an execution plan");
        assert(final.nodeAbsent&&final.terminal);
        const report={mounted:true,results,exceptions,runtime:final,failures:results.filter(r=>!r.passed),scope:"Geometry/nonblank regression, not human usability approval; existing read-only local Ollama status probe only"};
        fs.writeFileSync(path.join(out,"surface-results.json"),JSON.stringify(report,null,2));
        console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:report.failures.length,exceptions,runtime:final,failures:report.failures},null,2));
        assert.equal(report.failures.length,0);assert.equal(exceptions.length,0);
    }finally{for(const p of pending.values())clearTimeout(p.timer);ws.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
