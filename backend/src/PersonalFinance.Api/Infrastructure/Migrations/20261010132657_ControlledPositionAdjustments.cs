using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ControlledPositionAdjustments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_InvestmentTrade",
                schema: "finance",
                table: "InvestmentTrade");

            migrationBuilder.AddCheckConstraint(
                name: "CK_InvestmentTrade",
                schema: "finance",
                table: "InvestmentTrade",
                sql: "[Quantity]>=0 AND [Price]>=0 AND [Amount]>=0 AND [Commission]>=0 AND [Tax]>=0 AND [OtherFee]>=0 AND [SettlementDate]>=[Date] AND [State] IN ('Active','Revoked') AND [Type] IN ('Buy','Sell','Dividend','Interest','Fee','PositionIncrease','PositionDecrease') AND [Version]>0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS(SELECT 1 FROM finance.InvestmentTrade WHERE Type IN ('PositionIncrease','PositionDecrease')) THROW 51000,'Position adjustment history prevents rollback; restore a verified backup instead.',1;");
            migrationBuilder.DropCheckConstraint(
                name: "CK_InvestmentTrade",
                schema: "finance",
                table: "InvestmentTrade");

            migrationBuilder.AddCheckConstraint(
                name: "CK_InvestmentTrade",
                schema: "finance",
                table: "InvestmentTrade",
                sql: "[Quantity]>=0 AND [Price]>=0 AND [Amount]>0 AND [Commission]>=0 AND [Tax]>=0 AND [OtherFee]>=0 AND [SettlementDate]>=[Date] AND [State] IN ('Active','Revoked') AND [Type] IN ('Buy','Sell','Dividend','Interest','Fee') AND [Version]>0");
        }
    }
}

