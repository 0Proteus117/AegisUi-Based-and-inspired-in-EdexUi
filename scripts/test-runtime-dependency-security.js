#!/usr/bin/env node
"use strict";

// Exercise the installed runtime dependency tree, not the build-tool copies.
// Each adversarial case runs in a bounded child so a regressed library cannot
// hang the regression runner. Fixtures are synthetic and at most 4 MiB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {createRequire} = require("node:module");
const {spawnSync} = require("node:child_process");
const {pathToFileURL} = require("node:url");
const {Readable} = require("node:stream");
const {pipeline} = require("node:stream/promises");
const {gzipSync} = require("node:zlib");
const ROOT = path.resolve(__dirname, "..");
const runtime = createRequire(path.join(ROOT, "src/package.json"));

async function tarEngine() {
    const geo = createRequire(runtime.resolve("geolite2-redist"));
    const manifest = geo.resolve("tar/package.json");
    assert.equal(JSON.parse(fs.readFileSync(manifest)).version, "7.5.22");
    // GeoLite uses ESM; resolve that shipped build instead of another tar copy.
    return import(pathToFileURL(path.join(path.dirname(manifest), "dist/esm/index.min.js")).href);
}

async function tarFixture(mode) {
    const tar = await tarEngine();
    assert.equal(new tar.Parser().maxDecompressionRatio, 1000);
    const body = mode === "bomb" ? Buffer.alloc(4 * 1024 * 1024) : Buffer.from("Synthetic GeoIP database fixture");
    const header = new tar.Header({path: "synthetic/GeoLite2-City.mmdb", type: "File", mode: 0o600, size: body.length});
    header.encode();
    const compressed = gzipSync(Buffer.concat([header.block, body, Buffer.alloc((512 - body.length % 512) % 512 + 1024)]));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-tar-security-"));
    try {
        // Match GeoLite's actual basename filter and strip behavior.
        const extract = tar.x({cwd: root, strip: 1, filter: name => path.basename(name) === "GeoLite2-City.mmdb"});
        const work = pipeline(Readable.from([compressed]), extract);
        if (mode === "bomb") await assert.rejects(work, /decompression|ratio/i);
        else {
            await work;
            assert.deepEqual(fs.readFileSync(path.join(root, "GeoLite2-City.mmdb")), body);
        }
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

const cases = {
    async TAR_VALID_GEOLITE_SHAPE() { await tarFixture("valid"); },
    async TAR_GZIP_BOMB_DEFAULT_BOUND() { await tarFixture("bomb"); },
    NANOID_NEGATIVE_AND_ZERO_TERMINATE() {
        const insecure = runtime("nanoid/non-secure");
        assert.equal(insecure.nanoid(-1), "");
        assert.equal(insecure.customAlphabet("abc", 0)(), "");
        const secure = runtime("nanoid");
        assert.equal(secure.customAlphabet("abc", 0)(), "");
        assert.equal(secure.nanoid(21).length, 21);
    },
    TIPTAP_PROTO_ATTRIBUTE_NOT_INHERITED() {
        const {mergeAttributes} = runtime("@tiptap/core");
        const merged = mergeAttributes({class: "synthetic"}, JSON.parse('{"__proto__":{"onclick":"not-executed"}}'));
        assert.equal(merged.onclick, undefined);
        assert.equal(merged.class, "synthetic");
        assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    },
    BRACE_EXPANSION_BOUNDED() {
        const {expand} = runtime("brace-expansion");
        assert.deepEqual(expand("a{b,c}"), ["ab", "ac"]);
        assert.ok(expand("{1..100000000}", {max: 12}).length <= 12);
        assert.ok(expand("{}".repeat(4000)).length <= 1);
        assert.ok(expand("{a,b}".repeat(20), {max: 12, maxLength: 1024}).length <= 12);
    },
    LOCKED_RUNTIME_SECURITY_VERSIONS() {
        const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "src/package-lock.json")));
        for (const [name, version] of Object.entries({"tar": "7.5.22", "brace-expansion": "5.0.12", "nanoid": "3.3.19", "pdfjs-dist": "6.2.108", "@tiptap/core": "3.30.6"})) {
            assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
        }
        const build = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json")));
        assert.equal(build.packages["node_modules/electron"].version, "42.5.1");
    }
};

(async () => {
    if (process.argv[2] === "--case") {
        const selected = cases[process.argv[3]];
        assert.equal(typeof selected, "function");
        await selected();
        return;
    }
    let passed = 0;
    for (const name of Object.keys(cases)) {
        const result = spawnSync(process.execPath, ["--max-old-space-size=128", __filename, "--case", name], {cwd: ROOT, encoding: "utf8", timeout: 12000, maxBuffer: 256 * 1024});
        assert.equal(result.status, 0, `${name}: ${result.error?.message || result.stderr || result.signal}`);
        console.log(`${name}: PASS`); passed++;
    }
    console.log(`RUNTIME_DEPENDENCY_SECURITY: PASS (${passed} checks)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
