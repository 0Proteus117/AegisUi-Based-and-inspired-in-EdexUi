const cluster = require("cluster");

if (cluster.isMaster) {
    const electron = require("electron");
    const path = require("path");
    const {createTrustedIpcMain} = require("./classes/ipcSecurity.class.js");
    const ipc = createTrustedIpcMain(electron.ipcMain, path.join(__dirname, "ui.html"));
    const signale = require("signale");
    const {registerOsintCaseIpc} = require("./classes/workspaces/osintCaseIpc.class.js");
    const {registerStudAcademicIpc} = require("./classes/workspaces/studAcademicIpc.class.js");
    // Also, leave a core available for the renderer process
    const osCPUs = require("os").cpus().length - 1;
    // See #904
    const numCPUs = (osCPUs > 7) ? 7 : osCPUs;

    const si = require("systeminformation");

    // OSINT investigation persistence deliberately exposes only narrow,
    // validated case/evidence operations. It never grants a generic file API
    // to the renderer and is independent from the legacy OSINT source IPC.
    registerOsintCaseIpc({ipc, app: electron.app, dialog: electron.dialog});
    // STUD persistence is a bounded main-process service. The renderer only
    // receives validated academic-domain responses; it never opens SQLite.
    registerStudAcademicIpc({ipc, app: electron.app});

    const ALLOWED_SYSTEM_INFORMATION = new Set([
        "battery", "blockDevices", "chassis", "cpu", "cpuTemperature", "currentLoad", "fsSize", "mem", "networkConnections",
        "networkInterfaces", "networkStats", "osInfo", "processes", "system", "time"
    ]);
    ipc.handle("aegis-systeminformation-call", async (_event, payload = {}) => {
        const type = String(payload.type || "");
        const args = Array.isArray(payload.args) ? payload.args.slice(0, 1) : [];
        if (!ALLOWED_SYSTEM_INFORMATION.has(type) || typeof si[type] !== "function") {
            const error = new Error("System information operation is not allowed.");
            error.code = "SYSTEM_INFORMATION_NOT_ALLOWED";
            throw error;
        }
        return si[type](...args);
    });

    cluster.setupMaster({
        exec: require("path").join(__dirname, "_multithread.js")
    });

    let workers = [];
    cluster.on("fork", worker => {
        workers.push(worker.id);
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    signale.success("Multithreaded controller ready");

    var lastID = 0;

    function dispatch(type, id, arg) {
        let selectedID = lastID+1;
        if (selectedID > numCPUs-1) selectedID = 0;

        cluster.workers[workers[selectedID]].send(JSON.stringify({
            id,
            type,
            arg
        }));

        lastID = selectedID;
    }

    var queue = {};
    ipc.on("systeminformation-call", (e, type, id, ...args) => {
        if (!si[type]) {
            signale.warn("Illegal request for systeminformation");
            return;
        }

        if (args.length > 1 || workers.length <= 0) {
            si[type](...args).then(res => {
                if (e.sender) {
                    e.sender.send("systeminformation-reply-"+id, res);
                }
            });
        } else {
            queue[id] = e.sender;
            dispatch(type, id, args[0]);
        }
    });

    cluster.on("message", (worker, msg) => {
        msg = JSON.parse(msg);
        try {
            if (!queue[msg.id].isDestroyed()) {
                queue[msg.id].send("systeminformation-reply-"+msg.id, msg.res);
                delete queue[msg.id];
            }
        } catch(e) {
            // Window has been closed, ignore.
        }
    });
} else if (cluster.isWorker) {
    const signale = require("signale");
    const si = require("systeminformation");

    signale.info("Multithread worker started at "+process.pid);

    process.on("message", msg => {
        msg = JSON.parse(msg);
        si[msg.type](msg.arg).then(res => {
            process.send(JSON.stringify({
                id: msg.id,
                res
            }));
        });
    });
}
