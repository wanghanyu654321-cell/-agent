# 工作 agent 当前状态

更新于 2026-10-07。本文件保留当前入口、工程能力、验证和限制；历史阶段状态以原 evidence 和 Git 历史为准。

## 当前入口与范围

代码入口为 `wanghanyu654321-cell/-agent` 的 `main`。本轮 Staff Booking 02A 整合基线为 `97247cef1372fb4440ab56ec53b1a4fe487c2522`；原开发目录的未提交内容保留，整合在隔离副本完成。精确整合提交及 CI 结果以对应 PR 的实际记录为准。

该系统用于展示可解释、可验证的 AI 应用工程 / FDE 能力。求职优先，不因阶段计划继续扩充产品。

## 当前工程能力

- Pi 是唯一 Agent Runtime，Node 掌握身份、membership、tenant/store、权限、Safety、证据授权和业务写入。
- PostgreSQL 是业务事实源；迁移账本为 001–007，旧迁移未改写。
- 普通知识回答仍采用 0 / 1 / 2+ 可采纳证据规则；lexical 默认、vector 显式启用，FastAPI 只负责私有检索。
- React 复用现有认证和 StoreOps 界面；预约意向及工作人员处理保持服务端权限、版本和事务边界。
- WeCom 客户服务的验签解密、同步、耐久 claim、作用域路由和出站接口已实现。
- Staff Booking 02A 增加独立应用模板卡片、confirm/cancel、当前员工权限重读、既有 StoreOps 转移、提交后员工及客户反馈，以及受信操作员绑定 CLI。
- 发送前保存 indeterminate；不对不确定发送盲重试，不声称外部发送与数据库原子提交或 exactly-once。长服务名称只在卡片上显示摘要，数据库原值不截断。
- Staff 默认关闭，客户 KF 配置与 Staff 配置分离；本轮没有生产启用或部署。

## 2026-10-07 验证

- 原三个独立评审 P2 已修复；完整源码只读复审 APPROVED。
- 新增失败后通过的回归：真实子进程 CLI 幂等/拒绝改绑、200 ASCII/emoji 卡片摘要、实际 PostgreSQL 触发器注入员工反馈写回失败后客户仍发送一次且回放不重发。
- 通用 Node suite：736 passed / 63 数据库相关 skipped；跳过不作为数据库通过。
- 必须数据库命令分别运行：Identity 6、Business 5、Application/Acceptance 28、Core A 36、Core B 1、Job-Ready 2 均通过，无跳过；部分命令包含重复用例，不合计为不同测试数。
- Python 43/43 通过，使用实际 pgvector 0.8.0 数据库；Windows 本机测试启动使用兼容的 Selector event loop，生产代码未改。
- build、check（格式/lint/type）、integrity 和 git diff --check 通过。
- 本机跨语言 HTTP 健康启动未通过；Ubuntu clean-runner 的 Python、跨语言、Docker 和全部评测结果以精确新提交的整合 PR 及 Actions 为状态入口，不引用旧成功替代本轮。

初次全量运行使用普通 PostgreSQL 镜像缺少 vector 扩展，并将需要隔离顺序的数据库套件混跑；Windows 过度并行还产生超时。相关失败日志保留于执行回执，不更改预算或弱化断言。新增 007 后 Python 旧 006 账本断言失败，已补为精确 001–007 并重新通过。

## 仍未验证的边界

- 真实 Staff WeCom E2E、生产启用、精确部署工件及新的收件回执尚未验证。
- 此前回滚记录中的 DeepSeek 生产状态为关闭；本轮未重新核验生产、改变 provider 或执行真实提供者评测。
- 真实 hosted embedding、检索质量整体验收未获新的通过证据。
- 完整分页、cursor/replay/outbound-indeterminate 对账、进程重启后的完整 Pi 会话连续性、Data Flywheel、MCP、抖音/美团仍未闭环。
- 工程 CI、普通微信试用、本人掌握程度、商业客户部署和 Pilot 验收分别取证。没有生产就绪或商业效果声明。

## 证据入口

[Staff Booking 02A](WECOM_STAFF_BOOKING_02A.md)、[架构合同](ARCHITECTURE_CONTRACT.md)、[历史 Sprint closure](evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md)、[S7 说明](evidence/S7_ENGINEERING_EXPLANATION_V1.md)、[部署手册](../../deploy/job-ready/README.md)。

历史失败、BLOCKED、DEFERRED 和旧 clean-runner 证据留在原记录中；不再把它们重复列为当前事实。
