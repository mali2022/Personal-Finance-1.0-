using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed class SpendingApprovalLease : IAsyncDisposable
{
    readonly SqlConnection connection; readonly string resource;
    SpendingApprovalLease(SqlConnection connection, string resource) { this.connection = connection; this.resource = resource; }
    public static async Task<SpendingApprovalLease> Acquire(string connectionString, string user, CancellationToken ct)
    {
        var connection = new SqlConnection(connectionString); var resource = "spending-approval-ai:" + user;
        try
        {
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText = "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Session',@LockTimeout=0; SELECT @r;";
            command.Parameters.AddWithValue("@resource", resource);
            var result = Convert.ToInt32(await command.ExecuteScalarAsync(ct));
            if (result < 0) throw new ApiException(409, "已有审批正在执行，请等待结果", "APPROVAL_IN_PROGRESS");
            return new(connection, resource);
        }
        catch { await connection.DisposeAsync(); throw; }
    }
    public async ValueTask DisposeAsync()
    {
        try { await using var command = connection.CreateCommand(); command.CommandText = "EXEC sys.sp_releaseapplock @Resource=@resource,@LockOwner='Session';"; command.Parameters.AddWithValue("@resource", resource); await command.ExecuteNonQueryAsync(); }
        finally { await connection.DisposeAsync(); }
    }
}
public sealed partial class FinanceService
{
    public Task<SpendingApprovalLease> AcquireApprovalLease(string user, CancellationToken ct) => SpendingApprovalLease.Acquire(db.Database.GetConnectionString()!, user, ct);
}
