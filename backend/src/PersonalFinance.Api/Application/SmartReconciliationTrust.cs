using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record StatementTrustedSource(string UserId,string AccountId,string SourceHash,string MappingHash,DateTimeOffset ExpiresAt,string ApprovedBy);
public sealed record StatementAutoProposal(string StatementId,string StatementVersion,string? TransactionId,string? TransactionVersion,string? RuleId,string? RuleVersion,bool Eligible,string[] Reasons,string? ApprovalFingerprint=null);

public sealed partial class FinanceService
{
    public static string StatementMappingHash(ImportJob job) {
        var mapping=JsonSerializer.Deserialize<Dictionary<string,string?>>(job.MappingJson,Json)??[];
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new SortedDictionary<string,string?>(mapping,StringComparer.Ordinal),Json))));
    }
    private StatementTrustedSource[] TrustedStatementSources(string user,string accountId) {
        var now=DateTimeOffset.UtcNow;var result=new List<StatementTrustedSource>();
        foreach(var entry in configuration?.GetSection("SmartReconciliation:TrustedSources").GetChildren().Take(100)??[]) {
            if(entry["UserId"]!=user||entry["AccountId"]!=accountId||entry.GetValue<bool?>("Enabled")!=true||!DateTimeOffset.TryParse(entry["ExpiresAt"],out var expires)||expires<=now||string.IsNullOrWhiteSpace(entry["ApprovedBy"]))continue;
            var source=entry["SourceHash"]??"";var mapping=entry["MappingHash"]??"";
            if(!System.Text.RegularExpressions.Regex.IsMatch(source,"^[a-fA-F0-9]{64}$")||!System.Text.RegularExpressions.Regex.IsMatch(mapping,"^[a-fA-F0-9]{64}$"))continue;
            result.Add(new(user,accountId,source.ToUpperInvariant(),mapping.ToUpperInvariant(),expires,entry["ApprovedBy"]!));
        }
        return result.ToArray();
    }
    private StatementTrustedSource? StatementApproval(string user,string accountId,ImportJob job)=>TrustedStatementSources(user,accountId).FirstOrDefault(p=>p.SourceHash==job.SourceHash.ToUpperInvariant()&&p.MappingHash==StatementMappingHash(job));
    private async Task<bool> HasTrustedStatementSource(string user,string accountId) {
        var approvals=TrustedStatementSources(user,accountId);if(approvals.Length==0)return false;var hashes=approvals.Select(p=>p.SourceHash).ToArray();
        var jobs=await db.Imports.AsNoTracking().Where(j=>j.UserId==user&&hashes.Contains(j.SourceHash)&&db.Set<StatementRecord>().Any(r=>r.UserId==user&&r.AccountId==accountId&&r.ImportJobId==j.Id)).Take(100).ToArrayAsync();
        return jobs.Any(j=>StatementApproval(user,accountId,j)!=null);
    }
    public async Task<object> StatementTrustInfo(string user,string accountId,string importJobId) {
        await Account(user,accountId,false);var job=await db.Imports.AsNoTracking().SingleOrDefaultAsync(j=>j.UserId==user&&j.Id==importJobId)??throw new ApiException(404,"来源批次不存在");var approval=StatementApproval(user,accountId,job);
        return new{job.Id,sourceHash=job.SourceHash,mappingHash=StatementMappingHash(job),trusted=approval!=null,expiresAt=approval?.ExpiresAt,basis="ServerReviewedFileAndMappingNotLiveBankConnection"};
    }
    private async Task<StatementAutoProposal> StatementAutomaticProposal(string user,StatementRecord row) {
        StatementAutoProposal Block(string reason)=>new(row.Id,row.Version.ToString(),null,null,null,null,false,[reason]);
        if(row.State!="Pending")return Block("StatementNotPending");
        if(row.SourceFactsHash.Length!=64)return Block("SourceEvidenceRequiresReview");
        if(row.OccurredAt>DateTimeOffset.UtcNow.AddMinutes(5)||row.PostedAt>DateTimeOffset.UtcNow.AddMinutes(5))return Block("FutureDatedSourceRequiresReview");
        if(row.Type is not ("Expense" or "Income")||row.ResolutionHistoryJson.Contains("CorrectNormalizedFields",StringComparison.Ordinal))return Block("ManualReviewRequiredForBusinessOrCorrection");
        if(TrustedStatementSources(user,row.AccountId).Length==0)return Block("SourceNotServerApproved");
        if(row.Type=="Expense"&&row.Amount>=0||row.Type=="Income"&&row.Amount<=0)return Block("DirectionBusinessMismatch");
        if(await db.Set<ImportCleaningEvent>().AnyAsync(e=>e.UserId==user&&e.RowId==row.ImportRowId&&e.Source!="Rule"&&e.Source!="File"))return Block("ManualImportEditRequiresReview");
        var job=await db.Imports.AsNoTracking().SingleAsync(j=>j.UserId==user&&j.Id==row.ImportJobId);var approval=StatementApproval(user,row.AccountId,job);if(approval==null)return Block("SourceNotServerApproved");
        var sourceJson=await db.ImportRows.Where(r=>r.UserId==user&&r.Id==row.ImportRowId).Select(r=>r.DataJson).SingleAsync();using(var raw=JsonDocument.Parse(sourceJson)){if(raw.RootElement.TryGetProperty("sourceAmount",out var signed)&&signed.ValueKind==JsonValueKind.String&&Money(signed.GetString()!)<0&&row.Amount>0)return Block("SourceSignNormalizationRequiresReview");var text=raw.RootElement.TryGetProperty("sourceType",out var sourceType)&&sourceType.ValueKind==JsonValueKind.String?SmartReconciliationEngine.Normalize(sourceType.GetString()):"";if(new[]{"退款","转账","还款","手续费","冲正","REFUND","TRANSFER","PAYMENT","FEE","REVERSAL"}.Any(text.Contains))return Block("ComplexBusinessRequiresHumanReview");}
        var response=JsonSerializer.SerializeToElement(await StatementCandidates(user,row.Id),Json);
        if(response.GetProperty("truncated").GetBoolean())return Block("CandidateWindowTruncated");
        var candidates=response.GetProperty("candidates").Deserialize<ReconciliationCandidate[]>(Json)??[];var exact=candidates.Where(c=>c.Difference==0&&c.Score>0).ToArray();
        if(exact.Length!=1)return Block(exact.Length==0?"NoExactCandidate":"CompetingCandidates");var candidate=exact[0];
        if(candidate.Confidence!="High"||!new[]{"ReferenceExact","MerchantExact","TypeExact"}.All(candidate.Reasons.Contains))return Block("ExactIdentityEvidenceRequired");
        var t=await Transaction(user,candidate.TransactionId);
        if(t.Type is not ("Expense" or "Income")||t.Type!=row.Type||t.OccurredAt>DateTimeOffset.UtcNow.AddMinutes(5)||t.Status!="Confirmed"||t.Currency!=row.Currency||t.ExchangeRate is not (null or 1)||t.Fee!=0||!string.IsNullOrEmpty(t.PromotionJson)||t.BusinessId!=null||t.OriginalTransactionId!=null||t.Entries.Where(e=>e.Kind=="Account").Select(e=>e.AccountId).Distinct().Count()!=1)return Block("ComplexBusinessRequiresHumanReview");
        var identity=StatementIdentity(user,row,t,await StatementIdentityAccounts(user,row,[t]));
        if(row.CounterpartyKey.Length>0&&identity.CounterpartyMatches!=true||row.PaymentSource.Length>0&&identity.PaymentSourceMatches!=true)return Block("UnverifiedPaymentOrCounterparty");
        var matching=(await db.Set<StatementRule>().Where(r=>r.UserId==user&&r.AccountId==row.AccountId&&r.Enabled).OrderBy(r=>r.Priority).ThenBy(r=>r.Id).Take(100).ToArrayAsync()).Where(r=>StatementRuleApplies(r,row,candidate)).ToArray();
        if(matching.Length==0||!matching[0].AutoConfirm)return Block("NoEnabledAutomaticRule");var rule=matching[0];
        if(matching.Count(r=>r.Priority==rule.Priority)>1)return Block("RulePriorityConflict");
        if(!rule.RequireReference||rule.AmountTolerance!=0||rule.DateTolerance>3||rule.Merchant.Length==0||rule.Type!=row.Type)return Block("UnsafeAutomaticRule");
        await ConfirmStatement(user,row.Id,new(t.Id,row.Version.ToString(),t.Version.ToString(),"Automatic safety preflight"),false);
        var fingerprint=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(approval,Json))));
        return new(row.Id,row.Version.ToString(),t.Id,t.Version.ToString(),rule.Id,rule.Version.ToString(),true,[],fingerprint);
    }
    private async Task<(StatementRecord[] Rows,StatementAutoProposal[] Proposals,string Token)> StatementAutomaticPlan(string user,StatementTask task) {
        var rows=await StatementTaskRows(user,task);var proposals=new List<StatementAutoProposal>();
        foreach(var row in rows){try{proposals.Add(await StatementAutomaticProposal(user,row));}catch(ApiException e){proposals.Add(new(row.Id,row.Version.ToString(),null,null,null,null,false,[e.Code]));}}
        var ordered=proposals.ToArray();var token=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{task.Id,task.Version,proposals=ordered},Json))));return(rows,ordered,token);
    }
    public async Task<object> StatementAutomaticPreview(string user,string id,StatementTaskRun b) {
        var task=await db.Set<StatementTask>().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"任务不存在");Version(task,b.Version);await Account(user,task.AccountId,false);Require(task.State!="Completed","任务已完成");
        var plan=await StatementAutomaticPlan(user,task);return new{previewToken=plan.Token,items=plan.Proposals,eligible=plan.Proposals.Count(p=>p.Eligible),total=plan.Rows.Length,financialWrites=0};
    }
}
