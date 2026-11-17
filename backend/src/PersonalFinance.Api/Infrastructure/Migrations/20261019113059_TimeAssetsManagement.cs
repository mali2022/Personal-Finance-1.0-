using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TimeAssetsManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TimeActivity",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ProjectId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SegmentsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ActiveSince = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeActivity", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeActivity_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TimeBudget",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Period = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Minutes = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeBudget", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeBudget_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TimeFinanceLink",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ActivityId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    ProjectId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeFinanceLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeFinanceLink_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TimeFinanceLink_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TimeProject",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Goal = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BudgetMinutes = table.Column<int>(type: "int", nullable: false),
                    ReturnUnit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TargetReturn = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    ActualReturn = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeProject", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeProject_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TimeTemplate",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Minutes = table.Column<int>(type: "int", nullable: false),
                    ProjectId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Repeat = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeTemplate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeTemplate_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TimeValuation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Method = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    Income = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Hours = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    HourlyRate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimeValuation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimeValuation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TimeActivity_UserId",
                schema: "finance",
                table: "TimeActivity",
                column: "UserId",
                unique: true,
                filter: "[State] = 'Running'");

            migrationBuilder.CreateIndex(
                name: "IX_TimeBudget_UserId",
                schema: "finance",
                table: "TimeBudget",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeBudget_UserId_Period_StartDate_Category",
                schema: "finance",
                table: "TimeBudget",
                columns: new[] { "UserId", "Period", "StartDate", "Category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TimeFinanceLink_TransactionId",
                schema: "finance",
                table: "TimeFinanceLink",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeFinanceLink_UserId",
                schema: "finance",
                table: "TimeFinanceLink",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeFinanceLink_UserId_TransactionId_ActivityId_ProjectId",
                schema: "finance",
                table: "TimeFinanceLink",
                columns: new[] { "UserId", "TransactionId", "ActivityId", "ProjectId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TimeProject_UserId",
                schema: "finance",
                table: "TimeProject",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeTemplate_UserId",
                schema: "finance",
                table: "TimeTemplate",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeValuation_UserId",
                schema: "finance",
                table: "TimeValuation",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TimeValuation_UserId_Revision",
                schema: "finance",
                table: "TimeValuation",
                columns: new[] { "UserId", "Revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TimeActivity",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "TimeBudget",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "TimeFinanceLink",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "TimeProject",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "TimeTemplate",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "TimeValuation",
                schema: "finance");
        }
    }
}
