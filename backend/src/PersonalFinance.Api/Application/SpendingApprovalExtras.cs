using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using SkiaSharp;
namespace PersonalFinance.Api.Application;

public sealed record ApprovalAnswer(string Question, string Answer);
public sealed record ApprovalImage(string Name, string Base64);
public sealed record ApprovalInstallment(decimal DownPayment, decimal FinancedPrincipal, int Months, decimal TotalFees);
public static class ApprovalInstallmentMath
{
    public static object Calculate(decimal price, ApprovalInstallment b)
    {
        FinanceService.Require(b.Months is >= 1 and <= 600 && new[] { b.DownPayment, b.FinancedPrincipal, b.TotalFees }.All(x => x >= 0 && x <= 1_000_000_000_000m && decimal.Round(x, 2) == x) && b.DownPayment + b.FinancedPrincipal == price, "首付与融资本金须等于商品价格，费用必须明确");
        var total = b.FinancedPrincipal + b.TotalFees;
        FinanceService.Require(price + b.TotalFees <= 1_000_000_000_000m, "总成本超过支持范围");
        var regular = decimal.Floor(total / b.Months * 100) / 100;
        return new { purchasePrice = price, totalCost = price + b.TotalFees, b.DownPayment, b.FinancedPrincipal, b.TotalFees, b.Months, regularPayment = regular, finalPayment = total - regular * (b.Months - 1), assumptions = "已知总费用按期均分，末期调整分位差；非合同账单或实际记账" };
    }
}
public sealed partial class FinanceService
{
    public async Task<object> ApprovalNotes(string user, string id)
    {
        await Document(user, id, ApprovalKind);
        var rows = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Name == id && (x.Kind == "ApprovalAnswer" || x.Kind == "ApprovalInstallment")).OrderBy(x => x.CreatedAt).Take(200).ToArrayAsync();
        var images = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Name == id && x.Kind == "ApprovalImage").OrderBy(x => x.CreatedAt).Take(100).Select(x => new { x.Id, x.Kind, x.CreatedAt, x.ContentType, size = x.Content.Length }).ToArrayAsync();
        return new { records = rows.Select(x => new { x.Id, x.Kind, x.CreatedAt, data = JsonSerializer.Deserialize<JsonElement>(x.Content, Json) }), images, limitation = "图片仅作为凭据保存，未自动发送模型或识别内容；商品信息需用户确认" };
    }
    public async Task<object> ApprovalAddNote(string user, string id, object body, string kind, string? version)
    {
        var d = await Document(user, id, ApprovalKind); Version(d, version); var r = ApprovalRead(d);
        Require(r.State is "DRAFT" or "SUBMITTED" or "NEEDS_INFORMATION" or "EVALUATED" or "COOLING_DOWN", "当前状态不能补充申请");
        Require(await db.Documents.CountAsync(x => x.UserId == user && x.Name == id && x.Kind == kind) < 100, "当前申请记录过多");
        var note = new StoredDocument { UserId = user, Name = id, Kind = kind, ContentType = "application/json" };
        if (body is ApprovalAnswer answer) Require(!string.IsNullOrWhiteSpace(answer.Question) && answer.Question.Length <= 1000 && !string.IsNullOrWhiteSpace(answer.Answer) && answer.Answer.Length <= 4000, "问题或回答无效");
        if (body is ApprovalInstallment installment) ApprovalInstallmentMath.Calculate(r.Application.Amount, installment);
        if (body is ApprovalImage image)
        {
            Require(image.Base64.Length <= 2_800_000 && image.Name.Length is > 0 and <= 100, "图片过大或名称无效");
            byte[] bytes; try { bytes = Convert.FromBase64String(image.Base64); } catch (FormatException) { throw new ApiException(422, "图片编码无效"); }
            Require(bytes.Length is > 8 and <= 2_097_152, "图片大小无效");
            var png = bytes.AsSpan().StartsWith(new byte[] {137,80,78,71,13,10,26,10});
            var jpg = bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 && bytes[^2] == 255 && bytes[^1] == 217;
            Require(png || jpg, "仅支持内容签名有效的PNG或JPEG图片");
            using var encoded = SKData.CreateCopy(bytes); using var codec = SKCodec.Create(encoded);
            Require(codec != null && codec.Info.Width is > 0 and <= 4096 && codec.Info.Height is > 0 and <= 4096 && (long)codec.Info.Width * codec.Info.Height <= 16_000_000, "图片内容或尺寸无效");
            using var bitmap = SKBitmap.Decode(bytes); Require(bitmap != null, "图片无法解码");
            using var normalized = SKImage.FromBitmap(bitmap!); using var data = normalized.Encode(SKEncodedImageFormat.Png, 100);
            Require(data != null && data.Size <= 2_097_152, "规范化图片超过2MB");
            note.Content = data!.ToArray(); note.ContentType = "image/png";
        }
        else note.Content = body is ApprovalInstallment plan ? JsonSerializer.SerializeToUtf8Bytes(new { input = plan, calculation = ApprovalInstallmentMath.Calculate(r.Application.Amount, plan) }, Json) : JsonSerializer.SerializeToUtf8Bytes(body, Json);
        db.Add(note);
        r = r with { State = r.State == "DRAFT" ? "DRAFT" : "SUBMITTED", CoolingUntil = null, History = [.. r.History, new(DateTimeOffset.UtcNow, user, kind, "补充信息后需重新评估")] };
        d.Content = JsonSerializer.SerializeToUtf8Bytes(r, Json); d.Version++; ApprovalAudit(user, id, kind); return ApprovalDto(d);
    }
    public async Task<StoredDocument> ApprovalImageContent(string user, string id, string imageId)
    {
        await Document(user, id, ApprovalKind); var image = await Document(user, imageId, "ApprovalImage"); Require(image.Name == id, "附件不属于当前申请"); return image;
    }
}
public static class SpendingApprovalExtras
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/spending-approvals/{id}/notes", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ApprovalNotes(FinanceEndpoints.User(c), id)));
        api.MapPost("/spending-approvals/{id}/answers", async (string id, ApprovalAnswer b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalAddNote(FinanceEndpoints.User(c), id, b, "ApprovalAnswer", c.Request.Headers.IfMatch), true));
        api.MapPost("/spending-approvals/{id}/installment", async (string id, ApprovalInstallment b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalAddNote(FinanceEndpoints.User(c), id, b, "ApprovalInstallment", c.Request.Headers.IfMatch), true));
        api.MapPost("/spending-approvals/{id}/images", async (string id, ApprovalImage b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalAddNote(FinanceEndpoints.User(c), id, b, "ApprovalImage", c.Request.Headers.IfMatch), true));
        api.MapGet("/spending-approvals/{id}/images/{imageId}", async (string id, string imageId, FinanceService f, HttpContext c) => { var image = await f.ApprovalImageContent(FinanceEndpoints.User(c), id, imageId); c.Response.Headers.ContentDisposition = "attachment"; c.Response.Headers.XContentTypeOptions = "nosniff"; return Results.File(image.Content, image.ContentType); });
    }
}
