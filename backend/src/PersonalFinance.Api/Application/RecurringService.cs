using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private async Task<RecurringRule> Recurring(string user, string id) => await db.RecurringRules.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "周期规则不存在");
    public static object RecurringDto(RecurringRule r, bool subscription = false) => new { r.Id, r.Name, r.State, r.Currency, r.Amount, r.AccountId, r.ToAccountId, r.CategoryId, r.DetailedNote, source = subscription ? "Subscription" : "Recurring", transaction = JsonSerializer.Deserialize<SaveTransaction>(r.PayloadJson, Json), r.StartLocal, r.EndLocal, r.Frequency, r.Interval, r.TimeZone, r.MonthEndPolicy, r.NextAt, r.ReminderDays, requiresConfirmation = true, r.CreatedAt, r.UpdatedAt, version = r.Version.ToString() };
    public static object OccurrenceDto(RecurringOccurrence o) => new { o.Id, o.RuleId, o.State, o.Sequence, o.ScheduledAt, o.Currency, o.Amount, o.TransactionId, o.RuleVersion, transaction = JsonSerializer.Deserialize<SaveTransaction>(o.PreparedPayloadJson ?? o.PayloadJson, Json), originalTransaction = JsonSerializer.Deserialize<SaveTransaction>(o.PayloadJson, Json), o.CreatedAt, o.UpdatedAt, version = o.Version.ToString() };
    private void RecurringLog(RecurringRule r, string action, string source = "User", RecurringOccurrence? occurrence = null, string? key = null, string message = "") => db.RecurringExecutions.Add(new() { UserId = r.UserId, RuleId = r.Id, OccurrenceId = occurrence?.Id, TransactionId = occurrence?.TransactionId, Action = action, Source = source, OperationKey = key, Message = message.Length > 300 ? message[..300] : message });
    private static void Advance(RecurringRule r)
    {
        for (var i = 0; i < 400; i++)
        {
            var at = RecurringSchedule.At(r.StartLocal, r.Frequency, r.Interval, r.NextSequence, r.MonthEndPolicy, r.TimeZone);
            if (at is null) { r.NextSequence++; continue; }
            var end = r.EndLocal is null ? (DateTimeOffset?)null : RecurringSchedule.At(r.EndLocal.Value, "Day", 1, 0, "Clamp", r.TimeZone);
            if (end is not null && at > end) { r.NextAt = null; r.State = "Ended"; return; }
            r.NextAt = at; return;
        }
        throw new ApiException(422, "周期无法生成有效日期");
    }
    public async Task<object> SaveRecurring(string user, RecurringInput input, string? id, string? version, bool subscriptionEdit = false)
    {
        Require(input.Name.Trim().Length is > 0 and <= 150, "请输入规则名称，最多150字");
        Require(input.DetailedNote.Length <= 4000, "详细备注最多4000字");
        Require(input.State is "Draft" or "Active" or "Paused", "规则状态无效");
        Require(input.Frequency is "Day" or "Week" or "Month" or "Quarter" or "HalfYear" or "Year" or "Custom", "周期无效");
        Require(input.MonthEndPolicy is "Clamp" or "Skip" && input.ReminderDays is >= 0 and <= 90, "月底策略或提醒天数无效");
        Require(input.EndLocal is null || input.EndLocal >= input.StartLocal, "结束时间不能早于开始时间");
        Require(input.StartLocal.Kind == DateTimeKind.Unspecified && (input.EndLocal is null || input.EndLocal.Value.Kind == DateTimeKind.Unspecified), "开始和结束时间请使用不含时区的本地时间，并单独指定时区");
        var request = input.Transaction;
        Require(request.Note.Length <= 2000 && (request.Merchant?.Length ?? 0) <= 200, "备注或商户名称过长");
        Require(request.Type is "Expense" or "Income" or "Transfer", "首版周期交易仅支持支出、收入和转账");
        Money(request.Amount, true); Require(Money(request.Fee, false) >= 0, "手续费不能为负数");
        var account = await Account(user, request.AccountId);
        Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "周期计划不能使用专项应收应付账户");
        Require(account.Currency == input.Currency, "币种与来源账户不符");
        if (request.Type == "Transfer") { var target = await Account(user, request.ToAccountId ?? ""); Require(target.Id != account.Id && !(target.Type == "Receivable" || target.Type == "Payable" || target.Type == "ConsumerLoan" || target.Type == "SecuredLoan"), "转账账户不合法"); if (target.Currency != account.Currency) { var received = Money(request.ReceivedAmount, true); Require(decimal.TryParse(request.ExchangeRate, System.Globalization.NumberStyles.AllowDecimalPoint, System.Globalization.CultureInfo.InvariantCulture, out var rate) && rate >= 0.00000001m && rate <= 1000000 && decimal.Round(rate, 8) == rate && decimal.Round(Money(request.Amount) * rate, 2, MidpointRounding.AwayFromZero) == received, "汇率与实际转入金额不一致，最多八位小数"); } }
        else
        {
            Require(Money(request.Fee) == 0, "普通收支计划不能带转账手续费");
            var splits = request.Splits is { Length: > 0 } ? request.Splits : [new Split(request.CategoryId ?? "", request.Amount)];
            Require(splits.Length <= 50 && splits.Sum(x => Money(x.Amount, true)) == Money(request.Amount), "拆分金额必须等于总金额");
            foreach (var split in splits) await Category(user, split.CategoryId, request.Type);
        }
        await ValidateActions(user, new AutomationActions(TagIds: request.TagIds, ProjectId: request.ProjectId), request.Type);
        if (request.ProjectId is not null) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == request.ProjectId && x.Currency == account.Currency), "项目币种不同");
        if (Money(request.Fee) > 0) await Category(user, request.FeeCategoryId ?? "", "Expense");
        RecurringSchedule.At(input.StartLocal, input.Frequency, input.Interval, 0, input.MonthEndPolicy, input.TimeZone);
        var r = id is null ? new RecurringRule { UserId = user } : await Recurring(user, id);
        if (id is not null)
        {
            Require(subscriptionEdit || !await db.Subscriptions.AnyAsync(x => x.UserId == user && x.RuleId == id), "订阅计划请在订阅管理中修改，以保留价格历史");
            Version(r, version); Require(r.State is not ("Cancelled" or "Ended"), "已结束规则请新建计划");
            Require(input.StartLocal == r.StartLocal && input.Frequency == r.Frequency && input.Interval == r.Interval && input.TimeZone == r.TimeZone && input.MonthEndPolicy == r.MonthEndPolicy, "已有规则不可更改时间锚点或周期；请取消后新建，历史实例仍保留"); r.Version++;
        }
        r.Name = input.Name.Trim(); r.State = input.State; r.AccountId = account.Id; r.ToAccountId = request.ToAccountId; r.CategoryId = request.CategoryId; r.Currency = input.Currency; r.Amount = M(Money(request.Amount, true));
        r.PayloadJson = JsonSerializer.Serialize(request, Json); r.StartLocal = DateTime.SpecifyKind(input.StartLocal, DateTimeKind.Unspecified); r.EndLocal = input.EndLocal;
        r.DetailedNote = input.DetailedNote;
        r.Frequency = input.Frequency; r.Interval = input.Interval; r.TimeZone = input.TimeZone; r.MonthEndPolicy = input.MonthEndPolicy; r.ReminderDays = input.ReminderDays; r.UpdatedAt = DateTimeOffset.UtcNow;
        Advance(r); if (id is null) db.RecurringRules.Add(r); RecurringLog(r, id is null ? "Create" : "Update", message: "金额与元数据修改只作用于以后生成的实例"); return RecurringDto(r);
    }
    public async Task<object> RecurringList(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var state = query["state"].ToString(); var q = db.RecurringRules.AsNoTracking().Where(x => x.UserId == user && (state == "" || x.State == state));
        var count = await q.CountAsync(); var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); var ids = rows.Select(x => x.Id).ToArray(); var subscribed = await db.Subscriptions.Where(x => x.UserId == user && ids.Contains(x.RuleId)).Select(x => x.RuleId).ToArrayAsync(); return new { items = rows.Select(x => RecurringDto(x, subscribed.Contains(x.Id))), total = count, page, pageSize = size };
    }
    public async Task<object> RecurringDetail(string user, string id) => RecurringDto(await Recurring(user, id), await db.Subscriptions.AnyAsync(x => x.UserId == user && x.RuleId == id));
    public async Task<object> GenerateOccurrences(string user, DateTimeOffset now, string source)
    {
        var expired = await db.Subscriptions.Where(x => x.UserId == user && x.State == "CancelledUntilEnd" && x.ServiceEndsAt <= now).ToListAsync();
        foreach (var s in expired) { s.State = "Ended"; s.Version++; s.UpdatedAt = now; RecurringLog(await Recurring(user, s.RuleId), "EndSubscription", source, message: "已取消续费的服务到期，不产生交易"); }
        var rules = await db.RecurringRules.Where(x => x.UserId == user && x.State == "Active" && x.NextAt <= now).OrderBy(x => x.NextAt).Take(100).ToListAsync(); var generated = 0;
        var processed = 0;
        foreach (var r in rules)
        {
            if (processed >= 100) break;
            var subscription = await db.Subscriptions.SingleOrDefaultAsync(x => x.RuleId == r.Id && x.UserId == user);
            for (var i = 0; i < 100 && processed < 100 && r.State == "Active" && r.NextAt <= now; i++, processed++)
            {
                if (!await db.RecurringOccurrences.AnyAsync(x => x.RuleId == r.Id && x.Sequence == r.NextSequence))
                {
                    var payload = JsonSerializer.Deserialize<SaveTransaction>(r.PayloadJson, Json)! with { OccurredAt = r.NextAt!.Value };
                    if (subscription is not null)
                    {
                        var price = await db.SubscriptionPrices.Where(x => x.UserId == user && x.SubscriptionId == subscription.Id && x.EffectiveAt <= r.NextAt).OrderByDescending(x => x.EffectiveAt).FirstOrDefaultAsync();
                        Require(price is not null, "订阅该期缺少有效价格，需检查价格历史"); payload = SubscriptionPayloadRules.AtPrice(payload, price!.Amount);
                    }
                    var occurrence = new RecurringOccurrence { UserId = user, RuleId = r.Id, Sequence = r.NextSequence, ScheduledAt = r.NextAt.Value, RuleVersion = r.Version, Currency = r.Currency, Amount = payload.Amount, PayloadJson = JsonSerializer.Serialize(payload, Json) };
                    db.RecurringOccurrences.Add(occurrence); RecurringLog(r, "Generate", source, occurrence); generated++;
                }
                r.NextSequence++; Advance(r);
            }
            r.Version++; r.UpdatedAt = DateTimeOffset.UtcNow;
        }
        return new { generated, requiresConfirmation = true };
    }
    public async Task<object> Occurrences(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var state = query["state"].ToString(); var rule = query["ruleId"].ToString();
        var q = db.RecurringOccurrences.AsNoTracking().Where(x => x.UserId == user && (state == "" || x.State == state) && (rule == "" || x.RuleId == rule));
        var count = await q.CountAsync(); var rows = await q.OrderByDescending(x => x.ScheduledAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); return new { items = rows.Select(OccurrenceDto), total = count, page, pageSize = size };
    }
    public async Task<object> RuleAction(string user, string id, RecurringAction input, string? version, bool subscriptionEdit = false)
    {
        Require(subscriptionEdit || !await db.Subscriptions.AnyAsync(x => x.UserId == user && x.RuleId == id), "订阅状态请在订阅管理中修改");
        var r = await Recurring(user, id); Version(r, version); Require(r.State is not ("Cancelled" or "Ended"), "规则已结束");
        r.State = input.Action switch { "Pause" => "Paused", "Resume" => "Active", "Cancel" => "Cancelled", _ => throw new ApiException(422, "操作无效") };
        if (r.State == "Cancelled") { var pending = await db.RecurringOccurrences.Where(x => x.UserId == user && x.RuleId == id && (x.State == "Pending" || x.State == "Failed")).ToListAsync(); foreach (var o in pending) { o.State = "Cancelled"; o.Version++; o.UpdatedAt = DateTimeOffset.UtcNow; RecurringLog(r, "CancelInstance", occurrence: o, message: input.Reason); } }
        r.Version++; r.UpdatedAt = DateTimeOffset.UtcNow; RecurringLog(r, input.Action, message: input.Reason); return RecurringDto(r);
    }
    public async Task<object> OccurrenceAction(string user, string id, RecurringAction input, string? version, string key)
    {
        var o = await db.RecurringOccurrences.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "执行实例不存在"); Version(o, version); var r = await Recurring(user, o.RuleId);
        if (input.Action == "Confirm")
        {
            Require(o.State is "Pending" or "Failed", "该实例不能再次过账"); Require(r.State != "Cancelled", "规则已取消");
            var request = JsonSerializer.Deserialize<SaveTransaction>(o.PreparedPayloadJson ?? o.PayloadJson, Json)!;
            Require((await Account(user, request.AccountId)).Currency == o.Currency, "账户币种与实例快照不符");
            var result = await SaveTransaction(user, request); o.TransactionId = JsonSerializer.SerializeToNode(result, Json)!["id"]!.GetValue<string>(); o.State = "Posted";
        }
        else if (input.Action is "Revoke" or "Restore")
        {
            Require(input.Action == "Revoke" ? o.State == "Posted" : o.State == "Revoked", "实例状态不允许此操作");
            Require(o.TransactionId is not null && input.TransactionVersion is not null, "请核对关联交易最新版本后操作");
            await ChangeTransaction(user, o.TransactionId!, input.Action == "Restore", input.TransactionVersion); o.State = input.Action == "Restore" ? "Posted" : "Revoked";
        }
        else { Require(o.State is "Pending" or "Failed", "已过账实例只能通过撤销交易处理"); Require(input.Action is "Skip" or "Cancel", "操作无效"); o.State = input.Action == "Skip" ? "Skipped" : "Cancelled"; }
        o.Version++; o.UpdatedAt = DateTimeOffset.UtcNow; RecurringLog(r, input.Action, occurrence: o, key: key, message: input.Reason); return OccurrenceDto(o);
    }
    public async Task<object> RecurringHistory(string user, string id, IQueryCollection query)
    {
        await Recurring(user, id); var (page, size) = Paging(query); var q = db.RecurringExecutions.AsNoTracking().Where(x => x.UserId == user && x.RuleId == id);
        var total = await q.CountAsync(); var items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); return new { items, total, page, pageSize = size };
    }
    public async Task RecordOccurrenceFailure(string user, string id, string key, HttpContext context, string message)
    {
        try
        {
            using var scope = scopes.CreateScope(); var service = scope.ServiceProvider.GetRequiredService<FinanceService>(); var fresh = scope.ServiceProvider.GetRequiredService<PersonalFinance.Api.Infrastructure.FinanceDb>();
            await service.Write(user, context, new { id, failed = true }, async () => { var o = await fresh.RecurringOccurrences.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id); if (o is not null) { if (o.State is "Pending" or "Failed") { o.State = "Failed"; o.Version++; o.UpdatedAt = DateTimeOffset.UtcNow; } service.RecurringLog(await service.Recurring(user, o.RuleId), "Failed", occurrence: o, key: key, message: message); } return new { recorded = true }; });
        }
        catch (Exception error) { logger.LogWarning(error, "Failed to save recurring execution failure"); }
    }
}


