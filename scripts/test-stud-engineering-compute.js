"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const {StudComputeRuntime} = require(path.join(ROOT, "src/classes/workspaces/studComputeRuntime.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const Ipc = require(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));

let passed = 0;
function check(name, work) { work(); passed += 1; console.log(`${name}: PASS`); }
function reject(code, work) { try { work(); } catch (error) { assert.strictEqual(error.code, code); passed += 1; console.log(`REJECTS_${code}: PASS`); return; } throw new Error(`Expected ${code}`); }
function ipcMock() { const handlers = new Map(); return {handlers, handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)}; }

(async () => {
    const runtime = new StudComputeRuntime();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-compute-"));
    try {
        const caps = runtime.capabilities();
        check("CORE_AVAILABLE_OFFLINE", () => assert.deepStrictEqual(caps.core.status, "AVAILABLE"));
        check("OPTIONAL_ENGINES_HONEST", () => assert.strictEqual(caps.coolprop.status, "NOT_INSTALLED") && assert.strictEqual(caps.pythonControl.status, "NOT_INSTALLED") && assert.strictEqual(caps.sympy.status, "NOT_INSTALLED") && assert.strictEqual(caps.pint.status, "NOT_INSTALLED"));
        check("SYMBOLIC_QUADRATIC", () => assert.deepStrictEqual(runtime.run({tool: "EQUATIONS", operation: "SOLVE", input: {expression: "x^2-5*x+6=0", variable: "x"}}).result.solutions, [3, 2]));
        check("DIFFERENTIATION_INTEGRATION_SUBSTITUTION", () => {
            assert.strictEqual(runtime.run({tool: "EQUATIONS", operation: "DIFFERENTIATE", input: {expression: "3*x^2+2*x+1", variable: "x"}}).result.expression, "6·x + 2");
            assert.strictEqual(runtime.run({tool: "EQUATIONS", operation: "INTEGRATE", input: {expression: "2*x", variable: "x"}}).result.expression, "x^2 + C");
            assert.strictEqual(runtime.run({tool: "EQUATIONS", operation: "SUBSTITUTE", input: {expression: "2*x+1", variable: "x", value: 4}}).result.result, 9);
        });
        check("LINEAR_SYSTEM", () => assert.deepStrictEqual(runtime.run({tool: "EQUATIONS", operation: "SYSTEM", input: {equations: ["2*x+y=5", "x-y=1"], variables: ["x", "y"]}}).result, {x: 2, y: 1}));
        check("MATRIX_BOUNDED", () => assert.strictEqual(runtime.run({tool: "EQUATIONS", operation: "MATRIX", input: {matrix: [[1,2],[3,4]]}}).result.determinant, -2));
        check("UNIT_CONVERSION", () => assert.strictEqual(runtime.run({tool: "UNITS", operation: "CONVERT", input: {value: 72, fromUnit: "km/h", toUnit: "m/s"}}).result.value, 20));
        reject("DIMENSION_MISMATCH", () => runtime.run({tool: "UNITS", operation: "CONVERT", input: {value: 1, fromUnit: "m", toUnit: "s"}}));
        check("NUMERICAL_STATS_INTERPOLATION_INTEGRATION", () => {
            assert.strictEqual(runtime.run({tool: "NUMERICAL", operation: "STATISTICS", input: {values: [1,2,3]}}).result.mean, 2);
            assert.strictEqual(runtime.run({tool: "NUMERICAL", operation: "INTERPOLATE", input: {x: [0,10], y: [0,100], at: 5}}).result.interpolated, 50);
            assert.strictEqual(runtime.run({tool: "NUMERICAL", operation: "INTEGRATE", input: {expression: "x", variable: "x", lower: 0, upper: 2}}).result.integral, 2);
        });
        check("DATA_AND_PLOT_METADATA", () => {
            const data = runtime.run({tool: "DATA", operation: "SUMMARY", input: {columns: {force: [1,2,3], distance: [2,4,6]}}});
            const plot = runtime.run({tool: "PLOTS", operation: "LINE", input: {title: "Synthetic force", xLabel: "m", yLabel: "N", x: [1,2], y: [4,8]}});
            assert.strictEqual(data.result.columns.force.count, 3); assert.strictEqual(plot.plot.title, "Synthetic force");
        });
        reject("CAPABILITY_UNAVAILABLE", () => runtime.run({tool: "THERMODYNAMICS", operation: "DENSITY", input: {}}));
        reject("UNSUPPORTED_EXPRESSION", () => runtime.run({tool: "EQUATIONS", operation: "SIMPLIFY", input: {expression: "sin(x)", variable: "x"}}));
        reject("BOUNDS_EXCEEDED", () => runtime.run({tool: "DATA", operation: "SUMMARY", input: {columns: {x: Array.from({length: 10001}, (_value, index) => index)}}}));

        const store = new StudAcademicStore({root, applicationVersion: "test"});
        const course = store.createEntity("COURSE", {title: "Synthetic Mechanics", code: "MECH-101"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Force exercise"});
        const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: "Synthetic note", content: "Before compute."});
        const run = runtime.run({tool: "UNITS", operation: "CONVERT", input: {value: 2500, fromUnit: "mm", toUnit: "m"}});
        const saved = store.saveComputeResult(run, {title: "Length conversion", courseId: course.id, assignmentId: assignment.id, noteId: note.id});
        check("EXPLICIT_COMPUTE_PERSISTENCE", () => assert.strictEqual(store.getEntity("COMPUTE_RESULT", saved.id).tool, "UNITS"));
        check("SAVED_RESULT_PROVENANCE", () => assert.strictEqual(store.listProvenance("COMPUTE_RESULT", saved.id)[0].sourceType, "AEGIS_ENGINEERING_COMPUTE"));
        check("NOTE_INSERTION_IS_EXPLICIT", () => assert.ok(store.getEntity("NOTE", note.id).content.includes("Engineering Compute")));
        check("COURSE_ASSIGNMENT_RELATIONSHIP", () => assert.strictEqual(store.listComputeResults({assignmentId: assignment.id}).length, 1) && assert.ok(store.listRelationships("ASSIGNMENT", assignment.id).some(item => item.toId === saved.id)));
        check("RESTART_PERSISTENCE", () => { store.close(); const reopened = new StudAcademicStore({root, applicationVersion: "test"}); assert.strictEqual(reopened.getEntity("COMPUTE_RESULT", saved.id).title, "Length conversion"); reopened.close(); });

        const ipc = ipcMock();
        const registration = Ipc.registerStudAcademicIpc({ipc, app: {getPath: () => path.join(root, "ipc"), getVersion: () => "test"}, computeRuntime: runtime});
        const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
        const runResponse = await ipc.handlers.get("stud-compute-run")(trusted, {tool: "UNITS", operation: "CONVERT", input: {value: 1, fromUnit: "bar", toUnit: "kPa"}});
        check("TYPED_IPC_ONLY", () => assert.strictEqual(runResponse.data.result.value, 100));
        const forged = await ipc.handlers.get("stud-compute-save-result")(trusted, {request: {tool: "UNITS", operation: "CONVERT", input: {value: 1, fromUnit: "m", toUnit: "mm"}}, context: {title: "Recomputed"}});
        check("SAVE_RECOMPUTES_MAIN_SIDE", () => {
            assert.strictEqual(forged.data.tool, "UNITS");
            assert.ok(forged.data.outputJson.includes("1000"));
        });
        registration.dispose();
        const runtimeSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studComputeRuntime.class.js"), "utf8");
        const ipcSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
        check("NO_SHELL_NETWORK_OR_EXTERNAL_INTERPRETER", () => {
            assert.ok(!/child_process|spawn\(|exec\(|fetch\(|https?:\/\//.test(runtimeSource));
            assert.ok(!ipcSource.includes("stud-compute-shell"));
        });
        check("MODEL_SCHEMA_CURRENT", () => {
            assert.strictEqual(Model.SCHEMA_VERSION, 23);
            assert.ok(Model.ENTITY_TYPES.includes("COMPUTE_RESULT"));
            assert.ok(Model.ENTITY_TYPES.includes("ACADEMIC_DOCUMENT"));
        });
        console.log(`STUD_ENGINEERING_COMPUTE: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
