"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Lms = require("../src/classes/workspaces/studLmsModel.class.js");
const Model = require("../src/classes/workspaces/studAcademicModel.class.js");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudCredentialVault} = require("../src/classes/workspaces/studCredentialVault.class.js");
const {StudLmsRuntime, parseIcs, moodleSsoSignature, parseMoodleSsoCallback} = require("../src/classes/workspaces/studLmsRuntime.class.js");
const {MoodleAdapter, READ_FUNCTIONS} = require("../src/classes/workspaces/studMoodleAdapter.class.js");
const {MoodleSessionAdapter} = require("../src/classes/workspaces/studMoodleSessionAdapter.class.js");

const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(`${name}: PASS`); }
function response(payload, status = 200, headers = {}) { return new Response(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload), {status, headers: {"content-type": typeof payload === "string" ? "text/calendar" : "application/json", ...headers}}); }
function fakeSafeStorage() { return {isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`vault:${value}`, "utf8"), decryptString: value => { const text = Buffer.from(value).toString("utf8"); if (!text.startsWith("vault:")) throw new Error("bad vault"); return text.slice(6); }}; }

function fullFetch(url, options = {}) {
    if (String(url).includes("/lib/ajax/service-nologin.php")) return Promise.resolve(response([{index: 0, data: {wwwroot: "https://moodle.uel.ac.uk", httpswwwroot: "https://moodle.uel.ac.uk", enablewebservices: 1, enablemobilewebservice: 1, typeoflogin: 2, launchurl: "https://moodle.uel.ac.uk/admin/tool/mobile/launch.php"}}]));
    if (String(url).includes("calendar/export")) return Promise.resolve(response("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ics-1\r\nSUMMARY:Synthetic ICS deadline\r\nDTSTART:20261118T140000Z\r\nDTEND:20261118T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR"));
    if (String(url).includes("/webservice/pluginfile.php/")) {
        const parsed = new URL(String(url));
        if (parsed.searchParams.get("token") !== "synthetic-token") return Promise.resolve(response("forbidden", 403, {"content-type": "text/plain"}));
        return Promise.resolve(response(Buffer.from("%PDF-1.4\n% synthetic bounded Moodle fixture\n", "utf8"), 200, {"content-type": "application/pdf", "content-length": "42"}));
    }
    const functionName = options.body && options.body.get("wsfunction");
    const payloads = {
        [READ_FUNCTIONS.SITE_INFO]: {sitename: "Synthetic Moodle", userid: 73, username: "synthetic-user", functions: [{name: "core_enrol_get_users_courses"}]},
        [READ_FUNCTIONS.COURSES]: [{id: 101, fullname: "Synthetic Thermodynamics", shortname: "SYN-THERM", idnumber: "SYN-101", summary: "Safe <script>alert(1)</script> course summary", startdate: 1794960000, enddate: 1797552000, visible: 1}],
        [READ_FUNCTIONS.ASSIGNMENTS]: {courses: [{id: 101, assignments: [{id: 501, courseid: 101, name: "Synthetic heat transfer report", intro: "<img src=x onerror=alert(1)> bounded description", allowsubmissionsfromdate: 1794960000, duedate: 1796000000, cutoffdate: 1796100000, grade: 100}]}]},
        [READ_FUNCTIONS.CALENDAR]: {events: [{id: 900, name: "Synthetic Moodle calendar event", description: "Calendar observation", timestart: 1796000000, timeduration: 3600, url: "https://moodle.synthetic.test/calendar/view.php?id=900&token=secret"}]},
        [READ_FUNCTIONS.COURSE_CONTENT]: [{name: "Week 1", modules: [{id: 701, name: "Synthetic lecture notes", modname: "resource", url: "https://moodle.synthetic.test/mod/resource/view.php?id=701&wstoken=secret", contents: [{id: 1701, filename: "synthetic-lecture.pdf", fileurl: "https://moodle.synthetic.test/webservice/pluginfile.php/11/mod_resource/content/1/synthetic-lecture.pdf", mimetype: "application/pdf", filesize: 42}]}]}],
        [READ_FUNCTIONS.ASSIGNMENT_STATUS]: {lastattempt: {submission: {status: "submitted", timemodified: 1795900000}, gradingstatus: "graded"}, feedback: {grade: "Synthetic bounded feedback"}},
        [READ_FUNCTIONS.GRADES]: {usergrades: [{gradeitems: [{itemmodule: "assign", iteminstance: 501, graderaw: 82, grademax: 100, feedback: "Synthetic read-only Moodle feedback"}]}]},
        [READ_FUNCTIONS.COMPLETION]: {completionstatus: []},
        [READ_FUNCTIONS.FORUM_READ]: [{id: 811, course: 101, name: "Synthetic announcements", type: "news", url: "https://moodle.synthetic.test/mod/forum/view.php?id=811&token=secret"}]
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
        let openedAuthUrl = null; const openedAuthUrls = []; let protocol = null; let openUrlHandler = null; let secondInstanceHandler = null; let prevented = false;
        const fakeApp = {on: (name, handler) => { if (name === "open-url") openUrlHandler = handler; if (name === "second-instance") secondInstanceHandler = handler; }, removeListener: () => {}, setAsDefaultProtocolClient: value => { protocol = value; return true; }};
        const sessionRuntime = new StudLmsRuntime({store, root, vault, fetch: fullFetch, safeStorage: fakeSafeStorage(), app: fakeApp, shell: {openExternal: async value => { openedAuthUrl = value; openedAuthUrls.push(value); }}});
        let bootstrapped = 0;
        sessionRuntime.probe = async () => { bootstrapped += 1; return {}; };
        sessionRuntime.sync = async () => { bootstrapped += 1; return {}; };
        const opened = await sessionRuntime.openWeb();
        const launch = new URL(openedAuthUrl);
        check("MOODLE_SYSTEM_BROWSER_SSO", opened.opened && opened.systemBrowser && launch.origin === "https://moodle.uel.ac.uk" && launch.pathname === "/admin/tool/mobile/launch.php");
        check("MOODLE_OFFICIAL_MOBILE_SERVICE", launch.searchParams.get("service") === "moodle_mobile_app" && launch.searchParams.get("urlscheme") === "aegisui" && /^\d+$/.test(launch.searchParams.get("passport")));
        check("MOODLE_PROTOCOL_REGISTERED", protocol === "aegisui" && typeof openUrlHandler === "function" && typeof secondInstanceHandler === "function");
        const resumed = await sessionRuntime.openWeb();
        check("MOODLE_SSO_RESUMES_PENDING_REQUEST", resumed.resumed === true && openedAuthUrls.length === 2 && openedAuthUrls[0] === openedAuthUrls[1]);
        const signature = moodleSsoSignature("https://moodle.uel.ac.uk", launch.searchParams.get("passport"));
        const callbackEnvelope = `${signature}:::callbacktoken:::privatecallbacktoken`;
        const callbackUrl = `aegisui://token=${Buffer.from(callbackEnvelope, "utf8").toString("base64")}`;
        secondInstanceHandler({}, ["/Applications/AegisUi.app/Contents/MacOS/AegisUi", callbackUrl]);
        await new Promise(resolve => setTimeout(resolve, 20));
        check("MOODLE_SSO_SECOND_INSTANCE_CALLBACK_ACCEPTED", vault.status("stud_moodle_default").tokenConfigured && bootstrapped === 2 && !sessionRuntime.status().authenticationPending);
        const callbackVaultText = fs.readFileSync(path.join(root, "secure-provider-credentials.json"), "utf8");
        check("MOODLE_SSO_SECRETS_ENCRYPTED", !callbackVaultText.includes("callbacktoken") && !callbackVaultText.includes("privatecallbacktoken") && !fs.readFileSync(path.join(root, "academic.sqlite")).includes(Buffer.from("callbacktoken")));
        await assert.rejects(() => sessionRuntime.acceptSsoCallback(callbackUrl), error => error.code === "AUTH_REQUIRED");
        check("MOODLE_SSO_REPLAY_BLOCKED", true);
        openUrlHandler({preventDefault: () => { prevented = true; }}, callbackUrl);
        check("MOODLE_SSO_DUPLICATE_OPEN_URL_IGNORED", prevented && !sessionRuntime.status().authenticationPending);
        assert.deepStrictEqual(parseMoodleSsoCallback(callbackUrl), {signature, token: "callbacktoken", privateToken: "privatecallbacktoken"});
        const callbackWithoutPrivateToken = `aegisui://token=${Buffer.from(`${signature}:::callbacktoken`, "utf8").toString("base64")}`;
        assert.deepStrictEqual(parseMoodleSsoCallback(callbackWithoutPrivateToken), {signature, token: "callbacktoken", privateToken: null});
        assert.throws(() => parseMoodleSsoCallback("aegisui://token=bad:::token:::private"), error => error.code === "AUTH_REQUIRED");
        assert.throws(() => parseMoodleSsoCallback(`aegisui://token=${Buffer.from("bad:::token:::private", "utf8").toString("base64")}`), error => error.code === "AUTH_REQUIRED");
        check("MOODLE_SSO_MALFORMED_CALLBACK_BLOCKED", true);
        check("MOODLE_LOGIN_DOES_NOT_COPY_BROWSER_COOKIES", !Object.keys(sessionRuntime.status()).some(key => /cookie|password/i.test(key)));
        sessionRuntime.dispose();
        const configured = runtime.configure({baseUrl: "https://moodle.synthetic.test", displayName: "Synthetic Moodle", token: "synthetic-token", icsUrl: "https://moodle.synthetic.test/calendar/export"});
        check("MOODLE_SECURE_TOKEN_STATUS", configured.tokenConfigured && configured.icsConfigured && !Object.prototype.hasOwnProperty.call(configured, "token"));
        const vaultText = fs.readFileSync(path.join(root, "secure-provider-credentials.json"), "utf8");
        check("MOODLE_TOKEN_ENCRYPTED_AT_REST", !vaultText.includes("synthetic-token") && vaultText.includes("dmF1bHQ6"));
        const auto = await runtime.configureSyncPreference({automaticSync: true, intervalMinutes: 180});
        check("MOODLE_AUTO_SYNC_PREFERENCE_PERSISTENT", auto.automaticSync && auto.intervalMinutes === 180 && Boolean(auto.nextSyncAt));

        const probe = await runtime.probe({requestId: "probe_full"});
        check("MOODLE_PROBE_SITE_INFO", probe.probe.capabilities.SITE_INFO === "SUPPORTED");
        check("MOODLE_PROBE_READ_CAPABILITIES", probe.probe.capabilities.COURSES === "SUPPORTED" && probe.probe.capabilities.ASSIGNMENTS === "SUPPORTED" && probe.probe.capabilities.CALENDAR === "SUPPORTED");
        check("MOODLE_PROBE_WRITES_DISABLED", probe.probe.capabilities.ASSIGNMENT_WRITE === "POLICY_DISABLED" && probe.probe.writePolicy.includes("READ_ONLY"));

        const sync = await runtime.sync({requestId: "sync_full"});
        check("MOODLE_SYNC_CANONICAL", sync.summary.courses === 1 && sync.summary.assignments === 1 && sync.summary.resources === 2);
        const courseIdentifier = store.findByExternalIdentifier("MOODLE_COURSE:STUD_MOODLE_DEFAULT", "101")[0];
        const assignmentIdentifier = store.findByExternalIdentifier("MOODLE_ASSIGNMENT:STUD_MOODLE_DEFAULT", "501")[0];
        check("MOODLE_EXTERNAL_IDENTIFIERS", Boolean(courseIdentifier) && Boolean(assignmentIdentifier));
        const course = store.getEntity("COURSE", courseIdentifier.entityId);
        const assignment = store.getEntity("ASSIGNMENT", assignmentIdentifier.entityId);
        check("MOODLE_HTML_SANITIZED", !course.description.includes("<script") && !assignment.description.includes("onerror"));
        const resource = store.listEntities("RESOURCE", {limit: 10})[0];
        check("MOODLE_RESOURCE_TOKEN_STRIPPED", resource.url === "https://moodle.synthetic.test/mod/resource/view.php?id=701");
        check("MOODLE_FILE_MANAGED", sync.files.downloaded === 1 && resource.localReference === "documents/moodle_dacbc86c17346688.pdf" && /^[a-f0-9]{64}$/.test(resource.checksum));
        check("MOODLE_FILE_CLASSIFIED_AS_DOCUMENT", sync.files.documents === 1 && store.listAcademicDocuments({limit: 10})[0].managedReference === resource.localReference);
        check("MOODLE_FILE_INDEXING_REMAINS_EXPLICIT", store.listAcademicDocuments({limit: 10})[0].extractionStatus === "NOT_ANALYZED");
        check("MOODLE_FIELD_PROVENANCE", store.listProvenance("ASSIGNMENT", assignment.id, "dueDate").some(item => item.sourceType === "MOODLE"));
        check("MOODLE_GRADE_FEEDBACK_NORMALIZED", assignment.grade === 82 && assignment.gradeMaximum === 100 && assignment.feedback === "Synthetic read-only Moodle feedback");
        const requirements = store.assignmentRequirements(assignment.id);
        check("MOODLE_REQUIREMENTS_ARE_LOCAL_EXPLAINABLE", requirements.some(item => item.kind === "DIRECT_REQUIREMENT" && item.label === "DUE DATE") && requirements.every(item => item.sourceType && item.location));
        check("MOODLE_ASSIGNMENT_STATUS_AND_ANNOUNCEMENTS", sync.provider.capabilities.ASSIGNMENT_STATUS === "SUPPORTED" && sync.provider.capabilities.FORUM_READ === "SUPPORTED" && sync.provider.capabilities.ANNOUNCEMENTS === "SUPPORTED");
        check("MOODLE_NO_SECRET_IN_SQLITE", !fs.readFileSync(path.join(root, "academic.sqlite")).includes(Buffer.from("synthetic-token")));
        check("MOODLE_FILE_URL_NEVER_PERSISTED", !fs.readFileSync(path.join(root, "academic.sqlite")).includes(Buffer.from("pluginfile.php")) && !vaultText.includes("pluginfile.php"));

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
        const forgotten = await runtime.forgetAccount();
        check("MOODLE_FORGET_REVOKES_SYNC_NOT_ACADEMIC_DATA", !forgotten.tokenConfigured && !forgotten.sync.automaticSync && store.listEntities("COURSE", {limit: 10}).length === 1 && store.listEntities("ACADEMIC_DOCUMENT", {limit: 10}).length === 1);

        const zeroGradeAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "fixture", fetch: (url, options) => {
            if (options.body.get("wsfunction") === READ_FUNCTIONS.GRADES) return Promise.resolve(response({usergrades: [{gradeitems: [{itemmodule: "assign", iteminstance: 501, graderaw: null, grademax: 0}]}]}));
            return fullFetch(url, options);
        }});
        const zeroGradeSync = await zeroGradeAdapter.sync();
        check("MOODLE_ZERO_MAX_GRADE_NORMALIZED_AS_UNKNOWN", zeroGradeSync.assignments[0].grade === null && zeroGradeSync.assignments[0].gradeMaximum === null);

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
        const blockedFileAdapter = new MoodleAdapter({baseUrl: "https://moodle.synthetic.test", token: "fixture", fetch: fullFetch});
        await assert.rejects(() => blockedFileAdapter.downloadResourceFile({downloadUrl: "https://moodle.synthetic.test/mod/resource/view.php?id=701"}), error => error.code === "POLICY_BLOCKED");
        check("MOODLE_FILE_ENDPOINT_FAIL_CLOSED", true);
        const forcedDownload = Lms.safeMoodleFileUrl("https://moodle.synthetic.test/webservice/pluginfile.php/11/mod_resource/content/1/file.pdf?forcedownload=1", "https://moodle.synthetic.test");
        check("MOODLE_FILE_FORCEDOWNLOAD_ALLOWED", forcedDownload && new URL(forcedDownload).searchParams.get("forcedownload") === "1");
        check("MOODLE_FILE_SECRET_QUERY_BLOCKED", !Lms.safeMoodleFileUrl("https://moodle.synthetic.test/webservice/pluginfile.php/11/mod_resource/content/1/file.pdf?token=secret", "https://moodle.synthetic.test"));
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
        const sessionCalls = [];
        const sessionAdapter = new MoodleSessionAdapter({baseUrl: "https://moodle.synthetic.test", requestId: "session_fixture", session: {fetch: async (url, options = {}) => {
            sessionCalls.push({url: String(url), method: options.method || "GET"});
            if (String(url).endsWith("/my/")) return response('<script>M.cfg = {"sesskey":"syntheticsessionkey123"};</script>', 200, {"content-type": "text/html"});
            const call = JSON.parse(options.body)[0];
            const raw = await fullFetch("https://moodle.synthetic.test/webservice/rest/server.php", {body: new URLSearchParams({wsfunction: call.methodname})});
            const payload = await raw.json();
            return response([{index: 0, data: payload}]);
        }}});
        const sessionProbe = await sessionAdapter.probe();
        check("MOODLE_SESSION_ADAPTER_FIXED_READS", sessionProbe.capabilities.COURSES === "SUPPORTED" && sessionCalls.some(item => /\/lib\/ajax\/service\.php\?sesskey=/.test(item.url)) && sessionCalls.every(item => !/[?&](?:token|wstoken)=/i.test(item.url)));
        check("MOODLE_SESSION_FILE_ALLOWLIST", Lms.safeMoodleSessionFileUrl("https://moodle.synthetic.test/pluginfile.php/11/mod_resource/content/1/file.pdf", "https://moodle.synthetic.test") && !Lms.safeMoodleSessionFileUrl("https://moodle.synthetic.test/mod/resource/view.php?id=1", "https://moodle.synthetic.test"));
        console.log(`STUD_MOODLE_INTEGRATION: ${checks.length} checks passed`);
    } finally { runtime.dispose(); store.close(); fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
