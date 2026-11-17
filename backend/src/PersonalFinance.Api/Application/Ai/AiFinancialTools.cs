using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiToolSpec(string Name, string Description, string Link, string Permission = "summary");
public sealed record AiQuery(string Start, string End, string Currency, string? AccountId);
public sealed record AiEvidence(string Tool, string Start, string End, string Currency, string Scope, string Source,
    string DetailLink, DateTimeOffset QueriedAt, JsonNode? Data, bool Truncated, string[]? AccountIds = null, string? RequestId = null);

public sealed class AiFinancialTools(FinanceService finance, IOptions<AiOptions> options)
{
    public static readonly AiToolSpec[] Registry = [
        new("GetIncomeExpenseSummary", "收支汇总、分类与期间趋势；金额由现有报表计算", "/reports"),
        new("GetCategoryReport", "分类支出汇总，分类名经过脱敏，分类ID可供本地明细定位", "/reports"),
        new("GetAccountBalances", "当前账户余额与资金状态，账户以ID标识", "/accounts"),
        new("GetBudgetExecution", "起始日期所在月份的人民币预算执行", "/budgets"),
        new("GetCreditCardSummary", "指定账户、起始日期月份的真实信用卡账单", "/accounts"),
        new("GetLoanSummary", "现有借贷还款计划压力；不是全部真实负债", "/loans"),
        new("GetNetWorthReport", "期间净资产分析及估值覆盖范围", "/assets/allocation"),
        new("GetInvestmentPerformance", "实际现金流年化XIRR、期间收益金额、估值/汇率及计算状态。null或失败不代表0%；汇率金额为期末汇率基准分解，不是独立已实现汇兑收入。不得编造现金流/估值或相加为组合收益率。最多20项原币资产。", "/investments/performance"),
        new("GetCashFlowForecast", "未来现金流，仅基于已登记计划；自定义假设使用ForecastScenario", "/cashflow"),
        new("GetLifeSimulation", "调用确定性引擎重算最近保存的同币种人生情景（最近20条）；日期不筛选，不写正式账务。需要薪酬隐私授权。", "/planning/life-simulator", "payroll"),
        new("GetPayrollSummary", "工资年报，应发、扣款、实发和关联真实到账；必须查询完整自然年", "/payroll", "payroll"),
        new("GetPayrollCenterSummary", "薪酬与社保中心：完整年度工资结构、月度变化、社保、公积金、个税及历史情景模拟；必须查询完整自然年", "/payroll", "payroll"),
        new("GetContributionSummary", "社保年度汇总；必须查询完整自然年", "/payroll", "payroll"),
        new("GetFundStatus", "指定账户当前冻结及可用资金", "/accounts/fund-status"),
        new("GetBenefitAnalysis", "期间优惠使用及当前未使用权益", "/benefits"),
        new("GetTransactions", "指定期间的历史消费明细；需单独明细授权，默认不含备注和个人姓名", "/transactions", "details"),
        new("GetSavingsGoals", "当前储蓄目标进度、已有预留与目标汇总，不写入或重复计算", "/goals"),
        new("GetFinancialReport", "月/年财务报告汇总；自然期间，服务端截断至今；不含身份明细", "/financial-reports"),
        new("GetMonthlyReview", "完整自然月复盘，包含原服务的上一期对比与当前待办，未结束期间明确覆盖范围", "/reports"),
        new("GetAnnualReview", "完整自然年复盘，包含原服务的上一年对比，未结束年度不预测未来收入", "/reports"),
        new("GetPrepaymentSummary", "当前押金预付款合同的首批记录；金额不再叠加账面净资产，需要明细授权", "/prepayments", "details"),
        new("GetFamilyAdvanceSummary", "当前代买代付的首批记录，身份和备注脱敏；需要家庭数据单独授权", "/advances", "family")
    ];
    public static bool Authorized(AiToolSpec spec, AiPrivacySetting p) => p.Enabled && (spec.Name != "GetLifeSimulation" || p.AllowSummary && p.AllowPayroll) && spec.Permission switch {
        "summary" => p.AllowSummary, "details" => p.AllowDetails, "payroll" => p.AllowPayroll, "family" => p.AllowFamily, _ => false };
    public static bool SupportsAccountScope(string name) => name is "GetIncomeExpenseSummary" or "GetCategoryReport" or "GetAccountBalances" or "GetCreditCardSummary" or "GetFundStatus";
    public static JsonArray Definitions(AiPrivacySetting privacy, AiRequestContext? context = null)
    {
        var result = new JsonArray();
        foreach (var spec in Registry.Where(s => Authorized(s, privacy) && (context?.Restricted != true || SupportsAccountScope(s.Name)))) {
            var definition = new JsonObject {
            ["type"] = "function", ["function"] = new JsonObject { ["name"] = spec.Name, ["description"] = spec.Description,
                ["parameters"] = JsonNode.Parse("""
                {"type":"object","properties":{"start":{"type":"string","description":"yyyy-MM-dd (Asia/Shanghai)"},"end":{"type":"string","description":"yyyy-MM-dd，含结束日"},"currency":{"type":"string","minLength":3,"maxLength":3},"accountId":{"type":"string","description":"ID from account tool; required for card/fund queries"}},"required":["start","end","currency"],"additionalProperties":false}
                """) } };
            if (!SupportsAccountScope(spec.Name)) definition["function"]!["parameters"]!["properties"]!.AsObject().Remove("accountId");
            result.Add(definition);
        }
        return result;
    }
    public static AiQuery Validate(string name, string arguments, AiOptions options, AiPrivacySetting p)
    {
        var spec = Registry.SingleOrDefault(x => x.Name == name) ?? throw new ApiException(400, "工具未在服务端注册", "AI_TOOL_FORBIDDEN");
        if (!Authorized(spec, p)) throw new ApiException(403, "该类数据未经用户授权", "AI_TOOL_CONSENT_REQUIRED");
        if (arguments.Length > 4096) throw new ApiException(400, "工具参数过长", "AI_TOOL_ARGUMENTS_INVALID");
        JsonDocument doc;
        try { doc = JsonDocument.Parse(arguments, new JsonDocumentOptions { MaxDepth = 4 }); }
        catch (JsonException) { throw new ApiException(400, "工具参数不是有效 JSON", "AI_TOOL_ARGUMENTS_INVALID"); }
        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new ApiException(400, "工具参数必须是对象", "AI_TOOL_ARGUMENTS_INVALID");
            var fields = root.EnumerateObject().ToArray();
            if (fields.Select(x => x.Name).Distinct().Count() != fields.Length || fields.Any(x => x.Name is not ("start" or "end" or "currency" or "accountId") || x.Value.ValueKind != JsonValueKind.String))
                throw new ApiException(400, "拒绝多余、重复或无效字段（包括用户ID、SQL）", "AI_TOOL_ARGUMENTS_INVALID");
            string Read(string key) => root.TryGetProperty(key, out var node) ? node.GetString() ?? "" : "";
            var start = Read("start"); var end = Read("end"); var currency = Read("currency"); var account = Read("accountId");
            if (!DateOnly.TryParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first) ||
                !DateOnly.TryParseExact(end, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var last) || first.Year < 1901 || last.Year > 9997 ||
                last < first ||  !CurrencyDefinitions.Supports(currency) ||
                account != "" && !Guid.TryParseExact(account, "D", out _)) throw new ApiException(400, "查询日期、币种或账户参数无效", "AI_TOOL_ARGUMENTS_INVALID");
            if (name is "GetCreditCardSummary" or "GetFundStatus" && account == "") throw new ApiException(400, "需要指定已有账户", "AI_TOOL_ARGUMENTS_INVALID");
            if (name is "GetBudgetExecution" or "GetCreditCardSummary" or "GetMonthlyReview" && (first.Day != 1 || last != first.AddMonths(1).AddDays(-1)))
                throw new ApiException(400, "该工具只支持完整自然月，请修正日期", "AI_TOOL_ARGUMENTS_INVALID");
            if (name == "GetBudgetExecution" && currency != "CNY") throw new ApiException(400, "现有月度预算仅按人民币计算", "AI_TOOL_ARGUMENTS_INVALID");
            if (name is "GetPayrollSummary" or "GetPayrollCenterSummary" or "GetContributionSummary" or "GetAnnualReview" && (first.Month != 1 || first.Day != 1 || last != new DateOnly(first.Year, 12, 31)))
                throw new ApiException(400, "现有工资社保汇总仅支持完整自然年", "AI_TOOL_ARGUMENTS_INVALID");
            if (name == "GetFinancialReport" && !(first.Day == 1 && (last == first.AddMonths(1).AddDays(-1) || first.Month == 1 && last == new DateOnly(first.Year,12,31)))) throw new ApiException(400,"报告仅支持完整自然月或自然年", "AI_TOOL_ARGUMENTS_INVALID");
            return new(start, end, currency, account == "" ? null : account);
        }
    }
    public async Task<AiEvidence> Execute(string user, string name, AiQuery b, CancellationToken ct, AiRequestContext? context = null)
    {
        ct.ThrowIfCancellationRequested();
        if (context != null && context.UserId != user) throw new ApiException(403, "查询身份不一致", "AI_SCOPE_FORBIDDEN");
        if ((context?.Restricted == true || b.AccountId != null) && !SupportsAccountScope(name))
            throw new ApiException(422, "该工具暂不支持限定账户，请使用支持范围的工具", "AI_SCOPE_UNSUPPORTED");
        var scopedAccounts = context?.Resolve(b.AccountId) ?? (b.AccountId == null ? null : new[] { b.AccountId });
        if (b.AccountId != null) await finance.Account(user, b.AccountId, false);
        if (b.AccountId == null && name is "GetCreditCardSummary" or "GetFundStatus")
            throw new ApiException(400, "请明确指定一个账户", "AI_TOOL_ARGUMENTS_INVALID");
        var q = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = b.Start, ["end"] = b.End, ["currency"] = b.Currency,
            ["granularity"] = DateOnly.ParseExact(b.End, "yyyy-MM-dd").Year - DateOnly.ParseExact(b.Start, "yyyy-MM-dd").Year >= 49 ? "year" : "month", ["page"] = "1", ["pageSize"] = options.Value.MaxRecords.ToString(), ["sort"] = "occurredAt:desc", ["year"] = b.Start[..4], ["month"] = b.Start[..7], ["accountId"] = b.AccountId ?? "" });
        // The existing forecast service uses an exclusive end date. Convert the AI inclusive range once.
        if (name == "GetCashFlowForecast") q = new QueryCollection(q.ToDictionary(x => x.Key, x => x.Key == "end" ? new StringValues(DateOnly.ParseExact(b.End, "yyyy-MM-dd").AddDays(1).ToString("yyyy-MM-dd")) : x.Value));
        if (name is "GetIncomeExpenseSummary" or "GetCategoryReport" or "GetTransactions" && context?.DataAsOf is { } cutoff &&
            new DateTimeOffset(DateOnly.ParseExact(b.End, "yyyy-MM-dd").ToDateTime(TimeOnly.MaxValue), TimeSpan.FromHours(8)) > cutoff)
            q = new QueryCollection(q.ToDictionary(x => x.Key, x => x.Key == "end" ? new StringValues(cutoff.ToString("O")) : x.Value));
        object raw = name switch {
            "GetIncomeExpenseSummary" or "GetCategoryReport" => await finance.Report(user, q, scopedAccounts),
            "GetAccountBalances" => await finance.Accounts(user),
            "GetBudgetExecution" => await finance.Budget(user, b.Start[..7], context?.DataAsOf),
            "GetCreditCardSummary" => await finance.CardStatement(user, b.AccountId!, b.Start[..7]),
            "GetLoanSummary" => await finance.DebtPressure(user, q),
            "GetNetWorthReport" => await finance.NetWorthAnalysis(user, q),
            "GetInvestmentPerformance" => new { legacy = await finance.InvestmentPerformance(user, q, ct), returns = await finance.InvestmentReturnEvidence(user,b.Start,b.End,b.Currency,ct,context?.DataAsOf) },
            "GetCashFlowForecast" => await finance.CashFlowForecast(user, q, ct),
            "GetLifeSimulation" => await finance.LifeAiSimulation(user, b.Currency, ct),
            "GetPayrollSummary" => await finance.PayrollSummary(user, q),
            "GetPayrollCenterSummary" => await finance.PayrollAiCenterEvidence(user, q),
            "GetContributionSummary" => await finance.ContributionSummary(user, q),
            "GetFundStatus" => await finance.FundStatus(user, b.AccountId!),
            "GetBenefitAnalysis" => await finance.PromotionReport(user, q),
            "GetTransactions" => await finance.Transactions(user, q),
            "GetSavingsGoals" => await finance.Goals(user, q),
            "GetFinancialReport" => await finance.FinancialReportCenter(user, new(b.Start.EndsWith("01-01") && b.End.EndsWith("12-31") ? "annual" : "monthly", b.Start.EndsWith("01-01") && b.End.EndsWith("12-31") ? b.Start[..4] : b.Start[..7], b.Currency), context?.DataAsOf),
            "GetMonthlyReview" => await finance.PeriodReview(user, q, false),
            "GetAnnualReview" => await finance.PeriodReview(user, q, true),
            "GetPrepaymentSummary" => await finance.Prepayments(user, q),
            "GetFamilyAdvanceSummary" => await finance.Advances(user, q),
            _ => throw new ApiException(400, "工具不受支持", "AI_TOOL_FORBIDDEN") };
        ct.ThrowIfCancellationRequested();
        var truncated = false;
        var rawNode = JsonSerializer.SerializeToNode(raw, FinanceService.Json);
        if (name == "GetFinancialReport" && rawNode is JsonObject center) {
            foreach (var field in new[]{"merchants","tags","accounts","largeTransactions","milestones","goals"}) center.Remove(field);
        }
        if (name is "GetMonthlyReview" or "GetAnnualReview" && rawNode is JsonObject review) {
            review.Remove("importantEvents"); review.Remove("upcoming"); review.Remove("merchants"); review.Remove("frequentMerchants");
        }
        if (name == "GetCashFlowForecast" && rawNode is JsonObject forecast) { forecast.Remove("events"); forecast.Remove("unresolved"); }
        if (name == "GetBenefitAnalysis" && rawNode is JsonObject benefit) benefit.Remove("details");
        if (name is "GetPrepaymentSummary" or "GetFamilyAdvanceSummary" && rawNode is JsonObject page && page["items"] is JsonArray pageItems) {
            page["items"] = new JsonArray(pageItems.Where(a => a?["currency"]?.GetValue<string>() == b.Currency).Select(a => a?.DeepClone()).ToArray());
            // Pagination is performed by the original service before currency filtering; never imply a complete currency total.
            page["currencyFilteredAfterPaging"] = true;
        }
        if (name == "GetAccountBalances" && rawNode is JsonArray allAccounts) rawNode = new JsonArray(allAccounts.Where(a => a?["currency"]?.GetValue<string>() == b.Currency && (scopedAccounts == null || scopedAccounts.Contains(a?["id"]?.GetValue<string>()))).Select(a => a?.DeepClone()).ToArray());
        var data = Sanitize(rawNode, options.Value.MaxRecords, ref truncated);
        if (name == "GetFinancialReport" && rawNode?["categories"] is JsonArray centerCategories && data is JsonObject centerData)
            centerData["categories"] = new JsonArray(centerCategories.OrderBy(c => c?["parentId"] == null ? 0 : 1).Take(options.Value.MaxRecords).Select(c => new JsonObject {
                ["id"] = c?["id"]?.DeepClone(), ["parentId"] = c?["parentId"]?.DeepClone(), ["label"] = AiPrivacyText.Sanitize((c?["name"]?.ToString() ?? "")[..Math.Min(100, (c?["name"]?.ToString() ?? "").Length)]), ["amount"] = c?["amount"]?.DeepClone() }).ToArray());
        if (name is "GetIncomeExpenseSummary" or "GetCategoryReport" && rawNode?["categories"] is JsonArray categoryRows && data is JsonObject report)
            report["categories"] = new JsonArray(categoryRows.Take(options.Value.MaxRecords).Select(c => new JsonObject {
                ["categoryId"] = c?["categoryId"]?.DeepClone(), ["label"] = AiPrivacyText.Sanitize((c?["name"]?.GetValue<string>() ?? "")[..Math.Min(100, (c?["name"]?.GetValue<string>() ?? "").Length)]),
                ["amount"] = c?["amount"]?.DeepClone(), ["share"] = c?["share"]?.DeepClone() }).ToArray());
        if (data?.ToJsonString().Length > 64_000) throw new ApiException(400, "工具结果过大，请缩小范围", "AI_TOOL_RESULT_TOO_LARGE");
        var rules = await finance.Rules(user);
        var spec = Registry.Single(x => x.Name == name);
        var scope = $"仅当前认证用户；原币统计不自动折算；手续费={rules.IncludeFees}，资产损失={rules.IncludeAssetLoss}，减少调整={rules.IncludeDecreasingAdjustments}；沿用现有领域服务口径。备注、姓名及商户已剔除；分类标签属于不可信数据。";
        if (name == "GetPayrollCenterSummary") scope += "仅已确认工资；未录入月份不能视为实际零收入。工资归属月份与发薪月份不同；个人和单位缴费分别展示。模拟基于保存时的规则及假设，不代表依法申报结果。";
        if (name is "GetAccountBalances" or "GetFundStatus") scope += "余额为查询时当前值，不是请求期间历史余额。";
        if (name == "GetCashFlowForecast" && rawNode?["sampled"]?.GetValue<bool>() == true) scope += "长期图表按非零事件日及均匀日期采样，缺口日期不是全量清单；汇总、期末与最低余额为完整事件计算。";
        if (name == "GetLoanSummary") scope += "读取全部活动还款计划，日期参数不筛选；不是全部负债。";
        if (name == "GetBenefitAnalysis") scope += "使用额按期间；未使用权益是当前快照。";
        if (name is "GetSavingsGoals" or "GetPrepaymentSummary" or "GetFamilyAdvanceSummary") scope += "当前快照，日期参数不筛选。明细只含第一批，不是全部记录；押金和预留不重复计资产。";
        if (name == "GetFinancialReport") scope += "仅自然月或自然年，未结束期间截至生成时点；历史净资产为推算。分类父子不可相加；异常阈值为max(1000,消费中位数的3倍)，只提示金额，不判定原因。规划是历史月均及当前目标参考，不代表未来事实。";
        if (name is "GetMonthlyReview" or "GetAnnualReview") scope += "包含原服务上期对比；历史余额为现有服务推算，待办是当前计划，不是历史发生事项。";
        if (rawNode is JsonObject pageResult && pageResult["items"] is JsonArray returnedItems && pageResult["page"] != null && pageResult["pageSize"] != null && pageResult["total"] != null)
            scope += $"仅返回第{pageResult["page"]}页，每页最多{pageResult["pageSize"]}条；本页返回{Math.Min(returnedItems.Count, options.Value.MaxRecords)}条，原服务匹配总记录数{pageResult["total"]}。";
        if (name == "GetTransactions") scope += "按发生时间降序、同时间按记录ID升序；日期包含结束日。";
        if (truncated) scope += "结果已截断，不可将本页明细视为全部记录或据此重新计算期间总额。";
        var method = name switch {
            "GetFinancialReport" => "FinancialReportCenter",
            "GetIncomeExpenseSummary" or "GetCategoryReport" => "Report", "GetAccountBalances" => "Accounts", "GetBudgetExecution" => "Budget",
            "GetCreditCardSummary" => "CardStatement", "GetLoanSummary" => "DebtPressure", "GetNetWorthReport" => "NetWorthAnalysis",
            "GetInvestmentPerformance" => "InvestmentPerformance", "GetCashFlowForecast" => "CashFlowForecast", "GetPayrollSummary" or "GetPayrollCenterSummary" => "PayrollSummary",
            "GetContributionSummary" => "ContributionSummary", "GetFundStatus" => "FundStatus", "GetBenefitAnalysis" => "PromotionReport",
            "GetTransactions" => "Transactions", "GetSavingsGoals" => "Goals", "GetMonthlyReview" or "GetAnnualReview" => "PeriodReview",
            "GetPrepaymentSummary" => "Prepayments", "GetFamilyAdvanceSummary" => "Advances", _ => "Unknown" };
        scope += context?.Restricted == true || b.AccountId != null ? "当前为明确限定的账户范围，不包含其他账户。" : "当前为该用户个人账本范围。";
        var link = spec.Link + (b.AccountId == null ? "" : "?accountId=" + Uri.EscapeDataString(b.AccountId));
        return new(name, b.Start, b.End, b.Currency, scope, "FinanceService." + method, link, DateTimeOffset.UtcNow, data, truncated, scopedAccounts, context?.RequestId);
    }
    // Explicit string field allowlist. Never pass notes, merchants, contract/card numbers, names or raw provider data.
    private static readonly HashSet<string> TextFields = new(StringComparer.OrdinalIgnoreCase) {"modelVersion", "fingerprint", "firstShortfall", "priceBase", "ruleVersion", "policyVersion", "policyRegion", "category", "scenario", "balanceSource", "id", "version", "accountId", "categoryId", "currency", "type", "kind", "state", "status", "month", "period", "date", "start", "end", "occurredAt", "dueDate", "statementDate", "cycleStart", "minimumDate", "valuationDate", "estimatedPayoffDate", "calculatedAt", "endExclusive", "rule", "scope", "limitation", "sample", "fundStatusRule", "cumulativeRule", "assumptions", "samplingRule", "granularity", "excludedCurrencies" };
    private static readonly string[] NumericFields = ["threshold", "closing", "change", "commitment","bonus", "social", "housing", "basepay", "performance", "actual", "difference", "mom", "yoy","amount", "balance", "income", "expense", "asset", "liabilit", "worth", "principal", "interest", "fee", "cost", "budget", "saving", "reserve", "hold", "paid", "payable", "receivable", "repay", "repaid", "minimum", "maximum", "value", "price", "tax", "deduct", "contribution", "salary", "gross", "net", "capital", "surplus", "return", "profit", "gain", "loss", "quantity", "share", "percent", "rate", "average", "total", "opening", "ending", "available", "withdrawal", "deposit", "current", "planned", "projected", "cash", "flow", "expected", "count", "bill", "purchase", "refund", "credit", "limit", "used", "remaining"];
    public static bool FinancialNumber(string field, string text) => NumericFields.Any(key => field.Contains(key, StringComparison.OrdinalIgnoreCase)) &&
        !field.EndsWith("Id", StringComparison.OrdinalIgnoreCase) && !field.Contains("name", StringComparison.OrdinalIgnoreCase) &&
        decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _);
    public static JsonNode? Sanitize(JsonNode? node, int limit, ref bool truncated, string field = "")
    {
        if (node is JsonObject obj) { var result = new JsonObject();
            // Services already page their results before sanitization, so the array can be at the
            // limit even when many matching rows were omitted by the database query.
            if (obj["items"] is JsonArray pageItems && obj["page"] is JsonValue pageValue && pageValue.TryGetValue<int>(out var page) &&
                obj["pageSize"] is JsonValue sizeValue && sizeValue.TryGetValue<int>(out _) && obj["total"] is JsonValue totalValue && totalValue.TryGetValue<int>(out var total) &&
                (total > pageItems.Count || page > 1 && total > 0)) truncated = true;
            foreach (var pair in obj) {
            if(pair.Key.Equals("accountBalances",StringComparison.OrdinalIgnoreCase))continue;
            if (pair.Key.Contains("note", StringComparison.OrdinalIgnoreCase) || pair.Key.Contains("name", StringComparison.OrdinalIgnoreCase) || pair.Key.Contains("merchant", StringComparison.OrdinalIgnoreCase) || pair.Key.Contains("number", StringComparison.OrdinalIgnoreCase)) continue;
            if (new[] { "password", "cvv", "cvc", "phone", "email", "secret", "token", "apikey" }.Any(key => pair.Key.Contains(key, StringComparison.OrdinalIgnoreCase))) continue;
            var value = Sanitize(pair.Value, limit, ref truncated, pair.Key); if (value != null) result[pair.Key] = value; } return result; }
        if (node is JsonArray array) { if (array.Count > limit) truncated = true; var result = new JsonArray(); foreach (var value in array.Take(limit)) result.Add(Sanitize(value, limit, ref truncated, field)); return result; }
        if (node is JsonValue v) {
            if (v.TryGetValue<string>(out var text)) {
                if (text.Length > 2000) return null;
                if (NumericFields.Any(key => field.Contains(key, StringComparison.OrdinalIgnoreCase)) && !field.EndsWith("Id", StringComparison.OrdinalIgnoreCase) &&
                    decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _)) return JsonValue.Create(text);
                if (TextFields.Contains(field) || field is "method" or "explanation" or "calculationId" or "originalCurrency" or "exchangeAttributionStatus") return JsonValue.Create(AiPrivacyText.Sanitize(text));
                return null;
            } return node.DeepClone(); }
        return null;
    }
}

