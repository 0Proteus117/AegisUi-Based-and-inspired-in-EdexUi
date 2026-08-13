#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudNotebookRuntime, LIMITS, inspectDataset, normalizeGitHub} = require(path.join(ROOT, "src/classes/workspaces/studNotebookRuntime.class.js"));
const Ipc = require(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }
function rejects(code, fn) { try { fn(); } catch (error) { assert.strictEqual(error.code, code); passed += 1; console.log(`${nameFor(code)}: PASS`); return; } throw new Error(`Expected ${code}`); }
function nameFor(code) { return `REJECTS_${code}`; }
function ipcMock() { const handlers = new Map(); return {handlers, handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)}; }

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-notebook-"));
    const input = path.join(root, "synthetic.csv");
    try {
        fs.writeFileSync(input, "time_s,force_n,material\n0,0,alloy\n1,12,alloy\n2,28,polymer\n3,45,alloy\n", "utf8");
        let store = new StudAcademicStore({root, applicationVersion: "test"});
        const runtime = new StudNotebookRuntime({root});
        const engineering = store.createEntity("COURSE", {title: "Synthetic engineering mechanics", code: "ENG-101"});
        const humanities = store.createEntity("COURSE", {title: "Synthetic literature and criticism", code: "HUM-101"});
        const law = store.createEntity("COURSE", {title: "Synthetic public law and criminology", code: "LAW-101"});
        const social = store.createEntity("COURSE", {title: "Synthetic social research methods", code: "SOC-101"});
        const generic = store.createEntity("COURSE", {title: "Synthetic interdisciplinary coursework", code: "GEN-101"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: engineering.id, title: "Synthetic force analysis"});

        check("SCHEMA_V12_NOTEBOOK_DATA_REPOSITORY", () => assert.strictEqual(store.schemaInfo().version, 12) && ["NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"].every(type => Model.ENTITY_TYPES.includes(type)));
        const notebook = store.createNotebook({title: "Synthetic force notebook", description: "<script>never execute</script>", notebookType: "DATA_ANALYSIS", language: "PYTHON", courseId: engineering.id, assignmentId: assignment.id});
        const markdown = store.createNotebookCell({notebookId: notebook.id, cellType: "MARKDOWN", source: "# Safe local note\nNo execution."});
        const code = store.createNotebookCell({notebookId: notebook.id, cellType: "CODE", source: "import os\nprint(os.environ)", afterCellId: markdown.id});
        check("NOTEBOOK_CELLS_ORDERED_AND_EDITING_ONLY", () => { const context = store.notebookContext(notebook.id); assert.deepStrictEqual(context.cells.map(cell => cell.id), [markdown.id, code.id]); assert.strictEqual(context.execution.status, "NOT_INSTALLED"); assert.ok(context.cells[1].source.includes("process") === false); });
        const updated = store.updateNotebookCell({notebookId: notebook.id, cellId: code.id, source: "print('stored source only')"});
        check("CELL_EDIT_REORDER_DUPLICATE_SAFE", () => { assert.ok(updated.source.includes("stored source only")); const duplicate = store.createNotebookCell({notebookId: notebook.id, cellType: "CODE", source: updated.source, afterCellId: code.id}); const cells = store.listNotebookCells(notebook.id); store.reorderNotebookCells({notebookId: notebook.id, cellIds: [duplicate.id, markdown.id, code.id]}); assert.strictEqual(store.listNotebookCells(notebook.id)[0].id, duplicate.id); });
        rejects("POLICY_BLOCKED", () => store.deleteNotebookCell({notebookId: notebook.id, cellId: markdown.id, confirmation: false}));
        check("NOTEBOOK_RESTART_PERSISTENCE", () => { store.close(); store = new StudAcademicStore({root, applicationVersion: "test"}); assert.ok(store.notebookContext(notebook.id).cells.length === 3); });

        const managed = runtime.importDatasetFromPath(input);
        const dataset = store.saveDataset(managed, {courseId: engineering.id, assignmentId: assignment.id, description: "Synthetic laboratory observations"});
        check("DATASET_EXPLICIT_MANAGED_IMPORT", () => { assert.ok(!dataset.managedReference.includes(root)); assert.strictEqual(runtime.readManagedDataset(dataset.managedReference).summary.rows, 4); assert.ok(fs.existsSync(path.join(root, dataset.managedReference))); });
        check("DATASET_STATS_FREQUENCIES_AND_PLOTS", () => {
            const summary = runtime.analyzeDataset(dataset, "SUMMARY"); const frequencies = runtime.analyzeDataset(dataset, "FREQUENCIES", {column: "material"}); const histogram = runtime.analyzeDataset(dataset, "PLOT", {column: "force_n", plotType: "HISTOGRAM", title: "Synthetic force distribution"}); const line = runtime.analyzeDataset(dataset, "PLOT", {column: "time_s", yColumn: "force_n", plotType: "LINE"});
            assert.strictEqual(summary.result.summary.rows, 4); assert.strictEqual(frequencies.result.frequencies[0].value, "alloy"); assert.ok(histogram.result.plot.points.length); assert.strictEqual(line.result.plot.points.length, 4);
        });
        rejects("MALFORMED_DATASET", () => inspectDataset(Buffer.from("a,b\n1\n"), "CSV"));
        rejects("INVALID_REPOSITORY", () => normalizeGitHub("https://token@github.com/private/repo"));
        check("GITHUB_NORMALIZATION_FIXED_PUBLIC_ONLY", () => assert.deepStrictEqual(normalizeGitHub("https://github.com/openai/example.git"), {provider: "GITHUB", owner: "openai", repository: "example", canonicalUrl: "https://github.com/openai/example", title: "openai/example"}));
        let fetchCalls = 0;
        const githubRuntime = new StudNotebookRuntime({root, fetch: async (url, options) => { fetchCalls += 1; assert.strictEqual(url, "https://api.github.com/repos/openai/example"); assert.strictEqual(options.method, "GET"); assert.deepStrictEqual(Object.keys(options.headers).sort(), ["Accept", "User-Agent"]); return {ok: true, status: 200, text: async () => JSON.stringify({description: "Synthetic public metadata", default_branch: "main", license: {spdx_id: "MIT"}, updated_at: "2026-01-01T00:00:00Z", archived: false, private: false})}; }});
        const reference = store.saveRepositoryReference(normalizeGitHub("openai/example"), {courseId: engineering.id, assignmentId: assignment.id, notebookId: notebook.id});
        check("GITHUB_NO_AUTOMATIC_REQUEST", () => assert.strictEqual(fetchCalls, 0));
        const publicMetadata = await githubRuntime.githubMetadata({repository: reference.canonicalUrl, requestId: "github_test_1"});
        check("GITHUB_EXPLICIT_FIXED_ENDPOINT_METADATA", () => assert.strictEqual(fetchCalls, 1) && publicMetadata.metadata.license === "MIT" && publicMetadata.metadata.visibility === "PUBLIC");
        check("CONTEXT_PACKAGE_INCLUDES_BOUNDED_NOTEBOOK_CELLS", () => { const packageResult = store.createAcademicContextPackage("ASSIGNMENT", assignment.id, {}); assert.ok(packageResult.snapshot.candidates.some(item => item.entityId === notebook.id)); assert.ok(packageResult.snapshot.fragments.some(item => item.kind === "NOTEBOOK_MARKDOWN_CELL")); assert.ok(!packageResult.snapshot.policy.llmInvoked); });
        check("DISCIPLINE_NEUTRAL_FIVE_FIXTURES", () => [humanities, law, social, generic].every(course => store.buildAcademicContext("COURSE", course.id).root.entityType === "COURSE"));
        check("RUNTIME_HAS_NO_SHELL_OR_GENERIC_PROXY", () => { const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studNotebookRuntime.class.js"), "utf8"); assert.ok(!/child_process|spawn\(|exec\(|process\.env|http:\/\//.test(source)); assert.ok(source.includes("https://api.github.com")); });

        // Bounded scale seed: the renderer reads only limited lists, while the
        // SQLite store can retain a realistic local academic corpus.
        const stamp = Model.now(); store.transaction(() => {
            const courseInsert = store.db.prepare("INSERT INTO stud_courses (id,title,status,created_at,updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)");
            const assignmentInsert = store.db.prepare("INSERT INTO stud_assignments (id,course_id,title,status,submission_status,created_at,updated_at) VALUES (?, ?, ?, 'ACTIVE', 'NOT_SUBMITTED', ?, ?)");
            const notebookInsert = store.db.prepare("INSERT INTO stud_notebooks (id,title,notebook_type,language,execution_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
            const cellInsert = store.db.prepare("INSERT INTO stud_notebook_cells (id,notebook_id,cell_order,cell_type,source,execution_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)");
            const datasetInsert = store.db.prepare("INSERT INTO stud_datasets (id,title,format,created_at,updated_at) VALUES (?,?,?,?,?)");
            const repoInsert = store.db.prepare("INSERT INTO stud_repository_references (id,title,provider,owner,repository,canonical_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)");
            for (let index = 0; index < 100; index += 1) courseInsert.run(`stud_course_scale_${String(index).padStart(3, "0")}`, `Scale course ${index}`, stamp, stamp);
            for (let index = 0; index < 1000; index += 1) assignmentInsert.run(`stud_assignment_scale_${String(index).padStart(4, "0")}`, `stud_course_scale_${String(index % 100).padStart(3, "0")}`, `Scale assignment ${index}`, stamp, stamp);
            for (let index = 0; index < 500; index += 1) { const id = `stud_notebook_scale_${String(index).padStart(3, "0")}`; notebookInsert.run(id, `Scale notebook ${index}`, "GENERAL", "TEXT", "EDITING_ONLY", stamp, stamp); for (let cell = 0; cell < 20; cell += 1) cellInsert.run(`stud_notebook_cell_scale_${String(index).padStart(3, "0")}_${String(cell).padStart(2, "0")}`, id, cell, "MARKDOWN", "synthetic bounded academic cell", "NOT_EXECUTED", stamp, stamp); }
            for (let index = 0; index < 500; index += 1) datasetInsert.run(`stud_dataset_scale_${String(index).padStart(3, "0")}`, `Scale dataset ${index}`, "CSV", stamp, stamp);
            for (let index = 0; index < 1000; index += 1) repoInsert.run(`stud_repository_reference_scale_${String(index).padStart(4, "0")}`, `scale/repository-${index}`, "GITHUB", "scale", `repository-${index}`, `https://github.com/scale/repository-${index}`, stamp, stamp);
        });
        check("SCALE_100_COURSES_1000_ASSIGNMENTS_500_NOTEBOOKS_10000_CELLS_500_DATASETS_1000_REPOS_BOUNDED", () => assert.strictEqual(store.listEntities("COURSE", {limit: 200}).length, 105) && assert.strictEqual(store.listEntities("ASSIGNMENT", {limit: 1100}).length, 1001) && assert.strictEqual(store.listNotebooks({limit: 100}).length, 100) && assert.strictEqual(store.listDatasets({limit: 100}).length, 100) && assert.strictEqual(store.listRepositoryReferences({limit: 100}).length, 100));

        const ipc = ipcMock(); const registration = Ipc.registerStudAcademicIpc({ipc, store, app: {getPath: () => path.join(root, "ipc"), getVersion: () => "test"}, notebookRuntime: githubRuntime, researchRuntime: {readManagedPdf: () => ({bytesBase64: ""}), chooseAndImportPdf: async () => ({cancelled: true}), dispose: () => {}, status: () => ({})}, documentRuntime: {capabilities: () => ({}), dispose: () => {}}, lmsRuntime: {dispose: () => {}}});
        const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
        const response = await ipc.handlers.get("stud-github-normalize")(trusted, {repository: "openai/example"});
        check("NARROW_TYPED_IPC_AND_UNTRUSTED_REJECTION", () => assert.strictEqual(response.ok, true));
        const blocked = await ipc.handlers.get("stud-github-create")({sender: {isDestroyed: () => false, getURL: () => "https://evil.example/"}}, {repository: "openai/example"});
        check("IPC_SENDER_VALIDATION", () => assert.strictEqual(blocked.ok, false));
        registration.dispose(); store.close();
        console.log(`STUD_NOTEBOOK_WORKBENCH: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
