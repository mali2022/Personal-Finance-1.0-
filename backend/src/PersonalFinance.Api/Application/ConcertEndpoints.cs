using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> ConcertAdvanceChoices(string user, string currency, string? keyword)
    {
        await RequireConcerts(user); Require(CurrencyDefinitions.Supports(currency) && (keyword?.Length ?? 0) <= 200, "查询参数无效");
        var q = db.Set<ThirdPartyAdvance>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.BusinessId != null);
        if (!string.IsNullOrWhiteSpace(keyword)) q = q.Where(x => x.Name.Contains(keyword) || x.Counterparty.Contains(keyword) || x.Id == keyword);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Take(100).Select(x => new { x.Id, x.Name, x.Currency, amount = x.Amount - x.OwnAmount }).ToArrayAsync();
        return rows.Select(x => new { x.Id, x.Name, x.Currency, receivable = M(x.amount) });
    }
    public async Task<object> ConcertTransactionChoices(string user, string currency, string? keyword, bool refunds)
    {
        await RequireConcerts(user); Require(CurrencyDefinitions.Supports(currency) && (keyword?.Length ?? 0) <= 200, "查询参数无效");
        var q = db.Transactions.AsNoTracking().Include(x => x.Entries).Where(x => x.UserId == user && x.Currency == currency && x.Status == "Confirmed" && x.OccurredAt<=DateTimeOffset.UtcNow);
        var payableBusinesses=await ConcertPayableBusinesses(user);
        q = refunds ? q.Where(x => x.Type == "Refund" && x.Status == "Confirmed") : q.Where(x => x.Type == "Expense" && x.BusinessId == null || x.Type == "ReimbursementAdvance" || x.Type=="LoanReceived" && payableBusinesses.Contains(x.BusinessId!));
        if (!string.IsNullOrWhiteSpace(keyword)) q = q.Where(x => x.Note.Contains(keyword) || x.Merchant != null && x.Merchant.Contains(keyword) || x.Id == keyword);
        var rows = await q.OrderByDescending(x => x.OccurredAt).Take(100).ToArrayAsync();
        return rows.Select(x => new { x.Id, x.Type, amount = M(x.Amount), x.Currency, x.OccurredAt, x.Merchant, x.Note, x.OriginalTransactionId, x.BusinessId, entries = x.Entries.Where(e => e.Kind == "Expense").Select(e => new { e.Id, amount = M(e.Amount), e.CategoryId }) });
    }
    public async Task<object> ConcertUpload(string user, string id, string? orderId, IFormFile file, string? version)
    {
        var doc = await ConcertDoc(user, id); Version(doc, version); var c = ConcertRead(doc);
        Require(string.IsNullOrEmpty(orderId) || c.Orders.Any(x => x.Id == orderId), "订单不存在");
        Require(c.AttachmentIds.Length + c.Orders.Sum(x => x.AttachmentIds.Length) < 100 && file.Length is > 0 and <= 10 * 1024 * 1024, "附件最多100个，每个1字节至10MB");
        await using var stream = new MemoryStream(); await file.CopyToAsync(stream); var bytes = stream.ToArray(); var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var png = bytes.Length > 8 && bytes.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var jpg = bytes.Length > 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255;
        var pdf = bytes.Length > 5 && Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-";
        Require(ext == ".png" && png || ext is ".jpg" or ".jpeg" && jpg || ext == ".pdf" && pdf, "附件格式与内容不符，仅支持JPG/PNG/PDF");
        var name = Path.GetFileName(file.FileName); Require(name.Length is > 0 and <= 150, "附件文件名过长");
        var attachment = new StoredDocument { UserId = user, Kind = "ConcertAttachment", Name = id + "/" + name, ContentType = png ? "image/png" : jpg ? "image/jpeg" : "application/pdf", Content = bytes };
        db.Add(attachment);
        c = string.IsNullOrEmpty(orderId) ? c with { AttachmentIds = [..c.AttachmentIds, attachment.Id] } : c with { Orders = c.Orders.Select(x => x.Id == orderId ? x with { AttachmentIds = [..x.AttachmentIds, attachment.Id] } : x).ToArray() };
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(c, Json); doc.Version++;
        ConcertAudit(user, id, "Attachment", new { attachment.Id, orderId });
        return new { attachment.Id, version = doc.Version.ToString() };
    }
    public async Task<object> ConcertAttachments(string user, string id)
    {
        var c = ConcertRead(await ConcertDoc(user, id)); var ids = c.AttachmentIds.Concat(c.Orders.SelectMany(x => x.AttachmentIds)).ToArray();
        var docs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.Id) && x.Kind == "ConcertAttachment").Select(x => new { x.Id, x.Name, x.ContentType, size = x.Content.Length }).ToArrayAsync();
        return docs.Select(x => new { x.Id, name = x.Name[(id.Length + 1)..], x.ContentType, x.size, orderId = c.Orders.FirstOrDefault(o => o.AttachmentIds.Contains(x.Id))?.Id });
    }
    public async Task<StoredDocument> ConcertAttachmentContent(string user, string id, string attachmentId)
    {
        var c = ConcertRead(await ConcertDoc(user, id));
        Require(c.AttachmentIds.Contains(attachmentId) || c.Orders.Any(x => x.AttachmentIds.Contains(attachmentId)), "附件不属于该场次");
        return await Document(user, attachmentId, "ConcertAttachment");
    }
}
public static class ConcertEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/concerts/p1-history/{kind}/{id}",async(string kind,string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertP1History(FinanceEndpoints.User(c),kind,id)));
        api.MapGet("/concerts/collection-purchase/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertCollectionPurchase(FinanceEndpoints.User(c),id)));
        api.MapGet("/concerts/planning-sources",async(string? keyword,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertPlanningSources(FinanceEndpoints.User(c),keyword)));
        api.MapGet("/concerts/overview",async(string currency,int year,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertOverview(FinanceEndpoints.User(c),currency,year)));
        api.MapGet("/concerts/planning-budgets",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertPlanBudgets(FinanceEndpoints.User(c))));
        api.MapPost("/concerts/planning-budgets",async(ConcertPlanBudget b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertPlanBudget(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/planning-budgets/{id}",async(string id,ConcertPlanBudget b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertPlanBudget(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/concerts/collections",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertCollections(FinanceEndpoints.User(c))));
        api.MapPost("/concerts/collections",async(ConcertCollection b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertCollection(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/collections/{id}",async(string id,ConcertCollection b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertCollection(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/concerts/experiences/{kind}",async(string kind,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertExperienceList(FinanceEndpoints.User(c),kind)));
        api.MapPost("/concerts/experiences/venues",async(ConcertVenue b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertVenue(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/experiences/venues/{id}",async(string id,ConcertVenue b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertVenue(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/concerts/experiences/seats",async(ConcertSeatExperience b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertSeat(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/experiences/seats/{id}",async(string id,ConcertSeatExperience b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertSeat(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/concerts/experiences/memories",async(ConcertMemory b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertMemory(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/experiences/memories/{id}",async(string id,ConcertMemory b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertMemory(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/concerts/trips",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertTrips(FinanceEndpoints.User(c))));
        api.MapPost("/concerts/trips",async(ConcertTrip b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertTrip(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/concerts/trips/{id}",async(string id,ConcertTrip b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveConcertTrip(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        InterestEndpoints.Map(api);
        api.MapGet("/concerts/transfer-transactions",async(string currency,string kind,string? keyword,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertTransferChoices(FinanceEndpoints.User(c),currency,kind,keyword)));
        api.MapGet("/concerts/payables",async(string currency,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ConcertPayableChoices(FinanceEndpoints.User(c),currency)));
        api.MapPost("/concerts/payables",async(ConcertPayableInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.CreateConcertPayable(FinanceEndpoints.User(c),b),true));
        api.MapPost("/concerts/payables/{id}/refund",async(string id,ConcertPayableRefund b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.RefundConcertPayable(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/concerts/tours/{id}/report", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertTourReport(FinanceEndpoints.User(c), id)));
        api.MapGet("/concerts/tours", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertTours(FinanceEndpoints.User(c))));
        api.MapPost("/concerts/tours", async (ConcertTour b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveConcertTour(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/concerts/tours/{id}", async (string id, ConcertTour b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveConcertTour(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/settings/modules", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertPreferences(FinanceEndpoints.User(c))));
        api.MapPut("/settings/modules", async (ConcertModules b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveConcertPreferences(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/concerts", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertList(FinanceEndpoints.User(c))));
        api.MapGet("/concerts/report", async (int year, string currency, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertAnnualReport(FinanceEndpoints.User(c), year, currency)));
        api.MapGet("/concerts/transactions", async (string currency, string? keyword, bool? refunds, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertTransactionChoices(FinanceEndpoints.User(c), currency, keyword, refunds ?? false)));
        api.MapGet("/concerts/advances", async (string currency, string? keyword, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertAdvanceChoices(FinanceEndpoints.User(c), currency, keyword)));
        api.MapGet("/concerts/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/concerts", async (ConcertInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveConcert(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/concerts/{id}", async (string id, ConcertInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveConcert(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/concerts/{id}/history", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertHistory(FinanceEndpoints.User(c), id)));
        api.MapGet("/concerts/{id}/attachments", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ConcertAttachments(FinanceEndpoints.User(c), id)));
        api.MapPost("/concerts/{id}/attachments", async (string id, FinanceService f, HttpContext c) => {
            var form = await c.Request.ReadFormAsync(); var file = form.Files.GetFile("file"); FinanceService.Require(file != null, "请选择附件");
            return await FinanceEndpoints.Write(c, f, new { id, name = Path.GetFileName(file!.FileName), file.Length }, async () => await f.ConcertUpload(FinanceEndpoints.User(c), id, form["orderId"].ToString(), file, c.Request.Headers.IfMatch));
        }).DisableAntiforgery();
        api.MapGet("/concerts/{id}/attachments/{attachmentId}", async (string id, string attachmentId, FinanceService f, HttpContext c) => { var d = await f.ConcertAttachmentContent(FinanceEndpoints.User(c), id, attachmentId); return Results.File(d.Content, d.ContentType, d.Name[(id.Length + 1)..]); });
    }
}

