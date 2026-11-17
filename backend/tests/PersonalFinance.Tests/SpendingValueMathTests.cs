using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class SpendingValueMathTests
{
    [Fact] public void SafetyPrecedesPreferenceAndRetainsRemainder()
    {
        var result = SpendingValueMath.Compare(new(1000, 1000, 200, 10, [1],
            [new("spend", [new("item", 900, 0, 1, 3)], [10], true), new("keep", [], [2], true)]));
        Assert.Equal("keep", result[0].Id);
        Assert.Equal(1000, result[0].Remaining);
        Assert.False(result[1].Feasible);
        Assert.Equal(300, result[1].CostPerUse);
    }
    [Fact] public void MissingCashCannotBeRankedAsFeasible()
    {
        var result = SpendingValueMath.Compare(new(1000, null, 0, 10, [1],
            [new("a", [], [10], true), new("b", [], [1], false)]));
        Assert.All(result, r => { Assert.False(r.Feasible); Assert.Null(r.FinanciallySafe); });
        Assert.Null(result.Single(r => r.Id == "b").PreferenceScore);
    }
    [Fact] public void FollowUpCostsCountAgainstBudget()
    {
        var result = SpendingValueMath.Compare(new(1000, 5000, 0, 10, [1],
            [new("a", [new("x", 700, 400, 1, 2)], [10], true), new("b", [], [0], true)]));
        Assert.Equal(-100, result.Single(r => r.Id == "a").Remaining);
    }

    [Fact] public void HardValueAndRemainingConstraintsPrecedeScores()
    {
        var b=new SpendingInput(1000,2000,0,10,[1,1],[new("A",[new("x",900,0,1,2)],[10,1],true),new("B",[],[5,5],true)],200,100,[0,3]);
        var r=SpendingValueMath.Compare(b);Assert.Equal("B",r[0].Id);Assert.False(r[1].Feasible);Assert.Contains("REQUIRED_VALUE_BREACHED",r[1].Reasons);Assert.Equal(9,r[1].GoalRecoveryMonths);
    }
    [Fact] public void ComboCostsAndTradeoffsRemainNonDominated()
    {
        var r=SpendingValueMath.Compare(new(1000,2000,0,10,[1],[new("A",[new("x",100,20,1,2),new("y",200,30,2,3)],[9],true),new("B",[],[2],true)]));
        Assert.Equal(350,r[0].TotalCost);Assert.Equal(650,r[0].Remaining);Assert.Null(r[0].CostPerUse);Assert.All(r,x=>Assert.True(x.NonDominated));
    }
    [Fact] public void SensitivityPreservesTiesAndChangesRanking()
    {
        var b=new SpendingInput(1000,2000,0,10,[1,1],[new("A",[],[10,0],true),new("B",[],[0,10],true)]);
        var e=System.Text.Json.JsonSerializer.SerializeToElement(SpendingValueMath.Sensitivity(b));Assert.Equal(2,e.GetProperty("leaders").GetArrayLength());Assert.Equal(4,e.GetProperty("variants").GetArrayLength());
        Assert.Equal("B",e.GetProperty("variants")[0].GetProperty("ranking")[0].GetString());
    }
    [Fact] public void ZeroWeightsAndNegativeCostsAreRejected()
    {
        var b=new SpendingInput(1,1,0,1,[0],[new("A",[],[1],true),new("B",[],[1],true)]);Assert.Throws<ArgumentException>(()=>SpendingValueMath.Compare(b));
        Assert.Throws<ArgumentException>(()=>SpendingValueMath.Compare(b with{Weights=[1],Options=[new("A",[new("x",-1,0,0,1)],[1],true),new("B",[],[1],true)]}));
    }
}
