#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Terminal = require(path.join(ROOT, "src/classes/terminal.class.js"));
const Lms = require(path.join(ROOT, "src/classes/workspaces/studLmsModel.class.js"));
const Cases = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));
const matchIcon = require(path.join(ROOT, "src/assets/misc/file-icons-match.js"));

let passed = 0;
function check(name, callback) {
    callback();
    passed += 1;
    console.log(`${name}: PASS`);
}

function socketInfo(token, options = {}) {
    const query = options.query === undefined ? `?token=${encodeURIComponent(token)}` : options.query;
    return {req: {url: `${options.path || "/"}${query}`, socket: {remoteAddress: options.address || "127.0.0.1"}}};
}

check("TERMINAL_RENDERER_LOCAL_MAIN_FRAME_ONLY", () => {
    const expectedUi = require("url").pathToFileURL(path.join(ROOT, "src", "ui.html")).toString();
    assert.strictEqual(Terminal.isTrustedTerminalSender({senderFrame: {url: expectedUi, parent: null}}), true);
    assert.strictEqual(Terminal.isTrustedTerminalSender({senderFrame: {url: `${expectedUi}?unexpected=1`, parent: null}}), false);
    assert.strictEqual(Terminal.isTrustedTerminalSender({senderFrame: {url: "https://attacker.example/ui.html", parent: null}}), false);
    assert.strictEqual(Terminal.isTrustedTerminalSender({senderFrame: {url: "file:///tmp/ui.html", parent: {}}}), false);
});

check("TERMINAL_WEBSOCKET_CAPABILITY_AUTH", () => {
    const token = "a".repeat(43);
    assert.strictEqual(Terminal.authorizeTerminalWebSocket(socketInfo(token), token, 0), true);
    assert.strictEqual(Terminal.authorizeTerminalWebSocket(socketInfo("b".repeat(43)), token, 0), false);
    assert.strictEqual(Terminal.authorizeTerminalWebSocket(socketInfo(token, {address: "192.0.2.10"}), token, 0), false);
    assert.strictEqual(Terminal.authorizeTerminalWebSocket(socketInfo(token), token, 1), false);
    assert.strictEqual(Terminal.authorizeTerminalWebSocket(socketInfo(token, {query: `?token=${token}&token=${token}`}), token, 0), false);
});

check("TERMINAL_ADVERSARIAL_INPUT_PRESERVED_AFTER_AUTH", () => {
    const cases = [
        "printf '%s' \"quoted\"", "echo safe; uname", "echo $(whoami)", "first\nsecond", "echo `date`",
        "printf x | cat", "echo x > output.txt", "cd '/tmp/path with spaces'", "printf 'λ–安全'", "echo $HOME"
    ];
    cases.forEach(value => assert.strictEqual(Terminal.normalizeTerminalInput(Buffer.from(value, "utf8")), value));
    assert.throws(() => Terminal.normalizeTerminalInput("x".repeat(Terminal.TERMINAL_INPUT_LIMIT + 1)), RangeError);
    assert.throws(() => Terminal.normalizeTerminalInput({command: "id"}), TypeError);
});

check("MOODLE_HTML_NORMALIZATION_SINGLE_PASS", () => {
    assert.strictEqual(Lms.sanitizeDisplayText("<b>Course</b> &amp; material"), "Course & material");
    assert.strictEqual(Lms.sanitizeDisplayText("2 < 3 and 5 > 4"), "2 < 3 and 5 > 4");
    assert.strictEqual(Lms.sanitizeDisplayText("&amp;lt;script&amp;gt;"), "&lt;script&gt;");
    assert.ok(!Lms.sanitizeDisplayText("<scr<script>ipt>alert(1)</script>").includes("<script"));
});

check("MOODLE_URL_ENCODED_DELIMITERS_FAIL_CLOSED", () => {
    const base = "https://moodle.example.edu";
    const valid = `${base}/webservice/pluginfile.php/12/mod_resource/content/1/file.pdf?forcedownload=1`;
    assert.strictEqual(Lms.safeMoodleFileUrl(valid, base), valid);
    ["%2f", "%2F", "%5c", "%3a", "%40", "%252f", "%25252F"].forEach(encoded => {
        assert.strictEqual(Lms.safeMoodleFileUrl(`${base}/webservice${encoded}pluginfile.php/12/file.pdf`, base), null);
        assert.strictEqual(Lms.safeReferenceUrl(`${base}/course${encoded}view.php?id=12`, base), null);
    });
    assert.strictEqual(Lms.safeReferenceUrl(`${base}/course/view.php?id=12#https://evil.example`, base), `${base}/course/view.php?id=12`);
    assert.strictEqual(Lms.safeReferenceUrl(`https://moodle.example.edu@evil.example/course/view.php?id=12`, base), null);
    assert.strictEqual(Lms.safeReferenceUrl(`${base}/course/view.php?url=https%3A%2F%2Fevil.example&id=12`, base), `${base}/course/view.php?id=12`);
});

check("OSINT_MARKUP_REMOVAL_CANNOT_REASSEMBLE_SCRIPT", () => {
    const normalized = Cases.plainText("alpha <scr<em>ipt>alert(1)</em> omega", 240, "Synthetic text");
    assert.ok(!normalized.includes("<script"));
    assert.strictEqual(Cases.plainText("2 < 3 and 5 > 4", 240, "Synthetic text"), "2 < 3 and 5 > 4");
    assert.throws(() => Cases.plainText("<scr<script>ipt>alert(1)</script>", 240, "Synthetic text"), error => error.code === "CASE_INVALID");
    assert.throws(() => Cases.plainText("javascript:alert(1)", 240, "Synthetic text"), error => error.code === "CASE_INVALID");
});

check("FILE_ICON_RULES_ARE_SERIALIZED_DATA", () => {
    assert.strictEqual(matchIcon("example.js"), "js");
    assert.strictEqual(matchIcon("archive.tar.gz"), "zip");
    const generated = fs.readFileSync(path.join(ROOT, "src/assets/misc/file-icons-match.js"), "utf8");
    const generator = fs.readFileSync(path.join(ROOT, "file-icons-generator.js"), "utf8");
    assert.ok(generated.includes("const RULE_DATA = Object.freeze("));
    assert.ok(!generator.includes("return \"${config.icon}\""));
    assert.ok(!generator.includes("match.replace(/\\./g"));
});

console.log(`CODEQL_SECURITY_HARDENING: PASS (${passed} checks)`);
