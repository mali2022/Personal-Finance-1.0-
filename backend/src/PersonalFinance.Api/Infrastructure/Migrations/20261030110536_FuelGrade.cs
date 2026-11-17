using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelGrade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FuelGrade",
                schema: "finance",
                table: "FuelRecord",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unknown");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [FuelGrade] <> N'Unknown') THROW 51000, 'Fuel grade facts exist; use a verified recovery copy instead of destructive downgrade.', 1;");
            migrationBuilder.DropColumn(
                name: "FuelGrade",
                schema: "finance",
                table: "FuelRecord");
        }
    }
}
