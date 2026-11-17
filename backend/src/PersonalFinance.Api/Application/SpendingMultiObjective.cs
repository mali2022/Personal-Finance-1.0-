namespace PersonalFinance.Api.Application;
/// <summary>Independent preference and Pareto analysis. No monetary metric is added to subjective scores.</summary>
public static class SpendingMultiObjective
{
    public static decimal Preference(decimal[] scores,decimal[] weights)
    {
        if(scores.Length!=weights.Length||weights.Any(w=>w<0)||weights.Sum()<=0)throw new ArgumentException("Invalid preference dimensions");
        return scores.Zip(weights,(s,w)=>s*w).Sum()/weights.Sum();
    }
    public static bool Dominates(ValuePlan a,ValuePlan b) => a.Id!=b.Id&&a.Feasible&&b.Feasible&&a.TotalCost<=b.TotalCost&&a.Hours<=b.Hours&&a.Energy<=b.Energy&&a.Scores.Zip(b.Scores,(x,y)=>x>=y).All(v=>v)&&(a.TotalCost<b.TotalCost||a.Hours<b.Hours||a.Energy<b.Energy||a.Scores.Zip(b.Scores,(x,y)=>x>y).Any(v=>v));
    public static ValuePlan[] Analyze(IEnumerable<ValuePlan> alternatives)
    {
        var plans=alternatives.ToArray();
        return plans.Select(r=>{var dominated=plans.Where(x=>Dominates(x,r)).Select(x=>x.Id).ToArray();return r with{NonDominated=r.Feasible&&dominated.Length==0,DominatedBy=dominated};}).OrderByDescending(r=>r.Feasible).ThenByDescending(r=>r.Feasible?r.Preference:decimal.MinValue).ThenBy(r=>r.TotalCost).ThenBy(r=>r.Id,StringComparer.Ordinal).ToArray();
    }
}
