using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;

public sealed partial class PayrollCenterTests
{
    [ProfileSqlFact] public async Task PrepareImport412BrowserFixtureWhenRequested(){
        var output=Environment.GetEnvironmentVariable("PF_IMPORT412_BROWSER_FIXTURE");if(string.IsNullOrEmpty(output))return;
        await using var f=await TestCase.Create();var(a,cat,m)=await ImportData(f);
        await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/aliases",new MerchantAliasInput("北山咖啡门店"),"1"));
        var upload=await Upload412(f,"日期,金额,类型,商户,分类,状态,流水号,备注\r\n2026-10-18 10:00:00,25,支出,北山咖啡门店,,交易成功,one,原始备注\r\n2026-10-18 10:05:00,99,支出,未付款,,交易关闭,two,保留\r\n");var id=Id(upload);await Map412(f,id,a.Id);
        await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{email=f.Email,password=f.Password,jobId=id,merchantId=m.Id,accountId=a.Id,categoryId=cat.Id}));
    }
    private sealed class ImportProvider : IAiProvider {
        public string? Sent;public Func<JsonArray,DeepSeekCompletion>? Reply;
        public void EnsureAvailable(){}
        public Task<DeepSeekCompletion> Complete(string user,JsonArray messages,JsonArray? tools,string feature,CancellationToken ct,bool json=false,bool reasoning=false,Func<string,Task>? onDelta=null){Sent=messages.ToJsonString();return Task.FromResult(Reply!(messages));}
    }
    private static Task<HttpResponseMessage> ImportWrite(HttpClient client,string path,object input,string? version=null,HttpMethod? method=null){
        var request=new HttpRequestMessage(method??HttpMethod.Post,"/api"+path){Content=JsonContent.Create(input)};request.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());if(version!=null)request.Headers.TryAddWithoutValidation("If-Match",version);return client.SendAsync(request);
    }
    private static async Task<(Account account,Category category,DirectoryItem merchant)> ImportData(TestCase f){
        var a=new Account{UserId=f.UserId,Name="Import bank",Type="Bank",Currency="CNY"};var parent=new Category{UserId=f.UserId,Name="Dining",Kind="Expense"};
        var cat=new Category{UserId=f.UserId,Name="Coffee",Kind="Expense",ParentId=parent.Id};var m=new DirectoryItem{UserId=f.UserId,Kind="merchants",Name="北山咖啡",CategoryId=cat.Id};f.Db.AddRange(a,parent,cat,m);await f.Db.SaveChangesAsync();return(a,cat,m);
    }
    private static async Task<JsonElement> Upload412(TestCase f,string content,Encoding? encoding=null){
        using var form=new MultipartFormDataContent();form.Add(new ByteArrayContent((encoding??Encoding.UTF8).GetBytes(content)),"file","synthetic-import.csv");form.Add(new StringContent("Bank"),"source");return await Data(await f.Client.PostAsync("/api/imports",form));
    }
    private static async Task<JsonElement> Map412(TestCase f,string id,string account,string version="1")=>await Data(await ImportWrite(f.Client,$"/imports/{id}/mapping",new{accountId=account,mapping=new{occurredAt="日期",amount="金额",type="类型",merchant="商户",category="分类",status="状态",externalId="流水号",note="备注"}},version,HttpMethod.Put));
    private static async Task<JsonElement> Rows412(TestCase f,string id)=> (await Data(await f.Client.GetAsync($"/api/imports/{id}/rows"))).GetProperty("items");
    [ProfileSqlFact] public async Task Import412KeepsOriginalFileCleansAliasesSkipsClosedAndReversesManualEdits(){
        await using var f=await TestCase.Create();var(a,cat,m)=await ImportData(f);
        await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/aliases",new MerchantAliasInput("北山咖啡门店"),"1"));
        const string csv="日期,金额,类型,商户,分类,状态,流水号,备注\r\n2026-10-18 10:00:00,￥２５.００,支出,北山咖啡门店,,交易成功,one,原始备注\r\n2026-10-18 10:05:00,99,支出,未付款,,交易关闭,two,保留\r\n";
        var upload=await Upload412(f,csv);var id=Id(upload);Assert.Equal(64,upload.GetProperty("sourceHash").GetString()!.Length);
        var original=await f.Client.GetByteArrayAsync($"/api/imports/{id}/source-file");Assert.Equal(Encoding.UTF8.GetBytes(csv),original);
        var mapped=await Map412(f,id,a.Id);Assert.Equal(1,mapped.GetProperty("summary").GetProperty("ready").GetInt32());Assert.Equal(1,mapped.GetProperty("summary").GetProperty("skipped").GetInt32());
        var rows=await Rows412(f,id);var row=rows[0];Assert.Equal(m.Name,row.GetProperty("merchant").GetString());Assert.Equal("北山咖啡门店",row.GetProperty("rawMerchant").GetString());Assert.Equal("25.00",row.GetProperty("amount").GetString());Assert.Equal(cat.Id,row.GetProperty("categoryId").GetString());
        var patch=await Data(await ImportWrite(f.Client,$"/imports/{id}/rows/{Id(row)}",new{amount="26.00",note="人工核对"},"2",HttpMethod.Patch));
        var history=await Data(await f.Client.GetAsync($"/api/imports/{id}/cleaning"));var evt=history.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("action").GetString()=="ManualEdit");
        Assert.Equal(HttpStatusCode.NotFound,(await ImportWrite(f.Other,$"/imports/{id}/cleaning/{Id(evt)}/undo",new{},"3")).StatusCode);
        var undone=await Data(await ImportWrite(f.Client,$"/imports/{id}/cleaning/{Id(evt)}/undo",new{},patch.GetProperty("version").GetString()));
        Assert.Equal("25.00",(await Rows412(f,id))[0].GetProperty("amount").GetString());
        var exported=await Data(await f.Client.GetAsync($"/api/imports/{id}/cleaning-export"));Assert.Equal("￥２５.００",exported.GetProperty("originalRows")[0][1].GetString());
        var commit=await Data(await ImportWrite(f.Client,$"/imports/{id}/commit",new ImportCommitOptions(true,true),undone.GetProperty("version").GetString()));Assert.Equal(1,commit.GetProperty("imported").GetInt32());Assert.Equal(1,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await ImportWrite(f.Client,$"/imports/{id}/cleaning/{Id(evt)}/undo",new{},commit.GetProperty("version").GetString())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await f.Factory.CreateClient().GetAsync("/api/imports")).StatusCode);
    }
    [ProfileSqlFact] public async Task Import412MerchantMergeRequiresFreshSnapshotAndLeavesAmountsUnchanged(){
        await using var f=await TestCase.Create();var(a,cat,m)=await ImportData(f);var target=new DirectoryItem{UserId=f.UserId,Kind="merchants",Name="北山咖啡标准"};f.Db.Add(target);await f.Db.SaveChangesAsync();
        await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/aliases",new MerchantAliasInput("门店A"),"1"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await ImportWrite(f.Client,$"/merchant-master/{target.Id}/aliases",new MerchantAliasInput("门店A"),"1")).StatusCode);
        var tx=new FinanceTransaction{UserId=f.UserId,AccountId=a.Id,CategoryId=cat.Id,Merchant=m.Name,Amount=25,Currency="CNY",Type="Expense",OccurredAt=new(2026,10,18,10,0,0,TimeSpan.FromHours(8))};f.Db.Add(tx);await f.Db.SaveChangesAsync();
        var input=new MerchantMergeInput(target.Id,"2","1");var preview=await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/merge-preview",input));
        Assert.Equal(1,preview.GetProperty("transactions").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound,(await ImportWrite(f.Other,$"/merchant-master/{m.Id}/merge",input with{PreviewToken=preview.GetProperty("previewToken").GetString()})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/merge",input with{PreviewToken="stale"})).StatusCode);
        await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/merge",input with{PreviewToken=preview.GetProperty("previewToken").GetString()}));
        var saved=await f.Db.Transactions.AsNoTracking().SingleAsync(x=>x.Id==tx.Id);Assert.Equal(target.Name,saved.Merchant);Assert.Equal(25m,saved.Amount);Assert.Equal(a.Id,saved.AccountId);Assert.Equal(cat.Id,saved.CategoryId);
        Assert.Equal("Disabled",(await f.Db.Directory.AsNoTracking().SingleAsync(x=>x.Id==m.Id)).Status);
        Assert.All(await f.Db.Set<MerchantAlias>().Where(x=>x.UserId==f.UserId).ToArrayAsync(),x=>Assert.Equal(target.Id,x.MerchantId));
    }
    [ProfileSqlFact] public async Task Import412AliasMatchingDoesNotBypassHistoricalDuplicateReview(){
        await using var f=await TestCase.Create();var(a,cat,m)=await ImportData(f);
        await Data(await ImportWrite(f.Client,$"/merchant-master/{m.Id}/aliases",new MerchantAliasInput("历史门店"),"1"));
        f.Db.Add(new FinanceTransaction{UserId=f.UserId,AccountId=a.Id,CategoryId=cat.Id,Type="Expense",Amount=25,Currency="CNY",Merchant="历史门店",OccurredAt=new(2026,10,18,10,0,0,TimeSpan.FromHours(8))});await f.Db.SaveChangesAsync();
        var job=await Upload412(f,"日期,金额,类型,商户,分类,状态,流水号,备注\r\n2026-10-18 10:00:00,25,支出,历史门店,Coffee,交易成功,,\r\n");var mapped=await Map412(f,Id(job),a.Id);
        Assert.Equal(1,mapped.GetProperty("summary").GetProperty("suspected").GetInt32());Assert.Equal("Suspected",(await Rows412(f,Id(job)))[0].GetProperty("status").GetString());
    }
    [ProfileSqlFact] public async Task Import412AiRequiresConsentAndOnlyAppliesReviewedFreshSuggestions(){
        var provider=new ImportProvider();await using var f=await TestCase.Create(provider);var(a,cat,m)=await ImportData(f);
        var job=await Upload412(f,"日期,金额,类型,商户,分类,状态,流水号,备注\r\n2026-10-18 10:00:00,25,支出,咖啡候选,Coffee,交易成功,unique,不发送的备注\r\n");var id=Id(job);await Map412(f,id,a.Id);var row=(await Rows412(f,id))[0];
        var input=new ImportRecognitionInput(id,"2",[Id(row)],true);
        Assert.Equal(HttpStatusCode.Forbidden,(await ImportWrite(f.Client,"/ai/import-recognition",input)).StatusCode);Assert.Null(provider.Sent);
        f.Db.Add(new AiPrivacySetting{UserId=f.UserId,Enabled=true,AllowRecognitionText=true});await f.Db.SaveChangesAsync();
        provider.Reply=messages=>new(new JsonObject{["role"]="assistant",["content"]=JsonSerializer.Serialize(new{suggestions=new[]{new{rowId=Id(row),merchantId=m.Id,categoryId=cat.Id,confidence=0.82,reason="候选商户待人工核对"}}})},null);
        var recognized=await Data(await ImportWrite(f.Client,"/ai/import-recognition",input));
        Assert.DoesNotContain("不发送的备注",provider.Sent);Assert.DoesNotContain("occurredAt",provider.Sent);Assert.DoesNotContain(a.Id,provider.Sent);
        Assert.Equal("咖啡候选",(await Rows412(f,id))[0].GetProperty("merchant").GetString());Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
        var suggestions=await Data(await f.Client.GetAsync($"/api/imports/{id}/suggestions"));var sid=Id(suggestions.GetProperty("items")[0]);
        var applied=await Data(await ImportWrite(f.Client,$"/imports/{id}/suggestions/{sid}/decision",new ImportSuggestionDecision(true),recognized.GetProperty("version").GetString()));Assert.Equal(m.Name,(await Rows412(f,id))[0].GetProperty("merchant").GetString());Assert.Equal("25.00",(await Rows412(f,id))[0].GetProperty("amount").GetString());
        var newInput=input with{Version=applied.GetProperty("version").GetString()!};var again=await Data(await ImportWrite(f.Client,"/ai/import-recognition",newInput));
        var edited=await Data(await ImportWrite(f.Client,$"/imports/{id}/rows/{Id(row)}",new{note="另一次核对"},again.GetProperty("version").GetString(),HttpMethod.Patch));
        suggestions=await Data(await f.Client.GetAsync($"/api/imports/{id}/suggestions"));sid=Id(suggestions.GetProperty("items")[0]);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await ImportWrite(f.Client,$"/imports/{id}/suggestions/{sid}/decision",new ImportSuggestionDecision(true),edited.GetProperty("version").GetString())).StatusCode);
    }
    [ProfileSqlFact] public async Task Import412DetectsGb18030AndReusesMappingWithoutReusingLedgerRows(){
        await using var f=await TestCase.Create();var(a,_,_)=await ImportData(f);Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        const string csv="日期,金额,类型,商户,分类,状态,流水号,备注\r\n2026-10-18 10:00:00,25,支出,北山咖啡,Coffee,交易成功,unique,备注\r\n";
        var job=await Upload412(f,csv,Encoding.GetEncoding("GB18030"));Assert.Equal("GB18030",job.GetProperty("sourceEncoding").GetString());await Map412(f,Id(job),a.Id);
        var second=await Upload412(f,csv,Encoding.GetEncoding("GB18030"));Assert.Equal("Uploaded",second.GetProperty("state").GetString());Assert.Equal("金额",second.GetProperty("mapping").GetProperty("amount").GetString());
        var list=await Data(await f.Client.GetAsync("/api/imports"));Assert.Equal(2,list.GetProperty("total").GetInt32());Assert.All(list.GetProperty("items").EnumerateArray(),x=>Assert.Equal(2,x.GetProperty("sameFileCount").GetInt32()));
        Assert.Equal(0,await f.Db.Transactions.CountAsync(x=>x.UserId==f.UserId));
    }
}

public sealed class Import412PureTests
{
    [Fact] public void MerchantNormalizationIsConservativeAndStatusExclusionsAreExplicit(){
        Assert.Equal(FinanceService.MerchantMatchKey(" ＡＢＣ　咖啡 "),FinanceService.MerchantMatchKey("abc 咖啡"));
        Assert.NotEqual(FinanceService.MerchantMatchKey("咖啡(一店)"),FinanceService.MerchantMatchKey("咖啡(二店)"));
        Assert.Equal("1234.50",FinanceService.CleanImportAmount("￥１,２３４.５０"));Assert.True(FinanceService.ExcludedImportStatus("交易关闭"));Assert.False(FinanceService.ExcludedImportStatus("退款成功"));
    }
    [Theory][InlineData("{\"suggestions\":[{\"rowId\":\"row\",\"merchantId\":\"foreign\",\"categoryId\":null,\"confidence\":0.8,\"reason\":\"test\"}]}")][InlineData("{\"suggestions\":[{\"rowId\":\"row\",\"merchantId\":null,\"categoryId\":null,\"confidence\":0.8,\"reason\":\"test\",\"amount\":\"1\"}]}")]
    public void AiOutputCannotInventIdsOrMoneyFields(string json)=>Assert.Throws<ApiException>(()=>ImportRecognitionService.Parse(json,["row"],[],[],new(){["row"]="Expense"}));
}
