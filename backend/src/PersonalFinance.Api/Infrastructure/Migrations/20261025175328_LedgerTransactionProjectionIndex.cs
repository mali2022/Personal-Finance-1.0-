using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LedgerTransactionProjectionIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_Id",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "Id" })
                .Annotation("SqlServer:Include", new[] { "Status", "Type", "Currency", "OccurredAt", "CreatedAt", "Amount", "AccountId", "ToAccountId", "CategoryId", "FeeCategoryId", "ProjectId", "OriginalTransactionId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_Id",
                schema: "finance",
                table: "Transactions");
        }
    }
}
