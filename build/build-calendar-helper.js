const {execFileSync} = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

if (process.platform !== "darwin") process.exit(0);

const root = path.join(__dirname, "..");
const source = path.join(root, "src", "native", "calendar-helper.swift");
const infoPlist = path.join(root, "src", "native", "calendar-helper-Info.plist");
const bundle = path.join(root, "src", "native", "EdexUiEngCalendar.app");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "edex-calendar-helper-"));
const temporarySource = path.join(temporary, "calendar-helper.swift");
const temporaryInfo = path.join(temporary, "Info.plist");
const temporaryBundle = path.join(temporary, "EdexUiEngCalendar.app");
const contents = path.join(temporaryBundle, "Contents");
const output = path.join(contents, "MacOS", "calendar-helper");

try {
    fs.copyFileSync(source, temporarySource);
    fs.copyFileSync(infoPlist, temporaryInfo);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.copyFileSync(temporaryInfo, path.join(contents, "Info.plist"));
    execFileSync("/usr/bin/xcrun", [
        "swiftc",
        "-parse-as-library",
        "-O",
        temporarySource,
        "-o", output,
        "-framework", "EventKit",
        "-Xlinker", "-sectcreate",
        "-Xlinker", "__TEXT",
        "-Xlinker", "__info_plist",
        "-Xlinker", temporaryInfo
    ], {stdio: "inherit"});
    fs.chmodSync(output, 0o755);
    execFileSync("/usr/bin/codesign", [
        "--force",
        "--deep",
        "--sign", "-",
        "--identifier", "com.edex.ui.eng.calendar-helper",
        "--requirements", '=designated => identifier "com.edex.ui.eng.calendar-helper"',
        temporaryBundle
    ], {stdio: "inherit"});
    fs.rmSync(bundle, {recursive: true, force: true});
    fs.cpSync(temporaryBundle, bundle, {recursive: true});
    console.log(`Calendar helper built at ${bundle}`);
} finally {
    fs.rmSync(temporary, {recursive: true, force: true});
}
