using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelRecordTrash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "finance",
                table: "FuelRecord",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true,
                filter: "[Odometer] IS NOT NULL AND [DeletedAt] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [DeletedAt] IS NOT NULL) THROW 51000, N'Restore trashed fuel records before reverting this migration; use the backup recovery process if conflicts exist.', 1;");
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true,
                filter: "[Odometer] IS NOT NULL");
        }
    }
}
