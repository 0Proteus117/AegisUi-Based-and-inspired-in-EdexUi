"use strict";
const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studFinalPackageModel.class.js");
const {camel} = require("./studCompositionRepository.class.js");
class StudFinalPackageRepository {
    constructor(store) { this.store=store; this.db=store.db; }
    assignment(id) {
        const value=this.store.getEntity("ASSIGNMENT",Academic.safeId(id,"Assignment ID"));
        if(!value)Domain.fail("NOT_FOUND","Assignment does not exist.");
        return value;
    }
    get(assignmentId,id) {
        this.assignment(assignmentId);
        const row=camel(this.db.prepare("SELECT * FROM stud_final_packages WHERE id=? AND assignment_id=?").get(Academic.safeId(id,"Package ID"),assignmentId));
        if(!row)Domain.fail("NOT_FOUND","Package does not belong to this Assignment.");
        const snapshot=JSON.parse(row.snapshotJson);delete row.snapshotJson;
        return {...row,snapshot,files:this.db.prepare("SELECT name,sha256,byte_size byteSize FROM stud_final_package_files WHERE package_id=? ORDER BY name").all(row.id),approval:camel(this.db.prepare("SELECT * FROM stud_final_package_approvals WHERE package_id=?").get(row.id))};
    }
    list(assignmentId,beforeRevision=null) {
        this.assignment(assignmentId);
        if(beforeRevision!==null&&(!Number.isSafeInteger(beforeRevision)||beforeRevision<1))Domain.fail("INVALID_INPUT","Invalid package history cursor.");
        return this.db.prepare(`SELECT p.id,p.title,p.revision,p.draft_version_id,p.created_at,a.approved_at
            FROM stud_final_packages p LEFT JOIN stud_final_package_approvals a ON a.package_id=p.id
            WHERE p.assignment_id=? AND (? IS NULL OR p.revision<?) ORDER BY p.revision DESC LIMIT 25`).all(assignmentId,beforeRevision,beforeRevision).map(camel);
    }
    insert(p,files,sources) {
        const revision=Number(this.db.prepare("SELECT MAX(revision) n FROM stud_final_packages WHERE assignment_id=?").get(p.assignmentId).n||0)+1;
        this.db.prepare(`INSERT INTO stud_final_packages(id,assignment_id,draft_version_id,composition_plan_id,contract_id,revision,title,citation_style,manifest_hash,basis_hash,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(p.id,p.assignmentId,p.draftVersionId,p.planId,p.contractId,revision,p.title,p.style,p.manifestHash,p.basisHash,Domain.json(p.snapshot),p.createdAt);
        files.forEach(f=>this.db.prepare("INSERT INTO stud_final_package_files VALUES(?,?,?,?)").run(p.id,f.name,f.sha256,f.byteSize));
        sources.forEach((s,i)=>this.db.prepare("INSERT INTO stud_final_package_sources VALUES(?,?,?,?,?)").run(p.id,i,s.artifactId||null,s.paperId||null,s.hash));
    }
    approve(p,acknowledged) {
        this.db.prepare("INSERT INTO stud_final_package_approvals VALUES(?,?,?,'USER',?,?)").run(p.id,p.manifestHash,p.basisHash,acknowledged?1:0,Academic.now());
    }
}
module.exports={StudFinalPackageRepository};
