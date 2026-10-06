#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const profile=process.argv[2];
if(!profile||!path.isAbsolute(profile)||!path.basename(profile).startsWith("ux1-synthetic-")||fs.existsSync(profile))throw Error("New isolated ux1-synthetic-* profile required");
fs.mkdirSync(profile,{recursive:true,mode:0o700});
const store=new StudAcademicStore({root:path.join(profile,"stud")}).initialize();
try{
    const courses=[];
    for(const [title,year,term] of [["Engineering design","2026/27","Term 1"],["Literature and interpretation","2026/27","Term 1"],["Law and public policy","2026/27","Term 2"],["Social research methods","2026/27","Term 2"],["Generic coursework",null,null],["Historical methods","2025/26","Term 1"],["Future studies","2027/28","Term 1"]])courses.push(store.createEntity("COURSE",{title,academicYear:year,academicTerm:term}));
    const assignment=store.createEntity("ASSIGNMENT",{courseId:courses[0].id,title:"Design report: compare two sustainable solutions",description:"Compare the alternatives using evidence. Explain assumptions and limitations. Submit a report and references. These are synthetic acceptance instructions, not real university coursework.",dueDate:"2026-11-20T14:00:00.000Z"});
    store.createEntity("RESOURCE",{courseId:courses[0].id,title:"Module specification",type:"REFERENCE"});
    store.createEntity("RESOURCE",{courseId:courses[0].id,title:"Assessment brief",type:"REFERENCE",assignmentId:assignment.id});
    for(let i=0;i<48;i++)store.createEntity("ASSIGNMENT",{courseId:courses[2].id,title:`Case analysis ${i+1}: assess competing interpretations without inventing legal authority or attributing unverified evidence`});
    fs.writeFileSync(path.join(profile,"settings.json"),JSON.stringify({shell:"/bin/zsh",shellArgs:["-f"],cwd:profile,keyboard:"en-US",theme:"tron",port:3421,forceFullscreen:false,allowWindowed:true,offlineMode:true,disableUpdateCheck:true}));
    fs.writeFileSync(path.join(profile,"synthetic-fixture.json"),JSON.stringify({courses:courses.map(c=>({id:c.id,title:c.title})),assignmentId:assignment.id}));
    console.log("Synthetic UX1 profile created; no real academic data or providers used.");
}finally{store.close();}
