"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Lms = require("../src/classes/workspaces/studLmsModel.class.js");
const Model = require("../src/classes/workspaces/studAcademicModel.class.js");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudCredentialVault} = require("../src/classes/workspaces/studCredentialVault.class.js");
const {StudLmsRuntime, parseIcs} = require("../src/classes/workspaces/studLmsRuntime.class.js");
const {MoodleAdapter, READ_FUNCTIONS} = require("../src/classes/workspaces/studMoodleAdapter.class.js");

const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`${name}: PASS`); }
function response(payload, status = 200) { return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {status, headers: {"content-type": typeof payload === "string" ? "text/calendar" : "application/json"}}); }
function fakeSafeStorage() { return {isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`vault:${value}`, "utf8"), decryptString: value => { const text = Buffer.from(value).toString("utf8"); if (!text.startsWith("vault:")) throw new Error("bad vault"); return text.slice(6); }}; }

function fullFetch(url, options = {}) {
    if (String(url).includes("calendar/export")) return Promise.resolve(response("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ics-1\r\nSUMMARY:Synthetic ICS deadline\r\nDTSTART:20261118T140000Z\r\nDTEND:20261118T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR"));
    const functionName = options.body && options.body.get("wsfunction");
    const payloads = {
        [READ_FUNCTIONS.SITE_INFO]: {sitename: "Synthetic Moodle", userid: 73, username: "synthetic-user", functions: [{name: "core_enrol_get_users_courses"}]},
        [READ_FUNCTIONS.COURSES]: [{id: 101, fullname: "Synthetic Thermodynamics", shortname: "SYN-THERM", idnumber: "SYN-101", summary: "Safe <script>alert(1)</script> course summary", startdate: 1794960000, enddate: 1797552000, visible: 1}],
        [READ_FUNCTIONS.ASSIGNMENTS]: {courses: [{id: 101, assignments: [{id: 501, courseid: 101, name: "Synthetic heat transfer report", intro: "<img src=x onerror=alert(1)> bounded description", allowsubmissionsfromdate: 1794960000, duedate: 1796000000, cutoffdate: 1796100000, grade: 100}]}]},
        [READ_FUNCTIONS.CALENDAR]: {events: [{id: 900, name: "Synthetic Moodle calendar event", description: "Calendar observation", timestart: 1796000000, timeduration: 3600, url: "https://moodle.synthetic.test/calendar/view.php?id=900&token=secret"}]},
        [READ_FUNCTIONS.COURSE_CONTENT]: [{name: "Week 1", modules: [{id: 701, name: "Synthetic lecture notes", modname: "resource", url: "https://moodle.synthetic.test/mod/resource/view.php?id=701&wstoken=secret"}]}],
        [READ_FUNCTIONS.GRADES]: {usergrades: [{gradeitems: [{itemmodule: "assign", iteminstance: 501, graderaw: 82, grademax: 100, feedback: "Synthetic read-only Moodle feedback"}]}]},
        [READ_FUNCTIONS.COMPLETION]: {completionstatus: []}
    };
    return Promise.resolve(response(payloads[functionName] || {exception: "invalid_parameter_exception", errorcode: "invalidparameter", message: "Function unavailable"}));
}

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-moodle-"));
    const store = new StudAcademicStore({root, applicationVersion: "test"});
    const vault = new StudCredentialVault({root, safeStorage: fakeSafeStorage()});
    const runtime = new StudLmsRuntime({store, root, vault, fetch: fullFetch, safeStorage: fakeSafeStorage()});
    try {
        check("MOODLE_SCHEMA_CURRENT", store.schemaInfo().version === Model.SCHEMA_VERSION);
        check("MOODLE_CAPABILITY_MODEL", Lms.MOODLE_CAPABILITIES.includes("COURSES") && Lms.MOODLE_CAPABILITIES.includes("ASSIGNMENT_WRITE"));
        check("MOODLE_WRITE_POLICY_ENUM", Lms.emptyCapabilities().ASSIGNMENT_WRITE === "POLICY_DISABLED");
        assert.throws(() => Lms.normalizeBaseUrl("http://moodle.example.test"), error => error.code === "INVALID_INPUT");
        assert.throws(() => Lms.normalizeBaseUrl("https://user:pass@moodle.example.test"), error => error.code === "INVALID_INPUT");
        check("MOODLE_BASE_URL_STRICT", true);

        const initial = runtime.status();
        check("MOODLE_CONFIG_REQUIRED_INITIAL", initial.status === "CONFIG_REQUIRED" && initial.tokenConfigured === false);
        const configured = runtime.configure({baseUrl: "https://moodle.synthetic.test", displayName: "Synthetic Moodle", token: "synthetic-token", icsUrl: "https://moodle.synthetic.test/calendar/export"});
        check("MOODLE_SECURE_TOKEN_STATUS", configured.tokenConfigured && configured.icsConfigured && !Object.prototype.hasOwnProperty.call(configured, "token"));
        const vaultText = fs.readFileSync(path.join(root, "secure-provider-credentials.json"), "utf8");
        check("MOODLE_TOKEN_ENCRYPTED_AT_REST", !vaultText.includes("synthetic-token") && vaultText.includes("dmF1bHQ6"));

        const probe = await runtime.probe({requestId: "probe_full"});
        check("MOODLE_PROBE_SITE_INFO", probe.probe.capabilities.SITE_INFO === "SUPPORTED");
        check("MOODLE_PROBE_READ_CAPABILITIES", probe.probe.capabilities.COURSES === "SUPPORTED" && probe.probe.capabilities.ASSIGNMENTS === "SUPPORTED" && probe.probe.capabilities.CALENDAR === "SUPPORTED");
        check("MOODLE_PROBE_WRITES_DISABLED", probe.probe.capabilities.ASSIGNMENT_WRITE === "POLICY_DISABLED" && probe.probe.writePolicy.includes("READ_ONLY"));

        const sync = await runtime.sync({requestId: "sync_full"});
        check("MOODLE_SYNC_CANONICAL", sync.summary.courses === 1 && sync.summary.assignments === 1 && sync.summary.resources === 1);
        const courseIdentifier = store.findByExternalIdentifier("MOODLE_COURSE:STUD_MOODLE_DEFAULT", "101")[0];
        const assignmentIdentifier = store.findByExternalIdentifier("MOODLE_ASSIGNMENT:STUD_MOODLE_DEFAULT", "501")[0];
        check("MOODLE_EXTERNAL_IDENTIFIERS", Boolean(courseIdentifier) && Boolean(assignmentIdentifier));
        const course = store.getEntity("COURSE", courseIdentifier.entityId);
        const assignment = store.getEntity("ASSIGNMENT", assignmentIdentifier.entityId);
        check("MOODLE_HTML_SANITIZED", !course.description.includes("<script") && !assignment.description.includes("onerror"));
        check("MOODLE_RESOURCE_TOKEN_STRIPPED", store.listEntities("RESOURCE", {limit: 10})[0].url === "https://moodle.synthetic.test/mod/resource/view.php?id=701");
        check("MOODLE_FIELD_PROVENANCE", store.listProvenance("ASSIGNMENT", assignment.id, "dueDate").some(item => item.sourceType === "MOODLE"));
        check("MOODLE_GRADE_FEEDBACK_NORMALIZED", assignment.grade === 82 && assignment.gradeMaximum === 100 && assignment.feedback === "Synthetic read-only Moodle feedback");
        check("MOODLE_NO_SECRET_IN_SQLITE", !fs.readFileSync(path.join(root, "academic.sqlite")).includes(Buffer.from("synthetic-token")));

        store.updateEntity("ASSIGNMENT", assignment.id, {dueDate: "2026-11-17T23:59:00.000Z"});
        store.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", observedValue: "2026-11-17T23:59:00.000Z", sourceType: "USER", sourceAuthority: "AUTHORITATIVE"});
        await runtime.sync({requestId: "sync_conflict"});
        const afterConflict = store.getEntity("ASSIGNMENT", assignment.id);
        const dueObservations = store.listProvenance("ASSIGNMENT", assignment.id, "dueDate");
        check("MOODLE_CONFLICT_PRESERVED", afterConflict.dueDate === "2026-11-17T23:59:00.000Z" && dueObservations.some(item => item.sourceType === "MOODLE") && dueObservations.some(item => item.sourceType === "USER"));

        const ics = await runtime.syncIcs({requestId: "ics_full"});
        check("MOODLE_ICS_FALLBACK", ics.summary.assignments === 1 && store.findByExternalIdentifier("MOODLE_ICS_ASSIGNMENT:STUD_MOODLE_DEFAULT", "ics-1").length === 1);
        check("MOODLE_ICS_NO_CALENDAR_MUTATION", !fs.readdirSync(root).some(name => /calendar/i.test(name)));
        check("MOODLE_OFFLINE_CANONICAL_RETAINED", store.listEntities("COURSE", {limit: 10}).length === 1 && store.listEntities("ASSIGNMENT", {limit: 10}).length >= 2);

        const invalidAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "bad", fetch: () => Promise.resolve(response({exception: "invalidtoken", errorcode: "invalidtoken", message: "Invalid token"}))});
        await assert.rejects(() => invalidAdapter.probe(), error => error.code === "INVALID_TOKEN");
        check("MOODLE_INVALID_TOKEN_TYPED", true);
        const limitedAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "fixture", fetch: (url, options) => {
            const fn = options.body.get("wsfunction");
            if (fn === READ_FUNCTIONS.SITE_INFO) return Promise.resolve(response({sitename: "Limited Moodle", userid: 1}));
            if (fn === READ_FUNCTIONS.COURSES) return Promise.resolve(response([]));
            return Promise.resolve(response({exception: "invalid_parameter_exception", errorcode: "invalidparameter", message: "Function unavailable"}));
        }});
        const limited = await limitedAdapter.probe();
        check("MOODLE_PARTIAL_CAPABILITY_TYPED", limited.capabilities.COURSES === "SUPPORTED" && limited.capabilities.ASSIGNMENTS === "UNSUPPORTED");
        const permissionAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "fixture", fetch: () => Promise.resolve(response({exception: "require_capability_exception", errorcode: "nopermissions", message: "Permission denied"}))});
        await assert.rejects(() => permissionAdapter.probe(), error => error.code === "PERMISSION_DENIED");
        check("MOODLE_PERMISSION_DENIED_TYPED", true);
        const controllers = new Map();
        const cancellableAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "fixture", controllers, requestId: "cancel_fixture", fetch: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}))});
        const cancelled = cancellableAdapter.call(READ_FUNCTIONS.SITE_INFO); setTimeout(() => controllers.get("cancel_fixture").abort(), 0);
        await assert.rejects(() => cancelled, error => error.code === "CANCELLED");
        check("MOODLE_CANCELLATION_TYPED", true);
        const emptyStore = store.listEntities("COURSE", {limit: 10}).length;
        store.syncMoodleObservations(store.getProviderInstance("stud_moodle_default"), {sourceType: "MOODLE", courses: [], assignments: [], resources: []});
        check("MOODLE_DISAPPEARANCE_NON_DESTRUCTIVE", store.listEntities("COURSE", {limit: 10}).length === emptyStore);
        const parsed = parseIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:test\nSUMMARY:Safe event\nDTSTART:20261101T120000Z\nEND:VEVENT\nEND:VCALENDAR");
        check("MOODLE_ICS_PARSE_BOUNDED", parsed.length === 1 && parsed[0].dueDate.endsWith(".000Z"));
        check("MOODLE_NO_GENERIC_PROXY", !MoodleAdapter.toString().includes("renderer-selected") && Object.values(READ_FUNCTIONS).every(item => item.includes("_")));
        check("MOODLE_NO_WRITE_ENDPOINT", !Object.values(READ_FUNCTIONS).some(item => /submit|upload|create|update|delete|message_send|add_discussion/i.test(item)));
        console.log(`STUD_MOODLE_INTEGRATION: ${checks.length} checks passed`);
    } finally { runtime.dispose(); store.close(); fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
