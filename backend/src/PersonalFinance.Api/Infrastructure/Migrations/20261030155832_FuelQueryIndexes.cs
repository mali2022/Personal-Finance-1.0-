using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_Date",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "Date" },
                filter: "[DeletedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Date",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Date" },
                filter: "[DeletedAt] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_Date",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Date",
                schema: "finance",
                table: "FuelRecord");
        }
    }
}
