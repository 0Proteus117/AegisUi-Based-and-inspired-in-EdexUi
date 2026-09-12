"use strict";

const Academic = require("./studAcademicModel.class.js");
const {managedReference} = require("./studStoragePaths.class.js");
const LOCAL_PROFILE_ID = "stud_storage_local";
const LIMITS = Object.freeze({profiles:16, manifestItems:500, page:100, fileBytes:64*1024*1024, totalBytes:8*1024*1024*1024});
const fail = (code, message) => { throw new Academic.StudError(code, message); };
function version(value) {
    if (!Number.isSafeInteger(value) || value < 1) fail("INVALID_STORAGE_VERSION", "A current storage version is required.");
    return value;
}
function digest(value) {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("INVALID_STORAGE_HASH", "A verified SHA-256 digest is required.");
    return value;
}

// Migration 27 only. No canonical content, credentials, or model files live in
// these tables. Relative references retain their original canonical identity.
const SCHEMA_SQL = `
CREATE INDEX stud_storage_document_reference_index ON stud_academic_documents(managed_reference);
CREATE INDEX stud_storage_paper_reference_index ON stud_research_papers(local_document_reference);
CREATE INDEX stud_storage_resource_reference_index ON stud_resources(local_reference);
CREATE INDEX stud_storage_dataset_reference_index ON stud_datasets(managed_reference);
CREATE TABLE stud_storage_profiles (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('LOCAL','EXTERNAL')),
    label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
    volume_uuid TEXT, mount_hint TEXT, relative_root TEXT, identity_nonce TEXT,
    row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    CHECK((kind='LOCAL' AND id='stud_storage_local' AND volume_uuid IS NULL AND mount_hint IS NULL AND relative_root IS NULL AND identity_nonce IS NULL)
        OR (kind='EXTERNAL' AND id<>'stud_storage_local' AND volume_uuid IS NOT NULL AND mount_hint IS NOT NULL AND relative_root IS NOT NULL AND identity_nonce IS NOT NULL)),
    UNIQUE(volume_uuid,relative_root)
);
INSERT INTO stud_storage_profiles (id,kind,label,created_at,updated_at)
VALUES ('stud_storage_local','LOCAL','On this Mac',datetime('now'),datetime('now'));
CREATE TABLE stud_storage_assets (
    reference TEXT PRIMARY KEY CHECK(length(reference) BETWEEN 1 AND 260),
    active_profile_id TEXT NOT NULL REFERENCES stud_storage_profiles(id),
    sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
    row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version>0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX stud_storage_assets_profile_index ON stud_storage_assets(active_profile_id,reference);
CREATE TABLE stud_storage_manifests (
    id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES stud_assignments(id),
    target_profile_id TEXT NOT NULL REFERENCES stud_storage_profiles(id),
    target_profile_version INTEGER NOT NULL CHECK(target_profile_version>0),
    purpose TEXT NOT NULL CHECK(purpose IN ('RELOCATE','PORTABLE','RETURN')),
    state TEXT NOT NULL CHECK(state IN ('PREPARED','COPYING','VERIFIED','APPLIED','FAILED','CANCELLED','INTERRUPTED','ROLLING_BACK','ROLLED_BACK')),
    scope_hash TEXT NOT NULL CHECK(length(scope_hash)=64),
    include_course_material INTEGER NOT NULL CHECK(include_course_material IN (0,1)),
    omitted_file_count INTEGER NOT NULL CHECK(omitted_file_count>=0),
    issue_count INTEGER NOT NULL CHECK(issue_count>=0),
    inventory_truncated INTEGER NOT NULL CHECK(inventory_truncated IN (0,1)),
    shared_reference_count INTEGER NOT NULL CHECK(shared_reference_count>=0),
    approved_at TEXT,
    run_id TEXT REFERENCES stud_operation_runs(id),
    rollback_run_id TEXT REFERENCES stud_operation_runs(id),
    error_code TEXT, row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version>0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX stud_storage_manifests_assignment_index ON stud_storage_manifests(assignment_id,created_at DESC,id DESC);
CREATE TABLE stud_storage_manifest_items (
    manifest_id TEXT NOT NULL REFERENCES stud_storage_manifests(id),
    reference TEXT NOT NULL REFERENCES stud_storage_assets(reference),
    source_profile_id TEXT NOT NULL REFERENCES stud_storage_profiles(id),
    source_asset_version INTEGER NOT NULL CHECK(source_asset_version>0),
    source_profile_version INTEGER NOT NULL CHECK(source_profile_version>0),
    applied_asset_version INTEGER CHECK(applied_asset_version>0),
    sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
    state TEXT NOT NULL CHECK(state IN ('PENDING','VERIFIED','APPLIED')),
    PRIMARY KEY(manifest_id,reference)
);
CREATE TABLE stud_storage_copies (
    reference TEXT NOT NULL REFERENCES stud_storage_assets(reference),
    profile_id TEXT NOT NULL REFERENCES stud_storage_profiles(id),
    sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
    manifest_id TEXT REFERENCES stud_storage_manifests(id), verified_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('RETAINED','REMOVED')),
    PRIMARY KEY(reference,profile_id)
);
CREATE TABLE stud_storage_manifest_sources (
    manifest_id TEXT NOT NULL, reference TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, source_updated_at TEXT,
    PRIMARY KEY(manifest_id,reference,object_type,object_id),
    FOREIGN KEY(manifest_id,reference) REFERENCES stud_storage_manifest_items(manifest_id,reference)
);
CREATE TABLE stud_storage_manifest_review_issues (
    manifest_id TEXT NOT NULL REFERENCES stud_storage_manifests(id),
    ordinal INTEGER NOT NULL CHECK(ordinal>=0 AND ordinal<100),
    code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 64),
    object_type TEXT, object_id TEXT,
    PRIMARY KEY(manifest_id,ordinal)
);
CREATE TABLE stud_storage_cleanup_records (
    id TEXT PRIMARY KEY, reference TEXT NOT NULL REFERENCES stud_storage_assets(reference),
    profile_id TEXT NOT NULL REFERENCES stud_storage_profiles(id),
    sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
    reason TEXT NOT NULL CHECK(reason='VERIFIED_SUPERSEDED_COPY'),
    created_at TEXT NOT NULL
);
`;

module.exports = Object.freeze({LOCAL_PROFILE_ID,LIMITS,SCHEMA_SQL,version,digest,managedReference,fail});
