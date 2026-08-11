"use strict";

// This runtime deliberately implements a small, deterministic calculation
// grammar. It is not an interpreter: no JavaScript, Python, shell command or
// renderer-provided executable is ever evaluated.
const Model = require("./studAcademicModel.class.js");

const MAX_VECTOR = 4096;
const MAX_MATRIX = 8;
const MAX_DATA_ROWS = 10000;
const MAX_DATA_COLUMNS = 32;
const MAX_TEXT = 4000;

const UNIT_DEFINITIONS = Object.freeze({
    m: {factor: 1, dimension: {L: 1}}, mm: {factor: 0.001, dimension: {L: 1}}, cm: {factor: 0.01, dimension: {L: 1}}, km: {factor: 1000, dimension: {L: 1}},
    s: {factor: 1, dimension: {T: 1}}, min: {factor: 60, dimension: {T: 1}}, h: {factor: 3600, dimension: {T: 1}},
    kg: {factor: 1, dimension: {M: 1}}, g: {factor: 0.001, dimension: {M: 1}},
    K: {factor: 1, dimension: {Theta: 1}}, degC: {factor: 1, dimension: {Theta: 1}, offset: 273.15},
    A: {factor: 1, dimension: {I: 1}}, mol: {factor: 1, dimension: {N: 1}}, cd: {factor: 1, dimension: {J: 1}},
    Hz: {factor: 1, dimension: {T: -1}}, N: {factor: 1, dimension: {M: 1, L: 1, T: -2}},
    Pa: {factor: 1, dimension: {M: 1, L: -1, T: -2}}, kPa: {factor: 1000, dimension: {M: 1, L: -1, T: -2}}, MPa: {factor: 1000000, dimension: {M: 1, L: -1, T: -2}}, bar: {factor: 100000, dimension: {M: 1, L: -1, T: -2}},
    J: {factor: 1, dimension: {M: 1, L: 2, T: -2}}, W: {factor: 1, dimension: {M: 1, L: 2, T: -3}}, V: {factor: 1, dimension: {M: 1, L: 2, T: -3, I: -1}}, ohm: {factor: 1, dimension: {M: 1, L: 2, T: -3, I: -2}},
    "m/s": {factor: 1, dimension: {L: 1, T: -1}}, "km/h": {factor: 1000 / 3600, dimension: {L: 1, T: -1}}
});

function fail(code, message, details = {}) { throw new Model.StudError(code, message, details); }
function finite(value, label) { const n = Number(value); if (!Number.isFinite(n)) fail("INVALID_INPUT", `${label} must be a finite number.`); return n; }
function text(value, label, max = MAX_TEXT) { const result = typeof value === "string" ? value.trim() : ""; if (!result) fail("INVALID_INPUT", `${label} is required.`); if (result.length > max) fail("BOUNDS_EXCEEDED", `${label} exceeds the local calculation limit.`); return result; }
function vector(value, label, maximum = MAX_VECTOR) { if (!Array.isArray(value) || !value.length) fail("INVALID_INPUT", `${label} must contain at least one value.`); if (value.length > maximum) fail("BOUNDS_EXCEEDED", `${label} exceeds the local limit of ${maximum} values.`); return value.map((item, index) => finite(item, `${label} value ${index + 1}`)); }
function round(value) { return Math.abs(value) < 1e-12 ? 0 : Number(Number(value).toPrecision(12)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function dimensionsEqual(a = {}, b = {}) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => (a[key] || 0) === (b[key] || 0));
}

function normalizeUnit(value) {
    const name = text(value, "Unit", 32);
    const unit = UNIT_DEFINITIONS[name];
    if (!unit) fail("UNSUPPORTED_UNIT", `Unit ${name} is not available in the bounded local unit engine.`);
    return {name, ...unit};
}

function toBase(value, unit) { return unit.offset === undefined ? value * unit.factor : (value + unit.offset) * unit.factor; }
function fromBase(value, unit) { return unit.offset === undefined ? value / unit.factor : value / unit.factor - unit.offset; }

function parsePolynomial(raw, variable = "x") {
    const expression = text(raw, "Expression").replace(/\s+/g, "");
    if (!/^[0-9A-Za-z+\-*/^.()]+$/.test(expression)) fail("UNSUPPORTED_EXPRESSION", "Only bounded algebraic notation is supported.");
    const name = text(variable, "Variable", 12);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) fail("INVALID_INPUT", "Variable is invalid.");
    if (expression.includes("/") || expression.includes("(") || expression.includes(")")) fail("UNSUPPORTED_EXPRESSION", "Division and grouped expressions require the optional symbolic engine.");
    const tokens = expression.replace(/-/g, "+-").split("+").filter(Boolean);
    const terms = new Map();
    tokens.forEach(token => {
        let coefficient = 1;
        let power = 0;
        if (token.includes(name)) {
            const pieces = token.split(name);
            if (pieces.length !== 2) fail("UNSUPPORTED_EXPRESSION", "Expression uses the selected variable ambiguously.");
            const prefix = pieces[0].replace(/\*$/, "");
            coefficient = prefix === "" || prefix === "+" ? 1 : prefix === "-" ? -1 : finite(prefix, "Coefficient");
            if (pieces[1]) {
                if (!/^\^[0-9]+$/.test(pieces[1])) fail("UNSUPPORTED_EXPRESSION", "Only non-negative integer powers are supported.");
                power = Number(pieces[1].slice(1));
            } else power = 1;
        } else coefficient = finite(token, "Constant");
        if (power > 12) fail("BOUNDS_EXCEEDED", "Polynomial degree exceeds the local limit of 12.");
        terms.set(power, (terms.get(power) || 0) + coefficient);
    });
    return terms;
}

function addPolynomials(a, b, multiplier = 1) {
    const result = new Map(a);
    b.forEach((value, key) => result.set(key, (result.get(key) || 0) + value * multiplier));
    [...result.keys()].forEach(key => { if (Math.abs(result.get(key)) < 1e-12) result.delete(key); });
    return result;
}

function polynomialText(terms, variable = "x") {
    const entries = [...terms.entries()].filter(([, value]) => Math.abs(value) >= 1e-12).sort((a, b) => b[0] - a[0]);
    if (!entries.length) return "0";
    return entries.map(([power, coefficient], index) => {
        const sign = coefficient < 0 ? (index ? " - " : "-") : (index ? " + " : "");
        const abs = round(Math.abs(coefficient));
        if (power === 0) return `${sign}${abs}`;
        const value = abs === 1 ? "" : `${abs}·`;
        return `${sign}${value}${variable}${power === 1 ? "" : `^${power}`}`;
    }).join("");
}

function evaluatePolynomial(terms, value) { let result = 0; terms.forEach((coefficient, power) => { result += coefficient * (value ** power); }); return result; }

function splitEquation(input) {
    const parts = text(input, "Equation").split("=");
    if (parts.length !== 2) fail("INVALID_INPUT", "An equation must contain exactly one equals sign.");
    return parts;
}

function solveQuadratic(terms, variable) {
    const c = terms.get(0) || 0; const b = terms.get(1) || 0; const a = terms.get(2) || 0;
    if ([...terms.keys()].some(power => power > 2)) fail("UNSUPPORTED_OPERATION", "Equation solving is limited to linear and quadratic polynomials without the optional symbolic engine.");
    if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) fail("NO_UNIQUE_SOLUTION", "The equation has no unique local solution.");
    if (Math.abs(a) < 1e-12) return [round(-c / b)];
    const d = b * b - 4 * a * c;
    if (d < 0) return [{real: round(-b / (2 * a)), imaginary: round(Math.sqrt(-d) / (2 * a))}, {real: round(-b / (2 * a)), imaginary: round(-Math.sqrt(-d) / (2 * a))}];
    return [round((-b + Math.sqrt(d)) / (2 * a)), round((-b - Math.sqrt(d)) / (2 * a))];
}

function parseLinearEquation(raw, variables) {
    const [left, right] = splitEquation(raw);
    const termMap = new Map();
    const consume = (part, side) => text(part, "Linear equation").replace(/\s+/g, "").replace(/-/g, "+-").split("+").filter(Boolean).forEach(token => {
        let matched = false;
        variables.forEach(variable => {
            if (token.includes(variable)) {
                if (matched || token.split(variable).length !== 2) fail("UNSUPPORTED_EXPRESSION", "System equation is ambiguous.");
                const prefix = token.split(variable)[0].replace(/\*$/, "");
                const coefficient = prefix === "" || prefix === "+" ? 1 : prefix === "-" ? -1 : finite(prefix, "System coefficient");
                termMap.set(variable, (termMap.get(variable) || 0) + side * coefficient);
                matched = true;
            }
        });
        if (!matched) termMap.set("constant", (termMap.get("constant") || 0) + side * finite(token, "System constant"));
    });
    consume(left, 1); consume(right, -1);
    return {coefficients: variables.map(variable => termMap.get(variable) || 0), constant: -(termMap.get("constant") || 0)};
}

function solveSystem(equations, variables) {
    if (!Array.isArray(equations) || equations.length < 2 || equations.length > 3) fail("INVALID_INPUT", "A system must contain two or three equations.");
    const names = Array.isArray(variables) ? variables.map(value => text(value, "System variable", 12)) : ["x", "y"];
    if (names.length !== equations.length || new Set(names).size !== names.length) fail("INVALID_INPUT", "System variables must be unique and match equation count.");
    const rows = equations.map(value => { const row = parseLinearEquation(value, names); return [...row.coefficients, row.constant]; });
    for (let pivot = 0; pivot < names.length; pivot += 1) {
        let selected = pivot;
        for (let row = pivot + 1; row < rows.length; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[selected][pivot])) selected = row;
        if (Math.abs(rows[selected][pivot]) < 1e-12) fail("NO_UNIQUE_SOLUTION", "The linear system has no unique solution.");
        [rows[pivot], rows[selected]] = [rows[selected], rows[pivot]];
        const factor = rows[pivot][pivot]; rows[pivot] = rows[pivot].map(value => value / factor);
        rows.forEach((row, index) => { if (index !== pivot) { const value = row[pivot]; rows[index] = row.map((cell, column) => cell - value * rows[pivot][column]); } });
    }
    return Object.fromEntries(names.map((name, index) => [name, round(rows[index][names.length])]));
}

function matrix(value, label) {
    if (!Array.isArray(value) || !value.length || value.length > MAX_MATRIX || value.some(row => !Array.isArray(row) || row.length !== value.length || row.length > MAX_MATRIX)) fail("INVALID_INPUT", `${label} must be a square matrix up to ${MAX_MATRIX}×${MAX_MATRIX}.`);
    return value.map((row, rowIndex) => row.map((cell, columnIndex) => finite(cell, `${label} cell ${rowIndex + 1}:${columnIndex + 1}`)));
}

function determinant(source) {
    const a = source.map(row => [...row]); let sign = 1; let result = 1;
    for (let pivot = 0; pivot < a.length; pivot += 1) {
        let selected = pivot; for (let row = pivot + 1; row < a.length; row += 1) if (Math.abs(a[row][pivot]) > Math.abs(a[selected][pivot])) selected = row;
        if (Math.abs(a[selected][pivot]) < 1e-12) return 0;
        if (selected !== pivot) { [a[pivot], a[selected]] = [a[selected], a[pivot]]; sign *= -1; }
        const p = a[pivot][pivot]; result *= p;
        for (let row = pivot + 1; row < a.length; row += 1) { const factor = a[row][pivot] / p; for (let column = pivot; column < a.length; column += 1) a[row][column] -= factor * a[pivot][column]; }
    }
    return round(result * sign);
}

function summary(values) {
    const sorted = [...values].sort((a, b) => a - b); const sum = values.reduce((total, item) => total + item, 0); const mean = sum / values.length;
    const variance = values.reduce((total, item) => total + ((item - mean) ** 2), 0) / values.length;
    return {count: values.length, minimum: round(sorted[0]), maximum: round(sorted[sorted.length - 1]), mean: round(mean), median: round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2), standardDeviation: round(Math.sqrt(variance))};
}

class StudComputeRuntime {
    capabilities() {
        return Object.freeze({
            core: {status: "AVAILABLE", engine: "AEGIS_BOUNDED_LOCAL_COMPUTE", version: "1.0.0", offline: true, operations: ["EQUATIONS", "UNITS", "NUMERICAL", "DATA", "PLOTS"]},
            sympy: {status: "NOT_INSTALLED", reason: "No approved local SymPy pack is bundled or configured."},
            pint: {status: "NOT_INSTALLED", reason: "No approved local Pint pack is bundled or configured."},
            coolprop: {status: "NOT_INSTALLED", reason: "CoolProp is optional and not installed locally."},
            pythonControl: {status: "NOT_INSTALLED", reason: "python-control is optional and not installed locally."}
        });
    }

    run(request = {}) {
        Model.assertAllowedKeys(request, ["tool", "operation", "input"], "Engineering compute request");
        const tool = Model.enumValue(request.tool, ["EQUATIONS", "UNITS", "NUMERICAL", "DATA", "PLOTS", "THERMODYNAMICS", "CONTROL_SYSTEMS"], "Compute tool");
        const input = request.input && typeof request.input === "object" && !Array.isArray(request.input) ? request.input : {};
        if (["THERMODYNAMICS", "CONTROL_SYSTEMS"].includes(tool)) fail("CAPABILITY_UNAVAILABLE", `${tool.replace(/_/g, " ")} requires an optional approved local engine that is not installed.`);
        let result;
        if (tool === "EQUATIONS") result = this.equations(request.operation, input);
        else if (tool === "UNITS") result = this.units(request.operation, input);
        else if (tool === "NUMERICAL") result = this.numerical(request.operation, input);
        else if (tool === "DATA") result = this.data(request.operation, input);
        else result = this.plots(request.operation, input);
        return Object.freeze({status: "SUCCESS", tool, operation: String(request.operation || "").toUpperCase(), originalInput: clone(input), normalizedInput: clone(result.normalizedInput || input), result: result.value, units: result.units || null, plot: result.plot || null, warnings: result.warnings || [], runtime: {engine: "AEGIS_BOUNDED_LOCAL_COMPUTE", version: "1.0.0", offline: true, network: "NONE"}});
    }

    equations(operation, input) {
        const action = Model.enumValue(operation, ["SIMPLIFY", "SOLVE", "SYSTEM", "DIFFERENTIATE", "INTEGRATE", "SUBSTITUTE", "MATRIX"], "Equation operation");
        if (action === "SYSTEM") return {normalizedInput: {equations: input.equations, variables: input.variables}, value: solveSystem(input.equations, input.variables)};
        if (action === "MATRIX") { const source = matrix(input.matrix, "Matrix"); return {normalizedInput: {matrix: source}, value: {determinant: determinant(source), order: source.length}}; }
        const variable = text(input.variable || "x", "Variable", 12); const expression = text(input.expression, "Expression");
        if (action === "SOLVE") { const [left, right] = splitEquation(expression); const termsToSolve = addPolynomials(parsePolynomial(left, variable), parsePolynomial(right, variable), -1); return {normalizedInput: {expression, variable}, value: {solutions: solveQuadratic(termsToSolve, variable), normalizedEquation: `${polynomialText(termsToSolve, variable)} = 0`}}; }
        const terms = parsePolynomial(expression, variable);
        if (action === "SIMPLIFY") return {normalizedInput: {expression, variable}, value: {expression: polynomialText(terms, variable), degree: Math.max(...terms.keys(), 0)}};
        if (action === "DIFFERENTIATE") { const output = new Map(); terms.forEach((coefficient, power) => { if (power > 0) output.set(power - 1, coefficient * power); }); return {normalizedInput: {expression, variable}, value: {expression: polynomialText(output, variable)}}; }
        if (action === "INTEGRATE") { const output = new Map(); terms.forEach((coefficient, power) => output.set(power + 1, coefficient / (power + 1))); return {normalizedInput: {expression, variable}, value: {expression: `${polynomialText(output, variable)} + C`}}; }
        const value = finite(input.value, `Value for ${variable}`); return {normalizedInput: {expression, variable, value}, value: {result: round(evaluatePolynomial(terms, value)), variable, substitutedValue: value}};
    }

    units(operation, input) {
        const action = Model.enumValue(operation, ["CONVERT", "ADD"], "Unit operation");
        const value = finite(input.value, "Quantity value"); const source = normalizeUnit(input.fromUnit);
        if (action === "CONVERT") { const target = normalizeUnit(input.toUnit); if (!dimensionsEqual(source.dimension, target.dimension)) fail("DIMENSION_MISMATCH", "The requested unit conversion is dimensionally invalid."); return {normalizedInput: {value, fromUnit: source.name, toUnit: target.name}, value: {value: round(fromBase(toBase(value, source), target)), unit: target.name}, units: {source: source.name, target: target.name}}; }
        const otherValue = finite(input.otherValue, "Second quantity value"); const other = normalizeUnit(input.otherUnit); if (!dimensionsEqual(source.dimension, other.dimension)) fail("DIMENSION_MISMATCH", "Only quantities with matching dimensions can be added."); return {normalizedInput: {value, fromUnit: source.name, otherValue, otherUnit: other.name}, value: {value: round(value + fromBase(toBase(otherValue, other), source)), unit: source.name}, units: {result: source.name}};
    }

    numerical(operation, input) {
        const action = Model.enumValue(operation, ["STATISTICS", "INTERPOLATE", "ROOT", "INTEGRATE", "LINEAR_ALGEBRA"], "Numerical operation");
        if (action === "STATISTICS") { const values = vector(input.values, "Values"); return {normalizedInput: {values}, value: summary(values)}; }
        if (action === "INTERPOLATE") { const x = vector(input.x, "X values"); const y = vector(input.y, "Y values"); const at = finite(input.at, "Interpolation point"); if (x.length !== y.length || x.length < 2) fail("INVALID_INPUT", "Interpolation requires matching X and Y vectors with at least two values."); let index = x.findIndex((item, i) => i < x.length - 1 && ((item <= at && at <= x[i + 1]) || (item >= at && at >= x[i + 1]))); if (index < 0) fail("INVALID_INPUT", "Interpolation point must be within the supplied local range."); const value = y[index] + (at - x[index]) * (y[index + 1] - y[index]) / (x[index + 1] - x[index]); return {normalizedInput: {x, y, at}, value: {interpolated: round(value)}}; }
        if (action === "ROOT") { const variable = text(input.variable || "x", "Variable", 12); const terms = parsePolynomial(input.expression, variable); const roots = solveQuadratic(terms, variable); return {normalizedInput: {expression: input.expression, variable}, value: {roots}}; }
        if (action === "INTEGRATE") { const variable = text(input.variable || "x", "Variable", 12); const terms = parsePolynomial(input.expression, variable); const lower = finite(input.lower, "Lower bound"); const upper = finite(input.upper, "Upper bound"); const primitive = new Map(); terms.forEach((coefficient, power) => primitive.set(power + 1, coefficient / (power + 1))); return {normalizedInput: {expression: input.expression, variable, lower, upper}, value: {integral: round(evaluatePolynomial(primitive, upper) - evaluatePolynomial(primitive, lower))}}; }
        const source = matrix(input.matrix, "Matrix"); const values = vector(input.vector, "Vector"); if (source.length !== values.length) fail("DIMENSION_MISMATCH", "Matrix and vector dimensions must match."); return {normalizedInput: {matrix: source, vector: values}, value: {product: source.map(row => round(row.reduce((total, item, index) => total + item * values[index], 0))), determinant: determinant(source)}};
    }

    data(operation, input) {
        const action = Model.enumValue(operation, ["SUMMARY"], "Data operation");
        if (action !== "SUMMARY") fail("UNSUPPORTED_OPERATION", "Data operation is unavailable.");
        Model.assertPlainObject(input.columns, "Dataset columns"); const names = Object.keys(input.columns); if (!names.length || names.length > MAX_DATA_COLUMNS) fail("INVALID_INPUT", `Dataset must contain between 1 and ${MAX_DATA_COLUMNS} columns.`);
        const columns = {}; let count = null; names.forEach(name => { if (name.length > 120) fail("BOUNDS_EXCEEDED", "Dataset column name is too long."); const values = vector(input.columns[name], `Column ${name}`, MAX_DATA_ROWS); if (count !== null && values.length !== count) fail("INVALID_INPUT", "Dataset columns must have matching row counts."); count = values.length; columns[name] = values; });
        return {normalizedInput: {columns}, value: {rows: count, columns: Object.fromEntries(names.map(name => [name, summary(columns[name])]))}};
    }

    plots(operation, input) {
        const type = Model.enumValue(operation, ["LINE", "SCATTER", "HISTOGRAM"], "Plot type"); const title = text(input.title || "Local academic plot", "Plot title", 160); const xLabel = text(input.xLabel || "X", "X label", 80); const yLabel = text(input.yLabel || "Y", "Y label", 80);
        if (type === "HISTOGRAM") { const values = vector(input.values, "Plot values"); return {normalizedInput: {values, title, xLabel, yLabel}, value: {points: values.length}, plot: {type, title, xLabel, yLabel, values}}; }
        const x = vector(input.x, "X values"); const y = vector(input.y, "Y values"); if (x.length !== y.length) fail("DIMENSION_MISMATCH", "Plot X and Y vectors must match."); return {normalizedInput: {x, y, title, xLabel, yLabel}, value: {points: x.length}, plot: {type, title, xLabel, yLabel, x, y}};
    }
}

module.exports = {StudComputeRuntime, UNIT_DEFINITIONS, MAX_VECTOR, MAX_DATA_ROWS, MAX_DATA_COLUMNS};
