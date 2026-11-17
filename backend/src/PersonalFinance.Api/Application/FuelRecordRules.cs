using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using static PersonalFinance.Api.Application.FinanceService;
namespace PersonalFinance.Api.Application;
public static class FuelRecordRules
{
    public static void Validate(FuelRecordInput b, DateOnly today)
    {
        Require(b.TankStatus is "Full" or "Partial" or "Unknown","加满状态无效");
        Require(b.FuelGrade is "Unknown" or "Petrol92" or "Petrol95" or "Petrol98" or "Diesel0" or "DieselMinus10" or "Other","油品无效");
        Require(b.Date.Year>=1901&&b.Date<=today,"加油日期不能是未来日期");
        Require(b.OccurredTime==null||b.OccurredTime.Value.Ticks%TimeSpan.TicksPerSecond==0,"加油时间最多精确到秒");
        Require(!b.OdometerReset||b.Odometer.HasValue&&!string.IsNullOrWhiteSpace(b.Note),"里程表重置须填写新读数及备注原因");
        Require(b.Odometer.HasValue || b.HistoricalBackfill && b.Date<today,"最近加油须填写累计里程；历史补录留空时日期须早于今天");
        if(b.Odometer.HasValue) Require(b.Odometer>=0&&b.Odometer<=10000000&&decimal.Round(b.Odometer.Value,1)==b.Odometer.Value,"里程须为非负数，最多1位小数");
        Require(b.Amount>=0&&b.Amount<=100000000&&decimal.Round(b.Amount,2)==b.Amount,"实付金额须非负，最多2位小数");
        Require(b.PostedUnitPrice==null||b.PostedUnitPrice is >0 and <=1000000&&decimal.Round(b.PostedUnitPrice.Value,3)==b.PostedUnitPrice,"挂牌单价须大于0，最多3位小数");
        foreach(var value in new[]{b.OriginalAmount,b.Discount,b.PointsRedemption})Require(value==null||value is >=0 and <=100000000&&decimal.Round(value.Value,2)==value,"原价、优惠和积分抵扣须非负，最多2位小数");
        Require(b.OriginalAmount==null||b.Amount<=b.OriginalAmount,"实付不能超过已填写的优惠前金额");
        Require(b.OriginalAmount==null||(b.Discount??0)+(b.PointsRedemption??0)<=b.OriginalAmount,"优惠与积分抵扣不能超过优惠前金额");
        Require((b.PaymentMethod??"").Length<=100&&(b.DrivingScene??"").Length<=100,"支付方式或行驶场景过长");
        Require(b.QuantitySource is "Manual" or "Calculated" or "ReferenceSnapshot20261016","加油量来源无效");
        Require(b.QuantitySource!="ReferenceSnapshot20261016" || b.Currency=="CNY","参考油价仅适用于人民币");
        if(b.QuantitySource!="Manual") {
            Require(b.Amount>0,"零实付加油须手动填写实际油量，不能由实付反推");
            Require(b.EnteredUnitPrice is >0 and <=1000000 && decimal.Round(b.EnteredUnitPrice.Value,3)==b.EnteredUnitPrice.Value,"每升单价须大于0，最多3位小数");
            Require(b.Litres==FuelMath.LitresFromPrice(b.Amount,b.EnteredUnitPrice!.Value),"加油量须等于实付金额除以单价，保留3位小数");
        } else Require(b.EnteredUnitPrice==null,"手动加油量不保存计算单价");
        Require(b.Litres>0&&b.Litres<=10000&&decimal.Round(b.Litres,3)==b.Litres,"加油量须大于0，最多3位小数");

        Require(CurrencyDefinitions.Items.Any(x=>x.Code==b.Currency),"币种无效");
        Require((b.Station??"").Length<=200&&(b.Note??"").Length<=1000,"加油站或备注过长");
    }
    public static void Apply(FuelRecord r,FuelRecordInput b)
    {
        r.OccurredTime=b.OccurredTime;r.OdometerReset=b.OdometerReset;
        r.PostedUnitPrice=b.PostedUnitPrice;r.OriginalAmount=b.OriginalAmount;r.Discount=b.Discount;r.PointsRedemption=b.PointsRedemption;r.PaymentMethod=b.PaymentMethod?.Trim();r.DrivingScene=b.DrivingScene?.Trim();
        r.VehicleId=b.VehicleId;r.Date=b.Date;r.Odometer=b.Odometer;r.Litres=b.Litres;r.EnteredUnitPrice=b.EnteredUnitPrice;r.QuantitySource=b.QuantitySource;r.Amount=b.Amount;r.Currency=b.Currency;r.FullTank=b.TankStatus=="Full";r.TankStatus=b.TankStatus;r.FuelGrade=b.FuelGrade;r.MissedFill=b.MissedFill;r.Station=(b.Station??"").Trim();r.Note=(b.Note??"").Trim();
    }
}
