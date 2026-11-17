using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlanningEnvelopeUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BudgetCarryover_UserId_SourceMonth_TargetMonth_CategoryId",
                schema: "finance",
                table: "BudgetCarryover");

            migrationBuilder.DropIndex(
                name: "IX_AnnualBudgetAllocation_AnnualBudgetId_Month_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetCarryover_UserId_SourceMonth_TargetMonth_CategoryId",
                schema: "finance",
                table: "BudgetCarryover",
                columns: new[] { "UserId", "SourceMonth", "TargetMonth", "CategoryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnnualBudgetAllocation_AnnualBudgetId_Month_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation",
                columns: new[] { "AnnualBudgetId", "Month", "CategoryId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BudgetCarryover_UserId_SourceMonth_TargetMonth_CategoryId",
                schema: "finance",
                table: "BudgetCarryover");

            migrationBuilder.DropIndex(
                name: "IX_AnnualBudgetAllocation_AnnualBudgetId_Month_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetCarryover_UserId_SourceMonth_TargetMonth_CategoryId",
                schema: "finance",
                table: "BudgetCarryover",
                columns: new[] { "UserId", "SourceMonth", "TargetMonth", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualBudgetAllocation_AnnualBudgetId_Month_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation",
                columns: new[] { "AnnualBudgetId", "Month", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");
        }
    }
}
