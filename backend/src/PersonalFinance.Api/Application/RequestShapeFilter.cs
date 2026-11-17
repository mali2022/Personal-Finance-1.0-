using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

// Validate the declared DTO contract before any write transaction or domain mutation.
// Optional references stay optional; a collection's nullability is independent of its elements.
public sealed class RequestShapeFilter : IEndpointFilter
{
    private sealed record Field(PropertyInfo Property, NullabilityInfo Nullability);
    private static readonly ConcurrentDictionary<Type, Field[]> Fields = new();
    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        foreach (var value in context.Arguments) ValidateBody(value);
        return next(context);
    }
    public static void ValidateBody(object? value) => Validate(value, null, 0);
    private static void Reject() => throw new ApiException(400, "请求字段缺失或包含不允许的空值，请检查输入", "INVALID_REQUEST");
    private static void Validate(object? value, NullabilityInfo? declared, int depth)
    {
        if (value == null) { if (declared?.ReadState == NullabilityState.NotNull) Reject(); return; }
        if (depth > 64) Reject();
        var type = value.GetType();
        if (type.IsArray || type.Namespace == "System.Collections.Generic" && value is IList)
        {
            var element = declared?.ElementType ?? declared?.GenericTypeArguments.FirstOrDefault();
            foreach (var item in (IEnumerable)value) { if (item == null && (element?.ReadState ?? NullabilityState.NotNull) == NullabilityState.NotNull) Reject(); Validate(item, element, depth + 1); }
            return;
        }
        // Services, EF entities, framework objects and raw JSON use their existing validation.
        if (type.Namespace?.StartsWith("PersonalFinance.", StringComparison.Ordinal) != true || type.GetMethod("<Clone>$") == null) return;
        var fields = Fields.GetOrAdd(type, t => { var nullability = new NullabilityInfoContext(); return t.GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.CanRead && p.GetIndexParameters().Length == 0).Select(p => new Field(p, nullability.Create(p))).ToArray(); });
        foreach (var field in fields) Validate(field.Property.GetValue(value), field.Nullability, depth + 1);
    }
}
