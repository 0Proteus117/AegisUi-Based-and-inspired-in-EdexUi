#!/usr/bin/env node
"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),assert=require("assert");
const {open,fixture}=require("./test-stud-final-package.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"m15-scale-"));let e=open(root);
const measurements={};const measure=(name,fn)=>{const start=performance.now(),value=fn();measurements[name]=Math.round((performance.now()-start)*100)/100;return value;};
try{
 e.store.transaction(()=>{for(let i=0;i<100;i++){const c=e.store.createEntity("COURSE",{title:`Synthetic course ${i}`});for(let j=0;j<10;j++)e.store.createEntity("ASSIGNMENT",{courseId:c.id,title:`Synthetic assessment ${j}`});}});
 const f=fixture(e,"Package history scale");let p;
 measure("create100PackagesMs",()=>{for(let i=0;i<100;i++)p=e.packages.create({assignmentId:f.assignment.id,draftVersionId:f.version.id,citationStyle:"apa"});});
 const first=measure("historyFirstPageMs",()=>e.packages.list({assignmentId:f.assignment.id}));assert.equal(first.length,25);assert.equal(first[0].revision,100);
 const second=measure("historySecondPageMs",()=>e.packages.list({assignmentId:f.assignment.id,beforeRevision:first.at(-1).revision}));assert.equal(second.length,25);assert.equal(second[0].revision,75);
 const read=measure("inspectionMs",()=>e.packages.read({assignmentId:f.assignment.id,packageId:p.id}));assert.equal(read.integrity,"VERIFIED");
 const options=measure("boundedOptionsMs",()=>e.packages.options({assignmentId:f.assignment.id}));assert(options.artifacts.length<=100);
 e.store.close();e=measure("restartMs",()=>open(root));assert.equal(e.packages.read({assignmentId:f.assignment.id,packageId:p.id}).manifestHash,p.manifestHash);
 console.log(JSON.stringify({courses:100,assignments:1001,packages:100,files:900,measurements,passed:5,failed:0,skipped:0}));
}finally{e.store.close();fs.rmSync(root,{recursive:true,force:true});}
