#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "src");
const PREBUILD = path.join(ROOT, "prebuild-src");
const MANIFEST_NAME = ".aegis-prebuild-manifest.json";
const MANIFEST = path.join(PREBUILD, MANIFEST_NAME);

function filesUnder(root, relative = "", output = []) {
    const directory = path.join(root, relative);
    if (!fs.existsSync(directory)) return output;
    fs.readdirSync(directory, {withFileTypes: true})
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach(entry => {
            if (entry.name === "node_modules" || entry.name === MANIFEST_NAME || entry.name === ".DS_Store") return;
            const child = path.join(relative, entry.name);
            if (entry.isDirectory()) filesUnder(root, child, output);
            else if (entry.isFile() || entry.isSymbolicLink()) output.push(child);
        });
    return output;
}

function treeDigest(root) {
    const digest = crypto.createHash("sha256");
    filesUnder(root).forEach(relative => {
        const absolute = path.join(root, relative);
        const stat = fs.lstatSync(absolute);
        digest.update(relative.replaceAll(path.sep, "/"));
        digest.update("\0");
        digest.update(entryPayload(absolute, stat));
        digest.update("\0");
    });
    return digest.digest("hex");
}

function entryPayload(file, stat) {
    if (stat.isSymbolicLink()) return Buffer.from(`LINK:${fs.readlinkSync(file)}`, "utf8");
    return fs.readFileSync(file);
}

function currentHead(root = ROOT) {
    return execFileSync("git", ["rev-parse", "HEAD"], {cwd: root, encoding: "utf8"}).trim();
}

function writeManifest(options = {}) {
    const root = options.root || ROOT;
    const source = options.source || path.join(root, "src");
    const prebuild = options.prebuild || path.join(root, "prebuild-src");
    const manifest = path.join(prebuild, MANIFEST_NAME);
    if (!fs.existsSync(source) || !fs.existsSync(prebuild)) throw new Error("PREBUILD_INTEGRITY: source or prebuild directory is missing.");
    const record = Object.freeze({
        schema: 1,
        sourceHead: options.head || currentHead(root),
        sourceDigest: treeDigest(source),
        prebuildDigest: treeDigest(prebuild)
    });
    fs.writeFileSync(manifest, `${JSON.stringify(record, null, 2)}\n`, {encoding: "utf8", mode: 0o644});
    return record;
}

function verifyPrebuild(options = {}) {
    const root = options.root || ROOT;
    const source = options.source || path.join(root, "src");
    const prebuild = options.prebuild || path.join(root, "prebuild-src");
    const manifest = path.join(prebuild, MANIFEST_NAME);
    if (!fs.existsSync(manifest)) throw new Error("PREBUILD_INTEGRITY: manifest missing; regenerate prebuild-src before packaging.");
    const record = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const head = options.head || currentHead(root);
    const sourceDigest = treeDigest(source);
    const prebuildDigest = treeDigest(prebuild);
    if (record.schema !== 1) throw new Error("PREBUILD_INTEGRITY: unsupported manifest schema.");
    if (record.sourceHead !== head) throw new Error(`PREBUILD_INTEGRITY: prebuild-src was generated from ${record.sourceHead}, current HEAD is ${head}.`);
    if (record.sourceDigest !== sourceDigest) throw new Error("PREBUILD_INTEGRITY: src changed after prebuild-src was generated.");
    if (record.prebuildDigest !== prebuildDigest) throw new Error("PREBUILD_INTEGRITY: prebuild-src content changed after generation.");
    console.log(`PREBUILD_INTEGRITY: OK ${head} ${sourceDigest}`);
    return Object.freeze({head, sourceDigest, prebuildDigest});
}

async function beforePack() {
    verifyPrebuild();
}

module.exports = beforePack;
module.exports.treeDigest = treeDigest;
module.exports.writeManifest = writeManifest;
module.exports.verifyPrebuild = verifyPrebuild;

if (require.main === module) {
    const command = process.argv[2];
    if (command === "stamp") {
        const record = writeManifest();
        console.log(`PREBUILD_INTEGRITY: STAMPED ${record.sourceHead} ${record.sourceDigest}`);
    } else if (command === "verify") verifyPrebuild();
    else throw new Error("Usage: node build/prebuild-integrity.js <stamp|verify>");
}
