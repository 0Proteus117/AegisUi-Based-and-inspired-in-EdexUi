#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const afterPack = fs.readFileSync(path.join(root, "build", "after-pack.js"), "utf8");

const unpackRules = packageJson.build && packageJson.build.asarUnpack;
const keepsNodePtyUnpacked = Array.isArray(unpackRules) && unpackRules.some((rule) => String(rule).includes("node-pty"));
const signsSpawnHelper = afterPack.includes("spawn-helper") && afterPack.includes("codesign");

console.log(`NODE_PTY_ASAR_UNPACK: ${keepsNodePtyUnpacked ? "OK" : "FAIL"}`);
console.log(`SPAWN_HELPER_SIGNING: ${signsSpawnHelper ? "OK" : "FAIL"}`);
console.log(`PACKAGED_NODE_PTY_INTEGRITY: ${keepsNodePtyUnpacked && signsSpawnHelper ? "OK" : "FAIL"}`);

process.exitCode = keepsNodePtyUnpacked && signsSpawnHelper ? 0 : 1;
