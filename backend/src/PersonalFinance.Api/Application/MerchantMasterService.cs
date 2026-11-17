using PersonalFinance.Api.Contracts;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record MerchantAliasInput(string Name);
public sealed record MerchantMergeInput(string TargetId, string SourceVersion, string TargetVersion, string? PreviewToken = null);
public sealed partial class FinanceService
{
    private readonly Dictionary<string,DirectoryItem> merchantMasters=[];
    private readonly Dictionary<string,DirectoryItem?> merchantMatches=[];
    private sealed record MerchantCatalog(Dictionary<string,DirectoryItem[]> Names,Dictionary<string,MerchantAlias> Aliases);
    private readonly Dictionary<string,MerchantCatalog> merchantCatalogs=[];
    private void InvalidateMerchantCache(string user){
        merchantCatalogs.Remove(user);
        foreach(var key in merchantMatches.Keys.Where(x=>x.StartsWith(user+":",StringComparison.Ordinal)).ToArray())merchantMatches.Remove(key);
        foreach(var key in merchantMasters.Keys.Where(x=>x.StartsWith(user+":",StringComparison.Ordinal)).ToArray())merchantMasters.Remove(key);
    }
    public static string NormalizeMerchantName(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).Trim(), @"\s+", " ").ToUpperInvariant();
    public static string MerchantMatchKey(string value) => AuthService.Hash(NormalizeMerchantName(value));
    private async Task<DirectoryItem> MerchantMaster(string user, string id) {
        var key=user+":"+id;if(merchantMasters.TryGetValue(key,out var cached))return cached;
        var master=await db.Directory.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id && x.Kind == "merchants") ?? throw new ApiException(404,"商户不存在");merchantMasters[key]=master;return master;
    }
    private async Task<DirectoryItem?> ResolveMerchant(string user, string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var key = MerchantMatchKey(name);
        var cacheKey=user+":"+key;if(merchantMatches.TryGetValue(cacheKey,out var cached))return cached;
        if(!merchantCatalogs.TryGetValue(user,out var catalog)){
            var masters=await db.Directory.Where(x=>x.UserId==user && x.Kind=="merchants" && x.Status=="Active").ToArrayAsync();
            var aliases=await db.Set<MerchantAlias>().AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync();
            catalog=new(masters.GroupBy(x=>NormalizeMerchantName(x.Name)).ToDictionary(x=>x.Key,x=>x.ToArray()),aliases.ToDictionary(x=>x.MatchKey));merchantCatalogs[user]=catalog;
            foreach(var master in masters)merchantMasters[user+":"+master.Id]=master;
        }
        var alias = catalog.Aliases.GetValueOrDefault(key);
        if (alias != null) {var master=await MerchantMaster(user,alias.MerchantId);merchantMatches[cacheKey]=master.Status=="Active"?master:null;return merchantMatches[cacheKey];}
        var normalized = NormalizeMerchantName(name);
        var matches = catalog.Names.GetValueOrDefault(normalized)??[];
        merchantMatches[cacheKey]=matches.Length == 1 ? matches[0] : null;return merchantMatches[cacheKey];
    }
    private async Task EnsureMerchantName(string user, string name, string? id)
    {
        var normalized = NormalizeMerchantName(name); var key = MerchantMatchKey(name);
        Require(!await db.Set<MerchantAlias>().AnyAsync(x => x.UserId == user && x.MatchKey == key && x.MerchantId != id),"此名称已是另一商户的别名，请先核对或合并商户");
        var others = await db.Directory.Where(x => x.UserId == user && x.Kind == "merchants" && x.Id != id && x.Status == "Active").Select(x => x.Name).ToArrayAsync();
        Require(!others.Any(x => NormalizeMerchantName(x) == normalized),"已存在归一名称相同的商户，请使用已有商户或合并");
    }
    public async Task<object> MerchantMasterList(string user, IQueryCollection query)
    {
        var (page,size)=Paging(query); var keyword=query["keyword"].ToString();
        var q=db.Directory.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="merchants");
        if(keyword!="")q=q.Where(x=>x.Name.Contains(keyword) || db.Set<MerchantAlias>().Any(a=>a.UserId==user && a.MerchantId==x.Id && a.Name.Contains(keyword)));
        var total=await q.CountAsync();var rows=await q.OrderBy(x=>x.Status).ThenBy(x=>x.Name).Skip((page-1)*size).Take(size).ToArrayAsync();
        var ids=rows.Select(x=>x.Id).ToArray();var aliases=await db.Set<MerchantAlias>().AsNoTracking().Where(x=>x.UserId==user && ids.Contains(x.MerchantId)).ToArrayAsync();
        return new{items=rows.Select(x=>new{x.Id,x.Name,x.Status,x.CategoryId,version=x.Version.ToString(),aliases=aliases.Where(a=>a.MerchantId==x.Id).Select(a=>new{a.Id,a.Name,a.Source,version=a.Version.ToString()})}),total,page,pageSize=size};
    }
    public async Task<object> MerchantAliasSave(string user,string id,MerchantAliasInput input,string? version)
    {
        var master=await MerchantMaster(user,id);Version(master,version);Require(master.Status=="Active","仅启用商户可添加别名");
        var name=Text(input.Name,200,true);await EnsureMerchantName(user,name,id);var key=MerchantMatchKey(name);
        Require(!await db.Set<MerchantAlias>().AnyAsync(x=>x.UserId==user && x.MatchKey==key),"此别名已经存在");
        var alias=new MerchantAlias{UserId=user,MerchantId=id,Name=name,MatchKey=key};db.Add(alias);master.Version++;InvalidateMerchantCache(user);
        return new{alias.Id,version=master.Version.ToString()};
    }
    public async Task<object> MerchantAliasRemove(string user,string id,string? version)
    {
        var alias=await db.Set<MerchantAlias>().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id)??throw new ApiException(404,"商户别名不存在");Version(alias,version);
        var master=await MerchantMaster(user,alias.MerchantId);db.Remove(alias);master.Version++;InvalidateMerchantCache(user);return new{id,removed=true};
    }
    private async Task<(DirectoryItem Source,DirectoryItem Target,FinanceTransaction[] Transactions,MerchantAlias[] Aliases,string Token)> MerchantMergeSnapshot(string user,string id,MerchantMergeInput input)
    {
        Require(id!=input.TargetId,"不能合并到自身");var source=await MerchantMaster(user,id);var target=await MerchantMaster(user,input.TargetId);
        Version(source,input.SourceVersion);Version(target,input.TargetVersion);Require(source.Status=="Active" && target.Status=="Active","请选择两个启用商户");
        var aliases=await db.Set<MerchantAlias>().Where(x=>x.UserId==user && (x.MerchantId==id || x.MerchantId==input.TargetId)).OrderBy(x=>x.Id).ToArrayAsync();
        var names=aliases.Where(x=>x.MerchantId==id).Select(x=>x.Name).Append(source.Name).ToArray();
        var keys=names.Select(MerchantMatchKey).ToHashSet();
        var conflicting=(await db.Directory.Where(x=>x.UserId==user && x.Kind=="merchants" && x.Id!=id && x.Id!=input.TargetId && x.Status=="Active").ToArrayAsync()).Any(x=>keys.Contains(MerchantMatchKey(x.Name)));
        Require(!conflicting,"来源名称与其他商户冲突，请先整理冲突名称");
        var normalized=names.Select(NormalizeMerchantName).ToHashSet();
        var transactions=(await db.Transactions.Where(x=>x.UserId==user && x.Merchant!=null).ToArrayAsync()).Where(x=>normalized.Contains(NormalizeMerchantName(x.Merchant!))).OrderBy(x=>x.Id).ToArray();
        var token=AuthService.Hash(JsonSerializer.Serialize(new{source.Id,source.Version,targetId=target.Id,targetVersion=target.Version,transactions=transactions.Select(x=>new{x.Id,x.Version}),aliases=aliases.Select(x=>new{x.Id,x.Version})},Json));
        return(source,target,transactions,aliases,token);
    }
    public async Task<object> MerchantMergePreview(string user,string id,MerchantMergeInput input)
    {
        var s=await MerchantMergeSnapshot(user,id,input);return new{source=s.Source.Name,target=s.Target.Name,transactions=s.Transactions.Length,aliases=s.Aliases.Count(x=>x.MerchantId==id),previewToken=s.Token,note="统一商户名称并停用来源商户；金额、账户及分录不变，原导入数据和清洗记录保留。"};
    }
    public async Task<object> MerchantMergeApply(string user,string id,MerchantMergeInput input)
    {
        var s=await MerchantMergeSnapshot(user,id,input);Require(input.PreviewToken==s.Token,"合并预览已变化，请重新预览");
        foreach(var alias in s.Aliases.Where(x=>x.MerchantId==id)){alias.MerchantId=s.Target.Id;alias.Version++;}
        var key=MerchantMatchKey(s.Source.Name);
        if(!s.Aliases.Any(x=>x.MatchKey==key))db.Add(new MerchantAlias{UserId=user,MerchantId=s.Target.Id,Name=s.Source.Name,MatchKey=key,Source="Merge"});
        foreach(var tx in s.Transactions){tx.Merchant=s.Target.Name;tx.Version++;}
        s.Source.Status="Disabled";s.Source.Version++;s.Target.Version++;InvalidateMerchantCache(user);
        return new{id,targetId=s.Target.Id,updated=s.Transactions.Length,cashImpact="0.00"};
    }
}
