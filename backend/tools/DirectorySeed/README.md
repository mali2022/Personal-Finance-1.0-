<!-- version-catalog: 5.2.2; sequence: 117 -->
> 归档版本：Personal Finance 测试版 5.2.2；顺序：117；时间依据：未记载日期（归入当前维护文档）。原文中的旧版本、阶段号及验收状态保留用于追溯。

# DirectorySeed 本地运营工具

只新增商户和标签档案，复用 `FinanceService.SaveDirectory`、`FinanceService.Write`、用户级事务锁、幂等结果和脱敏审计。不新增 Web API，不应用 Migration，不写入交易或资金分录，不覆盖同名条目。

输入 JSON 固定为 `{ "formatVersion": 1, "userId": "用户 GUID", "merchants": ["名称"], "tags": ["名称"] }`；两类各需恰好 5,000 条，名称不能为空、带首尾空格或控制字符，最长 150 个 UTF-16 字符。预检使用 `Directory.Kind/Name` 的实际 SQL Server collation，防止大小写、宽度等规则下的重复。已有其他用户同名不会阻止当前用户创建，也不会改变其记录。

仅允许本机 Windows 集成认证、精确数据库 `PersonalFinanceWeb` 或 `PersonalFinanceWeb_RestoreCheck_<32 位小写 hex>`。正式执行前先做好数据库备份，并在隔离恢复库验证；工具不自动创建备份。

从项目根目录执行 Release 编译，避免修改当前 Debug 服务程序集：

```powershell
dotnet build backend/tools/DirectorySeed/DirectorySeed.csproj -c Release
dotnet backend/tools/DirectorySeed/bin/Release/net10.0/DirectorySeed.dll --database PersonalFinanceWeb_RestoreCheck_00000000000000000000000000000000 --input C:\absolute\plan.json --output C:\absolute\preview.json
```

默认只读预览。实际新增必须显式加 `--apply`；数据库必须替换为实际已验证的隔离库，正式库需获得对应用户的批量新增授权。

```powershell
dotnet backend/tools/DirectorySeed/bin/Release/net10.0/DirectorySeed.dll --database PersonalFinanceWeb_RestoreCheck_00000000000000000000000000000000 --input C:\absolute\plan.json --output C:\absolute\apply-proof.json --apply
```

每批 100 条独立事务。首批在用户级锁内重新检查整个计划，后续批次在同一锁内重新检查本批名称，数据库唯一索引最终保障重复拒绝。每条记录都产生现有审计事实；每批保存稳定计划 hash 对应的幂等键和新增 ID。若进程中断，已提交批次保留；重新运行完全相同的计划并指定新的输出文件，会恢复已经提交的批次，继续尚未提交的批次。工具不会回滚删除已提交档案，也不会改动用户后续修改过的档案；若检测到已提交档案被改变，会停止并要求人工核对。

审计 `TraceId` 使用 36 字符 GUID，兼容已有数据库的历史字段长度；完整计划 hash、目录类型和批次号由 `OperationKey` 保存。数据库异常只记录安全的错误分类及 `sqlNumber` 数值，不输出 SQL 错误正文、档案名称或凭据。

恢复预检将本次已提交 ID 一次解析到连接内的带主键临时表，再进行排除匹配；使用实际 `Directory.Id` 排序规则。临时表不会成为持久业务数据，也不会改变现有档案。首次执行没有恢复 ID 时直接检查名称冲突，避免无谓的 JSON 反复扫描。

输出文件禁止覆盖，只包含本次计划 hash、新增 ID、数量和执行状态，不记录现有档案名称、数据库凭据或财务明细。退出码 `0` 为预览可执行或全部完成；`2` 为拒绝或中断。遇到冲突停止并报告代码，不覆盖已有记录。查看 SQL Server `Idempotencies` 是恢复依据，普通控制台日志不输出名称及连接字符串。
