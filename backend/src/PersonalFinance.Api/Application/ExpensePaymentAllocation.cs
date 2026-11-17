using System.Numerics;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record ExpensePaymentEntry(string AccountId,string CategoryId,decimal Amount);
public static class ExpensePaymentAllocation
{
    public static ExpensePaymentEntry[] Allocate(Split[] categories,PaymentSplit[] payments)
    {
        var capacity=payments.Select(p=>new BigInteger(FinanceService.Money(p.Amount,true)*100)).ToArray();
        var result=new List<ExpensePaymentEntry>();
        foreach(var category in categories) {
            var cents=new BigInteger(FinanceService.Money(category.Amount,true)*100);var total=capacity.Aggregate(BigInteger.Zero,(a,b)=>a+b);
            FinanceService.Require(total>=cents && total>0,"付款金额与分类金额不一致");
            var amounts=capacity.Select(c=>cents*c/total).ToArray();var remainder=cents-amounts.Aggregate(BigInteger.Zero,(a,b)=>a+b);
            foreach(var i in Enumerable.Range(0,capacity.Length).OrderByDescending(i=>cents*capacity[i]%total).ThenBy(i=>i)) {if(remainder==0)break;if(amounts[i]<capacity[i]){amounts[i]++;remainder--;}}
            for(var i=0;i<capacity.Length;i++){capacity[i]-=amounts[i];if(amounts[i]>0)result.Add(new(payments[i].AccountId,category.CategoryId,(decimal)amounts[i]/100));}
        }
        FinanceService.Require(capacity.All(c=>c==0),"付款合计必须等于消费金额");return result.ToArray();
    }
}
