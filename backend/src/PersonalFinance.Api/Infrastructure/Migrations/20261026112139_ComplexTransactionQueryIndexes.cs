using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ComplexTransactionQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_Amount_CreatedAt_Id",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "Amount", "CreatedAt", "Id" },
                descending: new[] { false, true, true, true })
                .Annotation("SqlServer:Include", new[] { "Status", "Type", "Currency", "OccurredAt", "AccountId", "ToAccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_ToAccountId_OccurredAt_CreatedAt_Id",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "ToAccountId", "OccurredAt", "CreatedAt", "Id" },
                filter: "[ToAccountId] IS NOT NULL")
                .Annotation("SqlServer:Include", new[] { "Status", "Type", "Currency", "Amount", "AccountId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_Amount_CreatedAt_Id",
                schema: "finance",
                table: "Transactions");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_ToAccountId_OccurredAt_CreatedAt_Id",
                schema: "finance",
                table: "Transactions");
        }
    }
}
