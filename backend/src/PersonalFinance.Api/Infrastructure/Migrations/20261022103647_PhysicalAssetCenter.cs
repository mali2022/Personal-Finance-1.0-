using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PhysicalAssetCenter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PhysicalCategory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ParentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Sort = table.Column<int>(type: "int", nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    Tags = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DefaultMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DefaultLifeMonths = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalCategory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalCategory_PhysicalCategory_ParentId",
                        column: x => x.ParentId,
                        principalSchema: "finance",
                        principalTable: "PhysicalCategory",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalCategory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PhysicalCostLink",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reversed = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalCostLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalCostLink_ManagedAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "ManagedAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalCostLink_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalCostLink_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PhysicalEvent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ReversesId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalEvent_ManagedAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "ManagedAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalEvent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PhysicalValueRule",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Method = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LifeMonths = table.Column<int>(type: "int", nullable: false),
                    Residual = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    AnnualRate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    MarketValue = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    NetRealizableValue = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    ReplacementCost = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalValueRule", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalValueRule_ManagedAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "ManagedAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalValueRule_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PhysicalProfile",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Code = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Brand = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Model = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SerialNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Merchant = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaymentAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    PhotoUrl = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ReceiptUrl = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Location = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Holder = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tags = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InServiceDate = table.Column<DateOnly>(type: "date", nullable: true),
                    WarrantyUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    MaintenanceDays = table.Column<int>(type: "int", nullable: false),
                    InventoryDays = table.Column<int>(type: "int", nullable: false),
                    StaleDays = table.Column<int>(type: "int", nullable: false),
                    IdleDays = table.Column<int>(type: "int", nullable: false),
                    InitialState = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalProfile", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalProfile_Accounts_PaymentAccountId",
                        column: x => x.PaymentAccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalProfile_ManagedAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "ManagedAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalProfile_PhysicalCategory_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "PhysicalCategory",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PhysicalProfile_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalCategory_ParentId",
                schema: "finance",
                table: "PhysicalCategory",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalCategory_UserId_ParentId_Sort",
                schema: "finance",
                table: "PhysicalCategory",
                columns: new[] { "UserId", "ParentId", "Sort" });

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalCostLink_AssetId",
                schema: "finance",
                table: "PhysicalCostLink",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalCostLink_TransactionId",
                schema: "finance",
                table: "PhysicalCostLink",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalCostLink_UserId_TransactionId",
                schema: "finance",
                table: "PhysicalCostLink",
                columns: new[] { "UserId", "TransactionId" },
                unique: true,
                filter: "[Reversed] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalEvent_AssetId",
                schema: "finance",
                table: "PhysicalEvent",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalEvent_UserId_AssetId_Date_CreatedAt",
                schema: "finance",
                table: "PhysicalEvent",
                columns: new[] { "UserId", "AssetId", "Date", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalProfile_AssetId",
                schema: "finance",
                table: "PhysicalProfile",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalProfile_CategoryId",
                schema: "finance",
                table: "PhysicalProfile",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalProfile_PaymentAccountId",
                schema: "finance",
                table: "PhysicalProfile",
                column: "PaymentAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalProfile_UserId_AssetId",
                schema: "finance",
                table: "PhysicalProfile",
                columns: new[] { "UserId", "AssetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalValueRule_AssetId",
                schema: "finance",
                table: "PhysicalValueRule",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalValueRule_UserId_AssetId_Date_CreatedAt",
                schema: "finance",
                table: "PhysicalValueRule",
                columns: new[] { "UserId", "AssetId", "Date", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PhysicalCostLink",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PhysicalEvent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PhysicalProfile",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PhysicalValueRule",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PhysicalCategory",
                schema: "finance");
        }
    }
}
