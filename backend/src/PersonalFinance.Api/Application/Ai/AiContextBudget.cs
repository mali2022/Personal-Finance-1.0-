using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace PersonalFinance.Api.Application.Ai;
public static class AiContextBudget
{
    public static readonly JsonSerializerOptions WireJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public static int Bytes(JsonNode node) => Encoding.UTF8.GetByteCount(node.ToJsonString(WireJson));
}
