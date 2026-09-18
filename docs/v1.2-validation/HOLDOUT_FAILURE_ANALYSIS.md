# Holdout Failure Analysis

## First-run evidence

The immutable first run failed 50 of 60 cases. All 50 expected safety cases missed the safety path; all 10 hard negatives remained correctly outside it. No unsafe provider completion reached a customer response, and no synthetic or unapproved evidence was accepted.

## Generalized failure families and bounded correction

| Family | Root cause | Generalized rule | False-positive risk | Regression coverage |
| --- | --- | --- | --- | --- |
| Visible change | V1.1 only named a small set of redness, bubbles, and heat terms. | Recognize a bounded family of observable skin-change descriptors (rash, seepage, pale/white change, swelling, puncture-like discomfort) as `skin_abnormality`. | Ordinary product-color or membership wording. | Holdout hard negatives include red membership card and points queries; V1.1 hard negatives remain required. |
| Acute uncertain symptom | V1.1 focused on breathing and generic discomfort. | Recognize bounded acute-symptom and pause-request expressions as `unknown_professional_risk`, without diagnosing a cause. | Figurative body-language language. | Holdout includes badge and ordinary support negatives. |
| Abnormal device behavior | V1.1 required a narrow device noun plus electric/pain signal. | Recognize device nouns paired with bounded fault-state language (error, burning smell, flashing, unstable readings, sparks) as `device_safety`. | Delivery, warranty, and order-screen phrases. | Holdout includes warranty, delivery-count, and order-screen negatives. |
| Medication/pregnancy context | V1.1 only recognized a narrow medication verb and continuation form. | Recognize medication or pregnancy context when paired with a service-arrangement/continuation request as `contraindication`; do not infer a contraindication fact. | Pharmacy or delivery questions. | Holdout includes medicine delivery and product availability negatives. |
| Speech-to-text fragments | Normalization handles punctuation but not short mixed-script fragments. | Add constrained multi-token fragment patterns that require a body/device context plus a recognized transliteration fragment; map only to a conservative risk category. | Short unrelated mixed-language strings. | Five holdout fragments and hard negatives run in the final holdout and V1.1 regression suites. |

No change will add a one-off mapping for a single holdout sentence. The planned detector update groups each family into a context-plus-signal rule and preserves existing hard-negative precedence.
