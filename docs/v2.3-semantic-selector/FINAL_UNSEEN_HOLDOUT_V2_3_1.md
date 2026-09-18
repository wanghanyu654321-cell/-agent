# Final Fresh Unseen Holdout V2.3.1

## Status

**FROZEN FOR INDEPENDENT HUMAN REVIEW.** This is an evaluation-only population. It does not authorize a provider call, runtime integration, release, or tag.

The raw inputs are [evidence.json](../../evals/selection/semantic/holdout-v2.3.1-final/evidence.json), [cases.json](../../evals/selection/semantic/holdout-v2.3.1-final/cases.json), and [holdout-freeze-manifest.json](../../evals/selection/semantic/holdout-v2.3.1-final/holdout-freeze-manifest.json). All entries are `allowedForHoldoutOnly: true` and `runtimeAdmission: false`; none is part of the product corpus or passed to `SupportAgentRuntime`.

| Freeze field | Value |
| --- | --- |
| Prompt | `v2.3.1` / `fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869` |
| Evidence records | 12 official first-party Meituan Rules Center propositions |
| Primary cases | 12: 4 `CLEAR_DIRECT_ANSWER`, 4 `TRUE_INSUFFICIENCY`, 4 `HARD_RELATED_INSUFFICIENT` |
| Reverse diagnostics | One deterministic reverse for every primary |
| Future evaluation population | 12 primary + 12 reversed = 24 decisions |
| Evidence SHA-256 | `7a17e6496da4d4e0019781d2f2ec624b660cf445bc5a174b599e5a17be7bf01d` |
| Cases SHA-256 | `9e7ada4c9117c575dd265c81223e7b1f229305fd704686f19cee09f30ab9b118` |
| Real model calls at freeze | 0 |

## Evidence population

| Evidence ID | Title | Official source |
| --- | --- | --- |
| `HF231-DP-REVIEW-BENEFIT-EXCHANGE` | 以利益交换评价属于评价违规 | [Rules Center 191](https://rules-center.meituan.com/m/detail/guize/191?commonType=20) |
| `HF231-DP-REVIEW-WRONG-STORE` | 误导评价关联错误门店属于评价违规 | [Rules Center 191](https://rules-center.meituan.com/m/detail/guize/191?commonType=20) |
| `HF231-DP-REVIEW-FALSE-APPEAL` | 以虚假材料干扰处罚审核属于恶意申诉 | [Rules Center 191](https://rules-center.meituan.com/m/detail/guize/191?commonType=20) |
| `HF231-DP-REVIEW-NINE-POINT-PENALTY` | 累计九分对应九十天处罚期 | [Rules Center 191](https://rules-center.meituan.com/m/detail/guize/191?commonType=20) |
| `HF231-MT-DELIVERY-ADDITION-WINDOW` | 买家可在七日内追加评论一次 | [Rules Center 901](https://rules-center.meituan.com/m/detail/guize/901) |
| `HF231-MT-DELIVERY-REPLY-WINDOW` | 卖家可在十四日内回复并修改三次 | [Rules Center 901](https://rules-center.meituan.com/m/detail/guize/901) |
| `HF231-MT-DELIVERY-DELETE-EFFECT` | 买家删除评价即放弃再次评价权 | [Rules Center 901](https://rules-center.meituan.com/m/detail/guize/901) |
| `HF231-MT-PRICE-ACTIVITY-PERIOD` | 营销活动应显著标明活动期限 | [Rules Center 1449](https://rules-center.meituan.com/m/detail/guize/1449?activeRule=1) |
| `HF231-MT-PRICE-VOUCHER-CONDITIONS` | 赠券活动应标示使用条件 | [Rules Center 1449](https://rules-center.meituan.com/m/detail/guize/1449?activeRule=1) |
| `HF231-MT-PRICE-APPEAL-DEADLINE` | 到餐价格处罚可在三日内申诉 | [Rules Center 1449](https://rules-center.meituan.com/m/detail/guize/1449?activeRule=1) |
| `HF231-MT-PRICE-APPEAL-REVIEW` | 平台在四十八小时内审查价格申诉 | [Rules Center 1449](https://rules-center.meituan.com/m/detail/guize/1449?activeRule=1) |
| `HF231-MT-FALSE-TRADE-SEVERE-ACTIONS` | 严重虚假交易可触发项目永久下线等措施 | [Rules Center 679](https://rules-center.meituan.com/m/detail/guize/679) |

Candidate content is a bounded, faithful paraphrase of each source proposition. It contains no evaluator-written absence conclusion. Whether a specific requested fact is unavailable is represented only in case-level contract fields and the audits below.

## Frozen integer Gate

| Segment | Required result |
| --- | --- |
| Clear direct, primary | 4 exact selections; 0 wrong; 0 abstain |
| Clear direct, reversed | 4 exact selections; 0 wrong; 0 abstain |
| True insufficiency, primary and reversed | 4 + 4 `ABSTAIN`; 0 unsupported selections |
| Hard related insufficient, primary and reversed | 4 + 4 `ABSTAIN`; 0 unsupported selections |
| All 24 traces | 0 wrong, invalid, provider error, timeout, order-induced wrong, or order-outcome disagreement |

This Gate is not executed by the freeze and is not yet authorized.
