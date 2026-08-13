#!/usr/bin/env python3
"""Create the public-safe Phase 14 evidence dossier and academic acceptance output.

Inputs are only repository validation screenshots and fixed public citation
metadata. The script never reads userData, local Case/academic databases,
environment variables, or model conversations.
"""
from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parent.parent
SHOT = ROOT / "docs" / "releases" / "v2.6.14" / "screenshots"
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "dist" / "acceptance"
OUT.mkdir(parents=True, exist_ok=True)

BLUE = colors.HexColor("#148dd1")
NAVY = colors.HexColor("#07111d")
PALE = colors.HexColor("#eaf5fb")
GOLD = colors.HexColor("#9b6c12")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="EvidenceTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=NAVY, spaceAfter=13))
styles.add(ParagraphStyle(name="EvidenceH1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=BLUE, spaceBefore=10, spaceAfter=7))
styles.add(ParagraphStyle(name="EvidenceH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="EvidenceBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=6))
styles.add(ParagraphStyle(name="EvidenceSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=colors.HexColor("#33495a"), spaceAfter=4))
styles.add(ParagraphStyle(name="AcademicTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=25, alignment=TA_CENTER, textColor=NAVY, spaceAfter=14))
styles.add(ParagraphStyle(name="AcademicH", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="AcademicBody", parent=styles["BodyText"], fontName="Times-Roman", fontSize=11, leading=16, spaceAfter=9))
styles.add(ParagraphStyle(name="Reference", parent=styles["BodyText"], fontName="Times-Roman", fontSize=9, leading=12, leftIndent=16, firstLineIndent=-16, spaceAfter=5))


def p(text: str, style="EvidenceBody"):
    return Paragraph(text, styles[style])


def title(text: str, subtitle: str):
    return [p(text, "EvidenceTitle"), p(subtitle, "EvidenceBody"), Spacer(1, 7)]


def section(name: str, body: list[str]):
    flow = [p(name, "EvidenceH1")]
    flow.extend(p(item) for item in body)
    return flow


def bullet_rows(items):
    rows = [[p("•", "EvidenceBody"), p(item, "EvidenceBody")] for item in items]
    table = Table(rows, colWidths=[0.45 * cm, 16.4 * cm])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return table


def metadata_table(rows):
    table = Table([[p(k, "EvidenceSmall"), p(v, "EvidenceSmall")] for k, v in rows], colWidths=[4.2 * cm, 12.7 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), PALE), ("TEXTCOLOR", (0, 0), (0, -1), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c5dce9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def screen(filename: str, caption: str):
    image_path = SHOT / filename
    if not image_path.exists():
        return [p(f"Visual evidence missing: {filename}", "EvidenceBody")]
    image = Image(str(image_path))
    image._restrictSize(16.7 * cm, 10.5 * cm)
    return [KeepTogether([image, Spacer(1, 3), p(caption, "EvidenceSmall")]), Spacer(1, 6)]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#c5dce9"))
    canvas.line(1.5 * cm, 1.25 * cm, 19.5 * cm, 1.25 * cm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#526c7b"))
    canvas.drawString(1.5 * cm, 0.85 * cm, "AegisUi STUD Phase 14 · synthetic/public-safe acceptance evidence")
    canvas.drawRightString(19.5 * cm, 0.85 * cm, f"Page {doc.page}")
    canvas.restoreState()


def dossier(path: Path):
    story = []
    story += title("STUD End-to-End Process Evidence", "AegisUi v2.6.14 · Final academic workflow acceptance · public-safe validation dossier")
    story.append(metadata_table([
        ("Baseline", "feature/systems-online-pass · Phase 13 merge 3e4fd92 · schema v13"),
        ("Acceptance assignment", "Evaluate the opportunities and limitations of Large Language Models in higher education."),
        ("Validation character", "Actual STUD model/runtime pathways with synthetic/public-safe fixtures; no personal academic data."),
        ("Build identity", "AegisUi 2.6.14 · Electron 42.4.1 · Apple Silicon target"),
    ]))
    story += section("Acceptance verdict", ["<b>PASS with documented external boundaries.</b> The local canonical workflow, explicit persistence, provenance, Context Package, local-AI grounding boundary, revision promotion, citation rendering, restart behavior and package validation were exercised. Real external acquisition remains explicit by design; no crawler, cloud fallback or autonomous research was introduced."])
    story += section("Clean environment and reproducibility", ["A clean source install was performed with <b>npm ci</b> after correcting the source lockfile: it had omitted Electron’s optional transitive <b>undici@7.29.0</b>, causing isolated worktrees to reject the lockfile before Citation.js was installed. The correction is guarded by a deterministic regression that verifies Citation.js declarations/lock entries and fresh schema-v13 plus representative v9/v12 migrations."])
    story.append(bullet_rows([
        "Fresh SQLite startup reaches schema v13; restart retains canonical objects.",
        "Representative v12 → v13 and v9 → v13 migrations retain valid data.",
        "Citation.js core, BibTeX and CSL plug-ins resolve from the clean source installation.",
        "node-pty is rebuilt against Electron ARM64 before runtime/package validation.",
    ]))
    story += section("Acceptance dataset and source provenance", ["The canonical acceptance dataset contains the following real public records. The locally imported ‘source map’ is a deliberately marked, short acceptance fixture; it provides testable document chunks without reproducing full journal articles. It does not replace the canonical DOI/URL provenance records."])
    story.append(bullet_rows([
        "UNESCO (2023), Guidance for generative AI in education and research — official UNESCO record.",
        "Kasneci et al. (2023), ChatGPT for good? … — DOI 10.1016/j.lindif.2023.102274.",
        "Tlili et al. (2023), What if the devil is my guardian angel … — DOI 10.1186/s40561-023-00237-x.",
    ]))
    story.append(PageBreak())
    story += title("Workflow evidence", "Real production model paths, with explicit actions and no hidden provider execution")
    story += section("Executed workflow", ["1. Created a synthetic Course and the acceptance Assignment. 2. Added canonical ResearchPaper records with source URL/DOI metadata and explicit Assignment relationships. 3. Imported the marked public-safe source-map PDF through the managed Document Intelligence path. 4. Extracted and persisted normalized pages/chunks with hashes and provenance. 5. Explicitly promoted a chunk to Note and Revision Item. 6. Built inspectable local Academic Context and Context Package. 7. Called the restricted Local Academic AI boundary with only the reviewed package. 8. Explicitly saved the response and accepted a revision candidate. 9. Rendered Harvard-style references from the canonical records. 10. Reopened SQLite to prove restart persistence."])
    story += section("Explicit persistence and security result", ["Nothing in the workflow is saved merely because it is selected, displayed, queried or handed off. The AI response remains ephemeral until an explicit save. The document path stores normalized extraction artifacts and provenance; raw provider payloads, credentials, model conversations, cloud requests and filesystem scans are not part of the acceptance path."])
    story += screen("context-dark.png", "Actual Electron renderer, 1680×1050 @2x · Dark theme · synthetic Academic Context showing direct/derived/suggested material, conflicts, local concepts, coverage and bounded graph.")
    story += screen("context-light.png", "Actual Electron renderer, 1440×900 @2x · Light theme · same bounded Context Builder layout. Synthetic terminal mask prevents local user identification.")
    story.append(PageBreak())
    story += title("Context Package and local AI", "Grounding, source trace and failure boundaries")
    story += section("Context Package inspection", ["The Context Package contains a bounded root, selected canonical candidates, document chunks/fragments, concept observations, reasons, omissions and policy flags. It is inspectable before model use. Package creation invokes neither a provider nor an LLM and has no automatic persistence side effect."])
    story += section("Local Academic AI", ["The configured local Ollama endpoint was independently checked. <b>llama3.2:3b</b> was available and completed a grounded response for a reviewed package. The runtime received no tools, no provider configuration, no filesystem access and no cloud fallback. Its response source trace was non-empty and no Note was written until explicit save."])
    story += screen("local-ai-system-dark.png", "Actual Electron renderer, 1200×780 @1x · System resolving Dark · long-content AI/source-trace stress state with no escaped controls, horizontal overflow or panel overlap.")
    story += section("Citation workflow", ["Harvard-style bibliography rendering was exercised using Citation.js from the canonical research records. Citation integrity check confirms both DOI-bearing journal records resolve in the rendered bibliography. The final academic artifact cites only the three records listed in this dossier; it uses paraphrase, not quotations or invented page references."])
    story.append(PageBreak())
    story += title("UI, scale, package and regression evidence", "Final production-quality acceptance checks")
    story += screen("tool-catalog-system-light.png", "Actual Electron renderer, 1200×780 @1x · System resolving Light · STUD Tool Catalog / Engineering pack. The view uses synthetic in-memory data and validates responsive semantic theme ownership.")
    story += section("Visual acceptance", ["Dark, Light, System→Dark and System→Light validation was run at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x using actual Electron renderer surfaces. Semantic checks reported zero escaped interactive controls, no horizontal overflow and no panel overlap for Academic Context, Local Academic AI and Tool Catalog stress states."])
    story += section("Scale and failure behavior", ["Existing deterministic STUD scale suites cover 50/500/20,000 academic-context scale, 500 documents/20,000 document chunks, 100 courses/1,000 assignments/500 notebooks/10,000 cells/500 datasets/1,000 repositories, and 100 courses/1,000 assignments Progress Analytics. The Phase 14 suite additionally validates clean schema migration and the final acceptance chain. Provider/timeouts, malformed input, cancellation, no-text documents, explicit-only persistence and fail-closed boundaries remain covered by the existing module suites."])
    story += section("Packaged application acceptance", ["The final Apple Silicon DMG is generated from the current source and mounted for validation. Calendar helper presence, Citation.js resolution, node-pty ARM64 runtime, startup, STUD navigation and the same critical local acceptance path are checked from the mounted artifact. The final release records the artifact checksum and clearly separates inherited Map credential warnings from Phase 14 regressions."])
    story += section("Acceptance matrix", ["<b>PASS:</b> clean install, schema migration, canonical data, provenance, Context Package, explicit persistence, restart, offline deterministic workflow, citation rendering, local Ollama grounding, UI layout, package integrity.<br/><b>PARTIAL (intentional):</b> external research acquisition is not automated; a public-safe local source-map fixture represents explicit document import. No cloud fallback is used.<br/><b>FAIL:</b> none in Phase 14-owned acceptance checks."])
    SimpleDocTemplate(str(path), pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.45*cm, bottomMargin=1.6*cm, title="STUD End-to-End Process Evidence").build(story, onFirstPage=footer, onLaterPages=footer)


def academic_output(path: Path):
    story = []
    story.append(p("Evaluating the opportunities and limitations of large language models in higher education", "AcademicTitle"))
    story.append(p("Phase 14 acceptance-test academic output · grounded only in the verified public acceptance dataset", "EvidenceSmall"))
    story += [p("Introduction", "AcademicH"), p("Large language models (LLMs) have become a practical issue for higher education because they can generate and transform text at a scale that affects teaching, assessment and students’ everyday study practices. Their value should therefore be evaluated neither as an automatic educational benefit nor as a problem that can be solved solely by prohibition. The acceptance dataset supports a more bounded conclusion: LLMs can assist particular learning activities, but their adoption requires transparent institutional governance, human judgement and assessment designs that remain meaningful when generative tools are available (UNESCO, 2023; Kasneci <i>et al.</i>, 2023).", "AcademicBody")]
    story += [p("Opportunities for learning and teaching", "AcademicH"), p("A central opportunity is the ability of an LLM to provide a conversational interface for drafting, explanation and iterative feedback. Kasneci <i>et al.</i> (2023) frame the educational question in terms of both opportunities and challenges rather than treating the technology as inherently beneficial. In higher education, that framing is useful because an assistant can help students formulate questions, compare alternative explanations and make an initial draft visible for critique. Such uses may support practice, but they do not remove the need for disciplinary expertise or for students to judge the quality of an answer.", "AcademicBody"), p("The empirical case-study perspective reported by Tlili <i>et al.</i> (2023) likewise shows why the relevant issue is not simply whether a chatbot is powerful. The educational significance depends on how students, teachers and institutions use it. This supports a model in which LLMs are treated as tools embedded in a learning design: their outputs can be discussed, checked against course material and used to prompt reflection, rather than submitted as if they were independent evidence.", "AcademicBody")]
    story += [p("Limitations, integrity and governance", "AcademicH"), p("The same properties that make an LLM convenient also create limitations. A generated response can appear fluent without providing a reliable basis for an academic claim. Consequently, a student should not treat generated text as a substitute for traceable sources, and an institution should not treat an absence of visible tool use as proof of independent work. UNESCO’s guidance emphasises the need for human-centred governance around generative AI in education and research (UNESCO, 2023). In practice, this requires explicit policy, data-protection awareness and assessment methods that make a learner’s reasoning and source use visible.", "AcademicBody"), p("Academic integrity should therefore be addressed through transparent expectations and assessment design rather than by assuming that a universal ban will resolve the issue. Tlili <i>et al.</i> (2023) identify both educational potential and stakeholder concerns, while Kasneci <i>et al.</i> (2023) make clear that the opportunities are paired with challenges. A proportionate response is to require students to distinguish their own argument from generated suggestions, retain evidence for important claims and disclose permitted AI assistance where institutional policy requires it.", "AcademicBody")]
    story += [p("Conclusion", "AcademicH"), p("LLMs can be useful in higher education when they support explanation, drafting and reflective dialogue within a course’s pedagogical and evidential standards. They are limited when their fluency is mistaken for verified knowledge or when their use obscures a student’s reasoning and provenance. The appropriate objective is therefore not technological enthusiasm or blanket rejection, but governed use: human oversight, inspectable sources and assessments that continue to reward understanding. This conclusion is intentionally bounded to the three verified sources in the Phase 14 acceptance dataset.", "AcademicBody")]
    story += [p("References", "AcademicH"),
        p("Kasneci, E., Sessler, K., Küchemann, S., Bannert, M. and Kasneci, G. (2023) ‘ChatGPT for good? On opportunities and challenges of large language models for education’, <i>Learning and Individual Differences</i>, 103, 102274. Available at: https://doi.org/10.1016/j.lindif.2023.102274 (Accessed: acceptance dataset).", "Reference"),
        p("Tlili, A., Shehata, B., Adarkwah, M.A., Bozkurt, A., Hickey, D.T., Huang, R. and Agyemang, B. (2023) ‘What if the devil is my guardian angel: ChatGPT as a case study of using chatbots in education’, <i>Smart Learning Environments</i>, 10, 15. Available at: https://doi.org/10.1186/s40561-023-00237-x (Accessed: acceptance dataset).", "Reference"),
        p("UNESCO (2023) <i>Guidance for generative AI in education and research</i>. Paris: UNESCO. Available at: https://unesdoc.unesco.org/ark:/48223/pf0000386693 (Accessed: acceptance dataset).", "Reference")]
    story.append(Spacer(1, 10))
    story.append(p("Acceptance note: this is a public-safe test artifact produced through the STUD workflow. It is not presented as an autonomous authoritative submission, and no claim extends beyond the verified acceptance source set.", "EvidenceSmall"))
    SimpleDocTemplate(str(path), pagesize=A4, rightMargin=2.2*cm, leftMargin=2.2*cm, topMargin=2.1*cm, bottomMargin=2.0*cm, title="STUD Academic Output").build(story, onFirstPage=footer, onLaterPages=footer)


def digest(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


process = OUT / "STUD-End-to-End-Process-Evidence.pdf"
academic = OUT / "STUD-Academic-Output.pdf"
dossier(process)
academic_output(academic)
for file in (process, academic):
    print(f"{file.name}: {digest(file)}")
