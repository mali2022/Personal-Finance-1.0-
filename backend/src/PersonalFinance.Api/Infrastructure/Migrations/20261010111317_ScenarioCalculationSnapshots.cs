using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ScenarioCalculationSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ChangesJson",
                schema: "finance",
                table: "CashFlowScenario",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ScenarioCalculation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ScenarioId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    InputJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResultJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SourceHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScenarioCalculation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScenarioCalculation_CashFlowScenario_ScenarioId",
                        column: x => x.ScenarioId,
                        principalSchema: "finance",
                        principalTable: "CashFlowScenario",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ScenarioCalculation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ScenarioCalculation_ScenarioId",
                schema: "finance",
                table: "ScenarioCalculation",
                column: "ScenarioId");

            migrationBuilder.CreateIndex(
                name: "IX_ScenarioCalculation_UserId_ScenarioId_CreatedAt",
                schema: "finance",
                table: "ScenarioCalculation",
                columns: new[] { "UserId", "ScenarioId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ScenarioCalculation",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "ChangesJson",
                schema: "finance",
                table: "CashFlowScenario");
        }
    }
}
