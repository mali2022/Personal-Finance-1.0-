using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PayrollSocialBenefitsCenter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EmployerRate",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "decimal(28,8)",
                precision: 28,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExpectedEmployer",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExpectedPersonal",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "PersonalRate",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "decimal(28,8)",
                precision: 28,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PolicyId",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceEvidence",
                schema: "finance",
                table: "SocialContributionRecord",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AccountId",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CorrectionReason",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmploymentId",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImportJobId",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImportRowKey",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlanId",
                schema: "finance",
                table: "PayrollStatement",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                schema: "finance",
                table: "PayrollComponent",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Code",
                schema: "finance",
                table: "PayrollComponent",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "HousingBasis",
                schema: "finance",
                table: "PayrollComponent",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "InsuranceBasis",
                schema: "finance",
                table: "PayrollComponent",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Quantity",
                schema: "finance",
                table: "PayrollComponent",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                schema: "finance",
                table: "PayrollComponent",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "finance",
                table: "PayrollComponent",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TaxTreatment",
                schema: "finance",
                table: "PayrollComponent",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "UnitRate",
                schema: "finance",
                table: "PayrollComponent",
                type: "decimal(28,8)",
                precision: 28,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PayrollId",
                schema: "finance",
                table: "Documents",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PayrollEmployer",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    City = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollEmployer", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollEmployer_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollImportJob",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DocumentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    HeadersJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RowsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreviewJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MappingJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Fingerprint = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Imported = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollImportJob", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollImportJob_Documents_DocumentId",
                        column: x => x.DocumentId,
                        principalSchema: "finance",
                        principalTable: "Documents",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollImportJob_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollRevision",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PayrollId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PayrollVersion = table.Column<long>(type: "bigint", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollRevision", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollRevision_PayrollStatement_PayrollId",
                        column: x => x.PayrollId,
                        principalSchema: "finance",
                        principalTable: "PayrollStatement",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollRevision_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollTaxRule",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PolicyVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Verified = table.Column<bool>(type: "bit", nullable: false),
                    RulesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollTaxRule", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollTaxRule_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SocialInsurancePolicy",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Region = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: false),
                    PolicyVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Verified = table.Column<bool>(type: "bit", nullable: false),
                    RatesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialInsurancePolicy", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SocialInsurancePolicy_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollEmployment",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    EmployerId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Workplace = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Position = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Department = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmployeeNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PayCycle = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PayDay = table.Column<int>(type: "int", nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    InsuranceCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    HousingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollEmployment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollEmployment_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollEmployment_PayrollEmployer_EmployerId",
                        column: x => x.EmployerId,
                        principalSchema: "finance",
                        principalTable: "PayrollEmployer",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollEmployment_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CompensationPlan",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    EmploymentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SeriesId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    PayBasis = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: true),
                    ItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompensationPlan", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompensationPlan_PayrollEmployment_EmploymentId",
                        column: x => x.EmploymentId,
                        principalSchema: "finance",
                        principalTable: "PayrollEmployment",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CompensationPlan_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "HousingFundAccount",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmploymentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    City = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    LoanBusinessId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    ReportedBalance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    BalanceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    BalanceSource = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Evidence = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HousingFundAccount", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HousingFundAccount_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_HousingFundAccount_Businesses_LoanBusinessId",
                        column: x => x.LoanBusinessId,
                        principalSchema: "finance",
                        principalTable: "Businesses",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_HousingFundAccount_PayrollEmployment_EmploymentId",
                        column: x => x.EmploymentId,
                        principalSchema: "finance",
                        principalTable: "PayrollEmployment",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_HousingFundAccount_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollTaxCalculation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    EmploymentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InputsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ResultsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollTaxCalculation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollTaxCalculation_PayrollEmployment_EmploymentId",
                        column: x => x.EmploymentId,
                        principalSchema: "finance",
                        principalTable: "PayrollEmployment",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollTaxCalculation_PayrollTaxRule_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "PayrollTaxRule",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollTaxCalculation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PayrollTaxDeclaration",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    EmploymentId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    StartMonth = table.Column<int>(type: "int", nullable: false),
                    EndMonth = table.Column<int>(type: "int", nullable: false),
                    ClaimedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    ApprovedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    EligibilityJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Evidence = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayrollTaxDeclaration", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PayrollTaxDeclaration_PayrollEmployment_EmploymentId",
                        column: x => x.EmploymentId,
                        principalSchema: "finance",
                        principalTable: "PayrollEmployment",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollTaxDeclaration_PayrollTaxRule_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "PayrollTaxRule",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PayrollTaxDeclaration_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "HousingFundEvent",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    FundAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Evidence = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HousingFundEvent", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HousingFundEvent_HousingFundAccount_FundAccountId",
                        column: x => x.FundAccountId,
                        principalSchema: "finance",
                        principalTable: "HousingFundAccount",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_HousingFundEvent_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_HousingFundEvent_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "FundAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_SocialContributionRecord_PolicyId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "PolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_AccountId",
                schema: "finance",
                table: "PayrollStatement",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_EmploymentId",
                schema: "finance",
                table: "PayrollStatement",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_ImportJobId",
                schema: "finance",
                table: "PayrollStatement",
                column: "ImportJobId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_PlanId",
                schema: "finance",
                table: "PayrollStatement",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollStatement_UserId_ImportRowKey",
                schema: "finance",
                table: "PayrollStatement",
                columns: new[] { "UserId", "ImportRowKey" },
                unique: true,
                filter: "[ImportRowKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_PayrollId",
                schema: "finance",
                table: "Documents",
                column: "PayrollId");

            migrationBuilder.CreateIndex(
                name: "IX_CompensationPlan_EmploymentId",
                schema: "finance",
                table: "CompensationPlan",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_CompensationPlan_UserId_EmploymentId_EffectiveFrom",
                schema: "finance",
                table: "CompensationPlan",
                columns: new[] { "UserId", "EmploymentId", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_CompensationPlan_UserId_SeriesId_Revision",
                schema: "finance",
                table: "CompensationPlan",
                columns: new[] { "UserId", "SeriesId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundAccount_AccountId",
                schema: "finance",
                table: "HousingFundAccount",
                column: "AccountId",
                unique: true,
                filter: "[AccountId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundAccount_EmploymentId",
                schema: "finance",
                table: "HousingFundAccount",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundAccount_LoanBusinessId",
                schema: "finance",
                table: "HousingFundAccount",
                column: "LoanBusinessId");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundAccount_UserId",
                schema: "finance",
                table: "HousingFundAccount",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundEvent_FundAccountId",
                schema: "finance",
                table: "HousingFundEvent",
                column: "FundAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundEvent_TransactionId",
                schema: "finance",
                table: "HousingFundEvent",
                column: "TransactionId",
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_HousingFundEvent_UserId",
                schema: "finance",
                table: "HousingFundEvent",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollEmployer_UserId_Name",
                schema: "finance",
                table: "PayrollEmployer",
                columns: new[] { "UserId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_PayrollEmployment_AccountId",
                schema: "finance",
                table: "PayrollEmployment",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollEmployment_EmployerId",
                schema: "finance",
                table: "PayrollEmployment",
                column: "EmployerId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollEmployment_UserId",
                schema: "finance",
                table: "PayrollEmployment",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollImportJob_DocumentId",
                schema: "finance",
                table: "PayrollImportJob",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollImportJob_UserId",
                schema: "finance",
                table: "PayrollImportJob",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollRevision_PayrollId",
                schema: "finance",
                table: "PayrollRevision",
                column: "PayrollId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollRevision_UserId_PayrollId_PayrollVersion",
                schema: "finance",
                table: "PayrollRevision",
                columns: new[] { "UserId", "PayrollId", "PayrollVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxCalculation_EmploymentId",
                schema: "finance",
                table: "PayrollTaxCalculation",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxCalculation_RuleId",
                schema: "finance",
                table: "PayrollTaxCalculation",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxCalculation_UserId",
                schema: "finance",
                table: "PayrollTaxCalculation",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxDeclaration_EmploymentId",
                schema: "finance",
                table: "PayrollTaxDeclaration",
                column: "EmploymentId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxDeclaration_RuleId",
                schema: "finance",
                table: "PayrollTaxDeclaration",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxDeclaration_UserId",
                schema: "finance",
                table: "PayrollTaxDeclaration",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PayrollTaxRule_UserId_PolicyVersion",
                schema: "finance",
                table: "PayrollTaxRule",
                columns: new[] { "UserId", "PolicyVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SocialInsurancePolicy_UserId_Region_Year_PolicyVersion",
                schema: "finance",
                table: "SocialInsurancePolicy",
                columns: new[] { "UserId", "Region", "Year", "PolicyVersion" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Documents_PayrollStatement_PayrollId",
                schema: "finance",
                table: "Documents",
                column: "PayrollId",
                principalSchema: "finance",
                principalTable: "PayrollStatement",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PayrollStatement_Accounts_AccountId",
                schema: "finance",
                table: "PayrollStatement",
                column: "AccountId",
                principalSchema: "finance",
                principalTable: "Accounts",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PayrollStatement_CompensationPlan_PlanId",
                schema: "finance",
                table: "PayrollStatement",
                column: "PlanId",
                principalSchema: "finance",
                principalTable: "CompensationPlan",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PayrollStatement_PayrollEmployment_EmploymentId",
                schema: "finance",
                table: "PayrollStatement",
                column: "EmploymentId",
                principalSchema: "finance",
                principalTable: "PayrollEmployment",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PayrollStatement_PayrollImportJob_ImportJobId",
                schema: "finance",
                table: "PayrollStatement",
                column: "ImportJobId",
                principalSchema: "finance",
                principalTable: "PayrollImportJob",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SocialContributionRecord_HousingFundAccount_FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "FundAccountId",
                principalSchema: "finance",
                principalTable: "HousingFundAccount",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SocialContributionRecord_PayrollEmployment_EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "EmploymentId",
                principalSchema: "finance",
                principalTable: "PayrollEmployment",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_SocialContributionRecord_SocialInsurancePolicy_PolicyId",
                schema: "finance",
                table: "SocialContributionRecord",
                column: "PolicyId",
                principalSchema: "finance",
                principalTable: "SocialInsurancePolicy",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Documents_PayrollStatement_PayrollId",
                schema: "finance",
                table: "Documents");

            migrationBuilder.DropForeignKey(
                name: "FK_PayrollStatement_Accounts_AccountId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropForeignKey(
                name: "FK_PayrollStatement_CompensationPlan_PlanId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropForeignKey(
                name: "FK_PayrollStatement_PayrollEmployment_EmploymentId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropForeignKey(
                name: "FK_PayrollStatement_PayrollImportJob_ImportJobId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropForeignKey(
                name: "FK_SocialContributionRecord_HousingFundAccount_FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropForeignKey(
                name: "FK_SocialContributionRecord_PayrollEmployment_EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropForeignKey(
                name: "FK_SocialContributionRecord_SocialInsurancePolicy_PolicyId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropTable(
                name: "CompensationPlan",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "HousingFundEvent",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollImportJob",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollRevision",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollTaxCalculation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollTaxDeclaration",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SocialInsurancePolicy",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "HousingFundAccount",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollTaxRule",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollEmployment",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PayrollEmployer",
                schema: "finance");

            migrationBuilder.DropIndex(
                name: "IX_SocialContributionRecord_EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropIndex(
                name: "IX_SocialContributionRecord_FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropIndex(
                name: "IX_SocialContributionRecord_PolicyId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropIndex(
                name: "IX_PayrollStatement_AccountId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropIndex(
                name: "IX_PayrollStatement_EmploymentId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropIndex(
                name: "IX_PayrollStatement_ImportJobId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropIndex(
                name: "IX_PayrollStatement_PlanId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropIndex(
                name: "IX_PayrollStatement_UserId_ImportRowKey",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropIndex(
                name: "IX_Documents_PayrollId",
                schema: "finance",
                table: "Documents");

            migrationBuilder.DropColumn(
                name: "EmployerRate",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "EmploymentId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "ExpectedEmployer",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "ExpectedPersonal",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "FundAccountId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "PersonalRate",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "PolicyId",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "SourceEvidence",
                schema: "finance",
                table: "SocialContributionRecord");

            migrationBuilder.DropColumn(
                name: "AccountId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "CorrectionReason",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "EmploymentId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "ImportJobId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "ImportRowKey",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "PlanId",
                schema: "finance",
                table: "PayrollStatement");

            migrationBuilder.DropColumn(
                name: "Category",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "Code",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "HousingBasis",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "InsuranceBasis",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "Quantity",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "TaxTreatment",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "UnitRate",
                schema: "finance",
                table: "PayrollComponent");

            migrationBuilder.DropColumn(
                name: "PayrollId",
                schema: "finance",
                table: "Documents");
        }
    }
}
