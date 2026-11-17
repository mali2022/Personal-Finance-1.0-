using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGAdvanceGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ThirdPartyAdvance_UserId",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.AddColumn<string>(
                name: "GroupId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_UserId_GroupId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                columns: new[] { "UserId", "GroupId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ThirdPartyAdvance_UserId_GroupId",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.DropColumn(
                name: "GroupId",
                schema: "finance",
                table: "ThirdPartyAdvance");

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_UserId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                column: "UserId");
        }
    }
}
