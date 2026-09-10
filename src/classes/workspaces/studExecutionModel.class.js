"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const PLAN_SCOPES = Object.freeze(["CURRENT_STAGE","SELECTED_STAGES","FROM_CURRENT_STAGE","FULL_AVAILABLE_WORKFLOW"]);
const PLAN_STATES = Object.freeze(["DRAFT","READY","RUNNING","PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED","COMPLETED","FAILED","CANCELLED"]);
const STEP_STATES = Object.freeze(["PENDING","READY","RUNNING","PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED","COMPLETED","FAILED","CANCELLED","SKIPPED","UNSUPPORTED"]);
const EXECUTION_CLASSES = Object.freeze(["AUTO_EXECUTABLE","HUMAN_GATE","EXTERNAL_WAIT","MANUAL_ONLY","UNSUPPORTED"]);
const RESOURCE_CLASSES = Object.freeze(["LIGHT","NETWORK","MODEL_LIGHT","MODEL_HEAVY"]);
const IDEMPOTENCY = Object.freeze(["IDEMPOTENT","RESTARTABLE_WITH_KEY","NON_IDEMPOTENT"]);
const RECOVERY_CLASSES = Object.freeze(["RESUME_FROM_CHECKPOINT","SAFE_RESTART","MANUAL_RECOVERY","NOT_RECOVERABLE"]);
const CAPABILITIES = Object.freeze(["STRUCTURED_EXTRACTION","SHORT_REASONING","LONG_CONTEXT_SYNTHESIS","ACADEMIC_SECTION_DRAFTING","EDITORIAL_TRANSFORMATION","ACADEMIC_REVIEW","CORRECTION"]);
const ASSESSMENTS = Object.freeze(["UNVERIFIED","LIMITED","SUITABLE","PREFERRED","UNSUITABLE"]);
const PROFILE_TYPES = Object.freeze(["INTERACTIVE","BALANCED","OVERNIGHT","CUSTOM"]);
const ROUTE_OUTCOMES = Object.freeze(["SELECTED","NO_SUITABLE_MODEL","PINNED_MODEL_UNAVAILABLE","RESOURCE_PROFILE_EXCLUDED"]);
const ACTIONS = Object.freeze(["LAUNCH","PAUSE","RESUME","CANCEL","RETRY","SKIP","REBUILD"]);
const INCIDENT_TYPES = Object.freeze(["TASK_TIMEOUT","HEARTBEAT_LOST","MODEL_UNAVAILABLE","MODEL_REQUEST_FAILED","MEMORY_PRESSURE","DISK_PRESSURE","APP_SUSPENDED","RECOVERY_REQUIRED","LATE_RESULT_REJECTED","RETRY_LIMIT_REACHED","RESOURCE_PROFILE_CONFLICT","INVALID_COORDINATOR_STATE","UNKNOWN"]);
const WATCHDOG_RESPONSES = Object.freeze(["WARN","STOP_SCHEDULING_NEW_TASKS","PAUSE_PLAN","CANCEL_CURRENT_ATTEMPT","FAIL_ATTEMPT","REQUEST_HUMAN"]);
const LIMITS = Object.freeze({plans:50,steps:120,attempts:50,checkpoints:100,incidents:100,history:100,text:1000,reason:2000,jsonBytes:64*1024,modelMetadataBytes:16*1024});

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.keys(value).sort().reduce((result,key)=>{result[key]=canonical(value[key]);return result;},{});
    return value;
}
function canonicalJson(value){return JSON.stringify(canonical(value));}
function hash(value){return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");}
function parse(value,fallback=null){try{return value?JSON.parse(value):fallback;}catch(_error){return fallback;}}
function boundedJson(value,label,max=LIMITS.jsonBytes){
    if(value===undefined||value===null)return null;
    Academic.assertPlainObject(value,label);
    if(Academic.bytesOf(value)>max)throw new Academic.StudError("PAYLOAD_TOO_LARGE",`${label} exceeds its bounded size.`);
    return canonicalJson(value);
}
function positiveInteger(value,label,min,max){
    const number=Number(value);
    if(!Number.isInteger(number)||number<min||number>max)throw new Academic.StudError("INVALID_INPUT",`${label} must be between ${min} and ${max}.`);
    return number;
}
function expectedVersion(value,label="Expected version"){
    const number=Number(value);
    if(!Number.isInteger(number)||number<1)throw new Academic.StudError("INVALID_INPUT",`${label} is required.`);
    return number;
}
function stableKey(...parts){return hash(parts).slice(0,48);}

module.exports=Object.freeze({
    PLAN_SCOPES,PLAN_STATES,STEP_STATES,EXECUTION_CLASSES,RESOURCE_CLASSES,IDEMPOTENCY,
    RECOVERY_CLASSES,CAPABILITIES,ASSESSMENTS,PROFILE_TYPES,ROUTE_OUTCOMES,ACTIONS,
    INCIDENT_TYPES,WATCHDOG_RESPONSES,LIMITS,canonicalJson,hash,parse,boundedJson,
    positiveInteger,expectedVersion,stableKey
});
