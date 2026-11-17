using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using System.Text.Json;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> StatementOverview(string user) {
        var groups=await db.Set<StatementRecord>().AsNoTracking().Where(r=>r.UserId==user).GroupBy(r=>new{r.AccountId,r.Currency}).Select(g=>new{g.Key.AccountId,g.Key.Currency,total=g.Count(),matched=g.Count(r=>r.State=="Matched"),pending=g.Count(r=>r.State=="Pending"),partial=g.Count(r=>r.State=="PartiallyMatched"),ignored=g.Count(r=>r.State=="Ignored"),grossAmount=g.Sum(r=>Math.Abs(r.Amount)),pendingAmount=g.Sum(r=>r.State=="Pending"?Math.Abs(r.Amount):0),matchedAmount=g.Sum(r=>r.State=="Matched"?Math.Abs(r.Amount):0)}).ToArrayAsync();
        var conflicts=await (from r in db.Set<StatementRecord>() join l in db.Set<StatementLink>() on r.Id equals l.StatementRecordId join t in db.Transactions on l.TransactionId equals t.Id where r.UserId==user&&l.UserId==user&&l.State=="Confirmed"&&(t.Status=="Deleted"||t.Version!=l.TransactionVersion) select new{r.Id,r.AccountId,r.State}).Distinct().GroupBy(r=>r.AccountId).Select(g=>new{accountId=g.Key,count=g.Count(),matched=g.Count(r=>r.State=="Matched")}).ToDictionaryAsync(x=>x.accountId);
        var ids=groups.Select(g=>g.AccountId).ToArray();var names=await db.Accounts.AsNoTracking().Where(a=>a.UserId==user&&ids.Contains(a.Id)).ToDictionaryAsync(a=>a.Id,a=>a.Name);
        var denominator=groups.Sum(g=>g.total);var numerator=groups.Sum(g=>g.matched)-conflicts.Values.Sum(c=>c.matched);
        var manualReviewCount=groups.Sum(g=>g.pending+g.partial)+conflicts.Values.Sum(c=>c.matched);
        var knownDifferenceCount=await db.Set<StatementRecord>().CountAsync(r=>r.UserId==user&&(r.State=="PartiallyMatched"||db.Set<StatementLink>().Any(l=>l.UserId==user&&l.StatementRecordId==r.Id&&l.State=="Confirmed"&&!db.Transactions.Any(t=>t.UserId==user&&t.Id==l.TransactionId&&t.Version==l.TransactionVersion&&t.Status!="Deleted"))));
        var suspectedDuplicateCount=await db.Database.SqlQueryRaw<long>("""
            SELECT COALESCE(SUM(d.[Count]),0) AS [Value] FROM (
                SELECT COUNT_BIG(*) AS [Count] FROM finance.StatementRecord
                WHERE UserId=@statementUser
                GROUP BY AccountId,Currency,Amount,CONVERT(date,SWITCHOFFSET(OccurredAt,'+08:00')),Merchant
                HAVING COUNT_BIG(*)>1
            ) d
            """,new SqlParameter("@statementUser",user)).SingleAsync();
        var since=DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date.AddDays(-29);var sinceUtc=new DateTimeOffset(since,TimeSpan.FromHours(8)).ToUniversalTime();
        var confirmations=await db.Set<StatementLink>().AsNoTracking().Where(l=>l.UserId==user&&l.CreatedAt>=sinceUtc).GroupBy(l=>l.CreatedAt.AddHours(8).Date).Select(g=>new{date=g.Key,count=g.Count()}).ToArrayAsync();
        var revocations=await db.Set<StatementLink>().AsNoTracking().Where(l=>l.UserId==user&&l.RevokedAt>=sinceUtc).GroupBy(l=>l.RevokedAt!.Value.AddHours(8).Date).Select(g=>new{date=g.Key,count=g.Count()}).ToArrayAsync();
        var dates=confirmations.Select(x=>x.date).Concat(revocations.Select(x=>x.date)).Distinct().OrderBy(x=>x).ToArray();
        var snapshots=await db.Set<StatementBalanceSnapshot>().AsNoTracking().Where(s=>s.UserId==user).OrderByDescending(s=>s.CreatedAt).ThenBy(s=>s.Id).Take(30).ToArrayAsync();
        var missingNames=snapshots.Select(s=>s.AccountId).Distinct().Where(id=>!names.ContainsKey(id)).ToArray();
        if(missingNames.Length>0)foreach(var item in await db.Accounts.AsNoTracking().Where(a=>a.UserId==user&&missingNames.Contains(a.Id)).Select(a=>new{a.Id,a.Name}).ToArrayAsync())names[item.Id]=item.Name;
        var snapshotTrend=snapshots.Select(s=>{
            int? count=null;int? matched=null;var valid=false;
            try{using var document=JsonDocument.Parse(s.EvidenceJson);var e=document.RootElement;if(e.TryGetProperty("recordCount",out var c)&&c.TryGetInt32(out var total)&&e.TryGetProperty("matchedCount",out var m)&&m.TryGetInt32(out var n)&&total>=0&&n>=0&&n<=total){count=total;matched=n;valid=true;}}catch(JsonException){}
            return new{s.Id,s.AccountId,name=names.GetValueOrDefault(s.AccountId,""),s.CreatedAt,s.StartsAt,s.EndsAt,denominator=count,numerator=matched,coverage=count>0&&matched!=null?M(matched.Value*100m/count.Value):null,validEvidence=valid,basis="PersistedPeriodSnapshotCountsIncludingIgnored"};
        }).ToArray();
        return new{denominator,numerator,snapshotTrend,manualReviewCount,knownDifferenceCount,suspectedDuplicateCount,duplicateBasis="SameAccountCurrencySignedAmountShanghaiDayMerchantFieldIncludingIgnoredNotProof",differenceBasis="PartialAllocationsOrConfirmedVersionConflicts",coverage=denominator==0?null:M(numerator*100m/denominator),conflictCount=conflicts.Values.Sum(c=>c.count),accounts=groups.Select(g=>new{g.AccountId,name=names.GetValueOrDefault(g.AccountId,""),g.Currency,g.total,g.pending,g.partial,g.ignored,matched=g.matched-(conflicts.GetValueOrDefault(g.AccountId)?.matched??0),conflicts=conflicts.GetValueOrDefault(g.AccountId)?.count??0,grossAmount=M(g.grossAmount),pendingAmount=M(g.pendingAmount),matchedAmount=M(g.matchedAmount)}),trend=dates.Select(date=>new{date=date.ToString("yyyy-MM-dd"),confirmedOperations=confirmations.FirstOrDefault(x=>x.date==date)?.count??0,revokedOperations=revocations.FirstOrDefault(x=>x.date==date)?.count??0}),trendBasis="ShanghaiDailyLinkOperationsNotHistoricalBalanceOrProbability",coverageBasis="FullyMatchedWithoutVersionConflictDividedByAllExternalRecordsIncludingIgnored",amountBasis="AbsoluteAccountCurrencyByPersistedState"};
    }
}
