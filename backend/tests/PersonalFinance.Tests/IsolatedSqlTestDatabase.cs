using Microsoft.Data.SqlClient;
using System.Text.RegularExpressions;

// Both Windows local runs and Linux CI must explicitly name a disposable database.
internal static class IsolatedSqlTestDatabase
{
    public static string ConnectionString()
    {
        var database = Environment.GetEnvironmentVariable("PF_DELETION_TEST_DATABASE") ?? "";
        if (!Regex.IsMatch(database, "^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$"))
            throw new InvalidOperationException("Only isolated RestoreCheck databases are allowed");
        var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PF_TEST_SQL_CONNECTION_STRING")
            ?? $"Server=.;Database={database};Trusted_Connection=True;TrustServerCertificate=True");
        if (!string.Equals(connection.InitialCatalog, database, StringComparison.Ordinal))
            throw new InvalidOperationException("SQL connection must target the explicitly selected isolated database");
        // Heavy fixtures seed hundreds of thousands of rows and roll them back in teardown; the 30s default aborts that on slower machines and CI runners.
        connection.CommandTimeout = 600;
        return connection.ConnectionString;
    }
}
