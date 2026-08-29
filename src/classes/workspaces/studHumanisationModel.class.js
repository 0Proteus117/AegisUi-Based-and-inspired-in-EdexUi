"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");
const Composition = require("./studCompositionModel.class.js");

const GENRES = Object.freeze(["ACADEMIC_ESSAY","TECHNICAL_REPORT","LAB_REPORT","REFLECTIVE_WRITING","CASE_ANALYSIS","RESEARCH_REPORT","PRESENTATION_SCRIPT","CUSTOM"]);
const PROFILE_ORIGINS = Object.freeze(["USER_CONFIGURED","USER_WRITING_SAMPLES","GENRE_DEFAULT","IMPORT_OTHER"]);
const PROFILE_LIFECYCLES = Object.freeze(["ACTIVE","ARCHIVED"]);
const SAMPLE_TYPES = Object.freeze(["MANUAL_TEXT","CANONICAL_NOTE","CANONICAL_DRAFT","CANONICAL_DOCUMENT"]);
const SAMPLE_AUTHORSHIP = Object.freeze(["USER_CONFIRMED","UNKNOWN"]);
const SESSION_STATES = Object.freeze(["CREATED","RUNNING","CANDIDATE_READY","NEEDS_REVIEW","ACCEPTED","REJECTED","FAILED","CANCELLED"]);
const SCOPES = Object.freeze(["SECTION","SELECTED_SECTIONS","FULL_DRAFT"]);
const GOALS = Object.freeze(["REDUCE_FORMULAIC_LANGUAGE","REDUCE_REPETITION","IMPROVE_SENTENCE_VARIATION","IMPROVE_TRANSITIONS","SIMPLIFY_INFLATED_VOCABULARY","REDUCE_EMPTY_HEDGING","ALIGN_WITH_PROFILE","IMPROVE_READABILITY","PRESERVE_TECHNICAL_REGISTER","CUSTOM_EDITORIAL_NOTE"]);
const INTEGRITY_STATES = Object.freeze(["PENDING","PASS","CONFLICT","REVIEW_REQUIRED"]);
const CHECK_TYPES = Object.freeze(["CITATIONS","NUMBERS_UNITS","QUOTATIONS","EQUATIONS","URL_IDENTIFIERS","PROTECTED_TERMS","CLAIMS","EVIDENCE_LINKS"]);
const EDIT_CATEGORIES = Object.freeze(["REPETITION","TRANSITION","WORDING","SENTENCE_STRUCTURE","HEDGING","REGISTER","PROFILE_ALIGNMENT","OTHER"]);
const LIMITS = Object.freeze({
    name:160, label:240, notes:6000, phrase:160, phrases:80, samples:24,
    sampleCharacters:120000, sampleTotalCharacters:500000, sections:40,
    sectionCharacters:120000, candidateCharacters:500000, sessions:50,
    goals:10, protectedSpans:5000, protectedValue:12000, diffTokens:6000,
    diffLines:Composition.LIMITS.diffLines, profileHistory:50, metadataBytes:32000
});

const DEFAULTS = Object.freeze({
    ACADEMIC_ESSAY:{sentenceLength:"VARIED",paragraphLength:"MEDIUM",firstPerson:"LIMITED",voice:"BALANCED",transitionStyle:"EXPLICIT_BUT_NATURAL",formality:"FORMAL",directness:"BALANCED",hedging:"EVIDENCE_LED",vocabulary:"DISCIPLINE_APPROPRIATE",abbreviations:"DEFINE_FIRST_USE",parentheticals:"LIMITED",signposting:"MODERATE",conclusionStyle:"SYNTHESISE_NOT_REPEAT"},
    TECHNICAL_REPORT:{sentenceLength:"CONCISE",paragraphLength:"SHORT_TO_MEDIUM",firstPerson:"AVOID_UNLESS_REQUIRED",voice:"ACTIVE_WHERE_CLEAR",transitionStyle:"FUNCTIONAL",formality:"FORMAL",directness:"DIRECT",hedging:"QUANTIFIED",vocabulary:"TECHNICAL_PRECISE",abbreviations:"DEFINE_FIRST_USE",parentheticals:"LIMITED",signposting:"EXPLICIT",conclusionStyle:"FINDINGS_AND_LIMITATIONS"},
    LAB_REPORT:{sentenceLength:"CONCISE",paragraphLength:"SHORT",firstPerson:"INSTITUTION_DEPENDENT",voice:"METHOD_APPROPRIATE",transitionStyle:"FUNCTIONAL",formality:"FORMAL",directness:"DIRECT",hedging:"UNCERTAINTY_PRESERVING",vocabulary:"TECHNICAL_PRECISE",abbreviations:"DEFINE_FIRST_USE",parentheticals:"LIMITED",signposting:"EXPLICIT",conclusionStyle:"RESULTS_LIMITATIONS"},
    REFLECTIVE_WRITING:{sentenceLength:"VARIED",paragraphLength:"MEDIUM",firstPerson:"ENCOURAGED",voice:"ACTIVE",transitionStyle:"REFLECTIVE",formality:"ACADEMIC_PERSONAL",directness:"DIRECT",hedging:"HONEST",vocabulary:"NATURAL",abbreviations:"LIMITED",parentheticals:"MODERATE",signposting:"LIGHT",conclusionStyle:"LEARNING_AND_NEXT_STEPS"},
    CASE_ANALYSIS:{sentenceLength:"VARIED",paragraphLength:"MEDIUM",firstPerson:"LIMITED",voice:"BALANCED",transitionStyle:"ARGUMENTATIVE",formality:"FORMAL",directness:"PRECISE",hedging:"QUALIFICATION_PRESERVING",vocabulary:"AUTHORITY_APPROPRIATE",abbreviations:"DEFINE_FIRST_USE",parentheticals:"MODERATE",signposting:"EXPLICIT",conclusionStyle:"REASONED_OUTCOME"},
    RESEARCH_REPORT:{sentenceLength:"VARIED",paragraphLength:"MEDIUM",firstPerson:"METHOD_DEPENDENT",voice:"BALANCED",transitionStyle:"EVIDENCE_LED",formality:"FORMAL",directness:"PRECISE",hedging:"LIMITATION_PRESERVING",vocabulary:"DISCIPLINE_APPROPRIATE",abbreviations:"DEFINE_FIRST_USE",parentheticals:"LIMITED",signposting:"EXPLICIT",conclusionStyle:"FINDINGS_LIMITATIONS"},
    PRESENTATION_SCRIPT:{sentenceLength:"SPOKEN_CONCISE",paragraphLength:"SHORT",firstPerson:"AUDIENCE_APPROPRIATE",voice:"ACTIVE",transitionStyle:"SPOKEN",formality:"AUDIENCE_APPROPRIATE",directness:"DIRECT",hedging:"EVIDENCE_LED",vocabulary:"ACCESSIBLE",abbreviations:"MINIMAL",parentheticals:"AVOID",signposting:"EXPLICIT",conclusionStyle:"MEMORABLE_SYNTHESIS"},
    CUSTOM:{sentenceLength:"USER_DEFINED",paragraphLength:"USER_DEFINED",firstPerson:"USER_DEFINED",voice:"USER_DEFINED",transitionStyle:"USER_DEFINED",formality:"USER_DEFINED",directness:"USER_DEFINED",hedging:"USER_DEFINED",vocabulary:"USER_DEFINED",abbreviations:"USER_DEFINED",parentheticals:"USER_DEFINED",signposting:"USER_DEFINED",conclusionStyle:"USER_DEFINED"}
});

function hash(value) { return Composition.canonicalHash(value); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch (_error) { return fallback; } }
function normalizedPhrases(values, label) {
    if (values === undefined || values === null) return Object.freeze([]);
    if (!Array.isArray(values) || values.length > LIMITS.phrases) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} must be a bounded list.`);
    return Object.freeze([...new Set(values.map(value => Academic.requiredText(value,label,LIMITS.phrase)))].sort((a,b)=>a.localeCompare(b)));
}
function normalizePreferences(input, genre) {
    const source = input === undefined || input === null ? {} : input;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Academic.StudError("INVALID_INPUT", "Profile preferences must be an object.");
    if (Object.keys(source).length > 32) throw new Academic.StudError("PAYLOAD_TOO_LARGE", "Profile preferences exceed their bound.");
    const defaults = DEFAULTS[genre] || DEFAULTS.CUSTOM;
    const result = {...defaults};
    Object.entries(source).forEach(([key,value]) => {
        if (!Object.hasOwn(defaults,key)) throw new Academic.StudError("INVALID_INPUT", `Unsupported style preference: ${key}.`);
        result[key] = Academic.requiredText(value,`Style preference ${key}`,120);
    });
    return Object.freeze(result);
}
function profileRevision(input = {}, existing = null) {
    const genre = Academic.enumValue(input.genre === undefined ? existing && existing.genre : input.genre,GENRES,"Humanisation genre","CUSTOM");
    const preferences = normalizePreferences(input.preferences === undefined ? existing && existing.preferences : input.preferences,genre);
    const preferredPhrases = normalizedPhrases(input.preferredPhrases === undefined ? existing && existing.preferredPhrases : input.preferredPhrases,"Preferred phrase");
    const avoidedPhrases = normalizedPhrases(input.avoidedPhrases === undefined ? existing && existing.avoidedPhrases : input.avoidedPhrases,"Avoided phrase");
    const customNotes = input.customNotes === undefined ? existing && existing.customNotes || null : Academic.optionalText(input.customNotes,"Profile notes",LIMITS.notes);
    const fingerprint = input.fingerprint || existing && existing.fingerprint || emptyFingerprint();
    const payload = {genre,preferences,preferredPhrases,avoidedPhrases,customNotes,fingerprint};
    return Object.freeze({...payload,profileHash:hash(payload)});
}

function words(text) { return String(text||"").match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]; }
function sentences(text) { return String(text||"").split(/(?<=[.!?])\s+(?=[\p{Lu}\d“"'])/u).map(v=>v.trim()).filter(Boolean); }
function paragraphs(text) { return String(text||"").split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean); }
function round(value) { return Math.round(Number(value||0)*100)/100; }
function emptyFingerprint() { return Object.freeze({sampleCount:0,wordCount:0,meanSentenceWords:0,sentenceWordRange:[0,0],meanParagraphWords:0,firstPersonPerThousand:0,contractionsPerThousand:0,parentheticalsPerThousand:0,transitionCount:0,semicolonPerThousand:0,colonPerThousand:0,lexicalVariety:0,repeatedPhrases:Object.freeze([]),definitions:"Deterministic descriptive text statistics only; not authorship identification."}); }
function styleFingerprint(texts) {
    if (!Array.isArray(texts)) throw new Academic.StudError("INVALID_INPUT","Writing samples must be an array.");
    const text = texts.map(value=>String(value||"")).join("\n\n");
    const tokenList=words(text), sentenceList=sentences(text), paragraphList=paragraphs(text);
    const sentenceLengths=sentenceList.map(item=>words(item).length).filter(Boolean), paragraphLengths=paragraphList.map(item=>words(item).length).filter(Boolean);
    const lower=tokenList.map(item=>item.toLocaleLowerCase("en-GB")), first=new Set(["i","me","my","mine","we","us","our","ours"]);
    const transitions=(text.match(/\b(?:however|therefore|moreover|nevertheless|consequently|in contrast|for example|in addition|as a result)\b/gi)||[]).length;
    const trigrams=new Map(); for(let i=0;i+2<lower.length;i++){const key=lower.slice(i,i+3).join(" ");trigrams.set(key,(trigrams.get(key)||0)+1);}
    const repeated=[...trigrams].filter(([,count])=>count>=3).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12).map(([phrase,count])=>Object.freeze({phrase,count}));
    const perThousand=count=>tokenList.length?round(count/tokenList.length*1000):0;
    return Object.freeze({sampleCount:texts.length,wordCount:tokenList.length,meanSentenceWords:round(sentenceLengths.reduce((a,b)=>a+b,0)/(sentenceLengths.length||1)),sentenceWordRange:Object.freeze(sentenceLengths.length?[Math.min(...sentenceLengths),Math.max(...sentenceLengths)]:[0,0]),meanParagraphWords:round(paragraphLengths.reduce((a,b)=>a+b,0)/(paragraphLengths.length||1)),firstPersonPerThousand:perThousand(lower.filter(word=>first.has(word)).length),contractionsPerThousand:perThousand((text.match(/\b[\p{L}]+['’](?:t|s|re|ve|ll|d|m)\b/giu)||[]).length),parentheticalsPerThousand:perThousand((text.match(/\([^\n()]{1,240}\)/g)||[]).length),transitionCount:transitions,semicolonPerThousand:perThousand((text.match(/;/g)||[]).length),colonPerThousand:perThousand((text.match(/:/g)||[]).length),lexicalVariety:tokenList.length?round(new Set(lower).size/tokenList.length):0,repeatedPhrases:Object.freeze(repeated),definitions:"Sentence and paragraph token counts, explicit lexical markers and repeated trigrams. Style guidance only; no identity or authorship probability."});
}

const PATTERNS = Object.freeze([
    ["QUOTATIONS",/[“”][^“”\n]{1,12000}[“”]|"[^"\n]{1,12000}"|'[^'\n]{2,12000}'/gu,100],
    ["EQUATIONS",/\$\$[\s\S]{1,12000}?\$\$|\$[^$\n]{1,2000}\$|\\\[[\s\S]{1,12000}?\\\]|\\\([^\n]{1,2000}?\\\)|(?:^|\n)\s*[A-Za-z][A-Za-z0-9_]*(?:\([^\n=]{0,80}\))?\s*=\s*[^\n]{1,500}/gu,90],
    ["URL_IDENTIFIERS",/https?:\/\/[^\s<>()\[\]{}"']+|\bdoi:\s*10\.\d{4,9}\/[^\s<>()\[\]{}"']+|\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/giu,85],
    ["CITATIONS",/\[[0-9]{1,4}(?:\s*[,;–-]\s*[0-9]{1,4})*\]|\((?:[\p{L}][\p{L}'’.-]+(?:\s+(?:et\s+al\.|and|&)\s+[\p{L}][\p{L}'’.-]+)?),?\s+(?:19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.\s*\d+(?:[-–]\d+)?)?\)/giu,80],
    ["PROTECTED_TERMS",/\b(?:Figure|Fig\.|Table|Equation|Eq\.)\s+[A-Za-z]?\d+(?:[.-]\d+)*\b/giu,70],
    ["NUMBERS_UNITS",/[+−-]?(?:\d+(?:[.,]\d+)?|\.\d+)(?:\s*[×x]\s*10\s*\^?\s*[+−-]?\d+|[eE][+−-]?\d+)?(?:\s*(?:±|\+\/-)\s*\d+(?:[.,]\d+)?)?(?:\s*[–—-]\s*[+−-]?\d+(?:[.,]\d+)?)?(?:\s*%|\s*(?:kg|g|mg|m|mm|cm|km|s|ms|h|K|°C|Pa|kPa|MPa|bar|N|kN|J|kJ|W|kW|V|A|Hz|mol|m\/s|m\/s²|m2|m²|m3|m³|Mach)\b)?/giu,60],
    ["EQUATIONS",/`[^`\n]{1,2000}`/gu,50]
]);
function protectedSpans(text) {
    const source=String(text||"");
    if(source.includes("⟦AEGIS_PROTECTED_"))throw new Academic.StudError("PROTECTED_PLACEHOLDER_COLLISION","Draft contains a reserved Humanisation placeholder marker.");
    const matches=[];
    PATTERNS.forEach(([type,pattern,priority])=>{pattern.lastIndex=0;let match;while((match=pattern.exec(source))){matches.push({type,value:match[0],start:match.index,end:match.index+match[0].length,priority});if(matches.length>LIMITS.protectedSpans*3)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Protected span candidates exceed their bound.");}});
    matches.sort((a,b)=>a.start-b.start||b.priority-a.priority||(b.end-b.start)-(a.end-a.start));
    const selected=[]; for(const item of matches){if(selected.some(other=>item.start<other.end&&item.end>other.start))continue;selected.push(item);if(selected.length>LIMITS.protectedSpans)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Protected spans exceed their bound.");}
    selected.sort((a,b)=>a.start-b.start);
    let offset=0,protectedText="";
    const spans=selected.map((item,index)=>{protectedText+=source.slice(offset,item.start);const placeholder=`⟦AEGIS_PROTECTED_${String(index).padStart(4,"0")}_${crypto.createHash("sha256").update(`${item.type}\0${item.value}`).digest("hex").slice(0,12)}⟧`;protectedText+=placeholder;offset=item.end;return Object.freeze({...item,placeholder});});
    protectedText+=source.slice(offset);
    return Object.freeze({protectedText,spans:Object.freeze(spans),sourceHash:hash(source)});
}
function restoreProtected(candidate, protection) {
    let text=String(candidate||"");
    const present=text.match(/⟦AEGIS_PROTECTED_[^⟧]{1,100}⟧/g)||[];
    const allowed=new Set(protection.spans.map(item=>item.placeholder));
    if(present.length!==protection.spans.length||new Set(present).size!==present.length||present.some(value=>!allowed.has(value)))throw new Academic.StudError("INTEGRITY_CONFLICT","Protected placeholders were removed, duplicated or forged by the transformation.");
    protection.spans.forEach(item=>{text=text.replace(item.placeholder,item.value);});
    return text;
}
function valuesByType(text) { const result={};CHECK_TYPES.slice(0,6).forEach(type=>result[type]=[]);const protection=protectedSpans(String(text||"")).spans;protection.forEach(item=>result[item.type].push(item.value));Object.values(result).forEach(values=>values.sort());return result; }
function integrity(source,candidate,options={}) {
    const left=valuesByType(source),right=valuesByType(candidate),checks=[];
    CHECK_TYPES.slice(0,6).forEach(type=>{const same=JSON.stringify(left[type])===JSON.stringify(right[type]);checks.push(Object.freeze({type,state:left[type].length||right[type].length?(same?"PASS":"CONFLICT"):"NOT_APPLICABLE",sourceValues:Object.freeze(left[type]),candidateValues:Object.freeze(right[type]),summary:same?`${type.replace(/_/g," ")} unchanged.`:`${type.replace(/_/g," ")} changed unexpectedly.`}));});
    checks.push(Object.freeze({type:"EVIDENCE_LINKS",state:"PASS",sourceValues:Object.freeze([]),candidateValues:Object.freeze([]),summary:"Humanisation does not mutate M8 Evidence relationships."}));
    checks.push(Object.freeze({type:"CLAIMS",state:options.hasReviewedClaims?"REVIEW_REQUIRED":"NOT_APPLICABLE",sourceValues:Object.freeze([]),candidateValues:Object.freeze([]),summary:options.hasReviewedClaims?"Reviewed Claim records are unchanged; semantic preservation requires human review.":"No reviewed Claim is linked to the selected Section."}));
    const state=checks.some(item=>item.state==="CONFLICT")?"CONFLICT":checks.some(item=>item.state==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"PASS";
    return Object.freeze({state,checks:Object.freeze(checks)});
}
function editorialCategory(before,after) { const joined=`${before} ${after}`.toLowerCase();if(/however|therefore|moreover|transition/.test(joined))return "TRANSITION";if(/may|might|could|arguably|perhaps/.test(joined))return "HEDGING";if(words(before).length!==words(after).length&&Math.abs(words(before).length-words(after).length)>8)return "SENTENCE_STRUCTURE";return "WORDING"; }
function wordDiff(before,after) {
    const left=String(before||"").split(/(\s+)/),right=String(after||"").split(/(\s+)/);
    if(left.length>LIMITS.diffTokens||right.length>LIMITS.diffTokens)return Object.freeze({mode:"LINE",truncated:true,lines:Composition.lineDiff(before,after).lines,categories:Object.freeze(["OTHER"])});
    const matrix=Array.from({length:left.length+1},()=>new Uint16Array(right.length+1));
    for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)matrix[i][j]=left[i]===right[j]?matrix[i+1][j+1]+1:Math.max(matrix[i+1][j],matrix[i][j+1]);
    const changes=[];let i=0,j=0;while(i<left.length||j<right.length){if(i<left.length&&j<right.length&&left[i]===right[j]){changes.push({type:"UNCHANGED",text:left[i++]});j++;}else if(j<right.length&&(i===left.length||matrix[i][j+1]>=matrix[i+1][j]))changes.push({type:"ADDED",text:right[j++]});else changes.push({type:"REMOVED",text:left[i++]});}
    return Object.freeze({mode:"WORD",truncated:false,changes:Object.freeze(changes.map(Object.freeze)),categories:Object.freeze([editorialCategory(before,after)])});
}

module.exports=Object.freeze({GENRES,PROFILE_ORIGINS,PROFILE_LIFECYCLES,SAMPLE_TYPES,SAMPLE_AUTHORSHIP,SESSION_STATES,SCOPES,GOALS,INTEGRITY_STATES,CHECK_TYPES,EDIT_CATEGORIES,LIMITS,DEFAULTS,hash,parseJson,profileRevision,styleFingerprint,emptyFingerprint,protectedSpans,restoreProtected,integrity,wordDiff,normalizedPhrases});
