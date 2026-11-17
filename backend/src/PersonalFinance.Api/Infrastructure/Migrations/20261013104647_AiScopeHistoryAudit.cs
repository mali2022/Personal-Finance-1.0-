using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiScopeHistoryAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ConfigurationVersion",
                schema: "finance",
                table: "AiUsageRecord",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestId",
                schema: "finance",
                table: "AiUsageRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AccountScopeJson",
                schema: "finance",
                table: "AiToolAudit",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "DurationMs",
                schema: "finance",
                table: "AiToolAudit",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ErrorCode",
                schema: "finance",
                table: "AiToolAudit",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestId",
                schema: "finance",
                table: "AiToolAudit",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SaveHistory",
                schema: "finance",
                table: "AiPrivacySetting",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "AiConfigurationSnapshot",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ConfigurationJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiConfigurationSnapshot", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AiConversation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    AccountScopeJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Archived = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiConversation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiConversation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiRequestAudit",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    LedgerId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountScopeJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConfigurationVersion = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ErrorCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiRequestAudit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiRequestAudit_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiMessage",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ConversationId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RequestId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Question = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    Answer = table.Column<string>(type: "nvarchar(max)", maxLength: 100000, nullable: false),
                    SourcesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Model = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FinancialDataVerified = table.Column<bool>(type: "bit", nullable: false),
                    Feedback = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiMessage", x => x.Id);
                    table.CheckConstraint("CK_AiMessage_Feedback", "[Feedback] BETWEEN -1 AND 1");
                    table.ForeignKey(
                        name: "FK_AiMessage_AiConversation_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "finance",
                        principalTable: "AiConversation",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AiMessage_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiConversation_ExpiresAt",
                schema: "finance",
                table: "AiConversation",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_AiConversation_UserId_Archived_UpdatedAt",
                schema: "finance",
                table: "AiConversation",
                columns: new[] { "UserId", "Archived", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiMessage_ConversationId",
                schema: "finance",
                table: "AiMessage",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_AiMessage_RequestId",
                schema: "finance",
                table: "AiMessage",
                column: "RequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiMessage_UserId_ConversationId_CreatedAt_Id",
                schema: "finance",
                table: "AiMessage",
                columns: new[] { "UserId", "ConversationId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_AiRequestAudit_UserId_StartedAt",
                schema: "finance",
                table: "AiRequestAudit",
                columns: new[] { "UserId", "StartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiConfigurationSnapshot",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiMessage",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiRequestAudit",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiConversation",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "ConfigurationVersion",
                schema: "finance",
                table: "AiUsageRecord");

            migrationBuilder.DropColumn(
                name: "RequestId",
                schema: "finance",
                table: "AiUsageRecord");

            migrationBuilder.DropColumn(
                name: "AccountScopeJson",
                schema: "finance",
                table: "AiToolAudit");

            migrationBuilder.DropColumn(
                name: "DurationMs",
                schema: "finance",
                table: "AiToolAudit");

            migrationBuilder.DropColumn(
                name: "ErrorCode",
                schema: "finance",
                table: "AiToolAudit");

            migrationBuilder.DropColumn(
                name: "RequestId",
                schema: "finance",
                table: "AiToolAudit");

            migrationBuilder.DropColumn(
                name: "SaveHistory",
                schema: "finance",
                table: "AiPrivacySetting");
        }
    }
}
