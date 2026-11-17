using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public sealed partial class PayrollCenterTests
{
    private sealed class Factory(string connection, PersonalFinance.Api.Application.Ai.IAiProvider? provider=null):WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder builder) {
            var folder=Path.Combine(Path.GetTempPath(),"pf-payroll-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);builder.UseContentRoot(folder).UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('P',64),["DataProtection:KeyPath"]=Path.Combine(folder,".keys")}));
            builder.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();if(provider!=null){s.RemoveAll<PersonalFinance.Api.Application.Ai.IAiProvider>();s.AddSingleton(provider);}s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('P',64))));});
        }
    }
    private sealed class TestCase: IAsyncDisposable {
        public required FinanceDb Db; public required Factory Factory; public required HttpClient Client;public required HttpClient Other; public required string UserId;public required string Email;public required string Password;
        public static async Task<TestCase> Create(PersonalFinance.Api.Application.Ai.IAiProvider? provider=null) {
            var connection=IsolatedSqlTestDatabase.ConnectionString();var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
            var password="Payroll-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@payroll.test",DisplayName="Payroll test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
            var a=User();var b=User();await db.SaveChangesAsync();var factory=new Factory(connection,provider);var client=factory.CreateClient();var other=factory.CreateClient();
            foreach(var pair in new[]{(client,a),(other,b)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
            return new(){Db=db,Factory=factory,Client=client,Other=other,UserId=a.Id,Email=a.Email,Password=password};
        }
        public async ValueTask DisposeAsync(){Client.Dispose();Other.Dispose();Factory.Dispose();await Db.DisposeAsync();}
    }
    private static async Task<JsonElement> Data(HttpResponseMessage response){var body=await response.Content.ReadAsStringAsync();Assert.True(response.IsSuccessStatusCode,$"HTTP {(int)response.StatusCode}: {body}");return JsonDocument.Parse(body).RootElement.GetProperty("data").Clone();}
    private static async Task<HttpResponseMessage> Write(HttpClient c,string path,object body,string? version=null,bool put=false,string? key=null){var req=new HttpRequestMessage(put?HttpMethod.Put:HttpMethod.Post,"/api/payroll-center"+path){Content=JsonContent.Create(body)};req.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());if(version!=null)req.Headers.TryAddWithoutValidation("If-Match",version);return await c.SendAsync(req);}
    private static async Task<JsonElement> Get(HttpClient c,string path)=>await Data(await c.GetAsync("/api/payroll-center"+path));
    private static string Id(JsonElement d)=>d.GetProperty("id").GetString()!;
    private static PayItem Item(string name="Base",string amount="10000",string category="Base",string kind="Earning",string tax="Taxable")=>new(name,category,kind,category,amount,tax);
    private static async Task<(string employer,string employment)> Employment(TestCase f) {
        var company=await Data(await Write(f.Client,"/employers",new EmployerSave("Employer "+Guid.NewGuid().ToString("N"),City:"Shanghai")));
        var job=await Data(await Write(f.Client,"/employments",new EmploymentSave(Id(company),"Shanghai",new(2026,1,1),null,"Engineer","Product","E1","Monthly",25,null,"Shanghai","Shanghai")));return(Id(company),Id(job));
    }
    private static async Task<string> Rule(TestCase f) {var template=await Get(f.Client,"/tax-template");return Id(await Data(await Write(f.Client,"/tax-rules",template)));}
    private static async Task<string> Policy(TestCase f)=>Id(await Data(await Write(f.Client,"/policies",new InsurancePolicySave("Test policy","Shanghai",2026,new(2026,1,1),new(2026,12,31),Guid.NewGuid().ToString(),"Isolated test evidence",true,[new("Pension","5000","20000","0.08","0.16"),new("Medical","5000","20000","0.02","0.10"),new("Unemployment","5000","20000","0.005","0.005"),new("WorkInjury","5000","20000","0","0.002"),new("Maternity","5000","20000","0","0",true,"Medical"),new("HousingFund","5000","20000","0.07","0.07")]))));
    private static async Task<HttpResponseMessage> Delete(HttpClient client, string resource, string id, string? version = "1", string? key = null) {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/payroll-center/{resource}/{id}");
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        if(version != null) request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }
    [ProfileSqlFact] public async Task PayrollDeductionsSyncWithoutCashAndDeletionStaysExcluded() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);
        var body=new SlipSave("2026-09",new(2026,10,15),"Employer","CNY",[Item(),Item("Pension","800","Pension","Deduction"),Item("Medical","200","Medical","Deduction"),Item("Tax","50","Tax","Deduction")],job);
        var slip=await Data(await Write(f.Client,"/slips",body));var id=Id(slip);
        var rows=(await Get(f.Client,"/contributions")).GetProperty("items");Assert.Equal(2,rows.GetArrayLength());
        Assert.All(rows.EnumerateArray(),x=>{Assert.Equal("Pending",x.GetProperty("state").GetString());Assert.Equal("0.00",x.GetProperty("employerAmount").GetString());});
        await Data(await Write(f.Client,"/contributions/sync",new{}));
        Assert.Equal(2,(await Get(f.Client,"/contributions")).GetProperty("total").GetInt32());
        var pension=rows.EnumerateArray().Single(x=>x.GetProperty("kind").GetString()=="Pension");var cid=Id(pension);
        Assert.Equal(HttpStatusCode.NotFound,(await Delete(f.Other,"contributions",cid)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Delete(f.Client,"contributions",cid,"9")).StatusCode);
        await Data(await Delete(f.Client,"contributions",cid));
        await Data(await Write(f.Client,"/contributions/sync",new{}));
        Assert.Equal(1,(await Get(f.Client,"/contributions")).GetProperty("total").GetInt32());
        await Data(await Write(f.Client,"/slips/"+id,body with {Items=[Item(),Item("Pension","900","Pension","Deduction"),Item("Medical","220","Medical","Deduction")]},"1",true));
        rows=(await Get(f.Client,"/contributions")).GetProperty("items");Assert.Single(rows.EnumerateArray());Assert.Equal("220.00",rows[0].GetProperty("personalAmount").GetString());
        await Data(await Delete(f.Client,"slips",id,"2"));
        Assert.Equal(0,(await Get(f.Client,"/contributions")).GetProperty("total").GetInt32());
        Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
    }
    [ProfileSqlFact] public async Task SyncBackfillsOldSlipsAndPreservesManualReview() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);
        var slip=await Data(await Write(f.Client,"/slips",new SlipSave("2026-09",new(2026,10,15),"Employer","CNY",[Item(),Item("Pension","800","Pension","Deduction")],job)));var id=Id(slip);
        f.Db.RemoveRange(await f.Db.Set<SocialContributionRecord>().Where(x=>x.UserId==f.UserId).ToArrayAsync());await f.Db.SaveChangesAsync();
        await Data(await Write(f.Client,"/contributions/sync",new{}));
        var row=(await Get(f.Client,"/contributions")).GetProperty("items")[0];
        await Data(await Write(f.Client,"/contributions/"+Id(row),new ContributionSave("2026-09",new(2026,10,15),"Shanghai","Pension","CNY","10000","800","1600","Confirmed",job,PayrollId:id,SourceEvidence:"Checked statement"),"1",true));
        await Data(await Write(f.Client,"/contributions/sync",new{}));
        row=(await Get(f.Client,"/contributions")).GetProperty("items")[0];Assert.Equal("Confirmed",row.GetProperty("state").GetString());Assert.Equal("1600.00",row.GetProperty("employerAmount").GetString());
        Assert.Equal(0,(await Get(f.Other,"/contributions")).GetProperty("total").GetInt32());
    }
    [ProfileSqlFact] public async Task DeletesPayslipAndPlanWithOwnershipVersionsAndDependentCleanup() {
        await using var f = await TestCase.Create(); var (_, job) = await Employment(f);
        var plan = await Data(await Write(f.Client,"/plans",new PlanSave(job,"Delete test","Monthly","CNY",new(2026,1,1),null,[Item()])));
        var revision = await Data(await Write(f.Client,"/plans",new PlanSave(job,"Keep revision","Monthly","CNY",new(2026,1,1),null,[Item()],Id(plan))));
        var slip = await Data(await Write(f.Client,"/slips/generate",new SlipGenerate(Id(plan),"2026-09",new(2026,10,25)))); var id=Id(slip);
        var otherSlip = await Data(await Write(f.Client,"/slips",new SlipSave("2026-08",new(2026,9,25),"Keep","CNY",[Item()],job)));
        await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("confirm"),"1"));
        var document = new StoredDocument{UserId=f.UserId,PayrollId=id,Kind="PayrollAttachment",Name="test.txt",ContentType="text/plain",Content=[1,2,3]}; f.Db.Add(document);await f.Db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Delete(f.Client,"plans",Id(plan))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Delete(f.Other,"slips",id,"2")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Delete(f.Other,"plans",Id(plan))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Delete(f.Client,"slips",id,null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Delete(f.Client,"slips",id,"1")).StatusCode);
        var key=Guid.NewGuid().ToString();var deleted=await Data(await Delete(f.Client,"slips",id,"2",key));Assert.Equal("0.00",deleted.GetProperty("cashImpact").GetString());
        Assert.Equal(deleted.GetRawText(),(await Data(await Delete(f.Client,"slips",id,"2",key))).GetRawText());
        Assert.Equal(HttpStatusCode.NotFound,(await f.Client.GetAsync($"/api/payroll-center/slips/{id}")).StatusCode);
        Assert.False(await f.Db.Set<PayrollComponent>().AnyAsync(x=>x.PayrollId==id));Assert.False(await f.Db.Set<PayrollRevision>().AnyAsync(x=>x.PayrollId==id));Assert.False(await f.Db.Documents.AnyAsync(x=>x.Id==document.Id));
        Assert.Equal(Id(otherSlip),Id(await Get(f.Client,"/slips/"+Id(otherSlip))));
        await Data(await Delete(f.Client,"plans",Id(plan)));Assert.Equal(1,(await Get(f.Client,"/plans")).GetArrayLength());Assert.Equal(Id(revision),Id((await Get(f.Client,"/plans"))[0]));
        Assert.Equal(HttpStatusCode.NotFound,(await Write(f.Client,"/slips/generate",new SlipGenerate(Id(plan),"2026-10",new(2026,10,25)))).StatusCode);
        Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
    }
    [ProfileSqlFact] public async Task PayslipDeletionBlocksLinkedReceiptsAndContributionsAndRetainsBankTransaction() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);
        var slip=await Data(await Write(f.Client,"/slips",new SlipSave("2026-09",new(2026,10,15),"Employer","CNY",[Item(amount:"100")],job)));var id=Id(slip);
        var account=new Account{UserId=f.UserId,Name="Keep bank",Type="Bank",Currency="CNY"};var category=new Category{UserId=f.UserId,Name="Salary",Kind="Income"};f.Db.AddRange(account,category);await f.Db.SaveChangesAsync();
        var income=new FinanceTransaction{UserId=f.UserId,AccountId=account.Id,CategoryId=category.Id,Type="Income",Amount=100,Currency="CNY",OccurredAt=new(2026,10,15,9,0,0,TimeSpan.FromHours(8))};f.Db.Add(income);await f.Db.SaveChangesAsync();
        await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("confirm"),"1"));
        await Data(await Write(f.Client,$"/slips/{id}/reconcile",new PayrollMatch(income.Id),"2"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Delete(f.Client,"slips",id,"3")).StatusCode);
        await Data(await Write(f.Client,$"/slips/{id}/unlink",new PayrollReconcileInput(income.Id),"3"));
        var contribution=new SocialContributionRecord{UserId=f.UserId,PayrollId=id,Month="2026-09",PaidDate=new(2026,10,15),Region="Shanghai",State="Cancelled"};f.Db.Add(contribution);await f.Db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Delete(f.Client,"slips",id,"4")).StatusCode);
        contribution.PayrollId=null;await f.Db.SaveChangesAsync();
        await Data(await Delete(f.Client,"slips",id,"4"));
        Assert.Equal(100m,(await f.Db.Transactions.AsNoTracking().SingleAsync(x=>x.Id==income.Id)).Amount);
        Assert.True(await f.Db.Set<SocialContributionRecord>().AnyAsync(x=>x.Id==contribution.Id));
    }

    [ProfileSqlFact] public async Task ReusesPayrollTablesSupportsParallelJobsPlansHistoryAndReviewedCorrections() {
        await using var f=await TestCase.Create();var(company,job)=await Employment(f);
        var overlap=await Data(await Write(f.Client,"/employments",new EmploymentSave(company,"Remote",new(2026,1,1),null,"Consultant","","","Monthly",31,null,"Shanghai","Shanghai")));Assert.NotEqual(job,Id(overlap));
        Assert.Equal(HttpStatusCode.NotFound,(await Write(f.Other,"/employments",new EmploymentSave(company,"",new(2026,1,1),null,"","","","Monthly",25,null,"",""))).StatusCode);
        var plan=new PlanSave(job,"Hourly plan","Hourly","CNY",new(2026,1,1),null,[Item() with {Quantity="160",UnitRate="50",Amount="0"}]);var saved=await Data(await Write(f.Client,"/plans",plan));
        var rev=await Data(await Write(f.Client,"/plans",plan with {PreviousId=Id(saved),Name="New hourly plan",Items=[Item() with {Quantity="160",UnitRate="60",Amount="0"}]}));Assert.Equal(2,rev.GetProperty("revision").GetInt32());
        var generated=await Data(await Write(f.Client,"/slips/generate",new SlipGenerate(Id(saved),"2026-09",new(2026,10,25))));Assert.Equal("8000.00",generated.GetProperty("gross").GetString());var id=Id(generated);
        Assert.Equal(HttpStatusCode.NotFound,(await f.Other.GetAsync("/api/payroll-center/slips/"+id)).StatusCode);
        Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
        await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("review"),"1"));await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("confirm"),"2"));
        var body=new SlipSave("2026-09",new(2026,10,25),"Test","CNY",[Item(amount:"9000")],job);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/slips/"+id,body,"3",true)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(f.Client,"/slips/"+id,body with{CorrectionReason="test correction"},"1",true)).StatusCode);
        await Data(await Write(f.Client,"/slips/"+id,body with{CorrectionReason="Correct recorded pay"},"3",true));var detail=await Get(f.Client,"/slips/"+id);Assert.Equal("Draft",detail.GetProperty("state").GetString());Assert.Equal("9000.00",detail.GetProperty("net").GetString());
        var history=await Get(f.Client,$"/slips/{id}/history");Assert.Equal(3,history.GetArrayLength());Assert.Equal("8000.00",history[0].GetProperty("snapshot").GetProperty("net").GetString());
        Assert.True(await f.Db.AuditRecords.AnyAsync(x=>x.UserId==f.UserId && x.ResourceId==id));Assert.Equal(1,await f.Db.Set<PayrollStatement>().CountAsync(x=>x.UserId==f.UserId));
        var copied=await Data(await Write(f.Client,$"/slips/{id}/copy",new{month="2026-10",payDate="2026-11-25"}));Assert.NotEqual(id,Id(copied));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("void"),"4")).StatusCode);
    }
    [ProfileSqlFact] public async Task PolicyBoundsSeparateEmployerCashAndPreventFundDoubleCounting() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);var policy=await Policy(f);
        var contribution=new ContributionSave("2026-10",new(2026,10,16),"Shanghai","Pension","CNY","30000","1600","3200","Confirmed",job,policy,SourceEvidence:"test statement");
        var saved=await Data(await Write(f.Client,"/contributions",contribution));Assert.Equal("1600.00",saved.GetProperty("expectedPersonal").GetString());Assert.Equal("3200.00",saved.GetProperty("expectedEmployer").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/contributions",contribution with {Kind="Maternity"})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(f.Other,"/contributions",contribution)).StatusCode);
        var fund=await Data(await Write(f.Client,"/fund-accounts",new FundAccountSave("Fund","Shanghai","CNY","12345.67",new(2026,10,10),"ManualStatement","Statement reference",job)));
        await Data(await Write(f.Client,"/fund-events",new FundEventSave(Id(fund),"Deposit","2026-10",new(2026,10,31),"1400","CNY","Expected","Expected only")));
        var accounts=await Get(f.Client,"/fund-accounts");Assert.Equal("12345.67",accounts[0].GetProperty("reportedBalance").GetString());Assert.Equal("0.00",accounts[0].GetProperty("netWorthAddition").GetString());Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));Assert.Equal(0,await f.Db.Accounts.CountAsync(x=>x.UserId==f.UserId));
        var stats=await Get(f.Client,"/statistics?year=2026&currency=CNY");Assert.Equal("1600.00",stats.GetProperty("benefits").GetProperty("socialPersonal").GetString());Assert.Equal("3200.00",stats.GetProperty("benefits").GetProperty("socialEmployer").GetString());
    }
    [ProfileSqlFact] public async Task VersionedTaxRulesCheckDeductionClaimsAndRetainSimulationEvidence() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);var rule=await Rule(f);
        var input=new TaxSimulation(job,rule,"2026-10",10,"100000","0","15000","0","0","500","550");
        var calculation=await Data(await Write(f.Client,"/tax-simulations",input));var result=calculation.GetProperty("result");Assert.Equal("35000.00",result.GetProperty("taxableBasis").GetString());Assert.Equal("550.00",result.GetProperty("currentWithholding").GetString());
        var claim=new DeclarationSave(job,rule,"ChildEducation",2026,1,12,"2000",JsonSerializer.SerializeToElement(new {qualifies=false,units=1,share=1}),"","Pending");var pending=await Data(await Write(f.Client,"/declarations",claim));Assert.Equal("0.00",pending.GetProperty("approvedAmount").GetString());
        var unchanged=await Data(await Write(f.Client,"/tax-simulations",input));Assert.Equal("550.00",unchanged.GetProperty("result").GetProperty("currentWithholding").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/declarations",claim with{Status="Reviewed"})).StatusCode);
        var reviewed=claim with{ClaimedAmount="1000",Status="Reviewed",Evidence="Qualification and allocation checked",Eligibility=JsonSerializer.SerializeToElement(new {qualifies=true,units=1,share=0.5})};await Data(await Write(f.Client,"/declarations/"+Id(pending),reviewed,"1",true));
        var reduced=await Data(await Write(f.Client,"/tax-simulations",input));Assert.Equal("10000.00",reduced.GetProperty("result").GetProperty("additionalDeduction").GetString());Assert.Equal("250.00",reduced.GetProperty("result").GetProperty("currentWithholding").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/declarations",reviewed with{ClaimedAmount="2001"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/tax-simulations",input with{Resident=false})).StatusCode);Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/tax-simulations",input with{CrossBorder=true})).StatusCode);
        var bonus=await Data(await Write(f.Client,"/tax-simulations",input with{TaxableIncome="0",SpecialDeductions="0",AlreadyWithheld="0",Scenario="BonusSeparate",Bonus="42000",BonusEligible=true}));Assert.Equal("3990.00",bonus.GetProperty("result").GetProperty("bonusTax").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,"/tax-simulations",input with{Scenario="BonusSeparate",Bonus="42000",BonusEligible=false})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(f.Other,"/tax-simulations",input)).StatusCode);Assert.True((await Get(f.Client,"/tax-calculations")).GetArrayLength()>=4);
    }
    [ProfileSqlFact] public async Task ImportsPreviewThenSaveDraftsAndRejectDuplicatesAndInvalidNet() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);
        async Task<JsonElement> Upload(string name){using var form=new MultipartFormDataContent();form.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes("month,date,gross,base,tax,net\n2026-10,2026-10-25,10000,10000,150,9850\n")),"file",name);return await Data(await f.Client.PostAsync("/api/payroll-center/imports",form));}
        var uploaded=await Upload("payroll.csv");var id=Id(uploaded);var mapping=new Dictionary<string,string>{{"month","month"},{"payDate","date"},{"gross","gross"},{"base","base"},{"tax","tax"},{"net","net"}};
        var preview=await Data(await Write(f.Client,$"/imports/{id}/preview",new PayrollImportPreview(job,"CNY",mapping),"1"));Assert.Equal(1,preview.GetProperty("valid").GetInt32());Assert.Equal(0,await f.Db.Set<PayrollStatement>().CountAsync(x=>x.UserId==f.UserId));
        var key=Guid.NewGuid().ToString();var commit=await Data(await Write(f.Client,$"/imports/{id}/commit",new PayrollImportCommit(),"2",key:key));var replay=await Data(await Write(f.Client,$"/imports/{id}/commit",new PayrollImportCommit(),"2",key:key));Assert.Equal(commit.GetRawText(),replay.GetRawText());Assert.Equal(1,await f.Db.Set<PayrollStatement>().CountAsync(x=>x.UserId==f.UserId));Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
        var slip=await f.Db.Set<PayrollStatement>().SingleAsync(x=>x.UserId==f.UserId);Assert.Equal("Draft",slip.State);
        var duplicate=await Upload("renamed.csv");var duplicatePreview=await Data(await Write(f.Client,$"/imports/{Id(duplicate)}/preview",new PayrollImportPreview(job,"CNY",mapping),"1"));Assert.Equal(0,duplicatePreview.GetProperty("valid").GetInt32());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,$"/imports/{Id(duplicate)}/commit",new PayrollImportCommit(),"2")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await f.Other.GetAsync($"/api/payroll-center/imports/{id}")).StatusCode);
        var document=(await Get(f.Client,$"/imports/{id}")).GetProperty("documentId").GetString();Assert.Equal(HttpStatusCode.NotFound,(await f.Other.GetAsync($"/api/payroll-center/documents/{document}")).StatusCode);
    }

    [ProfileSqlFact] public async Task BankInstallmentsCannotDoublePostAndBothReportingMonthBasesAreExplicit() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);var saved=await Data(await Write(f.Client,"/slips",new SlipSave("2026-09",new(2026,10,15),"Employer","CNY",[Item(amount:"10000")],job)));var id=Id(saved);
        await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("confirm"),"1"));
        var account=new Account{UserId=f.UserId,Name="Test bank",Type="Bank",Currency="CNY"};f.Db.Add(account);var category=new Category{UserId=f.UserId,Name="Salary",Kind="Income"};f.Db.Add(category);await f.Db.SaveChangesAsync();
        FinanceTransaction Income(decimal amount,DateTimeOffset date){var x=new FinanceTransaction{UserId=f.UserId,AccountId=account.Id,CategoryId=category.Id,Type="Income",Amount=amount,Currency="CNY",OccurredAt=date,Merchant="Employer"};x.Entries.Add(new(){UserId=f.UserId,AccountId=account.Id,Kind="Account",Amount=amount,BaseAmount=amount});x.Entries.Add(new(){UserId=f.UserId,CategoryId=category.Id,Kind="Income",Amount=-amount,BaseAmount=-amount});f.Db.Add(x);return x;}
        var first=Income(6000,new(2026,10,15,9,0,0,TimeSpan.FromHours(8)));var second=Income(4000,new(2026,10,16,9,0,0,TimeSpan.FromHours(8)));var late=Income(10,new(2026,1,1,9,0,0,TimeSpan.FromHours(8)));await f.Db.SaveChangesAsync();
        var candidates=await Get(f.Client,$"/slips/{id}/matches");Assert.True(candidates.GetProperty("items").GetArrayLength()>=2);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,$"/slips/{id}/reconcile",new PayrollMatch(late.Id),"2")).StatusCode);
        await Data(await Write(f.Client,$"/slips/{id}/reconcile",new PayrollMatch(first.Id),"2"));Assert.Equal("Paid",(await Get(f.Client,"/slips/"+id)).GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,$"/slips/{id}/reconcile",new PayrollMatch(first.Id),"3")).StatusCode);
        await Data(await Write(f.Client,$"/slips/{id}/reconcile",new PayrollMatch(second.Id),"3"));var detail=await Get(f.Client,"/slips/"+id);Assert.Equal("Reconciled",detail.GetProperty("state").GetString());Assert.Equal("10000.00",detail.GetProperty("actual").GetString());
        Assert.Equal(3,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));Assert.Equal(6000m,(await f.Db.Transactions.AsNoTracking().SingleAsync(x=>x.Id==first.Id)).Amount);
        var earned=await Get(f.Client,"/statistics?year=2026&currency=CNY&basis=Earned");var paid=await Get(f.Client,"/statistics?year=2026&currency=CNY&basis=Paid");Assert.Equal("10000.00",earned.GetProperty("months")[8].GetProperty("totals").GetProperty("gross").GetString());Assert.Equal("10000.00",paid.GetProperty("months")[9].GetProperty("totals").GetProperty("gross").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("void","test"),"4")).StatusCode);
        await Data(await Write(f.Client,$"/slips/{id}/unlink",new PayrollReconcileInput(first.Id),"4"));Assert.Equal("Paid",(await Get(f.Client,"/slips/"+id)).GetProperty("state").GetString());Assert.Equal(3,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
    }
    [ProfileSqlFact] public async Task WageScenarioUsesVersionedCityRatesAndKeepsRecordedPayrollUnchanged() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);var rule=await Rule(f);var policy=await Policy(f);
        var saved=await Data(await Write(f.Client,"/slips",new SlipSave("2026-10",new(2026,10,15),"Employer","CNY",[Item(amount:"10000"),Item("Pension","800","Pension","Deduction","NotApplicable")],job)));var id=Id(saved);await Data(await Write(f.Client,$"/slips/{id}/actions",new SlipAction("confirm"),"1"));
        var result=await Data(await Write(f.Client,"/wage-scenarios",new PayrollWageScenario(id,rule,policy,"1000","8000")));Assert.Equal("11000.00",result.GetProperty("simulatedGross").GetString());Assert.Equal("1400.00",result.GetProperty("simulatedPersonalContribution").GetString());Assert.Equal("9200.00",(await Get(f.Client,"/slips/"+id)).GetProperty("net").GetString());Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
        var evidence=await Get(f.Client,"/tax-calculations");Assert.True(evidence[0].GetProperty("result").TryGetProperty("wageScenario",out _));
    }


    [ProfileSqlFact] public async Task PrepareBrowserFixtureWhenExplicitlyRequested() {
        var output=Environment.GetEnvironmentVariable("PF_PAYROLL_UI_SEED_OUTPUT");if(string.IsNullOrWhiteSpace(output))return;
        await using var f=await TestCase.Create();var(company,job)=await Employment(f);var rule=await Rule(f);var policy=await Policy(f);
        await Data(await Write(f.Client,"/employers/"+company,new EmployerSave("示例科技 · 演示账本",City:"上海"),"1",true));
        var plan=await Data(await Write(f.Client,"/plans",new PlanSave(job,"工程师月薪方案","Monthly","CNY",new(2026,1,1),null,[Item("基本工资","13000"),Item("岗位津贴","1000","Allowance")])));
        var slips=new List<string>();
        foreach(var month in new[]{"2026-07","2026-08","2026-09"}) {
            var items=new[]{Item("基本工资","13000"),Item("绩效工资",month.EndsWith("09")?"1000":"2000","Performance"),Item("岗位津贴","1000","Allowance"),Item("养老保险","1000","Pension","Deduction","NotApplicable"),Item("医疗保险","250","Medical","Deduction","NotApplicable"),Item("失业保险","50","Unemployment","Deduction","NotApplicable"),Item("住房公积金","800","HousingFund","Deduction","NotApplicable"),Item("个人所得税",month.EndsWith("09")?"500":"450","Tax","Deduction","NotApplicable")};
            var date=DateOnly.Parse(month+"-15").AddMonths(1);var saved=await Data(await Write(f.Client,"/slips",new SlipSave(month,date,"示例科技","CNY",items,job,Id(plan))));slips.Add(Id(saved));await Data(await Write(f.Client,"/slips/"+Id(saved)+"/actions",new SlipAction("confirm"),"1"));
        }
        var fund=await Data(await Write(f.Client,"/fund-accounts",new FundAccountSave("上海公积金 · 示例","上海","CNY","38650.25",new(2026,10,16),"ManualStatement","合成演示账户记录，非真实个人数据",job)));
        await Data(await Write(f.Client,"/contributions",new ContributionSave("2026-09",new(2026,10,15),"Shanghai","Pension","CNY","12500","1000","2000","Confirmed",job,policy,SourceEvidence:"合成示例")));
        await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{email=f.Email,password=f.Password,employmentId=job,planId=Id(plan),ruleId=rule,policyId=policy,fundId=Id(fund),slipId=slips.Last(),database=f.Db.Database.GetDbConnection().Database},FinanceService.Json));
    }

    [Fact] public void PayrollAiEvidenceRequiresConsentAndKeepsSafeAmountsAndRuleVersions() {
        var spec=PersonalFinance.Api.Application.Ai.AiFinancialTools.Registry.Single(x=>x.Name=="GetPayrollCenterSummary");
        var privacy=new AiPrivacySetting{Enabled=true,AllowPayroll=false};Assert.False(PersonalFinance.Api.Application.Ai.AiFinancialTools.Authorized(spec,privacy));privacy.AllowPayroll=true;Assert.True(PersonalFinance.Api.Application.Ai.AiFinancialTools.Authorized(spec,privacy));
        var node=JsonNode.Parse("""{"annualBonus":"20000.00","personalSocial":"2000.00","mom":"-7.81","ruleVersion":"CN-2026","category":"Base","employerName":"private","password":"secret"}""");var truncated=false;
        var safe=PersonalFinance.Api.Application.Ai.AiFinancialTools.Sanitize(node,100,ref truncated)!;Assert.Equal("20000.00",safe["annualBonus"]!.GetValue<string>());Assert.Equal("2000.00",safe["personalSocial"]!.GetValue<string>());Assert.Equal("CN-2026",safe["ruleVersion"]!.GetValue<string>());Assert.Null(safe["employerName"]);Assert.Null(safe["password"]);
    }
    [ProfileSqlFact] public async Task ExcelAndInvalidNetImportsAreValidatedBeforeAnySlipIsWritten() {
        await using var f=await TestCase.Create();var(_,job)=await Employment(f);using var book=new ClosedXML.Excel.XLWorkbook();var sheet=book.AddWorksheet("Payroll");var headers=new[]{"month","date","gross","base","net"};for(var i=0;i<headers.Length;i++)sheet.Cell(1,i+1).Value=headers[i];var row=new[]{"2026-10","2026-10-25","10000","10000","9999"};for(var i=0;i<row.Length;i++)sheet.Cell(2,i+1).Value=row[i];using var bytes=new MemoryStream();book.SaveAs(bytes);using var form=new MultipartFormDataContent();form.Add(new ByteArrayContent(bytes.ToArray()),"file","payroll.xlsx");var upload=await Data(await f.Client.PostAsync("/api/payroll-center/imports",form));var id=Id(upload);
        var mapping=new Dictionary<string,string>{{"month","month"},{"payDate","date"},{"gross","gross"},{"base","base"},{"net","net"}};var result=await Data(await Write(f.Client,$"/imports/{id}/preview",new PayrollImportPreview(job,"CNY",mapping),"1"));Assert.Equal(0,result.GetProperty("valid").GetInt32());Assert.Contains("实发",result.GetProperty("preview")[0].GetProperty("issues")[0].GetString());Assert.Equal(0,await f.Db.Set<PayrollStatement>().CountAsync(x=>x.UserId==f.UserId));
    }

    [ProfileSqlFact] public async Task LegacyUpgradePreservesAmountsAndCarriesOneLatestFundBalancePerAssetAccount() {
        await using var f=await TestCase.Create();var account=new Account{UserId=f.UserId,Name="Legacy fund asset",Type="Other",Currency="CNY"};f.Db.Add(account);var slip=new PayrollStatement{UserId=f.UserId,Employer="Legacy employer",Month="2026-09",PayDate=new(2026,10,15),State="Confirmed"};f.Db.Add(slip);
        var component=new PayrollComponent{UserId=f.UserId,PayrollId=slip.Id,Name="Original salary name",Kind="Earning",Amount=12345.67m,Code="",Category="",TaxTreatment="",Status="",Quantity=0};f.Db.Add(component);
        f.Db.Add(new SocialContributionRecord{UserId=f.UserId,Kind="HousingFund",Month="2026-08",PaidDate=new(2026,9,15),Region="Shanghai",AccountId=account.Id,ReportedBalance=20000,BalanceSource="ManualStatement",State="Confirmed",PaymentStatus=""});
        f.Db.Add(new SocialContributionRecord{UserId=f.UserId,Kind="HousingFund",Month="2026-09",PaidDate=new(2026,10,15),Region="Shanghai",AccountId=account.Id,ReportedBalance=22000,BalanceSource="ManualStatement",State="Confirmed",PaymentStatus=""});await f.Db.SaveChangesAsync();
        var sql=new PersonalFinance.Api.Infrastructure.Migrations.PayrollLegacyAttributes().UpOperations.OfType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>().Single().Sql;
        await f.Db.Database.ExecuteSqlRawAsync(sql);await f.Db.Database.ExecuteSqlRawAsync(sql);f.Db.ChangeTracker.Clear();
        var item=await f.Db.Set<PayrollComponent>().SingleAsync(x=>x.Id==component.Id);Assert.Equal(12345.67m,item.Amount);Assert.Equal("Unspecified",item.TaxTreatment);Assert.Equal("Legacy",item.Code);Assert.Equal("Active",item.Status);Assert.Equal(1m,item.Quantity);
        var fund=await f.Db.Set<HousingFundAccount>().SingleAsync(x=>x.UserId==f.UserId);Assert.Equal(22000m,fund.ReportedBalance);Assert.Equal(account.Id,fund.AccountId);Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));Assert.Equal(1,await f.Db.Accounts.CountAsync(x=>x.UserId==f.UserId));
        var detail=await Get(f.Client,"/slips/"+slip.Id);Assert.True(detail.GetProperty("taxUnspecified").GetBoolean());Assert.Equal("12345.67",detail.GetProperty("net").GetString());
    }

    [Theory][InlineData("36000","1080")][InlineData("36000.01","1080")][InlineData("144000","11880")][InlineData("300000","43080")][InlineData("960000","250080")]
    public void TaxBandsRemainContinuousAtBoundaries(string basis,string expected){using var stream=typeof(FinanceService).Assembly.GetManifestResourceStream("PersonalFinance.Api.Infrastructure.PayrollTaxTemplate.json")!;var template=JsonSerializer.Deserialize<TaxRuleSave>(stream,FinanceService.Json)!;PayrollTaxMath.Validate(template.Rules);Assert.Equal(decimal.Parse(expected),PayrollTaxMath.Tax(decimal.Parse(basis),template.Rules.AnnualBrackets));}
}
