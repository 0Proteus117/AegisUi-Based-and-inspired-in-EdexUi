#!/usr/bin/env node
"use strict";

// Real PDF.js extraction, not an injected parser. All content is generated
// synthetic test material; no profile, provider or model is opened.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {spawnSync} = require("child_process");
const {open} = require("./test-stud-final-package.js");
const {StudDocumentRuntime} = require("../src/classes/workspaces/studDocumentRuntime.class.js");

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stud-m16-evidence-"));
    let env = open(root), passed = 0;
    const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
    try {
        const pdfPath = path.join(root, "synthetic.pdf");
        const generated = spawnSync(process.execPath, [path.join(__dirname, "create-synthetic-stud-pdf.js"), pdfPath], {encoding:"utf8"});
        assert.equal(generated.status, 0, generated.stderr);
        const bytes = fs.readFileSync(pdfPath);
        const assignment = env.store.createEntity("ASSIGNMENT", {title:"Synthetic provenance acceptance"});
        const document = env.store.saveAcademicDocument({reference:"documents/synthetic.pdf",displayName:"synthetic.pdf",mimeType:"application/pdf",size:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")}, {title:"Synthetic generated source",documentType:"COURSE_MATERIAL",assignmentId:assignment.id}).document;
        const runtime = new StudDocumentRuntime({readManagedPdf:reference => {
            assert.equal(reference,"documents/synthetic.pdf");
            return {bytesBase64:bytes.toString("base64")};
        }});
        const warnings = [], originalLog = console.log, originalWarn = console.warn;
        console.log = (...args) => { warnings.push(args.join(" ")); originalLog(...args); };
        console.warn = (...args) => { warnings.push(args.join(" ")); originalWarn(...args); };
        let parsed;
        try { parsed = await runtime.analyze({document:{managedReference:"documents/synthetic.pdf"},requestId:"m16-real-pdf"}); }
        finally { console.log = originalLog; console.warn = originalWarn; }
        runtime.dispose();
        check("real PDF.js local extraction", () => {
            assert.equal(parsed.status,"READY"); assert.equal(parsed.networkUsed,false);
            assert(parsed.chunks[0].content.includes("Synthetic academic PDF"));
            assert(!warnings.some(line=>/Unable to load font data/.test(line)), "Bundled font data must resolve through the Node PDF.js factory");
        });
        const extraction = env.store.persistDocumentExtraction(document.id, parsed);
        const chunk = env.store.db.prepare("SELECT * FROM stud_document_chunks WHERE extraction_id=?").get(extraction.extractionId);
        const created = env.claims.createEvidence({assignmentId:assignment.id,sourceObjectType:"ACADEMIC_DOCUMENT",sourceObjectId:document.id,locator:{chunkId:chunk.id}});
        const update = fields => env.claims.updateEvidence({assignmentId:assignment.id,evidenceId:created.id,expectedVersion:created.rowVersion,...fields});
        const other = env.store.createEntity("ACADEMIC_DOCUMENT", {title:"Unrelated source",documentType:"REPORT"});
        const foreignExtraction = env.store.persistDocumentExtraction(other.id,parsed);
        const foreignChunk = env.store.db.prepare("SELECT id FROM stud_document_chunks WHERE extraction_id=?").get(foreignExtraction.extractionId);
        check("reject cross-document locator without mutation", () => {
            assert.throws(()=>update({locator:{chunkId:foreignChunk.id}}),error=>error.code==="INVALID_PROVENANCE");
            assert.equal(env.claims.evidence({assignmentId:assignment.id,evidenceId:created.id}).rowVersion,created.rowVersion);
        });
        check("reject malformed locator without mutation", () => {
            for(const locator of [null,[],"arbitrary"])
                assert.throws(()=>update({locator}),error=>error.code==="INVALID_PROVENANCE");
        });
        check("reject nonexistent historical extraction", () => {
            assert.throws(()=>update({locator:{extractionId:"stud_missing",pageStart:1}}),error=>error.code==="INVALID_PROVENANCE");
        });
        check("reject range with pages absent from extraction", () => {
            assert.throws(()=>update({locator:{extractionId:extraction.extractionId,pageStart:1,pageEnd:10}}),error=>error.code==="INVALID_PROVENANCE");
        });
        const updated = update({locator:{extractionId:extraction.extractionId,pageStart:1},reviewerNote:"Explicit page selection"});
        check("valid locator update atomically changes canonical provenance", () => {
            assert.equal(updated.locationType,"DOCUMENT_PAGE");assert.equal(updated.chunkId,null);
            assert.equal(updated.extractionId,extraction.extractionId);assert.equal(updated.pageStart,1);
            assert.notEqual(updated.sourceSnapshotHash,created.sourceSnapshotHash);
            assert.equal(updated.excerpt,parsed.pages[0].text);
            assert.equal(env.claims.evidence({assignmentId:assignment.id,evidenceId:created.id}).freshness.state,"CURRENT");
        });
        check("stale locator write rejected", () => assert.throws(()=>update({locator:{chunkId:chunk.id}}),error=>error.code==="STALE_EVIDENCE_VERSION"));
        const noted = env.claims.updateEvidence({assignmentId:assignment.id,evidenceId:created.id,expectedVersion:updated.rowVersion,reviewerNote:"No relocation"});
        check("note edit preserves exact snapshot", () => {
            assert.equal(noted.sourceSnapshotHash,updated.sourceSnapshotHash);
            assert.equal(noted.locatorJson,updated.locatorJson);
        });
        const reviewed = env.claims.reviewEvidence({assignmentId:assignment.id,evidenceId:created.id,expectedVersion:noted.rowVersion});
        check("reviewed evidence remains immutable", () => assert.throws(()=>env.claims.updateEvidence({assignmentId:assignment.id,evidenceId:created.id,expectedVersion:reviewed.rowVersion,locator:{chunkId:chunk.id}}),error=>error.code==="REVIEWED_EVIDENCE_IMMUTABLE"));
        const note = env.store.createDocumentNote({documentId:document.id,chunkId:chunk.id,title:"Synthetic provenance note"});
        const artifact=env.artifacts.registerArtifact({assignmentId:assignment.id,canonicalObjectType:"NOTE",canonicalObjectId:note.id,origin:"USER_CREATED",producer:"USER"}).artifact;
        const artifactEvidence=env.claims.createEvidence({assignmentId:assignment.id,sourceObjectType:"ARTIFACT",sourceObjectId:artifact.id});
        check("artifact snapshot initially current",()=>assert.equal(env.claims.evidence({assignmentId:assignment.id,evidenceId:artifactEvidence.id}).freshness.state,"CURRENT"));
        // Controlled persistence mutation models a later canonical artifact version.
        env.store.db.prepare("UPDATE stud_assignment_artifacts SET row_version=row_version+1 WHERE id=?").run(artifact.id);
        check("artifact version drift is not falsely current",()=>assert.equal(env.claims.evidence({assignmentId:assignment.id,evidenceId:artifactEvidence.id}).freshness.state,"SOURCE_CHANGED"));
        const contextPackage = env.store.createAcademicContextPackage("ASSIGNMENT",assignment.id,{});
        check("context package retains exact extracted source and explicit note", () => {
            assert(contextPackage.snapshot.chunks.some(item=>item.documentId===document.id));
            assert.equal(note.assignmentId,assignment.id);
        });
        env.store.close(); env = open(root);
        check("restart retains reviewed page identity and integrity", () => {
            const restored=env.claims.evidence({assignmentId:assignment.id,evidenceId:created.id});
            assert.equal(restored.evidenceHash,reviewed.evidenceHash);
            assert.equal(restored.freshness.state,"CURRENT");
            assert.equal(restored.extractionId,extraction.extractionId);
            assert.deepEqual(env.store.db.prepare("PRAGMA foreign_key_check").all(),[]);
        });
        check("no operational or model activity fabricated", () => assert.equal(env.store.db.prepare("SELECT count(*) n FROM stud_operation_runs").get().n,0));
        console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
    } finally { env.store.close(); fs.rmSync(root,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
