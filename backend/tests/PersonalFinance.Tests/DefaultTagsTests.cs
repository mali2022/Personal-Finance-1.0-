using PersonalFinance.Api.Infrastructure;
using Xunit;

public sealed class DefaultTagsTests
{
    [Fact]
    public void CatalogPreservesAllCodesNamesAndThirtyGroups()
    {
        var tags = DefaultTags.Data.Items;
        Assert.Equal(600, tags.Length);
        Assert.Equal(Enumerable.Range(1, 600).Select(x => x.ToString("D3")), tags.Select(x => x.Code));
        Assert.Equal(600, tags.Select(x => x.Name).Distinct().Count());
        Assert.Equal(30, DefaultTags.Groups.Length);
        Assert.All(tags.GroupBy(x => x.Group), group => Assert.Equal(20, group.Count()));
        Assert.Equal("日常消费", tags[0].Name);
        Assert.Equal("工作日", tags[10].Name);
        Assert.Equal("自己做饭", tags[20].Name);
        Assert.Equal("售后处理中", tags[284].Name);
        Assert.Equal("API调用", tags[492].Name);
        Assert.Equal("AI工具", tags[493].Name);
        Assert.Equal("不予推荐", tags[598].Name);
        Assert.Equal("长期受益", tags[599].Name);
    }
    [Fact]
    public void ImportOnlyAddsMissingNamesAndKeepsUserIdentityStable()
    {
        var existing = new[] { "日常消费", "AI工具", "自定义旧标签" };
        var missing = DefaultTags.Missing("alice", existing);
        Assert.Equal(598, missing.Count);
        Assert.DoesNotContain(missing, x => x.Name == "日常消费" || x.Name == "AI工具");
        Assert.Empty(DefaultTags.Missing("alice", DefaultTags.Data.Items.Select(x => x.Name)));
        var first = DefaultTags.Create("alice"); var repeat = DefaultTags.Create("alice"); var other = DefaultTags.Create("bob");
        Assert.Equal(first.Select(x => x.Id), repeat.Select(x => x.Id));
        Assert.Empty(missing.Select(x => x.Id).Intersect(first.Select(x => x.Id)));
        Assert.Empty(first.Select(x => x.Id).Intersect(other.Select(x => x.Id)));
        Assert.All(first, x => { Assert.Equal("tags", x.Kind); Assert.Equal("alice", x.UserId); Assert.Equal(0m, x.Budget); Assert.Null(x.AccountId); Assert.Null(x.Amount); });
    }
}
