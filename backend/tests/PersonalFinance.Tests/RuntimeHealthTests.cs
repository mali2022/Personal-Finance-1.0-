using PersonalFinance.Api.Application;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class RuntimeHealthTests
{
    [Fact]
    public void ReplacingBinaryDoesNotChangeTheRunningBuildIdentity()
    {
        var file = Path.GetTempFileName();
        try
        {
            File.WriteAllText(file, "original build");
            var running = new RuntimeBuild(file);
            var originalId = running.BuildId;
            Assert.True(running.IsCurrent());
            File.WriteAllText(file, "replacement build");
            Assert.False(running.IsCurrent());
            Assert.Equal(originalId, running.BuildId);
            Assert.NotEqual(originalId, new RuntimeBuild(file).BuildId);
        }
        finally { File.Delete(file); }
    }

    [Fact]
    public void MissingBinaryIsNotReportedAsReady()
    {
        var file = Path.GetTempFileName();
        var running = new RuntimeBuild(file);
        File.Delete(file);
        Assert.False(running.IsCurrent());
    }
}
