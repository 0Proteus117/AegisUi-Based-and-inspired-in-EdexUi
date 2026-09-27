#!/usr/bin/env node
"use strict";
// Isolated, invisible Electron pixel test. Synthetic 80%/20% loads, never the
// user's visible chart or live telemetry. Run with the Electron executable.
const {app,BrowserWindow}=require("electron"),fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert");
const root=path.resolve(__dirname,".."),profile=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-cpu-pixel-"));app.setPath("userData",profile);
const cpuSource=process.argv.includes("--baseline")
 ? require("child_process").execFileSync("git",["show","927184e:src/classes/cpuinfo.class.js"],{cwd:root,encoding:"utf8"})
 : fs.readFileSync(path.join(root,"src/classes/cpuinfo.class.js"),"utf8");
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1000,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,offscreen:true}});let passed=0;
 try{
  await win.loadURL("data:text/html;charset=utf-8,"+encodeURIComponent('<!doctype html><style>body{margin:0}#host{width:320px} :root{--color_r:140;--color_g:170;--color_b:200;--font_main:monospace;--aegis-cpu-line:#e8bf58;--aegis-cpu-glow:rgba(255,217,128,.45)}</style><div id="host"></div>'));
  await win.webContents.insertCSS(fs.readFileSync(path.join(root,"src/assets/css/mod_cpuinfo.css"),"utf8"));
  await win.webContents.executeJavaScript(fs.readFileSync(require.resolve("smoothie",{paths:[path.join(root,"src")]}),"utf8")+"\nvoid 0;");
  await win.webContents.executeJavaScript(`window.module={exports:{}};window.AegisRendererRuntime={platform:'darwin'};window.si={cpu:async()=>({cores:8,manufacturer:'Synthetic ',brand:'CPU',speed:1,speedMax:1}),currentLoad:async()=>({cpus:Array.from({length:8},(_,i)=>({load:i<4?80:20}))}),cpuTemperature:async()=>({max:0}),processes:async()=>({all:1})};void 0;`);
  await win.webContents.executeJavaScript(cpuSource+"\nwindow.testCpu=new module.exports.Cpuinfo('host');void 0;");
  await win.webContents.executeJavaScript(`(async()=>{while(!window.testCpu.charts[0]?.canvas)await new Promise(r=>setTimeout(r,10));for(const c of testCpu.charts){c.stop();c.options.limitFPS=0;c.currentValueRange=100;c.currentVisMinValue=0;}['loadUpdater','tempUpdater','speedUpdater','tasksUpdater'].forEach(k=>clearInterval(testCpu[k]));})()`);
  win.webContents.debugger.attach("1.3");
  for(const [width,height,scale] of [[1000,900,1],[1000,900,2],[1000,900,1],[1200,780,2],[1000,900,2]]){
   await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
   const result=await win.webContents.executeJavaScript(`(()=>{const now=Date.now();testCpu.series.forEach((s,i)=>{s.clear();for(let n=60;n>=0;n--)s.append(now-n*500,i<4?80:20);});return testCpu.charts.map(c=>{c.render(c.canvas,now-100);c.render(c.canvas,now+100);const p=c.canvas.getContext('2d').getImageData(0,0,c.canvas.width,c.canvas.height),rows=[];for(let y=0;y<p.height;y++){let n=0;for(let x=0;x<p.width;x++)if(p.data[(y*p.width+x)*4+3]>30)n++;rows.push(n);}let peak=rows.indexOf(Math.max(...rows));return {peak:peak/p.height,width:c.canvas.width,height:c.canvas.height,scale:c.canvas.getContext('2d').getTransform().a,rect:c.canvas.getBoundingClientRect().toJSON(),series:c.seriesSet.length};});})()`);
   assert(Math.abs(result[0].peak-.2)<.08,JSON.stringify(result));assert(Math.abs(result[1].peak-.8)<.08,JSON.stringify(result));
   assert(result[0].rect.bottom<result[1].rect.top);assert(result.every(r=>r.scale===scale&&r.series===4));passed++;console.log(`CPU_PIXEL_GROUPS: PASS ${width}x${height} @${scale} (${result.map(r=>r.peak.toFixed(2)).join(', ')})`);
  }
  console.log(`CPU_ELECTRON: ${passed} passed / 0 failed; independent upper/lower plot regions, including DPR-only changes`);
 }finally{win.destroy();app.quit();fs.rmSync(profile,{recursive:true,force:true});}
}).catch(e=>{console.error(e);app.exit(1);});
