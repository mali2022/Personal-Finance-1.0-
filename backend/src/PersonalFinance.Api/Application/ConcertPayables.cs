using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record ConcertPayableInput(string Counterparty,string Currency,string Amount,string CategoryId,DateTimeOffset OccurredAt,string Note,bool Confirmed);
public sealed record ConcertPayableRefund(string Amount,DateTimeOffset OccurredAt,string Note,bool Confirmed,string? AccountId=null);
public sealed partial class FinanceService {
    const string ConcertPayableKind="ConcertPayable";
    async Task<HashSet<string>> ConcertPayableBusinesses(string user)=>(await db.Documents.AsNoTracking().Where(d=>d.UserId==user && d.Kind==ConcertPayableKind).Select(d=>d.Name).ToArrayAsync()).ToHashSet();
    static bool ConcertPersonalSource(FinanceTransaction t,HashSet<string> payables)=>t.Type=="Expense" && t.BusinessId==null || t.Type=="LoanReceived" && t.BusinessId!=null && payables.Contains(t.BusinessId);
    public async Task<object> CreateConcertPayable(string user,ConcertPayableInput input) {
        await RequireConcerts(user);Require(input.Confirmed,"请明确确认他人已实际代付并形成应付，此操作将记账");ConcertText(input.Counterparty,200,true);ConcertText(input.Note,2000);Require(CurrencyDefinitions.Supports(input.Currency) && input.OccurredAt.Year>=1900 && input.OccurredAt<=DateTimeOffset.UtcNow,"币种或已发生日期无效");await Category(user,input.CategoryId,"Expense");var amount=Money(input.Amount,true);
        var business=new Business{UserId=user,Kind="Borrowed",Counterparty=input.Counterparty.Trim(),Currency=input.Currency,Principal=amount,OccurredAt=input.OccurredAt,Note=input.Note,Status="Submitted"};
        var payable=new Account{UserId=user,Type="Payable",Currency=input.Currency,Name="他人代付 · "+business.Counterparty};business.AccountId=payable.Id;business.ContractAccountId=payable.Id;
        var original=new FinanceTransaction{UserId=user,Type="LoanReceived",BusinessId=business.Id,AccountId=payable.Id,Amount=amount,Currency=input.Currency,OccurredAt=input.OccurredAt.ToUniversalTime(),CategoryId=input.CategoryId,Merchant=business.Counterparty,Note=input.Note};
        original.Entries.Add(new Entry{UserId=user,TransactionId=original.Id,Kind="Account",AccountId=payable.Id,Currency=input.Currency,Amount=-amount,BaseAmount=-amount});
        original.Entries.Add(new Entry{UserId=user,TransactionId=original.Id,Kind="Expense",CategoryId=input.CategoryId,Currency=input.Currency,Amount=amount,BaseAmount=amount});
        db.AddRange(payable,business,original,new StoredDocument{UserId=user,Kind=ConcertPayableKind,Name=business.Id,ContentType="application/json",Content=System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new{transactionId=original.Id},Json)});
        db.Add(new AuditRecord{UserId=user,ResourceType="Business",ResourceId=business.Id,Action="OtherPaid",ChangesJson=System.Text.Json.JsonSerializer.Serialize(new{transactionId=original.Id,amount=M(amount),cashImpact="0.00",liabilityImpact=M(amount)},Json)});
        return new {businessId=business.Id,transactionId=original.Id,version=business.Version.ToString(),cashImpact="0.00",expense=M(amount),payable=M(amount)};
    }
    public async Task<object> RefundConcertPayable(string user,string id,ConcertPayableRefund input,string? version) {
        await RequireConcerts(user);Require(input.Confirmed && (await ConcertPayableBusinesses(user)).Contains(id),"须明确确认本人他人代付业务的实际退款");var business=await BusinessEntity(user,id);Version(business,version);await RequireActiveBusiness(user,business);ConcertText(input.Note,2000);
        var original=await db.Transactions.Include(t=>t.Entries).SingleAsync(t=>t.UserId==user && t.BusinessId==id && t.Type=="LoanReceived" && t.Status=="Confirmed");
        var amount=Money(input.Amount,true);var refunded=await db.Transactions.Where(t=>t.UserId==user && t.OriginalTransactionId==original.Id && t.Status!="Deleted").SumAsync(t=>(decimal?)t.Amount)??0;
        Require(amount+refunded<=original.Amount && input.OccurredAt>=original.OccurredAt && input.OccurredAt<=DateTimeOffset.UtcNow,"实际退款超过原代付消费或日期无效");
        var account=input.AccountId==null?await Account(user,business.ContractAccountId,false):await Account(user,input.AccountId);Require(account.Currency==business.Currency && (input.AccountId==null || !new[]{"Payable","Receivable","ConsumerLoan","SecuredLoan"}.Contains(account.Type)),"退款账户币种或类型无效");
        if(input.AccountId==null) Require(amount<=business.Principal-await Settled(user,business),"冲减应付超过剩余本金；已结清款退至本人账户时请明确到账账户");
        var refund=new FinanceTransaction{UserId=user,Type="Refund",BusinessId=id,OriginalTransactionId=original.Id,AccountId=account.Id,Amount=amount,Currency=business.Currency,CategoryId=original.CategoryId,OccurredAt=input.OccurredAt.ToUniversalTime(),Note=input.Note};
        refund.Entries.Add(new Entry{UserId=user,TransactionId=refund.Id,Kind="Account",AccountId=account.Id,Currency=business.Currency,Amount=amount,BaseAmount=amount});
        refund.Entries.Add(new Entry{UserId=user,TransactionId=refund.Id,Kind="Expense",CategoryId=original.CategoryId,Currency=business.Currency,Amount=-amount,BaseAmount=-amount,OriginalEntryId=original.Entries.Single(e=>e.Kind=="Expense").Id});
        db.Add(refund);account.Version++;business.Version++;
        db.Add(new AuditRecord{UserId=user,ResourceType="Business",ResourceId=id,Action="OtherPaidRefund",ChangesJson=System.Text.Json.JsonSerializer.Serialize(new{transactionId=refund.Id,original.Id,amount=M(amount),cashImpact=M(input.AccountId==null || new[]{"CreditCard","ConsumerCredit"}.Contains(account.Type)?0:amount),payableReduction=M(input.AccountId==null?amount:0)},Json)});
        return new {transactionId=refund.Id,businessId=id,version=business.Version.ToString(),cashImpact=M(input.AccountId==null || new[]{"CreditCard","ConsumerCredit"}.Contains(account.Type)?0:amount),payableReduction=M(input.AccountId==null?amount:0)};
    }
    public async Task<object> ConcertPayableChoices(string user,string currency) {
        await RequireConcerts(user);Require(CurrencyDefinitions.Supports(currency),"币种无效");var ids=await ConcertPayableBusinesses(user);var rows=await db.Businesses.AsNoTracking().Where(b=>b.UserId==user && ids.Contains(b.Id) && b.Currency==currency).OrderByDescending(b=>b.OccurredAt).Take(100).ToArrayAsync();var result=new List<object>();
        foreach(var b in rows) {var active=await db.Transactions.AnyAsync(t=>t.UserId==user && t.BusinessId==b.Id && t.Type=="LoanReceived" && t.Status=="Confirmed");if(active)result.Add(new{b.Id,b.Counterparty,principal=M(b.Principal),outstanding=M(b.Principal-await Settled(user,b)),version=b.Version.ToString()});}return result;
    }
}
