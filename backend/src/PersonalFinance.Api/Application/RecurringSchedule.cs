using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public static class RecurringSchedule
{
    public static DateTimeOffset? At(DateTime anchor, string frequency, int interval, long sequence, string policy, string zoneId)
    {
        if (sequence < 0 || interval is < 1 or > 366 || sequence > 1000000) throw new ApiException(422, "周期参数超出范围");
        var start = DateTime.SpecifyKind(anchor, DateTimeKind.Unspecified);
        DateTime local;
        try
        {
            var n = checked(sequence * interval);
            if (frequency is "Day" or "Week" or "Custom") local = start.AddDays(n * (frequency == "Week" ? 7 : 1));
            else
            {
                var months = checked((int)(n * (frequency switch { "Month" => 1, "Quarter" => 3, "HalfYear" => 6, "Year" => 12, _ => throw new ApiException(422, "周期类型无效") })));
                var month = new DateTime(start.Year, start.Month, 1).AddMonths(months);
                var max = DateTime.DaysInMonth(month.Year, month.Month);
                if (start.Day > max && policy == "Skip") return null;
                local = month.AddDays(Math.Min(start.Day, max) - 1).Add(start.TimeOfDay);
            }
        }
        catch (ArgumentOutOfRangeException) { throw new ApiException(422, "周期日期超出支持范围"); }
        catch (OverflowException) { throw new ApiException(422, "周期日期超出支持范围"); }
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(zoneId, out var zone)) throw new ApiException(422, "时区无效");
        // DST gap: move forward to the first valid minute. Overlap: choose the earlier instant.
        for (var i = 0; zone.IsInvalidTime(local) && i < 180; i++) local = local.AddMinutes(1);
        if (zone.IsInvalidTime(local)) throw new ApiException(422, "该日期无法转换到所选时区");
        var offset = zone.IsAmbiguousTime(local) ? zone.GetAmbiguousTimeOffsets(local).Max() : zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset);
    }
}
