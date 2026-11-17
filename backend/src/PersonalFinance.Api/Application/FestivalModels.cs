using System.Globalization;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record FestivalPurchase(string Id, string Name, string Recipient, string Amount, string State,
    string Category = "Gift", string? TransactionId = null, string? Url = null, DateOnly? Deadline = null, string Note = "");
public sealed record FestivalInput(string Name, DateOnly StartsOn, DateOnly EndsOn, string Currency, string Budget, string State,
    string Note, FestivalPurchase[] Purchases, string Kind = "Personal", string Definition = "custom", DateOnly? PrepareOn = null,
    FestivalCategoryBudget[]? Categories = null, int[]? ReminderDays = null, bool Hidden = false, string Recurrence = "Once", string Region = "CN",
    decimal SavingTarget = 0, decimal Reserved = 0);
public sealed record FestivalCategoryBudget(string Category, string Amount);
public sealed record FestivalAllocation(string TransactionId, string Amount, string Category = "Other", string? EntryId = null,
    string? PurchaseId = null, decimal Rate = 1, DateOnly? RateDate = null, string RateSource = "SameCurrency", string Note = "");
public sealed record FestivalAllocationRecord(FestivalAllocation Input, bool Revoked = false, string? OriginalCurrency = null);
public sealed record FestivalReview(int? Satisfaction, string Note);
public sealed record FestivalRecipient(string Name, string Relationship, string Preferences, string Avoid, string Currency, string MinBudget, string MaxBudget);
public static class FestivalRules
{
    public static readonly string[] States = ["Planning", "Preparing", "Active", "Review", "Completed", "Cancelled"];
    public static readonly string[] PurchaseStates = ["Idea", "Comparing", "PendingApproval", "Approved", "Purchased", "Delivered", "Cancelled", "Returned"];
    public static decimal Amount(string? value) { var amount = FinanceService.Money(value); FinanceService.Require(amount >= 0 && amount <= 1_000_000_000_000m, "金额须为0至一万亿元，最多两位小数"); return amount; }
    public static void Validate(FestivalInput b)
    {
        FinanceService.Require(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 100 && b.Note != null && b.Note.Length <= 2000, "名称或备注无效");
        FinanceService.Require(b.StartsOn.Year is >= 1901 and <= 2100 && b.EndsOn >= b.StartsOn && b.EndsOn <= b.StartsOn.AddYears(1) && (b.PrepareOn == null || b.PrepareOn <= b.StartsOn), "日期范围无效");
        FinanceService.Require(CurrencyDefinitions.Supports(b.Currency) && States.Contains(b.State) && new[] { "Traditional", "International", "Shopping", "Personal" }.Contains(b.Kind) && new[] { "Once", "Yearly" }.Contains(b.Recurrence), "币种、类型或状态无效");
        Amount(b.Budget); FinanceService.Require(b.Definition != null && b.Definition.Length <= 100 && b.Region != null && b.Region.Length <= 50, "节日定义或地区无效");
        FinanceService.Require(b.SavingTarget >= 0 && b.Reserved >= 0 && b.Reserved <= b.SavingTarget && b.SavingTarget <= 1_000_000_000_000m, "储蓄计划金额无效");
        FinanceService.Require(b.Purchases != null && b.Purchases.Length <= 200 && b.Purchases.All(x => x != null), "采购最多200项");
        FinanceService.Require(b.Purchases!.Select(x => x.Id).Distinct().Count() == b.Purchases!.Length, "采购编号重复");
        foreach (var p in b.Purchases) {
            FinanceService.Require(Guid.TryParseExact(p.Id, "D", out _) && !string.IsNullOrWhiteSpace(p.Name) && p.Name.Length <= 100 && p.Recipient != null && p.Recipient.Length <= 100 && p.Note != null && p.Note.Length <= 2000 && !string.IsNullOrWhiteSpace(p.Category) && p.Category.Length <= 80 && PurchaseStates.Contains(p.State), "采购信息无效"); Amount(p.Amount);
            FinanceService.Require(p.Url == null || p.Url.Length <= 2000 && Uri.TryCreate(p.Url, UriKind.Absolute, out var url) && url.Scheme is "https" or "http", "商品链接无效");
        }
        var categories = b.Categories ?? []; FinanceService.Require(categories.Length <= 30 && categories.All(x => x != null && !string.IsNullOrWhiteSpace(x.Category) && x.Category.Length <= 80) && categories.Select(x => x.Category).Distinct().Count() == categories.Length, "预算分类无效");
        FinanceService.Require(categories.Sum(x => Amount(x.Amount)) <= Amount(b.Budget), "分类预算合计超过总预算");
        FinanceService.Require((b.ReminderDays ?? []).Length <= 10 && (b.ReminderDays ?? []).All(x => x is >= 0 and <= 365), "提醒日期无效");
    }
    public static DateOnly Lunar(int year, int month, int day, bool leap = false)
    {
        var cal = new ChineseLunisolarCalendar(); var leapMonth = cal.GetLeapMonth(year);
        FinanceService.Require(!leap || leapMonth == month + 1, "该年没有指定农历闰月");
        var actualMonth = month + (leap ? 1 : leapMonth > 0 && month >= leapMonth ? 1 : 0);
        return DateOnly.FromDateTime(cal.ToDateTime(year, actualMonth, day, 0, 0, 0, 0));
    }
    public static DateOnly Weekday(int year, int month, DayOfWeek weekday, int nth) {
        var first = new DateOnly(year, month, 1); return first.AddDays(((int)weekday - (int)first.DayOfWeek + 7) % 7 + 7 * (nth - 1));
    }
    public static object[] Definitions(int year) {
        FinanceService.Require(year is >= 1902 and <= 2100, "节日模板支持1902至2100年");
        var list = new List<object>();
        void Add(string id, string name, string kind, DateOnly date, string rule, string region = "CN") => list.Add(new { id, name, kind, date, rule, region });
        foreach (var x in new[] { ("spring", "春节",1,1), ("lantern","元宵节",1,15), ("dragon","端午节",5,5), ("qixi","七夕",7,7), ("autumn","中秋节",8,15), ("double-nine","重阳节",9,9) }) Add(x.Item1,x.Item2,"Traditional",Lunar(year,x.Item3,x.Item4),"Lunar");
        foreach (var x in new[] { ("new-year","元旦",1,1), ("valentine","情人节",2,14), ("halloween","万圣节",10,31), ("christmas","圣诞节",12,25), ("618","618",6,18), ("1111","双十一",11,11), ("1212","双十二",12,12) }) Add(x.Item1,x.Item2,x.Item1 is "618" or "1111" or "1212" ? "Shopping":"International",new(year,x.Item3,x.Item4),"Solar");
        var thanks = Weekday(year,11,DayOfWeek.Thursday,4); Add("thanksgiving-us","感恩节（美国）","International",thanks,"FourthThursday","US"); Add("black-friday","黑色星期五","Shopping",thanks.AddDays(1),"AfterUSThanksgiving","US");
        return list.ToArray(); // 清明按太阳黄经确定，未接入可靠历表前由用户明确录入。
    }
}


