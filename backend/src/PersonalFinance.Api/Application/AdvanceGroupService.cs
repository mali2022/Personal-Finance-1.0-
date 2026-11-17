using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public static class AdvanceShareMath
{
    public static decimal[] Allocate(decimal total, string strategy, decimal[] values)
    {
        FinanceService.Require(total > 0 && values.Length is >= 2 and <= 50 && strategy is "Fixed" or "Ratio" or "Equal", "分摊方式、金额或人数无效");
        FinanceService.Require(values.All(x => x >= 0), "承担额或权重不能为负");
        if (strategy == "Fixed")
        {
            FinanceService.Require(values.All(x => decimal.Round(x, 2) == x) && values.Sum() == total, "指定承担额合计必须精确等于实付款");
            return values;
        }
        var weights = strategy == "Equal" ? values.Select(_ => 1m).ToArray() : values;
        var sum = weights.Sum(); FinanceService.Require(sum > 0, "分摊权重合计必须大于零");
        var exact = weights.Select(x => total * (x / sum)).ToArray();
        var result = exact.Select(x => decimal.Floor(x * 100) / 100).ToArray();
        var remainder = (int)((total - result.Sum()) * 100);
        // Largest remainder, stable input order on ties; zero-weight participants never receive cents.
        var order = Enumerable.Range(0, values.Length).Where(i => weights[i] > 0).OrderByDescending(i => exact[i] - result[i]).ThenBy(i => i).ToArray();
        FinanceService.Require(remainder >= 0 && remainder <= order.Length, "分摊尾差无效");
        for (var i = 0; i < remainder; i++) result[order[i]] += .01m;
        FinanceService.Require(result.Sum() == total, "分摊合计不一致"); return result;
    }
}
public sealed partial class FinanceService
{
    public async Task<object> CreateAdvanceGroup(string user, AdvanceGroupInput b, bool preview)
    {
        Require(b.Shares is { Length: >= 2 and <= 50 } && b.Shares.Count(x => x.Own) <= 1 && b.Shares.All(x => x.Person.Trim().Length is > 0 and <= 200), "填写至少两人，本人承担条目最多一项");
        Require(b.Shares.Select(x => x.Person.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() == b.Shares.Length, "分摊人员不可重复");
        Require(b.Name.Trim().Length is > 0 and <= 200 && b.Note.Length <= 2000, "名称或备注无效");
        var total = Money(b.Amount, true); var values = b.Shares.Select(x => b.Strategy == "Fixed" ? Money(x.Value) : InvestmentDecimal(x.Value)).ToArray();
        var amounts = AdvanceShareMath.Allocate(total, b.Strategy, values); var account = await Account(user, b.AccountId);
        Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "请选择实际资金账户");
        var own = Enumerable.Range(0, amounts.Length).Where(i => b.Shares[i].Own).Sum(i => amounts[i]);
        if (own > 0) await Category(user, b.CategoryId ?? "", "Expense");
        if (preview) return new { account.Currency, cashImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? 0 : -total), accountImpact = M(-total), liabilityImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? total : 0), expense = M(own), receivable = M(total - own), shares = b.Shares.Select((x, i) => new { x.Person, x.Own, amount = M(amounts[i]) }), rule = "按最大余数法分配到分，相同尾差按填写顺序；确认后每人的应收复用独立代付档案，合计只扣实际总额。", preview };
        var groupId = Guid.NewGuid().ToString(); var ids = new List<string>();
        for (var i = 0; i < amounts.Length; i++)
        {
            if (amounts[i] == 0) continue;
            var result = await CreateAdvance(user, new AdvanceInput(b.Name, b.Shares[i].Person.Trim(), b.AccountId, M(amounts[i]), M(b.Shares[i].Own ? amounts[i] : 0), b.OccurredAt, b.CategoryId, Note: b.Note), false);
            var id = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString()!;
            db.Set<ThirdPartyAdvance>().Local.Single(x => x.Id == id).GroupId = groupId; ids.Add(id);
        }
        return new { groupId, ids, amount = M(total), ownAmount = M(own), receivable = M(total - own) };
    }
}



