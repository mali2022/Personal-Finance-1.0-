using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class ExpenseProductNameTests
{
    private static JsonElement View(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    [DeletionSqlFact] public async Task ProductNamePersistsEditsSearchesAndExportsWithoutChangingAmounts()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); var root = new Category { UserId = f.User, Name = "生活", Kind = "Expense" }; f.Db.Categories.Add(root);
        var category = new Category { UserId = f.User, Name = "餐饮", Kind = "Expense", ParentId = root.Id }; f.Db.Categories.Add(category); await f.Db.SaveChangesAsync();
        var input = new SaveTransaction("Expense", "38.90", account.Id, DateTimeOffset.UtcNow, CategoryId: category.Id, ProductName: "  午餐套餐  ");
        var created = View(await f.Service.SaveTransaction(f.User, input)); await f.Db.SaveChangesAsync();
        var id = created.GetProperty("id").GetString()!;
        var transaction = await f.Db.Transactions.SingleAsync(x => x.Id == id);
        Assert.Equal("午餐套餐", transaction.ProductName);
        Assert.Equal(961.10m, await f.Service.Balance(f.User, account.Id));
        var detail = View(await f.Service.Detail(f.User, id));
        Assert.Equal("午餐套餐", detail.GetProperty("productName").GetString());
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["keyword"] = "午餐套餐" });
        var search = View(await f.Service.Transactions(f.User, query)); Assert.Equal(1, search.GetProperty("total").GetInt32());
        var exported = View(await f.Service.Export(f.User, JsonSerializer.SerializeToElement(new { format = "CSV", filters = new { keyword = "午餐套餐" } })));
        await f.Db.SaveChangesAsync();
        var bytes = (await f.Db.Documents.SingleAsync(x => x.Id == exported.GetProperty("id").GetString())).Content;
        var csv = Encoding.UTF8.GetString(bytes); Assert.Contains("商品名", csv); Assert.Contains("午餐套餐", csv);
        Assert.Contains("收支分类", csv); Assert.Contains("生活 / 餐饮", csv);
        await f.Service.SaveTransaction(f.User, input with { ProductName = "运动鞋" }, id, transaction.Version.ToString()); await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, input with { ProductName = null }, id, transaction.Version.ToString()); await f.Db.SaveChangesAsync();
        Assert.Equal("运动鞋", transaction.ProductName);
        await f.Service.SaveTransaction(f.User, input with { ProductName = "" }, id, transaction.Version.ToString()); await f.Db.SaveChangesAsync();
        Assert.Null((await f.Db.Transactions.SingleAsync(x => x.Id == id)).ProductName);
        Assert.Equal(961.10m, await f.Service.Balance(f.User, account.Id));
    }
    [DeletionSqlFact] public async Task ExportMarksSplitTransactionsAndWritesFullCategoryPath()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var account = f.Account();
        var root = new Category { UserId = f.User, Name = "生活", Kind = "Expense" }; f.Db.Categories.Add(root);
        var food = new Category { UserId = f.User, Name = "餐饮", Kind = "Expense", ParentId = root.Id }; f.Db.Categories.Add(food);
        var transport = new Category { UserId = f.User, Name = "交通", Kind = "Expense", ParentId = root.Id }; f.Db.Categories.Add(transport); await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new("Expense", "12.30", account.Id, DateTimeOffset.UtcNow, CategoryId: food.Id));
        await f.Service.SaveTransaction(f.User, new("Expense", "38.90", account.Id, DateTimeOffset.UtcNow, CategoryId: food.Id, Splits: [new Split(food.Id, "20.00"), new Split(transport.Id, "18.90")]));
        await f.Db.SaveChangesAsync();
        var exported = View(await f.Service.Export(f.User, JsonSerializer.SerializeToElement(new { format = "CSV", filters = new { } })));
        await f.Db.SaveChangesAsync();
        var csv = Encoding.UTF8.GetString((await f.Db.Documents.SingleAsync(x => x.Id == exported.GetProperty("id").GetString())).Content);
        var rows = csv.TrimStart('\uFEFF').Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.StartsWith("日期,类型,账户,收支分类,", rows[0]);
        Assert.Contains("生活 / 餐饮", rows.Single(x => x.Contains("12.30")));
        Assert.Contains("多分类拆分", rows.Single(x => x.Contains("38.90")));
        var excel = View(await f.Service.Export(f.User, JsonSerializer.SerializeToElement(new { format = "Excel", filters = new { } })));
        await f.Db.SaveChangesAsync();
        using var workbook = new ClosedXML.Excel.XLWorkbook(new MemoryStream((await f.Db.Documents.SingleAsync(x => x.Id == excel.GetProperty("id").GetString())).Content));
        var sheet = workbook.Worksheet(1); var dataRows = sheet.RowsUsed().Skip(1).ToArray();
        Assert.Equal("收支分类", sheet.Cell(1, 4).GetString());
        Assert.Contains(dataRows, x => x.Cell(4).GetString() == "生活 / 餐饮");
        Assert.Contains(dataRows, x => x.Cell(4).GetString() == "多分类拆分");
    }
    [DeletionSqlFact] public async Task ProductNameIsLimitedToExpensesAndTwoHundredCharacters()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var account = f.Account(); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new("Income", "1", account.Id, DateTimeOffset.UtcNow, ProductName: "不适用")));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new("Expense", "1", account.Id, DateTimeOffset.UtcNow, ProductName: new string('a', 201))));
        Assert.False(await f.Db.Transactions.AnyAsync(x => x.UserId == f.User));
    }
    [Fact] public void ProductNameFollowsDescriptionTransmissionConsent()
    {
        var data = JsonNode.Parse("""{"productName":"私人物品","amount":"38.90"}""")!;
        Assert.Null(AiAgentTools.Redact(data.DeepClone(), false)!["productName"]);
        Assert.Equal("私人物品", AiAgentTools.Redact(data.DeepClone(), true)!["productName"]!.GetValue<string>());
    }
}
