using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Infrastructure;

var database=args[0];
if(!System.Text.RegularExpressions.Regex.IsMatch(database,"^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$")) throw new Exception("Isolated database required");
var output=Path.GetFullPath(args[1]);Directory.CreateDirectory(output);
using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer($"Server=.;Database={database};Trusted_Connection=True;TrustServerCertificate=True").Options);
var service=new FinanceService(db,null!,NullLogger<FinanceService>.Instance);
var users=await db.Users.AsNoTracking().Where(x=>x.Email.StartsWith("stage-z-load-")).Select(x=>x.Id).ToArrayAsync();
var results=new List<object>();
foreach(var user in users){
 var size=await db.Transactions.CountAsync(x=>x.UserId==user);
 var accountKeyword=await db.Accounts.Where(x=>x.UserId==user).OrderBy(x=>x.Id).Select(x=>x.Name).FirstAsync();
 var categoryKeyword=await db.Categories.Where(x=>x.UserId==user&&x.ParentId==null).OrderBy(x=>x.Id).Select(x=>x.Name).FirstAsync();
 var tagKeyword=await db.Directory.Where(x=>x.UserId==user&&x.Kind=="tags").OrderBy(x=>x.Id).Select(x=>x.Name).FirstAsync();
 var merchantKeyword=await db.Transactions.Where(x=>x.UserId==user&&x.Merchant!=null).OrderBy(x=>x.Id).Select(x=>x.Merchant!).FirstAsync();
 foreach(var keyword in new[]{"A35-","不存在Z关键词",accountKeyword,categoryKeyword,tagKeyword,merchantKeyword,"41.48"}){
  var parameters=new QueryCollection(new Dictionary<string,StringValues>{{"keyword",keyword}});
  var baseline=await service.Filter(user,parameters);
  var baseQuery=await service.Filter(user,new QueryCollection());
  var accountIds=await db.Accounts.Where(a=>a.UserId==user&&a.Name.Contains(keyword)).Select(a=>a.Id).ToArrayAsync();
  var namedCategories=db.Categories.Where(c=>c.UserId==user&&c.Name.Contains(keyword)).Select(c=>c.Id);
  var categoryIds=await namedCategories.Union(db.Categories.Where(c=>c.UserId==user&&namedCategories.Contains(c.ParentId!)).Select(c=>c.Id)).ToArrayAsync();
  var directoryIds=await db.Directory.Where(d=>d.UserId==user&&d.Name.Contains(keyword)).Select(d=>d.Id).ToArrayAsync();
  var isMoney=decimal.TryParse(keyword,out var amount);
  var candidate=baseQuery.Where(x=>(x.Merchant!=null&&x.Merchant.Contains(keyword))||x.Note.Contains(keyword)||isMoney&&x.Amount==amount
   ||accountIds.Length>0&&(accountIds.Contains(x.AccountId)||accountIds.Contains(x.ToAccountId!))
   ||categoryIds.Length>0&&x.Entries.Any(e=>categoryIds.Contains(e.CategoryId!))
   ||directoryIds.Length>0&&(directoryIds.Contains(x.ProjectId!)||x.Tags.Any(t=>directoryIds.Contains(t.DirectoryId))));
  var originalIds=await baseline.Select(x=>x.Id).ToArrayAsync();var candidateIds=await candidate.Select(x=>x.Id).ToArrayAsync();
  if(!originalIds.SequenceEqual(candidateIds))throw new Exception("Search result or ordering changed");
  var caseHash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(keyword)))[..12];
  await File.WriteAllTextAsync(Path.Combine(output,$"{size}-{caseHash}-baseline.sql"),baseline.Take(50).ToQueryString());
  await File.WriteAllTextAsync(Path.Combine(output,$"{size}-{caseHash}-candidate.sql"),candidate.Take(50).ToQueryString());
  if(size==100000&&keyword=="A35-"){
   async Task Plan(string name,string query){
    using var connection=new Microsoft.Data.SqlClient.SqlConnection(db.Database.GetConnectionString());await connection.OpenAsync();
    var messages=new List<string>();connection.InfoMessage+=(_,e)=>messages.Add(e.Message);
    using var command=connection.CreateCommand();command.CommandTimeout=120;command.CommandText="SET STATISTICS IO ON; SET STATISTICS TIME ON; SET STATISTICS XML ON;\n"+query+"\nSET STATISTICS XML OFF;";
    using var reader=await command.ExecuteReaderAsync();do{while(await reader.ReadAsync()){if(reader.FieldCount==1&&reader.GetName(0).Contains("Showplan"))await File.WriteAllTextAsync(Path.Combine(output,name+"-actual-plan.xml"),reader.GetValue(0).ToString());}}while(await reader.NextResultAsync());
    await File.WriteAllLinesAsync(Path.Combine(output,name+"-logical-reads.txt"),messages);
   }
   await Plan("baseline",baseline.Take(50).ToQueryString());await Plan("candidate",candidate.Take(50).ToQueryString());
  }
  async Task<double[]> Measure(IQueryable<PersonalFinance.Api.Domain.FinanceTransaction> query){var samples=new List<double>();for(int i=0;i<6;i++){var timer=Stopwatch.StartNew();await query.CountAsync();await query.Take(50).Select(x=>x.Id).ToArrayAsync();samples.Add(timer.Elapsed.TotalMilliseconds);}return samples.ToArray();}
  var before=await Measure(baseline);var after=await Measure(candidate);
  results.Add(new{size,keyword,idsAndOrderMatch=true,total=originalIds.Length,baselineMs=before,candidateMs=after});
 }
}
await File.WriteAllTextAsync(Path.Combine(output,"search-comparison.json"),JsonSerializer.Serialize(new{database,results},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Compared {results.Count} search workloads with identical IDs and ordering");
