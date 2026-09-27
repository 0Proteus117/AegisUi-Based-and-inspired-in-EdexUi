"use strict";
const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");
const LIMITS = Object.freeze({appendices:20, papers:200, evidence:300, claims:300, reports:200, textBytes:4*1024*1024, fileBytes:64*1024*1024, totalBytes:128*1024*1024});
const fail = (code, message) => { throw new Academic.StudError(code, message); };
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
}
const json = value => JSON.stringify(stable(value), null, 2);
function ids(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) fail("PACKAGE_LIMIT", "The package selection exceeds its supported limit.");
    const result = value.map(id => Academic.safeId(id, "Package source ID"));
    if (new Set(result).size !== result.length) fail("INVALID_INPUT", "Package selections must be unique.");
    return result;
}
const CHANNELS = Object.freeze(["stud-final-package-options", "stud-final-package-create", "stud-final-package-list", "stud-final-package-read", "stud-final-package-approve", "stud-final-package-export"]);
const SCHEMA_SQL = `
CREATE TABLE stud_final_packages (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES stud_assignments(id),
 draft_version_id TEXT NOT NULL REFERENCES stud_draft_versions(id),
 composition_plan_id TEXT NOT NULL REFERENCES stud_composition_plans(id),
 contract_id TEXT NOT NULL REFERENCES stud_requirement_contracts(id),
 revision INTEGER NOT NULL CHECK(revision>0), title TEXT NOT NULL,
 citation_style TEXT NOT NULL, manifest_hash TEXT NOT NULL CHECK(length(manifest_hash)=64),
 basis_hash TEXT NOT NULL CHECK(length(basis_hash)=64),
 snapshot_json TEXT NOT NULL CHECK(length(snapshot_json)<=4194304), created_at TEXT NOT NULL,
 UNIQUE(assignment_id,revision)
);
CREATE INDEX stud_final_packages_assignment ON stud_final_packages(assignment_id,revision DESC);
CREATE TABLE stud_final_package_sources (
 package_id TEXT NOT NULL REFERENCES stud_final_packages(id),
 source_order INTEGER NOT NULL, artifact_id TEXT REFERENCES stud_assignment_artifacts(id),
 paper_id TEXT REFERENCES stud_research_papers(id), source_hash TEXT NOT NULL,
 CHECK((artifact_id IS NOT NULL AND paper_id IS NULL) OR (artifact_id IS NULL AND paper_id IS NOT NULL)),
 PRIMARY KEY(package_id,source_order)
);
CREATE TABLE stud_final_package_files (
 package_id TEXT NOT NULL REFERENCES stud_final_packages(id), name TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
 PRIMARY KEY(package_id,name)
);
CREATE TABLE stud_final_package_approvals (
 package_id TEXT PRIMARY KEY REFERENCES stud_final_packages(id),
 manifest_hash TEXT NOT NULL, basis_hash TEXT NOT NULL,
 actor TEXT NOT NULL CHECK(actor='USER'), acknowledged_issues INTEGER NOT NULL CHECK(acknowledged_issues IN(0,1)),
 approved_at TEXT NOT NULL
);
CREATE TRIGGER stud_final_package_immutable BEFORE UPDATE ON stud_final_packages BEGIN SELECT RAISE(ABORT,'FINAL_PACKAGE_IMMUTABLE'); END;
CREATE TRIGGER stud_final_package_approval_immutable BEFORE UPDATE ON stud_final_package_approvals BEGIN SELECT RAISE(ABORT,'FINAL_APPROVAL_IMMUTABLE'); END;
`;
module.exports = {LIMITS, fail, sha, stable, json, ids, CHANNELS, SCHEMA_SQL};
