using System.Text.Json.Nodes;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public static Category ResolveImportCategoryPath(IEnumerable<Category> categories,string kind,string first,string second,string third)
    {
        Require(!string.IsNullOrWhiteSpace(first)&&!string.IsNullOrWhiteSpace(second),"请填写一级分类和二级分类；三级分类可留空");
        var all=categories.ToArray();var hierarchy=new CategoryHierarchy(all);var names=third.Length>0?new[]{first,second,third}:new[]{first,second};
        var matches=all.Where(c=>c.Kind==kind&&c.Status=="Active").Where(c=>{
            var path=hierarchy.Path(c.Id);
            return path.Length==names.Length&&path.Select((p,i)=>p.Status=="Active"&&p.Kind==kind&&(p.Name==names[i]||p.Id==names[i])).All(x=>x);
        }).ToArray();
        Require(matches.Length==1,matches.Length==0?"分类路径不存在、层级不匹配或已停用，请核对完整分类路径":"分类路径不唯一，请使用分类ID明确匹配");
        return matches[0];
    }
    private static PromotionInput? ImportPromotion(JsonNode node)
    {
        var discount=Money(node["discountAmount"]?.GetValue<string>() is {Length:>0} value?value:"0");
        Require(discount>=0,"优惠金额不可为负");
        if(discount==0)return null;
        Require(node["type"]?.GetValue<string>()=="Expense","优惠金额仅用于支出，收入和转账须为0或留空");
        var original=Money(M(Money(node["amount"]!.GetValue<string>(),true)+discount),true);
        return new(M(original),node["currency"]!.GetValue<string>(),[new("OtherDiscount",M(discount),0,"标准CSV导入")]);
    }
    public static bool CompletedImportStatus(string status)=>new[]{"交易成功","支付成功","付款成功","已收款","已入账","成功","完成","已完成","已支付","SUCCESS","Confirmed","Completed"}.Contains(CleanImportText(status),StringComparer.OrdinalIgnoreCase);
}
