using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using Xunit;

[Collection("Finance SQL")]
public sealed class PeriodReviewReuseSqlTests
{
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);

    [DeletionSqlFact]
    public async Task ReviewReuseEqualsIndependentReportsForClosedAndPartialYears()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account();
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        foreach (var year in new[] { now.Year - 1, now.Year }) {
            var start = new DateTimeOffset(year, 1, 1, 0, 0, 0, TimeSpan.FromHours(8));
            f.Expense(account).OccurredAt = start.AddDays(1);
            f.Expense(account).OccurredAt = start.AddYears(1).AddHours(-1);
        }
        await f.Db.SaveChangesAsync();
        foreach (var year in new[] { now.Year - 1, now.Year }) {
            var actual = Json(await f.Service.PeriodReview(f.User, new QueryCollection(new Dictionary<string,StringValues> {
                ["year"] = year.ToString(), ["currency"] = "CNY"
            }), true));
            Assert.Equal(Json(await f.Service.AnnualBudgetDetail(f.User, year)).GetRawText(), actual.GetProperty("budget").GetRawText());
            var review = actual.GetProperty("review");
            var query = new QueryCollection(new Dictionary<string,StringValues> {
                ["currency"] = "CNY",
                ["start"] = actual.GetProperty("start").GetDateTimeOffset().ToString("yyyy-MM-dd"),
                ["end"] = actual.GetProperty("endExclusive").GetDateTimeOffset().AddDays(-1).ToString("yyyy-MM-dd"),
                ["comparisonStart"] = review.GetProperty("comparisonStart").GetDateTimeOffset().ToString("yyyy-MM-dd"),
                ["comparisonEndExclusive"] = review.GetProperty("comparisonEndExclusive").GetDateTimeOffset().ToString("yyyy-MM-dd")
            });
            Assert.Equal(Json(await f.Service.FinancialReview(f.User, query)).GetRawText(), review.GetRawText());
        }
    }
}
