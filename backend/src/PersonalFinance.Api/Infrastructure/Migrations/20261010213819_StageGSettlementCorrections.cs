using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGSettlementCorrections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentSettlement_ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement",
                column: "ReversalOfId",
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FundHoldEvent_ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent",
                column: "ReversalOfId",
                unique: true,
                filter: "[ReversalOfId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_FundHoldEvent_FundHoldEvent_ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent",
                column: "ReversalOfId",
                principalSchema: "finance",
                principalTable: "FundHoldEvent",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PrepaymentSettlement_PrepaymentSettlement_ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement",
                column: "ReversalOfId",
                principalSchema: "finance",
                principalTable: "PrepaymentSettlement",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FundHoldEvent_FundHoldEvent_ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent");

            migrationBuilder.DropForeignKey(
                name: "FK_PrepaymentSettlement_PrepaymentSettlement_ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement");

            migrationBuilder.DropIndex(
                name: "IX_PrepaymentSettlement_ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement");

            migrationBuilder.DropIndex(
                name: "IX_FundHoldEvent_ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent");

            migrationBuilder.DropColumn(
                name: "ReversalOfId",
                schema: "finance",
                table: "PrepaymentSettlement");

            migrationBuilder.DropColumn(
                name: "ReversalOfId",
                schema: "finance",
                table: "FundHoldEvent");
        }
    }
}
