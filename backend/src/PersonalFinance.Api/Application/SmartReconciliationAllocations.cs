using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record StatementAllocation(string StatementId,string StatementVersion,string TransactionId,string TransactionVersion,string Amount);
public sealed record StatementAllocationInput(StatementAllocation[] Allocations,string Reason);

public static class ReconciliationAllocationMath
{
    public static bool Fits(decimal total,decimal allocated,decimal proposed) => proposed!=0 && Math.Sign(proposed)==Math.Sign(total) && Math.Sign(allocated+proposed)==Math.Sign(total) && Math.Abs(allocated+proposed)<=Math.Abs(total);
    public static int[][] Combinations(decimal target,decimal[] amounts) {
        var source=amounts.Take(12).ToArray();var results=new List<int[]>();
        for(var i=0;i<source.Length;i++)for(var j=i+1;j<source.Length;j++) {
            if(Math.Sign(source[i])!=Math.Sign(target)||Math.Sign(source[j])!=Math.Sign(target))continue;
            if(source[i]+source[j]==target)results.Add([i,j]);
            for(var k=j+1;k<source.Length;k++)if(Math.Sign(source[k])==Math.Sign(target)&&source[i]+source[j]+source[k]==target)results.Add([i,j,k]);
        }
        return results.Take(20).ToArray();
    }
}

public sealed partial class FinanceService
{
    public async Task<object> StatementAllocations(string user,StatementAllocationInput b,bool execute) {
        Require(b.Allocations.Length is >0 and <=40 && b.Allocations.Select(x=>(x.StatementId,x.TransactionId)).Distinct().Count()==b.Allocations.Length,"分配最多40项，同一流水和交易不可重复");
        Require(b.Allocations.Select(x=>x.StatementId).Distinct().Count()<=20 && b.Allocations.Select(x=>x.TransactionId).Distinct().Count()<=20 && !string.IsNullOrWhiteSpace(b.Reason) && b.Reason.Length<=1000,"组合对象或说明无效");
        var rows=new Dictionary<string,StatementRecord>();var transactions=new Dictionary<string,FinanceTransaction>();
        foreach(var allocation in b.Allocations) {
            if(!rows.TryGetValue(allocation.StatementId,out var row)){row=await StatementOwned(user,allocation.StatementId);rows.Add(row.Id,row);await Account(user,row.AccountId,false);}
            Version(row,allocation.StatementVersion);Require(row.State is "Pending" or "PartiallyMatched","来源流水状态不可分配");
            if(!transactions.TryGetValue(allocation.TransactionId,out var t)){t=await Transaction(user,allocation.TransactionId);transactions.Add(t.Id,t);await ProtectSharedTransaction(user,t.Id);}
            Version(t,allocation.TransactionVersion);Require(t.Status!="Deleted","已删除交易不可分配");
            await ValidateReconciliationBusiness(user,t);
        }
        var rowIds=rows.Keys.ToArray();var transactionIds=transactions.Keys.ToArray();
        var active=await db.Set<StatementLink>().Where(x=>x.UserId==user&&x.State=="Confirmed"&&(rowIds.Contains(x.StatementRecordId)||transactionIds.Contains(x.TransactionId))).Take(4001).ToArrayAsync();
        Require(active.Length<=4000,"组合关联规模过大，请按更小业务边界处理");
        Require(!active.Any(x=>transactions.TryGetValue(x.TransactionId,out var current)&&x.TransactionVersion!=current.Version),"内部交易存在过期匹配，请先撤销并复核");
        Require(!await db.Set<StatementLink>().AnyAsync(l=>l.UserId==user&&l.State=="Confirmed"&&rowIds.Contains(l.StatementRecordId)&&!db.Transactions.Any(t=>t.UserId==user&&t.Id==l.TransactionId&&t.Version==l.TransactionVersion&&t.Status!="Deleted")),"来源流水已有过期分配，请先撤销并复核原匹配");
        var parsed=b.Allocations.Select(x=>new{Input=x,Amount=Money(x.Amount),Row=rows[x.StatementId],Transaction=transactions[x.TransactionId]}).ToArray();
        foreach(var group in parsed.GroupBy(x=>x.Row.Id)) {
            Require(active.Count(x=>x.StatementRecordId==group.Key)+group.Count()<=100,"同一流水最多100个有效分配关系");
            var row=rows[group.Key];Require(ReconciliationAllocationMath.Fits(row.Amount,active.Where(x=>x.StatementRecordId==row.Id).Sum(x=>x.Amount),group.Sum(x=>x.Amount)),"来源流水分配超额或方向错误");
        }
        foreach(var group in parsed.GroupBy(x=>(x.Transaction.Id,x.Row.AccountId))) {
            var t=transactions[group.Key.Id];var row=group.First().Row;
            Require(active.Count(x=>x.TransactionId==t.Id)+parsed.Count(x=>x.Transaction.Id==t.Id)<=100,"同一交易最多100个有效分配关系");
            Require(StatementIdentity(user,row,t,await StatementIdentityAccounts(user,row,[t])).CounterpartyMatches!=false,"来源对方账号与内部交易的已知对方账号冲突");
            var ledger=t.Entries.Where(e=>e.Kind=="Account"&&e.AccountId==row.AccountId&&e.Currency==row.Currency).Sum(e=>e.Amount);
            Require(ReconciliationAllocationMath.Fits(ledger,active.Where(x=>x.TransactionId==t.Id&&x.AccountId==row.AccountId).Sum(x=>x.Amount),group.Sum(x=>x.Amount)),"内部交易分配超额、账户、币种或方向错误");
            var references=group.Select(x=>x.Row.Reference).Where(x=>x.Length>0).ToArray();
            Require(!await db.Set<TransactionStatementMatch>().AnyAsync(x=>x.UserId==user&&(x.TransactionId==t.Id||references.Contains(x.StatementReference))&&x.AccountId==row.AccountId&&(x.State=="Matched"||x.State=="Difference")),"交易或来源参考号存在旧版匹配");
        }
        foreach(var p in parsed) {Require(ReconciliationAllocationMath.Fits(p.Row.Amount,0,p.Amount),"分配金额方向错误");Require(!active.Any(x=>x.StatementRecordId==p.Row.Id&&x.TransactionId==p.Transaction.Id),"该分配关系已存在，请先撤销再分配");}
        var preview=parsed.Select(p=>new{statementId=p.Row.Id,transactionId=p.Transaction.Id,accountId=p.Row.AccountId,p.Row.Currency,amount=M(p.Amount),statementRemainder=M(p.Row.Amount-active.Where(l=>l.StatementRecordId==p.Row.Id).Sum(l=>l.Amount)-parsed.Where(x=>x.Row.Id==p.Row.Id).Sum(x=>x.Amount)),type=p.Transaction.Type}).ToArray();
        if(execute) {
            foreach(var t in transactions.Values) {var previous=t.Version;t.Version++;foreach(var link in active.Where(x=>x.TransactionId==t.Id&&x.TransactionVersion==previous)){link.TransactionVersion=t.Version;link.Version++;}}
            foreach(var row in rows.Values){var sum=active.Where(x=>x.StatementRecordId==row.Id).Sum(x=>x.Amount)+parsed.Where(x=>x.Row.Id==row.Id).Sum(x=>x.Amount);row.State=sum==row.Amount?"Matched":"PartiallyMatched";row.Version++;}
            foreach(var p in parsed)db.Add(new StatementLink{UserId=user,StatementRecordId=p.Row.Id,TransactionId=p.Transaction.Id,AccountId=p.Row.AccountId,Amount=p.Amount,TransactionVersion=p.Transaction.Version,Reason=b.Reason.Trim(),EvidenceJson=JsonSerializer.Serialize(new{kind="ManualAllocation",preview,engineVersion="rules-2.0.0"},Json)});
        }
        return new{executed=execute,items=preview,financialWrites=0};
    }
}
