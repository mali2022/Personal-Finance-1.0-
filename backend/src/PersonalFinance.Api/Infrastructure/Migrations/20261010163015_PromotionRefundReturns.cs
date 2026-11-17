using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PromotionRefundReturns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PromotionUsage_RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage",
                column: "RefundTransactionId");

            migrationBuilder.AddForeignKey(
                name: "FK_PromotionUsage_Transactions_RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage",
                column: "RefundTransactionId",
                principalSchema: "finance",
                principalTable: "Transactions",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PromotionUsage_Transactions_RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage");

            migrationBuilder.DropIndex(
                name: "IX_PromotionUsage_RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage");

            migrationBuilder.DropColumn(
                name: "RefundTransactionId",
                schema: "finance",
                table: "PromotionUsage");
        }
    }
}
