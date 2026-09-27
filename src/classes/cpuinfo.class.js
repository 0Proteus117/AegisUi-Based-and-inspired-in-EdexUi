class Cpuinfo {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create initial DOM
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_cpuinfo">
        </div>`;
        this.container = document.getElementById("mod_cpuinfo");

        // Init Smoothie
        let TimeSeries = window.TimeSeries;
        let SmoothieChart = window.SmoothieChart;

        this.series = [];
        this.charts = [];
        window.si.cpu().then(data => {
            let divide = Math.floor(data.cores/2);
            this.divide = divide;

            let cpuName = data.manufacturer+data.brand;
            cpuName = cpuName.substr(0, 30);
            cpuName.substr(0, Math.min(cpuName.length, cpuName.lastIndexOf(" ")));

            let innercontainer = document.createElement("div");
            innercontainer.setAttribute("id", "mod_cpuinfo_innercontainer");
            innercontainer.innerHTML = `<h1>CPU USAGE<i>${cpuName}</i></h1>
                <div>
                    <h1># <em>1</em> - <em>${divide}</em><br>
                    <i id="mod_cpuinfo_usagecounter0">Avg. --%</i></h1>
                    <canvas id="mod_cpuinfo_canvas_0" height="60"></canvas>
                </div>
                <div>
                    <h1># <em>${divide+1}</em> - <em>${data.cores}</em><br>
                    <i id="mod_cpuinfo_usagecounter1">Avg. --%</i></h1>
                    <canvas id="mod_cpuinfo_canvas_1" height="60"></canvas>
                </div>
                <div>
                    <div>
                        <h1>${(window.AegisRendererRuntime.platform === "win32") ? "CORES" : "TEMP"}<br>
                        <i id="mod_cpuinfo_temp">${(window.AegisRendererRuntime.platform === "win32") ? data.cores : "--°C"}</i></h1>
                    </div>
                    <div>
                        <h1>SPD<br>
                        <i id="mod_cpuinfo_speed_min">--GHz</i></h1>
                    </div>
                    <div>
                        <h1>MAX<br>
                        <i id="mod_cpuinfo_speed_max">--GHz</i></h1>
                    </div>
                    <div>
                        <h1>TASKS<br>
                        <i id="mod_cpuinfo_tasks">---</i></h1>
                    </div>
                </div>`;
            this.container.append(innercontainer);

            for (var i = 0; i < 2; i++) {
                const chart = new SmoothieChart({
                    limitFPS: 30,
                    responsive: true,
                    scaleSmoothing: 1,
                    millisPerPixel: 50,
                    grid:{
                        fillStyle:'transparent',
                        strokeStyle:'transparent',
                        verticalSections:0,
                        borderVisible:false
                    },
                    labels:{
                        disabled: true
                    },
                    yRangeFunction: () => {
                        return {min:0,max:100};
                    }
                });
                // Smoothie's responsive resize tracks rounded layout dimensions,
                // not DPR changes. Own the two canvas backing stores explicitly
                // so a monitor/zoom change cannot leave half-scaled stale pixels.
                chart.resize = () => this.resizeChart(chart);
                this.charts.push(chart);
            }

            for (var i = 0; i < data.cores; i++) {
                // Create TimeSeries
                this.series.push(new TimeSeries());

                let serie = this.series[i];
                let options = {
                    lineWidth: 1.2,
                    strokeStyle: this.chartColour()
                };

                if (i < divide) {
                    this.charts[0].addTimeSeries(serie, options);
                } else {
                    this.charts[1].addTimeSeries(serie, options);
                }
            }

            for (var i = 0; i < 2; i++) {
                this.charts[i].streamTo(document.getElementById(`mod_cpuinfo_canvas_${i}`), 500);
            }

            // Init updater
            this.updatingCPUload = false;
            this.updateCPUload();
            if (window.AegisRendererRuntime.platform !== "win32") {this.updateCPUtemp();}
            this.updatingCPUspeed = false;
            this.updateCPUspeed();
            this.updatingCPUtasks = false;
            this.updateCPUtasks();
            this.loadUpdater = setInterval(() => {
                this.updateCPUload();
            }, 500);
            if (window.AegisRendererRuntime.platform !== "win32") {
                this.tempUpdater = setInterval(() => {
                    this.updateCPUtemp();
                }, 2000);
            }
            this.speedUpdater = setInterval(() => {
                this.updateCPUspeed();
            }, 1000);
            this.tasksUpdater = setInterval(() => {
                this.updateCPUtasks();
            }, 5000);
        });
    }
    chartColour() {
        return getComputedStyle(document.documentElement).getPropertyValue("--aegis-cpu-line").trim() || "#7ccbff";
    }
    resizeChart(chart) {
        const canvas = chart.canvas;
        if (!canvas) return;
        const style = getComputedStyle(canvas), number = value => parseFloat(value) || 0;
        const borderBox = style.boxSizing === "border-box";
        const width = Math.max(1, number(style.width) - (borderBox ? number(style.borderLeftWidth) + number(style.borderRightWidth) + number(style.paddingLeft) + number(style.paddingRight) : 0));
        const height = Math.max(1, number(style.height) - (borderBox ? number(style.borderTopWidth) + number(style.borderBottomWidth) + number(style.paddingTop) + number(style.paddingBottom) : 0));
        const ratio = window.devicePixelRatio || 1;
        const pixelsWide = Math.ceil(width * ratio), pixelsHigh = Math.ceil(height * ratio);
        if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
        if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
        canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
        chart.clientWidth = width;
        chart.clientHeight = height;
    }
    refreshAppearance() {
        const colour = this.chartColour();
        this.charts.forEach(chart => chart.seriesSet.forEach(series => { series.options.strokeStyle = colour; }));
    }
    async updateCPUload() {
        if (this.updatingCPUload) return;
        this.updatingCPUload = true;
        try {
            const data = await window.si.currentLoad();
            let average = [[], []];

            if (!Array.isArray(data?.cpus)) return;

            data.cpus.forEach((e, i) => {
                if (!this.series[i] || !Number.isFinite(e?.load) || e.load < 0 || e.load > 100) return;
                this.series[i].append(new Date().getTime(), e.load);

                if (i < this.divide) {
                    average[0].push(e.load);
                } else {
                    average[1].push(e.load);
                }
            });
            average.forEach((stats, i) => {
                average[i] = stats.length ? `${Math.round(stats.reduce((a, b) => a + b, 0)/stats.length)}%` : "—";

                try {
                    document.getElementById(`mod_cpuinfo_usagecounter${i}`).innerText = `Avg. ${average[i]}`;
                } catch(e) {
                    // Fail silently, DOM element is probably getting refreshed (new theme, etc)
                }
            });
        } catch (_) {
            // A missing sample is not zero load; permit the next real sample.
        } finally { this.updatingCPUload = false; }
    }
    updateCPUtemp() {
        window.si.cpuTemperature().then(data => {
            try {
                let temperature = Number(data.max);
                document.getElementById("mod_cpuinfo_temp").innerText =
                    Number.isFinite(temperature) && temperature > 0 ? `${temperature}°C` : "N/A";
            } catch(e) {
                // See above notice
            }
        });
    }
    updateCPUspeed() {
        if (this.updatingCPUspeed) return;
        this.updatingCPUspeed = true
        window.si.cpu().then(data => {
            try {
                document.getElementById("mod_cpuinfo_speed_min").innerText = `${data.speed}GHz`;
                document.getElementById("mod_cpuinfo_speed_max").innerText = `${data.speedMax}GHz`;
            } catch(e) {
                // See above notice
            }
            this.updatingCPUspeed = false;
        });
    }
    updateCPUtasks() {
        if (this.updatingCPUtasks) return;
        this.updatingCPUtasks = true;
        window.si.processes().then(data => {
            try {
                document.getElementById("mod_cpuinfo_tasks").innerText = `${data.all}`;
            } catch(e) {
                // See above notice
            }
            this.updatingCPUtasks = false;
        });
    }
}

module.exports = {
    Cpuinfo
};
