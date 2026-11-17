using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private const string PayrollContributionSource = "PayrollDeduction";
    private const string DeletedPayrollContributionSource = "PayrollDeductionDeleted";

    private async Task SyncPayrollContributions(string user, PayrollStatement slip, PayrollComponent[] components)
    {
        var records = await db.Set<SocialContributionRecord>().Where(x => x.UserId == user && x.PayrollId == slip.Id).ToListAsync();
        var employment = slip.EmploymentId == null ? null : await PayOwned<PayrollEmployment>(user, slip.EmploymentId);
        foreach (var kind in new[] { "Pension", "Medical", "Unemployment" })
        {
            // A manually reviewed/entered linked record or a deletion marker owns this source.
            if (records.Any(x => x.Kind == kind && x.SourceEvidence != PayrollContributionSource)) continue;
            var record = records.SingleOrDefault(x => x.Kind == kind && x.SourceEvidence == PayrollContributionSource);
            var amount = slip.State is "Cancelled" or "Voided" ? 0 : components
                .Where(x => x.Kind == "Deduction" && x.Category == kind && x.Status == "Active").Sum(x => x.Amount);
            if (amount <= 0) { if (record != null) db.Remove(record); continue; }
            var region = employment?.InsuranceCity ?? "";
            if (record != null && record.Month == slip.Month && record.PaidDate == slip.PayDate &&
                record.EmploymentId == slip.EmploymentId && record.Currency == slip.Currency &&
                record.PersonalAmount == amount && record.Region == region) continue;
            if (record == null)
            {
                // A stable primary key also prevents duplicate rows under concurrent sync requests.
                record = new SocialContributionRecord { UserId = user, PayrollId = slip.Id, Kind = kind,
                    Id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{user}:{slip.Id}:{kind}"))[..16]).ToString(),
                    SourceEvidence = PayrollContributionSource, State = "Pending",
                    Note = "来自工资条个人社保扣款，待核对实际缴费；单位缴费及基数未提供。" };
                db.Add(record);
            }
            else record.Version++;
            record.Month = slip.Month; record.PaidDate = slip.PayDate; record.EmploymentId = slip.EmploymentId;
            record.Currency = slip.Currency; record.Region = region; record.PersonalAmount = amount;
            record.UpdatedAt = DateTimeOffset.UtcNow;
        }
    }

    public async Task<object> PayrollContributionSync(string user)
    {
        var slips = await db.Set<PayrollStatement>().Where(x => x.UserId == user).ToArrayAsync();
        var components = await db.Set<PayrollComponent>().Where(x => x.UserId == user).ToArrayAsync();
        var bySlip = components.ToLookup(x => x.PayrollId);
        foreach (var slip in slips) await SyncPayrollContributions(user, slip, bySlip[slip.Id].ToArray());
        return new { synced = true, cashImpact = "0.00" };
    }

    public async Task<object> PayrollContributionDelete(string user, string id, string? version)
    {
        var record = await PayOwned<SocialContributionRecord>(user, id);
        Require(record.SourceEvidence != DeletedPayrollContributionSource, "缴费记录已删除");
        Version(record, version);
        if (record.PayrollId == null) db.Remove(record);
        else
        {
            // Retain a hidden source exclusion so the next sync does not recreate this row.
            record.SourceEvidence = DeletedPayrollContributionSource; record.State = "Cancelled";
            record.PayrollComponentId = null; record.Version++; record.UpdatedAt = DateTimeOffset.UtcNow;
        }
        return new { id, deleted = true, cashImpact = "0.00" };
    }
}
