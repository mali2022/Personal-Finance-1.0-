using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
namespace PersonalFinance.Api.Application;

public sealed class TimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader,Type type,JsonSerializerOptions options)
    {
        var value=reader.GetString();
        if(value is null||!Regex.IsMatch(value,@"(?:Z|[+-]\d{2}:\d{2})$")||!reader.TryGetDateTimeOffset(out var result))throw new JsonException("Time assets require an explicit ISO time-zone offset");
        return result;
    }
    public override void Write(Utf8JsonWriter writer,DateTimeOffset value,JsonSerializerOptions options)=>writer.WriteStringValue(value);
}
