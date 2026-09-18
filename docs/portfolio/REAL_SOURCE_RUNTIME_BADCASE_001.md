# Real-Source Runtime Badcase 001

## Observed

The first bounded real-provider Runtime Proof ran exactly three cases with
`openai-codex` / `gpt-5.6-sol`, zero retries, and
`allThreeCasesPassed=false`.

## Attribution

A read-only FAQ miss set the Runtime's no-evidence state. A later governed
knowledge lookup could authorize one approved evidence item, but final
arbitration selected the earlier miss before the later authorization.

## Regression

The deterministic regression reproduces `search_faq` miss followed by
`search_knowledge("商户无法履约")` returning exactly
`PB-MT-MERCHANT-CANNOT-FULFILL`.

## Fix

Final arbitration keeps tool failure fail-closed, then honors a current
authorized single evidence item before considering an earlier read-only miss.
Zero evidence and ambiguity remain fail-closed.

## Re-evaluation

Pending independent review. This repair authorizes no real-provider retry.
