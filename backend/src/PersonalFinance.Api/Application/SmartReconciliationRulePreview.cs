using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> StatementRulePreview(string user,StatementRuleInput b)
    {
        var account=await Account(user,b.AccountId,false);
        Require(b.Name.Length is >0 and <=100&&b.Merchant.Length<=200&&b.Keyword.Length<=200&&b.DateTolerance is >=0 and <=7&&b.Priority is >=0 and <=1000&&b.Currency==account.Currency&&(b.Type==""||TransactionKinds.Contains(b.Type)),"规则字段无效");
        var tolerance=Money(b.AmountTolerance);Require(tolerance is >=0 and <=10,"金额容差必须在0到10之间");
        var expected=string.IsNullOrWhiteSpace(b.ExpectedAmount)?(decimal?)null:Money(b.ExpectedAmount);Require(expected==null||expected>0,"规则目标金额必须为正数");
        var rule=new StatementRule{UserId=user,AccountId=account.Id,Name=b.Name.Trim(),Merchant=(await ResolveMerchant(user,b.Merchant))?.Name??b.Merchant.Trim(),Keyword=b.Keyword.Trim(),Type=b.Type,Currency=b.Currency,AmountTolerance=tolerance,ExpectedAmount=expected,DateTolerance=b.DateTolerance,Priority=b.Priority,RequireReference=b.RequireReference,Enabled=b.Enabled,AutoConfirm=b.AutoConfirm};
        var pending=db.Set<StatementRecord>().AsNoTracking().Where(r=>r.UserId==user&&r.AccountId==account.Id&&r.State=="Pending");
        var total=await pending.CountAsync();var rows=await pending.OrderByDescending(r=>r.OccurredAt).ThenBy(r=>r.Id).Take(10).ToArrayAsync();var results=new List<object>();
        foreach(var row in rows){
            var result=JsonSerializer.SerializeToElement(await StatementCandidates(user,row.Id),Json);
            var candidates=result.GetProperty("candidates").Deserialize<ReconciliationCandidate[]>(Json)??[];
            row.Merchant=(await ResolveMerchant(user,row.Merchant))?.Name??row.Merchant;var hits=candidates.Where(c=>c.Score>0&&c.Confidence!="Conflict"&&StatementRuleApplies(rule,row,c)).ToArray();
            results.Add(new{statementId=row.Id,row.Merchant,amount=M(row.Amount),candidateCount=candidates.Length,ruleMatches=hits.Take(5),matchingCount=hits.Length,competing=hits.Length>1,truncated=result.GetProperty("truncated").GetBoolean()});
        }
        return new{rule=StatementRuleDto(rule),totalPending=total,evaluated=rows.Length,sampleLimit=10,sampling="MostRecentPendingSources",results,automaticConfirmation=false,generatedAt=DateTimeOffset.UtcNow,engineVersion="rules-2.0.0",note="PreviewOnlyNoRuleOrLedgerWrites"};
    }
}
