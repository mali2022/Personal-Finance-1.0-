using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SmartReconciliationProvenanceAndTaskHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Total",
                schema: "finance",
                table: "StatementTask",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CounterpartyHint",
                schema: "finance",
                table: "StatementRecord",
                type: "nvarchar(4)",
                maxLength: 4,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CounterpartyKey",
                schema: "finance",
                table: "StatementRecord",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PaymentSource",
                schema: "finance",
                table: "StatementRecord",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PostedAt",
                schema: "finance",
                table: "StatementRecord",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceFactsHash",
                schema: "finance",
                table: "StatementRecord",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "EngineScore",
                schema: "finance",
                table: "StatementLink",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RevokedAt",
                schema: "finance",
                table: "StatementLink",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RuleId",
                schema: "finance",
                table: "StatementLink",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "RuleVersion",
                schema: "finance",
                table: "StatementLink",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StatementTaskStep",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    StatementTaskId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    Processed = table.Column<int>(type: "int", nullable: false),
                    Failed = table.Column<int>(type: "int", nullable: false),
                    EngineVersion = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResultsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatementTaskStep", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatementTaskStep_StatementTask_StatementTaskId",
                        column: x => x.StatementTaskId,
                        principalSchema: "finance",
                        principalTable: "StatementTask",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementTaskStep_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_UserId_ExternalId",
                schema: "finance",
                table: "Transactions",
                columns: new[] { "UserId", "ExternalId" },
                filter: "[ExternalId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_RuleId",
                schema: "finance",
                table: "StatementLink",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_RuleId_CreatedAt",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "RuleId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StatementTaskStep_StatementTaskId",
                schema: "finance",
                table: "StatementTaskStep",
                column: "StatementTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementTaskStep_UserId_StatementTaskId_Sequence",
                schema: "finance",
                table: "StatementTaskStep",
                columns: new[] { "UserId", "StatementTaskId", "Sequence" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_StatementLink_StatementRule_RuleId",
                schema: "finance",
                table: "StatementLink",
                column: "RuleId",
                principalSchema: "finance",
                principalTable: "StatementRule",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StatementLink_StatementRule_RuleId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropTable(
                name: "StatementTaskStep",
                schema: "finance");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_UserId_ExternalId",
                schema: "finance",
                table: "Transactions");

            migrationBuilder.DropIndex(
                name: "IX_StatementLink_RuleId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropIndex(
                name: "IX_StatementLink_UserId_RuleId_CreatedAt",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropColumn(
                name: "Total",
                schema: "finance",
                table: "StatementTask");

            migrationBuilder.DropColumn(
                name: "CounterpartyHint",
                schema: "finance",
                table: "StatementRecord");

            migrationBuilder.DropColumn(
                name: "CounterpartyKey",
                schema: "finance",
                table: "StatementRecord");

            migrationBuilder.DropColumn(
                name: "PaymentSource",
                schema: "finance",
                table: "StatementRecord");

            migrationBuilder.DropColumn(
                name: "PostedAt",
                schema: "finance",
                table: "StatementRecord");

            migrationBuilder.DropColumn(
                name: "SourceFactsHash",
                schema: "finance",
                table: "StatementRecord");

            migrationBuilder.DropColumn(
                name: "EngineScore",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropColumn(
                name: "RevokedAt",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropColumn(
                name: "RuleId",
                schema: "finance",
                table: "StatementLink");

            migrationBuilder.DropColumn(
                name: "RuleVersion",
                schema: "finance",
                table: "StatementLink");
        }
    }
}
