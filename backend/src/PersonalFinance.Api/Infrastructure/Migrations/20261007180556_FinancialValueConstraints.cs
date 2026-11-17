using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinancialValueConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_Transaction_Amounts",
                schema: "finance",
                table: "Transactions",
                sql: "[Amount] > 0 AND [Fee] >= 0 AND [Version] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Entry_Values",
                schema: "finance",
                table: "Entries",
                sql: "[Amount] <> 0 AND [BaseAmount] <> 0 AND [ExchangeRate] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Business_Principal",
                schema: "finance",
                table: "Businesses",
                sql: "[Principal] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Budget_Total",
                schema: "finance",
                table: "Budgets",
                sql: "[Total] >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_BudgetLine_Limit",
                schema: "finance",
                table: "BudgetLine",
                sql: "[Limit] >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Account_Credit",
                schema: "finance",
                table: "Accounts",
                sql: "([CreditLimit] IS NULL OR [CreditLimit] >= 0) AND ([StatementDay] IS NULL OR [StatementDay] BETWEEN 1 AND 31) AND ([PaymentDay] IS NULL OR [PaymentDay] BETWEEN 1 AND 31)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Transaction_Amounts",
                schema: "finance",
                table: "Transactions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Entry_Values",
                schema: "finance",
                table: "Entries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Business_Principal",
                schema: "finance",
                table: "Businesses");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Budget_Total",
                schema: "finance",
                table: "Budgets");

            migrationBuilder.DropCheckConstraint(
                name: "CK_BudgetLine_Limit",
                schema: "finance",
                table: "BudgetLine");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Account_Credit",
                schema: "finance",
                table: "Accounts");
        }
    }
}
