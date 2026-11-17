using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AiPrivacySetting",
                schema: "finance",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    AllowSummary = table.Column<bool>(type: "bit", nullable: false),
                    AllowDetails = table.Column<bool>(type: "bit", nullable: false),
                    AllowPayroll = table.Column<bool>(type: "bit", nullable: false),
                    AllowFamily = table.Column<bool>(type: "bit", nullable: false),
                    AllowRecognitionText = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiPrivacySetting", x => x.UserId);
                });

            migrationBuilder.CreateTable(
                name: "AiToolAudit",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Tool = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Start = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    End = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Succeeded = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiToolAudit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AiUsageRecord",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Model = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RequestedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    InputTokens = table.Column<int>(type: "int", nullable: true),
                    CachedInputTokens = table.Column<int>(type: "int", nullable: true),
                    OutputTokens = table.Column<int>(type: "int", nullable: true),
                    EstimatedCost = table.Column<decimal>(type: "decimal(20,10)", precision: 20, scale: 10, nullable: true),
                    PriceCurrency = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PriceEffectiveDate = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ErrorCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Attempt = table.Column<int>(type: "int", nullable: false),
                    Feature = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiUsageRecord", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiToolAudit_UserId_CreatedAt",
                schema: "finance",
                table: "AiToolAudit",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiUsageRecord_UserId_RequestedAt",
                schema: "finance",
                table: "AiUsageRecord",
                columns: new[] { "UserId", "RequestedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiPrivacySetting",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiToolAudit",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiUsageRecord",
                schema: "finance");
        }
    }
}
