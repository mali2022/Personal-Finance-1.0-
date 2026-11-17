using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Infrastructure;

public sealed partial class FinanceDb
{
    private string[] InvestmentReturnChangedUsers()
    {
        ChangeTracker.DetectChanges();
        return ChangeTracker.Entries<Owned>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted
                && e.Entity is InvestmentAsset or InvestmentTrade or InvestmentValuation or FxValuationRate or Account or FinanceTransaction or PersonalFinance.Api.Domain.Entry or AssetAggregationPolicy or StoredDocument { Kind: "InvestmentBoundaryValue" or "InvestmentProjectAssignment" })
            .SelectMany(e => new[] { e.Entity.UserId, e.State == EntityState.Added ? e.Entity.UserId : e.OriginalValues.GetValue<string>("UserId") })
            .Where(x => !string.IsNullOrEmpty(x)).Distinct().OrderBy(x => x, StringComparer.Ordinal).ToArray();
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        var users = InvestmentReturnChangedUsers();
        if (users.Length == 0) return base.SaveChanges(acceptAllChangesOnSuccess);
        using var transaction = Database.CurrentTransaction == null ? Database.BeginTransaction() : null;
        foreach (var user in users)
            Database.ExecuteSqlInterpolated($"UPDATE finance.Users SET InvestmentReturnRevision=NEWID() WHERE Id={user}");
        var count = base.SaveChanges(acceptAllChangesOnSuccess);
        transaction?.Commit();
        return count;
    }

    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        var users = InvestmentReturnChangedUsers();
        if (users.Length == 0) return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        await using var transaction = Database.CurrentTransaction == null ? await Database.BeginTransactionAsync(cancellationToken) : null;
        foreach (var user in users)
            await Database.ExecuteSqlInterpolatedAsync($"UPDATE finance.Users SET InvestmentReturnRevision=NEWID() WHERE Id={user}", cancellationToken);
        var count = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        if (transaction != null) await transaction.CommitAsync(cancellationToken);
        return count;
    }
}
