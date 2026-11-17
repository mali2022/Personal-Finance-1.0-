using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGProvenanceAndRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Beneficiary",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Consumer",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Merchant",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Payer",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Platform",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContractReference",
                schema: "finance",
                table: "PrepaymentContract",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Counterparty",
                schema: "finance",
                table: "PrepaymentContract",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPriceObservation_SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation",
                column: "SourceTransactionId");

            migrationBuilder.AddForeignKey(
                name: "FK_ProductPriceObservation_Transactions_SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation",
                column: "SourceTransactionId",
                principalSchema: "finance",
                principalTable: "Transactions",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProductPriceObservation_Transactions_SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropIndex(
                name: "IX_ProductPriceObservation_SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "Beneficiary",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "Consumer",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "Merchant",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "Payer",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "Platform",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "SourceTransactionId",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "ContractReference",
                schema: "finance",
                table: "PrepaymentContract");

            migrationBuilder.DropColumn(
                name: "Counterparty",
                schema: "finance",
                table: "PrepaymentContract");
        }
    }
}
