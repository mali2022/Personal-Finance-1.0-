using Xunit;

// Rollback fixtures share one SQL database. Cross-class parallel scans can deadlock
// on uncommitted fixture rows even though the business users are different.
[CollectionDefinition("Finance SQL", DisableParallelization = true)]
public sealed class FinanceSqlCollection { }
