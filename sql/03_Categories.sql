SET NOEXEC OFF;
USE master;
GO
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'中止：PersonalFinance不存在，禁止在系统数据库执行模块。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'中止：当前数据库不是PersonalFinance。',16,1);
 SET NOEXEC ON;
END;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
-- MODULE 03_Categories
-- 复合自引用外键强制父分类为同用户、同类型的一层分类，层级无需触发器。
CREATE TABLE dbo.Categories (
 CategoryId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 ParentCategoryId BIGINT NULL, CategoryName NVARCHAR(100) NOT NULL,
 CategoryType VARCHAR(10) NOT NULL CHECK(CategoryType IN ('Income','Expense')),
 CategoryCode VARCHAR(60) NOT NULL, CategoryLevel TINYINT NOT NULL,
 ParentLevel TINYINT NULL, IsConsumption BIT NOT NULL DEFAULT 1,
 Description NVARCHAR(1000) NULL, SortOrder INT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,CategoryId), UNIQUE(UserId,CategoryCode),
 UNIQUE(UserId,CategoryId,CategoryType),
 UNIQUE(UserId,CategoryId,CategoryType,CategoryLevel),
 FOREIGN KEY(UserId,ParentCategoryId,CategoryType,ParentLevel) REFERENCES dbo.Categories(UserId,CategoryId,CategoryType,CategoryLevel),
 CHECK(ParentCategoryId IS NULL OR ParentCategoryId<>CategoryId),
 CHECK((CategoryLevel=1 AND ParentCategoryId IS NULL AND ParentLevel IS NULL) OR
       (CategoryLevel=2 AND ParentCategoryId IS NOT NULL AND ParentLevel=1))
);
CREATE UNIQUE INDEX UX_Categories_Name ON dbo.Categories(UserId,CategoryType,ParentCategoryId,CategoryName);
CREATE TABLE dbo.Merchants (
 MerchantId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 MerchantName NVARCHAR(200) NOT NULL, MerchantCategory NVARCHAR(100) NULL, DefaultCategoryId BIGINT NULL,
 Notes NVARCHAR(2000) NULL, IsActive BIT NOT NULL DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,MerchantId), UNIQUE(UserId,MerchantName),
 FOREIGN KEY(UserId,DefaultCategoryId) REFERENCES dbo.Categories(UserId,CategoryId)
);
GO
