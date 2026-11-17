using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelQuantityPrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EnteredUnitPrice",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QuantitySource",
                schema: "finance",
                table: "FuelRecord",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Manual");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EnteredUnitPrice",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "QuantitySource",
                schema: "finance",
                table: "FuelRecord");
        }
    }
}
