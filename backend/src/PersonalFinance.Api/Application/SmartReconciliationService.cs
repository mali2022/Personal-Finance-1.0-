using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record StatementImportInput(string ImportJobId, string AccountId, string Version, int AfterIndex = 0);
public sealed record StatementConfirmInput(string TransactionId, string Version, string TransactionVersion, string Reason);
public sealed record StatementResolveInput(string Version, string State, string Reason);
public sealed record StatementCorrectionInput(string Version,string Amount,DateTimeOffset OccurredAt,DateTimeOffset? PostedAt,string Merchant,string Note,string Type,string PaymentSource,string Reason);
public sealed record StatementRuleInput(string AccountId, string Name, string Merchant, string Type, string Currency, string Keyword, int DateTolerance = 3, int Priority = 0, string AmountTolerance = "0", bool RequireReference = true, bool Enabled = true, bool AutoConfirm = false, string? Version = null,string? ExpectedAmount=null);
public sealed record StatementBalanceInput(string AccountId, DateTimeOffset StartsAt, DateTimeOffset EndsAt, string OpeningBalance, string BankClosingBalance, string? PreviewToken = null,bool ReviewedOutstanding=false,string OutstandingReason="");

public sealed partial class FinanceService
{
    private static bool IsStatementImport(ImportJob job)=>JsonNodePurpose(job.MappingJson)=="Reconciliation";
    private static string? JsonNodePurpose(string json){using var doc=JsonDocument.Parse(json);return doc.RootElement.TryGetProperty("__purpose",out var p)&&p.ValueKind==JsonValueKind.String?p.GetString():null;}
    private ReconciliationCandidate ReconciliationScore(StatementRecord row, FinanceTransaction t, decimal ledger, ReconciliationIdentityContext? identity = null) => SmartReconciliationEngine.Score(row, t, ledger, configuration?.GetValue<int?>("SmartReconciliation:HighThreshold") ?? 80, configuration?.GetValue<int?>("SmartReconciliation:MediumThreshold") ?? 55,identity);
    private static ReconciliationIdentityContext StatementIdentity(string user,StatementRecord row,FinanceTransaction t,IReadOnlyDictionary<string,Account> accounts) {
        bool? counterparty=null;bool? payment=null;
        var otherId=t.AccountId==row.AccountId?t.ToAccountId:t.AccountId;
        var fullCounterparty=row.CounterpartyKey.Length>0&&(row.CounterpartyHint.Length!=4||row.CounterpartyKey!=StatementCounterpartyKey(user,row.CounterpartyHint));
        if(fullCounterparty && otherId!=null && accounts.TryGetValue(otherId,out var other)) {
            if(!string.IsNullOrEmpty(other.CardNumber))counterparty=StatementCounterpartyKey(user,other.CardNumber)==row.CounterpartyKey;
            if(other.AccountCode.Length>0 && StatementCounterpartyKey(user,other.AccountCode)==row.CounterpartyKey)counterparty=true;
        }
        if(row.PaymentSource.Length>0 && accounts.TryGetValue(row.AccountId,out var source)) {
            var normalized=SmartReconciliationEngine.Normalize(row.PaymentSource);
            if(new[]{source.Name,source.Alias,source.Institution}.Any(x=>!string.IsNullOrEmpty(x)&&SmartReconciliationEngine.Normalize(x)==normalized))payment=true;
        }
        return new(counterparty,payment);
    }
    private async Task<Dictionary<string,Account>> StatementIdentityAccounts(string user,StatementRecord row,IEnumerable<FinanceTransaction> transactions) {
        var ids=transactions.SelectMany(t=>new[]{t.AccountId,t.ToAccountId}).Append(row.AccountId).Where(x=>x!=null).Distinct().ToArray();
        return await db.Accounts.AsNoTracking().Where(a=>a.UserId==user&&ids.Contains(a.Id)).ToDictionaryAsync(a=>a.Id);
    }
    private static bool StatementRuleApplies(StatementRule r,StatementRecord row,ReconciliationCandidate c,decimal? sourceAmount=null) => r.Enabled && (r.ExpectedAmount==null||Math.Abs(Math.Abs(sourceAmount??row.Amount)-r.ExpectedAmount.Value)<=r.AmountTolerance) && r.Currency==row.Currency && (r.Type==""||r.Type==c.Type) && (r.Merchant=="" || SmartReconciliationEngine.Normalize(r.Merchant)==SmartReconciliationEngine.Normalize(row.Merchant) && SmartReconciliationEngine.Normalize(r.Merchant)==SmartReconciliationEngine.Normalize(c.Merchant)) && (r.Keyword==""||SmartReconciliationEngine.Normalize(row.Note).Contains(SmartReconciliationEngine.Normalize(r.Keyword))) && Math.Min(c.DateDeviation,c.PostedDateDeviation??c.DateDeviation)<=r.DateTolerance && Math.Abs(c.Difference)<=r.AmountTolerance && (!r.RequireReference||c.Reasons.Contains("ReferenceExact"));
    private async Task ValidateReconciliationBusiness(string user,FinanceTransaction t){
        Require(t.Entries.Count>=2&&t.Entries.All(e=>e.UserId==user&&e.ExchangeRate>0)&&t.Entries.Sum(e=>e.BaseAmount)==0,"原交易分录不完整、归属异常或借贷不平衡，请先复核账务");
        if(t.Type=="Refund")Require(await db.Transactions.AnyAsync(o=>o.UserId==user&&o.Id==t.OriginalTransactionId&&o.Type=="Expense"&&o.Status!="Deleted"&&o.Currency==t.Currency),"退款缺少有效且币种一致的原消费，请先修正关联");
        if(t.Type is "Transfer" or "CreditCardPayment")Require(t.ToAccountId!=null&&t.ToAccountId!=t.AccountId&&t.Entries.Any(e=>e.Kind=="Account"&&e.AccountId==t.AccountId&&e.Amount<0)&&t.Entries.Any(e=>e.Kind=="Account"&&e.AccountId==t.ToAccountId&&e.Amount>0),"转账或还款的两端分录不完整，请先修正账务");
    }
    private async Task<StatementRecord> StatementOwned(string user, string id) => await db.Set<StatementRecord>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "流水不存在");
    public static object StatementDto(StatementRecord x) => new { x.Id, x.AccountId, x.ImportJobId, x.ImportRowId, x.Reference, x.Currency, amount = M(x.Amount), x.OccurredAt, x.PostedAt, x.CounterpartyHint, x.PaymentSource, x.Merchant, x.Note, x.Type, x.State, x.Resolution, version = x.Version.ToString() };
    public static string StatementCounterpartyKey(string user,string value) => value.Length==0 ? "" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(user+":"+SmartReconciliationEngine.Normalize(value))));
    private static DateTimeOffset? StatementPostingDate(string raw) {
        if(raw.Length==0)return null;
        Require(DateTimeOffset.TryParse(raw,CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed),"银行入账日期格式无效");
        Require(parsed.Year>=1900&&parsed.Year<=DateTimeOffset.UtcNow.Year+1,"银行入账日期超出有效范围");
        return System.Text.RegularExpressions.Regex.IsMatch(raw,@"(Z|[+-]\d{2}:?\d{2})$")?parsed.ToUniversalTime():new DateTimeOffset(parsed.DateTime,TimeSpan.FromHours(8)).ToUniversalTime();
    }
    private static string StatementSourceKind(string normalized,string raw) {
        var key=SmartReconciliationEngine.Normalize(raw);if(new[]{"失败","撤销","关闭","取消","冲正"}.Any(key.Contains))return "Unknown";
        if(normalized is "Expense" or "Income" or "Transfer" or "Refund" or "CreditCardPayment")return normalized;
        if(key.Contains("退款")||key=="REFUND")return "Refund";
        if(key.Contains("信用卡还款")||key=="CREDITCARDPAYMENT")return "CreditCardPayment";
        return key is "DEBIT" or "支" or "出" or "付款"?"Expense":key is "CREDIT" or "收" or "入" or "收款"?"Income":normalized;
    }
    private static decimal StatementSignedAmount(decimal raw,string type,string rawDirection,string accountType){
        Require(type is "Expense" or "Income" or "Transfer" or "Refund" or "CreditCardPayment","流水类型无法识别");Require(type!="CreditCardPayment"||accountType.Length>0,"识别账户后才能确定还款方向");
        Require(raw!=0,"流水金额不可为零");var direction=SmartReconciliationEngine.Normalize(rawDirection);var incoming=direction is "收入" or "收" or "入" or "收款" or "CREDIT" or "IN" or "INCOME";var outgoing=direction is "支出" or "支" or "出" or "付款" or "DEBIT" or "OUT" or "EXPENSE";Require(direction.Length==0||incoming||outgoing,"流水方向无法识别");Require(type!="Transfer"||direction.Length>0||raw<0,"正数转账流水必须映射明确的收付方向");var sign=incoming?1:outgoing?-1:raw<0?-1:type is "Income" or "Refund"||type=="CreditCardPayment"&&accountType=="CreditCard"?1:-1;return Math.Abs(raw)*sign;
    }

    public async Task<object> ImportStatements(string user, StatementImportInput input)
    {
        var account = await Account(user, input.AccountId, false);
        var job = await db.Imports.SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.ImportJobId) ?? throw new ApiException(404, "导入批次不存在");
        Version(job, input.Version); Require(input.AfterIndex >= 0, "起始行无效");
        var rows = await db.ImportRows.Where(x => x.UserId == user && x.ImportJobId == job.Id && x.Index > input.AfterIndex).OrderBy(x => x.Index).Take(200).ToArrayAsync();
        var lastIndex=rows.LastOrDefault()?.Index??input.AfterIndex;
        // Raw provenance is stable across remapping, including legacy identity algorithms.
        var provenance=await (from s in db.Set<StatementRecord>() join r in db.ImportRows on s.ImportRowId equals r.Id join j in db.Imports on r.ImportJobId equals j.Id where s.UserId==user&&r.UserId==user&&j.UserId==user&&j.SourceHash==job.SourceHash&&r.Index>input.AfterIndex&&r.Index<=lastIndex select new{Record=s,r.Index}).Take(401).ToArrayAsync();
        Require(provenance.Length<=400,"原文件行存在过多历史来源关系，请先人工核查");
        var imported = 0; var duplicates = 0; var failures = new List<object>();
        var identities = new Dictionary<string,string>(StringComparer.Ordinal);
        foreach (var r in rows) {
            var node = JsonSerializer.Deserialize<JsonElement>(r.DataJson);
            string Field(string key) => node.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
            var type = StatementSourceKind(Field("type"),Field("sourceType"));
            if (node.TryGetProperty("sourceExcluded", out var excluded) && excluded.ValueKind == JsonValueKind.True) { failures.Add(new { r.Id, code = "SOURCE_EXCLUDED" }); continue; }
            if (Field("sourceCurrency").Length > 0 && Field("sourceCurrency") != account.Currency) { failures.Add(new { r.Id, code = "SOURCE_CURRENCY_MISMATCH" }); continue; }
            if (Field("accountId") != account.Id || Field("currency") != account.Currency || type is not ("Expense" or "Income" or "Transfer" or "Refund" or "CreditCardPayment") || !DateTimeOffset.TryParse(Field("occurredAt"), out var date) || date.Year<1900 || date.Year>DateTimeOffset.UtcNow.Year+1) { failures.Add(new { r.Id, code = "SOURCE_MAPPING_INVALID" }); continue; }
            decimal amount;
            DateTimeOffset? posted;
            try { var rawAmount=Money(Field("sourceAmount").Length>0?Field("sourceAmount"):Field("amount"));amount=StatementSignedAmount(rawAmount,type,Field("statementDirection"),account.Type);posted=StatementPostingDate(Field("postedAt")); } catch (ApiException) { failures.Add(new { r.Id, code = "AMOUNT_DIRECTION_OR_POSTING_DATE_INVALID" }); continue; }
            var reference = Field("externalId").Trim(); var merchant = Field("merchant"); var note = Field("note");
            var counterparty=SmartReconciliationEngine.Normalize(Field("counterpartyAccount"));var paymentSource=Field("paymentSource");
            if(reference.Length>200||merchant.Length>200||note.Length>2000||counterparty.Length>100||paymentSource.Length>200){failures.Add(new{r.Id,code="SOURCE_FIELD_TOO_LONG"});continue;}
            // No reference: preserve identical rows within a file by including the source row index.
            var key = reference.Length > 0 ? "ref:" + reference : $"file:{job.SourceHash}:{r.Index}";
            if(reference.Length==0&&job.SourceHash.Length==0){failures.Add(new{r.Id,code="SOURCE_IDENTITY_MISSING"});continue;}
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
            var factsHash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{amount,date,posted,currency=account.Currency,reference,merchant=Field("rawMerchant").Length>0?Field("rawMerchant"):merchant,counterparty=StatementCounterpartyKey(user,counterparty),paymentSource,type},Json))));
            var origin=provenance.Where(x=>x.Index==r.Index).Select(x=>x.Record).ToArray();
            var sameAccount=origin.Where(x=>x.AccountId==account.Id).ToArray();
            if(sameAccount.Length>1||origin.Any(x=>x.AccountId!=account.Id&&x.State!="Ignored")){failures.Add(new{r.Id,code="SOURCE_IDENTITY_CONFLICT"});continue;}
            var existing = sameAccount.SingleOrDefault()??await db.Set<StatementRecord>().SingleOrDefaultAsync(x => x.UserId == user && x.AccountId == account.Id && x.IdentityHash == hash);
            if (existing != null && (existing.SourceFactsHash.Length>0?existing.SourceFactsHash!=factsHash:existing.Amount != amount || existing.Currency != account.Currency || existing.OccurredAt != date)) { failures.Add(new { r.Id, code = "SOURCE_IDENTITY_CONFLICT" }); continue; }
            if(identities.TryGetValue(hash,out var previousFacts)&&previousFacts!=factsHash){failures.Add(new{r.Id,code="SOURCE_IDENTITY_CONFLICT"});continue;}
            if (!identities.TryAdd(hash,factsHash) || existing != null) { duplicates++; continue; }
            db.Add(new StatementRecord { UserId = user, AccountId = account.Id, ImportJobId = job.Id, ImportRowId = r.Id, IdentityHash = hash, SourceFactsHash=factsHash, Reference = reference, Currency = account.Currency, Amount = amount, OccurredAt = date, PostedAt=posted, CounterpartyKey=StatementCounterpartyKey(user,counterparty),CounterpartyHint=counterparty.Length>4?counterparty[^4..]:counterparty,PaymentSource=paymentSource, Merchant = merchant, Note = note, Type = type }); imported++;
        }
        return new { imported, duplicates, failures, processed = rows.Length, nextIndex = rows.LastOrDefault()?.Index ?? input.AfterIndex, hasMore = rows.Length == 200 };
    }

    public async Task<object> StatementWorkspace(string user, string accountId, IQueryCollection p)
    {
        await Account(user, accountId, false); var (page, size) = Paging(p);
        var all = db.Set<StatementRecord>().AsNoTracking().Where(x => x.UserId == user && x.AccountId == accountId);
        var summary = await all.GroupBy(x => x.State).Select(g => new { state = g.Key, count = g.Count(), grossAmount = g.Sum(x => Math.Abs(x.Amount)) }).ToArrayAsync();
        var conflicts = all.Where(r => db.Set<StatementLink>().Any(l => l.UserId == user && l.StatementRecordId == r.Id && l.State == "Confirmed" && !db.Transactions.Any(t => t.UserId == user && t.Id == l.TransactionId && t.Version == l.TransactionVersion && t.Status != "Deleted")));
        var conflictCount = await conflicts.CountAsync();
        var matchedConflicts = await conflicts.CountAsync(r => r.State == "Matched");
        var recent = await db.Set<StatementLink>().AsNoTracking().Where(l => l.UserId == user && l.AccountId == accountId).OrderByDescending(l => l.CreatedAt).Take(10).Select(l => new { l.Id, l.StatementRecordId, l.TransactionId, l.State, l.CreatedAt, l.EngineVersion }).ToArrayAsync();
        var q = all;
        var batchId=p["importJobId"].ToString();Require(batchId.Length<=36,"批次标识无效");if(batchId.Length>0)q=q.Where(r=>r.ImportJobId==batchId);
        if (!string.IsNullOrEmpty(p["state"])) q = q.Where(x => x.State == p["state"].ToString());
        var search = p["search"].ToString(); Require(search.Length <= 100, "搜索过长");
        if (search.Length > 0) q = q.Where(x => x.Merchant.Contains(search) || x.Reference.Contains(search));
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(StatementDto), total, page, pageSize = size, conflictCount, recent, summary = summary.Select(x => new { x.state, x.count, grossAmount = M(x.grossAmount) }), denominator = summary.Sum(x => x.count), numerator = summary.Where(x => x.state == "Matched").Sum(x => x.count) - matchedConflicts, amountBasis = "AbsoluteAccountCurrency", engineVersion = "rules-2.0.0" };
    }

    public async Task<object> StatementCandidates(string user, string id)
    {
        var row = await StatementOwned(user, id); await Account(user, row.AccountId, false);
        var start = row.OccurredAt.AddDays(-SmartReconciliationEngine.DateWindow); var end = row.OccurredAt.AddDays(SmartReconciliationEngine.DateWindow);
        var postedStart=row.PostedAt?.AddDays(-SmartReconciliationEngine.DateWindow);var postedEnd=row.PostedAt?.AddDays(SmartReconciliationEngine.DateWindow);
        var active = db.Set<StatementLink>().Where(l => l.UserId == user && l.AccountId == row.AccountId && l.State == "Confirmed");
        // Exact references use the existing indexed key before the bounded date window.
        var referenceIds=row.Reference.Length==0?Array.Empty<string>():await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status!="Deleted"&&t.ExternalId==row.Reference&&t.Entries.Any(e=>e.UserId==user&&e.Kind=="Account"&&e.AccountId==row.AccountId&&e.Currency==row.Currency)).OrderBy(t=>t.Id).Take(SmartReconciliationEngine.CandidateLimit+1).Select(t=>t.Id).ToArrayAsync();
        var transactionQuery = db.Transactions.AsNoTracking().TagWith("SmartReconciliationCandidates/v2").Where(t => t.UserId == user && t.Status != "Deleted" && (referenceIds.Contains(t.Id) || (t.OccurredAt >= start && t.OccurredAt <= end) || (postedStart != null && t.OccurredAt >= postedStart && t.OccurredAt <= postedEnd)) && t.Entries.Any(e => e.UserId == user && e.Kind == "Account" && e.AccountId == row.AccountId && e.Currency == row.Currency) && !active.Any(l => l.TransactionId == t.Id && l.StatementRecordId == row.Id) && (t.Entries.Where(e => e.UserId == user && e.Kind == "Account" && e.AccountId == row.AccountId && e.Currency == row.Currency).Sum(e => e.Amount) != (active.Where(l => l.TransactionId == t.Id).Sum(l => (decimal?)l.Amount) ?? 0)));
        var ordered=referenceIds.Length==0?transactionQuery.OrderBy(t=>t.OccurredAt).ThenBy(t=>t.Id):transactionQuery.OrderByDescending(t=>referenceIds.Contains(t.Id)).ThenBy(t=>t.OccurredAt).ThenBy(t=>t.Id);
        var transactions=await ordered.Take(SmartReconciliationEngine.CandidateLimit+1).Include(t=>t.Entries).ToArrayAsync();
        var truncated = transactions.Length > SmartReconciliationEngine.CandidateLimit || referenceIds.Length > SmartReconciliationEngine.CandidateLimit;
        var ids = transactions.Select(t => t.Id).ToArray();
        var allocated = await active.Where(l => ids.Contains(l.TransactionId)).GroupBy(l => l.TransactionId).Select(g => new { id = g.Key, amount = g.Sum(l => l.Amount) }).ToDictionaryAsync(x => x.id, x => x.amount);
        var remainder = row.Amount - (await active.Where(l => l.StatementRecordId == row.Id).SumAsync(l => (decimal?)l.Amount) ?? 0);
        var scoringRow = new StatementRecord { UserId = user, AccountId = row.AccountId, Currency = row.Currency, Amount = remainder, OccurredAt = row.OccurredAt,PostedAt=row.PostedAt,CounterpartyKey=row.CounterpartyKey,PaymentSource=row.PaymentSource, Merchant = (await ResolveMerchant(user, row.Merchant))?.Name ?? row.Merchant, Note = row.Note, Type = row.Type, Reference = row.Reference };
        var identityAccounts=await StatementIdentityAccounts(user,row,transactions);
        foreach (var t in transactions) t.Merchant = string.IsNullOrEmpty(t.Merchant) ? t.Merchant : (await ResolveMerchant(user, t.Merchant))?.Name ?? t.Merchant;
        var candidates = transactions.Take(SmartReconciliationEngine.CandidateLimit).Select(t => ReconciliationScore(scoringRow, t, t.Entries.Where(e => e.Kind == "Account" && e.AccountId == row.AccountId && e.Currency == row.Currency).Sum(e => e.Amount) - allocated.GetValueOrDefault(t.Id), StatementIdentity(user,row,t,identityAccounts))).OrderByDescending(x => x.Score).ThenBy(x => x.TransactionId).ToArray();
        var invalidBusiness=new HashSet<string>();foreach(var t in transactions){try{await ValidateReconciliationBusiness(user,t);}catch(ApiException){invalidBusiness.Add(t.Id);}}candidates=candidates.Select(c=>invalidBusiness.Contains(c.TransactionId)?c with{Score=0,Confidence="Conflict",Reasons=c.Reasons.Append("LedgerBusinessConflict").ToArray()}:c).ToArray();
        var rules = await db.Set<StatementRule>().AsNoTracking().Where(r => r.UserId == user && r.AccountId == row.AccountId && r.Enabled).OrderBy(r => r.Priority).ThenBy(r => r.Id).Take(100).ToArrayAsync();
        var ruleMatches = candidates.Select(c => new { c.TransactionId, rules = rules.Where(r => StatementRuleApplies(r,scoringRow,c,row.Amount)).Select(r => new { r.Id, r.Name, r.Priority, version = r.Version.ToString() }).ToArray() }).ToArray();
        candidates=candidates.OrderBy(c=>ruleMatches.First(x=>x.TransactionId==c.TransactionId).rules.Select(r=>r.Priority).DefaultIfEmpty(int.MaxValue).Min()).ThenByDescending(c=>c.Score).ThenBy(c=>c.TransactionId).ToArray();
        var combinations = ReconciliationAllocationMath.Combinations(remainder, candidates.Take(12).Select(x => Money(x.Amount)).ToArray()).Select(indices => new { transactionIds = indices.Select(i => candidates[i].TransactionId).ToArray(), amount = M(remainder), reason = "ExactSumRequiresManualReview", autoConfirm = false }).ToArray();
        return new { statement = StatementDto(row), candidates, combinations, ruleMatches, generatedAt=DateTimeOffset.UtcNow, engineVersion="rules-2.0.0", truncated, competing = candidates.Count(x => x.Score >= 55) > 1, scoreBasis = "DeterministicRuleScoreNotProbability", autoConfirm = false };
    }

    public async Task<object> ConfirmStatement(string user, string id, StatementConfirmInput input, bool execute = true)
    {
        var row = await StatementOwned(user, id); Version(row, input.Version); Require(row.State == "Pending", "请先撤销或重新打开流水");
        await Account(user, row.AccountId, false); var t = await Transaction(user, input.TransactionId); await ProtectSharedTransaction(user, t.Id); Version(t, input.TransactionVersion);
        var identity=StatementIdentity(user,row,t,await StatementIdentityAccounts(user,row,[t]));
        Require(identity.CounterpartyMatches!=false,"来源对方账号与内部交易的已知对方账号冲突");
        Require(t.Status != "Deleted", "交易已删除"); Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 1000, "请填写复核说明");
        await ValidateReconciliationBusiness(user,t);
        var ledger = t.Entries.Where(e => e.Kind == "Account" && e.AccountId == row.AccountId && e.Currency == row.Currency).Sum(e => e.Amount);
        Require(ledger == row.Amount && ledger != 0, "金额、方向或账户不一致，不可确认");
        Require(!db.Set<StatementLink>().Local.Any(x => x.UserId == user && x.AccountId == row.AccountId && x.TransactionId == t.Id && x.State == "Confirmed") && !await db.Set<StatementLink>().AnyAsync(x => x.UserId == user && x.AccountId == row.AccountId && x.TransactionId == t.Id && x.State == "Confirmed"), "交易已有有效匹配");
        Require(!await db.Set<TransactionStatementMatch>().AnyAsync(x => x.UserId == user && x.AccountId == row.AccountId && (x.TransactionId == t.Id||row.Reference!=""&&x.StatementReference==row.Reference) && (x.State == "Matched" || x.State == "Difference")), "交易或来源参考号已有旧版账单匹配，请先撤销");
        var persistedEnds = await db.Set<StatementLink>().Where(x => x.UserId == user && x.TransactionId == t.Id && x.State == "Confirmed").Take(101).ToArrayAsync();
        var otherEnds = persistedEnds.Concat(db.Set<StatementLink>().Local.Where(x=>x.UserId==user&&x.TransactionId==t.Id&&x.State=="Confirmed")).DistinctBy(x=>x.Id).ToArray();
        Require(otherEnds.Length<100,"同一交易最多100个有效分配关系，请先复核现有关系");
        Require(otherEnds.All(l=>l.TransactionVersion==t.Version),"交易已有过期匹配，请先撤销并复核");
        if (!execute) return new { row.Id, transactionId = t.Id, eligible = true };
        var evidenceScore=ReconciliationScore(row,t,ledger,identity);
        var applicableRules=(await db.Set<StatementRule>().Where(r=>r.UserId==user&&r.AccountId==row.AccountId&&r.Enabled).OrderBy(r=>r.Priority).ThenBy(r=>r.Id).Take(100).ToArrayAsync()).Where(r=>StatementRuleApplies(r,row,evidenceScore)).ToArray();
        var selectedRule=applicableRules.FirstOrDefault();
        // Touch the existing transaction concurrency token without changing financial facts.
        t.Version++; foreach (var other in otherEnds) { other.TransactionVersion = t.Version; other.Version++; }
        row.State = "Matched"; row.Version++;
        var link = new StatementLink { UserId = user, StatementRecordId = row.Id, AccountId = row.AccountId, TransactionId = t.Id, Amount = ledger, TransactionVersion = t.Version,RuleId=selectedRule?.Id,RuleVersion=selectedRule?.Version,EngineScore=evidenceScore.Score, Reason = input.Reason.Trim(), EvidenceJson = JsonSerializer.Serialize(new{generatedAt=DateTimeOffset.UtcNow,score=evidenceScore,rules=applicableRules.Select(r=>StatementRuleDto(r))}, Json) };
        db.Add(link); return new { link.Id, row.State, version = row.Version.ToString() };
    }

    public async Task<object> ResolveStatement(string user, string id, StatementResolveInput input,bool execute=true)
    {
        var row = await StatementOwned(user, id); Version(row, input.Version); await Account(user, row.AccountId, false);
        Require(input.State is "Pending" or "Ignored", "状态无效"); Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 1000, "请填写处理原因");
        var links = await db.Set<StatementLink>().Where(x => x.UserId == user && x.StatementRecordId == id && x.State == "Confirmed").ToArrayAsync();
        var events = JsonSerializer.Deserialize<List<JsonElement>>(row.ResolutionHistoryJson, Json) ?? [];
        Require(events.Count < 1000, "处理历史达到上限，请联系管理员归档");
        foreach(var link in links)await ProtectSharedTransaction(user,link.TransactionId);
        if(!execute)return new{row.Id,eligible=true};
        foreach (var link in links) { link.State = "Revoked";link.RevokedAt=DateTimeOffset.UtcNow; link.Version++; }
        events.Add(JsonSerializer.SerializeToElement(new { userId = user, at = DateTimeOffset.UtcNow, before = row.State, after = input.State, reason = input.Reason.Trim(), version = row.Version.ToString() }, Json));
        row.ResolutionHistoryJson = JsonSerializer.Serialize(events, Json);
        row.State = input.State; row.Resolution = input.Reason.Trim(); row.Version++; return StatementDto(row);
    }
    public async Task<object> CorrectStatement(string user,string id,StatementCorrectionInput b) {
        var row=await StatementOwned(user,id);Version(row,b.Version);await Account(user,row.AccountId,false);
        Require(row.State=="Pending"&&!await db.Set<StatementLink>().AnyAsync(x=>x.UserId==user&&x.StatementRecordId==id&&x.State=="Confirmed"),"请先撤销或重新打开，再修正规范化字段");
        var amount=Money(b.Amount);Require(amount!=0&&TransactionKinds.Contains(b.Type)&&b.OccurredAt.Year>=1900&&b.OccurredAt.Year<=DateTimeOffset.UtcNow.Year+1&&(b.PostedAt==null||b.PostedAt.Value.Year>=1900&&b.PostedAt.Value.Year<=DateTimeOffset.UtcNow.Year+1),"金额、类型或日期无效");
        Require(b.Merchant.Length<=200&&b.Note.Length<=2000&&b.PaymentSource.Length<=200&&!string.IsNullOrWhiteSpace(b.Reason)&&b.Reason.Length<=1000,"修正字段或说明无效");
        var before=JsonSerializer.SerializeToElement(StatementDto(row),Json);
        var events=JsonSerializer.Deserialize<List<JsonElement>>(row.ResolutionHistoryJson,Json)??[];Require(events.Count<1000,"处理历史达到上限");
        row.Amount=amount;row.OccurredAt=b.OccurredAt.ToUniversalTime();row.PostedAt=b.PostedAt?.ToUniversalTime();row.Merchant=(await ResolveMerchant(user,b.Merchant))?.Name??b.Merchant.Trim();row.Note=b.Note.Trim();row.Type=b.Type;row.PaymentSource=b.PaymentSource.Trim();row.Version++;
        events.Add(JsonSerializer.SerializeToElement(new{action="CorrectNormalizedFields",userId=user,at=DateTimeOffset.UtcNow,reason=b.Reason.Trim(),before,after=StatementDto(row)},Json));row.ResolutionHistoryJson=JsonSerializer.Serialize(events,Json);
        return StatementDto(row);
    }

    public async Task<object> StatementHistory(string user, string id,IQueryCollection? parameters=null)
    {
        var row = await StatementOwned(user, id); await Account(user, row.AccountId, false);
        var (page,size)=Paging(parameters??new QueryCollection());var query=db.Set<StatementLink>().AsNoTracking().Where(x=>x.UserId==user&&x.StatementRecordId==id);var total=await query.CountAsync();
        var links = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        var ids = links.Select(x => x.TransactionId).ToArray();
        var current = await db.Transactions.Where(t => t.UserId == user && ids.Contains(t.Id)).Select(t => new { t.Id, t.Version, t.Status }).ToArrayAsync();
        var events=JsonSerializer.Deserialize<JsonElement[]>(row.ResolutionHistoryJson)??[];
        return new {total,page,pageSize=size,eventTotal=events.Length, events = events.Reverse().Skip((page-1)*size).Take(size), items = links.Select(x => new { x.Id, x.TransactionId, x.State, x.CreatedAt, x.EngineVersion, x.ConfirmationMode, x.RuleId, x.RuleVersion, x.EngineScore, x.Reason, evidence = JsonSerializer.Deserialize<JsonElement>(x.EvidenceJson), conflict = x.State == "Confirmed" && !current.Any(t => t.Id == x.TransactionId && t.Version == x.TransactionVersion && t.Status != "Deleted"), version = x.Version.ToString() }) };
    }

    public static object StatementRuleDto(StatementRule r,object? effect=null) => new { r.Id, r.AccountId, r.Name, r.Merchant, r.Type, r.Currency, r.Keyword, r.DateTolerance, r.Priority, amountTolerance = M(r.AmountTolerance), expectedAmount=r.ExpectedAmount==null?null:M(r.ExpectedAmount.Value), r.RequireReference, r.Enabled, r.AutoConfirm,effect, version = r.Version.ToString() };
    public async Task<object> StatementRules(string user, string accountId) {
        await Account(user, accountId, false);
        var effects=await (from l in db.Set<StatementLink>() join t in db.Transactions on l.TransactionId equals t.Id where l.UserId==user&&l.AccountId==accountId&&l.RuleId!=null group new{l,t} by l.RuleId into g select new{id=g.Key,confirmations=g.Count(),active=g.Count(x=>x.l.State=="Confirmed"&&x.t.Status!="Deleted"&&x.t.Version==x.l.TransactionVersion),revoked=g.Count(x=>x.l.State=="Revoked"),conflicts=g.Count(x=>x.l.State=="Confirmed"&&(x.t.Status=="Deleted"||x.t.Version!=x.l.TransactionVersion))}).ToDictionaryAsync(x=>x.id!,x=>(object)x);
        return (await db.Set<StatementRule>().AsNoTracking().Where(x => x.UserId == user && x.AccountId == accountId).OrderBy(x => x.Priority).ThenBy(x => x.Id).Take(100).ToArrayAsync()).Select(r=>StatementRuleDto(r,effects.GetValueOrDefault(r.Id)));
    }
    public async Task<object> StatementBalanceHistory(string user,string accountId,IQueryCollection p) {
        await Account(user,accountId,false);var(page,size)=Paging(p);var q=db.Set<StatementBalanceSnapshot>().AsNoTracking().Where(x=>x.UserId==user&&x.AccountId==accountId);var total=await q.CountAsync();
        var rows=await q.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{total,page,pageSize=size,items=rows.Select(x=>new{x.Id,x.CreatedAt,x.StartsAt,x.EndsAt,x.Currency,openingBalance=M(x.OpeningBalance),bankClosingBalance=M(x.BankClosingBalance),systemClosingBalance=M(x.SystemClosingBalance),bankOnly=M(x.BankOnly),ledgerOnly=M(x.LedgerOnly),adjustedDifference=M(x.AdjustedDifference),evidence=JsonSerializer.Deserialize<JsonElement>(x.EvidenceJson),version=x.Version.ToString()})};
    }
    public async Task<object> StatementAudit(string user,string accountId,IQueryCollection p) {
        await Account(user,accountId,false);var(page,size)=Paging(p);
        var q=db.AuditRecords.AsNoTracking().Where(a=>a.UserId==user&&(db.Set<StatementRecord>().Any(x=>x.UserId==user&&x.AccountId==accountId&&x.Id==a.ResourceId)||db.Set<StatementLink>().Any(x=>x.UserId==user&&x.AccountId==accountId&&x.Id==a.ResourceId)||db.Set<StatementRule>().Any(x=>x.UserId==user&&x.AccountId==accountId&&x.Id==a.ResourceId)||db.Set<StatementTask>().Any(x=>x.UserId==user&&x.AccountId==accountId&&x.Id==a.ResourceId)||db.Set<StatementBalanceSnapshot>().Any(x=>x.UserId==user&&x.AccountId==accountId&&x.Id==a.ResourceId)));
        var total=await q.CountAsync();var rows=await q.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{total,page,pageSize=size,items=rows.Select(x=>new{x.Id,x.UserId,x.ResourceType,x.ResourceId,x.TransactionId,x.Action,x.CreatedAt,x.Source,changes=JsonSerializer.Deserialize<JsonElement>(x.ChangesJson)})};
    }
    public async Task<object> SaveStatementRule(string user, string? id, StatementRuleInput b) {
        var a = await Account(user, b.AccountId, false);
        Require(b.Name.Length is > 0 and <= 100 && b.Merchant.Length <= 200 && b.Keyword.Length <= 200 && b.DateTolerance is >= 0 and <= 7 && b.Priority is >= 0 and <= 1000 && b.Currency == a.Currency && (b.Type == "" || TransactionKinds.Contains(b.Type)), "规则字段无效");
        var expected=string.IsNullOrWhiteSpace(b.ExpectedAmount)?(decimal?)null:Money(b.ExpectedAmount);Require(expected==null||expected>0,"规则目标金额必须为正数");
        var tolerance = Money(b.AmountTolerance); Require(tolerance is >= 0 and <= 10, "金额容差必须在0到10之间");
        // Uploaded files have no authenticated provider provenance. A user toggle cannot establish trust.
        if(b.AutoConfirm){Require(b.RequireReference&&tolerance==0&&b.DateTolerance<=3&&b.Merchant.Length>0&&b.Type is "Expense" or "Income","自动规则必须限定类型与商户、唯一参考号、零金额容差及最多3天日期容差");Require(await HasTrustedStatementSource(user,a.Id),"当前文件及映射未由服务器核准，自动确认不可启用");}
        var r = id == null ? new StatementRule { UserId = user, AccountId = a.Id } : await db.Set<StatementRule>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id && x.AccountId == a.Id) ?? throw new ApiException(404, "规则不存在");
        if (id != null) { Version(r, b.Version); r.Version++; }
        else { Require(await db.Set<StatementRule>().CountAsync(x => x.UserId == user && x.AccountId == a.Id) < 100, "每账户最多100条规则"); db.Add(r); }
        r.Name = b.Name.Trim(); r.Merchant = (await ResolveMerchant(user,b.Merchant))?.Name ?? b.Merchant.Trim(); r.Type = b.Type; r.Currency = b.Currency; r.Keyword = b.Keyword.Trim(); r.DateTolerance = b.DateTolerance; r.Priority = b.Priority; r.AmountTolerance = tolerance; r.ExpectedAmount=expected; r.RequireReference = b.RequireReference; r.Enabled = b.Enabled; r.AutoConfirm = b.AutoConfirm;
        return StatementRuleDto(r);
    }
    public async Task<object> StatementBalance(string user, StatementBalanceInput b, bool save) {
        var a = await Account(user, b.AccountId, false);
        Require(b.EndsAt >= b.StartsAt && b.EndsAt - b.StartsAt <= TimeSpan.FromDays(366), "对账期间最多366天");
        var opening = Money(b.OpeningBalance); var bank = Money(b.BankClosingBalance);
        var bankAsOf = db.Set<StatementRecord>().Where(x => x.UserId == user && x.AccountId == a.Id && (x.PostedAt ?? x.OccurredAt) <= b.EndsAt);
        var records = bankAsOf.Where(x => (x.PostedAt ?? x.OccurredAt) >= b.StartsAt);
        var ledgerAsOf = from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId == user && t.UserId == user && e.AccountId == a.Id && e.Kind == "Account" && t.Status != "Deleted" && t.OccurredAt <= b.EndsAt select new { Entry = e, t.OccurredAt };
        var entries = ledgerAsOf.Where(x => x.OccurredAt >= b.StartsAt).Select(x => x.Entry);
        var links = db.Set<StatementLink>().Where(l => l.UserId == user && l.AccountId == a.Id && l.State == "Confirmed");
        var movement = await entries.SumAsync(x => (decimal?)x.Amount) ?? 0;
        var bankMovement = await records.Where(r => r.State != "Ignored").SumAsync(r => (decimal?)r.Amount) ?? 0;
        var bankReconciled = await links.Where(l => records.Any(r => r.Id == l.StatementRecordId && r.State != "Ignored") && ledgerAsOf.Any(e => e.Entry.TransactionId == l.TransactionId)).SumAsync(l => (decimal?)l.Amount) ?? 0;
        var ledgerReconciled = await links.Where(l => bankAsOf.Any(r => r.Id == l.StatementRecordId && r.State != "Ignored") && entries.Any(e => e.TransactionId == l.TransactionId)).SumAsync(l => (decimal?)l.Amount) ?? 0;
        var bankOnly = bankMovement - bankReconciled;
        var ledgerOnly = movement - ledgerReconciled;
        var expectedBankClosing = opening + bankMovement;
        var bankMovementConsistent = expectedBankClosing == bank;
        var systemClosing = await Balance(user, a.Id, b.EndsAt);
        var systemOpening = systemClosing - movement;
        var conflictCount = await links.CountAsync(l => (records.Any(r => r.Id == l.StatementRecordId) || entries.Any(e => e.TransactionId == l.TransactionId)) && !db.Transactions.Any(t => t.Id == l.TransactionId && t.UserId == user && t.Version == l.TransactionVersion && t.Status != "Deleted"));
        var bankUncleared=records.Where(r=>r.State!="Ignored").Select(r=>new{r.Id,r.Version,r.OccurredAt,remaining=r.Amount-(links.Where(l=>l.StatementRecordId==r.Id&&ledgerAsOf.Any(e=>e.Entry.TransactionId==l.TransactionId)).Sum(l=>(decimal?)l.Amount)??0)}).Where(r=>r.remaining!=0);
        var ledgerUncleared=entries.GroupBy(e=>e.TransactionId).Select(g=>new{id=g.Key,amount=g.Sum(e=>e.Amount)}).Select(t=>new{t.id,remaining=t.amount-(links.Where(l=>l.TransactionId==t.id&&bankAsOf.Any(r=>r.Id==l.StatementRecordId&&r.State!="Ignored")).Sum(l=>(decimal?)l.Amount)??0)}).Where(t=>t.remaining!=0);
        var bankOutstandingCount=await bankUncleared.CountAsync();var ledgerOutstandingCount=await ledgerUncleared.CountAsync();var ignoredCount=await records.CountAsync(r=>r.State=="Ignored");
        var bankOutstanding=(await bankUncleared.OrderBy(r=>r.OccurredAt).ThenBy(r=>r.Id).Take(200).ToArrayAsync()).Select(r=>new{statementId=r.Id,version=r.Version.ToString(),r.OccurredAt,remaining=M(r.remaining)}).ToArray();
        var ledgerOutstanding=(await ledgerUncleared.OrderBy(t=>t.id).Take(200).ToArrayAsync()).Select(t=>new{transactionId=t.id,remaining=M(t.remaining)}).ToArray();
        var requiresOutstandingReview=bankOutstandingCount+ledgerOutstandingCount+ignoredCount>0;
        Require(b.OutstandingReason.Length<=1000,"未达账项复核说明过长");
        var outstandingReviewed=!requiresOutstandingReview||b.ReviewedOutstanding&&!string.IsNullOrWhiteSpace(b.OutstandingReason);
        var withinReviewLimit=bankOutstandingCount+ledgerOutstandingCount<=200;
        var periodClosed=b.EndsAt<=DateTimeOffset.UtcNow;
        var evidence = new { schemaVersion="2.0.1",bankDateBasis="PostedAtOrOccurredAt",ledgerDateBasis="OccurredAt",b.AccountId, accountVersion = a.Version.ToString(), b.StartsAt, b.EndsAt, opening = M(opening), bank = M(bank), systemOpening = M(systemOpening), bankMovement=M(bankMovement), expectedBankClosing=M(expectedBankClosing), bankMovementConsistent, systemClosing = M(systemClosing), bankOnly = M(bankOnly), ledgerOnly = M(ledgerOnly), conflictCount, recordCount = await records.CountAsync(), matchedCount = await records.CountAsync(r => r.State == "Matched"), ignoredCount,bankOutstandingCount,ledgerOutstandingCount,bankOutstanding,ledgerOutstanding,b.ReviewedOutstanding,outstandingReason=b.OutstandingReason.Trim(), rowRevision = await records.SumAsync(r => (long?)r.Version) ?? 0, transactionRevision = await (from e in entries join t in db.Transactions on e.TransactionId equals t.Id select (long?)t.Version).SumAsync() ?? 0 };
        var json = JsonSerializer.Serialize(evidence, Json); var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
        var difference = systemClosing + bankOnly - bank - ledgerOnly;
        if (save) {
            Require(b.PreviewToken == token, "快照已变化，请重新预览");Require(periodClosed,"对账期间尚未结束，不可完成余额调节"); Require(conflictCount == 0 && difference == 0 && bankMovementConsistent&&outstandingReviewed&&withinReviewLimit, "差异、银行期初期末流水或未达项目尚未核清；超过200项时请先匹配或缩小期间");
            db.Add(new StatementBalanceSnapshot { UserId = user, AccountId = a.Id, Currency = a.Currency, StartsAt = b.StartsAt, EndsAt = b.EndsAt, OpeningBalance = opening, BankClosingBalance = bank, SystemClosingBalance = systemClosing, BankOnly = bankOnly, LedgerOnly = ledgerOnly, AdjustedDifference = difference, EvidenceJson = json });
        }
        return new { evidence,requiresOutstandingReview,withinReviewLimit,periodClosed, previewToken = token, adjustedDifference = M(difference), canComplete = periodClosed&&conflictCount == 0 && difference == 0 && bankMovementConsistent&&outstandingReviewed&&withinReviewLimit, formula = "SystemClosing + BankOnly - BankClosing - LedgerOnly", saved = save };
    }
}
