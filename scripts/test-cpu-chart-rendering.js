#!/usr/bin/env node
"use strict";
const assert=require("assert"),vm=require("vm"),fs=require("fs"),path=require("path");
const source=fs.readFileSync(path.join(__dirname,"../src/classes/cpuinfo.class.js"),"utf8");
const counters=[{innerText:""},{innerText:""}],context={module:{exports:{}},window:{devicePixelRatio:2,si:{}},document:{getElementById:id=>counters[id.endsWith("0")?0:1]},getComputedStyle:c=>c.style};
vm.runInNewContext(source,context);const Cpu=context.module.exports.Cpuinfo,view=Object.create(Cpu.prototype);let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`);}
function canvas(width,height){return {width:300,height:60,style:{width:String(width),height:String(height),boxSizing:"content-box"},transform:null,getContext(){return {setTransform:(...a)=>this.transform=a};}};}
(async()=>{
 const top={canvas:canvas(240.5,43.75)},bottom={canvas:canvas(240.5,43.75)};
 check("separate canvas backing stores exclude borders",()=>{view.resizeChart(top);view.resizeChart(bottom);assert.equal(top.canvas.width,481);assert.equal(top.canvas.height,88);assert.equal(top.clientHeight,43.75);assert.equal(bottom.canvas.height,88);assert.notStrictEqual(top.canvas,bottom.canvas);});
 check("DPR-only change resizes and resets each transform",()=>{context.window.devicePixelRatio=1;view.resizeChart(top);view.resizeChart(bottom);assert.equal(top.canvas.width,241);assert.equal(top.canvas.height,44);assert.equal(top.canvas.transform[0],1);assert.equal(bottom.canvas.transform[3],1);context.window.devicePixelRatio=2;view.resizeChart(top);assert.equal(top.canvas.height,88);assert.equal(top.canvas.transform[0],2);});
 check("fractional and independent layout changes stay bounded",()=>{bottom.canvas.style.height="31.25px";view.resizeChart(bottom);assert.equal(bottom.canvas.height,63);assert.equal(top.canvas.height,88);for(let i=0;i<10;i++)view.resizeChart(bottom);assert.equal(bottom.canvas.transform[0],2);});
 view.divide=4;const samples=Array.from({length:8},()=>[]);view.series=samples.map(a=>({append:(t,v)=>a.push(v)}));
 context.window.si.currentLoad=async()=>({cpus:Array.from({length:8},(_,i)=>({load:i<4?80:20}))});await view.updateCPUload();
 check("cores 1-4 and 5-8 update their own series and averages",()=>{assert(samples.slice(0,4).every(a=>a[0]===80));assert(samples.slice(4).every(a=>a[0]===20));assert.equal(counters[0].innerText,"Avg. 80%");assert.equal(counters[1].innerText,"Avg. 20%");});
 context.window.si.currentLoad=async()=>{throw Error("missing sample");};await view.updateCPUload();
 check("telemetry rejection never permanently freezes charts",()=>assert.equal(view.updatingCPUload,false));
 context.window.si.currentLoad=async()=>({});await view.updateCPUload();
 check("missing CPU array releases sampling guard",()=>assert.equal(view.updatingCPUload,false));
 context.window.si.currentLoad=async()=>({cpus:[{load:NaN},{load:300},...Array.from({length:10},()=>({load:50}))]});await view.updateCPUload();
 check("invalid samples and topology overflow cannot corrupt either chart",()=>{assert.equal(samples[0].length,1);assert.equal(samples[1].length,1);assert.equal(samples[7].at(-1),50);assert.equal(view.updatingCPUload,false);});
 console.log(`CPU_CHART_RENDERING: ${passed} passed / 0 failed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
