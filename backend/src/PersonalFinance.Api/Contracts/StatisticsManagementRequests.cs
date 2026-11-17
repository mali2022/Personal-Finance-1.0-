namespace PersonalFinance.Api.Contracts;

// These options govern the policy analysis. The three LedgerRules also govern existing reports.
public sealed record StatisticsManagementOptions(
    string Mode = "Everyday",
    string BaseCurrency = "CNY",
    int MonthStartDay = 1,
    int YearStartMonth = 1,
    int WeekStartsOn = 1,
    string RefundDisplay = "Net",
    bool IncludeCashRewards = true,
    bool IncludeDepositInterest = true,
    bool IncludeInvestmentCashIncome = true,
    bool IncludeOneTimeIncomeInSavings = true,
    string PayrollBasis = "Net",
    string PayrollTimeBasis = "Paid",
    bool ShowAccountFlows = true,
    bool ShowDebtAnalysis = true,
    bool ShowInvestmentAnalysis = false,
    bool ShowWealthAnalysis = false,
    bool HighlightLargeTransactions = true,
    string LargeTransactionThreshold = "1000.00");

public sealed record StatisticsManagementInput(StatisticsManagementOptions Options, RulesInput LedgerRules, string LedgerVersion);
public sealed record StatisticsManagementPreview(StatisticsManagementOptions Options, RulesInput LedgerRules,
    string Anchor, string Period = "month", string? Currency = null);
