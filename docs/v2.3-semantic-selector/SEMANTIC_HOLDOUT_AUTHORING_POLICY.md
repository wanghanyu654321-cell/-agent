# Semantic Selector Holdout Authoring Policy

For every future semantic-selector capability holdout, model-visible evidence content contains only faithful, source-supported propositions.

Evaluator-authored absence assertions are forbidden inside model-visible candidate content, including “this rule does not state X”, “no exact value is disclosed”, “the source contains no formula”, and equivalent summaries. They may appear only when the official source itself explicitly establishes the negative proposition.

An absence analysis belongs in `goldReason`, `boundaryReason`, and evaluator metadata. It does not belong in candidate text shown to the model. This policy applies before any first exposure, and does not rewrite historical V2.1 or V2.2 evidence.
