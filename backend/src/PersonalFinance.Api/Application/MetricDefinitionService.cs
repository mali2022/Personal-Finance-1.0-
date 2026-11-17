using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record MetricDefinition(string Id, string Name, string Explanation, string Formula, string Source, string Limitation,
    string[] Currencies, string TimeBasis, string RefundTreatment, string FeeTreatment, string AdjustmentTreatment, string RuleVersion);
public sealed partial class FinanceService
{
    public static readonly string SavingsFormula = "（统计收入−统计支出）÷统计收入×100%；收入不为正时不适用";
    public static MetricDefinition[] MetricDefinitions() {
        MetricDefinition Define(string id, string name, string formula, string source, string limit) => new(id, name, name + "按当前筛选范围及所选币种计算", formula, source, limit,
            CurrencyDefinitions.Items.Select(x=>x.Code).ToArray(), "业务时区Asia/Shanghai；期间为[start,endExclusive)，余额使用指定时点", "退款按到账日期冲减统计支出及原消费分类；不截断负净费用", "统计费用遵循IncludeFees；已发生费用与未来计划分离", "统计资产损失及调减遵循已有开关；资产估值与现金收入分离", "ledger-statistics-v1");
        return [
            Define("income", "统计收入", "Income分录的负数之和", "真实Income分录", "不包括内部转账、借贷本金及报销本金"),
            Define("expense", "统计支出", "Expense分录合计+已启用的资产损失及余额调减", "Totals/StatisticsRules", "按用户统计开关；不包含未来费用"),
            Define("net-expense", "净支出", "消费及费用−到账退款+启用的其他统计费用", "与统计支出同一口径", "允许负值"),
            Define("monthly-surplus", "月度结余", "统计收入−统计支出", "统一Totals", "是统计结余，不等于账户现金变化"),
            Define("annual-surplus", "年度结余", "年度统计收入−年度统计支出", "统一Totals", "未结束年度为已发生部分；不证明记录完整"),
            Define("savings-rate", "储蓄率", SavingsFormula, "统一Totals", "收入非正时不适用"),
            Define("budget-execution", "预算执行率", "统计净支出÷有效预算×100%", "既有预算及结转", "预算为零或未配置时不适用；当前预算首版CNY"),
            Define("fixed-expense-share", "固定支出占比", "固定净支出÷统计净支出×100%", "TransactionAnalysisAttribute与费用分录", "未归类单列；净总支出非正时不适用；固定不等于必要"),
            Define("assets", "资产", "所选币种账户正余额之和", "既有Worth与账户分录", "不含虚构投资市值；历史期初生效日期缺失时推算"),
            Define("liabilities", "负债", "所选币种账户负余额绝对值之和", "既有Worth与账户分录", "未来计划不新增负债；分期本金不得重复相加"),
            Define("net-worth", "净资产", "资产−负债", "既有Worth", "币种不合并；历史余额可信性另行说明"),
            Define("net-worth-change", "净资产变化额", "期末净资产−期初净资产", "时点余额与账户分录", "账户期初更正及新增缺少历史证据时不能视为完整真实归因"),
            Define("emergency-coverage", "应急金覆盖月数", "明确选中目标的可用应急预留÷平均必要月支出", "阶段D EmergencyFund", "必须明确目标、范围和必要性；分母非正时不适用"),
            Define("credit-outstanding", "信用卡未偿余额", "信用卡负余额绝对值；溢缴款单列资产", "既有信用卡账户及账单API", "账单剩余与当前全部欠款是不同时间口径"),
            Define("loan-principal", "借贷剩余本金", "原始本金−有效实际本金归还", "既有Business与归还记录", "本金与利息分离；计划不改变实际本金")
        ];
    }
    public async Task<object> MetricDetails(string user, IQueryCollection query)
    {
        var id = query["metricId"].ToString(); var definition = MetricDefinitions().SingleOrDefault(x => x.Id == id) ?? throw new ApiException(404, "指标不存在");
        object? details = id == "savings-rate" ? await SavingsRate(user, query) : id is "net-worth" or "net-worth-change" or "assets" or "liabilities" ? await NetWorthAnalysis(user, query) : id == "emergency-coverage" ? await EmergencyFund(user, query) : null;
        if (details == null) {
            var (start, end) = IndicatorRange(query); var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
            var totals = await Totals(user, Range(user, start, end.AddTicks(-1), currency));
            details = new { currency, start, endExclusive = end, income = M(totals.income), expense = M(totals.expense), surplus = M(totals.income - totals.expense), reason = "业务专项指标请在原预算、信用卡或借贷页面选择相应资源；这里仅提供统一收支数据，不伪造未选资源的分子分母。" };
        }
        return new { definition, details };
    }
}
