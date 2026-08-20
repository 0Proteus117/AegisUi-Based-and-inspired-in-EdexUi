#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {writeManifest, verifyPrebuild} = require("../build/prebuild-integrity.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-prebuild-integrity-"));
const source = path.join(root, "src");
const prebuild = path.join(root, "prebuild-src");
fs.mkdirSync(source); fs.mkdirSync(prebuild);
fs.writeFileSync(path.join(source, "runtime.js"), "CURRENT_SOURCE\n");
fs.writeFileSync(path.join(prebuild, "runtime.js"), "CURRENT_PREBUILD\n");

try {
    writeManifest({root, source, prebuild, head: "synthetic-head"});
    verifyPrebuild({root, source, prebuild, head: "synthetic-head"});
    console.log("PREBUILD_INTEGRITY_VALID: PASS");

    fs.writeFileSync(path.join(source, "runtime.js"), "CHANGED_SOURCE\n");
    assert.throws(() => verifyPrebuild({root, source, prebuild, head: "synthetic-head"}), /src changed/);
    console.log("PREBUILD_INTEGRITY_SOURCE_DRIFT_BLOCKED: PASS");

    fs.writeFileSync(path.join(source, "runtime.js"), "CURRENT_SOURCE\n");
    writeManifest({root, source, prebuild, head: "synthetic-head"});
    fs.writeFileSync(path.join(prebuild, "runtime.js"), "STALE_PREBUILD\n");
    assert.throws(() => verifyPrebuild({root, source, prebuild, head: "synthetic-head"}), /prebuild-src content changed/);
    console.log("PREBUILD_INTEGRITY_PREBUILD_DRIFT_BLOCKED: PASS");

    assert.throws(() => verifyPrebuild({root, source, prebuild, head: "different-head"}), /current HEAD/);
    console.log("PREBUILD_INTEGRITY_HEAD_DRIFT_BLOCKED: PASS");
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
