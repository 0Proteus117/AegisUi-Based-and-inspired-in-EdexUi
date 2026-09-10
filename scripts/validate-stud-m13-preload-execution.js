#!/usr/bin/env node
"use strict";
// Real fixed preload/main APIs, synthetic local records, no model/provider calls.
// Optional Assignment ID checks a previous execution after an actual app restart.
const port=Number(process.argv[2]||9263),restoreId=process.argv[3]||null;
async function execute(restoreId){
    const api=window.aegis.stud,call=async(channel,input={})=>{const r=await api[channel](input);if(!r.ok)throw new Error(channel+": "+r.code);return r.data;};
    let assignment,plan;
    if(restoreId){assignment=(await call("stud-entity-read",{entityType:"ASSIGNMENT",entityId:restoreId}));}
    else {
        const course=await call("stud-entity-create",{entityType:"COURSE",value:{title:"Synthetic M13 runtime acceptance",code:"SYN-M13"}});
        assignment=await call("stud-entity-create",{entityType:"ASSIGNMENT",value:{courseId:course.id,title:"Synthetic bounded execution"}});
        const workflow=await call("stud-workflow-create",{assignmentId:assignment.id,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Explicit synthetic runtime validation."});
        const profile=await call("stud-execution-resource-profile-save",{name:"Explicit deterministic validation",maxLightTasks:1,maxNetworkTasks:0,maxModelTasks:0,minAvailableMemoryBytes:268435456,maxModelContext:2048,pauseOnBattery:false,pauseOnMemoryPressure:false,keepAwake:false,timeoutMs:30000,maxRetries:0});
        const preflight=await call("stud-execution-plan-create",{assignmentId:assignment.id,workflowId:workflow.id,scope:"CURRENT_STAGE",resourceProfileId:profile.id});
        if(preflight.plan.state!=="READY")throw Error("Preflight should not execute work");
        plan=preflight.plan;
        await call("stud-execution-launch",{assignmentId:assignment.id,planId:plan.id,expectedVersion:plan.rowVersion,confirmLaunch:true});
    }
    let mission;
    for(let n=0;n<50;n++){
        mission=await call("stud-execution-state",{assignmentId:assignment.id,...(plan?{planId:plan.id}:{}),eventLimit:50});
        if(mission.executionPlan&&mission.executionPlan.state!=="RUNNING")break;
        await new Promise(r=>setTimeout(r,100));
    }
    plan=mission.executionPlan;
    if(!plan||plan.state!=="COMPLETED"||plan.steps[0].state!=="COMPLETED")throw Error("Real deterministic execution did not complete");
    const original=mission.workflow.graph.nodes.find(n=>n.id===plan.steps[0].workflowNodeId);
    if(original.state==="COMPLETE")throw Error("Machine execution changed academic Workflow authority");
    if(!mission.events.some(e=>e.eventType==="EXECUTION_STEP_COMPLETED"))throw Error("Real M6 event history missing");
    const old=document.getElementById("stud-m13-validation-root");if(old)old.remove();
    document.body.classList.add("engineering-mode");
    const root=document.createElement("div");root.id="stud-m13-validation-root";root.style.cssText="position:fixed;inset:0;z-index:999999;background:var(--aegis-surface);overflow:auto;padding:16px;box-sizing:border-box";document.body.appendChild(root);
    const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const parent={state:{mode:"MISSION"},assignment:()=>assignment,workflow:()=>mission.workflow,selectedNode:()=>null,activeObject:()=>null,parent:{view:root,render(){}}};
    const workspace=new window.StudMissionControlWorkspace({request:call,escape,parent,showToast(){}});
    workspace.state.mission=mission;workspace.state.events=mission.events;workspace.state.mode="MISSION";
    root.innerHTML='<p>Synthetic acceptance data · REAL PRELOAD / MAIN EXECUTION</p>'+workspace.render();
    return {assignmentId:assignment.id,planId:plan.id,state:plan.state,steps:plan.steps.length,events:mission.events.length,attempts:plan.steps[0].attempts.length,workflowUnchanged:true,restartVerified:Boolean(restoreId),nodeAbsent:typeof require==="undefined"&&typeof process==="undefined"&&typeof Buffer==="undefined",overflow:root.scrollWidth>root.clientWidth+4};
}
(async()=>{
    const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==="page");if(!page)throw Error("Electron renderer not available");
    const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true});});
    try{
        const result=await new Promise((resolve,reject)=>{ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id!==1)return;if(m.error||m.result.exceptionDetails)reject(Error(JSON.stringify(m.error||m.result.exceptionDetails)));else resolve(m.result.result.value);});ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:`(${execute.toString()})(${JSON.stringify(restoreId)})`,returnByValue:true,awaitPromise:true}}));});
        const pass=result.nodeAbsent&&!result.overflow;console.log(JSON.stringify({status:pass?"PASS":"FAIL",...result}));if(!pass)process.exitCode=1;
    }finally{ws.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
