using System.Text.Json;
using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
    async Task<InterestTopic> ValidateArtistProfile(string user, string? id, InterestTopic topic) {
        if(topic.ArtistProfile is not {} profile) return topic;
        Require(topic.Kind=="Artist", "品牌不能保存艺人成员资料");
        Require(profile.Type is "Solo" or "Band" && profile.Aliases is {Length:<=20} && profile.Members is {Length:<=100}, "艺人类型、别名或成员数量无效");
        Require(profile.Members.All(m=>m!=null), "成员记录不可为空");
        var aliases=profile.Aliases.Select(a=>{ConcertText(a,100,true);return a.Trim();}).ToArray();
        Require(aliases.Distinct(StringComparer.OrdinalIgnoreCase).Count()==aliases.Length && aliases.All(a=>!a.Equals(topic.Name.Trim(),StringComparison.OrdinalIgnoreCase)), "别名不能重复或与名称相同");
        Require(profile.Type=="Band" || profile.Members.Length==0, "个人艺人不能登记乐队成员");
        ConcertIds(profile.Members.Select(m=>m.ArtistId));
        var topics=(await InterestDocs(user,"MusicTopic")).ToDictionary(d=>d.Id,d=>InterestRead<InterestTopic>(d));
        foreach(var member in profile.Members) {
            Require(member.ArtistId!=id, "乐队不能把自己设为成员");
            Require(topics.TryGetValue(member.ArtistId,out var person) && person.Kind=="Artist" && person.ArtistProfile?.Type!="Band", "成员须为本人目录中的个人艺人，不能是品牌或乐队");
            ConcertText(member.Role,100);
            Require((member.JoinedOn==null || member.JoinedOn.Value.Year is >=1900 and <=9900) && (member.LeftOn==null || member.LeftOn.Value.Year is >=1900 and <=9900) && (member.JoinedOn==null || member.LeftOn==null || member.JoinedOn<=member.LeftOn), "成员加入与离开日期范围无效");
        }
        if(profile.Type=="Band" && id!=null) Require(!topics.Where(t=>t.Key!=id).Any(t=>t.Value.ArtistProfile?.Members.Any(m=>m.ArtistId==id)==true), "该艺人仍是其他乐队成员，请先解除成员关系再改为乐队");
        return topic with{ArtistProfile=profile with{Aliases=aliases}};
    }
    public async Task<object> InterestTopicHistory(string user,string id) {
        await RequireConcerts(user);await Document(user,id,"MusicTopic");
        var audits=await db.AuditRecords.AsNoTracking().Where(a=>a.UserId==user && a.ResourceType=="Concert" && a.ResourceId==id && a.Action=="InterestUpdate").OrderByDescending(a=>a.CreatedAt).Take(200).ToArrayAsync();
        return audits.Select(a=>{
            using var changes=JsonDocument.Parse(a.ChangesJson);var root=changes.RootElement;
            var before=root.GetProperty("before").GetString();
            return new {a.Id,a.CreatedAt,before=before==null?null:JsonSerializer.Deserialize<InterestTopic>(Convert.FromBase64String(before),Json),after=root.GetProperty("after").Deserialize<InterestTopic>(Json)};
        }).ToArray();
    }
}
