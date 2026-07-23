# OSINT Legal Status Policy

## Scope

Legal status is contextual metadata, not legal advice and not a substitute for technical controls. AegisUi does not claim that a tool is universally lawful or unlawful without an appropriate basis.

| Status | Meaning in the catalog |
| --- | --- |
| `GENERALLY_LEGAL` | Commonly available public or commercial source; usage still follows terms and applicable law. |
| `AUTHORIZATION_REQUIRED` | Use should be limited to explicit authorization and lawful scope. |
| `CONTEXT_DEPENDENT` | Legality depends materially on purpose, target, authorization or local law. |
| `JURISDICTION_DEPENDENT` | Legal treatment can vary substantially by territory. |
| `POTENTIALLY_ILLEGAL` | Strong caution is warranted; it cannot be marked active without a future explicit review model. |
| `UNKNOWN` | AegisUi has insufficient basis to provide a stronger classification. |

## Risk is separate from legal status

`riskProfile` describes operational sensitivity or access friction. `legalStatus` describes context uncertainty. For example, a commercial public research source can be `COMMERCIAL` and `GENERALLY_LEGAL`; a reference-only dual-use entry can be `HIGH_ABUSE_POTENTIAL` and `AUTHORIZATION_REQUIRED`.

## Review rules

- Record `lastReviewed` and `sourceConfidence` for every provider.
- Prefer official product pages, public documentation, reputable papers or established public reporting for existence verification.
- Do not collect legal advice from unverified sources, markets, underground forums or mirrors.
- Do not turn legal warning text into a route around technical launch controls.
