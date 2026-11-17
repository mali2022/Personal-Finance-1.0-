using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RefundOriginLookupIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_OriginalTransactionId_Status",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "OriginalTransactionId", "Status" },
                filter: "[OriginalTransactionId] IS NOT NULL")
                .Annotation("SqlServer:Include", new[] { "Type", "Amount", "Currency" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_OriginalTransactionId_Status",
                schema: "finance",
                table: "Transactions");
        }
    }
}
