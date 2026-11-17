using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LedgerEntryCoveringIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Entries_TransactionId",
                schema: "finance",
                table: "Entries");

            migrationBuilder.CreateIndex(
                name: "IX_Entries_TransactionId",
                schema: "finance",
                table: "Entries",
                column: "TransactionId")
                .Annotation("SqlServer:Include", new[] { "UserId", "Kind", "AccountId", "CategoryId", "Amount", "BaseAmount", "Currency" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Entries_TransactionId",
                schema: "finance",
                table: "Entries");

            migrationBuilder.CreateIndex(
                name: "IX_Entries_TransactionId",
                schema: "finance",
                table: "Entries",
                column: "TransactionId");
        }
    }
}
