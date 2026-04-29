# Prompt promotion runbook

Goal: change the system prompt or sede KB without breaking existing behaviour.

## Steps

1. **Edit in the panel** (not in code).
   - Go to `/prompts`, pick the active version, click in the textarea.
   - The form saves a NEW version with `active=false` and
     `regression_suite_passed=false`. The currently active version stays
     active until you explicitly promote.

2. **Run regression suite against the new draft.**
   ```bash
   pnpm regression -- run \
     --version=v<new_number> \
     --cases=fixtures/regression/cases \
     --kb-dir=fixtures/regression/kb
   ```
   The CLI exits 0 on pass-rate ≥ 95%, 2 on regression detected. The
   `regression_suite_passed` flag is updated automatically.

3. **Read the diff** (panel → /regression/<run-id>):
   - Score deltas per dimension.
   - List of cases that newly fail (`newRegressions`).
   - List of cases that newly pass (`newFixes`).

4. **Decide**:
   - All deltas ≥ 0 and 0 new regressions → safe to promote.
   - 1-2 new regressions but on edge cases → discuss with Miguel; either
     fix the prompt or update the case (don't relax the rule).
   - More than 5 regressions or any "anti_hallucination" / "accuracy" delta
     ≤ -0.3 → REJECT. The edit is unsafe.

5. **Promote** (only if regression passed):
   - Panel → /prompts/<id> → "Promover" button. The promote action atomically
     marks old version inactive, new version active, in one transaction.
   - The 1-hour Anthropic cache for the system block invalidates naturally.

6. **Watch the next 30 minutes** of `llamadas_api` for unusual error rates.

## Don't

- Do not edit `prompts_versiones.content` directly via SQL — that bypasses
  versioning and the regression gate.
- Do not promote a version without running regression. The panel won't let
  you, but the SQL escape hatch exists; don't use it.
