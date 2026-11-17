using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SmartReconciliationHistoryIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_StatementRecordId_CreatedAt",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "StatementRecordId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_StatementRecordId_CreatedAt",
                schema: "finance",
                table: "StatementLink");
        }
    }
}
