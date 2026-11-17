using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClosedXML.Excel;
using CsvHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> ReconcilePreview(string user, ReconcileInput input)
    {
        var a = await Account(user, input.AccountId); Require(!(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan"), "业务账户不允许直接调整");
        var actual = Money(input.ActualBalance); var system = await Balance(user, a.Id);
        return new { accountId = a.Id, a.Currency, systemBalance = M(system), actualBalance = M(actual), difference = M(actual - system), version = a.Version.ToString(), capturedAt = DateTimeOffset.UtcNow };
    }
    public async Task<object> Reconcile(string user, ReconcileInput input, string? version)
    {
        var a = await Account(user, input.AccountId); Version(a, version); var system = await Balance(user, a.Id); Require(system == Money(input.SystemBalance), "余额已改变，请重新预览");
        Require(input.Reason.Trim().Length is > 0 and <= 2000, "请填写对账原因"); var actual = Money(input.ActualBalance); var difference = actual - system;
        string? transactionId = null;
        if (difference != 0)
        {
            var result = await SaveTransaction(user, new("Adjustment", M(Math.Abs(difference)), a.Id, DateTimeOffset.UtcNow, input.Reason, AdjustmentDirection: difference > 0 ? "Increase" : "Decrease"));
            transactionId = JsonSerializer.SerializeToNode(result, Json)!["id"]!.GetValue<string>();
        }
        var r = new Reconciliation { UserId = user, AccountId = a.Id, Currency = a.Currency, SystemBalance = system, ActualBalance = actual, Difference = difference, TransactionId = transactionId, Reason = input.Reason };
        db.Reconciliations.Add(r); return ReconcileDto(r);
    }
    public static object ReconcileDto(Reconciliation r) => new { r.Id, r.AccountId, r.Currency, systemBalance = M(r.SystemBalance), actualBalance = M(r.ActualBalance), difference = M(r.Difference), r.TransactionId, r.Reason, r.CreatedAt, capturedAt = r.CreatedAt, version = r.Version.ToString() };
    public async Task<object> AccountAnalysis(string user, string id)
    {
        var a = await Account(user, id, false); var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)); var (start, _) = Month(now.AddMonths(-5).ToString("yyyy-MM")); var points = new List<object>(); decimal inflow = 0, outflow = 0;
        for (var i = 0; i < 6; i++)
        {
            var date = start.AddMonths(i); var end = date.AddMonths(1).AddTicks(-1);
            var q = from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId == user && e.Kind=="Account" && e.AccountId == id && t.Status != "Deleted" && t.OccurredAt >= date && t.OccurredAt <= end select e.Amount;
            var incoming = await q.Where(x => x > 0).SumAsync(x => (decimal?)x) ?? 0; var outgoing = -(await q.Where(x => x < 0).SumAsync(x => (decimal?)x) ?? 0);
            inflow += incoming; outflow += outgoing; points.Add(new { period = date.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"), balance = M(await Balance(user, id, end)), inflow = M(incoming), outflow = M(outgoing) });
        }
        return new { a.Currency, inflow = M(inflow), outflow = M(outflow), points };
    }
    public async Task<object> Advanced(string user, IQueryCollection p)
    {
        var start = Date(p["start"]!); var end = Date(p["end"]!); if (p["end"].ToString().Length == 10) end = end.AddDays(1).AddTicks(-1); var currency = p["currency"].ToString(); Require(end >= start && (end - start).TotalDays <= 3660, "统计范围无效");
        var q = Range(user, start, end, currency);
        var merchants = await q.Where(x => x.Merchant != null && (x.Type == "Expense" || x.Type == "Refund")).GroupBy(x => x.Merchant!).Select(g => new { Name = g.Key, Count = g.Count(x => x.Type == "Expense"), Expense = g.Sum(x => x.Type == "Refund" ? -x.Amount : x.Amount) }).ToListAsync();
        var accountRows = await db.Accounts.Where(a => a.UserId == user && a.Currency == currency).ToListAsync();
        var accountIds = accountRows.Select(a => a.Id).ToArray();
        var flows = await (from e in db.Entries join t in q on e.TransactionId equals t.Id where e.Kind == "Account" && accountIds.Contains(e.AccountId!)
            group e by e.AccountId! into g select new { Id = g.Key, In = g.Sum(e => e.Amount > 0 ? e.Amount : 0), Out = -g.Sum(e => e.Amount < 0 ? e.Amount : 0) }).ToDictionaryAsync(x => x.Id);
        var balances = await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId == user && accountIds.Contains(e.AccountId!) && t.Status != "Deleted"
            group e by e.AccountId! into g select new { Id = g.Key, Amount = g.Sum(e => e.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var accounts = accountRows.Select(a => new { a.Id, a.Name, inflow = M(flows.GetValueOrDefault(a.Id)?.In ?? 0), outflow = M(flows.GetValueOrDefault(a.Id)?.Out ?? 0), balance = M(a.OpeningBalance + balances.GetValueOrDefault(a.Id)) }).ToArray();
        var projectRows = await db.Directory.Where(d => d.UserId == user && d.Kind == "projects" && d.Currency == currency).ToListAsync();
        var rules = await Rules(user);
        var projectExpenses = await (from e in StatisticalExpenses(q, rules) join t in q on e.TransactionId equals t.Id where t.ProjectId != null
            group e by t.ProjectId! into g select new { Id = g.Key, Amount = g.Sum(e => e.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        if (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments) {
            var extras = await q.Where(t => t.ProjectId != null && (rules.IncludeAssetLoss && t.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease"))
                .GroupBy(t => t.ProjectId!).Select(g => new { Id = g.Key, Amount = g.Sum(t => t.Amount) }).ToArrayAsync();
            foreach (var extra in extras) projectExpenses[extra.Id] = projectExpenses.GetValueOrDefault(extra.Id) + extra.Amount;
        }
        var projects = projectRows.Select(d => new { d.Id, d.Name, budget = M(d.Budget), expense = M(projectExpenses.GetValueOrDefault(d.Id)) }).ToArray();
        return new { currency, merchants = merchants.OrderByDescending(x => x.Expense).Take(20).Select(x => new { name = x.Name, count = x.Count, expense = M(x.Expense) }), frequentMerchants = merchants.OrderByDescending(x => x.Count).Take(20).Select(x => new { name = x.Name, count = x.Count, expense = M(x.Expense) }), accounts, projects };
    }
    public async Task<object> UploadAttachment(string user, string id, IFormFile file)
    {
        await Transaction(user, id); Require(file.Length is > 0 and <= 10 * 1024 * 1024, "附件须为1字节至10MB");
        await using var stream = new MemoryStream(); await file.CopyToAsync(stream); var data = stream.ToArray(); var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var png = data.Length > 8 && data.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var jpg = data.Length > 3 && data[0] == 255 && data[1] == 216 && data[2] == 255;
        var pdf = data.Length > 5 && Encoding.ASCII.GetString(data, 0, 5) == "%PDF-";
        Require(ext == ".png" && png || ext is ".jpg" or ".jpeg" && jpg || ext == ".pdf" && pdf, "附件格式与内容不符，仅支持JPG/PNG/PDF");
        var doc = new StoredDocument { UserId = user, TransactionId = id, Name = Path.GetFileName(file.FileName), Content = data, ContentType = png ? "image/png" : jpg ? "image/jpeg" : "application/pdf" };
        db.Documents.Add(doc); return new { doc.Id };
    }
    public async Task<StoredDocument> Document(string user, string id, string kind, string? transactionId = null)
        => await db.Documents.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id && x.Kind == kind && (transactionId == null || x.TransactionId == transactionId)) ?? throw new ApiException(404, "文件不存在");
    public async Task<object> Export(string user, JsonElement body)
    {
        var format = body.GetProperty("format").GetString(); Require(format is "CSV" or "Excel", "导出格式无效");
        var filters = body.GetProperty("filters").EnumerateObject().ToDictionary(x => x.Name, x => new StringValues(x.Value.ToString())); var query = new QueryCollection(filters);
        var q = await Filter(user, query); var count = await q.CountAsync(); Require(count <= 100000, "单次导出最多10万条，请缩小时间范围");
        var doc = new StoredDocument { UserId = user, Kind = "Export", Name = "transactions-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + (format == "CSV" ? ".csv" : ".xlsx"), ContentType = format == "CSV" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
        static string Safe(string? v) => !string.IsNullOrEmpty(v) && "=+-@\t\r".Contains(v[0]) ? "'" + v : v ?? "";
        var header = new[] { "日期", "类型", "账户", "收支分类", "币种", "金额", "商户", "商品名", "备注", "转入账户", "手续费", "手续费分类", "到账金额", "汇率", "流水号" }; var accounts = await db.Accounts.Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id, x => x.Name);
        await using var output = new MemoryStream(); using var workbook = format == "Excel" ? new XLWorkbook() : null;
        var categories = await Categories(user); var categoryNames = categories.ToDictionary(c => c.Id, c => c.Name); var categoryParents = categories.ToDictionary(c => c.Id, c => c.ParentId);
        string CategoryText(string? id) { var names = new List<string>(); var seen = new HashSet<string>(); while (id != null && seen.Add(id) && categoryNames.TryGetValue(id, out var name)) { names.Add(name); id = categoryParents.GetValueOrDefault(id); } names.Reverse(); return string.Join(" / ", names); }
        var splitIds = (await (from e in db.Entries join t in q on e.TransactionId equals t.Id where e.Kind == "Expense" && (t.FeeCategoryId == null || e.CategoryId == null || e.CategoryId != t.FeeCategoryId) group e by e.TransactionId into g where g.Select(x => x.CategoryId).Distinct().Count() > 1 select g.Key).ToArrayAsync()).ToHashSet();
        var sheet = workbook?.Worksheets.Add("交易"); using var writer = new StreamWriter(output, new UTF8Encoding(true), leaveOpen: true); using var csv = format == "CSV" ? new CsvWriter(writer, CultureInfo.InvariantCulture) : null;
        void Row(string[] values, int index) { if (csv is not null) { foreach (var v in values) csv.WriteField(v); csv.NextRecord(); } else for (var n = 0; n < values.Length; n++) sheet!.Cell(index, n + 1).Value = values[n]; }
        Row(header, 1); int row = 2;
        await foreach (var t in q.AsAsyncEnumerable()) Row([t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss"), t.Type == "Transfer" && t.TransferKind != null ? t.TransferKind : t.Type, Safe(accounts.GetValueOrDefault(t.AccountId)), splitIds.Contains(t.Id) ? "多分类拆分" : Safe(CategoryText(t.CategoryId)), t.Currency, M(t.Amount), Safe(t.Merchant), Safe(t.ProductName), Safe(t.Note), Safe(accounts.GetValueOrDefault(t.ToAccountId ?? "")), M(t.Fee), Safe(categoryNames.GetValueOrDefault(t.FeeCategoryId ?? "")), t.ReceivedAmount.HasValue ? M(t.ReceivedAmount.Value) : "", t.ExchangeRate?.ToString(CultureInfo.InvariantCulture) ?? "", Safe(t.ExternalId)], row++);
        if (workbook is not null) { sheet!.Columns().AdjustToContents(1, Math.Min(row, 1000)); workbook.SaveAs(output); } else await writer.FlushAsync();
        doc.Content = output.ToArray(); db.Documents.Add(doc); return new { id = doc.Id, state = "Ready", fileName = doc.Name, downloadUrl = "/api/exports/" + doc.Id + "/file", total = count };
    }
    // RawRowsJson can contain the entire file: a join would transmit it once per detail row.
    private async Task<ImportJob> Import(string user, string id) => await db.Imports.Include(x => x.Rows).AsSplitQuery().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "导入任务不存在");
    public async Task<object> UploadImport(string user, IFormFile file, string source)
    {
        Require(file.Length is > 0 and <= 10 * 1024 * 1024 && new[] { "CSV", "Excel", "Alipay", "WeChat", "Bank" }.Contains(source), "文件大小或账单来源无效");
        var rows = new List<string[]>(); var ext = Path.GetExtension(file.FileName).ToLowerInvariant(); await using var data = new MemoryStream(); await file.CopyToAsync(data); data.Position = 0;
        var sourceHash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(data.ToArray()));var encodingName="XLSX";
        try {
        if (ext == ".xlsx")
        {
            using (var zip = new ZipArchive(data, ZipArchiveMode.Read, true)) Require(zip.Entries.Count < 1000 && zip.Entries.Sum(x => x.Length) < 50 * 1024 * 1024, "Excel解压规模过大"); data.Position = 0;
            using var workbook = new XLWorkbook(data); var sheet = workbook.Worksheet(1); var range = sheet.RangeUsed(); Require(range is not null && range.RowCount() <= 5001 && range.ColumnCount() <= 100, "导入最多5000行、100列");
            foreach (var row in range!.Rows()) rows.Add(row.Cells().Select(x => x.GetFormattedString(CultureInfo.InvariantCulture)).ToArray());
        }
        else
        {
            Require(ext == ".csv", "仅支持CSV/XLSX账单");
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);string text;
            try{text=new UTF8Encoding(false,true).GetString(data.ToArray());encodingName="UTF-8";}
            catch(DecoderFallbackException){text=Encoding.GetEncoding("GB18030",EncoderFallback.ExceptionFallback,DecoderFallback.ExceptionFallback).GetString(data.ToArray());encodingName="GB18030";}
            using var reader = new StringReader(text.TrimStart('\uFEFF')); using var csv = new CsvReader(reader, CultureInfo.InvariantCulture);
            while (await csv.ReadAsync()) { Require(rows.Count <= 5100 && csv.Parser.Count <= 100, "导入最多5000行、100列（说明行最多100行）"); rows.Add(csv.Parser.Record ?? []); }
        }
        }catch(Exception e)when(e is CsvHelperException or InvalidDataException or System.Xml.XmlException or ArgumentException or IOException){throw new ApiException(422,"账单无法解析，请检查文件格式、编码或CSV引号","IMPORT_FILE_INVALID");}
        Require(rows.Count >= 2, "文件中没有交易记录");
        // Wallet bills may have explanatory lines before their header.
        var headerIndex = rows.FindIndex(x => x.Any(v => v.Contains("金额")) && x.Any(v => v.Contains("时间") || v.Contains("日期"))); if (headerIndex < 0) headerIndex = 0;
        var headers = rows[headerIndex].Select(CleanImportText).ToArray(); Require(headers.All(x=>x.Length>0) && headers.Distinct().Count() == headers.Length, "列名为空或归一后重复，请核对账单");
        Require(rows.Count-headerIndex-1<=5000,"导入最多5000行");
        var job = new ImportJob { UserId = user, FileName = Path.GetFileName(file.FileName), Source = source, SourceHash=sourceHash,SourceEncoding=encodingName,HeaderRow=headerIndex+1, HeadersJson = JsonSerializer.Serialize(headers), RawRowsJson = JsonSerializer.Serialize(rows.Skip(headerIndex + 1)) };
        var previous=await db.Imports.AsNoTracking().Where(x=>x.UserId==user && x.Source==source && x.HeadersJson==job.HeadersJson && x.State!="Uploaded").OrderByDescending(x=>x.Version).FirstOrDefaultAsync();
        if(previous!=null){job.MappingJson=previous.MappingJson;if(await db.Accounts.AnyAsync(x=>x.UserId==user && x.Id==previous.AccountId && x.Status=="Active"))job.AccountId=previous.AccountId;}
        db.Imports.Add(job);
        var sourceDocument=new StoredDocument{UserId=user,Kind="ImportSource",Name=job.FileName,ContentType=ext==".xlsx"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv",Content=data.ToArray()};db.Add(sourceDocument);
        db.Add(new ImportCleaningEvent{UserId=user,ImportJobId=job.Id,Action="SourceUploaded",Source="File",JobVersion=job.Version,Reason="保留原文件、编码和SHA-256指纹；同来源相同表头复用已有字段映射，仍须核对",AfterJson=JsonSerializer.Serialize(new{documentId=sourceDocument.Id,sourceHash,encoding=encodingName,mappingReusedFromJobId=previous?.Id},Json)});
        return ImportDto(job);
    }
    private static object ImportDto(ImportJob job)
    {
        var rows = JsonSerializer.Deserialize<string[][]>(job.RawRowsJson)!;
        var projected = job.Rows.Select(x => JsonNode.Parse(x.DataJson)!).ToArray();
        return new { job.Id, job.FileName, job.Source, job.SourceHash,job.SourceEncoding,job.HeaderRow, headers = JsonSerializer.Deserialize<string[]>(job.HeadersJson), sampleRows = rows.Take(5), total = rows.Length, version = job.Version.ToString(), state = job.State,purpose=job.State!="Uploaded"&&IsStatementImport(job)?"Reconciliation":"Bookkeeping",reconciliationOnly=job.State!="Uploaded"&&IsStatementImport(job), mapping = JsonSerializer.Deserialize<JsonElement>(job.MappingJson), job.AccountId, requiresIdentityRecheck = job.State == "Preview" && job.Rows.Any(x => x.IdentityVersion < 2), summary = new { total = job.Rows.Count, ready = job.Rows.Count(x => x.Status == "Ready"), duplicate = job.Rows.Count(x => x.Status == "Duplicate"), suspected = job.Rows.Count(x => x.Status == "Suspected"), skipped = job.Rows.Count(x => x.Status == "Skipped"), invalid = job.Rows.Count(x => x.Status == "Invalid"), needsReview = projected.Count(x => x["needsReview"]?.GetValue<bool>() == true) }, imported = job.Imported };
    }
    public async Task<object> ImportDetail(string user, string id)
    {
        var job = await Import(user, id);
        // Writes hold the user transaction lock and advance the parent version.
        // A split read must reject a parent/detail pair spanning such a write.
        var current = await db.Imports.AsNoTracking().Where(x => x.UserId == user && x.Id == id).Select(x => x.Version).SingleAsync();
        if (current != job.Version) throw new ApiException(409, "导入记录已更新，请重新加载", "VERSION_CONFLICT");
        var dto=JsonSerializer.SerializeToNode(ImportDto(job),Json)!.AsObject();var frozen=await db.Set<StatementRecord>().AnyAsync(x=>x.UserId==user&&x.ImportJobId==id);dto["reconciliationOnly"]=IsStatementImport(job)||frozen;dto["sourceFrozen"]=frozen;return dto;
    }
    public async Task<object> MapImport(string user, string id, JsonElement body, string? version)
    {
        var job = await Import(user, id); Version(job, version); Require(job.State != "Completed", "已完成的导入不能重新映射");
        Require(!await db.Set<StatementRecord>().AnyAsync(x => x.UserId == user && x.ImportJobId == id), "此批次已用于外部流水对账，原始映射已冻结；请在对账工作台复核规范化字段");
        var accountId = body.GetProperty("accountId").GetString()!; var account = await Account(user, accountId); Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "请选择资金账户");
        var mapping = body.GetProperty("mapping"); var headers = JsonSerializer.Deserialize<string[]>(job.HeadersJson)!; var raw = JsonSerializer.Deserialize<string[][]>(job.RawRowsJson)!;
        var statementMode=body.TryGetProperty("purpose",out var purpose)&&purpose.GetString()=="Reconciliation";
        string Field(string[] row, string key) { var column = mapping.TryGetProperty(key, out var v) ? Array.IndexOf(headers, v.GetString()) : -1; return column >= 0 && column < row.Length ? CleanImportText(row[column]) : ""; }
        Require(new[] { "occurredAt", "amount", "type" }.All(k => mapping.TryGetProperty(k, out var v) && headers.Contains(v.GetString())), "请映射日期、金额和类型列");
        db.RemoveRange(job.Rows); job.Rows = []; job.AccountId = accountId;var savedMapping=JsonNode.Parse(mapping.GetRawText())!.AsObject();savedMapping.Remove("__purpose");if(statementMode)savedMapping["__purpose"]="Reconciliation";job.MappingJson=savedMapping.ToJsonString(); job.State = "Preview"; job.Version++;
        var standardTemplate=!statementMode&&headers.Contains("二级分类")&&headers.Contains("优惠金额")&&(headers.Contains("商品")||headers.Contains("商品名称"));
        var hierarchicalMapping=new[]{"category2","category3"}.Any(k=>mapping.TryGetProperty(k,out var v)&&!string.IsNullOrEmpty(v.GetString()));
        var importAccounts = await db.Accounts.Where(x => x.UserId == user && x.Status == "Active" && x.Type != "Receivable" && x.Type != "Payable" && x.Type != "ConsumerLoan" && x.Type != "SecuredLoan").ToListAsync();
        Account? ResolveImportAccount(string value) {
            var byId = importAccounts.SingleOrDefault(x => x.Id == value); if (byId != null) return byId;
            var matches = importAccounts.Where(x => x.Name == value || x.AccountCode == value || x.Alias == value).ToArray();
            return value.Length > 0 && matches.Length == 1 ? matches[0] : null;
        }
        var categories = await Categories(user); var merchants = await db.Directory.Where(x => x.UserId == user && x.Kind == "merchants").ToListAsync();
        for (var index = 0; index < raw.Length; index++)
        {
            var source = raw[index]; var typeRaw = Field(source, "type"); var type = typeRaw.Contains("收入") || typeRaw.Equals("Income", StringComparison.OrdinalIgnoreCase) ? "Income" : typeRaw.Contains("转账") || typeRaw.Contains("充值") || typeRaw.Contains("提现") || typeRaw.Equals("TopUp", StringComparison.OrdinalIgnoreCase) || typeRaw.Equals("Withdrawal", StringComparison.OrdinalIgnoreCase) || typeRaw.Equals("Transfer", StringComparison.OrdinalIgnoreCase) ? "Transfer" : typeRaw.Contains("支出") || typeRaw.Equals("Expense", StringComparison.OrdinalIgnoreCase) ? "Expense" : "Unknown";
            if(standardTemplate&&type!="Transfer") type=typeRaw.Equals("收入",StringComparison.OrdinalIgnoreCase)||typeRaw.Equals("Income",StringComparison.OrdinalIgnoreCase)?"Income":typeRaw.Equals("支出",StringComparison.OrdinalIgnoreCase)||typeRaw.Equals("Expense",StringComparison.OrdinalIgnoreCase)?"Expense":"Unknown";
            if(statementMode)type=StatementSourceKind(type,typeRaw);
            var transferKind = typeRaw.Contains("充值") || typeRaw.Equals("TopUp", StringComparison.OrdinalIgnoreCase) ? "TopUp" : typeRaw.Contains("提现") || typeRaw.Equals("Withdrawal", StringComparison.OrdinalIgnoreCase) ? "Withdrawal" : null;
            var accountRaw = Field(source, "account"); var rowAccount = accountRaw.Length == 0 ? account : ResolveImportAccount(accountRaw);
            var rowAccountId = rowAccount?.Id ?? "";
            var issues = new List<string>(); decimal amount = 0; try { amount = Money(CleanImportAmount(Field(source,"amount")), !statementMode);if(statementMode){Require(amount!=0,"金额不可为零");amount=Math.Abs(amount);} } catch (ApiException) { issues.Add("金额格式无效"); }
            DateTimeOffset occurred = default; var dateRaw = Field(source, "occurredAt"); if (DateTimeOffset.TryParse(dateRaw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                occurred = System.Text.RegularExpressions.Regex.IsMatch(dateRaw, @"(Z|[+-]\d{2}:?\d{2})$") ? parsed.ToUniversalTime() : new DateTimeOffset(parsed.DateTime, TimeSpan.FromHours(8)).ToUniversalTime(); else issues.Add("日期格式无效");
            if (type == "Unknown") issues.Add("交易类型无法识别"); var merchant = Field(source, "merchant"); var categoryName = Field(source, "category");
            Category? category=null;string? categoryMappingIssue=null;
            var second=Field(source,"category2");var third=Field(source,"category3");
            if(standardTemplate||hierarchicalMapping&&(categoryName.Length>0||second.Length>0||third.Length>0)){
                try{category=ResolveImportCategoryPath(categories,type,categoryName,second,third);}catch(ApiException e){categoryMappingIssue=e.Message;}
            } else category=categories.FirstOrDefault(x=>x.Status=="Active"&&x.ParentId!=null&&x.Kind==type&&x.Name==categoryName)??categories.FirstOrDefault(x=>x.Id==merchants.FirstOrDefault(m=>m.Name==merchant)?.CategoryId&&x.Kind==type&&x.Status=="Active");
            if (category is null && type == "Expense") category = categories.FirstOrDefault(x => x.Name == "不明消费" && x.Kind == "Expense");
            if (category is null && type == "Income") category = categories.FirstOrDefault(x => x.Name == "其他" && x.Kind == "Income");
            var currency = Field(source, "currency").ToUpperInvariant();
            var toRaw = Field(source, "toAccount"); var target = type == "Transfer" ? ResolveImportAccount(toRaw) : null;
            var fee = Field(source, "fee"); if (fee.Length == 0) fee = "0";
            var feeCategoryRaw = Field(source, "feeCategory");
            var feeCategories = categories.Where(x => x.Status == "Active" && x.ParentId != null && x.Kind == "Expense" && (x.Id == feeCategoryRaw || x.Name == feeCategoryRaw)).ToArray();
            var feeCategoryId = feeCategories.Length == 1 ? feeCategories[0].Id : null;
            var receivedAmount = Field(source, "receivedAmount"); var exchangeRate = Field(source, "exchangeRate");
            
            var external = Field(source, "externalId"); var row = new ImportRow { UserId = user, ImportJobId = job.Id, Index = index + 1, IdentityVersion = 2 };
            var node = JsonSerializer.SerializeToNode(new { id = row.Id, index = row.Index, occurredAt = occurred, amount = M(amount), type, transferKind, accountId = rowAccountId, toAccountId = target?.Id, fee, feeCategoryId, receivedAmount = receivedAmount.Length == 0 ? null : receivedAmount, exchangeRate = exchangeRate.Length == 0 ? null : exchangeRate, currency = rowAccount?.Currency ?? currency, sourceCurrency = currency, sourceDateValid = occurred != default, merchant, productName=type=="Expense"||standardTemplate?Field(source,"productName"):"", discountAmount=CleanImportAmount(Field(source,"discountAmount")) is {Length:>0} discount?discount:"0", standardIncomeExpense=standardTemplate, categoryMappingIssue, note = Field(source, "note").Length==0&&type!="Expense"&&!standardTemplate?Field(source,"productName"):Field(source,"note"), categoryId = category?.Id, externalId = external, status = "Ready", issues, needsReview = category?.Name == "不明消费", recommendation = category==null?null:string.Join(" / ",new CategoryHierarchy(categories).Path(category.Id).Select(c=>c.Name)) }, Json)!.AsObject();
            node["rawMerchant"]=merchant;node["sourceStatus"]=Field(source,"status");node["sourceLine"]=job.HeaderRow+index+1;
            node["postedAt"]=Field(source,"postedAt");node["counterpartyAccount"]=Field(source,"counterpartyAccount");node["paymentSource"]=Field(source,"paymentSource");
            node["sourceAmount"]=CleanImportAmount(Field(source,"amount"));node["sourceType"]=typeRaw;node["statementDirection"]=Field(source,"statementDirection");
            node["sourceExcluded"]=source.All(string.IsNullOrWhiteSpace) || ExcludedImportStatus(Field(source,"status"));
            await NormalizeImportMerchant(user,node);
            if(!standardTemplate&&!hierarchicalMapping&&node["merchantId"]?.GetValue<string>() is {} mid && (category==null || category.Name=="不明消费" || category.Name=="其他")){
                var master=await MerchantMaster(user,mid);var mappedCategory=categories.SingleOrDefault(x=>x.Id==master.CategoryId && x.Kind==type && x.Status=="Active" && x.ParentId!=null);
                if(mappedCategory!=null){node["categoryId"]=mappedCategory.Id;node["recommendation"]=mappedCategory.Name;node["needsReview"]=false;}
            }
            if(statementMode){
                if(rowAccount==null)issues.Add("无法识别来源账户");if(currency.Length>0&&rowAccount?.Currency!=currency)issues.Add("来源币种与账户币种不一致");
                try{_ = StatementPostingDate(Field(source,"postedAt"));node["statementAmount"]=M(StatementSignedAmount(Money(Field(source,"amount").Length>0?CleanImportAmount(Field(source,"amount")):"0"),type,Field(source,"statementDirection"),rowAccount?.Type??""));}catch(ApiException e){issues.Add(e.Message);}
                row.Status=node["sourceExcluded"]?.GetValue<bool>()==true?"Skipped":issues.Count==0?"Ready":"Invalid";node["status"]=row.Status;node["issues"]=JsonSerializer.SerializeToNode(issues,Json);node["needsReview"]=false;row.Fingerprint=AuthService.Hash(job.SourceHash+":"+row.Index);row.DataJson=node.ToJsonString();
            }else{row.DataJson = node.ToJsonString(); await ValidateImportRow(user, job, row, issues);}job.Rows.Add(row);
            RecordImportCleaning(user,job,row,"Mapped","Rule","字段映射、全半角/金额/上海时区规范化、来源状态排除、商户精确及别名匹配；不推测金额正负或复杂业务",JsonSerializer.Serialize(new{columns=headers,values=source},Json));
        }
        return ImportDto(job);
    }
    private async Task ValidateImportRow(string user, ImportJob job, ImportRow row, List<string>? issues = null)
    {
        var node = JsonNode.Parse(row.DataJson)!.AsObject(); issues ??= [];
        if(node["sourceExcluded"]?.GetValue<bool>()==true){row.Status="Skipped";node["issues"]=new JsonArray("来源为空行或账单明确标记关闭、失败、取消，不入账");row.DataJson=node.ToJsonString();return;}
        try{await NormalizeImportMerchant(user,node);}catch(ApiException e){issues.Add(e.Message);}
        var type = node["type"]!.GetValue<string>();
        var accountId = node["accountId"]?.GetValue<string>() ?? job.AccountId;
        var account = await db.Accounts.SingleOrDefaultAsync(x => x.UserId == user && x.Id == accountId && x.Status == "Active" && x.Type != "Receivable" && x.Type != "Payable" && x.Type != "ConsumerLoan" && x.Type != "SecuredLoan");
        if (account == null) { issues.Add("转出/资金账户不存在、已停用或名称不唯一，请用账户ID或唯一名称"); await ClassifyImportIdentity(user, job, row, node, issues); return; }
        node["accountId"] = account.Id; node["currency"] = account.Currency;
        if(node["standardIncomeExpense"]?.GetValue<bool>()==true){
            if(type is not ("Expense" or "Income"))issues.Add("标准收支模板仅支持支出和收入，转账请使用专用模板");
            var sourceStatus=node["sourceStatus"]?.GetValue<string>()??"";
            if(sourceStatus.Length>0&&!CompletedImportStatus(sourceStatus))issues.Add("交易状态尚未完成或无法识别，不自动入账");
        }
        if(node["categoryMappingIssue"]?.GetValue<string>() is {Length:>0} categoryIssue)issues.Add(categoryIssue);
        var productName=node["productName"]?.GetValue<string>()??"";
        if(productName.Length>200)issues.Add("商品名最多200个字符");
        if(type!="Expense"&&productName.Length>0)issues.Add("商品名仅用于支出；收入商品说明请填写备注");
        try {
            var promotion=ImportPromotion(node);
            var discount=Money(node["discountAmount"]?.GetValue<string>() is {Length:>0} rawDiscount?rawDiscount:"0");node["discountAmount"]=M(discount);
            node["originalAmount"]=promotion?.OriginalAmount??node["amount"]?.GetValue<string>();
        } catch(ApiException e){issues.Add(e.Message);}
        if (type is not ("Expense" or "Income" or "Transfer")) issues.Add("交易类型无法识别");
        if (node["sourceDateValid"]?.GetValue<bool>() == false) issues.Add("日期格式无效");
        var sourceCurrency = node["sourceCurrency"]?.GetValue<string>(); if (!string.IsNullOrEmpty(sourceCurrency) && sourceCurrency != account.Currency) issues.Add("账单币种与账户不一致");
        if (type == "Transfer")
        {
            var targetId = node["toAccountId"]?.GetValue<string>();
            var target = await db.Accounts.SingleOrDefaultAsync(x => x.UserId == user && x.Id == targetId && x.Status == "Active" && x.Id != account.Id && x.Type != "Receivable" && x.Type != "Payable" && x.Type != "ConsumerLoan" && x.Type != "SecuredLoan");
            if (target == null) issues.Add("转入账户无效、与转出账户相同或名称不唯一");
            var kind = node["transferKind"]?.GetValue<string>(); if (kind is not (null or "" or "TopUp" or "Withdrawal")) issues.Add("无效的转账用途");
            try {
                var fee = Money(node["fee"]?.GetValue<string>() ?? "0"); Require(fee >= 0, "手续费不能为负数");
                if (fee > 0) await Category(user, node["feeCategoryId"]?.GetValue<string>() ?? "", "Expense");
                if (target != null && target.Currency != account.Currency) {
                    var received = Money(node["receivedAmount"]?.GetValue<string>(), true);
                    Require(decimal.TryParse(node["exchangeRate"]?.GetValue<string>(), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var rate) && rate >= 0.00000001m && rate <= 1000000m && decimal.Round(rate, 8) == rate, "跨币种转账需填写有效汇率（最多8位小数）");
                    Require(decimal.Round(Money(node["amount"]?.GetValue<string>(), true) * rate, 2, MidpointRounding.AwayFromZero) == received, "到账金额与汇率不一致");
                }
                else if (target != null) { node["receivedAmount"] = M(Money(node["amount"]?.GetValue<string>(), true)); node["exchangeRate"] = null; }
            } catch (ApiException e) { issues.Add(e.Message); }
        }
        else {
            node["fee"] = "0"; node["transferKind"] = null; node["toAccountId"] = null; node["receivedAmount"] = null; node["exchangeRate"] = null;
            try { await Category(user, node["categoryId"]?.GetValue<string>() ?? "", type); } catch (ApiException) { issues.Add("分类无效"); }
        }
        try { Money(node["amount"]!.GetValue<string>(), true); Date(node["occurredAt"]!.GetValue<string>()); } catch (ApiException e) { issues.Add(e.Message); }
        var external = node["externalId"]?.GetValue<string>();
        if (external?.Length > 256) issues.Add("外部流水号最多256字符");
        await ClassifyImportIdentity(user, job, row, node, issues);
    }
    public static JsonObject ImportRowDto(ImportRow row)
    {
        var node = JsonNode.Parse(row.DataJson)!.AsObject(); node["status"] = row.Status;
        node["reviewDecision"] = row.ReviewDecision; node["reviewedAt"] = JsonSerializer.SerializeToNode(row.ReviewedAt, Json); return node;
    }
    public async Task<object> ImportRows(string user, string id, IQueryCollection p)
    {
        Require(await db.Imports.AnyAsync(x => x.UserId == user && x.Id == id), "导入任务不存在"); var (page, size) = Paging(p); var status = p["status"].ToString();
        var q = db.ImportRows.Where(x => x.UserId == user && x.ImportJobId == id && (status == "" || x.Status == status)); var total = await q.CountAsync(); var rows = await q.OrderBy(x => x.Index).Skip((page - 1) * size).Take(size).ToListAsync();
        return new { items = rows.Select(ImportRowDto), total, page, pageSize = size };
    }
    public async Task<object> PatchImport(string user, string id, string? rowId, JsonElement body, string? version)
    {
        Require(body.ValueKind==JsonValueKind.Object && body.EnumerateObject().Count() is >0 and <=17,"修改内容无效");
        var job = await Import(user, id); Version(job, version); Require(job.State == "Preview", "当前任务不能修改");
        Require(!await db.Set<StatementRecord>().AnyAsync(x => x.UserId == user && x.ImportJobId == id), "此外部流水已接收，原始预览不可修改；请在对账工作台修正规范化字段");
        var selected = rowId is null ? job.Rows.Where(x => JsonNode.Parse(x.DataJson)!["needsReview"]?.GetValue<bool>() == true) : job.Rows.Where(x => x.Id == rowId);
        var rows = selected.ToArray(); Require(rows.Length > 0, "没有可修改的导入行");
        job.Version++;
        foreach (var row in rows) {
            var before=row.DataJson;var node=JsonNode.Parse(before)!.AsObject();
            foreach(var value in body.EnumerateObject()) {
                Require(new[]{"type","categoryId","amount","accountId","toAccountId","transferKind","fee","feeCategoryId","receivedAmount","exchangeRate","merchant","merchantId","note","occurredAt","productName","discountAmount"}.Contains(value.Name),"不支持的修改字段");
                Require(value.Value.ValueKind is JsonValueKind.String or JsonValueKind.Null,"修改值须为文本或空值");
                Require(value.Value.ValueKind!=JsonValueKind.Null || !new[]{"type","amount","accountId","occurredAt"}.Contains(value.Name),"类型、金额、账户和日期不可为空");
                node[value.Name]=JsonNode.Parse(value.Value.GetRawText());
            }
            if(body.TryGetProperty("categoryId",out _))node["categoryMappingIssue"]=null;
            if(body.TryGetProperty("merchant",out _))node["merchantId"]=null;
            if(body.TryGetProperty("occurredAt",out var date)) {
                var occurred=Date(date.GetString()??"");node["occurredAt"]=occurred.ToString("O");node["sourceDateValid"]=true;
            }
            Require((node["merchant"]?.GetValue<string>()?.Length??0)<=200 && (node["note"]?.GetValue<string>()?.Length??0)<=2000,"商户或备注过长");
            node["needsReview"]=false;row.DataJson=node.ToJsonString();await ValidateImportRow(user,job,row);
            RecordImportCleaning(user,job,row,"ManualEdit","User","人工核对修改导入预览",before);
        }
        return ImportDto(job);
    }
    public async Task<object> CommitImport(string user, string id, string? version, ImportCommitOptions options, string operationKey, string traceId)
    {
        var job = await Import(user, id); Version(job, version); Require(job.State == "Preview", "导入任务状态已改变");
        Require(!IsStatementImport(job),"此批次用于外部流水对账，不可作为正式交易入账");
        Require(!await db.Set<StatementRecord>().AnyAsync(x => x.UserId == user && x.ImportJobId == id), "此批次已用于外部流水对账，不可直接批量入账；遗漏交易请单独复核补记");
        if (job.Rows.Any(x => x.IdentityVersion < 2)) throw new ApiException(409, "重复检测规则已升级，请重新检查预览后确认", "IMPORT_IDENTITY_REVIEW_REQUIRED");
        var changed = new List<ImportOutcome>();
        foreach (var row in job.Rows.Where(x => x.Status is "Ready" or "Skipped").OrderBy(x => x.Index).ToArray())
        {
            var accepted = row.Status;var merchantBefore=JsonNode.Parse(row.DataJson)!["merchant"]?.GetValue<string>();
            try { await ValidateImportRow(user, job, row); if (row.Status != accepted || merchantBefore!=JsonNode.Parse(row.DataJson)!["merchant"]?.GetValue<string>()) changed.Add(Outcome(row)); }
            catch (ApiException error) { changed.Add(new(row.Id, row.Index, "Invalid", [error.Message])); }
        }
        if (changed.Count > 0) throw new ImportPreviewChanged(changed.ToArray());
        var unresolved = job.Rows.Where(x => x.Status == "Suspected").Select(Outcome).ToArray();
        if (unresolved.Length > 0) throw new ImportPreviewChanged(unresolved, "IMPORT_DUPLICATE_REVIEW_REQUIRED", "请逐行确认疑似重复；系统不会自动跳过这些记录");
        var unconfirmed = job.Rows.Where(x => x.Status == "Duplicate" && !options.SkipDuplicates || x.Status == "Invalid" && !options.SkipInvalid).Select(Outcome).ToArray();
        if (unconfirmed.Length > 0) throw new ImportPreviewChanged(unconfirmed, "IMPORT_SKIPS_NOT_CONFIRMED", "请明确确认跳过重复或异常记录后再提交");
        Require(job.Rows.Any(x => x.Status is "Ready" or "Skipped"), "没有可导入记录");
        foreach (var row in job.Rows.Where(x => x.Status == "Ready").OrderBy(x => x.Index))
        {
            var n = JsonNode.Parse(row.DataJson)!; var request = new SaveTransaction(n["type"]!.GetValue<string>(), n["amount"]!.GetValue<string>(), n["accountId"]?.GetValue<string>() ?? job.AccountId!, Date(n["occurredAt"]!.GetValue<string>()), n["note"]?.GetValue<string>() ?? "", n["categoryId"]?.GetValue<string>(), n["merchant"]?.GetValue<string>(), n["toAccountId"]?.GetValue<string>(), Fee: n["type"]!.GetValue<string>() == "Transfer" ? n["fee"]?.GetValue<string>() ?? "0" : "0", FeeCategoryId: n["feeCategoryId"]?.GetValue<string>(), ReceivedAmount: n["receivedAmount"]?.GetValue<string>(), ExchangeRate: n["exchangeRate"]?.GetValue<string>(), TransferKind: n["type"]!.GetValue<string>() == "Transfer" ? n["transferKind"]?.GetValue<string>() : null, ProductName:n["productName"]?.GetValue<string>(), Promotion:ImportPromotion(n));
            var result = await SaveTransaction(user, request); var txId = JsonSerializer.SerializeToNode(result, Json)!["id"]!.GetValue<string>(); var tx = await db.Transactions.FindAsync(txId) ?? throw new InvalidOperationException("Created import transaction is missing"); tx.ImportJobId = id; tx.ExternalId = n["externalId"]?.GetValue<string>(); row.Status = "Imported"; job.Imported++;
        }
        job.State = "Completed"; job.Version++;
        db.ImportAttempts.Add(new ImportAttempt { UserId = user, ImportJobId = id, OperationKey = operationKey, TraceId = traceId[..Math.Min(36, traceId.Length)], State = "Completed", Code = "IMPORT_COMPLETED", Message = "有效记录整批导入完成；跳过记录保留在逐行结果中", Total = job.Rows.Count, Imported = job.Imported, Skipped = job.Rows.Count(x => x.Status != "Imported"), OutcomesJson = JsonSerializer.Serialize(job.Rows.OrderBy(x => x.Index).Select(Outcome), Json) });
        return ImportDto(job);
    }
}





