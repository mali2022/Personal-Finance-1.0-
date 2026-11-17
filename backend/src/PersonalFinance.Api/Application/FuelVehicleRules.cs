using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public static class FuelVehicleRules
{
    public static void Validate(FuelVehicleInput b, DateOnly today)
    {
        static void Check(bool valid, string message) { if (!valid) throw new ApiException(422, message); }
        Check(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 100 && (b.Plate?.Length ?? 0) <= 30, "请检查车辆名称和车牌");
        Check(b.FuelType is "Petrol" or "Diesel" or "Hybrid" or "Electric" or "Other", "燃料类型无效");
        Check(b.EnergyType is "Unknown" or "Petrol" or "Diesel" or "Hybrid" or "PlugInHybrid" or "Electric" or "Other", "能源类型无效");
        Check(b.Status is "Active" or "Archived", "车辆状态无效");
        Check((b.Brand?.Length ?? 0) <= 100 && (b.Model?.Length ?? 0) <= 100 && (b.Engine?.Length ?? 0) <= 200 && (b.Note?.Length ?? 0) <= 1000, "车辆档案文本过长");
        Check(b.ModelYear == null || b.ModelYear >= 1886 && b.ModelYear <= today.Year + 1, "年款超出范围");
        Check(b.PurchaseDate == null || b.PurchaseDate.Value.Year >= 1901 && b.PurchaseDate <= today, "购置日期不能是未来日期");
        Check(b.TankCapacity == null || b.TankCapacity > 0 && b.TankCapacity <= 10000 && decimal.Round(b.TankCapacity.Value, 1) == b.TankCapacity, "油箱容量须为正数，最多1位小数");
        Check(b.PurchaseAmount == null || b.PurchaseAmount >= 0 && b.PurchaseAmount <= 1000000000 && decimal.Round(b.PurchaseAmount.Value, 2) == b.PurchaseAmount, "购置金额无效");
        Check(b.PurchaseCurrency == null || CurrencyDefinitions.Supports(b.PurchaseCurrency), "购置币种无效");
        Check(b.PurchaseAmount == null || b.PurchaseCurrency != null, "填写购置金额时须填写原始币种");
        foreach (var distance in new[] { b.InitialOdometer, b.CurrentOdometer, b.AnnualDistance })
            Check(distance == null || distance >= 0 && distance <= 10000000 && decimal.Round(distance.Value, 1) == distance, "里程须为非负数，最多1位小数");
        Check(b.InitialOdometer == null || b.CurrentOdometer == null || b.CurrentOdometer >= b.InitialOdometer, "当前里程不能小于初始里程");
    }
}
