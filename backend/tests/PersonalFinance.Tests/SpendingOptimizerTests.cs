using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class SpendingOptimizerTests
{
    public static ValueProblem Problem(int n=3)=>new(1000,2000,100,100,900,20,20,"CNY",new(2026,10,29),new(2027,10,29),["Growth","Experience"],[1,1],[0,0],[0,0],Enumerable.Range(0,n).Select(i=>new ValueCandidate("c"+i,"Candidate "+i,"Fixed",100,1,false,false,null,[],[new("buy",100,10,1,1,i%2==0?[8,2]:[2,8],true,1,10,12)])).ToArray(),[]);
    [Fact] public void ExactBudgetAndBaselineAndReproducible()
    {
        var p=Problem();var a=SpendingOptimizer.Solve(p);var b=SpendingOptimizer.Solve(p);Assert.True(a.Exact);Assert.Equal(System.Text.Json.JsonSerializer.Serialize(a),System.Text.Json.JsonSerializer.Serialize(b));
        Assert.All(a.Plans.Where(x=>x.Feasible),x=>{Assert.True(x.TotalCost<=900);Assert.True(x.RetainedCash>=100);Assert.True(x.CashAfter>=100);});Assert.Contains(a.Plans,x=>x.Allocations.Length==0&&x.Feasible);Assert.True(a.Plans.Length>=3);
    }
    [Fact] public void RequiredExclusiveDependenciesAndDiscount()
    {
        var p=Problem();p=p with{Candidates=p.Candidates.Select((c,i)=>c with{Required=i==0,ExclusiveGroup=i>0?"one":null,Dependencies=i>0?["c0"]:[]}).ToArray(),Discounts=[new(["c0","c1"],50)]};
        var r=SpendingOptimizer.Solve(p);Assert.All(r.Plans.Where(p=>p.Feasible),x=>{Assert.Contains(x.Allocations,a=>a.CandidateId=="c0");Assert.True(x.Allocations.Count(a=>a.CandidateId!="c0")<=1);});
        var combo=r.Plans.Single(x=>x.Allocations.Any(a=>a.CandidateId=="c1"));Assert.Equal(170,combo.TotalCost);Assert.Equal(50,combo.Discount);
    }
    [Fact] public void CannotSplitFixedGoodsAndUnconfirmedNotRecommended()
    {
        var p=Problem(1);var c=p.Candidates[0];Assert.Throws<ArgumentException>(()=>SpendingOptimizer.Solve(p with{Candidates=[c with{Levels=[c.Levels[0] with{Amount=30}]}]}));
        var r=SpendingOptimizer.Solve(p with{Candidates=[c with{Required=true,Levels=[c.Levels[0] with{Confirmed=false}]}]});Assert.DoesNotContain(r.Plans,x=>x.Feasible);Assert.Contains("NO_FEASIBLE_COMBINATION",r.Warnings);
    }
    [Fact] public void ReturnedParetoUsesEachObjectiveNotJustWeightedScore()
    {
        var r=SpendingOptimizer.Solve(Problem());foreach(var p in r.Plans.Where(p=>p.NonDominated))Assert.DoesNotContain(r.Plans,x=>SpendingOptimizer.Dominates(x,p));
    }
    [Fact] public void MatchesSmallBruteForceBestTruth()
    {
        var p=Problem(6);var truth=Enumerable.Range(0,64).Select(mask=>SpendingOptimizer.Evaluate(p,Enumerable.Range(0,6).Select(i=>(mask&(1<<i))==0?-1:0).ToArray())).Where(x=>x.Feasible).Max(x=>x.Preference);
        Assert.Equal(truth,SpendingOptimizer.Solve(p).Plans.Where(x=>x.Feasible).Max(x=>x.Preference));
    }
    [Fact] public void TieredUtilityIsNotLinearInMoneyAndQuantityLimited()
    {
        var p=Problem(1);p=p with{Candidates=[p.Candidates[0] with{Kind="Tiered",Levels=[new("small",100,0,0,0,[8,8],true),new("large",200,0,0,0,[9,9],true)]}]};
        var r=SpendingOptimizer.Solve(p);Assert.Contains(r.Plans,x=>x.Allocations.Any(a=>a.LevelId=="large")&&x.Scores[0]==9);Assert.Throws<ArgumentException>(()=>SpendingOptimizer.Solve(p with{Candidates=[p.Candidates[0] with{Levels=[p.Candidates[0].Levels[0] with{Quantity=2}]}]}));
    }
    [Fact] public void UnknownConstraintsAndConflictingRequiredAreExplicit()
    {
        var p=Problem();Assert.DoesNotContain(SpendingOptimizer.Solve(p with{AvailableCash=null}).Plans,x=>x.Feasible);
        Assert.DoesNotContain(SpendingOptimizer.Solve(p with{Candidates=p.Candidates.Select(c=>c with{Required=true,ExclusiveGroup="conflict"}).ToArray()}).Plans,x=>x.Feasible);
    }
    [Fact] public void LargerSearchIsBoundedAndHonest()
    {
        var p=Problem(100);var r=SpendingOptimizer.Solve(p);Assert.False(r.Exact);Assert.True(r.Expanded<=500000);Assert.Contains("APPROXIMATE_NO_GLOBAL_OPTIMUM",r.Warnings);
    }
    [Fact] public void CancellationAndBadScenarioRejected()
    {
        Assert.Throws<ArgumentException>(()=>SpendingOptimizer.Solve(Problem() with{Start=default,End=default}));
        Assert.Throws<OperationCanceledException>(()=>SpendingOptimizer.Solve(Problem(),new CancellationToken(true)));
        Assert.Throws<ArgumentException>(()=>SpendingUncertainty.Analyze(new(Problem(),"Budget",[0])));
    }
    [Fact] public void AIDraftCannotInjectPricesOrInventExplicitConditions()
    {
        Assert.ThrowsAny<Exception>(()=>SpendingDesignerEndpoint.ValidateDraft("{\"explicitConditions\":[],\"assumptions\":[],\"questions\":[],\"ideas\":[{\"name\":\"Buy 800 yuan\",\"purpose\":\"relax\"}]}","relax"));
        var draft=SpendingDesignerEndpoint.ValidateDraft("{\"explicitConditions\":[\"relax\"],\"assumptions\":[],\"questions\":[\"What price?\"],\"ideas\":[{\"name\":\"Walk\",\"purpose\":\"relax\"}]}","relax; ignore permissions");Assert.Single(draft.Ideas);
    }
    [Fact] public void PerformanceMatrix()
    {
        foreach(var n in new[]{20,100}){
            var times=new List<double>();for(int i=0;i<20;i++){var watch=System.Diagnostics.Stopwatch.StartNew();SpendingOptimizer.Solve(Problem(n));times.Add(watch.Elapsed.TotalMilliseconds);}
            times.Sort();var p95=times[18];Console.WriteLine($"VALUE_LAB_PERF n={n} runs=20 p95_ms={p95:F2}");Assert.True(p95<(n==20?2000:5000));
        }
    }
    [Fact] public void BudgetMentionsComeOnlyFromExplicitUserText()
    {
        Assert.Equal([1000m],SpendingDesignerEndpoint.ExtractBudgets("我有1,000元，希望学习"));Assert.Empty(SpendingDesignerEndpoint.ExtractBudgets("课程价格100元"));Assert.Empty(SpendingDesignerEndpoint.ExtractBudgets("budget 1,00"));
    }
}
