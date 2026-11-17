using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImportFingerprintConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_ImportRows_UserId_Fingerprint",
                schema: "finance",
                table: "ImportRows",
                columns: new[] { "UserId", "Fingerprint" },
                unique: true,
                filter: "[Status] = 'Imported'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ImportRows_UserId_Fingerprint",
                schema: "finance",
                table: "ImportRows");
        }
    }
}
