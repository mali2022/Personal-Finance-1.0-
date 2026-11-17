using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
using static PersonalFinance.Api.Application.FinanceEndpoints;
namespace PersonalFinance.Api.Application;
public static class OperationsEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/accounts/{id}/analysis", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.AccountAnalysis(User(c), id)));
        api.MapGet("/reports/advanced", async (FinanceService f, HttpContext c) => Ok(c, await f.Advanced(User(c), c.Request.Query)));
        api.MapPost("/reconciliations/preview", async (ReconcileInput b, FinanceService f, HttpContext c) => Ok(c, await f.ReconcilePreview(User(c), b)));
        api.MapPost("/reconciliations", async (ReconcileInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.Reconcile(User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/accounts/{id}/reconciliations", async (string id, FinanceService f, FinanceDb db, HttpContext c) => { await f.Account(User(c), id, false); var (page, size) = FinanceService.Paging(c.Request.Query); var q = db.Reconciliations.Where(x => x.UserId == User(c) && x.AccountId == id); var total = await q.CountAsync(); var rows = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync(); return Ok(c, new { items = rows.Select(FinanceService.ReconcileDto), total, page, pageSize = size }); });
        api.MapGet("/transactions/{id}/attachments", async (string id, FinanceService f, HttpContext c) => { await f.Transaction(User(c), id); return Ok(c, await f.Attachments(User(c), id)); });
        api.MapPost("/transactions/{id}/attachments", async (string id, FinanceService f, HttpContext c) => { var form = await c.Request.ReadFormAsync(); var file = form.Files.GetFile("file") ?? throw new ApiException(422, "请选择附件"); return await Write(c, f, new { file.FileName, file.Length }, async () => await f.UploadAttachment(User(c), id, file)); });
        api.MapGet("/transactions/{id}/attachments/{attachmentId}/content", async (string id, string attachmentId, FinanceService f, HttpContext c) => { var doc = await f.Document(User(c), attachmentId, "Attachment", id); return Results.File(doc.Content, doc.ContentType, doc.Name); });
        api.MapDelete("/transactions/{id}/attachments/{attachmentId}", async (string id, string attachmentId, FinanceService f, FinanceDb db, HttpContext c) => await Write(c, f, new { id, attachmentId }, async () => { var doc = await f.Document(User(c), attachmentId, "Attachment", id); FinanceService.Version(doc, c.Request.Headers.IfMatch); db.Documents.Remove(doc); return new { removed = true }; }));
        api.MapPost("/exports", async (JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.Export(User(c), b), true));
        api.MapGet("/exports/{id}/file", async (string id, FinanceService f, HttpContext c) => { var doc = await f.Document(User(c), id, "Export"); return Results.File(doc.Content, doc.ContentType, doc.Name); });
        api.MapPost("/imports", async (FinanceService f, HttpContext c) => { var form = await c.Request.ReadFormAsync(); var file = form.Files.GetFile("file") ?? throw new ApiException(422, "请选择账单"); return await Write(c, f, new { file.FileName, file.Length }, async () => await f.UploadImport(User(c), file, form["source"].ToString())); });
        api.MapGet("/imports/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.ImportDetail(User(c), id)));
        api.MapPut("/imports/{id}/mapping", async (string id, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.MapImport(User(c), id, b, c.Request.Headers.IfMatch)));
        api.MapPost("/imports/{id}/recheck", async (string id, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.RecheckImport(User(c), id, c.Request.Headers.IfMatch)));
        api.MapPost("/imports/{id}/rows/{rowId}/duplicate-review", async (string id, string rowId, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ReviewImportDuplicate(User(c), id, rowId, b.GetProperty("decision").GetString()!, c.Request.Headers.IfMatch)));
        api.MapGet("/imports/{id}/attempts", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.ImportAttempts(User(c), id, c.Request.Query)));
        api.MapGet("/imports/{id}/attempts/{attemptId}/rows", async (string id, string attemptId, FinanceService f, HttpContext c) => Ok(c, await f.ImportAttemptRows(User(c), id, attemptId, c.Request.Query)));
        api.MapGet("/imports/{id}/rows", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.ImportRows(User(c), id, c.Request.Query)));
        api.MapPatch("/imports/{id}/rows/{rowId}", async (string id, string rowId, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.PatchImport(User(c), id, rowId, b, c.Request.Headers.IfMatch)));
        api.MapPost("/imports/{id}/categories", async (string id, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.PatchImport(User(c), id, null, b, c.Request.Headers.IfMatch)));
        api.MapPost("/imports/{id}/commit", async (string id, JsonElement b, FinanceService f, HttpContext c) => Ok(c, await f.ExecuteImport(User(c), id, b, c)));
    }
}

