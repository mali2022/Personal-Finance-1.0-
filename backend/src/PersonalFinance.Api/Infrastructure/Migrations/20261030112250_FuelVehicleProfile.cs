using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FuelVehicleProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AnnualDistance",
                schema: "finance",
                table: "FuelVehicle",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Brand",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CurrentOdometer",
                schema: "finance",
                table: "FuelVehicle",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnergyType",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unknown");

            migrationBuilder.AddColumn<string>(
                name: "Engine",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "InitialOdometer",
                schema: "finance",
                table: "FuelVehicle",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Model",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ModelYear",
                schema: "finance",
                table: "FuelVehicle",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Note",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PurchaseAmount",
                schema: "finance",
                table: "FuelVehicle",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PurchaseCurrency",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PurchaseDate",
                schema: "finance",
                table: "FuelVehicle",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "finance",
                table: "FuelVehicle",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.AddColumn<decimal>(
                name: "TankCapacity",
                schema: "finance",
                table: "FuelVehicle",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [finance].[FuelVehicle] WHERE [Brand] IS NOT NULL OR [Model] IS NOT NULL OR [ModelYear] IS NOT NULL OR [EnergyType] <> N'Unknown' OR [TankCapacity] IS NOT NULL OR [Engine] IS NOT NULL OR [PurchaseDate] IS NOT NULL OR [PurchaseAmount] IS NOT NULL OR [PurchaseCurrency] IS NOT NULL OR [InitialOdometer] IS NOT NULL OR [CurrentOdometer] IS NOT NULL OR [AnnualDistance] IS NOT NULL OR [Status] <> N'Active' OR [Note] IS NOT NULL) THROW 51000, 'Vehicle profile facts exist; use a verified recovery copy instead of destructive downgrade.', 1;");
            migrationBuilder.DropColumn(
                name: "AnnualDistance",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "Brand",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "CurrentOdometer",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "EnergyType",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "Engine",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "InitialOdometer",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "Model",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "ModelYear",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "Note",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "PurchaseAmount",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "PurchaseCurrency",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "PurchaseDate",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "finance",
                table: "FuelVehicle");

            migrationBuilder.DropColumn(
                name: "TankCapacity",
                schema: "finance",
                table: "FuelVehicle");
        }
    }
}
