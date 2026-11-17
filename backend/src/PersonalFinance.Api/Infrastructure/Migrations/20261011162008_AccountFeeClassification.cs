using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountFeeClassification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FeeNature",
                schema: "finance",
                table: "DebtPaymentAllocation",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Unclassified");

            migrationBuilder.AddCheckConstraint(
                name: "CK_DebtPayment_FeeNature",
                schema: "finance",
                table: "DebtPaymentAllocation",
                sql: "[FeeNature] IN ('Unclassified','Interest','ServiceFee') AND ([Component]='Fee' OR [FeeNature]='Unclassified')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_DebtPayment_FeeNature",
                schema: "finance",
                table: "DebtPaymentAllocation");

            migrationBuilder.DropColumn(
                name: "FeeNature",
                schema: "finance",
                table: "DebtPaymentAllocation");
        }
    }
}
