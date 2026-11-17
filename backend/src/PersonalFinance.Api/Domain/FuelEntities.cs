namespace PersonalFinance.Api.Domain;
public sealed class FuelVehicle : Owned
{
    public string Name { get; set; } = "";
    public string Plate { get; set; } = "";
    public string FuelType { get; set; } = "Petrol";
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public int? ModelYear { get; set; }
    public string EnergyType { get; set; } = "Unknown";
    public decimal? TankCapacity { get; set; }
    public string? Engine { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchaseAmount { get; set; }
    public string? PurchaseCurrency { get; set; }
    public decimal? InitialOdometer { get; set; }
    public decimal? CurrentOdometer { get; set; }
    public decimal? AnnualDistance { get; set; }
    public string Status { get; set; } = "Active";
    public string? Note { get; set; }
}
public sealed class FuelRecord : Owned
{
    public TimeOnly? OccurredTime { get; set; }
    public bool OdometerReset { get; set; }
    public decimal? PostedUnitPrice { get; set; }
    public decimal? OriginalAmount { get; set; }
    public decimal? Discount { get; set; }
    public decimal? PointsRedemption { get; set; }
    public string? PaymentMethod { get; set; }
    public string? DrivingScene { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public string VehicleId { get; set; } = "";
    public DateOnly Date { get; set; }
    public decimal? Odometer { get; set; }
    public decimal? EnteredUnitPrice { get; set; }
    public string QuantitySource { get; set; } = "Manual";
    public decimal Litres { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public bool FullTank { get; set; }
    public string TankStatus { get; set; } = "Unknown";
    public bool MissedFill { get; set; }
    public string Station { get; set; } = "";
    public string FuelGrade { get; set; } = "Unknown";
    public string Note { get; set; } = "";
}
