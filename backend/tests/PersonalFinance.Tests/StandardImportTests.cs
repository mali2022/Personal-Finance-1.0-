using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
[Collection("Finance SQL")]
public sealed class StandardImportTests
{
    static JsonElement Body(object value)=>JsonSerializer.SerializeToElement(value,FinanceService.Json);
    const string Header="日期时间,金额,交易类型,商户,商品,分类,二级分类,三级分类,备注,交易状态,币种,优惠金额,交易单号\r\n";
    static JsonElement Mapping(string account)=>Body(new{accountId=account,mapping=new{occurredAt="日期时间",amount="金额",type="交易类型",merchant="商户",productName="商品",category="分类",category2="二级分类",category3="三级分类",note="备注",status="交易状态",currency="币种",discountAmount="优惠金额",externalId="交易单号"}});
    static async Task<ImportJob> Upload(DeletionSqlTests.Fixture f,string csv){
        var bytes=Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
        await using var stream=new MemoryStream(bytes);var result=Body(await f.Service.UploadImport(f.User,new FormFile(stream,0,bytes.Length,"file","standard.csv"),"CSV"));
        await f.Db.SaveChangesAsync();return await f.Db.Imports.SingleAsync(x=>x.Id==result.GetProperty("id").GetString());
    }
    static (Category Root,Category Second,Category Third) Categories(DeletionSqlTests.Fixture f,string root="餐饮食品",string second="日常午餐",string kind="Expense"){
        var a=new Category{UserId=f.User,Name=root,Kind=kind};var b=new Category{UserId=f.User,Name=second,Kind=kind,ParentId=a.Id};var c=new Category{UserId=f.User,Name="工作午餐",Kind=kind,ParentId=b.Id};f.Db.Categories.AddRange(a,b,c);return(a,b,c);
    }
    [Fact]public void CompleteCategoryPathsResolveSameNamesAndRejectWrongOrDisabledParents(){
        var a=new Category{Name="餐饮",Kind="Expense"};var b=new Category{Name="餐饮",Kind="Income"};var a2=new Category{Name="其他",Kind="Expense",ParentId=a.Id};var b2=new Category{Name="其他",Kind="Income",ParentId=b.Id};var a3=new Category{Name="午餐",Kind="Expense",ParentId=a2.Id};
        var otherRoot=new Category{Name="交通",Kind="Expense"};var otherLeaf=new Category{Name="其他",Kind="Expense",ParentId=otherRoot.Id};var rows=new[]{a,b,a2,b2,a3,otherRoot,otherLeaf};Assert.Equal(a2,FinanceService.ResolveImportCategoryPath(rows,"Expense","餐饮","其他",""));Assert.Equal(a3,FinanceService.ResolveImportCategoryPath(rows,"Expense","餐饮","其他","午餐"));
        Assert.Throws<ApiException>(()=>FinanceService.ResolveImportCategoryPath(rows,"Expense","不存在","其他",""));Assert.Throws<ApiException>(()=>FinanceService.ResolveImportCategoryPath(rows,"Expense","","其他",""));a.Status="Disabled";Assert.Throws<ApiException>(()=>FinanceService.ResolveImportCategoryPath(rows,"Expense","餐饮","其他",""));
    }
    [DeletionSqlFact]public async Task StandardCsvPersistsProductHierarchyAndDiscountWithoutDoubleDeducting(){
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var expense=Categories(f);var income=Categories(f,"职业收入","工资薪酬","Income");await f.Db.SaveChangesAsync();
        var job=await Upload(f,Header+"2026-10-07 12:30:00,25.50,支出,商户A,午餐套餐,餐饮食品,日常午餐,工作午餐,备注独立保存,交易成功,CNY,4.50,S-001\r\n2026-10-07 18:00:00,150.00,收入,客户,,职业收入,工资薪酬,,兼职收入,已入账,CNY,0,S-002\r\n");
        await f.Service.MapImport(f.User,job.Id,Mapping(a.Id),job.Version.ToString());await f.Db.SaveChangesAsync();Assert.All(job.Rows,r=>Assert.Equal("Ready",r.Status));
        var preview=JsonNode.Parse(job.Rows.Single(r=>r.Index==1).DataJson)!;Assert.Equal(expense.Third.Id,preview["categoryId"]!.GetValue<string>());Assert.Equal("30.00",preview["originalAmount"]!.GetValue<string>());
        await f.Service.CommitImport(f.User,job.Id,job.Version.ToString(),new(),"standard-test","trace");await f.Db.SaveChangesAsync();
        var tx=await f.Db.Transactions.SingleAsync(t=>t.UserId==f.User&&t.Type=="Expense");Assert.Equal("午餐套餐",tx.ProductName);Assert.Equal("备注独立保存",tx.Note);Assert.Equal(expense.Third.Id,tx.CategoryId);Assert.Equal(25.5m,tx.Amount);
        var promotion=JsonSerializer.Deserialize<PromotionInput>(tx.PromotionJson!,FinanceService.Json)!;Assert.Equal("30.00",promotion.OriginalAmount);Assert.Equal("4.50",Assert.Single(promotion.Lines).Amount);Assert.Equal(25.5m,PromotionMath.Calculate(promotion,"CNY"));
        Assert.Equal(1124.5m,await f.Service.Balance(f.User,a.Id));Assert.Equal(25.5m,await f.Db.Entries.Where(x=>x.UserId==f.User&&x.Kind=="Expense").SumAsync(x=>x.Amount));
        var received=await f.Db.Transactions.SingleAsync(t=>t.UserId==f.User&&t.Type=="Income");Assert.Equal(income.Second.Id,received.CategoryId);Assert.Null(received.PromotionJson);
    }
    [DeletionSqlFact]public async Task InvalidDiscountsPathsPendingStatusesAndTransfersCannotPost(){
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();Categories(f);Categories(f,"职业收入","工资薪酬","Income");await f.Db.SaveChangesAsync();
        var lines=new[]{
            "2026-10-07 10:00:00,10,支出,甲,商品,错误一级,日常午餐,,备注,交易成功,CNY,0,A",
            "2026-10-07 11:00:00,10,支出,乙,商品,餐饮食品,日常午餐,,备注,交易成功,CNY,-1,B",
            "2026-10-07 12:00:00,10,收入,丙,,职业收入,工资薪酬,,备注,交易成功,CNY,1,C",
            "2026-10-07 13:00:00,10,转账,丁,,餐饮食品,日常午餐,,备注,交易成功,CNY,0,D",
            "2026-10-07 14:00:00,10,支出,戊,商品,餐饮食品,日常午餐,,备注,待付款,CNY,0,E",
            "2026-10-07 15:00:00,10,支出,己,商品,餐饮食品,日常午餐,,备注,交易关闭,CNY,0,F",
            "2026-10-07 16:00:00,10,支出,庚,商品,餐饮食品,日常午餐,,备注,交易失败,CNY,0,G",
            "2026-10-07 17:00:00,10,支出,辛,商品,餐饮食品,日常午餐,,备注,交易成功,CNY,abc,H"};
        var job=await Upload(f,Header+string.Join("\r\n",lines));await f.Service.MapImport(f.User,job.Id,Mapping(a.Id),job.Version.ToString());await f.Db.SaveChangesAsync();Assert.Equal(6,job.Rows.Count(x=>x.Status=="Invalid"));Assert.Equal(2,job.Rows.Count(x=>x.Status=="Skipped"));
        var denied=await Assert.ThrowsAnyAsync<Exception>(()=>f.Service.CommitImport(f.User,job.Id,job.Version.ToString(),new(),"invalid","trace"));Assert.Contains("请明确确认",denied.Message);Assert.False(await f.Db.Transactions.AnyAsync(x=>x.UserId==f.User));
        var badPath=job.Rows.Single(x=>x.Index==1);await f.Service.PatchImport(f.User,job.Id,badPath.Id,Body(new{amount="11"}),job.Version.ToString());Assert.Equal("Invalid",badPath.Status);
    }
    [DeletionSqlFact]public async Task LegacyCsvStillImportsWithoutPromotionOrHierarchyColumns(){
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var cats=Categories(f);await f.Db.SaveChangesAsync();
        var job=await Upload(f,"日期时间,金额,交易类型,商户,备注,分类,交易单号,交易状态,币种\r\n2026-10-07 12:30:00,20,支出,旧模板商户,旧备注,日常午餐,OLD-001,交易成功,CNY");
        await f.Service.MapImport(f.User,job.Id,Body(new{accountId=a.Id,mapping=new{occurredAt="日期时间",amount="金额",type="交易类型",merchant="商户",note="备注",category="分类",externalId="交易单号",status="交易状态",currency="币种"}}),job.Version.ToString());await f.Db.SaveChangesAsync();Assert.Equal("Ready",Assert.Single(job.Rows).Status);
        await f.Service.CommitImport(f.User,job.Id,job.Version.ToString(),new(),"legacy","trace");await f.Db.SaveChangesAsync();var tx=await f.Db.Transactions.SingleAsync(x=>x.UserId==f.User);Assert.Equal("旧备注",tx.Note);Assert.Equal(cats.Second.Id,tx.CategoryId);Assert.Null(tx.PromotionJson);Assert.Equal(980m,await f.Service.Balance(f.User,a.Id));
    }
    [DeletionSqlFact]public async Task ManualCorrectionRevalidatesDiscountAndCategoryWithoutDiscardingProduct(){
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var categories=Categories(f);await f.Db.SaveChangesAsync();
        var job=await Upload(f,Header+"2026-10-07 12:30:00,25.50,支出,商户,商品,错误分类,日常午餐,,备注,交易成功,CNY,-1,P-001");await f.Service.MapImport(f.User,job.Id,Mapping(a.Id),job.Version.ToString());await f.Db.SaveChangesAsync();var row=Assert.Single(job.Rows);Assert.Equal("Invalid",row.Status);
        await f.Service.PatchImport(f.User,job.Id,row.Id,Body(new{discountAmount="4.50",categoryId=categories.Second.Id,productName="修正商品"}),job.Version.ToString());await f.Db.SaveChangesAsync();Assert.Equal("Ready",row.Status);
        await f.Service.CommitImport(f.User,job.Id,job.Version.ToString(),new(),"corrected","trace");await f.Db.SaveChangesAsync();var tx=await f.Db.Transactions.SingleAsync(x=>x.UserId==f.User);Assert.Equal("修正商品",tx.ProductName);Assert.Equal(974.5m,await f.Service.Balance(f.User,a.Id));
    }
}
