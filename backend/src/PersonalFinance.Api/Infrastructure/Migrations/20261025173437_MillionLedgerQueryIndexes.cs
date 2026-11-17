using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MillionLedgerQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_OccurredAt_CreatedAt_Id",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "OccurredAt", "CreatedAt", "Id" })
                .Annotation("SqlServer:Include", new[] { "Status", "Type", "Currency", "AccountId", "ToAccountId", "Amount" });

            migrationBuilder.CreateIndex(
                name: "IX_Entries_UserId_Kind_AccountId_TransactionId",
                schema: "finance",
                table: "Entries",
                columns: new[] { "UserId", "Kind", "AccountId", "TransactionId" })
                .Annotation("SqlServer:Include", new[] { "Amount", "BaseAmount", "CategoryId", "Currency" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_OccurredAt_CreatedAt_Id",
                schema: "finance",
                table: "Transactions");

            migrationBuilder.DropIndex(
                name: "IX_Entries_UserId_Kind_AccountId_TransactionId",
                schema: "finance",
                table: "Entries");
        }
    }
}
