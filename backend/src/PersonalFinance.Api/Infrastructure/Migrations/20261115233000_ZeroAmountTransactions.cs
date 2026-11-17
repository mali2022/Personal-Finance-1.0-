using Microsoft.EntityFrameworkCore.Migrations;

namespace PersonalFinance.Api.Infrastructure.Migrations;

// Zero-amount Expense, Income and Transfer stay legal; every other transaction type keeps the positive-amount rule.
public sealed partial class ZeroAmountTransactions : Migration
{
    const string Allowed = "([Amount] > 0 OR [Type] IN (N'Expense', N'Income', N'Transfer')) AND [Fee] >= 0 AND [Version] > 0";
    const string Previous = "[Amount] > 0 AND [Fee] >= 0 AND [Version] > 0";

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_Transaction_Amounts", schema: "finance", table: "Transactions");
        migrationBuilder.AddCheckConstraint(name: "CK_Transaction_Amounts", schema: "finance", table: "Transactions", sql: Allowed);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_Transaction_Amounts", schema: "finance", table: "Transactions");
        migrationBuilder.AddCheckConstraint(name: "CK_Transaction_Amounts", schema: "finance", table: "Transactions", sql: Previous);
    }
}
