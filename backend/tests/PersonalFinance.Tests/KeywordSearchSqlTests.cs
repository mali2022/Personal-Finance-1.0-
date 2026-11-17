using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using System.Text.Json;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class KeywordSearchSqlTests
{
    [DeletionSqlFact]
    public async Task AccountCoveredKeywordSearchRechecksAfterWritesAndKeepsOtherFilters()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var expected = new List<string>();
        for (var i = 0; i < 8; i++) {
            var a = f.Account(); a.Name = "covered-key-" + i; expected.Add(f.Expense(a).Id);
        }
        var unused = f.Account(); unused.Name = "ordinary empty account";
        await f.Db.SaveChangesAsync();
        async Task<string[]> Search(params (string Key, string Value)[] filters) {
            var values = new Dictionary<string, StringValues> { ["keyword"] = "covered-key" };
            foreach (var (key, value) in filters) values[key] = value;
            return await (await f.Service.Filter(f.User, new QueryCollection(values))).Select(t => t.Id).ToArrayAsync();
        }
        Assert.Equal(expected.Order(), (await Search()).Order());
        Assert.Empty(await Search(("currency", "USD")));
        var other = f.Expense(unused); other.Note = "does not match";
        await f.Db.SaveChangesAsync();
        Assert.Equal(expected.Order(), (await Search()).Order());
        other.Note = "covered-key text"; await f.Db.SaveChangesAsync(); expected.Add(other.Id);
        Assert.Equal(expected.Order(), (await Search()).Order());
        other.Status = "Deleted"; await f.Db.SaveChangesAsync();
        Assert.Equal(new[] { other.Id }, await Search(("status", "Deleted")));
    }
    [DeletionSqlFact]
    public async Task BroadMetadataSearchPreservesTextDirectoryCategoryAndScopeMatches()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var expected = new List<string>();
        for (var i = 0; i < 8; i++) {
            var account = f.Account(); account.Name = "wide-key-" + i;
            expected.Add(f.Expense(account).Id);
        }
        var plain = f.Account(); plain.Name = "ordinary";
        var text = f.Expense(plain); text.Note = "wide-key"; expected.Add(text.Id);
        var project = f.Directory("projects", "wide-key-project");
        var tag = f.Directory("tags", "wide-key-tag");
        expected.Add(f.Expense(plain, project).Id); expected.Add(f.Expense(plain, tag: tag).Id);
        var category = new Category { UserId = f.User, Name = "wide-key-category", Kind = "Expense" };
        f.Db.Add(category); var categorized = f.Expense(plain);
        categorized.Entries.Single(e => e.Kind == "Expense").CategoryId = category.Id; expected.Add(categorized.Id);
        var ignored = f.Expense(plain); var deleted = f.Expense(plain); deleted.Note = "wide-key"; deleted.Status = "Deleted";
        await f.Db.SaveChangesAsync();
        async Task<string[]> Search(params (string Key, string Value)[] filters) {
            var values = new Dictionary<string, StringValues> { ["keyword"] = "wide-key" };
            foreach (var (key, value) in filters) values[key] = value;
            return await (await f.Service.Filter(f.User, new QueryCollection(values))).Select(t => t.Id).ToArrayAsync();
        }
        Assert.Equal(expected.Order(), (await Search()).Order());
        Assert.Equal(new[] { categorized.Id }, await Search(("categoryId", category.Id)));
        Assert.Equal(new[] { deleted.Id }, await Search(("status", "Deleted")));
        Assert.Empty(await Search(("currency", "USD")));
        Assert.DoesNotContain(ignored.Id, await Search());
    }
    [DeletionSqlFact]
    public async Task SearchUnionsAllSupportedFieldsWithoutDuplicatesOrWideningOtherFilters()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var ordinary = f.Account(); ordinary.Name = "Ordinary";
        var named = f.Account(); named.Name = "needle-account";
        var parent = new Category { UserId = f.User, Name = "needle-parent", Kind = "Expense" };
        var child = new Category { UserId = f.User, Name = "Leaf", Kind = "Expense", ParentId = parent.Id };
        f.Db.Categories.AddRange(parent, child);
        var project = f.Directory("projects", "needle-project");
        var tag = f.Directory("tags", "needle-tag");
        var duplicate = f.Expense(ordinary, project, tag); duplicate.Note = "needle"; duplicate.Merchant = "needle";
        duplicate.Entries.Single(e => e.Kind == "Expense").CategoryId = child.Id;
        var note = f.Expense(ordinary); note.Note = "needle";
        var product = f.Expense(ordinary); product.ProductName = "needle";
        var merchant = f.Expense(ordinary); merchant.Merchant = "needle";
        var account = f.Expense(named);
        var category = f.Expense(ordinary); category.Entries.Single(e => e.Kind == "Expense").CategoryId = child.Id;
        var projectOnly = f.Expense(ordinary, project);
        var tagOnly = f.Expense(ordinary, tag: tag);
        var deleted = f.Expense(ordinary); deleted.Note = "needle"; deleted.Status = "Deleted";
        var unrelated = f.Expense(ordinary);
        var other = new AppUser { Email = Guid.NewGuid() + "@isolation.test", PasswordHash = "no-login" };
        var otherAccount = new Account { UserId = other.Id, Name = "needle-secret" };
        var privateTransaction = new FinanceTransaction { UserId = other.Id, Type = "Expense", AccountId = otherAccount.Id, Amount = 10, Note = "needle" };
        f.Db.AddRange(other, otherAccount, privateTransaction); await f.Db.SaveChangesAsync();
        async Task<string[]> Search(params (string Key, string Value)[] extra)
        {
            var values = new Dictionary<string, StringValues> { ["keyword"] = "needle" };
            foreach (var (key, value) in extra) values[key] = value;
            return await (await f.Service.Filter(f.User, new QueryCollection(values))).Select(t => t.Id).ToArrayAsync();
        }
        var expected = new[] { duplicate.Id, note.Id, product.Id, merchant.Id, account.Id, category.Id, projectOnly.Id, tagOnly.Id };
        Assert.Equal(expected.Order(), (await Search()).Order());
        Assert.Equal(new[] { duplicate.Id, category.Id }.Order(), (await Search(("categoryId", parent.Id))).Order());
        Assert.Equal(new[] { duplicate.Id, tagOnly.Id }.Order(), (await Search(("tagId", tag.Id))).Order());
        Assert.Equal(new[] { account.Id }, await Search(("accountId", named.Id)));
        Assert.Equal(new[] { deleted.Id }, await Search(("status", "Deleted")));
        Assert.Empty(await Search(("currency", "USD")));
        Assert.Empty(await Search(("min", "11")));
        Assert.DoesNotContain(unrelated.Id, await Search());
        Assert.DoesNotContain(privateTransaction.Id, await Search());
        var ordered = await Search();
        var paged = new List<string>();
        for (var page = 1; page <= 5; page++)
        {
            var query = new QueryCollection(new Dictionary<string, StringValues> { ["keyword"] = "needle", ["pageSize"] = "2", ["page"] = page.ToString() });
            var result = JsonSerializer.SerializeToElement(await f.Service.Transactions(f.User, query), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Assert.Equal(8, result.GetProperty("total").GetInt32());
            paged.AddRange(result.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetString()!));
        }
        Assert.Equal(ordered, paged);
        var empty = JsonSerializer.SerializeToElement(await f.Service.Transactions(f.User, new QueryCollection(new Dictionary<string, StringValues> { ["keyword"] = "never-matches" })));
        Assert.Empty(empty.GetProperty("items").EnumerateArray());
    }
}
