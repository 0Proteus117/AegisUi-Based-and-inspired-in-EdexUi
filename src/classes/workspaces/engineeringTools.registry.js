(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.EngineeringToolsRegistry = exported;
})(typeof window !== "undefined" ? window : null, function() {
    const CATEGORIES = Object.freeze([
        {id: "cad", title: "CAD / CAM", icon: "▧", description: "Design, modelling and manufacturing prep."},
        {id: "simulation", title: "CAE / Simulation", icon: "≈", description: "Analysis, solvers and numerical tools."},
        {id: "manufacturing", title: "Manufacturing", icon: "⌬", description: "3D printing, suppliers and fabrication."},
        {id: "calculators", title: "Calculators", icon: "Σ", description: "Local engineering quick tools."},
        {id: "materials", title: "Materials", icon: "⬡", description: "Material cards and property references."},
        {id: "research", title: "Research / Docs", icon: "⌕", description: "Papers, repositories and technical reports."},
        {id: "standards", title: "Standards", icon: "◫", description: "ISO, ASME and engineering references."},
        {id: "projects", title: "Projects", icon: "▤", description: "Engineering project status from HUB timelines."}
    ]);

    const MATERIALS = Object.freeze({
        aluminium: {label: "Aluminium 6061-T6", density: 2700, note: "Good machinability, moderate strength, low density."},
        steel: {label: "Mild Steel", density: 7850, note: "General fabrication reference density."},
        stainless: {label: "Stainless Steel 304", density: 8000, note: "Corrosion resistant, heavier than aluminium."},
        titanium: {label: "Titanium Ti-6Al-4V", density: 4430, note: "High specific strength, expensive machining."},
        carbon_fiber: {label: "Carbon Fiber Laminate", density: 1600, note: "Approximate laminate density; layup dependent."},
        pla: {label: "PLA", density: 1240, note: "Common FDM plastic, stiff but heat-limited."},
        petg: {label: "PETG", density: 1270, note: "Tougher FDM plastic with better temperature tolerance."},
        abs: {label: "ABS", density: 1040, note: "Impact resistant; warping/ventilation considerations."},
        pa_cf: {label: "PA-CF", density: 1150, note: "Carbon-filled nylon reference; exact density is brand-specific."}
    });

    const THREAD_REFERENCES = Object.freeze([
        {thread: "M3 × 0.5", nominal: "M3", pitch: 0.5, tapDrill: 2.5, clearance: 3.4},
        {thread: "M4 × 0.7", nominal: "M4", pitch: 0.7, tapDrill: 3.3, clearance: 4.5},
        {thread: "M5 × 0.8", nominal: "M5", pitch: 0.8, tapDrill: 4.2, clearance: 5.5},
        {thread: "M6 × 1.0", nominal: "M6", pitch: 1.0, tapDrill: 5.0, clearance: 6.6},
        {thread: "M8 × 1.25", nominal: "M8", pitch: 1.25, tapDrill: 6.8, clearance: 9.0},
        {thread: "M10 × 1.5", nominal: "M10", pitch: 1.5, tapDrill: 8.5, clearance: 11.0}
    ]);

    const unitFamilies = Object.freeze({
        length: {
            label: "Length",
            base: "m",
            units: {mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048}
        },
        mass: {
            label: "Mass",
            base: "kg",
            units: {g: 0.001, kg: 1, lb: 0.45359237}
        },
        force: {
            label: "Force",
            base: "N",
            units: {N: 1, kN: 1000, lbf: 4.4482216153}
        },
        pressure: {
            label: "Pressure",
            base: "Pa",
            units: {Pa: 1, kPa: 1000, MPa: 1000000, bar: 100000, psi: 6894.757293}
        },
        torque: {
            label: "Torque",
            base: "Nm",
            units: {Nm: 1, "Nmm": 0.001, "lbft": 1.3558179483, "lbin": 0.112984829}
        },
        power: {
            label: "Power",
            base: "W",
            units: {W: 1, kW: 1000, hp: 745.699872}
        }
    });

    const TOOLS = Object.freeze([
        appTool("fusion", "Autodesk Fusion", "cad", "▧", ["Autodesk Fusion", "Fusion 360"], "CAD / CAM / CAE platform.", "https://www.autodesk.com/products/fusion-360/overview"),
        appTool("freecad", "FreeCAD", "cad", "▦", ["FreeCAD"], "Open-source parametric CAD.", "https://www.freecad.org/"),
        appTool("blender", "Blender", "cad", "◈", ["Blender"], "3D modelling and visualization.", "https://www.blender.org/"),
        appTool("solidworks", "SolidWorks", "cad", "▧", ["SOLIDWORKS", "3DEXPERIENCE Launcher"], "Commercial mechanical CAD.", "https://www.solidworks.com/"),
        webTool("onshape", "Onshape", "cad", "◫", "https://www.onshape.com/", "Cloud CAD workspace."),
        webTool("autodesk-viewer", "Autodesk Viewer", "cad", "◰", "https://viewer.autodesk.com/", "Online CAD viewer."),

        appTool("ansys", "Ansys", "simulation", "≈", ["Ansys", "Ansys Workbench"], "Commercial CAE suite.", "https://www.ansys.com/"),
        appTool("openfoam", "OpenFOAM / ParaView", "simulation", "≋", ["OpenFOAM", "ParaView"], "CFD and post-processing workflow.", "https://openfoam.org/"),
        webTool("simscale", "SimScale", "simulation", "≈", "https://www.simscale.com/", "Browser-based CAE platform."),
        appTool("matlab", "MATLAB", "simulation", "∫", ["MATLAB"], "Numerical computing and data analysis.", "https://www.mathworks.com/products/matlab.html"),
        plannedTool("simulink", "Simulink", "simulation", "▣", "Model-based simulation shell planned."),
        webTool("octave", "GNU Octave", "simulation", "∑", "https://octave-online.net/", "MATLAB-like numerical environment."),
        webTool("wolframalpha", "WolframAlpha", "simulation", "λ", "https://www.wolframalpha.com/", "Equation and reference computation."),
        plannedTool("ees", "Engineering Equation Solver", "simulation", "ƒ", "Future external reference."),

        appTool("bambu-studio", "Bambu Studio", "manufacturing", "▰", ["BambuStudio", "Bambu Studio"], "Bambu Lab slicer.", "https://bambulab.com/en/download/studio"),
        appTool("orcaslicer", "OrcaSlicer", "manufacturing", "▰", ["OrcaSlicer", "Orca Slicer"], "Advanced FDM slicer.", "https://github.com/SoftFever/OrcaSlicer"),
        appTool("prusaslicer", "PrusaSlicer", "manufacturing", "▰", ["PrusaSlicer", "Prusa Slicer"], "Prusa FDM slicer.", "https://www.prusa3d.com/page/prusaslicer_424/"),
        appTool("cura", "Ultimaker Cura", "manufacturing", "▰", ["Ultimaker Cura", "Cura"], "FDM slicing workflow.", "https://ultimaker.com/software/ultimaker-cura/"),
        webTool("mcmaster", "McMaster-Carr", "manufacturing", "⌬", "https://www.mcmaster.com/", "Hardware, fasteners and components."),
        webTool("grabcad", "GrabCAD", "manufacturing", "▧", "https://grabcad.com/library", "CAD models and community library."),
        webTool("traceparts", "TraceParts", "manufacturing", "▧", "https://www.traceparts.com/", "Supplier CAD part library."),
        webTool("misumi", "MISUMI", "manufacturing", "⌬", "https://us.misumi-ec.com/", "Configurable mechanical components."),
        webTool("sendcutsend", "SendCutSend", "manufacturing", "⌁", "https://sendcutsend.com/", "Laser/waterjet fabrication reference."),
        webTool("jlcpcb", "JLCPCB / PCBWay", "manufacturing", "▤", "https://jlcpcb.com/", "PCB and manufacturing supplier reference."),

        internalTool("unit-converter", "Unit Converter", "calculators", "⇄", "unit_converter", "Length, mass, force, pressure, torque and power."),
        internalTool("torque-power-rpm", "Torque / Power / RPM", "calculators", "⟳", "torque_power_rpm", "P = τω relation solver."),
        internalTool("mass-estimator", "Material Mass Estimator", "calculators", "⬡", "material_mass", "Density and simple volume mass estimate."),
        internalTool("gear-ratio", "Gear Ratio", "calculators", "⚙", "gear_ratio", "Driver/driven teeth ratio and output RPM."),
        internalTool("beam-deflection", "Beam Deflection", "calculators", "⌁", "beam_deflection", "Simply supported center load approximation."),
        internalTool("thread-reference", "Thread / Drill Chart", "calculators", "⌖", "thread_reference", "Common metric tap and clearance references."),

        materialTool("aluminium", "Aluminium", "Aluminium 6061-T6 quick card."),
        materialTool("steel", "Steel", "Mild steel quick card."),
        materialTool("stainless", "Stainless", "304 stainless quick card."),
        materialTool("titanium", "Titanium", "Ti-6Al-4V quick card."),
        materialTool("carbon_fiber", "Carbon Fiber", "Composite density reference."),
        materialTool("pla", "PLA", "FDM print material quick card."),
        materialTool("petg", "PETG", "FDM print material quick card."),
        materialTool("abs", "ABS", "FDM print material quick card."),
        materialTool("pa_cf", "PA-CF", "Carbon-filled nylon quick card."),
        webTool("matweb", "MatWeb", "materials", "⬡", "https://www.matweb.com/", "Material property database."),
        webTool("engineering-toolbox", "Engineering Toolbox", "materials", "▤", "https://www.engineeringtoolbox.com/", "Engineering reference tables."),
        webTool("nist", "NIST", "materials", "◫", "https://www.nist.gov/", "Reference data and standards."),

        webTool("google-scholar", "Google Scholar", "research", "⌕", "https://scholar.google.com/", "Papers and citations."),
        webTool("github", "GitHub", "research", "⌬", "https://github.com/", "Code and engineering repositories."),
        webTool("arxiv", "arXiv", "research", "∑", "https://arxiv.org/", "Preprints and technical papers."),
        webTool("nasa-ntrs", "NASA Technical Reports", "research", "⌁", "https://ntrs.nasa.gov/", "NASA reports archive."),
        webTool("asme-digital", "ASME Digital Collection", "research", "◫", "https://asmedigitalcollection.asme.org/", "ASME papers and proceedings."),
        webTool("sciencedirect", "ScienceDirect", "research", "▤", "https://www.sciencedirect.com/", "Publisher access may require subscription."),
        plannedTool("uel-resources", "UEL Resources", "research", "▤", "University resource connector planned."),

        webTool("iso-standards", "ISO Standards", "standards", "◫", "https://www.iso.org/standards.html", "External ISO standards portal."),
        webTool("asme-standards", "ASME Standards", "standards", "◫", "https://www.asme.org/codes-standards", "External ASME standards portal."),
        plannedTool("machinery-handbook", "Machinery’s Handbook", "standards", "▣", "Reference shell; user-owned source required."),
        internalTool("project-control", "Project Control", "projects", "▤", "project_control", "Open HUB Project Control.")
    ]);

    function appTool(id, title, category, icon, aliases, description, url) {
        return {
            id,
            title,
            category,
            type: "app",
            icon,
            description,
            status: "DETECT",
            appName: title,
            aliases,
            url,
            supportsFullscreen: true,
            supportsCommandRouter: true,
            tags: ["app", category]
        };
    }

    function webTool(id, title, category, icon, url, description) {
        return {
            id,
            title,
            category,
            type: "web",
            icon,
            description,
            status: "WEB",
            url,
            supportsFullscreen: true,
            supportsCommandRouter: true,
            tags: ["web", category]
        };
    }

    function internalTool(id, title, category, icon, actionId, description) {
        return {
            id,
            title,
            category,
            type: "internal",
            icon,
            description,
            status: "READY",
            actionId,
            supportsFullscreen: true,
            supportsCommandRouter: true,
            tags: ["internal", category]
        };
    }

    function plannedTool(id, title, category, icon, description) {
        return {
            id,
            title,
            category,
            type: "planned",
            icon,
            description,
            status: "PLANNED",
            supportsFullscreen: true,
            supportsCommandRouter: false,
            tags: ["planned", category]
        };
    }

    function materialTool(id, title, description) {
        const material = MATERIALS[id] || {};
        return {
            id: `material-${id}`,
            title,
            category: "materials",
            type: "internal",
            icon: "⬡",
            description,
            status: "READY",
            actionId: "material_card",
            materialId: id,
            density: material.density,
            supportsFullscreen: true,
            supportsCommandRouter: true,
            tags: ["material", "reference"]
        };
    }

    function number(value, fallback = 0) {
        if (value === "" || value === null || typeof value === "undefined") return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function round(value, digits = 4) {
        const factor = Math.pow(10, digits);
        return Math.round(number(value) * factor) / factor;
    }

    function convertUnit({family, value, from, to}) {
        const unitFamily = unitFamilies[family];
        if (!unitFamily || !unitFamily.units[from] || !unitFamily.units[to]) {
            return {ok: false, error: "UNSUPPORTED_UNIT"};
        }
        const base = number(value) * unitFamily.units[from];
        return {
            ok: true,
            family,
            input: number(value),
            from,
            to,
            result: base / unitFamily.units[to]
        };
    }

    function calculateTorquePowerRpm({torqueNm, powerKw, rpm}) {
        const torque = number(torqueNm, NaN);
        const power = number(powerKw, NaN);
        const speed = number(rpm, NaN);
        const knownTorque = Number.isFinite(torque);
        const knownPower = Number.isFinite(power);
        const knownRpm = Number.isFinite(speed);
        if (knownTorque && knownRpm) {
            const omega = speed * 2 * Math.PI / 60;
            return {ok: true, torqueNm: torque, rpm: speed, powerKw: torque * omega / 1000};
        }
        if (knownPower && knownRpm) {
            const omega = speed * 2 * Math.PI / 60;
            return {ok: true, torqueNm: omega ? (power * 1000) / omega : 0, rpm: speed, powerKw: power};
        }
        if (knownPower && knownTorque) {
            const omega = torque ? (power * 1000) / torque : 0;
            return {ok: true, torqueNm: torque, rpm: omega * 60 / (2 * Math.PI), powerKw: power};
        }
        return {ok: false, error: "PROVIDE_TWO_VALUES"};
    }

    function calculateGearRatio({driverTeeth, drivenTeeth, inputRpm}) {
        const driver = number(driverTeeth);
        const driven = number(drivenTeeth);
        const rpm = number(inputRpm);
        if (driver <= 0 || driven <= 0) return {ok: false, error: "INVALID_TEETH"};
        const ratio = driven / driver;
        return {
            ok: true,
            ratio,
            outputRpm: rpm / ratio,
            torqueMultiplier: ratio
        };
    }

    function calculateMaterialMass({materialId, density, volumeCm3, lengthMm, widthMm, heightMm}) {
        const material = MATERIALS[materialId] || {};
        const rho = number(density, material.density || 0);
        const l = number(lengthMm);
        const w = number(widthMm);
        const h = number(heightMm);
        const usesDimensions = l > 0 && w > 0 && h > 0;
        const volumeM3 = usesDimensions
            ? (l * w * h) / 1000000000
            : number(volumeCm3) / 1000000;
        if (rho <= 0 || volumeM3 <= 0) return {ok: false, error: "INVALID_DENSITY_OR_VOLUME"};
        return {
            ok: true,
            density: rho,
            volumeM3,
            volumeCm3: volumeM3 * 1000000,
            massKg: rho * volumeM3,
            material: material.label || materialId || "Custom",
            source: usesDimensions ? "DIMENSIONS" : "DIRECT_VOLUME",
            dimensionsMm: usesDimensions ? {length: l, width: w, height: h} : null
        };
    }

    function calculateBeamDeflection({lengthMm, forceN, elasticModulusGPa, secondMomentMm4}) {
        const L = number(lengthMm) / 1000;
        const F = number(forceN);
        const E = number(elasticModulusGPa) * 1000000000;
        const I = number(secondMomentMm4) * 1e-12;
        if (L <= 0 || F <= 0 || E <= 0 || I <= 0) return {ok: false, error: "INVALID_INPUT"};
        return {ok: true, deflectionMm: (F * Math.pow(L, 3) / (48 * E * I)) * 1000};
    }

    function byId(id) {
        return TOOLS.find(tool => tool.id === id) || null;
    }

    function byCategory(categoryId) {
        return TOOLS.filter(tool => tool.category === categoryId);
    }

    return {
        CATEGORIES,
        TOOLS,
        MATERIALS,
        THREAD_REFERENCES,
        unitFamilies,
        byId,
        byCategory,
        convertUnit,
        calculateTorquePowerRpm,
        calculateGearRatio,
        calculateMaterialMass,
        calculateBeamDeflection,
        round
    };
});
