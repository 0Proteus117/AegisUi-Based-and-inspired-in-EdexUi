#!/usr/bin/env node
"use strict";
// Actual killed child process and reopened SQLite WAL. The second deterministic
// handler is deliberately held at an in-flight boundary; no model is simulated.
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {fork}=require("child_process");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRunCoordinator}=require("../src/classes/workspaces/studRunCoordinator.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudArtifactOperationsService}=require("../src/classes/workspaces/studArtifactOperationsService.class.js");
function open(root){
    const store=new StudAcademicStore({root}).initialize();
    const requirements=new StudRequirementsContractService({store});
    const workflow=new StudWorkflowService({store,requirementsService:requirements});
    const artifacts=new StudArtifactOperationsService({store,workflowService:workflow});
    const coordinator=new StudRunCoordinator({store,workflowService:workflow,artifactOperationsService:artifacts,requirementsService:requirements,assistantRuntime:{client(){throw Error("No model/provider may be called by recovery acceptance");}}});
    return {store,requirements,workflow,artifacts,coordinator};
}
async function child(root){
    const e=open(root);
    const assignment=e.store.createEntity("ASSIGNMENT",{title:"Synthetic process crash acceptance"});
    let workflow=e.workflow.create({assignmentId:assignment.id,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Synthetic execution recovery test, not approved academic work"});
    const ids=[];
    for(const title of ["First bounded inspection","Second bounded inspection"]){
        workflow=e.workflow.addNode({workflowId:workflow.id,expectedWorkflowVersion:workflow.rowVersion,node:{title,semanticType:"REVIEW"}});
        ids.push(workflow.graph.nodes.find(n=>n.title===title).id);
    }
    const profile=e.coordinator.saveProfile({name:"Synthetic process recovery",maxLightTasks:1,maxNetworkTasks:0,maxModelTasks:1,minAvailableMemoryBytes:268435456,maxModelContext:8192,pauseOnBattery:false,pauseOnMemoryPressure:false,keepAwake:false,timeoutMs:60000,maxRetries:1});
    const plan=e.coordinator.createPlan({assignmentId:assignment.id,workflowId:workflow.id,scope:"SELECTED_STAGES",selectedNodeIds:ids,resourceProfileId:profile.id}).plan;
    const handler=e.coordinator.handlers.get("DETERMINISTIC_STUD_CHECK");let count=0;
    e.coordinator.handlers.handlers.set("DETERMINISTIC_STUD_CHECK",Object.freeze({...handler,execute:async(...args)=>{
        if(++count===1)return handler.execute(...args);
        process.send({assignmentId:assignment.id,planId:plan.id});
        return new Promise(()=>{});
    }}));
    await e.coordinator.launch({assignmentId:assignment.id,planId:plan.id,expectedVersion:plan.rowVersion,confirmLaunch:true});
    await e.coordinator.waitForIdle(plan.id);
    throw Error("Child should be killed before second handler completes");
}
async function parent(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"stud-m16-crash-"));let worker,e,passed=0;
    const check=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
    try{
        worker=fork(__filename,["--child",root],{stdio:["ignore","ignore","pipe","ipc"]});
        let stderr="";worker.stderr.on("data",data=>{stderr+=String(data).slice(0,4000);});
        const exit=new Promise(resolve=>worker.once("exit",(code,signal)=>resolve({code,signal})));
        const target=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error("Timed out reaching in-flight crash boundary: "+stderr)),15000);
            worker.once("message",value=>{clearTimeout(timer);resolve(value);});
            worker.once("exit",()=>{clearTimeout(timer);reject(Error("Child exited before crash boundary: "+stderr));});
        });
        worker.kill("SIGKILL");const killed=await exit;
        check("real process terminated abruptly",()=>assert.equal(killed.signal,"SIGKILL"));
        e=open(root);
        let plan=e.coordinator.repository.hydrate(target.planId);
        check("restart marks plan interrupted, not automatic execution",()=>{
            assert.equal(plan.state,"INTERRUPTED");
            assert.equal(plan.steps.filter(s=>s.state==="COMPLETED").length,1);
            assert.equal(e.coordinator.controllers.size,0);
        });
        const completed=plan.steps.find(s=>s.state==="COMPLETED");
        const originalAttempts=e.coordinator.repository.attempts(completed.id,10).length;
        check("interruption recorded and operational runs reconciled",()=>{
            assert(e.coordinator.missionState({assignmentId:target.assignmentId,planId:plan.id}).events.some(event=>event.eventType==="EXECUTION_PLAN_INTERRUPTED"));
            assert(e.artifacts.runs({assignmentId:target.assignmentId}).every(run=>run.state!=="RUNNING"));
        });
        await e.coordinator.resume({assignmentId:target.assignmentId,planId:plan.id,expectedVersion:plan.rowVersion});
        plan=await e.coordinator.waitForIdle(plan.id);
        check("explicit resume completes remaining bounded work",()=>assert.equal(plan.state,"COMPLETED"));
        check("completed operation not replayed after restart",()=>assert.equal(e.coordinator.repository.attempts(completed.id,10).length,originalAttempts));
        check("SQLite integrity after actual process crash",()=>{
            assert.equal(e.store.db.prepare("PRAGMA quick_check").get().quick_check,"ok");
            assert.deepEqual(e.store.db.prepare("PRAGMA foreign_key_check").all(),[]);
        });
        console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
    }finally{
        if(worker&&worker.exitCode===null&&worker.signalCode===null)worker.kill("SIGKILL");
        e?.coordinator.dispose();e?.store.close();fs.rmSync(root,{recursive:true,force:true});
    }
}
(process.argv[2]==="--child"?child(process.argv[3]):parent()).catch(error=>{console.error(error);process.exitCode=1;});
