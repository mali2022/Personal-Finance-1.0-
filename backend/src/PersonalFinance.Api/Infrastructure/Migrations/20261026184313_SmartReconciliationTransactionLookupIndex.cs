using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SmartReconciliationTransactionLookupIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_TransactionId_CreatedAt",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "TransactionId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_TransactionId_CreatedAt",
                schema: "finance",
                table: "StatementLink");
        }
    }
}
