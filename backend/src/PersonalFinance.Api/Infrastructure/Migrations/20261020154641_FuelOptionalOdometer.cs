using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelOptionalOdometer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.AlterColumn<decimal>(
                name: "Odometer",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "decimal(28,4)",
                oldPrecision: 28,
                oldScale: 4);

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true,
                filter: "[Odometer] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelRecord] WHERE [Odometer] IS NULL) THROW 50000, N'存在未填写里程的加油记录，不能回退为必填字段。请先明确处理这些记录。', 1;");
            migrationBuilder.DropIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord");

            migrationBuilder.AlterColumn<decimal>(
                name: "Odometer",
                schema: "finance",
                table: "FuelRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "decimal(28,4)",
                oldPrecision: 28,
                oldScale: 4,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FuelRecord_UserId_VehicleId_Odometer",
                schema: "finance",
                table: "FuelRecord",
                columns: new[] { "UserId", "VehicleId", "Odometer" },
                unique: true);
        }
    }
}
