using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImportExecutionRecovery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ImportAttempts",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ImportJobId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    OperationKey = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    TraceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Total = table.Column<int>(type: "int", nullable: false),
                    Imported = table.Column<int>(type: "int", nullable: false),
                    Skipped = table.Column<int>(type: "int", nullable: false),
                    OutcomesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportAttempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportAttempts_Imports_ImportJobId",
                        column: x => x.ImportJobId,
                        principalSchema: "finance",
                        principalTable: "Imports",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ImportAttempts_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportAttempts_ImportJobId",
                schema: "finance",
                table: "ImportAttempts",
                column: "ImportJobId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportAttempts_UserId_ImportJobId_CreatedAt",
                schema: "finance",
                table: "ImportAttempts",
                columns: new[] { "UserId", "ImportJobId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportAttempts",
                schema: "finance");
        }
    }
}
