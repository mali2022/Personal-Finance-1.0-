using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImportCleaningAndMerchantMaster412 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "HeaderRow",
                schema: "finance",
                table: "Imports",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SourceEncoding",
                schema: "finance",
                table: "Imports",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SourceHash",
                schema: "finance",
                table: "Imports",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ImportCleaningEvent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ImportJobId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RowId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    RowIndex = table.Column<int>(type: "int", nullable: false),
                    JobVersion = table.Column<long>(type: "bigint", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RuleVersion = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BeforeJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AfterJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportCleaningEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportCleaningEvent_Imports_ImportJobId",
                        column: x => x.ImportJobId,
                        principalSchema: "finance",
                        principalTable: "Imports",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ImportCleaningEvent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ImportRecognitionSuggestion",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ImportJobId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RowId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RowHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    RequestId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    MerchantId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Confidence = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportRecognitionSuggestion", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportRecognitionSuggestion_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "MerchantAlias",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    MerchantId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MatchKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantAlias", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantAlias_Directory_MerchantId",
                        column: x => x.MerchantId,
                        principalSchema: "finance",
                        principalTable: "Directory",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_MerchantAlias_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportCleaningEvent_ImportJobId",
                schema: "finance",
                table: "ImportCleaningEvent",
                column: "ImportJobId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportCleaningEvent_UserId_ImportJobId_CreatedAt",
                schema: "finance",
                table: "ImportCleaningEvent",
                columns: new[] { "UserId", "ImportJobId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportRecognitionSuggestion_UserId_ImportJobId_State",
                schema: "finance",
                table: "ImportRecognitionSuggestion",
                columns: new[] { "UserId", "ImportJobId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantAlias_MerchantId",
                schema: "finance",
                table: "MerchantAlias",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantAlias_UserId_MatchKey",
                schema: "finance",
                table: "MerchantAlias",
                columns: new[] { "UserId", "MatchKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportCleaningEvent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "ImportRecognitionSuggestion",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "MerchantAlias",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "HeaderRow",
                schema: "finance",
                table: "Imports");

            migrationBuilder.DropColumn(
                name: "SourceEncoding",
                schema: "finance",
                table: "Imports");

            migrationBuilder.DropColumn(
                name: "SourceHash",
                schema: "finance",
                table: "Imports");
        }
    }
}
