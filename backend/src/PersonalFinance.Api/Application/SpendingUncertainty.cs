namespace PersonalFinance.Api.Application;
public sealed record ValueSensitivityRequest(ValueProblem Problem,string Parameter,decimal[] Factors);
public static class SpendingUncertainty
{
    public static object Analyze(ValueSensitivityRequest b,CancellationToken ct=default)
    {
        if(b.Factors.Length is <1 or >9||b.Factors.Any(f=>f<=0||f>3))throw new ArgumentException("Use 1–9 positive factors no greater than 3");
        var solution=SpendingOptimizer.Solve(b.Problem,ct);
        ValueProblem Change(decimal factor)
        {
            var p=b.Problem;
            if(b.Parameter.StartsWith("Weight:",StringComparison.Ordinal)&&int.TryParse(b.Parameter[7..],out var dim)&&dim>=0&&dim<p.Weights.Length){var weights=p.Weights.ToArray();weights[dim]*=factor;return p with{Weights=weights};}
            ValueCandidate[] Candidates(Func<ValueLevel,ValueLevel> f)=>p.Candidates.Select(c=>c with{Levels=c.Levels.Select(f).ToArray(),UnitPrice=c.UnitPrice is decimal n&&b.Parameter=="Price"?decimal.Round(n*factor,2):c.UnitPrice}).ToArray();
            return b.Parameter switch{
                "Budget"=>p with{Budget=decimal.Round(p.Budget*factor,2)},
                "Reserve"=>p with{MinimumRemaining=decimal.Round(p.MinimumRemaining*factor,2)},
                "Price"=>p with{Candidates=p.Candidates.Select(c=>c with{UnitPrice=c.UnitPrice is decimal n?decimal.Round(n*factor,2):null,Levels=c.Levels.Select(l=>l with{Amount=c.Kind=="Fixed"?decimal.Round(c.UnitPrice!.Value*factor,2)*l.Quantity:decimal.Round(l.Amount*factor,2)}).ToArray()}).ToArray()},
                "FutureCost"=>p with{Candidates=Candidates(l=>l with{FollowUpCost=decimal.Round(l.FollowUpCost*factor,2)})},
                "Hours"=>p with{Candidates=Candidates(l=>l with{Hours=l.Hours*factor})},
                "Uses"=>p with{Candidates=Candidates(l=>l with{Uses=l.Uses is int n?Math.Max(1,(int)decimal.Floor(n*factor)):null})},
                "LifeMonths"=>p with{Candidates=Candidates(l=>l with{LifeMonths=l.LifeMonths is int n?Math.Clamp((int)decimal.Floor(n*factor),1,1200):null})},
                _=>throw new ArgumentException("Unknown sensitivity parameter")};
        }
        var cells=b.Factors.Select(factor=>{
            ct.ThrowIfCancellationRequested();var p=Change(factor);SpendingOptimizer.Validate(p);
            var plans=solution.Plans.Select(plan=>SpendingOptimizer.Evaluate(p,p.Candidates.Select(c=>Array.FindIndex(c.Levels,l=>plan.Allocations.Any(a=>a.CandidateId==c.Id&&a.LevelId==l.Id))).ToArray())).OrderByDescending(p=>p.Feasible).ThenByDescending(p=>p.Feasible?p.Preference:decimal.MinValue).ThenBy(p=>p.TotalCost).ThenBy(p=>p.Id).ToArray();
            plans=SpendingMultiObjective.Analyze(plans);
            return new{factor,ranking=plans.Where(p=>p.Feasible).Select(p=>p.Id).ToArray(),plans};
        }).ToArray();
        var rankingChanges=cells.Where(c=>!c.ranking.SequenceEqual(solution.Plans.Where(p=>p.Feasible).Select(p=>p.Id))).Select(c=>c.factor).ToArray();
        var weightThresholds=new List<object>();
        var eligible=solution.Plans.Where(p=>p.Feasible).ToArray();
        for(int a=0;a<eligible.Length;a++)for(int bIndex=a+1;bIndex<eligible.Length;bIndex++)for(int j=0;j<b.Problem.Weights.Length;j++)
        {
            var delta=eligible[a].Scores[j]-eligible[bIndex].Scores[j];if(delta==0)continue;
            var others=b.Problem.Weights.Select((w,i)=>i==j?0:w*(eligible[a].Scores[i]-eligible[bIndex].Scores[i])).Sum();var critical=-others/delta;
            if(critical>=0&&critical<=1000000&&b.Problem.Weights.Where((_,i)=>i!=j).Sum()>0)weightThresholds.Add(new{first=eligible[a].Id,second=eligible[bIndex].Id,dimension=j,criticalWeight=critical});
        }
        var thresholds=solution.Plans.Select(p=>new{p.Id,minimumBudget=p.TotalCost+b.Problem.MinimumRemaining,minimumAvailableCash=p.TotalCost+b.Problem.SafetyFloor,minimumHours=p.Hours,minimumEnergy=p.Energy}).ToArray();
        return new{parameter=b.Parameter,cells,thresholds,rankingChanges,weightThresholds,robustPlanIds=solution.Plans.Where(p=>cells.All(c=>c.plans.Any(x=>x.Id==p.Id&&x.Feasible))).Select(p=>p.Id),scope="RETAINED_ALTERNATIVES_ONLY_NO_NEW_SEARCH; ranges are user scenarios, not occurrence probabilities",algorithmVersion=SpendingOptimizer.Version};
    }
}
