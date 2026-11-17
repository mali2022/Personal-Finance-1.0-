using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelReceiptFacts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Discount",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DrivingScene",
                schema: "finance",
                table: "FuelRecord",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OriginalAmount",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentMethod",
                schema: "finance",
                table: "FuelRecord",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PointsRedemption",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PostedUnitPrice",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [PostedUnitPrice] IS NOT NULL OR [OriginalAmount] IS NOT NULL OR [Discount] IS NOT NULL OR [PointsRedemption] IS NOT NULL OR [PaymentMethod] IS NOT NULL OR [DrivingScene] IS NOT NULL) THROW 51000, 'Fuel receipt facts exist; use a verified recovery copy instead of destructive downgrade.', 1;");
            migrationBuilder.DropColumn(
                name: "Discount",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "DrivingScene",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "OriginalAmount",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "PaymentMethod",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "PointsRedemption",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "PostedUnitPrice",
                schema: "finance",
                table: "FuelRecord");
        }
    }
}
