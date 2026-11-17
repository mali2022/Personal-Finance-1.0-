using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StatementAllocationRelations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_AccountId_TransactionId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_StatementRecordId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_AccountId_TransactionId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "AccountId", "TransactionId" },
                filter: "[State] = N'Confirmed'");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_StatementRecordId_TransactionId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "StatementRecordId", "TransactionId" },
                unique: true,
                filter: "[State] = N'Confirmed'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_AccountId_TransactionId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_StatementRecordId_TransactionId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_AccountId_TransactionId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "AccountId", "TransactionId" },
                unique: true,
                filter: "[State] = N'Confirmed'");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_StatementRecordId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "StatementRecordId" },
                unique: true,
                filter: "[State] = N'Confirmed'");
        }
    }
}
