using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> CashFlowScenarios(string user, IQueryCollection query)
    {
        var q = db.Set<CashFlowScenario>().AsNoTracking().Where(x => x.UserId == user); var (page, size) = Paging(query);
        var rows = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Name, x.State, x.Note, changes = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(string.IsNullOrWhiteSpace(x.ChangesJson) ? "[]" : x.ChangesJson), version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveFutureEvent(string user, string? id, FutureCashFlowInput input, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.Note is { Length: <= 2000 }, "未来计划名称或备注无效");
        Require(input.Type is "Income" or "Expense" or "Transfer" or "CreditCardPayment" && input.Certainty is "Certain" or "Estimated" or "Scenario" && input.State is "Planned" or "Posted" or "Cancelled", "未来计划类型、确定性或状态无效");
        Require(input.ExpectedDate.Year is >= 1900 and <= 9998, "预计日期无效"); var a = await Account(user, input.AccountId); Require(a.Currency == input.Currency && !(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan"), "账户币种不一致或辅助债权债务账户不适用现金流计划"); var amount = Money(input.Amount, true);
        if (input.Type is "Transfer" or "CreditCardPayment")
        {
            Require(input.ToAccountId != null && input.ToAccountId != a.Id, "请选择不同的目标账户"); var to = await Account(user, input.ToAccountId!);
            if (input.Type == "CreditCardPayment") Require(!(a.Type == "CreditCard" || a.Type == "ConsumerCredit") && (to.Type == "CreditCard" || to.Type == "ConsumerCredit") && a.Currency == to.Currency, "信用卡还款必须为同币种现金账户至信用卡");
            Require(to.Currency == a.Currency ? input.ReceivedAmount == null || Money(input.ReceivedAmount, true) == amount : input.ReceivedAmount != null && Money(input.ReceivedAmount, true) > 0, "跨币种转账必须明确收到金额，同币种转账本金必须一致");
        }
        else Require(input.ToAccountId == null && input.ReceivedAmount == null, "普通收支不能携带转入账户或收到金额");
        if (input.ScenarioId != null) Require(await db.Set<CashFlowScenario>().AnyAsync(x => x.UserId == user && x.Id == input.ScenarioId && x.State == "Active"), "情景不存在或已归档");
        Require((input.Certainty == "Scenario") == (input.ScenarioId != null), "情景事件必须指定独立情景，普通事件不能挂入情景");
        if (input.State == "Posted")
        {
            Require(input.TransactionId != null && input.ScenarioId == null, "已过账计划必须关联真实交易，情景不能过账");
            var transaction = await Transaction(user, input.TransactionId!); Require(transaction.Status == "Confirmed" && transaction.Type == input.Type && transaction.AccountId == a.Id && transaction.Currency == input.Currency && transaction.Amount == amount && transaction.ToAccountId == input.ToAccountId && transaction.ReceivedAmount == input.ReceivedAmount?.LetMoney(), "关联交易与计划不匹配");
            Require(!await db.RecurringOccurrences.AnyAsync(x => x.UserId == user && x.TransactionId == transaction.Id), "周期实例的交易已由周期来源管理，不可再绑定手工计划");
        }
        else Require(input.TransactionId == null, "未过账计划不能关联交易");
        var row = id == null ? new FutureCashFlowItem { UserId = user } : await db.Set<FutureCashFlowItem>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "未来计划不存在");
        if (id == null) { Require(version == "0", "新计划版本应为0"); db.Add(row); } else { Version(row, version); row.Version++; }
        row.Name = input.Name.Trim(); row.ExpectedDate = input.ExpectedDate; row.Type = input.Type; row.AccountId = a.Id; row.ToAccountId = input.ToAccountId; row.Amount = amount; row.Currency = a.Currency; row.ReceivedAmount = input.ReceivedAmount == null ? null : Money(input.ReceivedAmount, true); row.Certainty = input.Certainty; row.State = input.State; row.TransactionId = input.TransactionId; row.ScenarioId = input.ScenarioId; row.Note = input.Note; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> FutureEvents(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var q = db.Set<FutureCashFlowItem>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency); var (page, size) = Paging(query);
        if (query["start"].Count > 0) { var (start, end) = ForecastRange(query); q = q.Where(x => x.ExpectedDate >= start && x.ExpectedDate < end); }
        var rows = await q.OrderBy(x => x.ExpectedDate).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Name, x.ExpectedDate, x.Type, x.AccountId, x.ToAccountId, amount = M(x.Amount), x.Currency, receivedAmount = x.ReceivedAmount.HasValue ? M(x.ReceivedAmount.Value) : null, x.Certainty, x.State, x.TransactionId, x.ScenarioId, x.Note, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> CancelFutureEvent(string user, string id, string? version)
    {
        var row = await db.Set<FutureCashFlowItem>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "计划不存在"); Version(row, version); row.State = "Cancelled"; row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow; return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> SaveScenario(string user, string? id, ScenarioInput input, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.Note is { Length: <= 2000 } && input.State is "Active" or "Archived", "情景名称、备注或状态无效");
        var row = id == null ? new CashFlowScenario { UserId = user } : await db.Set<CashFlowScenario>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "情景不存在");
        if (id == null) { Require(version == "0", "新情景版本应为0"); db.Add(row); } else { Version(row, version); row.Version++; }
        row.Name = input.Name.Trim(); row.State = input.State; row.Note = input.Note; row.UpdatedAt = DateTimeOffset.UtcNow; return new { row.Id, version = row.Version.ToString() };
    }
    private static (DateOnly start, DateOnly end) ForecastRange(IQueryCollection query)
    {
        Require(DateOnly.TryParseExact(query["start"], "yyyy-MM-dd", out var start) && DateOnly.TryParseExact(query["end"], "yyyy-MM-dd", out _), "请输入预测起止业务日期");
        var end = DateOnly.ParseExact(query["end"]!, "yyyy-MM-dd"); var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        Require(start == today && end > start && end.Year <= 9997, "真实计划预测从今天开始，结束日不包含；任意期间假设使用情景模拟"); return (start, end);
    }
}
internal static class PlanningDecimalExtensions { public static decimal LetMoney(this string value) => FinanceService.Money(value); }




