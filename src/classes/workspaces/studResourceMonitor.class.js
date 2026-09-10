"use strict";

const os=require("os");
const {monitorEventLoopDelay}=require("perf_hooks");
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studExecutionModel.class.js");

class StudResourceMonitor{
    constructor(options={}){
        this.os=options.os||os;this.process=options.process||process;this.powerMonitor=options.powerMonitor||null;this.powerSaveBlocker=options.powerSaveBlocker||null;this.diskProbe=options.diskProbe||(()=>null);this.activeModelTasks=()=>0;this.blockerId=null;this.suspended=false;this.loop=monitorEventLoopDelay({resolution:50});this.loop.enable();this.listeners=[];
        if(this.powerMonitor&&typeof this.powerMonitor.on==="function"){const suspend=()=>{this.suspended=true;if(this.onSuspend)this.onSuspend();};const resume=()=>{this.suspended=false;};this.powerMonitor.on("suspend",suspend);this.powerMonitor.on("resume",resume);this.listeners.push(["suspend",suspend],["resume",resume]);}
    }
    setSuspendHandler(handler){this.onSuspend=handler;}
    setActiveModelTasks(provider){this.activeModelTasks=typeof provider==="function"?provider:()=>0;}
    snapshot(){
        const total=this.os.totalmem(),free=this.os.freemem(),memory=this.process.memoryUsage();
        return Object.freeze({capturedAt:Academic.now(),totalMemoryBytes:total,availableMemoryBytes:free,processRssBytes:memory.rss,processHeapUsedBytes:memory.heapUsed,loadAverage:Object.freeze(this.os.loadavg().slice(0,3)),activeModelTasks:Number(this.activeModelTasks()||0),eventLoopLagMs:Number.isFinite(this.loop.mean)?Math.round(this.loop.mean/1e6):null,diskFreeBytes:this.diskProbe(),onBattery:this.powerMonitor&&typeof this.powerMonitor.isOnBatteryPower==="function"?Boolean(this.powerMonitor.isOnBatteryPower()):null,suspended:this.suspended});
    }
    evaluate(profile,snapshot=this.snapshot()){
        const reasons=[];if(profile.pauseOnMemoryPressure&&snapshot.availableMemoryBytes<profile.minAvailableMemoryBytes)reasons.push("MEMORY_PRESSURE");if(snapshot.diskFreeBytes!==null&&snapshot.diskFreeBytes<256*1024*1024)reasons.push("DISK_PRESSURE");if(snapshot.onBattery&&profile.pauseOnBattery)reasons.push("BATTERY_POLICY");if(snapshot.suspended)reasons.push("APP_SUSPENDED");return Object.freeze({allowNewHeavy:!reasons.length,reasons:Object.freeze(reasons),snapshot});
    }
    acquireKeepAwake(profile){if(!profile.keepAwake||!this.powerSaveBlocker||this.blockerId!==null)return null;this.blockerId=this.powerSaveBlocker.start("prevent-app-suspension");return this.blockerId;}
    releaseKeepAwake(){if(this.blockerId===null||!this.powerSaveBlocker)return;try{if(this.powerSaveBlocker.isStarted(this.blockerId))this.powerSaveBlocker.stop(this.blockerId);}finally{this.blockerId=null;}}
    dispose(){this.releaseKeepAwake();this.listeners.forEach(([name,listener])=>this.powerMonitor&&this.powerMonitor.removeListener(name,listener));this.listeners=[];this.onSuspend=null;this.loop.disable();}
}

class StudExecutionWatchdog{
    constructor(options={}){this.repository=options.repository;this.artifacts=options.artifactOperationsService||null;this.timers=new Map();}
    watch(value){
        this.clear(value.attemptId);const timeout=Math.max(1000,Math.min(Number(value.timeoutMs)||120000,7200000));
        const timer=setTimeout(()=>{if(typeof value.onTimeout==="function")value.onTimeout();},timeout);this.timers.set(value.attemptId,timer);
    }
    clear(attemptId){const timer=this.timers.get(attemptId);if(timer)clearTimeout(timer);this.timers.delete(attemptId);}
    record(value){const observedCondition=Academic.requiredText(value.observedCondition,"Observed condition",Domain.LIMITS.reason),incident=this.repository.incident({planId:value.planId,stepId:value.stepId,attemptId:value.attemptId,runId:value.runId,incidentType:Academic.enumValue(value.incidentType,Domain.INCIDENT_TYPES,"Watchdog incident"),observedCondition,policyResponse:Academic.enumValue(value.policyResponse,Domain.WATCHDOG_RESPONSES,"Watchdog response"),resolution:value.resolution?Academic.optionalText(value.resolution,"Incident resolution",Domain.LIMITS.reason):null});if(this.artifacts)this.artifacts.appendEvent({assignmentId:value.assignmentId,workflowId:value.workflowId,workflowNodeId:value.workflowNodeId,runId:value.runId,eventType:"WATCHDOG_INCIDENT",actor:"SYSTEM",severity:"WARNING",summary:observedCondition.slice(0,1000),payload:{incidentId:incident.id,incidentType:incident.incidentType,policyResponse:incident.policyResponse}});return incident;}
    dispose(){this.timers.forEach(timer=>clearTimeout(timer));this.timers.clear();}
}

module.exports=Object.freeze({StudResourceMonitor,StudExecutionWatchdog});
