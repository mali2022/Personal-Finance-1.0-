using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> StatementTransactionLinks(string user,string transactionId,IQueryCollection p){
        var transaction=await Transaction(user,transactionId);var(page,size)=Paging(p);
        var q=from l in db.Set<StatementLink>().AsNoTracking() join r in db.Set<StatementRecord>().AsNoTracking() on l.StatementRecordId equals r.Id where l.UserId==user&&r.UserId==user&&l.TransactionId==transactionId select new{link=l,statement=r};
        var total=await q.CountAsync();var rows=await q.OrderByDescending(x=>x.link.CreatedAt).ThenByDescending(x=>x.link.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{total,page,pageSize=size,items=rows.Select(x=>new{x.link.Id,statementId=x.statement.Id,x.statement.AccountId,x.statement.Currency,x.statement.Reference,allocatedAmount=M(x.link.Amount),sourceState=x.statement.State,x.link.State,x.link.CreatedAt,x.link.EngineVersion,x.link.ConfirmationMode,x.link.Reason,conflict=x.link.State=="Confirmed"&&(transaction.Status=="Deleted"||transaction.Version!=x.link.TransactionVersion)})};
    }
}
