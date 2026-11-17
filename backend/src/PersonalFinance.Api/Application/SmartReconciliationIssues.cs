using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> StatementIssues(string user,string accountId,DateTimeOffset startsAt,DateTimeOffset endsAt,IQueryCollection p) {
        await Account(user,accountId,false);Require(endsAt>=startsAt&&endsAt-startsAt<=TimeSpan.FromDays(366),"异常查询期间最多366天");var(page,size)=Paging(p);size=Math.Min(size,20);
        var statements=db.Set<StatementRecord>().AsNoTracking().Where(x=>x.UserId==user&&x.AccountId==accountId&&x.OccurredAt>=startsAt&&x.OccurredAt<=endsAt);
        var q=statements.Where(x=>x.State!="Ignored");var total=await q.CountAsync();var rows=await q.OrderBy(x=>x.OccurredAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();var issues=new List<object>();
        foreach(var row in rows) {
            var links=await db.Set<StatementLink>().AsNoTracking().Where(x=>x.UserId==user&&x.StatementRecordId==row.Id&&x.State=="Confirmed").ToArrayAsync();
            if(links.Length==0)issues.Add(new{type="NoConfirmedLedgerLink",statementId=row.Id,transactionId=(string?)null,amount=M(row.Amount),reason="ReviewCandidatesBeforeDeclaringMissing",state=row.State});
            if(links.Length==0) {
                var start=row.OccurredAt.AddDays(-7);var end=row.OccurredAt.AddDays(7);
                var nearby=await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status!="Deleted"&&t.OccurredAt>=start&&t.OccurredAt<=end&&t.Entries.Any(e=>e.Kind=="Account"&&e.AccountId==accountId)).OrderBy(t=>t.OccurredAt).ThenBy(t=>t.Id).Take(12).Include(t=>t.Entries).ToArrayAsync();
                var referenced=row.Reference.Length==0?[]:await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status!="Deleted"&&t.ExternalId==row.Reference).OrderBy(t=>t.Id).Take(2).Include(t=>t.Entries).ToArrayAsync();
                var neighbors=nearby.Concat(referenced).DistinctBy(t=>t.Id).ToArray();var accounts=await StatementIdentityAccounts(user,row,neighbors);
                foreach(var t in neighbors) {
                    var reference=row.Reference.Length>0&&row.Reference==t.ExternalId;var merchant=SmartReconciliationEngine.Normalize(row.Merchant);
                    if(!reference&&(merchant.Length<3||merchant!=SmartReconciliationEngine.Normalize(t.Merchant)))continue;
                    var accountEntries=t.Entries.Where(e=>e.Kind=="Account"&&e.AccountId==accountId).ToArray();
                    void Add(string type,string reason,decimal? amount=null)=>issues.Add(new{type,statementId=row.Id,transactionId=(string?)t.Id,amount=M(amount??row.Amount),reason,state=row.State});
                    if(accountEntries.Length==0){Add("AccountMismatch","SameReferenceDifferentLedgerAccount");continue;}
                    var ledger=accountEntries.Where(e=>e.Currency==row.Currency).Sum(e=>e.Amount);
                    if(accountEntries.All(e=>e.Currency!=row.Currency))Add("CurrencyMismatch","PossibleReferencedOrMerchantCandidateHasDifferentAccountCurrency");
                    else if(Math.Sign(ledger)!=Math.Sign(row.Amount))Add("DirectionMismatch","PossibleCandidateHasOppositeAccountFlow");
                    else if(ledger!=row.Amount)Add("AmountMismatch","PossibleCandidateSignedAmountDifference",row.Amount-ledger);
                    var occurrenceDays=Math.Abs((row.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date-t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date).Days);
                    if(occurrenceDays>3)Add("DateMismatch","PossibleCandidateTransactionDateDiffersOverThreeDays");
                    if(reference&&merchant.Length>0&&merchant!=SmartReconciliationEngine.Normalize(t.Merchant))Add("MerchantMismatch","SameReferenceDifferentNormalizedMerchant");
                    if(row.Type!=t.Type)Add("TypeNeedsReview","SourceTypeAndLedgerBusinessTypeDiffer");
                    var identity=StatementIdentity(user,row,t,accounts);
                    if(identity.CounterpartyMatches==false)Add("CounterpartyMismatch","KnownCounterpartyAccountDoesNotMatch");
                    if(row.PaymentSource.Length>0&&identity.PaymentSourceMatches!=true)Add("PaymentSourceUnverified","PaymentChannelCannotBeVerifiedFromAccountIdentity");
                    if(t.Type=="Refund"&&!await db.Transactions.AnyAsync(o=>o.UserId==user&&o.Id==t.OriginalTransactionId&&o.Type=="Expense"&&o.Status!="Deleted"))Add("RefundOriginMissing","NoActiveOriginalExpense");
                }
            }
            if(row.State=="PartiallyMatched")issues.Add(new{type="PartialAmount",statementId=row.Id,transactionId=(string?)null,amount=M(row.Amount-links.Sum(l=>l.Amount)),reason="UnallocatedStatementAmount",state=row.State});
            var day=row.OccurredAt.AddHours(-24);var next=row.OccurredAt.AddHours(24);
            if(await statements.AnyAsync(x=>x.Id!=row.Id&&x.Amount==row.Amount&&x.Currency==row.Currency&&x.Merchant==row.Merchant&&x.OccurredAt>=day&&x.OccurredAt<=next))issues.Add(new{type="SuspectedDuplicate",statementId=row.Id,transactionId=(string?)null,amount=M(row.Amount),reason="SameAccountAmountMerchantWithinOneDay",state=row.State});
            foreach(var link in links) {
                var t=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(t=>t.Id==link.TransactionId&&t.UserId==user);
                if(t==null||t.Status=="Deleted"||t.Version!=link.TransactionVersion)issues.Add(new{type="ModifiedMatchedTransaction",statementId=row.Id,transactionId=(string?)link.TransactionId,amount=M(link.Amount),reason="TransactionVersionOrStatusChanged",state=row.State});
                if(t?.Type=="Refund"&&!await db.Transactions.AnyAsync(x=>x.UserId==user&&x.Id==t.OriginalTransactionId&&x.Status!="Deleted"&&x.Type=="Expense"))issues.Add(new{type="RefundOriginMissing",statementId=row.Id,transactionId=(string?)link.TransactionId,amount=M(link.Amount),reason="NoActiveOriginalExpense",state=row.State});
                if(t?.Type is "Transfer" or "CreditCardPayment" && !await db.Set<StatementLink>().AnyAsync(x=>x.UserId==user&&x.TransactionId==t.Id&&x.AccountId!=accountId&&x.State=="Confirmed"))issues.Add(new{type="TransferOtherEndMissing",statementId=row.Id,transactionId=(string?)link.TransactionId,amount=M(link.Amount),reason="OnlyOneAccountEndConfirmed",state=row.State});
            }
        }
        var ledgerOnly=await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status!="Deleted"&&t.OccurredAt>=startsAt&&t.OccurredAt<=endsAt&&t.Entries.Any(e=>e.Kind=="Account"&&e.AccountId==accountId)&&!db.Set<StatementLink>().Any(l=>l.UserId==user&&l.AccountId==accountId&&l.TransactionId==t.Id&&l.State=="Confirmed")).OrderBy(t=>t.OccurredAt).ThenBy(t=>t.Id).Skip((page-1)*size).Take(size).Select(t=>new{transactionId=t.Id,t.Type,t.OccurredAt,reason="NoConfirmedStatementLink"}).ToArrayAsync();
        return new{issues,ledgerOnly,total,page,pageSize=size,basis="UnconfirmedLinkIsNotProofOfMissingFinancialData"};
    }
}
