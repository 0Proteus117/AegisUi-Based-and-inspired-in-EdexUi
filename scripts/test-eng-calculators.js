#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const registry = require("../src/classes/workspaces/engineeringTools.registry.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function close(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
}

const unit = registry.convertUnit({family: "length", value: 1000, from: "mm", to: "m"});
const torque = registry.calculateTorquePowerRpm({torqueNm: 100, rpm: 3000});
const torqueFromPower = registry.calculateTorquePowerRpm({powerKw: 200, rpm: 3000});
const rpmFromPower = registry.calculateTorquePowerRpm({torqueNm: 250, powerKw: 100});
const gear = registry.calculateGearRatio({driverTeeth: 20, drivenTeeth: 60, inputRpm: 3000});
const mass = registry.calculateMaterialMass({materialId: "aluminium", volumeCm3: 100});
const dimensionalMass = registry.calculateMaterialMass({materialId: "steel", lengthMm: 10, widthMm: 20, heightMm: 30, volumeCm3: 999});
const beam = registry.calculateBeamDeflection({lengthMm: 500, forceN: 100, elasticModulusGPa: 69, secondMomentMm4: 10000});
const threadIds = registry.THREAD_REFERENCES.map(row => row.thread);
const threadDataValid = registry.THREAD_REFERENCES.length === 6
    && new Set(threadIds).size === threadIds.length
    && registry.THREAD_REFERENCES.every(row => row.nominal && row.pitch > 0 && row.tapDrill > 0 && row.clearance > row.tapDrill);
const workspaceSource = fs.readFileSync(path.join(__dirname, "../src/classes/workspaceManager.class.js"), "utf8");
const workspaceCss = fs.readFileSync(path.join(__dirname, "../src/assets/css/workspaces.css"), "utf8");
const visualRenderers = {
    gear: workspaceSource.includes("data-gear-teeth") && workspaceSource.includes("renderEngineeringGearTeeth") && workspaceCss.includes(".eng-gear-teeth i"),
    torque: workspaceSource.includes("eng-power-gauge") && workspaceSource.includes("data-torque-vector") && workspaceCss.includes(".eng-power-ring"),
    mass: workspaceSource.includes("eng-material-part") && workspaceSource.includes("data-material-front") && workspaceCss.includes(".eng-material-dimensions"),
    thread: workspaceSource.includes("data-thread-reference") && workspaceSource.includes("updateEngineeringThreadReference") && workspaceCss.includes(".eng-thread-technical")
};

const okUnit = unit.ok && close(unit.result, 1, 1e-9);
const okTorque = torque.ok && close(torque.powerKw, 31.4159, 0.01)
    && torqueFromPower.ok && close(torqueFromPower.torqueNm, 636.6198, 0.01)
    && rpmFromPower.ok && close(rpmFromPower.rpm, 3819.7186, 0.01);
const okGear = gear.ok && close(gear.ratio, 3, 1e-9) && close(gear.outputRpm, 1000, 1e-9);
const okMass = mass.ok && close(mass.massKg, 0.27, 0.0001);
const okDimensionalMass = dimensionalMass.ok && dimensionalMass.source === "DIMENSIONS" && close(dimensionalMass.volumeCm3, 6, 1e-9) && close(dimensionalMass.massKg, 0.0471, 0.000001);
const okBeam = beam.ok && beam.deflectionMm > 0;
const okVisuals = Object.values(visualRenderers).every(Boolean);
const ok = okUnit && okTorque && okGear && okMass && okDimensionalMass && okBeam && threadDataValid && okVisuals;

print("ENG_CALC_UNIT_CONVERTER", okUnit ? "OK" : "FAIL");
print("ENG_CALC_TORQUE_POWER_RPM", okTorque ? "OK" : "FAIL");
print("ENG_CALC_GEAR_RATIO", okGear ? "OK" : "FAIL");
print("ENG_CALC_MASS_ESTIMATOR", okMass ? "OK" : "FAIL");
print("ENG_CALC_MASS_DIMENSIONS", okDimensionalMass ? "OK" : "FAIL");
print("ENG_CALC_BEAM_DEFLECTION", okBeam ? "OK" : "FAIL");
print("ENG_CALC_THREAD_DATA", threadDataValid ? "OK" : "FAIL");
print("ENG_VISUAL_GEAR_RENDERER", visualRenderers.gear ? "OK" : "FAIL");
print("ENG_VISUAL_TORQUE_RENDERER", visualRenderers.torque ? "OK" : "FAIL");
print("ENG_VISUAL_MASS_RENDERER", visualRenderers.mass ? "OK" : "FAIL");
print("ENG_VISUAL_THREAD_RENDERER", visualRenderers.thread ? "OK" : "FAIL");
print("ENG_CALCULATORS", ok ? "OK" : "FAIL");

if (!ok) process.exit(1);
