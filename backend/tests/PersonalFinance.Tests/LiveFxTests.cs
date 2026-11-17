using PersonalFinance.Api.Contracts;
using System.Net;
using Microsoft.Extensions.Caching.Memory;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class LiveFxTests
{
    private sealed class Handler(string json, HttpStatusCode status=HttpStatusCode.OK) : HttpMessageHandler {
        public int Calls; public string? Url;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {Calls++;Url=request.RequestUri!.ToString();return Task.FromResult(new HttpResponseMessage(status){Content=new StringContent(json)});}
    }
    [Fact] public async Task FetchesValidatesAndCachesPairWithActualQuoteDate() {
        var handler=new Handler("{\"date\":\"2026-10-15\",\"base\":\"EUR\",\"quote\":\"JPY\",\"rate\":175.123456789}");
        using var client=new HttpClient(handler);using var cache=new MemoryCache(new MemoryCacheOptions());var service=new LiveFxService(client,cache);
        var quote=await service.Quote("EUR","JPY");Assert.Equal("175.12345679",quote.Rate);Assert.Equal(new DateOnly(2026,10,15),quote.Date);Assert.Contains("Frankfurter",quote.Source);
        Assert.Equal(quote,await service.Quote("EUR","JPY"));Assert.Equal(1,handler.Calls);Assert.EndsWith("/EUR/JPY",handler.Url);
    }
    [Theory] [InlineData("{\"date\":\"2026-10-15\",\"base\":\"USD\",\"quote\":\"JPY\",\"rate\":175}")] [InlineData("{\"date\":\"2026-10-15\",\"base\":\"EUR\",\"quote\":\"JPY\",\"rate\":0}")] [InlineData("{\"date\":\"2099-10-15\",\"base\":\"EUR\",\"quote\":\"JPY\",\"rate\":175}")] [InlineData("{}")] public async Task RejectsMalformedWrongPairZeroAndFutureQuotes(string json) {
        using var client=new HttpClient(new Handler(json));using var cache=new MemoryCache(new MemoryCacheOptions());var error=await Assert.ThrowsAsync<ApiException>(()=>new LiveFxService(client,cache).Quote("EUR","JPY"));Assert.Contains("暂时无法",error.Message);
    }
    [Fact] public async Task SameCurrencyNeedsNoNetworkAndInvalidCodesNeverReachProvider() {
        var handler=new Handler("{}",HttpStatusCode.ServiceUnavailable);using var client=new HttpClient(handler);using var cache=new MemoryCache(new MemoryCacheOptions());var service=new LiveFxService(client,cache);
        Assert.Equal("1",(await service.Quote("EUR","EUR")).Rate);Assert.Equal(0,handler.Calls);await Assert.ThrowsAsync<ApiException>(()=>service.Quote("BAD","EUR"));Assert.Equal(0,handler.Calls);await Assert.ThrowsAsync<ApiException>(()=>service.Quote("EUR","JPY"));
    }
    [Fact] public void SharedCatalogContainsDistinctSupportedCurrencies() {Assert.Equal(32,CurrencyDefinitions.Items.Length);Assert.Equal(32,CurrencyDefinitions.Items.Select(x=>x.Code).Distinct().Count());foreach(var code in new[]{"EUR","JPY","GBP","SGD","AUD","CNY"})Assert.True(CurrencyDefinitions.Supports(code));Assert.False(CurrencyDefinitions.Supports("BAD"));}
}
