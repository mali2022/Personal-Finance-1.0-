using PersonalFinance.Api.Contracts;
using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed record ConcertVenue(string Name,string City,string Address,string Transport,string Note);
public sealed record ConcertSeatExperience(string SceneId,string VenueId,string Tier,string Seat,decimal View,decimal Sound,decimal Transport,decimal Value,string Obstruction,string[] AttachmentIds,string Note);
public sealed record ConcertMemorySong(string Name,string Guest,bool Encore);
public sealed record ConcertMemoryMedia(string Title,string Kind,string Url,string? AttachmentId);
public sealed record ConcertMemory(string SceneId,string Title,string Diary,string Companions,decimal Rating,ConcertMemorySong[] Songs,ConcertMemoryMedia[] Media,string Highlights,string Note);
public sealed partial class FinanceService {
 public async Task<object> ConcertP1History(string user,string kind,string id) {
  await RequireConcerts(user);var type=kind switch{"venues"=>"ConcertVenue","seats"=>"ConcertSeatExperience","memories"=>"ConcertMemory","trips"=>ConcertTripKind,"collections"=>ConcertCollectionKind,"planning-budgets"=>"ConcertPlanBudget",_=>throw new ApiException(422,"档案类型无效")};await Document(user,id,type);return await db.AuditRecords.AsNoTracking().Where(a=>a.UserId==user && a.ResourceType=="Concert" && a.ResourceId==id).OrderByDescending(a=>a.CreatedAt).Take(100).Select(a=>new{a.Id,a.CreatedAt,a.Action,changes=a.ChangesJson}).ToArrayAsync();
 }
 public async Task<object> ConcertExperienceList(string user,string kind) {
  await RequireConcerts(user);Require(kind is "venues" or "seats" or "memories","档案类型无效");var type=kind switch{"venues"=>"ConcertVenue","seats"=>"ConcertSeatExperience",_=>"ConcertMemory"};return (await InterestDocs(user,type)).Select(d=>new{d.Id,version=d.Version.ToString(),input=System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(d.Content,Json)});
 }
 public async Task<object> SaveConcertVenue(string user,string? id,ConcertVenue input,string? version) {
  await RequireConcerts(user);ConcertText(input.Name,200,true);ConcertText(input.City,200,true);ConcertText(input.Address,500);ConcertText(input.Transport,2000);ConcertText(input.Note,2000);return await SaveInterestDocument(user,"ConcertVenue",id,input,version);
 }
 public async Task<object> SaveConcertSeat(string user,string? id,ConcertSeatExperience input,string? version) {
  await RequireConcerts(user);await ConcertDoc(user,input.SceneId);await Document(user,input.VenueId,"ConcertVenue");ConcertText(input.Tier);ConcertText(input.Seat);ConcertText(input.Obstruction,2000);ConcertText(input.Note,2000);Require(new[]{input.View,input.Sound,input.Transport,input.Value}.All(v=>v>=0 && v<=5 && decimal.Round(v,1)==v),"个人主观评分须为0到5，最多一位小数");await ValidateExperienceAttachments(user,input.SceneId,input.AttachmentIds);return await SaveInterestDocument(user,"ConcertSeatExperience",id,input,version);
 }
 async Task ValidateExperienceAttachments(string user,string sceneId,string[] ids) {
  ConcertIds(ids);Require(ids.Length<=50,"最多关联50个已有凭证");foreach(var attachment in ids){var doc=await Document(user,attachment,"ConcertAttachment");Require(doc.Name.StartsWith(sceneId+"/"),"凭证不属于所选场次");}
 }
 public async Task<object> SaveConcertMemory(string user,string? id,ConcertMemory input,string? version) {
  await RequireConcerts(user);await ConcertDoc(user,input.SceneId);ConcertText(input.Title,200,true);ConcertText(input.Diary,20000);ConcertText(input.Companions,2000);ConcertText(input.Highlights,10000);ConcertText(input.Note,2000);Require(input.Rating>=0 && input.Rating<=5 && decimal.Round(input.Rating,1)==input.Rating && input.Songs.Length<=300 && input.Media.Length<=100,"评分或歌曲/媒体数量无效");
  foreach(var song in input.Songs){ConcertText(song.Name,200,true);ConcertText(song.Guest,200);}
  foreach(var media in input.Media){ConcertText(media.Title,200,true);Require(media.Kind is "Photo" or "Video" or "Poster" or "Ticket","媒体类型无效");ConcertText(media.Url,2000);Require(media.Url.Length==0 || Uri.TryCreate(media.Url,UriKind.Absolute,out var uri) && uri.Scheme is "http" or "https","媒体仅接受HTTP/HTTPS地址，不保存完整视频二进制");Require(media.AttachmentId!=null || media.Url.Length>0,"请关联已有场次凭证或外部媒体地址");if(media.AttachmentId!=null)await ValidateExperienceAttachments(user,input.SceneId,[media.AttachmentId]);}
  return await SaveInterestDocument(user,"ConcertMemory",id,input,version);
 }
}
