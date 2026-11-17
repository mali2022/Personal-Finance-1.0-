using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
namespace PersonalFinance.Api.Application;
public sealed record LiveFxQuote(string BaseCurrency, string TargetCurrency, string Rate, DateOnly Date, DateTimeOffset FetchedAt, string Source);
public sealed class LiveFxService(HttpClient http, IMemoryCache cache)
{
    public async Task<LiveFxQuote> Quote(string source, string target, CancellationToken cancellationToken = default)
    {
        FinanceService.Require(CurrencyDefinitions.Supports(source) && CurrencyDefinitions.Supports(target), "币种无效");
        if(source == target) return new(source,target,"1",DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)),DateTimeOffset.UtcNow,"同币种");
        var key = "fx:"+source+":"+target;
        if(cache.TryGetValue<LiveFxQuote>(key,out var cached)) return cached!;
        try {
            using var response = await http.GetAsync($"https://api.frankfurter.dev/v2/rate/{source}/{target}",cancellationToken);
            if(!response.IsSuccessStatusCode) throw new HttpRequestException();
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken),cancellationToken: cancellationToken);
            var root = document.RootElement;
            if(root.GetProperty("base").GetString()!=source || root.GetProperty("quote").GetString()!=target || !root.GetProperty("rate").TryGetDecimal(out var rate) || rate<=0 || rate>1000000 || !DateOnly.TryParseExact(root.GetProperty("date").GetString(),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date) || date > DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)) || date < new DateOnly(1900,1,1)) throw new JsonException();
            rate=decimal.Round(rate,8,MidpointRounding.AwayFromZero);
            if(rate<=0) throw new JsonException();
            var quote=new LiveFxQuote(source,target,rate.ToString("0.########",CultureInfo.InvariantCulture),date,DateTimeOffset.UtcNow,"Frankfurter · 最新参考汇率");
            cache.Set(key,quote,TimeSpan.FromMinutes(15));
            return quote;
        } catch(Exception error) when(error is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException or FormatException) {
            throw new ApiException(503,"暂时无法获取该币种对的最新汇率，请稍后重试或手动填写实际汇率","FX_UNAVAILABLE");
        }
    }
}
