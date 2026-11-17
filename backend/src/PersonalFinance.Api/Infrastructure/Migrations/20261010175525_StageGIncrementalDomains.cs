using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGIncrementalDomains : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccountFundHold",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    ReleasedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    SettledAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    IncludedInBookBalance = table.Column<bool>(type: "bit", nullable: false),
                    ReducesAvailable = table.Column<bool>(type: "bit", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountFundHold", x => x.Id);
                    table.CheckConstraint("CK_AccountFundHold", "[Amount]>0 AND [ReleasedAmount]>=0 AND [SettledAmount]>=0 AND [ReleasedAmount]+[SettledAmount]<=[Amount] AND [Version]>0 AND [State] IN ('Draft','Confirmed','Released','Settled','Expired','Revoked') AND [Type] IN ('AuthorizationHold','AccountRestriction','PendingDebit','PendingCredit','SettlementPending')");
                    table.ForeignKey(
                        name: "FK_AccountFundHold_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AccountFundHold_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CurrencyPreference",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CurrencyPreference", x => x.Id);
                    table.CheckConstraint("CK_CurrencyPreference", "[Currency] IN ('CNY','USD','HKD') AND [Version]>0 AND [SortOrder] BETWEEN 0 AND 1000");
                    table.ForeignKey(
                        name: "FK_CurrencyPreference_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "LivingCostBasket",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    BaseDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PriceKind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LivingCostBasket", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LivingCostBasket_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PaymentInstrument",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Authorizer = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Consumer = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    MonthlyLimit = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: false),
                    EndsOn = table.Column<DateOnly>(type: "date", nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentInstrument", x => x.Id);
                    table.CheckConstraint("CK_PaymentInstrument", "[Version]>0 AND ([MonthlyLimit] IS NULL OR [MonthlyLimit]>0) AND ([EndsOn] IS NULL OR [EndsOn]>=[StartsOn]) AND [State] IN ('Active','Paused','Revoked')");
                    table.ForeignKey(
                        name: "FK_PaymentInstrument_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PaymentInstrument_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollStatement",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    PayDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Employer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollStatement", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollStatement_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PrepaymentContract",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    FundingTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    AccountingMode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    ConsumedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    RefundedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    WrittenOffAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    ExpiresOn = table.Column<DateOnly>(type: "date", nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrepaymentContract", x => x.Id);
                    table.CheckConstraint("CK_PrepaymentContract", "[Amount]>0 AND [ConsumedAmount]>=0 AND [RefundedAmount]>=0 AND [WrittenOffAmount]>=0 AND [ConsumedAmount]+[RefundedAmount]+[WrittenOffAmount]<=[Amount] AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_PrepaymentContract_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrepaymentContract_Accounts_AssetAccountId",
                        column: x => x.AssetAccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrepaymentContract_Transactions_FundingTransactionId",
                        column: x => x.FundingTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrepaymentContract_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ProductPriceObservation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Product = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Specification = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    PriceKind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Excluded = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPriceObservation", x => x.Id);
                    table.CheckConstraint("CK_ProductPrice", "[Amount]>0 AND [Quantity]>0 AND [PriceKind] IN ('Paid','Listed')");
                    table.ForeignKey(
                        name: "FK_ProductPriceObservation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ThirdPartyAdvance",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Counterparty = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BusinessId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    OwnTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    OwnAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DeliveryState = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DeliveredOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Recipient = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ThirdPartyAdvance", x => x.Id);
                    table.CheckConstraint("CK_ThirdPartyAdvance", "[Amount]>0 AND [OwnAmount]>=0 AND [OwnAmount]<=[Amount] AND [Quantity]>0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_ThirdPartyAdvance_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ThirdPartyAdvance_Businesses_BusinessId",
                        column: x => x.BusinessId,
                        principalSchema: "finance",
                        principalTable: "Businesses",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ThirdPartyAdvance_Transactions_OwnTransactionId",
                        column: x => x.OwnTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ThirdPartyAdvance_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "FundHoldEvent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    HoldId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FundHoldEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FundHoldEvent_AccountFundHold_HoldId",
                        column: x => x.HoldId,
                        principalSchema: "finance",
                        principalTable: "AccountFundHold",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FundHoldEvent_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FundHoldEvent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "LivingCostBasketItem",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BasketId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Product = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Specification = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LivingCostBasketItem", x => x.Id);
                    table.CheckConstraint("CK_BasketQuantity", "[Quantity]>0");
                    table.ForeignKey(
                        name: "FK_LivingCostBasketItem_LivingCostBasket_BasketId",
                        column: x => x.BasketId,
                        principalSchema: "finance",
                        principalTable: "LivingCostBasket",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_LivingCostBasketItem_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AuthorizedPayment",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    InstrumentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Consumer = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Authorizer = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuthorizedPayment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuthorizedPayment_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AuthorizedPayment_PaymentInstrument_InstrumentId",
                        column: x => x.InstrumentId,
                        principalSchema: "finance",
                        principalTable: "PaymentInstrument",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AuthorizedPayment_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AuthorizedPayment_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollComponent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PayrollId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollComponent", x => x.Id);
                    table.CheckConstraint("CK_PayrollComponent", "[Kind] IN ('Earning','Deduction','Adjustment') AND ([Kind]='Adjustment' OR [Amount]>=0)");
                    table.ForeignKey(
                        name: "FK_PayrollComponent_PayrollStatement_PayrollId",
                        column: x => x.PayrollId,
                        principalSchema: "finance",
                        principalTable: "PayrollStatement",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollComponent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollPayment",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PayrollId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollPayment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollPayment_PayrollStatement_PayrollId",
                        column: x => x.PayrollId,
                        principalSchema: "finance",
                        principalTable: "PayrollStatement",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollPayment_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollPayment_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SocialContributionRecord",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    PaidDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Region = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Basis = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    PersonalAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    EmployerAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Supplementary = table.Column<bool>(type: "bit", nullable: false),
                    PayrollId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    ReportedBalance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    BalanceSource = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialContributionRecord", x => x.Id);
                    table.CheckConstraint("CK_SocialContribution", "[Basis]>=0 AND [PersonalAmount]>=0 AND [EmployerAmount]>=0 AND ([ReportedBalance] IS NULL OR [ReportedBalance]>=0) AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_SocialContributionRecord_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SocialContributionRecord_PayrollStatement_PayrollId",
                        column: x => x.PayrollId,
                        principalSchema: "finance",
                        principalTable: "PayrollStatement",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SocialContributionRecord_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PrepaymentSettlement",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ContractId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrepaymentSettlement", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrepaymentSettlement_PrepaymentContract_ContractId",
                        column: x => x.ContractId,
                        principalSchema: "finance",
                        principalTable: "PrepaymentContract",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrepaymentSettlement_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrepaymentSettlement_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountFundHold_AccountId",
                schema: "finance",
                table: "AccountFundHold",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_AccountFundHold_UserId_AccountId_State",
                schema: "finance",
                table: "AccountFundHold",
                columns: new[] { "UserId", "AccountId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_AuthorizedPayment_AccountId",
                schema: "finance",
                table: "AuthorizedPayment",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_AuthorizedPayment_InstrumentId",
                schema: "finance",
                table: "AuthorizedPayment",
                column: "InstrumentId");

            migrationBuilder.CreateIndex(
                name: "IX_AuthorizedPayment_TransactionId",
                schema: "finance",
                table: "AuthorizedPayment",
                column: "TransactionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuthorizedPayment_UserId_InstrumentId",
                schema: "finance",
                table: "AuthorizedPayment",
                columns: new[] { "UserId", "InstrumentId" });

            migrationBuilder.CreateIndex(
                name: "IX_CurrencyPreference_UserId_Currency",
                schema: "finance",
                table: "CurrencyPreference",
                columns: new[] { "UserId", "Currency" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundHoldEvent_HoldId",
                schema: "finance",
                table: "FundHoldEvent",
                column: "HoldId");

            migrationBuilder.CreateIndex(
                name: "IX_FundHoldEvent_TransactionId",
                schema: "finance",
                table: "FundHoldEvent",
                column: "TransactionId",
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FundHoldEvent_UserId_HoldId_CreatedAt",
                schema: "finance",
                table: "FundHoldEvent",
                columns: new[] { "UserId", "HoldId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LivingCostBasket_UserId",
                schema: "finance",
                table: "LivingCostBasket",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_LivingCostBasketItem_BasketId",
                schema: "finance",
                table: "LivingCostBasketItem",
                column: "BasketId");

            migrationBuilder.CreateIndex(
                name: "IX_LivingCostBasketItem_UserId",
                schema: "finance",
                table: "LivingCostBasketItem",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstrument_AccountId",
                schema: "finance",
                table: "PaymentInstrument",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentInstrument_UserId",
                schema: "finance",
                table: "PaymentInstrument",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollComponent_PayrollId",
                schema: "finance",
                table: "PayrollComponent",
                column: "PayrollId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollComponent_UserId",
                schema: "finance",
                table: "PayrollComponent",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollPayment_PayrollId",
                schema: "finance",
                table: "PayrollPayment",
                column: "PayrollId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollPayment_TransactionId",
                schema: "finance",
                table: "PayrollPayment",
                column: "TransactionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollPayment_UserId",
                schema: "finance",
                table: "PayrollPayment",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_UserId_Month",
                schema: "finance",
                table: "PayrollStatement",
                columns: new[] { "UserId", "Month" });

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentContract_AccountId",
                schema: "finance",
                table: "PrepaymentContract",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentContract_AssetAccountId",
                schema: "finance",
                table: "PrepaymentContract",
                column: "AssetAccountId",
                unique: true,
                filter: "[AssetAccountId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentContract_FundingTransactionId",
                schema: "finance",
                table: "PrepaymentContract",
                column: "FundingTransactionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentContract_UserId",
                schema: "finance",
                table: "PrepaymentContract",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentSettlement_ContractId",
                schema: "finance",
                table: "PrepaymentSettlement",
                column: "ContractId");

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentSettlement_TransactionId",
                schema: "finance",
                table: "PrepaymentSettlement",
                column: "TransactionId",
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PrepaymentSettlement_UserId",
                schema: "finance",
                table: "PrepaymentSettlement",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPriceObservation_UserId_Currency_Date",
                schema: "finance",
                table: "ProductPriceObservation",
                columns: new[] { "UserId", "Currency", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_AccountId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_PayrollId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "PayrollId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_UserId_Month_Kind",
                schema: "finance",
                table: "SocialContributionRecord",
                columns: new[] { "UserId", "Month", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_AccountId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_BusinessId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                column: "BusinessId",
                unique: true,
                filter: "[BusinessId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_OwnTransactionId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                column: "OwnTransactionId",
                unique: true,
                filter: "[OwnTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ThirdPartyAdvance_UserId",
                schema: "finance",
                table: "ThirdPartyAdvance",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuthorizedPayment",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "CurrencyPreference",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "FundHoldEvent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "LivingCostBasketItem",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollComponent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollPayment",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PrepaymentSettlement",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "ProductPriceObservation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SocialContributionRecord",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "ThirdPartyAdvance",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PaymentInstrument",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AccountFundHold",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "LivingCostBasket",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PrepaymentContract",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollStatement",
                schema: "finance");
        }
    }
}
