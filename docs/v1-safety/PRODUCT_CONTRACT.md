# V1 Safety Product Contract

V1 routes potential professional safety concerns to approved evidence and a qualified human. It does not diagnose or invent professional handling. Missing, partial, unapproved, or synthetic production evidence produces pause-and-escalate behavior.

For supported cases, the runtime returns no more than three options and constructs its customer text only from the allowed options carried by approved retrieved evidence. For escalation cases, it returns a pause-and-qualified-human message and cannot reuse the model's professional handling text. The existing `handoff_to_human` side-effect boundary creates the escalation record idempotently.
