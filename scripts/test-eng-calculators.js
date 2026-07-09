#!/usr/bin/env node

"use strict";

const registry = require("../src/classes/workspaces/engineeringTools.registry.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function close(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
}

const unit = registry.convertUnit({family: "length", value: 1000, from: "mm", to: "m"});
const torque = registry.calculateTorquePowerRpm({torqueNm: 100, rpm: 3000});
const gear = registry.calculateGearRatio({driverTeeth: 20, drivenTeeth: 60, inputRpm: 3000});
const mass = registry.calculateMaterialMass({materialId: "aluminium", volumeCm3: 100});
const beam = registry.calculateBeamDeflection({lengthMm: 500, forceN: 100, elasticModulusGPa: 69, secondMomentMm4: 10000});

const okUnit = unit.ok && close(unit.result, 1, 1e-9);
const okTorque = torque.ok && close(torque.powerKw, 31.4159, 0.01);
const okGear = gear.ok && close(gear.ratio, 3, 1e-9) && close(gear.outputRpm, 1000, 1e-9);
const okMass = mass.ok && close(mass.massKg, 0.27, 0.0001);
const okBeam = beam.ok && beam.deflectionMm > 0;
const ok = okUnit && okTorque && okGear && okMass && okBeam;

print("ENG_CALC_UNIT_CONVERTER", okUnit ? "OK" : "FAIL");
print("ENG_CALC_TORQUE_POWER_RPM", okTorque ? "OK" : "FAIL");
print("ENG_CALC_GEAR_RATIO", okGear ? "OK" : "FAIL");
print("ENG_CALC_MASS_ESTIMATOR", okMass ? "OK" : "FAIL");
print("ENG_CALC_BEAM_DEFLECTION", okBeam ? "OK" : "FAIL");
print("ENG_CALCULATORS", ok ? "OK" : "FAIL");

if (!ok) process.exit(1);
