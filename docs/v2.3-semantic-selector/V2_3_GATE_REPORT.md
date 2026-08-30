# V2.3 Gate Report

## Code-side evidence

- Strict selector parser and one-shot Pi `completeSimple` adapter: PASS in unit tests.
- Pi `error` envelopes now fail closed to `ABSTAIN/provider_error`; Pi `aborted` envelopes fail closed to `ABSTAIN/timeout` before parsing.
- Successful `stop` and `length` envelopes parse only final text. Empty and thinking-only successful envelopes remain invalid; thinking is never selector output.
- Provider failure, malformed output, unknown labels, cancellation and timeout: fail closed to `ABSTAIN`.
- Runtime integration: intentionally not attempted; the V2.3 contract forbids it before a valid real-model offline Gate.

## Blocking Gate

Real-model capability Gate: **NOT VALIDLY EXECUTED**. OAuth/configuration was available and a FIRST run occurred, but Pi returned error envelopes rather than model output. The current one-call control returned `stopReason: "error"` in 11 ms with `safeErrorCategory: "unknown"`, no content, and zero usage. The blocker is therefore an unresolved provider error category, not a semantic-quality failure. Runtime integration and a V2.3 release tag remain prohibited. See [PROVIDER_ERROR_CLASSIFICATION.md](PROVIDER_ERROR_CLASSIFICATION.md).
