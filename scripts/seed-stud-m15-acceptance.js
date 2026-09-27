#!/usr/bin/env node
"use strict";
// Explicit disposable profile only. Never opens the user's academic database.
const fs=require("fs"),path=require("path");
const {open,fixture}=require("./test-stud-final-package.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const profile=process.argv[2];
if(!profile||!path.isAbsolute(profile)||!path.basename(profile).startsWith("m15-synthetic-"))throw new Error("Provide a dedicated absolute m15-synthetic-* profile.");
if(fs.existsSync(path.join(profile,"stud","academic.sqlite")))throw new Error("Acceptance seeding requires a new empty profile.");
fs.mkdirSync(profile,{recursive:true,mode:0o700});
const e=open(path.join(profile,"stud")),course=e.store.createEntity("COURSE",{title:"Synthetic Academic Practice",code:"SYN-1500",academicYear:"2026/27",academicTerm:"Term 1"});
const scenarios=[];
try{
    for(const scenario of ["review","blocked","approved","empty"]){
        const f=fixture(e,`Synthetic ${scenario} package`,scenario!=="empty");
        e.store.updateEntity("ASSIGNMENT",f.assignment.id,{courseId:course.id});
        if(scenario==="blocked"){
            const workflow=new StudWorkflowService({store:e.store,requirementsService:e.requirements});let w=workflow.create({assignmentId:f.assignment.id,templateKey:"GENERIC_MANUAL",contractId:f.contract.id});
            workflow.createBlocker({workflowId:w.id,nodeId:w.graph.nodes[0].id,blockerType:"WAITING_DATA",title:"Awaiting synthetic laboratory measurements",expectedWorkflowVersion:w.rowVersion});
        }
        let p=null;if(scenario!=="empty")p=e.packages.create({assignmentId:f.assignment.id,draftVersionId:f.version.id,citationStyle:"harvard1"});
        if(scenario==="approved")p=e.packages.approve({assignmentId:f.assignment.id,packageId:p.id,expectedManifestHash:p.manifestHash,confirmReviewed:true,acknowledgeIssues:true});
        scenarios.push({scenario,assignmentId:f.assignment.id,versionId:f.version.id,packageId:p?.id||null});
    }
    fs.writeFileSync(path.join(profile,"synthetic-fixture.json"),JSON.stringify({courseId:course.id,scenarios},null,2),{flag:"wx",mode:0o600});
    console.log("Seeded four synthetic Assignments; no real provider or model invoked.");
}finally{e.store.close();}
