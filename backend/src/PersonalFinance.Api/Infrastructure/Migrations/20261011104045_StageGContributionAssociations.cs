using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGContributionAssociations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "LoanBusinessId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "PayrollComponentId");

            migrationBuilder.AddForeignKey(
                name: "FK_SocialContributionRecord_Businesses_LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "LoanBusinessId",
                principalSchema: "finance",
                principalTable: "Businesses",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SocialContributionRecord_PayrollComponent_PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "PayrollComponentId",
                principalSchema: "finance",
                principalTable: "PayrollComponent",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SocialContributionRecord_Businesses_LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropForeignKey(
                name: "FK_SocialContributionRecord_PayrollComponent_PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropIndex(
                name: "IX_SocialContributionRecord_LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropIndex(
                name: "IX_SocialContributionRecord_PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "LoanBusinessId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "PayrollComponentId",
                schema: "finance",
                table: "SocialContributionRecord");
        }
    }
}
