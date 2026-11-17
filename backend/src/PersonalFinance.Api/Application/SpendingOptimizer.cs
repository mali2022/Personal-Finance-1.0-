namespace PersonalFinance.Api.Application;

public sealed record ValueLevel(string Id, decimal Amount, decimal FollowUpCost, decimal Hours, decimal Energy,
    decimal[] Scores, bool Confirmed, int Quantity = 1, int? Uses = null, int? LifeMonths = null, string? PriceSource = null, DateTimeOffset? PriceCheckedAt = null);
public sealed record ValueCandidate(string Id, string Name, string Kind, decimal? UnitPrice, int MaxQuantity,
    bool Required, bool Excluded, string? ExclusiveGroup, string[] Dependencies, ValueLevel[] Levels, string? IdeaTraceId = null);
public sealed record ValueDiscount(string[] CandidateIds, decimal Amount);
public sealed record ValueProblem(decimal Budget, decimal? AvailableCash, decimal SafetyFloor, decimal MinimumRemaining,
    decimal MaxSpend, decimal? MaxHours, decimal? MaxEnergy, string Currency, DateOnly Start, DateOnly End,
    string[] Dimensions, decimal[] Weights, decimal[] MinimumScores, decimal[] BaselineScores,
    ValueCandidate[] Candidates, ValueDiscount[] Discounts, decimal? AnnualOpportunityRate = null);
public sealed record ValueAllocation(string CandidateId, string Name, string LevelId, int Quantity, decimal Amount,
    decimal FollowUpCost, decimal Hours, decimal Energy, int? Uses, int? LifeMonths, decimal? CostPerUse, string? PriceSource, DateTimeOffset? PriceCheckedAt);
public sealed record ValuePlan(string Id, string[] Profiles, ValueAllocation[] Allocations, decimal Spending,
    decimal Discount, decimal FutureCost, decimal TotalCost, decimal RetainedCash, decimal? CashAfter,
    decimal Hours, decimal Energy, decimal[] Scores, decimal Preference, bool Feasible, string[] Reasons,
    bool NonDominated, string[] DominatedBy, decimal? OpportunityCost);
public sealed record ValueSolution(string AlgorithmVersion, string Method, bool Exact, bool Complete, int Expanded,
    string[] Missing, string[] Warnings, ValuePlan[] Plans);

/// <summary>Bounded deterministic search. Money is decimal; scores saturate, never scale with price.</summary>
public static class SpendingOptimizer
{
    public const string Version = "value-lab-2.0.0";
    const int ExactLimit = 131072, Beam = 192, MaxExpanded = 500000;
    static bool Money(decimal n) => n >= 0 && n <= 1000000000000m && decimal.Round(n, 2) == n;
    static bool Scores(decimal[] a, int d) => a.Length == d && a.All(v => v is >= 0 and <= 10);
    public static void Validate(ValueProblem p)
    {
        var d = p.Dimensions.Length;
        if (!Money(p.Budget) || !Money(p.MaxSpend) || !Money(p.SafetyFloor) || !Money(p.MinimumRemaining) || p.AvailableCash is decimal cash && !Money(cash) ||
            p.MaxHours < 0 || p.MaxHours > 1000000 || p.MaxEnergy < 0 || p.MaxEnergy > 1000000 || p.AnnualOpportunityRate < 0 || p.AnnualOpportunityRate > 1 ||
            !CurrencyDefinitions.Supports(p.Currency) || p.Start.Year < 1900 || p.End.Year > 9998 || p.End < p.Start || p.End.DayNumber - p.Start.DayNumber > 3660 ||
            d is < 1 or > 12 || p.Dimensions.Any(s => string.IsNullOrWhiteSpace(s) || s.Length > 50) || p.Dimensions.Distinct().Count() != d ||
            p.Weights.Length != d || p.Weights.Any(v => v < 0 || v > 1000000) || p.Weights.Sum() <= 0 || !Scores(p.MinimumScores,d) || !Scores(p.BaselineScores,d) ||
            p.Candidates.Length is < 1 or > 100 || p.Candidates.Select(c => c.Id).Distinct().Count() != p.Candidates.Length || p.Discounts.Length > 30)
            throw new ArgumentException("Invalid problem or resource limits / 约束参数无效");
        foreach (var c in p.Candidates)
        {
            if (string.IsNullOrWhiteSpace(c.Id) || c.Id.Length > 60 || c.Name.Length is < 1 or > 100 || c.ExclusiveGroup?.Length > 60 ||
                c.Kind is not ("Fixed" or "Tiered" or "Allocation") || c.MaxQuantity is < 1 or > 20 || c.Dependencies.Length > 100 || c.Dependencies.Distinct().Count() != c.Dependencies.Length ||
                c.Dependencies.Any(id => id == c.Id || !p.Candidates.Any(x => x.Id == id)) || c.Levels.Length is < 1 or > 8 || c.Levels.Select(l => l.Id).Distinct().Count() != c.Levels.Length ||
                c.Kind == "Fixed" && (c.UnitPrice == null || !Money(c.UnitPrice.Value))) throw new ArgumentException("Invalid candidate / 候选项目无效");
            foreach (var l in c.Levels)
                if (string.IsNullOrWhiteSpace(l.Id) || l.Id.Length > 60 || !Money(l.Amount) || !Money(l.FollowUpCost) || l.Hours is < 0 or > 1000000 || l.Energy is < 0 or > 1000000 ||
                    !Scores(l.Scores,d) || l.Quantity < 1 || l.Quantity > c.MaxQuantity || l.Uses <= 0 || l.LifeMonths is <= 0 or > 1200 || l.PriceSource?.Length > 500 ||
                    l.PriceSource != null && l.PriceCheckedAt == null || c.Kind == "Fixed" && l.Amount != c.UnitPrice * l.Quantity)
                    throw new ArgumentException("Invalid price, quantity or explicit utility level / 价格、数量或效用档位无效");
        }
        foreach(var discount in p.Discounts)
            if(!Money(discount.Amount) || discount.CandidateIds.Length is < 2 or > 100 || discount.CandidateIds.Distinct().Count()!=discount.CandidateIds.Length || discount.CandidateIds.Any(id=>!p.Candidates.Any(c=>c.Id==id)))
                throw new ArgumentException("Invalid combination discount / 组合优惠无效");
    }
    sealed record State(int[] Choices, decimal Cost, decimal Hours, decimal Energy, decimal[] Scores);
    static decimal Preference(decimal[] scores, decimal[] weights) => SpendingMultiObjective.Preference(scores,weights);
    static State Add(State s, ValueProblem p, int i, int level)
    {
        var choices=(int[])s.Choices.Clone();choices[i]=level;
        if(level<0)return s with {Choices=choices};
        var l=p.Candidates[i].Levels[level];
        return new(choices,s.Cost+l.Amount+l.FollowUpCost,s.Hours+l.Hours,s.Energy+l.Energy,s.Scores.Select((v,j)=>10-(10-v)*(10-l.Scores[j])/10).ToArray());
    }
    static string Key(State s) => string.Join(',',s.Choices);
    public static ValueSolution Solve(ValueProblem p, CancellationToken ct = default)
    {
        Validate(p);ct.ThrowIfCancellationRequested();
        var watch=System.Diagnostics.Stopwatch.StartNew();
        var exactBound=Math.Min(ExactLimit,Math.Max(512,262144/p.Candidates.Length));
        long combinations=1;
        foreach(var c in p.Candidates) combinations=Math.Min(exactBound+1,(long)combinations*(c.Excluded?1:c.Required?c.Levels.Length:c.Levels.Length+1));
        bool exact=combinations<=exactBound, complete=true;int expanded=0;
        var states=new List<State>{new(Enumerable.Repeat(-1,p.Candidates.Length).ToArray(),0,0,0,p.BaselineScores.ToArray())};
        for(int i=0;i<p.Candidates.Length;i++)
        {
            ct.ThrowIfCancellationRequested();
            if(watch.Elapsed>TimeSpan.FromSeconds(5)) throw new TimeoutException("Optimization time limit / 求解超时，请缩减候选档位");
            var c=p.Candidates[i];var next=new List<State>();
            foreach(var s in states)
            {
                if(!c.Required || c.Excluded)next.Add(Add(s,p,i,-1));
                if(!c.Excluded)for(int level=0;level<c.Levels.Length;level++)next.Add(Add(s,p,i,level));
            }
            expanded+=next.Count;
            if(expanded>MaxExpanded)throw new ArgumentException("Search limit exceeded / 超出求解资源限制");
            if(!exact && next.Count>Beam)
            {
                complete=false;
                // Keep diverse deterministic beams; never claim a global optimum.
                var keep=new Dictionary<string,State>();
                void Take(IEnumerable<State> q,int n){foreach(var s in q.Take(n))keep.TryAdd(Key(s),s);}
                Take(next.OrderBy(s=>s.Cost).ThenBy(Key,StringComparer.Ordinal),32);
                Take(next.OrderByDescending(s=>Preference(s.Scores,p.Weights)).ThenBy(s=>s.Cost).ThenBy(Key,StringComparer.Ordinal),64);
                for(int j=0;j<p.Dimensions.Length;j++){var dim=j;Take(next.OrderByDescending(s=>s.Scores[dim]).ThenBy(s=>s.Cost).ThenBy(Key,StringComparer.Ordinal),4);}
                Take(next.OrderBy(s=>s.Hours).ThenBy(s=>s.Cost).ThenBy(Key,StringComparer.Ordinal),16);
                Take(next.OrderBy(s=>Math.Max(0,s.Cost-p.MaxSpend)+Math.Max(0,s.Hours-(p.MaxHours??0))+Math.Max(0,s.Energy-(p.MaxEnergy??0))).ThenByDescending(s=>Preference(s.Scores,p.Weights)).ThenBy(Key,StringComparer.Ordinal),24);
                states=keep.Values.Take(Beam).ToList();
            }else states=next;
        }
        var evaluated=new List<ValuePlan>();
        foreach(var s in states){if(evaluated.Count%256==0){ct.ThrowIfCancellationRequested();if(watch.Elapsed>TimeSpan.FromSeconds(5))throw new TimeoutException("Optimization time limit");}var result=Evaluate(p,s.Choices);evaluated.Add(result);}
        var feasible=evaluated.Where(r=>r.Feasible).ToArray();
        var candidates=new Dictionary<string,ValuePlan>();
        void Choose(IEnumerable<ValuePlan> q,string profile,int count){foreach(var plan in q.Take(count)){if(candidates.TryGetValue(plan.Id,out var old))candidates[plan.Id]=old with{Profiles=old.Profiles.Append(profile).Distinct().ToArray()};else candidates[plan.Id]=plan with{Profiles=[profile]};}}
        Choose(feasible.OrderByDescending(r=>r.Preference).ThenBy(r=>r.TotalCost).ThenBy(r=>r.Id,StringComparer.Ordinal),"Custom",8);
        Choose(feasible.OrderBy(r=>r.TotalCost).ThenByDescending(r=>r.Preference).ThenBy(r=>r.Id,StringComparer.Ordinal),"Saving",3);
        Choose(feasible.OrderByDescending(r=>r.Scores.Average()).ThenBy(r=>r.TotalCost).ThenBy(r=>r.Id,StringComparer.Ordinal),"Balanced",3);
        for(int j=0;j<p.Dimensions.Length;j++){var dim=j;Choose(feasible.OrderByDescending(r=>r.Scores[dim]).ThenBy(r=>r.TotalCost).ThenBy(r=>r.Id,StringComparer.Ordinal),p.Dimensions[j],2);}
        var baseline=Evaluate(p,Enumerable.Repeat(-1,p.Candidates.Length).ToArray());
        candidates.TryAdd(baseline.Id,baseline with{Profiles=["KeepCashReference"]});
        var plans=candidates.Values.ToArray();
        plans=SpendingMultiObjective.Analyze(plans);
        return new(Version,exact?"BoundedEnumeration":"DeterministicDiverseBeam",exact,complete,expanded,
            new[]{p.AvailableCash==null?"AVAILABLE_CASH_UNKNOWN":null,p.MaxHours==null?"TIME_LIMIT_UNKNOWN":null,p.MaxEnergy==null?"ENERGY_LIMIT_UNKNOWN":null,p.AnnualOpportunityRate==null?"OPPORTUNITY_RATE_UNKNOWN":null}.OfType<string>().ToArray(),
            new[]{!exact?"APPROXIMATE_NO_GLOBAL_OPTIMUM":null,feasible.Length==0?(exact?"NO_FEASIBLE_COMBINATION":"NO_FEASIBLE_COMBINATION_FOUND"):null,"PARETO_WITHIN_RETURNED_SET","SATURATING_USER_UTILITY_NO_PRICE_LINEARITY","ALL_COSTS_UPFRONT_NO_FUTURE_INCOME","DISCOUNTS_STACK_AND_CAP_AT_PURCHASE_COST"}.OfType<string>().ToArray(),plans);
    }
    public static ValuePlan Evaluate(ValueProblem p,int[] choices)
    {
        var selected=p.Candidates.Select((c,i)=>(c,i)).Where(x=>choices[x.i]>=0).ToArray();var ids=selected.Select(x=>x.c.Id).ToHashSet();
        var allocations=selected.Select(x=>{var l=x.c.Levels[choices[x.i]];return new ValueAllocation(x.c.Id,x.c.Name,l.Id,l.Quantity,l.Amount,l.FollowUpCost,l.Hours,l.Energy,l.Uses,l.LifeMonths,l.Uses is int uses?(l.Amount+l.FollowUpCost)/uses:null,l.PriceSource,l.PriceCheckedAt);}).ToArray();
        var spending=allocations.Sum(a=>a.Amount);var discount=Math.Min(spending,p.Discounts.Where(d=>d.CandidateIds.All(ids.Contains)).Sum(d=>d.Amount));
        var future=allocations.Sum(a=>a.FollowUpCost);var total=spending-discount+future;var hours=allocations.Sum(a=>a.Hours);var energy=allocations.Sum(a=>a.Energy);
        var scores=p.BaselineScores.ToArray();foreach(var x in selected){var l=x.c.Levels[choices[x.i]];scores=scores.Select((s,j)=>10-(10-s)*(10-l.Scores[j])/10).ToArray();}
        var reasons=new List<string>();
        if(total>p.Budget || total>p.MaxSpend)reasons.Add("BUDGET_EXCEEDED");if(p.Budget-total<p.MinimumRemaining)reasons.Add("MINIMUM_REMAINING_BREACHED");
        if(p.AvailableCash==null)reasons.Add("AVAILABLE_CASH_UNKNOWN");else if(p.AvailableCash-total<p.SafetyFloor)reasons.Add("SAFETY_FLOOR_BREACHED");
        if(p.MaxHours==null)reasons.Add("TIME_LIMIT_UNKNOWN");else if(hours>p.MaxHours)reasons.Add("TIME_EXCEEDED");
        if(p.MaxEnergy==null)reasons.Add("ENERGY_LIMIT_UNKNOWN");else if(energy>p.MaxEnergy)reasons.Add("ENERGY_EXCEEDED");
        if(selected.Any(x=>!x.c.Levels[choices[x.i]].Confirmed))reasons.Add("PRICE_AND_SCORES_UNCONFIRMED");
        if(p.Candidates.Any(c=>c.Required&&!ids.Contains(c.Id)))reasons.Add("REQUIRED_ITEM_MISSING");if(selected.Any(x=>x.c.Excluded))reasons.Add("EXCLUDED_ITEM");
        if(selected.Any(x=>x.c.Dependencies.Any(id=>!ids.Contains(id))))reasons.Add("DEPENDENCY_MISSING");
        if(selected.Where(x=>!string.IsNullOrEmpty(x.c.ExclusiveGroup)).GroupBy(x=>x.c.ExclusiveGroup).Any(g=>g.Count()>1))reasons.Add("MUTUALLY_EXCLUSIVE");
        if(scores.Where((s,i)=>s<p.MinimumScores[i]).Any())reasons.Add("REQUIRED_VALUE_BREACHED");
        var key=System.Text.Json.JsonSerializer.Serialize(p.Candidates.Select((c,i)=>new[]{c.Id,choices[i]<0?"":c.Levels[choices[i]].Id}));
        var id=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key))).ToLowerInvariant()[..20];
        return new(id,[],allocations,spending,discount,future,total,p.Budget-total,p.AvailableCash-total,hours,energy,scores,Preference(scores,p.Weights),reasons.Count==0,reasons.ToArray(),false,[],p.AnnualOpportunityRate is decimal rate?decimal.Round(total*rate*(p.End.DayNumber-p.Start.DayNumber)/365m,2):null);
    }
    public static bool Dominates(ValuePlan a,ValuePlan b) => SpendingMultiObjective.Dominates(a,b);
}
