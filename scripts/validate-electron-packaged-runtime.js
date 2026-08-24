#!/usr/bin/env node
"use strict";

const port = Number(process.argv[2] || 9225);

async function main() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No packaged Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    let sequence = 0;
    const evaluate = expression => new Promise((resolve, reject) => {
        const id = ++sequence;
        const listener = event => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            socket.removeEventListener("message", listener);
            if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
            else resolve(message.result.result.value);
        };
        socket.addEventListener("message", listener);
        socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}}));
    });
    const result = await evaluate(`(async()=>{
        window.workspaceManager?.activate('student',false);
        await new Promise(resolve=>setTimeout(resolve,300));
        const invoke=(channel,payload={})=>window.aegis.stud[channel](payload);
        const suffix=String(Date.now());
        const course=await invoke('stud-entity-create',{entityType:'COURSE',value:{title:'Packaged trust-boundary validation',code:'SYN-'+suffix.slice(-8),academicYear:'2025/26',academicTerm:'Term 1'},provenance:{field:'title',observedValue:'Packaged trust-boundary validation',sourceType:'USER',sourceAuthority:'AUTHORITATIVE'}});
        if(!course.ok)return{stage:'course',response:course};
        const assignment=await invoke('stud-entity-create',{entityType:'ASSIGNMENT',value:{courseId:course.data.id,title:'Synthetic packaged Requirements Contract validation',status:'NOT_STARTED'},provenance:{field:'title',observedValue:'Synthetic packaged Requirements Contract validation',sourceType:'USER',sourceAuthority:'AUTHORITATIVE'}});
        if(!assignment.ok)return{stage:'assignment',response:assignment};
        const paper=await invoke('stud-entity-create',{entityType:'RESEARCH_PAPER',value:{title:'Synthetic packaged citation source',authors:'Validation, Aegis',year:2026,objectType:'ARTICLE'},provenance:{field:'title',observedValue:'Synthetic packaged citation source',sourceType:'USER',sourceAuthority:'AUTHORITATIVE'}});
        if(!paper.ok)return{stage:'paper',response:paper};
        const contract=await invoke('stud-requirements-create-draft',{assignmentId:assignment.data.id});
        const templates=await invoke('stud-workflow-templates',{assignmentId:assignment.data.id});
        const genericTemplate=templates.data?.templates?.find(template=>template.templateKey==='GENERIC_MANUAL');
        const workflow=genericTemplate?await invoke('stud-workflow-create',{assignmentId:assignment.data.id,templateKey:genericTemplate.templateKey,templateVersion:genericTemplate.version,allowNoContract:true,noContractReason:'Packaged synthetic validation uses an explicit no-contract path.'}):{ok:false};
        const workflowRead=workflow.ok?await invoke('stud-workflow-read',{workflowId:workflow.data.id}):{ok:false};
        const workingContext=await invoke('stud-working-context-update',{courseId:course.data.id,assignmentId:assignment.data.id,originSurface:'PACKAGED_VALIDATION',userPinned:true});
        const organisation=await invoke('stud-course-organisation',{limit:20});
        const classifications=await invoke('stud-assessment-classification-list',{limit:20});
        const citation=await invoke('stud-citation-render',{paperIds:[paper.data.id],style:'harvard1'});
        const moodle=await invoke('stud-moodle-status',{});
        const documents=await invoke('stud-document-capabilities',{});
        const compute=await invoke('stud-compute-capabilities',{});
        return {
            rendererNoRequire:typeof window.require==='undefined',rendererNoProcess:typeof window.process==='undefined',
            preloadWorkingContext:typeof window.aegis?.stud?.['stud-working-context-read']==='function',
            course:Boolean(course.ok&&course.data?.id),assignment:Boolean(assignment.ok&&assignment.data?.id),
            contract:Boolean(contract.ok&&contract.data?.lifecycle==='DRAFT'),workflow:Boolean(workflow.ok&&workflow.data?.assignmentId===assignment.data.id&&workflowRead.ok&&workflowRead.data?.graph?.nodes?.length),workingContext:Boolean(workingContext.ok&&workingContext.data?.activeAssignment?.id===assignment.data.id),organisation:Boolean(organisation.ok&&organisation.data?.years?.length),classification:Boolean(classifications.ok&&classifications.data?.some(item=>item.assignmentId===assignment.data.id)),citation:Boolean(citation.ok&&citation.data?.bibliography),
            moodle:Boolean(moodle.ok&&moodle.data),documents:Boolean(documents.ok&&documents.data),compute:Boolean(compute.ok&&compute.data),
            ollama:typeof window.aegis?.assistant?.status==='function',terminalConnected:window.term?.[0]?.socket?.readyState===WebSocket.OPEN
        };
    })()`);
    socket.close();
    const valid = Object.values(result).every(Boolean);
    console.log(`ELECTRON_PACKAGED_RUNTIME: ${valid ? "PASS" : "FAIL"} ${JSON.stringify(result)}`);
    if (!valid) process.exitCode = 1;
}

main().catch(error => { console.error(`ELECTRON_PACKAGED_RUNTIME: FAIL ${error.message}`); process.exitCode = 1; });
