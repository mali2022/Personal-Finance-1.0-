using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class CollaborationModel
{
    public static void Configure(ModelBuilder b)
    {
        b.Entity<FinanceSpace>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<FinanceSpace>().Property(x => x.Description).HasMaxLength(1000);
        b.Entity<FinanceSpace>().HasOne<FinanceSpace>().WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SpaceMember>().HasIndex(x => new { x.SpaceId, x.LinkedUserId }).IsUnique().HasFilter("[LinkedUserId] IS NOT NULL");
        b.Entity<SpaceMember>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.LinkedUserId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SpaceMember>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<SpaceMember>().Property(x => x.Profile).HasMaxLength(1000);
        b.Entity<SpaceInvitation>().Property(x => x.Email).HasMaxLength(256);
        b.Entity<SpaceBudget>().HasIndex(x => new { x.SpaceId, x.Month, x.Currency }).IsUnique();
        b.Entity<SharedTransaction>().HasIndex(x => x.TransactionId).IsUnique();
        b.Entity<SharedTransaction>().HasOne<FinanceTransaction>().WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SharedTransaction>().HasOne<FinanceSpace>().WithMany().HasForeignKey(x => x.BookId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SharedTransaction>().HasOne<SpaceMember>().WithMany().HasForeignKey(x => x.ConsumerId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SharedTransaction>().HasOne<SpaceMember>().WithMany().HasForeignKey(x => x.PayerId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SpaceSettlement>().Property(x => x.Note).HasMaxLength(1000);
        b.Entity<SpaceSettlement>().HasOne<SpaceMember>().WithMany().HasForeignKey(x => x.FromMemberId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<SpaceSettlement>().HasOne<SpaceMember>().WithMany().HasForeignKey(x => x.ToMemberId).OnDelete(DeleteBehavior.NoAction);
        foreach (var type in new[] { typeof(SpaceMember), typeof(SpaceInvitation), typeof(SpaceBudget), typeof(SpaceSettlement) })
            b.Entity(type).HasOne(typeof(FinanceSpace)).WithMany().HasForeignKey("SpaceId").OnDelete(DeleteBehavior.NoAction);
    }
}
