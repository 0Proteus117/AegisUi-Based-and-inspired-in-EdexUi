#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(process.argv[2] || path.join(process.cwd(), "synthetic-stud-validation.pdf"));
const text = "Synthetic academic PDF for Aegis STUD Phase 3 visual validation";
const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj 0 -32 Td (Selectable text remains local and provenance-aware.) Tj ET`;
const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(outputPath, pdf, {mode: 0o600});
console.log(outputPath);
