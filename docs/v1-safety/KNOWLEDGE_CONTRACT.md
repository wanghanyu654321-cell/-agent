# V1 Safety Knowledge Contract

Safety entries have stable ID, category, status, version, update date, scope, evidence text, allowed options, and escalation requirement. Only `status: approved` is usable in production. `synthetic_test_only` fixtures are rejected unless an explicit test-only retrieval option is set; `unapproved` is always rejected.
