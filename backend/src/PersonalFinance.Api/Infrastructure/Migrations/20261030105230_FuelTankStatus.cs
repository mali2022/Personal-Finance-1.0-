using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelTankStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TankStatus",
                schema: "finance",
                table: "FuelRecord",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Unknown");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [TankStatus] <> N'Unknown') THROW 51000, 'Fuel tank facts exist; use a verified recovery copy instead of destructive downgrade.', 1;");
            migrationBuilder.DropColumn(
                name: "TankStatus",
                schema: "finance",
                table: "FuelRecord");
        }
    }
}
