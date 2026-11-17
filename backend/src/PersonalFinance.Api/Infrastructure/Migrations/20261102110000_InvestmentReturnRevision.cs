using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace PersonalFinance.Api.Infrastructure.Migrations;

// Infrastructure-only token, intentionally excluded from tracked user/profile data and API serialization.
[DbContext(typeof(FinanceDb))]
[Migration("20261102110000_InvestmentReturnRevision")]
public sealed class InvestmentReturnRevision : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "InvestmentReturnRevision", schema: "finance", table: "Users", type: "uniqueidentifier", nullable: false, defaultValue: Guid.Empty);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "InvestmentReturnRevision", schema: "finance", table: "Users");
    }
}
