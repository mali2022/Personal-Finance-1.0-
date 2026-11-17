using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Application.Ai;
using System.Text.Json.Nodes;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class FuelTests
{
    static FuelRecord Fill(decimal? km,decimal litres,bool full=true,bool missed=false,string vehicle="car",int day=1)=>new(){VehicleId=vehicle,Date=new(2026,1,day),Odometer=km,Litres=litres,FullTank=full,TankStatus=full?"Full":"Partial",MissedFill=missed};
    [Fact]public void FullTankBaselineExcludesStartingFillAndIncludesPartials(){
        var result=FuelMath.Intervals([Fill(1000,40),Fill(1200,20,false),Fill(1500,30)]);
        var r=Assert.Single(result);Assert.Equal(500,r.Distance);Assert.Equal(50,r.Litres);Assert.Equal(10,r.LitresPer100Km);
    }
    [Fact]public void MissingFillResetsBaselineAndVehiclesNeverMix(){
        var rows=new[]{Fill(1000,40),Fill(1300,20,false,true),Fill(1500,25),Fill(2000,40),Fill(0,40,vehicle:"other"),Fill(1000,50,vehicle:"other")};
        var result=FuelMath.Intervals(rows);Assert.Equal(2,result.Length);Assert.Equal(8,result[0].LitresPer100Km);Assert.Equal(5,result[1].LitresPer100Km);
    }
    [Fact]public void OpenIntervalsAndNonPositiveDistanceNeverInventConsumption(){
        Assert.Empty(FuelMath.Intervals([Fill(100,20,false),Fill(200,10,false)]));
        Assert.Empty(FuelMath.Intervals([Fill(100,20),Fill(100,10)]));
        Assert.Empty(FuelMath.Intervals([Fill(100,20),Fill(200,10,false)]));
    }
    [Fact]public void UnknownOdometerResetsBaselineAndKnownFullTanksResumeCalculation(){
        var rows=new[]{Fill(1000,40,day:1),Fill(null,20,day:2),Fill(1500,30,day:3),Fill(2000,40,day:4)};
        var result=Assert.Single(FuelMath.Intervals(rows));Assert.Equal(500,result.Distance);Assert.Equal(40,result.Litres);Assert.Equal(8,result.LitresPer100Km);
    }
    [Fact]public void MissingReadingNeverBecomesZeroAndSameDayOrderingIsNotInvented(){
        Assert.Empty(FuelMath.Intervals([Fill(null,40,day:1),Fill(500,30,day:2)]));
        Assert.Empty(FuelMath.Intervals([Fill(1000,40,day:1),Fill(null,10,day:2),Fill(1500,30,day:2),Fill(2000,40,day:3)]));
        var zero=Assert.Single(FuelMath.Intervals([Fill(0,40,day:1),Fill(500,25,day:2)]));Assert.Equal(5,zero.LitresPer100Km);
    }
    [Theory]
    [InlineData(200,8,25)]
    [InlineData(200,8.63,23.175)]
    [InlineData(300,7.36,40.761)]
    [InlineData(0.01,6.4,0.002)]
    public void PriceQuantityUsesThreeDecimalHalfUpRounding(decimal amount,decimal price,decimal expected)=>Assert.Equal(expected,FuelMath.LitresFromPrice(amount,price));
    sealed class FuelProvider:IAiProvider {
        public string Sent="";public bool Fail;public Func<Task>? BeforeReturn;public void EnsureAvailable(){}
        public async Task<DeepSeekCompletion> Complete(string user,JsonArray messages,JsonArray? tools,string feature,CancellationToken ct,bool json=false,bool reasoning=false,Func<string,Task>? onDelta=null){Sent=messages.ToJsonString();if(Fail)throw new ApiException(503,"Test provider unavailable");if(BeforeReturn!=null)await BeforeReturn();return new(new JsonObject{["content"]="Test explanation based on supplied fuel count."},null);}
    }
    sealed class Factory(string connection,FuelProvider? provider=null):WebApplicationFactory<Program>{
        protected override void ConfigureWebHost(IWebHostBuilder b){b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('F',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-fuel-test-keys")}));b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();if(provider!=null){s.RemoveAll<IAiProvider>();s.AddSingleton<IAiProvider>(provider);}s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('F',64))));});}
    }
    static async Task<JsonElement> Data(HttpResponseMessage r){var raw=await r.Content.ReadAsStringAsync();Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {raw}");return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();}
    static Task<HttpResponseMessage> Write(HttpClient c,string path,object body,string? version=null,string? key=null,bool edit=false){var r=new HttpRequestMessage(edit?HttpMethod.Put:HttpMethod.Post,"/api/fuel"+path){Content=JsonContent.Create(body)};r.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());if(version!=null)r.Headers.TryAddWithoutValidation("If-Match",version);return c.SendAsync(r);}
    [ProfileSqlFact]public async Task IsolatedLifecycleChecksOwnershipVersionCurrencyBaselineAndNeverPostsFunds(){
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Fuel-Test-"+Guid.NewGuid().ToString("N");AppUser NewUser(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@fuel.test",DisplayName="Fuel test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var user=NewUser();var other=NewUser();await db.SaveChangesAsync();var provider=new FuelProvider();using var factory=new Factory(connection,provider);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        var beforeTransactions=await db.Transactions.CountAsync(x => x.UserId == user.Id);var beforeEntries=await db.Entries.CountAsync(x => x.UserId == user.Id);
        var car=(await Data(await Write(client,"/vehicles",new FuelVehicleInput("Car","Test","Petrol")))).GetProperty("id").GetString()!;
        FuelRecordInput Input(int day,decimal? km,decimal litres,bool full,string currency="CNY")=>new(car,new(2026,1,day),km,litres,litres*7,currency,full,false,"Station","Note",TankStatus:full?"Full":"Partial");
        await Data(await Write(client,"/records",Input(1,1000,40,true)));
        var partial=Input(5,1200,20,false);var key=Guid.NewGuid().ToString();var partialId=(await Data(await Write(client,"/records",partial,key:key))).GetProperty("id").GetString();
        await Data(await Write(client,"/records",partial,key:key));Assert.Equal(2,await db.Set<FuelRecord>().CountAsync(x => x.UserId == user.Id));
        var final=(await Data(await Write(client,"/records",Input(10,1500,30,true,"USD")))).GetProperty("id").GetString();
        var report=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-10&to=2026-01-31&currency=CNY"));
        Assert.Equal(10,report.GetProperty("summary").GetProperty("litresPer100Km").GetDecimal());Assert.Equal(0,report.GetProperty("summary").GetProperty("amount").GetDecimal());Assert.Equal(1,report.GetProperty("summary").GetProperty("otherCurrencyCount").GetInt32());
        Assert.Equal("1.0",report.GetProperty("quality").GetProperty("ruleVersion").GetString());
        Assert.All(report.GetProperty("quality").GetProperty("issues").EnumerateArray(),issue=>Assert.Equal(final,issue.GetProperty("recordId").GetString()));
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/records",Input(12,1700,20,true))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-01&to=2026-01-31&currency=CNY")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",Input(3,1700,20,true))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",Input(12,1700,0,true))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,$"/records/{final}",Input(10,1500,30,true),"999",edit:true)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,$"/vehicles/{car}/delete",new{},"1")).StatusCode);
        await Data(await Write(client,$"/records/{partialId}/delete",new{},"1"));
        report=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-01&to=2026-01-31&currency=CNY"));Assert.Equal(6,report.GetProperty("summary").GetProperty("litresPer100Km").GetDecimal());
        var history=Input(5,null,20,true) with{HistoricalBackfill=true};
        var historicalId=(await Data(await Write(client,"/records",history))).GetProperty("id").GetString();
        await Data(await Write(client,"/records",Input(3,null,10,false) with{HistoricalBackfill=true}));
        await Data(await Write(client,"/records",Input(4,null,10,false) with{HistoricalBackfill=true}));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",Input(6,null,10,true))).StatusCode);
        var today=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",history with{Date=today})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/records",history)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",Input(8,1700,10,true))).StatusCode);
        report=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-01&to=2026-01-31&currency=CNY"));
        var historicalRow=report.GetProperty("records").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==historicalId);
        Assert.Equal(JsonValueKind.Null,historicalRow.GetProperty("odometer").ValueKind);
        Assert.Equal(5,report.GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(110,report.GetProperty("summary").GetProperty("litres").GetDecimal());
        Assert.Equal(560,report.GetProperty("summary").GetProperty("amount").GetDecimal());
        Assert.Equal(JsonValueKind.Null,report.GetProperty("summary").GetProperty("litresPer100Km").ValueKind);
        await Data(await Write(client,"/records",Input(15,1800,30,true)));
        await Data(await Write(client,"/records",Input(20,2200,40,true)));
        report=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-01&to=2026-01-31&currency=CNY"));
        Assert.Equal(2,report.GetProperty("summary").GetProperty("completedIntervals").GetInt32());
        Assert.Equal(10,report.GetProperty("summary").GetProperty("litresPer100Km").GetDecimal());
        var priced=Input(23,2400,25,true) with{Amount=200,EnteredUnitPrice=8,QuantitySource="Calculated"};
        var pricedId=(await Data(await Write(client,"/records",priced))).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",priced with{Date=new(2026,1,24),Odometer=2500,Litres=24})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",priced with{EnteredUnitPrice=0})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",priced with{QuantitySource="ReferenceSnapshot20261016",Currency="USD"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",priced with{QuantitySource="Manual"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",priced with{QuantitySource="Invalid"})).StatusCode);
        report=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-01-01&to=2026-01-31&currency=CNY"));
        var pricedRow=report.GetProperty("records").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==pricedId);
        Assert.Equal(8,pricedRow.GetProperty("enteredUnitPrice").GetDecimal());Assert.Equal("Calculated",pricedRow.GetProperty("quantitySource").GetString());Assert.Equal(25,pricedRow.GetProperty("litres").GetDecimal());
        var vehicleProfile=new FuelVehicleInput("Car","Test","Petrol",Brand:"Brand",Model:"Model",EnergyType:"Hybrid",TankCapacity:55,PurchaseDate:new(2020,1,2),PurchaseAmount:100000,PurchaseCurrency:"USD",InitialOdometer:0,CurrentOdometer:3000,AnnualDistance:12000,Status:"Archived",Note:"Profile");
        var recordCount=await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id);
        await Data(await Write(client,$"/vehicles/{car}",vehicleProfile,"1",edit:true));
        var vehicleRows=await Data(await client.GetAsync("/api/fuel/vehicles"));
        var profile=Assert.Single(vehicleRows.EnumerateArray());
        Assert.Equal("Archived",profile.GetProperty("status").GetString());Assert.Equal("USD",profile.GetProperty("purchaseCurrency").GetString());
        Assert.Equal(2400,profile.GetProperty("latestRecordedOdometer").GetDecimal());Assert.Equal(3000,profile.GetProperty("currentOdometer").GetDecimal());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records",Input(25,2600,20,true))).StatusCode);
        await Data(await Write(client,$"/records/{pricedId}",priced,pricedRow.GetProperty("version").GetString(),edit:true));
        Assert.Equal(recordCount,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        await Data(await Write(client,$"/vehicles/{car}",vehicleProfile with {Status="Active"},profile.GetProperty("version").GetString(),edit:true));
        var importRow=Input(24,2450,22,true);
        var importRequest=new FuelImportInput([importRow]);
        var importPreview=await Data(await client.PostAsJsonAsync("/api/fuel/records/import/preview",importRequest));
        Assert.Equal(1,importPreview.GetProperty("ready").GetInt32());
        Assert.Equal(recordCount,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var invalidImport=new FuelImportInput([importRow,Input(25,2399,24,true)]);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records/import/confirm",invalidImport)).StatusCode);
        Assert.Equal(recordCount,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var importKey=Guid.NewGuid().ToString();
        var imported=await Data(await Write(client,"/records/import/confirm",importRequest,key:importKey));
        Assert.Equal(1,imported.GetProperty("imported").GetInt32());
        await Data(await Write(client,"/records/import/confirm",importRequest,key:importKey));
        Assert.Equal(recordCount+1,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var repeat=await Data(await Write(client,"/records/import/confirm",importRequest));Assert.Equal(0,repeat.GetProperty("imported").GetInt32());Assert.Equal(1,repeat.GetProperty("skippedDuplicates").GetInt32());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(stranger,"/records/import/confirm",importRequest)).StatusCode);
        var strategy=new FuelStrategyInput("Detour", "CNY",40,8,7.5m,10,5,10,8);
        var preview=await Data(await client.PostAsJsonAsync("/api/fuel/strategies/preview",strategy));
        Assert.Equal(29,preview.GetProperty("netSaving").GetDecimal());
        var strategyKey=Guid.NewGuid().ToString();
        var saved=await Data(await Write(client,"/strategies",strategy,key:strategyKey));
        var strategyId=saved.GetProperty("id").GetString();
        await Data(await Write(client,"/strategies",strategy,key:strategyKey));
        var scenarios=await Data(await client.GetAsync("/api/fuel/strategies"));Assert.Single(scenarios.EnumerateArray());
        Assert.Empty((await Data(await stranger.GetAsync("/api/fuel/strategies"))).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/strategies/{strategyId}",strategy,"1",edit:true)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,$"/strategies/{strategyId}",strategy,"999",edit:true)).StatusCode);
        await Data(await Write(client,$"/strategies/{strategyId}",strategy with {ExtraDistance=0},saved.GetProperty("version").GetString(),edit:true));
        var updated=Assert.Single((await Data(await client.GetAsync("/api/fuel/strategies"))).EnumerateArray());
        Assert.Equal(35,updated.GetProperty("result").GetProperty("netSaving").GetDecimal());
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/strategies/{strategyId}/delete",new{},"2")).StatusCode);
        await Data(await Write(client,$"/strategies/{strategyId}/delete",new{},updated.GetProperty("version").GetString()));
        Assert.Empty((await Data(await client.GetAsync("/api/fuel/strategies"))).EnumerateArray());
        var importedId=imported.GetProperty("recordIds")[0].GetString()!;
        var badBatch=new FuelBulkInput("Delete",[new(importedId,"1"),new(final!,"999")]);
        var activeBeforeBulk=await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/records/bulk",badBatch)).StatusCode);
        Assert.Equal(activeBeforeBulk,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var fullBatch=new FuelBulkInput("SetTankStatus",[new(importedId,"1")],"Full");
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/records/bulk",fullBatch)).StatusCode);
        await Data(await Write(client,"/records/bulk",fullBatch with {FullTankConfirmed=true}));
        var deleteBatch=new FuelBulkInput("Delete",[new(importedId,"2")]);var deleteKey=Guid.NewGuid().ToString();
        await Data(await Write(client,"/records/bulk",deleteBatch,key:deleteKey));await Data(await Write(client,"/records/bulk",deleteBatch,key:deleteKey));
        Assert.Equal(activeBeforeBulk-1,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        Assert.NotNull((await db.Set<FuelRecord>().IgnoreQueryFilters().SingleAsync(x=>x.Id==importedId)).DeletedAt);
        var trash=await Data(await client.GetAsync("/api/fuel/records/trash?page=1"));var trashed=trash.GetProperty("records").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==importedId);
        Assert.Empty((await Data(await stranger.GetAsync("/api/fuel/records/trash"))).GetProperty("records").EnumerateArray());
        var restoreBatch=new FuelBulkInput("Restore",[new(importedId,trashed.GetProperty("version").GetString()!)]);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/records/bulk",restoreBatch)).StatusCode);
        await Data(await Write(client,"/records/bulk",restoreBatch));Assert.Equal(activeBeforeBulk,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        Assert.Equal(beforeTransactions,await db.Transactions.CountAsync(x => x.UserId == user.Id));Assert.Equal(beforeEntries,await db.Entries.CountAsync(x => x.UserId == user.Id));
        async Task<JsonElement> FinancePost(string path,object body,string? version=null){using var request=new HttpRequestMessage(HttpMethod.Post,"/api"+path){Content=JsonContent.Create(body)};request.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());if(version!=null)request.Headers.TryAddWithoutValidation("If-Match",version);return await Data(await client.SendAsync(request));}
        var paymentAccount=(await FinancePost("/accounts",new SaveAccount("Vehicle test cash","Cash","CNY",OpeningBalance:"10000"))).GetProperty("id").GetString()!;
        var expenseCategory=(await FinancePost("/categories",new SaveCategory("Vehicle testing","Expense"))).GetProperty("id").GetString()!;
        expenseCategory=(await FinancePost("/categories",new SaveCategory("Vehicle testing detail","Expense",expenseCategory))).GetProperty("id").GetString()!;
        var incomeCategory=(await FinancePost("/categories",new SaveCategory("Vehicle reimbursements","Income"))).GetProperty("id").GetString()!;
        incomeCategory=(await FinancePost("/categories",new SaveCategory("Vehicle reimbursement detail","Income",incomeCategory))).GetProperty("id").GetString()!;
        var expenseTx=(await FinancePost("/transactions/expense",new SaveTransaction("Expense","200.00",paymentAccount,new(2026,1,26,12,0,0,TimeSpan.FromHours(8)),CategoryId:expenseCategory))).GetProperty("id").GetString()!;
        var afterExpenseCount=await db.Transactions.CountAsync(x=>x.UserId==user.Id);
        var parkingCost=new VehicleCostInput(car,expenseTx,"Parking","120.00");
        var parkingCostId=(await Data(await Write(client,"/costs",parkingCost))).GetProperty("id").GetString()!;
        Assert.Equal(afterExpenseCount,await db.Transactions.CountAsync(x=>x.UserId==user.Id));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/costs",parkingCost with {Amount="81.00"})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/costs",parkingCost)).StatusCode);
        var refundTx=(await FinancePost("/transactions/refund",new SaveTransaction("Refund","50.00",paymentAccount,new(2026,1,27,12,0,0,TimeSpan.FromHours(8)),OriginalTransactionId:expenseTx))).GetProperty("id").GetString()!;
        var refundCostId=(await Data(await Write(client,"/costs",parkingCost with {TransactionId=refundTx,Kind="Refund",OriginalCostId=parkingCostId,Amount="50.00"}))).GetProperty("id").GetString()!;
        var reimburseTx=(await FinancePost("/transactions/income",new SaveTransaction("Income","20.00",paymentAccount,new(2026,1,28,12,0,0,TimeSpan.FromHours(8)),CategoryId:incomeCategory))).GetProperty("id").GetString()!;
        await Data(await Write(client,"/costs",parkingCost with {TransactionId=reimburseTx,Kind="Reimbursement",OriginalCostId=parkingCostId,Amount="20.00"}));
        var costs=await Data(await client.GetAsync($"/api/fuel/costs?vehicleId={car}&from=2026-01-01&to=2026-01-31"));
        Assert.Equal(50,Assert.Single(costs.GetProperty("summary").EnumerateArray()).GetProperty("net").GetDecimal());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,$"/costs/{parkingCostId}/unlink",new{},"1")).StatusCode);
        using(var deleteExpense=new HttpRequestMessage(HttpMethod.Delete,$"/api/transactions/{expenseTx}")){deleteExpense.Headers.TryAddWithoutValidation("If-Match","1");Assert.Equal(HttpStatusCode.UnprocessableEntity,(await client.SendAsync(deleteExpense)).StatusCode);}
        var newFuelCost=new VehicleCostCreate(new(car,"","Fuel","154.00",FuelRecordId:importedId),new SaveTransaction("Expense","154.00",paymentAccount,new(2026,1,24,12,0,0,TimeSpan.FromHours(8)),CategoryId:expenseCategory),true);
        var beforeNewFuel=await db.Transactions.CountAsync(x=>x.UserId==user.Id);var costKey=Guid.NewGuid().ToString();
        await Data(await Write(client,"/costs/create-transaction",newFuelCost,key:costKey));await Data(await Write(client,"/costs/create-transaction",newFuelCost,key:costKey));
        Assert.Equal(beforeNewFuel+1,await db.Transactions.CountAsync(x=>x.UserId==user.Id));
        var budgetId=(await Data(await Write(client,"/vehicle-budgets",new VehicleBudgetInput(car,"2026-01","Fuel","CNY","150.00")))).GetProperty("id").GetString()!;
        var assetId=(await FinancePost("/physical-assets",new ManagedAssetInput("Vehicle asset test","Vehicle","CNY","20000.00",new(2026,1,1)))).GetProperty("id").GetString()!;
        await Data(await Write(client,$"/vehicles/{car}/asset",new VehicleAssetInput(assetId),edit:true));
        await Data(await Write(client,$"/vehicles/{car}/asset-rule",new VehicleAssetRuleInput("1",new PhysicalRuleInput(new(2026,1,1),"StraightLine","User test estimate",60))));
        var planning=await Data(await client.GetAsync($"/api/fuel/vehicles/{car}/planning?from=2026-01-01&to=2026-10-30"));
        Assert.Equal(assetId,planning.GetProperty("asset").GetProperty("id").GetString());Assert.True(planning.GetProperty("modelConsumption").GetDecimal()>0);
        var budget=planning.GetProperty("budgets").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==budgetId);Assert.Equal(154,budget.GetProperty("actual").GetDecimal());Assert.True(budget.GetProperty("usedPercent").GetDecimal()>100);
        var budgetOverview=await Data(await client.GetAsync($"/api/fuel/budget-overview?vehicleId={car}&period=2026-01"));Assert.Equal(154,Assert.Single(budgetOverview.EnumerateArray()).GetProperty("actual").GetDecimal());
        Assert.Empty((await Data(await stranger.GetAsync("/api/fuel/budget-overview?period=2026-01"))).EnumerateArray());
        Assert.Equal(1,await db.Set<ManagedAsset>().CountAsync(x=>x.UserId==user.Id&&x.Type=="Vehicle"));
        var snapshot=await FinancePost("/life-simulator/snapshots",new LifeSnapshotRequest("CNY"));var snapshotId=snapshot.GetProperty("id").GetString()!;
        var valueInSnapshot=snapshot.GetProperty("snapshot").GetProperty("suggested").GetProperty("restrictedAssets").GetDecimal();
        var decisions=new VehicleDecisionInput(snapshotId,"CNY",2,0,valueInSnapshot,true,[new("Keep","Keep",0,0,false,12000,8,8,100,5000),new("Reduce","Reduce",0,0,false,6000,8,8,50,5000)]);
        var beforeDecisions=await db.Transactions.CountAsync(x=>x.UserId==user.Id);
        var decisionPreview=await Data(await client.PostAsJsonAsync("/api/fuel/decisions/preview",decisions));Assert.Equal(2,decisionPreview.GetProperty("results").GetArrayLength());
        await Data(await Write(client,"/decisions/save",decisions));Assert.Equal(beforeDecisions,await db.Transactions.CountAsync(x=>x.UserId==user.Id));
        var receiptBytes=new byte[]{137,80,78,71,13,10,26,10,0};var receiptInput=new FuelReceiptInput("fuel.png","image/png",Convert.ToBase64String(receiptBytes),"Amount paid:150.00","Amount paid:150.00","tesseract-browser",true);
        var receiptRecord=new FuelRecordInput(car,new(2026,2,1),3000,20,150,"CNY",false,false,"Old A","receipt test",PostedUnitPrice:8,OriginalAmount:160,Discount:5,PointsRedemption:5,PaymentMethod:"Cash",DrivingScene:"City");
        var receiptKey=Guid.NewGuid().ToString();var receiptCount=await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/record-receipts",new FuelRecordWithReceipt(receiptRecord,receiptInput with{ContentType="image/jpeg"}))).StatusCode);
        Assert.Equal(receiptCount,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var receiptRecordId=(await Data(await Write(client,"/record-receipts",new FuelRecordWithReceipt(receiptRecord,receiptInput),key:receiptKey))).GetProperty("id").GetString()!;
        await Data(await Write(client,"/record-receipts",new FuelRecordWithReceipt(receiptRecord,receiptInput),key:receiptKey));
        Assert.Equal(receiptCount+1,await db.Set<FuelRecord>().CountAsync(x=>x.UserId==user.Id));
        var receiptRows=await Data(await client.GetAsync($"/api/fuel/records/{receiptRecordId}/receipts"));var receipt=Assert.Single(receiptRows.EnumerateArray());var receiptId=receipt.GetProperty("id").GetString()!;
        var storedReceipt=await db.Set<FuelRecord>().AsNoTracking().SingleAsync(x=>x.Id==receiptRecordId);Assert.Equal(8,storedReceipt.PostedUnitPrice);Assert.Equal(5,storedReceipt.PointsRedemption);Assert.Equal("Cash",storedReceipt.PaymentMethod);
        Assert.Equal(1,await db.Documents.CountAsync(d=>d.UserId==user.Id&&d.Kind=="FuelReceiptRecognition"&&d.Name==receiptId));
        Assert.Equal(receiptBytes,await client.GetByteArrayAsync($"/api/fuel/records/{receiptRecordId}/receipts/{receiptId}"));
        Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync($"/api/fuel/records/{receiptRecordId}/receipts/{receiptId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,$"/records/{receiptRecordId}/receipts/{receiptId}/delete",new{},"9")).StatusCode);
        await Data(await Write(client,$"/records/{receiptRecordId}/receipts/{receiptId}/delete",new{},"1"));Assert.Empty((await Data(await client.GetAsync($"/api/fuel/records/{receiptRecordId}/receipts"))).EnumerateArray());
        Assert.False(await db.Documents.AnyAsync(d=>d.UserId==user.Id&&d.Kind=="FuelReceiptRecognition"&&d.Name==receiptId));
        var approvalId=(await Data(await Write(client,$"/vehicles/{car}/approval",new ApprovalApplication("Maintenance plan",300,"CNY","User confirmed maintenance estimate")))).GetProperty("id").GetString()!;
        Assert.True(await db.Documents.AnyAsync(d=>d.UserId==user.Id&&d.Id==approvalId&&d.Kind=="SpendingApproval"));
        Assert.True(await db.Documents.AnyAsync(d=>d.UserId==user.Id&&d.Name==car&&d.Kind=="VehicleApprovalLink"));
        var stationA=(await Data(await Write(client,"/stations",new FuelStationInput("Station A","Brand A","Address A",["Old A"],true)))).GetProperty("id").GetString()!;
        var stationB=(await Data(await Write(client,"/stations",new FuelStationInput("Station B","Brand B","Address B",["Old B"])))).GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/stations",new FuelStationInput("Duplicate","","",[" old   a "]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/stations/{stationA}/merge",new FuelStationMerge(stationB,"1"),"1")).StatusCode);
        await Data(await Write(client,$"/stations/{stationA}/merge",new FuelStationMerge(stationB,"1"),"1"));
        var stations=await Data(await client.GetAsync("/api/fuel/stations"));var merged=Assert.Single(stations.EnumerateArray());Assert.Equal(stationB,merged.GetProperty("id").GetString());Assert.Contains("OLD A",merged.GetProperty("input").GetProperty("aliases").EnumerateArray().Select(x=>x.GetString()));
        Assert.Equal(1,await db.Documents.CountAsync(d=>d.UserId==user.Id&&d.Kind=="FuelStationMerge"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,$"/vehicles/{car}/delete",new{},"3")).StatusCode);
        var resetRecord=receiptRecord with{Date=new(2026,2,2),Odometer=10,OdometerReset=true,OccurredTime=new TimeOnly(12,0),Note="Odometer replaced",Amount=149};
        var resetId=(await Data(await Write(client,"/records",resetRecord))).GetProperty("id").GetString()!;
        await Data(await Write(client,"/records",resetRecord with{Date=new(2026,2,3),Odometer=210,OdometerReset=false,Amount=148,TankStatus="Full"}));
        var resetReport=await Data(await client.GetAsync($"/api/fuel/report?vehicleId={car}&from=2026-02-01&to=2026-02-28&currency=CNY"));
        var resetAssessment=resetReport.GetProperty("records").EnumerateArray().Single(r=>r.GetProperty("id").GetString()==resetId).GetProperty("assessment");Assert.Equal("ODOMETER_RESET",resetAssessment.GetProperty("reason").GetString());
        var resetDetail=await Data(await client.GetAsync($"/api/fuel/records/{resetId}/assessment"));Assert.Equal("12:00:00",resetDetail.GetProperty("end").GetProperty("occurredTime").GetString());
        Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync($"/api/fuel/records/{resetId}/assessment")).StatusCode);
        var aiEvidence=await Data(await client.PostAsJsonAsync("/api/fuel/ai/evidence",new FuelAiInput(car,new(2026,1,1),new(2026,1,31),"CNY","Fuel",false)));
        Assert.DoesNotContain("Test",aiEvidence.GetRawText());Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/ai/analyze",new FuelAiInput(car,new(2026,1,1),new(2026,1,31),"CNY","Fuel",false))).StatusCode);
        await Data(await client.PutAsJsonAsync("/api/ai/privacy",new AiPrivacyInput(true,true,false,false,false,false,false,false)));
        var adviceInput=new FuelAiInput(car,new(2026,1,1),new(2026,1,31),"CNY","Fuel",true);var noHistoryKey=Guid.NewGuid().ToString();
        var noHistory=await Data(await Write(client,"/ai/analyze",adviceInput,key:noHistoryKey));Assert.False(noHistory.GetProperty("advice").GetProperty("historySaved").GetBoolean());
        Assert.False(await db.Documents.AnyAsync(d=>d.UserId==user.Id&&d.Kind=="FuelAiAdvice"));Assert.False(await db.Idempotencies.AnyAsync(i=>i.UserId==user.Id&&i.Key==noHistoryKey));
        Assert.DoesNotContain("Station A",provider.Sent);Assert.DoesNotContain("receipt test",provider.Sent);
        provider.Fail=true;Assert.Equal(HttpStatusCode.ServiceUnavailable,(await Write(client,"/ai/analyze",adviceInput)).StatusCode);provider.Fail=false;
        await Data(await client.PutAsJsonAsync("/api/ai/privacy",new AiPrivacyInput(true,true,false,false,false,false,true,false)));
        var savedAdvice=await Data(await Write(client,"/ai/analyze",adviceInput));var adviceId=savedAdvice.GetProperty("advice").GetProperty("id").GetString()!;
        Assert.Equal(1,await db.Documents.CountAsync(d=>d.UserId==user.Id&&d.Kind=="FuelAiAdvice"));
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/ai/history/{adviceId}/delete",new{},"1")).StatusCode);
        await Data(await Write(client,$"/ai/history/{adviceId}/delete",new{},"1"));Assert.False(await db.Documents.AnyAsync(d=>d.Id==adviceId));
        provider.BeforeReturn=async()=>{await using var changeDb=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);var consent=await changeDb.Set<AiPrivacySetting>().SingleAsync(p=>p.UserId==user.Id);consent.Enabled=false;consent.ConsentVersion++;await changeDb.SaveChangesAsync();};
        Assert.Equal(HttpStatusCode.Forbidden,(await Write(client,"/ai/analyze",adviceInput)).StatusCode);Assert.False(await db.Documents.AnyAsync(d=>d.UserId==user.Id&&d.Kind=="FuelAiAdvice"));
    }
}
