# Festival Finance API

统一要求：现有登录授权及CSRF；JSON写入使用 Idempotency-Key，更新使用 If-Match。金额以字符串传递，日期为 YYYY-MM-DD。业务校验422、无权或不存在404、版本/幂等冲突409；非法AI输出502。

|方法|/api 路径|用途|
|---|---|---|
|GET|/festivals|分页计划列表|
|GET|/festivals/definitions?year=2026|可选节日模板|
|GET|/festivals/annual?year=2026|按开始年份归集，币种分开|
|GET|/festivals/transactions|本人已确认普通支出与退款，分页搜索|
|POST|/festivals|创建计划；If-Match:0|
|GET / PUT|/festivals/{id}|详情、报告 / 版本化更新|
|GET|/festivals/{id}/history|最近100条调整和关联历史|
|POST|/festivals/{id}/allocations|真实交易部分金额、分录及汇率归属|
|POST|/festivals/{id}/allocations/{linkId}/revoke|撤销关联，保留原交易|
|GET / POST|/festivals/{id}/ai-plans|最近50次方案 / 经授权生成方案|
|POST|/festivals/{id}/ai-plans/{planId}/adopt|用户确认新增意向，不自动付款|
|POST|/festivals/{id}/purchases/{purchaseId}/approval|创建现有审批中心草稿|
|GET|/festivals/{id}/value-compare|现有消费价值内核比较候选与保留资金|
|GET / POST|/festivals/{id}/reviews|读取 / 保存复盘快照|
|POST|/festivals/{id}/repeat|确认创建下一年度计划|
|GET / POST|/festivals/recipients|读取 / 创建送礼对象|
|PUT|/festivals/recipients/{id}|更新对象|
|GET|/festivals/reminders|站内提醒，确定性事件日期ID|
|GET / POST|/festivals/{id}/attachments|读取附件 / multipart上传 file；版本校验|
|GET|/festivals/{id}/attachments/{attachmentId}|授权下载|

附件复用项目原上传事务方式，不进入JSON操作恢复日志；10MB/文件、30个/节日，仅校验后的PNG/JPEG/PDF。

边界：单节日采购200项、分类30项；年度汇总最多2000个节日，超出明确报错；不宣称无限规模。跨币种汇率由用户确认，未接入自动汇率抓取。
