using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SharedFinanceCenters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FinanceSpace",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Archived = table.Column<bool>(type: "bit", nullable: false),
                    FamilyId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinanceSpace", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FinanceSpace_FinanceSpace_FamilyId",
                        column: x => x.FamilyId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FinanceSpace_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SpaceBudget",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpaceBudget", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpaceBudget_FinanceSpace_SpaceId",
                        column: x => x.SpaceId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceBudget_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SpaceInvitation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpaceInvitation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpaceInvitation_FinanceSpace_SpaceId",
                        column: x => x.SpaceId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceInvitation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SpaceMember",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    LinkedUserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Profile = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpaceMember", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpaceMember_FinanceSpace_SpaceId",
                        column: x => x.SpaceId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceMember_Users_LinkedUserId",
                        column: x => x.LinkedUserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceMember_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SharedTransaction",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BookId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ConsumerId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    PayerId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Rule = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SharesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SharedTransaction", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SharedTransaction_FinanceSpace_BookId",
                        column: x => x.BookId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SharedTransaction_SpaceMember_ConsumerId",
                        column: x => x.ConsumerId,
                        principalSchema: "finance",
                        principalTable: "SpaceMember",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SharedTransaction_SpaceMember_PayerId",
                        column: x => x.PayerId,
                        principalSchema: "finance",
                        principalTable: "SpaceMember",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SharedTransaction_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SharedTransaction_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SpaceSettlement",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    FromMemberId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ToMemberId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Revoked = table.Column<bool>(type: "bit", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpaceSettlement", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpaceSettlement_FinanceSpace_SpaceId",
                        column: x => x.SpaceId,
                        principalSchema: "finance",
                        principalTable: "FinanceSpace",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceSettlement_SpaceMember_FromMemberId",
                        column: x => x.FromMemberId,
                        principalSchema: "finance",
                        principalTable: "SpaceMember",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceSettlement_SpaceMember_ToMemberId",
                        column: x => x.ToMemberId,
                        principalSchema: "finance",
                        principalTable: "SpaceMember",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpaceSettlement_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_FinanceSpace_FamilyId",
                schema: "finance",
                table: "FinanceSpace",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_FinanceSpace_UserId",
                schema: "finance",
                table: "FinanceSpace",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedTransaction_BookId",
                schema: "finance",
                table: "SharedTransaction",
                column: "BookId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedTransaction_ConsumerId",
                schema: "finance",
                table: "SharedTransaction",
                column: "ConsumerId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedTransaction_PayerId",
                schema: "finance",
                table: "SharedTransaction",
                column: "PayerId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedTransaction_TransactionId",
                schema: "finance",
                table: "SharedTransaction",
                column: "TransactionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SharedTransaction_UserId",
                schema: "finance",
                table: "SharedTransaction",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceBudget_SpaceId_Month_Currency",
                schema: "finance",
                table: "SpaceBudget",
                columns: new[] { "SpaceId", "Month", "Currency" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SpaceBudget_UserId",
                schema: "finance",
                table: "SpaceBudget",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceInvitation_SpaceId",
                schema: "finance",
                table: "SpaceInvitation",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceInvitation_UserId",
                schema: "finance",
                table: "SpaceInvitation",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceMember_LinkedUserId",
                schema: "finance",
                table: "SpaceMember",
                column: "LinkedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceMember_SpaceId_LinkedUserId",
                schema: "finance",
                table: "SpaceMember",
                columns: new[] { "SpaceId", "LinkedUserId" },
                unique: true,
                filter: "[LinkedUserId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceMember_UserId",
                schema: "finance",
                table: "SpaceMember",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceSettlement_FromMemberId",
                schema: "finance",
                table: "SpaceSettlement",
                column: "FromMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceSettlement_SpaceId",
                schema: "finance",
                table: "SpaceSettlement",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceSettlement_ToMemberId",
                schema: "finance",
                table: "SpaceSettlement",
                column: "ToMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_SpaceSettlement_UserId",
                schema: "finance",
                table: "SpaceSettlement",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SharedTransaction",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SpaceBudget",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SpaceInvitation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SpaceSettlement",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SpaceMember",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "FinanceSpace",
                schema: "finance");
        }
    }
}
