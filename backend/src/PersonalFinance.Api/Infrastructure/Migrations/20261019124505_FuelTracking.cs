using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FuelVehicle",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Plate = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    FuelType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FuelVehicle", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FuelVehicle_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "FuelRecord",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    VehicleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Odometer = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Litres = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    FullTank = table.Column<bool>(type: "bit", nullable: false),
                    MissedFill = table.Column<bool>(type: "bit", nullable: false),
                    Station = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FuelRecord", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FuelRecord_FuelVehicle_VehicleId",
                        column: x => x.VehicleId,
                        principalSchema: "finance",
                        principalTable: "FuelVehicle",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FuelRecord_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_VehicleId",
                schema: "finance",
                table: "FuelRecord",
                column: "VehicleId");

            migrationBuilder.CreateIndex(
                name: "IX_FuelVehicle_UserId",
                schema: "finance",
                table: "FuelVehicle",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FuelRecord",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "FuelVehicle",
                schema: "finance");
        }
    }
}
