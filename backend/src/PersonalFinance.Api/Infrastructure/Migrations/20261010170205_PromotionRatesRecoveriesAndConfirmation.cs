using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;

namespace PersonalFinance.Api.Infrastructure.Migrations;

[DbContext(typeof(FinanceDb))]
[Migration("20261010170205_PromotionRatesRecoveriesAndConfirmation")]
public class PromotionRatesRecoveriesAndConfirmation : Migration
{
	protected override void Up(MigrationBuilder migrationBuilder)
	{
		int? maxLength = 36;
		migrationBuilder.AddColumn<string>("SubsidyTransactionId", "PromotionTransferDraft", "nvarchar(36)", null, maxLength, rowVersion: false, "finance", nullable: true);
		maxLength = 36;
		migrationBuilder.AddColumn<string>("TransferTransactionId", "PromotionTransferDraft", "nvarchar(36)", null, maxLength, rowVersion: false, "finance", nullable: true);
		migrationBuilder.AddColumn<DateTimeOffset>("ClaimedAt", "PromotionBenefit", "datetimeoffset", null, null, rowVersion: false, "finance", nullable: true);
		maxLength = 28;
		int? scale = 8;
		migrationBuilder.AddColumn<decimal>("DiscountRate", "PromotionBenefit", "decimal(28,8)", null, null, rowVersion: false, "finance", nullable: true, null, null, null, null, null, null, maxLength, scale);
		scale = 28;
		maxLength = 4;
		migrationBuilder.AddColumn<decimal>("MaximumDiscount", "PromotionBenefit", "decimal(28,4)", null, null, rowVersion: false, "finance", nullable: true, null, null, null, null, null, null, scale, maxLength);
		migrationBuilder.AddColumn<string>("PaymentMethod", "PromotionBenefit", "nvarchar(max)", null, null, rowVersion: false, "finance", nullable: true);
		maxLength = 28;
		scale = 4;
		migrationBuilder.AddColumn<decimal>("RecoveredAmount", "CashbackReceivable", "decimal(28,4)", null, null, rowVersion: false, "finance", nullable: false, 0m, null, null, null, null, null, maxLength, scale);
		migrationBuilder.CreateTable("CashbackRecovery", (ColumnsBuilder table) =>
		{
			int? maxLength2 = 36;
			OperationBuilder<AddColumnOperation> id = table.Column<string>("nvarchar(36)", null, maxLength2);
			maxLength2 = 36;
			OperationBuilder<AddColumnOperation> cashbackId = table.Column<string>("nvarchar(36)", null, maxLength2);
			maxLength2 = 36;
			OperationBuilder<AddColumnOperation> transactionId = table.Column<string>("nvarchar(36)", null, maxLength2);
			maxLength2 = 28;
			int? scale2 = 4;
			OperationBuilder<AddColumnOperation> amount = table.Column<decimal>("decimal(28,4)", null, null, rowVersion: false, null, nullable: false, null, null, null, null, null, null, maxLength2, scale2);
			OperationBuilder<AddColumnOperation> reason = table.Column<string>("nvarchar(max)");
			scale2 = 40;
			OperationBuilder<AddColumnOperation> state = table.Column<string>("nvarchar(40)", null, scale2);
			scale2 = 36;
			return new
			{
				Id = id,
				CashbackId = cashbackId,
				TransactionId = transactionId,
				Amount = amount,
				Reason = reason,
				State = state,
				UserId = table.Column<string>("nvarchar(36)", null, scale2),
				Version = table.Column<long>("bigint")
			};
		}, "finance", table =>
		{
			table.PrimaryKey("PK_CashbackRecovery", x => x.Id);
			table.CheckConstraint("CK_CashbackRecovery", "[Amount]>0");
			table.ForeignKey("FK_CashbackRecovery_CashbackReceivable_CashbackId", x => x.CashbackId, "CashbackReceivable", "Id", "finance");
			table.ForeignKey("FK_CashbackRecovery_Transactions_TransactionId", x => x.TransactionId, "Transactions", "Id", "finance");
			table.ForeignKey("FK_CashbackRecovery_Users_UserId", x => x.UserId, "Users", "Id", "finance");
		});
		migrationBuilder.CreateIndex("IX_PromotionTransferDraft_SubsidyTransactionId", "PromotionTransferDraft", "SubsidyTransactionId", "finance");
		migrationBuilder.CreateIndex("IX_PromotionTransferDraft_TransferTransactionId", "PromotionTransferDraft", "TransferTransactionId", "finance");
		migrationBuilder.AddCheckConstraint("CK_PromotionDiscountRate", "PromotionBenefit", "([DiscountRate] IS NULL OR [DiscountRate]>0 AND [DiscountRate]<100) AND ([MaximumDiscount] IS NULL OR [MaximumDiscount]>0)", "finance");
		migrationBuilder.AddCheckConstraint("CK_CashbackRecoveredAmount", "CashbackReceivable", "[RecoveredAmount]>=0 AND [RecoveredAmount]<=[Amount]", "finance");
		migrationBuilder.CreateIndex("IX_CashbackRecovery_CashbackId", "CashbackRecovery", "CashbackId", "finance");
		migrationBuilder.CreateIndex("IX_CashbackRecovery_TransactionId", "CashbackRecovery", "TransactionId", "finance", unique: true);
		migrationBuilder.CreateIndex("IX_CashbackRecovery_UserId", "CashbackRecovery", "UserId", "finance");
		migrationBuilder.AddForeignKey("FK_PromotionTransferDraft_Transactions_SubsidyTransactionId", "PromotionTransferDraft", "SubsidyTransactionId", "Transactions", "finance", "finance", "Id");
		migrationBuilder.AddForeignKey("FK_PromotionTransferDraft_Transactions_TransferTransactionId", "PromotionTransferDraft", "TransferTransactionId", "Transactions", "finance", "finance", "Id");
	}

	protected override void Down(MigrationBuilder migrationBuilder)
	{
		migrationBuilder.DropForeignKey("FK_PromotionTransferDraft_Transactions_SubsidyTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropForeignKey("FK_PromotionTransferDraft_Transactions_TransferTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropTable("CashbackRecovery", "finance");
		migrationBuilder.DropIndex("IX_PromotionTransferDraft_SubsidyTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropIndex("IX_PromotionTransferDraft_TransferTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropCheckConstraint("CK_PromotionDiscountRate", "PromotionBenefit", "finance");
		migrationBuilder.DropCheckConstraint("CK_CashbackRecoveredAmount", "CashbackReceivable", "finance");
		migrationBuilder.DropColumn("SubsidyTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropColumn("TransferTransactionId", "PromotionTransferDraft", "finance");
		migrationBuilder.DropColumn("ClaimedAt", "PromotionBenefit", "finance");
		migrationBuilder.DropColumn("DiscountRate", "PromotionBenefit", "finance");
		migrationBuilder.DropColumn("MaximumDiscount", "PromotionBenefit", "finance");
		migrationBuilder.DropColumn("PaymentMethod", "PromotionBenefit", "finance");
		migrationBuilder.DropColumn("RecoveredAmount", "CashbackReceivable", "finance");
	}

	protected override void BuildTargetModel(ModelBuilder modelBuilder)
	{
		modelBuilder.HasDefaultSchema("finance").HasAnnotation("ProductVersion", "10.0.12").HasAnnotation("Relational:MaxIdentifierLength", 128);
		modelBuilder.UseIdentityColumns(1L);
		modelBuilder.Entity("PersonalFinance.Api.Domain.Account", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal?>("CreditLimit").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("Institution").HasColumnType("nvarchar(max)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<decimal>("OpeningBalance").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<int?>("PaymentDay").HasColumnType("int");
			b.Property<int?>("StatementDay").HasColumnType("int");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Name").IsUnique();
			b.ToTable("Accounts", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Account_Credit", "([CreditLimit] IS NULL OR [CreditLimit] >= 0) AND ([StatementDay] IS NULL OR [StatementDay] BETWEEN 1 AND 31) AND ([PaymentDay] IS NULL OR [PaymentDay] BETWEEN 1 AND 31)");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AnnualBudget", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<decimal>("Total").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.Property<int>("Year").HasColumnType("int");
			b.HasKey("Id");
			b.HasIndex("UserId", "Year").IsUnique();
			b.ToTable("AnnualBudget", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_AnnualBudget_Values", "[Total]>=0 AND [Year] BETWEEN 1900 AND 9998 AND [Currency]='CNY' AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AnnualBudgetAllocation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("AnnualBudgetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<int>("Month").HasColumnType("int");
			b.HasKey("Id");
			b.HasIndex("CategoryId");
			b.HasIndex("AnnualBudgetId", "Month", "CategoryId").IsUnique();
			b.ToTable("AnnualBudgetAllocation", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_AnnualAllocation_Values", "[Amount]>=0 AND [Month] BETWEEN 0 AND 12 AND ([Month]>0 OR [CategoryId] IS NOT NULL)");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AppUser", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("DisplayName").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Email").IsRequired().HasMaxLength(256)
				.HasColumnType("nvarchar(256)");
			b.Property<string>("PasswordHash").IsRequired().HasColumnType("nvarchar(max)");
			b.HasKey("Id");
			b.HasIndex("Email").IsUnique();
			b.ToTable("Users", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AssetAggregationPolicy", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Mode").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Reason").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("UserId", "AccountId").IsUnique();
			b.ToTable("AssetAggregationPolicy", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_AggregationPolicy", "[Mode] IN ('Unknown','CashOnly','TotalAssets') AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AuditRecord", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Action").IsRequired().HasMaxLength(20)
				.HasColumnType("nvarchar(20)");
			b.Property<string>("ChangesJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("OperationKey").HasMaxLength(200).HasColumnType("nvarchar(200)");
			b.Property<string>("ResourceId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("ResourceType").IsRequired().HasMaxLength(80)
				.HasColumnType("nvarchar(80)");
			b.Property<string>("Source").IsRequired().HasMaxLength(20)
				.HasColumnType("nvarchar(20)");
			b.Property<string>("TraceId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "ResourceId", "CreatedAt");
			b.HasIndex("UserId", "TransactionId", "CreatedAt");
			b.ToTable("AuditRecords", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AutomationExecution", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ChangedFieldsJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("OccurrenceId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("OperationKey").HasMaxLength(150).HasColumnType("nvarchar(150)");
			b.Property<string>("RuleId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("OccurrenceId");
			b.HasIndex("RuleId");
			b.HasIndex("UserId", "CreatedAt");
			b.ToTable("AutomationExecutions", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AutomationRule", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ActionsJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("ConditionsJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<long>("HitCount").HasColumnType("bigint");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<bool>("PreviewOnly").HasColumnType("bit");
			b.Property<int>("Priority").HasColumnType("int");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "State", "Priority", "Id");
			b.ToTable("AutomationRules", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Budget", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Month").IsRequired().HasMaxLength(7)
				.HasColumnType("nvarchar(7)");
			b.Property<decimal>("Total").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Month").IsUnique();
			b.ToTable("Budgets", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Budget_Total", "[Total] >= 0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetAlertSetting", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<bool>("Enabled").HasColumnType("bit");
			b.Property<bool>("Silent").HasColumnType("bit");
			b.Property<string>("ThresholdsJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId").IsUnique();
			b.ToTable("BudgetAlertSetting", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetAlertState", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("BudgetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<bool>("Dismissed").HasColumnType("bit");
			b.Property<decimal>("EffectiveBudget").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Month").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<bool>("Silent").HasColumnType("bit");
			b.Property<int>("Threshold").HasColumnType("int");
			b.Property<decimal>("Used").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "BudgetId", "Threshold").IsUnique();
			b.ToTable("BudgetAlertState", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetCarryover", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal?>("Cap").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<bool>("CarryOverspend").HasColumnType("bit");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<decimal>("Parameter").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Reason").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Rule").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("SourceFingerprint").IsRequired().HasMaxLength(64)
				.HasColumnType("nvarchar(64)");
			b.Property<string>("SourceMonth").IsRequired().HasMaxLength(7)
				.HasColumnType("nvarchar(7)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TargetMonth").IsRequired().HasMaxLength(7)
				.HasColumnType("nvarchar(7)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("CategoryId");
			b.HasIndex("UserId", "SourceMonth", "TargetMonth", "CategoryId").IsUnique();
			b.ToTable("BudgetCarryover", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetChangeHistory", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AfterJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<long>("AfterVersion").HasColumnType("bigint");
			b.Property<string>("BeforeJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<long>("BeforeVersion").HasColumnType("bigint");
			b.Property<string>("BudgetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Reason").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("Source").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "BudgetId", "CreatedAt");
			b.ToTable("BudgetChangeHistory", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetLine", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("BudgetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("CategoryId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<decimal>("Limit").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.HasKey("Id");
			b.HasIndex("BudgetId");
			b.ToTable("BudgetLine", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_BudgetLine_Limit", "[Limit] >= 0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetTemplate", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("BudgetJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Name").IsUnique();
			b.ToTable("BudgetTemplate", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Business", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("ContractAccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Counterparty").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("OccurredAt").HasColumnType("datetimeoffset");
			b.Property<decimal>("Principal").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId");
			b.ToTable("Businesses", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Business_Principal", "[Principal] > 0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashFlowScenario", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ChangesJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "State", "Id");
			b.ToTable("CashFlowScenario", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashbackReceivable", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<DateTimeOffset?>("ExpiresAt").HasColumnType("datetimeoffset");
			b.Property<decimal>("RecoveredAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("SettlementTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Source").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Treatment").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("SettlementTransactionId").IsUnique().HasFilter("[SettlementTransactionId] IS NOT NULL");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId");
			b.ToTable("CashbackReceivable", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_CashbackRecoveredAmount", "[RecoveredAmount]>=0 AND [RecoveredAmount]<=[Amount]");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashbackRecovery", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("CashbackId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Reason").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("CashbackId");
			b.HasIndex("TransactionId").IsUnique();
			b.HasIndex("UserId");
			b.ToTable("CashbackRecovery", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_CashbackRecovery", "[Amount]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Category", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Name").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("ParentId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<int>("SortOrder").HasColumnType("int");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("ParentId");
			b.HasIndex("UserId");
			b.ToTable("Categories", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CustomReportDefinition", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("DefinitionJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Name").IsUnique();
			b.ToTable("CustomReportDefinition", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtPaymentAllocation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Component").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Explanation").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("PlanId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<int>("Sequence").HasColumnType("int");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("PlanId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "PlanId", "Sequence");
			b.HasIndex("UserId", "TransactionId", "State");
			b.ToTable("DebtPaymentAllocation", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_DebtAllocation", "[Amount]>0 AND [Sequence]>0 AND [Component] IN ('Principal','Fee') AND [State] IN ('Active','Revoked')");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtPlanHistory", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("PlanId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Reason").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("SnapshotJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("PlanId");
			b.HasIndex("UserId", "PlanId", "CreatedAt");
			b.ToTable("DebtPlanHistory", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtRepaymentPlan", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("BusinessId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("FeeMode").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateOnly>("FirstDate").HasColumnType("date");
			b.Property<decimal>("FixedFee").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateOnly?>("MinimumDueDate").HasColumnType("date");
			b.Property<decimal?>("MinimumPayment").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("OriginalTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("PeriodRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<int>("Periods").HasColumnType("int");
			b.Property<decimal>("Principal").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("PrincipalBaselineAt").HasColumnType("datetimeoffset");
			b.Property<string>("RepaymentMode").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("ScheduleJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<decimal?>("StatementAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("BusinessId");
			b.HasIndex("OriginalTransactionId");
			b.HasIndex("UserId", "BusinessId").IsUnique().HasFilter("[BusinessId] IS NOT NULL AND [State]='Active'");
			b.HasIndex("UserId", "OriginalTransactionId").IsUnique().HasFilter("[OriginalTransactionId] IS NOT NULL AND [State]='Active'");
			b.HasIndex("UserId", "Kind", "State", "Id");
			b.ToTable("DebtRepaymentPlan", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_DebtPlan_Values", "[Principal]>0 AND [Periods] BETWEEN 1 AND 600 AND [Version]>0 AND [Currency] IN ('CNY','USD','HKD') AND [PeriodRate] BETWEEN 0 AND 100 AND [FixedFee]>=0 AND [State] IN ('Active','Archived') AND (([Kind]='CreditInstallment' AND [BusinessId] IS NULL) OR ([Kind]='LoanRepayment' AND [BusinessId] IS NOT NULL AND [OriginalTransactionId] IS NULL)) AND ([MinimumPayment] IS NULL OR [MinimumPayment]>=0 AND [StatementAmount] IS NOT NULL AND [MinimumPayment]<=[StatementAmount])");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DirectoryItem", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal?>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal>("Budget").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("EndDate").HasColumnType("nvarchar(max)");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("StartDate").HasColumnType("nvarchar(max)");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Kind", "Name").IsUnique();
			b.ToTable("Directory", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Entry", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal>("BaseAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<decimal>("ExchangeRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("OriginalEntryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("CategoryId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "AccountId", "TransactionId");
			b.ToTable("Entries", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Entry_Values", "[Amount] <> 0 AND [BaseAmount] <> 0 AND [ExchangeRate] > 0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.EssentialExpensePolicy", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("EssentialRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<bool>("Excluded").HasColumnType("bit");
			b.Property<string>("Necessity").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("CategoryId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "CategoryId").IsUnique().HasFilter("[CategoryId] IS NOT NULL");
			b.HasIndex("UserId", "TransactionId").IsUnique().HasFilter("[TransactionId] IS NOT NULL");
			b.ToTable("EssentialExpensePolicy", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_EssentialPolicy_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [EssentialRate] BETWEEN 0 AND 100");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FinanceTransaction", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("AdjustmentDirection").HasColumnType("nvarchar(max)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("BusinessId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<decimal?>("ExchangeRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<string>("ExternalId").HasMaxLength(256).HasColumnType("nvarchar(256)");
			b.Property<decimal>("Fee").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("FeeCategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ImportJobId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Merchant").HasColumnType("nvarchar(max)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("OccurredAt").HasColumnType("datetimeoffset");
			b.Property<string>("OriginalTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ProjectId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("PromotionJson").HasColumnType("nvarchar(max)");
			b.Property<decimal?>("ReceivedAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("ToAccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "ImportJobId");
			b.HasIndex("UserId", "AccountId", "Status");
			b.HasIndex("UserId", "OccurredAt", "Id");
			b.ToTable("Transactions", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Transaction_Amounts", "[Amount] > 0 AND [Fee] >= 0 AND [Version] > 0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FutureCashFlowItem", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Certainty").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<DateOnly>("ExpectedDate").HasColumnType("date");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<decimal?>("ReceivedAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("ScenarioId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("ToAccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("ScenarioId");
			b.HasIndex("ToAccountId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "TransactionId").IsUnique().HasFilter("[TransactionId] IS NOT NULL");
			b.HasIndex("UserId", "State", "ExpectedDate", "Id");
			b.ToTable("FutureCashFlowItem", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_FutureCashflow_Amount", "[Amount]>0 AND ([ReceivedAmount] IS NULL OR [ReceivedAmount]>0) AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FxValuationRate", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("BaseCurrency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<DateOnly>("Date").HasColumnType("date");
			b.Property<decimal>("Rate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<string>("Source").IsRequired().HasMaxLength(200)
				.HasColumnType("nvarchar(200)");
			b.Property<string>("TargetCurrency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "BaseCurrency", "TargetCurrency", "Date", "CreatedAt");
			b.ToTable("FxValuationRate", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_FxValuation", "[Rate]>0 AND [BaseCurrency]<>[TargetCurrency] AND [BaseCurrency] IN ('CNY','USD','HKD') AND [TargetCurrency] IN ('CNY','USD','HKD') AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.GoalAllocation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("GoalId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("GoalId");
			b.HasIndex("UserId", "AccountId");
			b.HasIndex("UserId", "GoalId", "AccountId").IsUnique();
			b.ToTable("GoalAllocation", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_GoalAllocation_Amount", "[Amount]>=0 AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.GoalAllocationHistory", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Action").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<decimal>("After").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal>("Before").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("GoalId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Reason").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("ToGoalId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("GoalId");
			b.HasIndex("ToGoalId");
			b.HasIndex("UserId", "GoalId", "CreatedAt");
			b.ToTable("GoalAllocationHistory", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Idempotency", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ClientFingerprint").HasMaxLength(64).HasColumnType("nvarchar(64)");
			b.Property<DateTimeOffset?>("CompletedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Hash").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Key").IsRequired().HasMaxLength(200)
				.HasColumnType("nvarchar(200)");
			b.Property<string>("Method").HasMaxLength(10).HasColumnType("nvarchar(10)");
			b.Property<string>("Path").HasMaxLength(300).HasColumnType("nvarchar(300)");
			b.Property<string>("Response").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "Key").IsUnique();
			b.ToTable("Idempotencies", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportAttempt", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Code").IsRequired().HasMaxLength(80)
				.HasColumnType("nvarchar(80)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("ImportJobId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<int>("Imported").HasColumnType("int");
			b.Property<string>("Message").IsRequired().HasMaxLength(300)
				.HasColumnType("nvarchar(300)");
			b.Property<string>("OperationKey").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("OutcomesJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<int>("Skipped").HasColumnType("int");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<int>("Total").HasColumnType("int");
			b.Property<string>("TraceId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("ImportJobId");
			b.HasIndex("UserId", "ImportJobId", "CreatedAt");
			b.ToTable("ImportAttempts", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportJob", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("FileName").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("HeadersJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<int>("Imported").HasColumnType("int");
			b.Property<string>("MappingJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("RawRowsJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Source").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId");
			b.ToTable("Imports", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportRow", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("DataJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Fingerprint").IsRequired().HasMaxLength(64)
				.HasColumnType("nvarchar(64)");
			b.Property<string>("IdentityKey").HasMaxLength(64).HasColumnType("nvarchar(64)");
			b.Property<int>("IdentityVersion").HasColumnType("int");
			b.Property<string>("ImportJobId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<int>("Index").HasColumnType("int");
			b.Property<string>("ReviewDecision").HasMaxLength(12).HasColumnType("nvarchar(12)");
			b.Property<string>("ReviewSignature").HasMaxLength(64).HasColumnType("nvarchar(64)");
			b.Property<DateTimeOffset?>("ReviewedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Status").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("ImportJobId");
			b.HasIndex("UserId", "Fingerprint").IsUnique().HasFilter("[Status] = 'Imported'");
			b.HasIndex("UserId", "IdentityKey").IsUnique().HasFilter("[Status] = 'Imported' AND [IdentityKey] IS NOT NULL");
			b.HasIndex("UserId", "Fingerprint", "Status");
			b.ToTable("ImportRows", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentAsset", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Code").IsRequired().HasMaxLength(80)
				.HasColumnType("nvarchar(80)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("Market").IsRequired().HasMaxLength(80)
				.HasColumnType("nvarchar(80)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Unit").IsRequired().HasMaxLength(20)
				.HasColumnType("nvarchar(20)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("UserId", "AccountId", "Market", "Type", "Code").IsUnique().HasFilter("[Code] <> ''");
			b.ToTable("InvestmentAsset", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_InvestmentAsset", "[Currency] IN ('CNY','USD','HKD') AND [State] IN ('Active','Archived') AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentHistory", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AssetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Reason").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("ResourceId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("SnapshotJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AssetId");
			b.HasIndex("UserId", "AssetId", "CreatedAt");
			b.ToTable("InvestmentHistory", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentTrade", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("AssetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<decimal>("Commission").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<DateOnly>("Date").HasColumnType("date");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<decimal>("OtherFee").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<bool>("OwnsTransaction").HasColumnType("bit");
			b.Property<decimal>("Price").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<decimal>("Quantity").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<DateOnly>("SettlementDate").HasColumnType("date");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<decimal>("Tax").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AssetId");
			b.HasIndex("TransactionId").IsUnique().HasFilter("[TransactionId] IS NOT NULL AND [State]='Active'");
			b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
			b.ToTable("InvestmentTrade", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_InvestmentTrade", "[Quantity]>=0 AND [Price]>=0 AND [Amount]>=0 AND [Commission]>=0 AND [Tax]>=0 AND [OtherFee]>=0 AND [SettlementDate]>=[Date] AND [State] IN ('Active','Revoked') AND [Type] IN ('Buy','Sell','Dividend','Interest','Fee','PositionIncrease','PositionDecrease') AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentValuation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AssetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<DateOnly>("Date").HasColumnType("date");
			b.Property<string>("Method").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<decimal>("Price").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<string>("Source").IsRequired().HasMaxLength(200)
				.HasColumnType("nvarchar(200)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AssetId");
			b.HasIndex("UserId", "AssetId", "Date").IsUnique();
			b.ToTable("InvestmentValuation", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_InvestmentValuation", "[Price]>=0 AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ManagedAsset", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateOnly>("AcquiredDate").HasColumnType("date");
			b.Property<decimal>("AnnualRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<decimal>("Cost").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("DayCount").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("FundingTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Institution").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("InterestTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("LiabilityAccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("MaturityAction").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateOnly?>("MaturityDate").HasColumnType("date");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("SettlementTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId").IsUnique().HasFilter("[AccountId] IS NOT NULL AND [State]='Active'");
			b.HasIndex("FundingTransactionId");
			b.HasIndex("InterestTransactionId");
			b.HasIndex("LiabilityAccountId");
			b.HasIndex("SettlementTransactionId");
			b.HasIndex("UserId", "Type", "State", "MaturityDate");
			b.ToTable("ManagedAsset", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_ManagedAsset", "[Cost]>=0 AND [AnnualRate] BETWEEN 0 AND 100 AND [Currency] IN ('CNY','USD','HKD') AND [Version]>0 AND [State] IN ('Active','Archived','Matured','EarlyWithdrawn')");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ManagedAssetValuation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("AssetId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<DateOnly>("Date").HasColumnType("date");
			b.Property<string>("Source").IsRequired().HasMaxLength(200)
				.HasColumnType("nvarchar(200)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AssetId");
			b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
			b.ToTable("ManagedAssetValuation", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_ManagedValuation", "[Amount]>=0 AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionBenefit", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset?>("ClaimedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<decimal?>("DiscountRate").HasPrecision(28, 8).HasColumnType("decimal(28,8)");
			b.Property<DateTimeOffset>("ExpiresAt").HasColumnType("datetimeoffset");
			b.Property<decimal>("FaceValue").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal?>("MaximumDiscount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Merchant").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<decimal>("MinimumAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Mode").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Name").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("PaymentMethod").HasColumnType("nvarchar(max)");
			b.Property<string>("Platform").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<int>("Quantity").HasColumnType("int");
			b.Property<decimal>("RemainingValue").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Rules").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("StartsAt").HasColumnType("datetimeoffset");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("UserId", "State", "ExpiresAt");
			b.ToTable("PromotionBenefit", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_PromotionBenefit", "[Quantity]>=0 AND [FaceValue]>=0 AND [RemainingValue]>=0 AND [MinimumAmount]>=0 AND [ExpiresAt]>=[StartsAt]");
				t.HasCheckConstraint("CK_PromotionDiscountRate", "([DiscountRate] IS NULL OR [DiscountRate]>0 AND [DiscountRate]<100) AND ([MaximumDiscount] IS NULL OR [MaximumDiscount]>0)");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionTransferDraft", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("Evidence").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("OccurredAt").HasColumnType("datetimeoffset");
			b.Property<decimal>("PaidAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<decimal>("ReceivedAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Source").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<decimal>("SubsidyAmount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("SubsidyTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("ToAccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("TransferTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("SubsidyTransactionId");
			b.HasIndex("ToAccountId");
			b.HasIndex("TransferTransactionId");
			b.HasIndex("UserId");
			b.ToTable("PromotionTransferDraft", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_SubsidizedTransferDraft", "[PaidAmount]>0 AND [SubsidyAmount]>0 AND [ReceivedAmount]=[PaidAmount]+[SubsidyAmount]");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionUsage", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("BenefitId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("RefundTransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("BenefitId");
			b.HasIndex("RefundTransactionId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "TransactionId", "BenefitId");
			b.ToTable("PromotionUsage", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Reconciliation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<decimal>("ActualBalance").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<decimal>("Difference").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Reason").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<decimal>("SystemBalance").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId");
			b.ToTable("Reconciliations", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringExecution", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Action").IsRequired().HasMaxLength(30)
				.HasColumnType("nvarchar(30)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Message").IsRequired().HasMaxLength(300)
				.HasColumnType("nvarchar(300)");
			b.Property<string>("OccurrenceId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("OperationKey").HasMaxLength(150).HasColumnType("nvarchar(150)");
			b.Property<string>("RuleId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Source").IsRequired().HasMaxLength(20)
				.HasColumnType("nvarchar(20)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("OccurrenceId");
			b.HasIndex("RuleId");
			b.HasIndex("UserId", "RuleId", "CreatedAt");
			b.ToTable("RecurringExecutions", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringOccurrence", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Amount").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("PayloadJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("PreparedPayloadJson").HasColumnType("nvarchar(max)");
			b.Property<string>("RuleId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("RuleVersion").HasColumnType("bigint");
			b.Property<DateTimeOffset>("ScheduledAt").HasColumnType("datetimeoffset");
			b.Property<long>("Sequence").HasColumnType("bigint");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("TransactionId").IsUnique().HasFilter("[TransactionId] IS NOT NULL");
			b.HasIndex("RuleId", "ScheduledAt").IsUnique();
			b.HasIndex("RuleId", "Sequence").IsUnique();
			b.HasIndex("UserId", "State", "ScheduledAt");
			b.ToTable("RecurringOccurrences", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringRule", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("AccountId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("Amount").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<string>("DetailedNote").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTime?>("EndLocal").HasColumnType("datetime2");
			b.Property<string>("Frequency").IsRequired().HasMaxLength(20)
				.HasColumnType("nvarchar(20)");
			b.Property<int>("Interval").HasColumnType("int");
			b.Property<string>("MonthEndPolicy").IsRequired().HasMaxLength(10)
				.HasColumnType("nvarchar(10)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<DateTimeOffset?>("NextAt").HasColumnType("datetimeoffset");
			b.Property<long>("NextSequence").HasColumnType("bigint");
			b.Property<string>("PayloadJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<int>("ReminderDays").HasColumnType("int");
			b.Property<DateTime>("StartLocal").HasColumnType("datetime2");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TimeZone").IsRequired().HasMaxLength(100)
				.HasColumnType("nvarchar(100)");
			b.Property<string>("ToAccountId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("AccountId");
			b.HasIndex("CategoryId");
			b.HasIndex("ToAccountId");
			b.HasIndex("UserId");
			b.HasIndex("State", "NextAt", "UserId");
			b.ToTable("RecurringRules", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Recurring_Schedule", "[Interval] BETWEEN 1 AND 366 AND [ReminderDays] BETWEEN 0 AND 90 AND [NextSequence]>=0 AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.SavingsGoal", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<decimal>("MonthlySaving").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<int>("Priority").HasColumnType("int");
			b.Property<DateOnly>("StartDate").HasColumnType("date");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<decimal>("Target").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateOnly>("TargetDate").HasColumnType("date");
			b.Property<string>("Type").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "State", "Priority", "Id");
			b.ToTable("SavingsGoal", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_Goal_Values", "[Target]>0 AND [MonthlySaving]>=0 AND [TargetDate]>=[StartDate] AND [Priority] BETWEEN 1 AND 5 AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ScenarioCalculation", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("InputJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("ResultJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("ScenarioId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("SourceHash").IsRequired().HasMaxLength(64)
				.HasColumnType("nvarchar(64)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("ScenarioId");
			b.HasIndex("UserId", "ScenarioId", "CreatedAt");
			b.ToTable("ScenarioCalculation", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Session", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("ExpiresAt").HasColumnType("datetimeoffset");
			b.Property<string>("RefreshHash").IsRequired().HasMaxLength(64)
				.HasColumnType("nvarchar(64)");
			b.Property<bool>("Revoked").HasColumnType("bit");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("RefreshHash").IsUnique();
			b.HasIndex("UserId");
			b.ToTable("Sessions", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.StatisticsRules", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<bool>("IncludeAssetLoss").HasColumnType("bit");
			b.Property<bool>("IncludeDecreasingAdjustments").HasColumnType("bit");
			b.Property<bool>("IncludeFees").HasColumnType("bit");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId").IsUnique();
			b.ToTable("Rules", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.StoredDocument", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<byte[]>("Content").IsRequired().HasColumnType("varbinary(max)");
			b.Property<string>("ContentType").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Kind").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("Name").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId");
			b.ToTable("Documents", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Subscription", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<bool>("AutoRenew").HasColumnType("bit");
			b.Property<DateTimeOffset?>("CancelledAt").HasColumnType("datetimeoffset");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Name").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("Provider").IsRequired().HasMaxLength(150)
				.HasColumnType("nvarchar(150)");
			b.Property<string>("RuleId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset?>("ServiceEndsAt").HasColumnType("datetimeoffset");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("RuleId").IsUnique();
			b.HasIndex("UserId");
			b.ToTable("Subscriptions", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.SubscriptionPrice", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<decimal>("Amount").HasPrecision(28, 4).HasColumnType("decimal(28,4)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Currency").IsRequired().HasMaxLength(3)
				.HasColumnType("nvarchar(3)");
			b.Property<DateTimeOffset>("EffectiveAt").HasColumnType("datetimeoffset");
			b.Property<string>("SubscriptionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId");
			b.HasIndex("SubscriptionId", "EffectiveAt").IsUnique();
			b.ToTable("SubscriptionPrices", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_SubscriptionPrice_Amount", "[Amount]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionAnalysisAttribute", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("Behavior").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("CategoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("Note").IsRequired().HasMaxLength(2000)
				.HasColumnType("nvarchar(2000)");
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("CategoryId");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "CategoryId").IsUnique().HasFilter("[CategoryId] IS NOT NULL");
			b.HasIndex("UserId", "TransactionId").IsUnique().HasFilter("[TransactionId] IS NOT NULL");
			b.ToTable("TransactionAnalysisAttribute", "finance", (TableBuilder t) =>
			{
				t.HasCheckConstraint("CK_AnalysisAttribute_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [Behavior] IN ('Unknown','FixedExpense','VariableExpense','FixedIncome','VariableIncome','OneTimeIncome','OtherIncome') AND [Version]>0");
			});
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionBatchRecord", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("CreatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("ResultJson").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("UserId", "CreatedAt");
			b.ToTable("TransactionBatchRecord", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionReview", (EntityTypeBuilder b) =>
		{
			b.Property<string>("Id").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset?>("DeferredUntil").HasColumnType("datetimeoffset");
			b.Property<string>("Note").IsRequired().HasColumnType("nvarchar(max)");
			b.Property<string>("State").IsRequired().HasMaxLength(40)
				.HasColumnType("nvarchar(40)");
			b.Property<string>("TransactionId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<DateTimeOffset>("UpdatedAt").HasColumnType("datetimeoffset");
			b.Property<string>("UserId").IsRequired().HasMaxLength(36)
				.HasColumnType("nvarchar(36)");
			b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint");
			b.HasKey("Id");
			b.HasIndex("TransactionId");
			b.HasIndex("UserId", "TransactionId").IsUnique();
			b.ToTable("TransactionReview", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionTag", (EntityTypeBuilder b) =>
		{
			b.Property<string>("TransactionId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.Property<string>("DirectoryId").HasMaxLength(36).HasColumnType("nvarchar(36)");
			b.HasKey("TransactionId", "DirectoryId");
			b.HasIndex("DirectoryId");
			b.ToTable("TransactionTag", "finance");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Account", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AnnualBudget", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AnnualBudgetAllocation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AnnualBudget", null).WithMany("Allocations").HasForeignKey("AnnualBudgetId")
				.OnDelete(DeleteBehavior.Cascade)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AssetAggregationPolicy", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AuditRecord", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AutomationExecution", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.RecurringOccurrence", null).WithMany().HasForeignKey("OccurrenceId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AutomationRule", null).WithMany().HasForeignKey("RuleId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AutomationRule", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Budget", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetAlertSetting", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetAlertState", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetCarryover", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetChangeHistory", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetLine", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Budget", null).WithMany("Items").HasForeignKey("BudgetId")
				.OnDelete(DeleteBehavior.Cascade)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.BudgetTemplate", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Business", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashFlowScenario", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashbackReceivable", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("SettlementTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CashbackRecovery", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.CashbackReceivable", null).WithMany().HasForeignKey("CashbackId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Category", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("ParentId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.CustomReportDefinition", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtPaymentAllocation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.DebtRepaymentPlan", null).WithMany().HasForeignKey("PlanId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtPlanHistory", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.DebtRepaymentPlan", null).WithMany().HasForeignKey("PlanId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DebtRepaymentPlan", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.Business", null).WithMany().HasForeignKey("BusinessId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("OriginalTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.DirectoryItem", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Entry", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany("Entries").HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.Cascade)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.EssentialExpensePolicy", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FinanceTransaction", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FutureCashFlowItem", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.CashFlowScenario", null).WithMany().HasForeignKey("ScenarioId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("ToAccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FxValuationRate", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.GoalAllocation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null).WithMany().HasForeignKey("GoalId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.GoalAllocationHistory", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null).WithMany().HasForeignKey("GoalId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null).WithMany().HasForeignKey("ToGoalId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Idempotency", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportAttempt", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.ImportJob", null).WithMany().HasForeignKey("ImportJobId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportJob", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportRow", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.ImportJob", null).WithMany("Rows").HasForeignKey("ImportJobId")
				.OnDelete(DeleteBehavior.Cascade)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentAsset", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentHistory", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null).WithMany().HasForeignKey("AssetId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentTrade", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null).WithMany().HasForeignKey("AssetId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.InvestmentValuation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null).WithMany().HasForeignKey("AssetId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ManagedAsset", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("FundingTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("InterestTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("LiabilityAccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("SettlementTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ManagedAssetValuation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null).WithMany().HasForeignKey("AssetId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionBenefit", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionTransferDraft", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("SubsidyTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("ToAccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransferTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.PromotionUsage", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.PromotionBenefit", null).WithMany().HasForeignKey("BenefitId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("RefundTransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Reconciliation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringExecution", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.RecurringOccurrence", null).WithMany().HasForeignKey("OccurrenceId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null).WithMany().HasForeignKey("RuleId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringOccurrence", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null).WithMany().HasForeignKey("RuleId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.RecurringRule", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("AccountId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.Account", null).WithMany().HasForeignKey("ToAccountId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.SavingsGoal", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ScenarioCalculation", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.CashFlowScenario", null).WithMany().HasForeignKey("ScenarioId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Session", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.StatisticsRules", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.StoredDocument", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Subscription", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null).WithMany().HasForeignKey("RuleId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.SubscriptionPrice", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Subscription", null).WithMany().HasForeignKey("SubscriptionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionAnalysisAttribute", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.Category", null).WithMany().HasForeignKey("CategoryId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction);
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionBatchRecord", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionReview", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany().HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.AppUser", null).WithMany().HasForeignKey("UserId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.TransactionTag", (EntityTypeBuilder b) =>
		{
			b.HasOne("PersonalFinance.Api.Domain.DirectoryItem", null).WithMany().HasForeignKey("DirectoryId")
				.OnDelete(DeleteBehavior.NoAction)
				.IsRequired();
			b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null).WithMany("Tags").HasForeignKey("TransactionId")
				.OnDelete(DeleteBehavior.Cascade)
				.IsRequired();
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.AnnualBudget", (EntityTypeBuilder b) =>
		{
			b.Navigation("Allocations");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.Budget", (EntityTypeBuilder b) =>
		{
			b.Navigation("Items");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.FinanceTransaction", (EntityTypeBuilder b) =>
		{
			b.Navigation("Entries");
			b.Navigation("Tags");
		});
		modelBuilder.Entity("PersonalFinance.Api.Domain.ImportJob", (EntityTypeBuilder b) =>
		{
			b.Navigation("Rows");
		});
	}
}
