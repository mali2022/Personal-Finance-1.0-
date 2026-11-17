using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelEventChronology : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.AddColumn<TimeOnly>(
                name: "OccurredTime",
                schema: "finance",
                table: "FuelRecord",
                type: "time",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "OdometerReset",
                schema: "finance",
                table: "FuelRecord",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                filter: "[Odometer] IS NOT NULL AND [DeletedAt] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [OdometerReset]=1 OR [OccurredTime] IS NOT NULL) THROW 51000, 'Cannot downgrade recorded fuel chronology; preserve a recovery copy first.', 1;");
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "OccurredTime",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "OdometerReset",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true,
                filter: "[Odometer] IS NOT NULL AND [DeletedAt] IS NULL");
        }
    }
}
