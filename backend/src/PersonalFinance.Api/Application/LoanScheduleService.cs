using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record LoanScheduleOverride(int Sequence, string? Principal = null, string? Interest = null, string? OverdueInterest = null, DateOnly? PaidDate = null);
public sealed record LoanScheduleInput(string Name, string Principal, DateOnly BorrowDate, DateOnly FirstDate, int Periods, decimal AnnualRate, decimal OverdueDailyRate, string Mode, LoanScheduleOverride[] Overrides, string Note = "");
public sealed record LoanScheduleRow(int Sequence, DateOnly Date, decimal Principal, decimal Interest, decimal OverdueInterest, decimal Total, decimal RemainingPrincipal, DateOnly? PaidDate, int OverdueDays, string Status);

public static class LoanScheduleMath
{
    public static decimal Amount(string value)
    {
        FinanceService.Require(value != null && System.Text.RegularExpressions.Regex.IsMatch(value, @"^\d{1,12}(\.\d{1,2})?$") && decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _), "金额须为非负数，最多两位小数");
        return decimal.Parse(value!, CultureInfo.InvariantCulture);
    }
    public static LoanScheduleRow[] Generate(LoanScheduleInput input, DateOnly today)
    {
        var principal = Amount(input.Principal);
        FinanceService.Require(principal > 0 && input.Periods is >= 1 and <= 600 && input.AnnualRate is >= 0 and <= 100 && input.OverdueDailyRate is >= 0 and <= 100, "本金、期数或利率无效");
        FinanceService.Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.Note is { Length: <= 2000 }, "请填写计划名称，备注最多2000字");
        FinanceService.Require(input.BorrowDate.Year is >= 1900 and <= 9900 && input.FirstDate >= input.BorrowDate && input.FirstDate.Year <= 9900, "首期还款日不能早于借款日");
        FinanceService.Require(input.Mode is "EqualPayment" or "EqualPrincipal" or "InterestOnly", "还款方式无效");
        FinanceService.Require(input.Overrides != null && input.Overrides.Length <= input.Periods && input.Overrides.All(x => x.Sequence >= 1 && x.Sequence <= input.Periods) && input.Overrides.Select(x => x.Sequence).Distinct().Count() == input.Overrides.Length, "逐期修改的期数无效或重复");
        var changes = input.Overrides!.ToDictionary(x => x.Sequence);
        decimal Round(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);
        var rate = input.AnnualRate / 1200m;
        var factor = 1m;
        for (var i = 0; i < input.Periods; i++) factor *= 1 + rate;
        var payment = rate == 0 ? principal / input.Periods : principal * (rate / (1 - 1 / factor));
        var remaining = principal;
        var rows = new List<LoanScheduleRow>();
        for (var i = 1; i <= input.Periods; i++)
        {
            changes.TryGetValue(i, out var change);
            var date = input.FirstDate.AddMonths(i - 1);
            FinanceService.Require(change?.PaidDate == null || change.PaidDate >= input.BorrowDate && change.PaidDate <= today, "实还日期须在借款日至今天之间");
            var interest = change?.Interest == null ? Round(remaining * rate) : Amount(change.Interest);
            var calculated = input.Mode == "InterestOnly" ? 0 : input.Mode == "EqualPrincipal" ? Round(principal / input.Periods) : Math.Max(0, Round(payment) - Round(remaining * rate));
            var part = change?.Principal == null ? i == input.Periods ? remaining : Math.Min(remaining, calculated) : Amount(change.Principal);
            FinanceService.Require(part <= remaining, "各期本金累计不能超过借款本金");
            remaining -= part;
            var days = Math.Max(0, (change?.PaidDate ?? today).DayNumber - date.DayNumber);
            var overdue = change?.OverdueInterest == null ? Round(part * input.OverdueDailyRate / 100m * days) : Amount(change.OverdueInterest);
            var status = change?.PaidDate != null ? days > 0 ? "逾期已还" : "已还" : days > 0 ? "逾期" : "待还";
            rows.Add(new(i, date, part, interest, overdue, part + interest + overdue, remaining, change?.PaidDate, days, status));
        }
        FinanceService.Require(remaining == 0, "各期本金合计必须等于借款本金，请调整最后一期或清除该期本金修改");
        return rows.ToArray();
    }
}

public sealed partial class FinanceService
{
    private const string LoanScheduleKind = "LoanSchedule";
    private static DateOnly LoanToday() => DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
    public object PreviewLoanSchedule(LoanScheduleInput input) => LoanScheduleMath.Generate(input, LoanToday());
    public async Task<object> LoanSchedules(string user)
    {
        var docs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == LoanScheduleKind).OrderByDescending(x => x.CreatedAt).ToArrayAsync();
        return docs.Select(x => new { x.Id, version = x.Version.ToString(), input = JsonSerializer.Deserialize<LoanScheduleInput>(x.Content, Json) }).ToArray();
    }
    public async Task<object> LoanScheduleDetail(string user, string id)
    {
        var doc = await Document(user, id, LoanScheduleKind);
        var input = JsonSerializer.Deserialize<LoanScheduleInput>(doc.Content, Json)!;
        return new { doc.Id, version = doc.Version.ToString(), input, schedule = LoanScheduleMath.Generate(input, LoanToday()) };
    }
    public async Task<object> SaveLoanSchedule(string user, string? id, LoanScheduleInput input, string? version)
    {
        LoanScheduleMath.Generate(input, LoanToday());
        var doc = id == null ? new StoredDocument { UserId = user, Kind = LoanScheduleKind, ContentType = "application/json" } : await Document(user, id, LoanScheduleKind);
        if (id == null) { Require(version == "0", "新计划版本应为0"); db.Documents.Add(doc); }
        else { Version(doc, version); doc.Version++; }
        doc.Name = input.Name.Trim();
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(input with { Name = doc.Name }, Json);
        return new { doc.Id, version = doc.Version.ToString() };
    }
}

public static class LoanScheduleEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/loan-schedules", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LoanSchedules(FinanceEndpoints.User(c))));
        api.MapGet("/loan-schedules/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LoanScheduleDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/loan-schedules/preview", (LoanScheduleInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, f.PreviewLoanSchedule(b)));
        api.MapPost("/loan-schedules", async (LoanScheduleInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveLoanSchedule(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/loan-schedules/{id}", async (string id, LoanScheduleInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveLoanSchedule(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
    }
}
