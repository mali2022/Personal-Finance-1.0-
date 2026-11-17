using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public partial class ConcertTests
{
    [Theory]
    [InlineData("Paid", "Used", "order")]
    [InlineData("Cancelled", "Paid", "order")]
    [InlineData("None", "Full", "refund")]
    [InlineData("Attended", "Queuing", "scene")]
    public void IllegalStateJumpsAreRejected(string from, string to, string kind) => Assert.Throws<ApiException>(() => ConcertRules.Transition(from, to, kind));
    [Fact] public void OrderDiscountNeverBecomesIncomeAndFeeIsNotCountedTwice()
    {
        var b = Scene() with { Orders = [Order() with { PaymentTransactionId = "payment", PaidAmount = "180", Fee = "5" }] };
        var costs = ConcertRules.EffectiveCosts(b); Assert.Equal(180, costs.Sum(x => ConcertRules.Amount(x.Amount))); Assert.Equal(175, ConcertRules.Amount(costs.Single(x => x.Category == "Ticket").Amount));
    }
    [Fact] public void CombinedOrderKeepsOriginalPaymentComponentsWithoutDuplicatingFees()
    {
        var b = Scene() with { Orders = [Order() with { PaidAmount = "100", Fee = "2", PaymentParts = [new("own", "40", "2"), new("advance", "60", "0")] }] };
        var costs = ConcertRules.EffectiveCosts(b); Assert.Equal(100, costs.Sum(x => ConcertRules.Amount(x.Amount))); Assert.Equal(40, costs.Where(x => x.TransactionId == "own").Sum(x => ConcertRules.Amount(x.Amount))); Assert.Equal(60, costs.Where(x => x.TransactionId == "advance").Sum(x => ConcertRules.Amount(x.Amount)));
    }
    static ConcertInput Scene() => new("艺人", "巡演", null, "上海场", new DateTimeOffset(2026, 1, 20, 19, 30, 0, TimeSpan.FromHours(8)), "上海", "测试场馆", "SH-01", "主办方", "平台甲", "CNY", "1000", 2, 0, "", "Planning", [], [new("Ticket", "500"), new("Transport", "100")], [], [], [], [], []);
    static ConcertOrder Order() => new(Guid.NewGuid().ToString(), "平台甲", "A-0001", new(2026, 1, 1), null, "100", 2, "0", "0", "内场", "A区", "昵称", "Planning", "None", null, []);
    sealed class Factory(string connection, ConcertPaginationTrace? trace = null) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b) {
            b.UseEnvironment("Development"); b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('C', 64), ["DataProtection:KeyPath"] = Path.Combine(Path.GetTempPath(), "pf-concert-test-keys") }));
            b.ConfigureServices(s => { s.RemoveAll<DbContextOptions<FinanceDb>>(); s.AddDbContext<FinanceDb>(o => {
                o.UseSqlServer(connection); if(trace != null) o.AddInterceptors(trace.Commands,trace.Connections);
            }); s.RemoveAll<IHostedService>(); s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('C', 64))));
            if(trace != null) {
                s.AddSingleton<IStartupFilter>(trace);
                s.AddLogging(logging => logging.AddProvider(trace).AddFilter<ConcertPaginationTrace>("Microsoft.AspNetCore.Routing.EndpointMiddleware",LogLevel.Information).AddFilter<ConcertPaginationTrace>("Microsoft.AspNetCore.Http.Result",LogLevel.Information));
                s.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => {
                    var received=o.Events.OnMessageReceived; var validated=o.Events.OnTokenValidated;
                    o.Events.OnMessageReceived=async context=>{trace.Mark("auth.start");await received(context);};
                    o.Events.OnTokenValidated=async context=>{trace.Mark("auth.token-valid");await validated(context);trace.Mark("auth.session-checked");};
                });
            }
            });
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r) { var raw = await r.Content.ReadAsStringAsync(); Assert.True(r.IsSuccessStatusCode, $"HTTP {(int)r.StatusCode}: {raw}"); return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone(); }
    static Task<HttpResponseMessage> Write(HttpClient c, string path, object input, string version = "0", string? key = null, bool put = false) {
        var r = new HttpRequestMessage(put ? HttpMethod.Put : HttpMethod.Post, "/api" + path) { Content = JsonContent.Create(input) }; r.Headers.TryAddWithoutValidation("If-Match", version); r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return c.SendAsync(r);
    }
    [ProfileSqlFact] public async Task OptionalModuleLifecycleChecksOwnershipAllocationsRefundsAuditAttachmentsAndNeverInventsCash()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString(); await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Concert-Test-" + Guid.NewGuid().ToString("N"); AppUser User() { var u = new AppUser { Email = Guid.NewGuid().ToString("N") + "@concert.test", DisplayName = "Concert test" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u, password); db.Add(u); return u; }
        var user = User(); var other = User(); var cash = new Account { UserId = user.Id, Name = "现金", Type = "Cash", Currency = "CNY", OpeningBalance = 10000 }; var parent = new Category { UserId = user.Id, Name = "娱乐", Kind = "Expense" }; var cat = new Category { UserId = user.Id, Name = "演出票", Kind = "Expense", ParentId = parent.Id }; db.AddRange(cash, parent, cat); await db.SaveChangesAsync();
        using var factory = new Factory(connection); using var client = factory.CreateClient(); using var stranger = factory.CreateClient();
        foreach (var pair in new[] { (client, user), (stranger, other) }) { var login = await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login", new { email = pair.Item2.Email, password })); pair.Item1.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString()); }
        Assert.False((await Data(await client.GetAsync("/api/settings/modules"))).GetProperty("concerts").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/concerts")).StatusCode);
        var prefs = await Data(await Write(client, "/settings/modules", new ConcertModules(true), put: true)); var prefVersion = prefs.GetProperty("version").GetString()!;
        await Data(await Write(stranger, "/settings/modules", new ConcertModules(true), put: true));
        var empty = await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=USD")); Assert.Equal(0, empty.GetProperty("count").GetInt32());
        var scene = Scene(); var order = Order(); scene = scene with { Orders = [order] }; var key = Guid.NewGuid().ToString(); var created = await Data(await Write(client, "/concerts", scene, key: key)); var id = created.GetProperty("id").GetString()!; var version = created.GetProperty("version").GetString()!;
        Assert.Equal(id, (await Data(await Write(client, "/concerts", scene, key: key))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/concerts/" + id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(stranger, "/concerts/" + id, scene, version, put: true)).StatusCode);
        var count = await db.Transactions.CountAsync();
        async Task Save(ConcertInput next) { var saved = await Data(await Write(client, "/concerts/" + id, next, version, put: true)); version = saved.GetProperty("version").GetString()!; scene = next; }
        order = order with { State = "Queuing" }; await Save(scene with { State = "Queuing", Orders = [order] });
        order = order with { State = "PendingPayment" }; await Save(scene with { Orders = [order] });
        Assert.Equal(count, await db.Transactions.CountAsync());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { Orders = [order with { State = "Paid" }] }, version, put: true)).StatusCode);
        var expense = await Data(await Write(client, "/transactions/expense", new SaveTransaction("Expense", "300", cash.Id, new(2026, 1, 1, 10, 0, 0, TimeSpan.FromHours(8)), CategoryId: cat.Id)));
        var tx = expense.GetProperty("id").GetString()!;
        Assert.Equal(1, (await Data(await client.GetAsync("/api/concerts/transactions?currency=CNY&keyword=" + tx))).GetArrayLength());
        order = order with { State = "Paid", PaymentTransactionId = tx, PaidOn = new(2026, 1, 1), PaidAmount = "180", Fee = "5" }; await Save(scene with { State = "Ticketed", Orders = [order] });
        var detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("180.00", detail.GetProperty("report").GetProperty("originalCosts").GetString());
        var cost = new ConcertCost(Guid.NewGuid().ToString(), "Transport", tx, null, "120", "本人", "本人"); await Save(scene with { Costs = [cost] });
        var overlap = Scene() with { Title = "北京场", City = "北京", Costs = [cost with { Id = Guid.NewGuid().ToString(), Amount = "0.01" }] };
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", overlap)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Orders = [Order()] })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Orders = [Order() with { Platform = " 平台甲 ", Number = " A-0001 " }] })).StatusCode);
        await Data(await Write(client, "/concerts", Scene() with { Orders = [Order() with { Platform = "平台乙" }] }));
        Assert.Equal(HttpStatusCode.Conflict, (await Write(client, "/concerts/" + id, scene, "1", put: true)).StatusCode);
        var refund = new ConcertRefund(Guid.NewGuid().ToString(), "ticket:" + order.Id, "Requested", "60", "5", null, "0", "部分退票"); await Save(scene with { Refunds = [refund] });
        refund = refund with { State = "Approved" }; await Save(scene with { Refunds = [refund] });
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("0.00", detail.GetProperty("report").GetProperty("confirmedRefunds").GetString());
        var refundTx = (await Data(await Write(client, "/transactions/refund", new SaveTransaction("Refund", "60", cash.Id, new(2026, 1, 2, 10, 0, 0, TimeSpan.FromHours(8)), CategoryId: cat.Id, OriginalTransactionId: tx)))).GetProperty("id").GetString()!;
        refund = refund with { State = "Full", TransactionId = refundTx, ReceivedAmount = "60" }; await Save(scene with { Refunds = [refund] });
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("240.00", detail.GetProperty("report").GetProperty("personalNetCost").GetString()); Assert.Equal("60.00", detail.GetProperty("report").GetProperty("confirmedRefunds").GetString());
        var realized = new ConcertPlannedCost(Guid.NewGuid().ToString(), "Transport", "交通计划", "120", "Realized", cost.Id); await Save(scene with { Plans = [realized] });
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("0.00", detail.GetProperty("report").GetProperty("planned").GetString()); Assert.Equal("240.00", detail.GetProperty("report").GetProperty("actual").GetString());
        var audits = await Data(await client.GetAsync("/api/concerts/" + id + "/history")); Assert.True(audits.GetArrayLength() >= 8);
        using var form = new MultipartFormDataContent(); form.Add(new ByteArrayContent(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 test")), "file", "ticket.pdf");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/concerts/" + id + "/attachments") { Content = form }; request.Headers.TryAddWithoutValidation("If-Match", version);
        var upload = await Data(await client.SendAsync(request)); var attachmentId = upload.GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/concerts/" + id + "/attachments/" + attachmentId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/concerts/" + id + "/attachments/" + attachmentId)).StatusCode);
        Assert.Equal(count + 2, await db.Transactions.CountAsync());
        var advance = await Data(await Write(client, "/advances", new AdvanceInput("同行门票", "朋友昵称", cash.Id, "100", "40", new(2026, 1, 1, 10, 0, 0, TimeSpan.FromHours(8)), CategoryId: cat.Id)));
        var advanceId = advance.GetProperty("id").GetString()!; var businessId = advance.GetProperty("businessId").GetString()!;
        Assert.Equal(1, (await Data(await client.GetAsync("/api/concerts/advances?currency=CNY&keyword=" + advanceId))).GetArrayLength());
        Assert.Equal(0, (await Data(await client.GetAsync("/api/concerts/advances?currency=USD&keyword=" + advanceId))).GetArrayLength());
        var funding = await db.Transactions.AsNoTracking().SingleAsync(x => x.UserId == user.Id && x.BusinessId == businessId && x.Type == "ReimbursementAdvance");
        var sharedCost = new ConcertCost(Guid.NewGuid().ToString(), "Ticket", funding.Id, null, "60", "本人", "朋友昵称");
        // Upload incremented the aggregate version; reload before the next edit.
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); version = detail.GetProperty("version").GetString()!; scene = detail.GetProperty("input").Deserialize<ConcertInput>(FinanceService.Json)!;
        await Save(scene with { Costs = [cost, sharedCost] });
        detail = await Data(await client.GetAsync("/api/concerts/" + id));
        Assert.Equal("60.00", detail.GetProperty("report").GetProperty("pendingAdvances").GetString()); Assert.Equal("240.00", detail.GetProperty("report").GetProperty("personalNetCost").GetString());
        await Data(await Write(client, "/advances/" + advanceId + "/settle", new SettlementInput(cash.Id, "30", new(2026, 1, 2, 12, 0, 0, TimeSpan.FromHours(8))), advance.GetProperty("version").GetString()!));
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("30.00", detail.GetProperty("report").GetProperty("pendingAdvances").GetString()); Assert.Equal("30.00", detail.GetProperty("report").GetProperty("companions")[0].GetProperty("settled").GetString()); Assert.Equal("240.00", detail.GetProperty("report").GetProperty("personalNetCost").GetString());
        var advanceDetail = await Data(await client.GetAsync("/api/advances/" + advanceId));
        await Data(await Write(client, "/advances/" + advanceId + "/resolve", new AdvanceResolutionInput("MerchantRefund", "10", "商家退票", Settlement: new(cash.Id, "10", new(2026, 1, 3, 12, 0, 0, TimeSpan.FromHours(8)))), advanceDetail.GetProperty("version").GetString()!));
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("20.00", detail.GetProperty("report").GetProperty("pendingAdvances").GetString()); Assert.Equal("70.00", detail.GetProperty("report").GetProperty("confirmedRefunds").GetString()); Assert.Equal("290.00", detail.GetProperty("report").GetProperty("actual").GetString()); Assert.Equal("240.00", detail.GetProperty("report").GetProperty("personalNetCost").GetString());
        var secondCat = new Category { UserId = user.Id, ParentId = parent.Id, Name = "交通", Kind = "Expense" }; db.Add(secondCat); await db.SaveChangesAsync();
        var splitTx = (await Data(await Write(client, "/transactions/expense", new SaveTransaction("Expense", "100", cash.Id, new(2026, 1, 1, 10, 0, 0, TimeSpan.FromHours(8)), CategoryId: cat.Id, Splits: [new(cat.Id, "40"), new(secondCat.Id, "60")])))).GetProperty("id").GetString()!;
        var entry = await db.Entries.AsNoTracking().SingleAsync(x => x.TransactionId == splitTx && x.Kind == "Expense" && x.CategoryId == cat.Id);
        var partial = new ConcertCost(Guid.NewGuid().ToString(), "Ticket", splitTx, entry.Id, "50", "本人", "本人");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Costs = [partial] })).StatusCode);
        await Data(await Write(client, "/concerts", Scene() with { Costs = [partial with { Amount = "40" }] }));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Costs = [partial with { Id = Guid.NewGuid().ToString(), Amount = "1" }] })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Currency = "USD", Costs = [partial with { Id = Guid.NewGuid().ToString(), Amount = "1", EntryId = null }] })).StatusCode);
        var groupAdvance = await Data(await Write(client, "/advances", new AdvanceInput("同行组合购票", "另一个昵称", cash.Id, "100", "40", new(2026, 1, 1, 10, 0, 0, TimeSpan.FromHours(8)), CategoryId: cat.Id)));
        var groupBusinessId = groupAdvance.GetProperty("businessId").GetString();
        var groupFunding = await db.Transactions.AsNoTracking().SingleAsync(x => x.UserId == user.Id && x.BusinessId == groupBusinessId && x.Type == "ReimbursementAdvance");
        var groupOrder = Order() with { Number = "GROUP-100", State = "Paid", PaidOn = new(2026, 1, 1), PaidAmount = "100", Fee = "2", PaymentParts = [new(groupAdvance.GetProperty("ownTransactionId").GetString()!, "40", "2"), new(groupFunding.Id, "60", "0")] };
        var grouped = await Data(await Write(client, "/concerts", Scene() with { Title = "同行组合场", Orders = [groupOrder] }));
        var groupDetail = await Data(await client.GetAsync("/api/concerts/" + grouped.GetProperty("id").GetString()));
        Assert.Equal("100.00", groupDetail.GetProperty("report").GetProperty("originalCosts").GetString()); Assert.Equal("40.00", groupDetail.GetProperty("report").GetProperty("personalNetCost").GetString()); Assert.Equal("60.00", groupDetail.GetProperty("report").GetProperty("pendingAdvances").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts", Scene() with { Orders = [groupOrder with { Id = Guid.NewGuid().ToString(), Number = "WRONG-PARTS", PaidAmount = "99" }] })).StatusCode);
        var yearly = await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=CNY")); Assert.Equal("320.00", yearly.GetProperty("totalCost").GetString());
        var ticketCount = await db.Transactions.CountAsync();
        var ticket = new ConcertTicket(Guid.NewGuid().ToString(), "A区", "1排1座", "朋友昵称", "Electronic", "Pending");
        var ticketOrder = scene.Orders[0] with { Tickets = [ticket] };
        await Save(scene with { Orders = [ticketOrder] });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { Orders = [ticketOrder with { Tickets = [ticket, ticket with { Id = Guid.NewGuid().ToString() }, ticket with { Id = Guid.NewGuid().ToString() }] }] }, version, put: true)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { Orders = [ticketOrder with { Tickets = [ticket, ticket] }] }, version, put: true)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { Orders = [ticketOrder with { Tickets = [] }] }, version, put: true)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { Orders = [ticketOrder with { Tickets = [ticket with { State = "Received" }] }] }, version, put: true)).StatusCode);
        ticketOrder = ticketOrder with { State = "Issued", Tickets = [ticket with { State = "Received" }] };
        await Save(scene with { Orders = [ticketOrder] });
        ticketOrder = ticketOrder with { Tickets = [ticket with { State = "Used" }] };
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene with { StartsAt = DateTimeOffset.UtcNow.AddDays(7), Orders = [ticketOrder] }, version, put: true)).StatusCode);
        await Save(scene with { Orders = [ticketOrder] });
        Assert.Equal(ticketCount, await db.Transactions.CountAsync());
        detail = await Data(await client.GetAsync("/api/concerts/" + id));
        Assert.Equal("1排1座", detail.GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0].GetProperty("seat").GetString());
        Assert.Equal("290.00", detail.GetProperty("report").GetProperty("actual").GetString());
        Assert.Contains((await Data(await client.GetAsync("/api/concerts/" + id + "/history"))).EnumerateArray(), x => x.GetProperty("action").GetString() == "TicketsUpdated");
        var finalCount = await db.Transactions.CountAsync();
        await Data(await Write(client, "/settings/modules", new ConcertModules(false), prefVersion, put: true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/concerts/" + id)).StatusCode);
        Assert.True(await db.Documents.AnyAsync(x => x.Id == id)); Assert.Equal(finalCount, await db.Transactions.CountAsync());
        var current = await Data(await client.GetAsync("/api/settings/modules")); await Data(await Write(client, "/settings/modules", new ConcertModules(true), current.GetProperty("version").GetString()!, put: true));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/concerts/" + id)).StatusCode);
        db.ChangeTracker.Clear(); var reviewPayment = await db.Transactions.SingleAsync(x => x.Id == tx);
        reviewPayment.Status = "NeedsReview"; await db.SaveChangesAsync();
        detail = await Data(await client.GetAsync("/api/concerts/" + id));
        Assert.Equal("50.00", detail.GetProperty("report").GetProperty("actual").GetString());
        Assert.Equal("0.00", detail.GetProperty("report").GetProperty("personalNetCost").GetString());
        Assert.True(detail.GetProperty("report").GetProperty("warnings").GetArrayLength() > 0);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client, "/concerts/" + id, scene, version, put: true)).StatusCode);
        reviewPayment.Status = "Confirmed"; await db.SaveChangesAsync();
        detail = await Data(await client.GetAsync("/api/concerts/" + id));
        Assert.Equal("290.00", detail.GetProperty("report").GetProperty("actual").GetString());
        db.ChangeTracker.Clear(); var original = await db.Transactions.SingleAsync(x => x.Id == tx); original.Status = "Deleted"; await db.SaveChangesAsync();
        detail = await Data(await client.GetAsync("/api/concerts/" + id)); Assert.Equal("50.00", detail.GetProperty("report").GetProperty("actual").GetString()); Assert.True(detail.GetProperty("report").GetProperty("warnings").GetArrayLength() > 0);
    }
}

