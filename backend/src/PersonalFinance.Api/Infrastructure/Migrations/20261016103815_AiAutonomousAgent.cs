using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiAutonomousAgent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Question",
                schema: "finance",
                table: "AiMessage",
                type: "nvarchar(max)",
                maxLength: 100000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(4000)",
                oldMaxLength: 4000);

            migrationBuilder.CreateTable(
                name: "AiAgentEvent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TaskId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    StepId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentEvent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentGrant",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Tool = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AccountIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MaxAffectedRecords = table.Column<int>(type: "int", nullable: false),
                    HighRisk = table.Column<bool>(type: "bit", nullable: false),
                    TaskId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    PlanHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentGrant", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentGrant_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentMemory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentMemory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentMemory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentReport",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SourcesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TaskId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Assumptions = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentReport", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentReport_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentSetting",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ConfigurationJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmergencyStopped = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentSetting", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentSetting_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentTask",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Prompt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConfigurationJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MessagesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SourcesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConversationId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    WorkflowId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Answer = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ErrorCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ToolCalls = table.Column<int>(type: "int", nullable: false),
                    ModelCalls = table.Column<int>(type: "int", nullable: false),
                    TokensUsed = table.Column<long>(type: "bigint", nullable: false),
                    RecoveryAttempts = table.Column<int>(type: "int", nullable: false),
                    ActiveMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    LeaseOwner = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    LeaseUntil = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelRequested = table.Column<bool>(type: "bit", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentTask", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentTask_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentWorkflow",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Prompt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IntervalMinutes = table.Column<int>(type: "int", nullable: true),
                    NextRunAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentWorkflow", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentWorkflow_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AiAgentStep",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TaskId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    CallId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Tool = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ArgumentsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreviewJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlanHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    HighRisk = table.Column<bool>(type: "bit", nullable: false),
                    ApprovedHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ResultJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ErrorCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiAgentStep", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiAgentStep_AiAgentTask_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "finance",
                        principalTable: "AiAgentTask",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AiAgentStep_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentEvent_UserId_CreatedAt",
                schema: "finance",
                table: "AiAgentEvent",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentGrant_UserId_Tool",
                schema: "finance",
                table: "AiAgentGrant",
                columns: new[] { "UserId", "Tool" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentMemory_UserId_Enabled",
                schema: "finance",
                table: "AiAgentMemory",
                columns: new[] { "UserId", "Enabled" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentReport_UserId_CreatedAt",
                schema: "finance",
                table: "AiAgentReport",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentSetting_UserId",
                schema: "finance",
                table: "AiAgentSetting",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentStep_TaskId_CallId",
                schema: "finance",
                table: "AiAgentStep",
                columns: new[] { "TaskId", "CallId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentStep_TaskId_Sequence",
                schema: "finance",
                table: "AiAgentStep",
                columns: new[] { "TaskId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentStep_UserId",
                schema: "finance",
                table: "AiAgentStep",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentTask_State_LeaseUntil_CreatedAt",
                schema: "finance",
                table: "AiAgentTask",
                columns: new[] { "State", "LeaseUntil", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentTask_UserId_CreatedAt",
                schema: "finance",
                table: "AiAgentTask",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentWorkflow_Enabled_NextRunAt",
                schema: "finance",
                table: "AiAgentWorkflow",
                columns: new[] { "Enabled", "NextRunAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiAgentWorkflow_UserId",
                schema: "finance",
                table: "AiAgentWorkflow",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiAgentEvent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentGrant",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentMemory",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentReport",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentSetting",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentStep",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentWorkflow",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AiAgentTask",
                schema: "finance");

            migrationBuilder.AlterColumn<string>(
                name: "Question",
                schema: "finance",
                table: "AiMessage",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldMaxLength: 100000);
        }
    }
}
