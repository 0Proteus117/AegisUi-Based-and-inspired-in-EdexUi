"use strict";
const Academic=require("./studAcademicModel.class.js");
const D=require("./studFinalPackageModel.class.js");
const Citation=require("./studCitationService.class.js");
const Research=require("./studResearchModel.class.js");
const {StudFinalPackageRepository}=require("./studFinalPackageRepository.class.js");
const {StudFinalPackageFiles}=require("./studFinalPackageFiles.class.js");
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

class StudFinalPackageService {
    constructor({store,composition,claims,requirements,artifacts,managedStorage,dialog,shell}) {
        Object.assign(this,{store,composition,claims,requirements,artifacts,managedStorage});
        this.repository=new StudFinalPackageRepository(store);this.db=store.db;
        this.files=new StudFinalPackageFiles({root:store.root,dialog,shell});
    }
    options(input) {
        Academic.assertAllowedKeys(input,["assignmentId"],"Package options");const a=this.repository.assignment(input.assignmentId);
        return {drafts:this.db.prepare(`SELECT v.id,v.version_number versionNumber,d.title,v.created_at createdAt FROM stud_draft_versions v JOIN stud_draft_documents d ON d.id=v.draft_id WHERE v.assignment_id=? ORDER BY v.created_at DESC,v.id DESC LIMIT 50`).all(a.id),
            artifacts:this.artifacts.listArtifacts({assignmentId:a.id,limit:100}),styles:Research.CITATION_STYLES,limits:D.LIMITS,
            scope:"Draft and appendix choices are bounded. Bibliography derives from explicitly placed Evidence. HTML and Markdown are supported; other required formats remain a review item."};
    }
    list(input) {Academic.assertAllowedKeys(input,["assignmentId","beforeRevision"],"Package history");return this.repository.list(input.assignmentId,input.beforeRevision??null);}
    bounded(sql,params,limit,label) {
        const rows=this.db.prepare(sql+" LIMIT ?").all(...params,limit+1);
        if(rows.length>limit)D.fail("PACKAGE_LIMIT",`${label} exceeds the package inspection bound. No incomplete package was created.`);
        return rows;
    }
    basis(assignmentId,versionId,artifactIds,style) {
        const assignment=this.repository.assignment(assignmentId),version=this.composition.repository.hydrateVersion(Academic.safeId(versionId,"Draft Version ID"));
        if(version.assignmentId!==assignment.id)D.fail("CROSS_ASSIGNMENT_PACKAGE","The selected Draft Version belongs to another Assignment.");
        const draft=this.composition.repository.draftRow(version.draftId),plan=this.composition.repository.hydratePlan(draft.compositionPlanId);
        const currentContract=this.db.prepare("SELECT current_contract_id id FROM stud_assignment_requirement_contracts WHERE assignment_id=?").get(assignment.id);
        const contract=this.requirements.repository.hydrate(plan.requirementsContractId);
        const issues=[],add=(code,message,blocking=false)=>issues.push({code,message,blocking});
        if(draft.currentVersionId!==version.id)add("NEWER_DRAFT","A newer Draft Version exists. This package preserves the selected version.");
        if(currentContract?.id!==contract.id)add("CONTRACT_SUPERSEDED","The Assignment now uses a different Requirements Contract.",true);
        const freshness=this.requirements.evaluateFreshness(contract.id);
        if(freshness.condition!=="CURRENT")add("CONTRACT_REVIEW","Requirements source freshness requires review.",true);
        if(contract.completeness!=="COMPLETE")add("CONTRACT_INCOMPLETE","The approved Requirements Contract has unresolved or conflicting information.");
        if(version.sections.some(section=>!section.content.trim()))add("EMPTY_SECTION","The selected Draft contains an empty section.",true);
        const requirements=contract.items.map(item=>({id:item.id,label:item.label,type:item.type,value:item.displayValue,resolutionState:item.resolutionState,
            placements:plan.requirementCoverage.filter(link=>link.requirementItemId===item.id).map(link=>({sectionId:link.sectionId,disposition:link.disposition,reason:link.reason}))}));
        if(requirements.some(item=>!item.placements.length))add("COVERAGE_GAPS","Some Requirements have no recorded Section placement. Placement does not establish academic satisfaction.");
        if(contract.items.some(item=>item.type==="FORMAT"&&!/^(html|markdown|md)$/i.test(String(item.normalizedValue||item.displayValue||"").trim())))add("FORMAT_REVIEW","Check the required submission format. This package provides HTML and Markdown; convert and review externally if another format is required.");
        if(contract.items.some(item=>item.type==="CITATION"))add("REQUIRED_CITATION_STYLE_REVIEW","Compare the selected reference style with the exact Requirements Contract. Institutional style variants and free-text citations require human review.");
        const claimRows=this.bounded(`SELECT DISTINCT c.id,c.claim_text,c.lifecycle,c.row_version FROM stud_claims c JOIN stud_composition_section_claims l ON l.claim_id=c.id JOIN stud_composition_sections s ON s.id=l.section_id WHERE s.plan_id=? ORDER BY c.id`,[plan.id],D.LIMITS.claims,"Placed Claims");
        const evidenceRows=this.bounded(`SELECT DISTINCT e.id FROM stud_evidence_records e JOIN stud_composition_section_evidence l ON l.evidence_id=e.id JOIN stud_composition_sections s ON s.id=l.section_id WHERE s.plan_id=? ORDER BY e.id`,[plan.id],D.LIMITS.evidence,"Placed Evidence");
        const evidence=evidenceRows.map(row=>this.claims.evidence({assignmentId:assignment.id,evidenceId:row.id}));
        const links=this.bounded(`SELECT l.id,l.claim_id,l.evidence_id,l.relationship_type,l.lifecycle,l.row_version FROM stud_claim_evidence_links l JOIN stud_composition_section_claims p ON p.claim_id=l.claim_id JOIN stud_composition_sections s ON s.id=p.section_id WHERE s.plan_id=? GROUP BY l.id ORDER BY l.id`,[plan.id],1000,"Claim assessments");
        const placed=new Set(evidence.map(e=>e.id));
        if(claimRows.some(c=>!links.some(l=>l.claim_id===c.id&&placed.has(l.evidence_id)&&l.lifecycle==="REVIEWED"&&l.relationship_type==="SUPPORTS")))add("CLAIM_SUPPORT_GAP","Some placed Claims have no reviewed supporting Evidence placed in this document.");
        if(links.some(l=>l.lifecycle==="REVIEWED"&&l.relationship_type==="CONTRADICTS"))add("CONTRADICTORY_EVIDENCE","Reviewed contradictory Evidence requires human inspection.");
        const citations=evidence.map(e=>({evidenceId:e.id,sourceType:e.sourceObjectType,sourceId:e.sourceObjectId,documentId:e.documentId,extractionId:e.extractionId,chunkId:e.chunkId,pageStart:e.pageStart,pageEnd:e.pageEnd,locator:e.locator,sourceHash:e.sourceSnapshotHash,rowVersion:e.rowVersion,reviewState:e.reviewState,freshness:e.freshness,citationPaperId:e.citationPaperId,citationState:e.citationIntegrity.state,reason:e.citationIntegrity.reason}));
        if(citations.some(c=>c.freshness.state!=="CURRENT"))add("EVIDENCE_SOURCE_REVIEW","Some Evidence sources changed, are missing or require OCR.",true);
        if(citations.some(c=>c.reviewState!=="REVIEWED"))add("EVIDENCE_UNREVIEWED","Some placed Evidence has not been reviewed.");
        if(citations.some(c=>c.citationState!=="READY"))add("CITATION_REVIEW","Some Evidence lacks a usable matching citation.");
        const paperIds=[...new Set(evidence.map(e=>e.citationPaperId).filter(Boolean))].sort();
        D.ids(paperIds,D.LIMITS.papers);
        const papers=paperIds.map(id=>this.store.getEntity("RESEARCH_PAPER",id)).filter(Boolean);
        let bibliography={bibliography:"",bibtex:"",cslJson:[]};
        try {if(papers.length)bibliography=Citation.render(papers,style);}catch(error){add("CITATION_RENDER_FAILED","Citation.js could not render the selected bibliography.",true);}
        if(!papers.length)add("NO_BIBLIOGRAPHY","No bibliographic records are attached to placed Evidence. Confirm whether references are required.");
        add("CITATION_SCOPE","Citation checks cover canonical Evidence links; free-text citations in the Draft still require human checking.");
        const reviews=this.bounded("SELECT id,state,source_content_hash,finished_at,row_version FROM stud_lecturer_review_sessions WHERE source_draft_version_id=? ORDER BY created_at DESC,id",[version.id],D.LIMITS.reports,"Review sessions");
        const findings=this.bounded("SELECT f.id,f.session_id,f.status,f.severity,f.title,f.explanation,f.recommended_action,f.row_version FROM stud_lecturer_review_findings f JOIN stud_lecturer_review_sessions s ON s.id=f.session_id WHERE s.source_draft_version_id=? ORDER BY f.id",[version.id],D.LIMITS.reports,"Committee findings");
        if(!reviews.some(r=>r.state==="COMPLETE"))add("COMMITTEE_INCOMPLETE","No completed committee review exists for this exact Draft Version.");
        if(findings.some(f=>!["ADDRESSED","DISMISSED","SUPERSEDED"].includes(f.status)))add("COMMITTEE_FINDINGS_OPEN","Committee findings remain unresolved; these are advisory observations.");
        const blockers=this.bounded("SELECT b.id,b.title,b.status,b.reason,b.row_version FROM stud_workflow_blockers b JOIN stud_workflow_instances w ON w.id=b.workflow_id WHERE w.assignment_id=? AND w.is_current=1 AND b.status='OPEN' ORDER BY b.id",[assignment.id],D.LIMITS.reports,"Open blockers");
        // Same gate semantics as M4: rejection remains a gate until explicitly
        // replaced; the replacement's own pending/rejected state then governs.
        const checkpoints=this.bounded("SELECT c.id,c.title,c.status,c.row_version FROM stud_workflow_checkpoints c JOIN stud_workflow_instances w ON w.id=c.workflow_id WHERE w.assignment_id=? AND w.is_current=1 AND (c.status='PENDING' OR (c.status='REJECTED' AND NOT EXISTS (SELECT 1 FROM stud_workflow_checkpoints next WHERE next.workflow_id=c.workflow_id AND next.replaces_checkpoint_id=c.id))) ORDER BY c.id",[assignment.id],D.LIMITS.reports,"Unresolved checkpoints");
        if(blockers.length||checkpoints.length)add("WORKFLOW_CONDITIONS_OPEN","Workflow blockers or human checkpoints remain open. Approval is unavailable until reviewed.",true);
        const runs=this.db.prepare("SELECT id,operation_type,state,started_at,finished_at,status_summary FROM stud_operation_runs WHERE assignment_id=? ORDER BY created_at DESC,id DESC LIMIT 100").all(assignment.id);
        const eventCount=this.db.prepare("SELECT count(*) n FROM stud_operation_events WHERE assignment_id=?").get(assignment.id).n;
        const events=this.db.prepare("SELECT id,event_sequence,event_type,run_id,created_at,summary FROM stud_operation_events WHERE assignment_id=? ORDER BY event_sequence DESC LIMIT 200").all(assignment.id);
        const runCount=this.db.prepare("SELECT count(*) n FROM stud_operation_runs WHERE assignment_id=?").get(assignment.id).n;
        const appendices=artifactIds.map(id=>{
            const artifact=this.artifacts.scopedArtifact(assignment.id,id),object=this.artifacts.canonical(artifact.canonicalObjectType,artifact.canonicalObjectId);
            if(object.entityType==="FINAL_PACKAGE")D.fail("INVALID_PACKAGE_SOURCE","A final package cannot be nested as an appendix.");
            const reference=object.managedReference||object.localDocumentReference||object.localReference||null;
            // Canonical metadata alone cannot establish physical freshness.
            // M14 verifies the actual managed bytes and their canonical hash.
            const fileHash=reference?D.sha(this.managedStorage.read(reference,D.LIMITS.fileBytes)):null;
            return {artifactId:artifact.id,type:object.entityType,objectId:object.id,label:artifact.label,rowVersion:artifact.rowVersion,reference,
                objectHash:D.sha(D.json(object)),fileHash,availability:artifact.availabilityState};
        });
        if(appendices.some(a=>!a.reference))add("REFERENCE_ONLY_APPENDIX","Some appendices are canonical references only. Their file contents are not included.");
        if(appendices.some(a=>a.availability!=="AVAILABLE"))add("APPENDIX_UNAVAILABLE","A selected appendix is not currently available.",true);
        const bibliographicSources=papers.map(p=>({paperId:p.id,hash:D.sha(D.json(Citation.toCsl(p)))}));
        const report={assignment:{id:assignment.id,title:assignment.title},draft:{id:draft.id,versionId:version.id,versionNumber:version.versionNumber,hash:version.contentHash,currentVersionId:draft.currentVersionId},
            plan:{id:plan.id,hash:plan.planHash},contract:{id:contract.id,hash:contract.contractHash,completeness:contract.completeness,freshness},style,
            requirements,claims:claimRows,links,citations,bibliographicSources,committee:{reviews,findings},blockers,checkpoints,appendices,issues,
            citationScope:"Canonical placed Evidence and bibliographic records; not automatic validation of all free-text citations.",coverageScope:"Recorded placement, not academic satisfaction."};
        const reportJson=D.json(report);if(Buffer.byteLength(reportJson)>D.LIMITS.textBytes)D.fail("PACKAGE_LIMIT","Package inspection exceeds the text bound.");
        // Operational history is an immutable audit snapshot, not an approval
        // dependency: registering/exporting this package must not make it stale.
        return {version,draft,plan,report,bibliography,basisHash:D.sha(reportJson),audit:{runs,events,omittedRuns:Math.max(0,runCount-runs.length),omittedEvents:Math.max(0,eventCount-events.length)}};
    }
    create(input) {
        Academic.assertAllowedKeys(input,["assignmentId","draftVersionId","artifactIds","citationStyle"],"Final package creation");
        const artifactIds=D.ids(input.artifactIds||[],D.LIMITS.appendices),style=input.citationStyle;
        if(!Research.CITATION_STYLES.includes(style))D.fail("INVALID_INPUT","Choose a supported citation style.");
        const basis=this.basis(input.assignmentId,input.draftVersionId,artifactIds,style),id=Academic.createId("final_package"),createdAt=Academic.now(),sources=[...basis.report.bibliographicSources];
        const content=basis.version.sections.map(s=>`## ${s.title}\n\n${s.content}`).join("\n\n");
        const files=[{name:"candidate.md",bytes:`# ${basis.draft.title}\n\n${content}\n\n## References\n\n${basis.bibliography.bibliography}\n`},
            {name:"candidate.html",bytes:`<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(basis.draft.title)}</title><style>body{font:17px/1.65 Georgia,serif;max-width:48rem;margin:3rem auto;padding:0 2rem;color:#222}h1,h2{line-height:1.25}p{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}h2{break-after:avoid}}</style><body><h1>${esc(basis.draft.title)}</h1>${basis.version.sections.map(s=>`<section><h2>${esc(s.title)}</h2><p>${esc(s.content)}</p></section>`).join("")}<h2>References</h2><p>${esc(basis.bibliography.bibliography)}</p></body></html>`},
            {name:"bibliography.txt",bytes:basis.bibliography.bibliography},{name:"references.bib",bytes:basis.bibliography.bibtex},{name:"references.json",bytes:D.json(basis.bibliography.cslJson)},
            {name:"review-report.json",bytes:D.json(basis.report)},{name:"run-audit.json",bytes:D.json(basis.audit)},
            {name:"readme.txt",bytes:"Candidate for explicit human review. candidate.html and candidate.md include the selected immutable Draft and rendered bibliography. Reports are separate from the academic document. Canonical reference-only appendices are listed in review-report.json. Approval never submits work. Audit history is bounded; see omitted counts. External conversion is needed when an unsupported format is required.\n"}];
        let total=files.reduce((n,f)=>n+Buffer.byteLength(f.bytes),0);
        for(const [index,a] of basis.report.appendices.entries()) {
            sources.push({artifactId:a.artifactId,hash:a.objectHash});
            if(a.reference){const bytes=this.managedStorage.read(a.reference,D.LIMITS.fileBytes);total+=bytes.length;if(total>D.LIMITS.totalBytes)D.fail("PACKAGE_LIMIT","Selected package exceeds 128 MiB.");const extension=a.reference.split(".").pop().toLowerCase();files.push({name:`appendix-${index+1}.${extension}`,bytes});}
        }
        const inventory=files.map(f=>({name:f.name,sha256:D.sha(Buffer.isBuffer(f.bytes)?f.bytes:Buffer.from(f.bytes)),byteSize:Buffer.byteLength(f.bytes)})).sort((a,b)=>a.name.localeCompare(b.name));
        const manifest={format:"AEGIS_FINAL_PACKAGE_V1",packageId:id,assignmentId:input.assignmentId,draftVersionId:basis.version.id,basisHash:basis.basisHash,createdAt,files:inventory};
        const manifestText=D.json(manifest),manifestHash=D.sha(manifestText);files.push({name:"manifest.json",bytes:manifestText});
        const saved=this.files.write(id,files);
        this.store.transaction(()=>{this.repository.insert({id,assignmentId:input.assignmentId,draftVersionId:basis.version.id,planId:basis.plan.id,contractId:basis.plan.requirementsContractId,title:basis.draft.title,style,manifestHash,basisHash:basis.basisHash,snapshot:basis.report,createdAt},saved,sources);
            this.artifacts.registerArtifact({assignmentId:input.assignmentId,canonicalObjectType:"FINAL_PACKAGE",canonicalObjectId:id,artifactType:"EXPORT_PACKAGE",label:`${basis.draft.title} · Final package`,origin:"USER_CREATED",producer:"FINAL_PACKAGE",integrityHash:manifestHash});});
        return this.read({assignmentId:input.assignmentId,packageId:id});
    }
    inspect(p) {
        let integrity="VERIFIED",freshness="CURRENT";
        try{this.files.verify(p);}catch(error){integrity=error.code;}
        try{const b=this.basis(p.assignmentId,p.draftVersionId,p.snapshot.appendices.map(a=>a.artifactId),p.citationStyle);if(b.basisHash!==p.basisHash)freshness="SOURCE_CHANGED";}catch(error){freshness="SOURCE_UNAVAILABLE";}
        return {integrity,freshness};
    }
    read(input) {
        Academic.assertAllowedKeys(input,["assignmentId","packageId"],"Package inspection");const p=this.repository.get(input.assignmentId,input.packageId);
        const inspection=this.inspect(p);let preview=null;
        if(inspection.integrity==="VERIFIED")preview=this.files.readFile(p.id,p.files.find(f=>f.name==="candidate.md")).toString("utf8");
        return {...p,...inspection,preview,state:p.approval?"APPROVED_FOR_MANUAL_SUBMISSION":"AWAITING_HUMAN_REVIEW"};
    }
    approvalGate(p) {
        const inspection=this.inspect(p);
        if(inspection.integrity!=="VERIFIED")D.fail("PACKAGE_INTEGRITY_FAILED","Verify package files before approval/export.");
        if(inspection.freshness!=="CURRENT")D.fail("PACKAGE_SOURCE_CHANGED","The package basis changed. Create and inspect a new package.");
        if(p.snapshot.issues.some(i=>i.blocking))D.fail("PACKAGE_BLOCKED","Resolve the listed blocking conditions and create a new package.");
    }
    approve(input) {
        Academic.assertAllowedKeys(input,["assignmentId","packageId","expectedManifestHash","confirmReviewed","acknowledgeIssues"],"Final human approval");
        const p=this.repository.get(input.assignmentId,input.packageId);
        if(input.expectedManifestHash!==p.manifestHash)D.fail("STALE_PACKAGE_VERSION","The inspected package fingerprint does not match.");
        if(input.confirmReviewed!==true)D.fail("HUMAN_REVIEW_REQUIRED","Explicit human review is required.");
        this.approvalGate(p);
        if(p.snapshot.issues.length&&input.acknowledgeIssues!==true)D.fail("ISSUE_ACKNOWLEDGEMENT_REQUIRED","Inspect and explicitly acknowledge the package limitations.");
        if(!p.approval)this.store.transaction(()=>this.repository.approve(p,input.acknowledgeIssues===true));
        return this.read({assignmentId:p.assignmentId,packageId:p.id});
    }
    async export(input) {
        Academic.assertAllowedKeys(input,["assignmentId","packageId","expectedManifestHash"],"Package export");const p=this.repository.get(input.assignmentId,input.packageId);
        if(input.expectedManifestHash!==p.manifestHash)D.fail("STALE_PACKAGE_VERSION","Export must refer to the inspected package.");
        // Review copies may be exported while partial/blocked. The receipt makes
        // their unapproved state explicit; an approved export must be current.
        const validate=()=>{if(p.approval)this.approvalGate(p);else this.files.verify(p);};validate();
        return this.files.export(p,validate);
    }
    register(add) {
        add("stud-final-package-options",["assignmentId"],p=>this.options(p));
        add("stud-final-package-list",["assignmentId","beforeRevision"],p=>this.list(p));
        add("stud-final-package-read",["assignmentId","packageId"],p=>this.read(p));
        add("stud-final-package-create",["assignmentId","draftVersionId","artifactIds","citationStyle"],p=>this.create(p));
        add("stud-final-package-approve",["assignmentId","packageId","expectedManifestHash","confirmReviewed","acknowledgeIssues"],p=>this.approve(p));
        add("stud-final-package-export",["assignmentId","packageId","expectedManifestHash"],p=>this.export(p));
    }
}
module.exports={StudFinalPackageService};
