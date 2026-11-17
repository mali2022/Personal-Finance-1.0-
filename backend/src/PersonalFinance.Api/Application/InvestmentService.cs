using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public static string D(decimal value) => value.ToString("0.########", CultureInfo.InvariantCulture);
    public static decimal InvestmentDecimal(string value, bool positive = false)
    {
        Require(System.Text.RegularExpressions.Regex.IsMatch(value ?? "", @"^\d{1,10}(\.\d{1,8})?$"), "数量或价格格式无效，最多10位整数和8位小数");
        var n = decimal.Parse(value!, CultureInfo.InvariantCulture);
        Require(!positive || n > 0, "数量或价格必须大于零"); return n;
    }
    private async Task<InvestmentAsset> Investment(string user, string id) => await db.Set<InvestmentAsset>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "投资资产不存在");
    private static object InvestmentView(InvestmentAsset a) => new { a.Id, a.Name, a.Type, a.Code, a.Market, a.Currency, a.AccountId, a.Unit, a.State, a.Note, a.CreatedAt, a.UpdatedAt, version = a.Version.ToString() };
    public async Task<object> InvestmentAssets(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<InvestmentAsset>().AsNoTracking().Where(x => x.UserId == user);
        var account = query["accountId"].ToString(); if (account != "") q = q.Where(x => x.AccountId == account);
        var name = query["keyword"].ToString(); if (name != "") q = q.Where(x => x.Name.Contains(name) || x.Code.Contains(name));
        var rows = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(InvestmentView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> InvestmentAssetDetail(string user, string id) => InvestmentView(await Investment(user, id));
    public async Task<object> SaveInvestmentAsset(string user, InvestmentAssetInput input, string? id, string? version)
    {
        Require(input.Name.Trim().Length is > 0 and <= 150 && input.Code.Length <= 80 && input.Market.Length <= 80 && input.Unit.Length is > 0 and <= 20 && input.Note.Length <= 2000, "资产名称、代码、市场、单位或备注无效");
        Require(new[] { "Stock", "ETF", "Fund", "Bond", "Gold", "CashManagement", "Wealth", "Other" }.Contains(input.Type), "资产类型无效");
        Require(input.State is "Active" or "Archived", "资产状态无效");
        var account = await Account(user, input.AccountId, id == null);
        Require(account.Type == "Investment" && account.Currency == input.Currency, "请选择同币种的现有投资资金账户");
        var a = id == null ? new InvestmentAsset { UserId = user, AccountId = account.Id, Currency = input.Currency, Type = input.Type, Code = input.Code.Trim(), Market = input.Market.Trim() } : await Investment(user, id);
        if (id != null) { Version(a, version); Require(a.AccountId == input.AccountId && a.Currency == input.Currency && a.Type == input.Type && a.Code == input.Code.Trim() && a.Market == input.Market.Trim(), "已有资产的账户、币种及识别关系不可改变"); a.Version++; }
        Require(a.Code == "" || !await db.Set<InvestmentAsset>().AnyAsync(x => x.UserId == user && x.Id != a.Id && x.AccountId == a.AccountId && x.Market == a.Market && x.Type == a.Type && x.Code == a.Code), "同账户已有相同市场、类型与代码的资产");
        a.Name = input.Name.Trim(); a.Unit = input.Unit.Trim(); a.State = input.State; a.Note = input.Note; a.UpdatedAt = DateTimeOffset.UtcNow;
        if (id == null) db.Add(a); return InvestmentView(a);
    }
    private static object TradeView(InvestmentTrade t) => new { t.Id, t.AssetId, t.Type, t.Date, t.SettlementDate, quantity = D(t.Quantity), price = D(t.Price), amount = M(t.Amount), commission = M(t.Commission), tax = M(t.Tax), otherFee = M(t.OtherFee), t.TransactionId, t.OwnsTransaction, t.State, t.Note, t.CreatedAt, version = t.Version.ToString() };
    public async Task<object> InvestmentTrades(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user);
        var asset = query["assetId"].ToString(); if (asset != "") q = q.Where(x => x.AssetId == asset);
        var rows = await q.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(TradeView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> InvestmentTradeDetail(string user, string id) => TradeView(await db.Set<InvestmentTrade>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "投资交易不存在"));
    public async Task<object> SaveInvestmentTrade(string user, InvestmentTradeInput b, string? version)
    {
        var a = await Investment(user, b.AssetId); Version(a, version); Require(a.State == "Active", "资产已归档");
        Require(b.Type is "Buy" or "Sell" or "Dividend" or "Interest" or "Fee" or "PositionIncrease" or "PositionDecrease", "投资交易类型无效");
        Require(b.Date.Year >= 1900 && b.SettlementDate >= b.Date && b.SettlementDate <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "只登记已结算交易，日期无效");
        Require(b.Note.Length <= 2000, "备注过长");
        var t = new InvestmentTrade { UserId = user, AssetId = a.Id, Type = b.Type, Date = b.Date, SettlementDate = b.SettlementDate, Quantity = InvestmentDecimal(b.Quantity), Price = InvestmentDecimal(b.Price), Commission = Money(b.Commission), Tax = Money(b.Tax), OtherFee = Money(b.OtherFee), Note = b.Note };
        Require(t.Commission >= 0 && t.Tax >= 0 && t.OtherFee >= 0, "费用不能为负");
        var fee = t.Commission + t.Tax + t.OtherFee;
        var adjustment = b.Type is "PositionIncrease" or "PositionDecrease";
        if(adjustment)
        {
            Require(t.Quantity>0 && t.Price==0 && fee==0 && b.TransactionId==null && b.Note.Trim().Length>0,"持仓调整须明确数量和原因，不能附带现金流水、价格或费用"); t.Amount=b.Type=="PositionIncrease"?Money(b.Amount,true):0;
        }
        else if (b.Type is "Buy" or "Sell") { Require(t.Quantity > 0 && t.Price > 0, "买卖数量与价格必须大于零"); t.Amount = InvestmentMath.Gross(t.Quantity, t.Price); Require(t.Amount > 0 && (b.Amount == "0" || Money(b.Amount) == t.Amount), "成交金额须等于数量乘价格四舍五入到分"); }
        else { Require(t.Quantity == 0 && t.Price == 0, "分红、利息、费用不改变数量"); t.Amount = Money(b.Amount, true); if (b.Type == "Fee") Require(fee == 0, "单独费用不应重复附带费用"); }
        var cash = InvestmentMath.CashMovement(t);
        Require(adjustment || cash != 0 && (b.Type is not ("Sell" or "Dividend" or "Interest") || cash > 0), "净到账须大于零");
        Require(t.Amount + fee <= 999999999999999999m, "投资金额超过账本范围");
        var previous = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && x.AssetId == a.Id && x.State == "Active").ToListAsync();
        Require(previous.Count < 20000, "单资产历史已达计算上限，请联系维护人员");
        InvestmentMath.ValidateHistory(previous.Append(t));
        Require(adjustment || await db.Set<AssetAggregationPolicy>().AnyAsync(x=>x.UserId==user && x.AccountId==a.AccountId && x.Mode=="CashOnly"), "请先在资产配置确认该投资资金账户余额仅代表现金，才能登记资金交易");
        var account = await Account(user, a.AccountId); Require(account.Currency == a.Currency, "账户币种不一致");
        if(adjustment) { /* Metadata only: no cash posting or ordinary income. */ }
        else if (!string.IsNullOrEmpty(b.TransactionId))
        {
            var linked = await Transaction(user, b.TransactionId);
            Require(linked.Status == "Confirmed" && linked.Currency == a.Currency && linked.BusinessId == null && linked.AccountId == a.AccountId, "资金流水无效或账户、币种不匹配");
            Require(linked.Entries.Where(e => e.Kind == "Account" && e.AccountId == a.AccountId).Sum(e => e.Amount) == cash, "资金流水净金额不一致");
            Require(b.Type is "Buy" or "Sell" ? linked.Type == "InvestmentPrincipal" : b.Type == "Fee" ? linked.Type == "Expense" : linked.Type == "Income", "本金只能关联投资本金流水；普通消费或收入不能直接作为买卖本金");
            Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && (x.FundingTransactionId == linked.Id || x.SettlementTransactionId == linked.Id || x.InterestTransactionId == linked.Id)), "资金流水已关联存款");
            Require(!await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == linked.Id && x.State == "Active"), "资金流水已关联投资，不能重复过账");
            t.TransactionId = linked.Id;
        }
        else
        {
            var when = new DateTimeOffset(b.SettlementDate.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8));
            var body = new SaveTransaction(b.Type is "Buy" or "Sell" ? "InvestmentPrincipal" : b.Type == "Fee" ? "Expense" : "Income", M(Math.Abs(cash)), a.AccountId, when, "投资：" + a.Name + "；" + b.Note, CategoryId: b.CategoryId, AdjustmentDirection: cash > 0 ? "Increase" : "Decrease");
            var result = await SaveTransaction(user, body, internalOperation: true);
            t.TransactionId = JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); t.OwnsTransaction = true;
        }
        db.Add(t); a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow; return TradeView(t);
    }
    public async Task<object> RevokeInvestmentTrade(string user, string id, InvestmentCorrectionInput b, string? version, bool preview)
    {
        var t = await db.Set<InvestmentTrade>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "投资交易不存在");
        Version(t, version); Require(!await db.Set<InvestmentHistory>().AnyAsync(x=>x.UserId==user && x.AssetId==t.AssetId && x.Kind=="Reinvestment" && x.SnapshotJson.Contains(t.Id)), "分红再投资须从事件历史成组撤销"); Require(t.State == "Active" && b.Reason.Trim().Length is > 0 and <= 2000, "请填写更正原因且交易须有效");
        var a = await Investment(user, t.AssetId);
        var rows = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && x.AssetId == a.Id && x.State == "Active" && x.Id != id).ToArrayAsync();
        var cost = InvestmentMath.ValidateHistory(rows);
        if(t.Type is "PositionIncrease" or "PositionDecrease")
        {
            if(!preview) { db.Add(new InvestmentHistory {UserId=user,AssetId=a.Id,ResourceId=t.Id,Kind="PositionCorrection",SnapshotJson=JsonSerializer.Serialize(TradeView(t),Json),Reason=b.Reason}); t.State="Revoked";t.Version++;a.Version++;a.UpdatedAt=DateTimeOffset.UtcNow; }
            return new {t.Id,quantity=D(cost.Quantity),cost=D(cost.Cost),realized=D(cost.Realized),warning="持仓调整撤销仅重算投资历史，不改变资金账本"};
        }
        Require(t.OwnsTransaction, "关联已有流水须先人工核对，目前禁止自动撤销外部流水");
        var linked = await Transaction(user, t.TransactionId!);
        var when = linked.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd");
        Require(!await db.Reconciliations.AnyAsync(x => x.UserId == user && x.AccountId == a.AccountId && x.CreatedAt >= linked.OccurredAt), "存在后续对账，请先核实对账影响");
        if (!preview)
        {
            db.Add(new InvestmentHistory { UserId = user, AssetId = a.Id, ResourceId = t.Id, Kind = "Revoke", SnapshotJson = JsonSerializer.Serialize(TradeView(t), Json), Reason = b.Reason });
            await ChangeTransaction(user, linked.Id, false, linked.Version.ToString(), investmentOperation: true);
            t.State = "Revoked"; t.Version++; a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow;
        }
        return new { t.Id, date = when, quantity = D(cost.Quantity), cost = D(cost.Cost), realized = D(cost.Realized), warning = "撤销后按完整有效历史重算；更正请另建替代交易。" };
    }
    private static object ValuationView(InvestmentValuation v) => new { v.Id, v.AssetId, v.Date, price = D(v.Price), v.Source, v.Method, v.CreatedAt, version = v.Version.ToString() };
    public async Task<object> InvestmentValuations(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var asset = query["assetId"].ToString(); var q = db.Set<InvestmentValuation>().AsNoTracking().Where(x => x.UserId == user && (asset == "" || x.AssetId == asset));
        var rows = await q.OrderByDescending(x => x.Date).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(ValuationView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveInvestmentValuation(string user, InvestmentValuationInput b, string? version)
    {
        var a = await Investment(user, b.AssetId); Require(b.Date.Year >= 1900 && b.Date <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "估值日期无效");
        Require(b.Source.Trim().Length is > 0 and <= 200, "请填写估值依据，最多200字");
        var price = InvestmentDecimal(b.Price); var v = await db.Set<InvestmentValuation>().SingleOrDefaultAsync(x => x.UserId == user && x.AssetId == a.Id && x.Date == b.Date);
        if (v == null) { v = new InvestmentValuation { UserId = user, AssetId = a.Id, Date = b.Date }; db.Add(v); }
        else { Version(v, version); Require(b.Reason?.Trim().Length is > 0 and <= 2000, "同日期更正须填写原因"); db.Add(new InvestmentHistory { UserId = user, AssetId = a.Id, ResourceId = v.Id, Kind = "ValuationCorrection", SnapshotJson = JsonSerializer.Serialize(ValuationView(v), Json), Reason = b.Reason! }); v.Version++; }
        v.Price = price; v.Source = b.Source.Trim(); a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow; return ValuationView(v);
    }
    public async Task<object> InvestmentImportPreview(string user, InvestmentImportInput b, bool apply)
    {
        Require(b.Items.Length is > 0 and <= 200, "估值导入须为1至200行");
        Require(b.Items.Select(x => (x.AssetId, x.Date)).Distinct().Count() == b.Items.Length, "文件包含重复资产日期");
        var rows = new List<object>();
        foreach (var row in b.Items)
        {
            await Investment(user, row.AssetId); InvestmentDecimal(row.Price);
            Require(row.Source.Trim().Length is > 0 and <= 200 && row.Date.Year >= 1900 && row.Date <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "估值来源或日期无效");
            Require(!await db.Set<InvestmentValuation>().AnyAsync(x => x.UserId == user && x.AssetId == row.AssetId && x.Date == row.Date), "批量导入禁止覆盖已有日期，请单独受控更正");
            rows.Add(apply ? await SaveInvestmentValuation(user, row, null) : new { row.AssetId, row.Date, row.Price, row.Source });
        }
        return new { items = rows, applied = apply };
    }
    public async Task<object> InvestmentPositions(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var date = query["date"].ToString(); var at = date == "" ? DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date) : DateOnly.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var q = db.Set<InvestmentAsset>().AsNoTracking().Where(x => x.UserId == user); var asset = query["assetId"].ToString(); if (asset != "") q = q.Where(x => x.Id == asset);
        var assets = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); var ids = assets.Select(x => x.Id).ToArray();
        var trades = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.AssetId) && x.State == "Active" && x.SettlementDate <= at).ToArrayAsync();
        Require(trades.Length <= 100000, "查询历史超过计算上限，请缩小资产范围");
        var valuations = await db.Set<InvestmentValuation>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.AssetId) && x.Date <= at && !db.Set<InvestmentValuation>().Any(v => v.UserId == user && v.AssetId == x.AssetId && v.Date <= at && v.Date > x.Date)).ToArrayAsync();
        var rows = assets.Select(a => { var cost = InvestmentMath.Calculate(trades.Where(t => t.AssetId == a.Id)); var v = valuations.SingleOrDefault(v => v.AssetId == a.Id); decimal? market = v == null ? null : InvestmentMath.Gross(cost.Quantity, v.Price); return new { asset = InvestmentView(a), quantity = D(cost.Quantity), availableQuantity = D(cost.Quantity), cost = D(cost.Cost), averageCost = cost.Quantity == 0 ? null : D(cost.Cost / cost.Quantity), marketValue = market == null ? null : M(market.Value), price = v == null ? null : D(v.Price), valuationDate = v?.Date, valuationSource = v?.Source, realized = D(cost.Realized), income = M(cost.Income), fees = M(cost.Fees), unrealized = market == null ? null : D(market.Value - cost.Cost), returnPercent = market == null || cost.Cost == 0 ? null : D((market.Value - cost.Cost) / cost.Cost * 100), lastTradeDate = trades.Where(t => t.AssetId == a.Id).Select(t => (DateOnly?)t.Date).Max() }; }).ToArray();
        return new { items = rows, total = await q.CountAsync(), page, pageSize = size, date = at, scope = "移动加权平均；买入费用资本化，卖出费用从净所得扣除；分红利息净到账单列。只含已结算持仓，多币种不合并；没有估值不以成本冒充。" };
    }
    public async Task<object> InvestmentHistoryList(string user, string id, IQueryCollection query)
    {
        await Investment(user, id); var (page, size) = Paging(query); var q = db.Set<InvestmentHistory>().AsNoTracking().Where(x => x.UserId == user && x.AssetId == id);
        return new { items = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.Kind, x.ResourceId, x.Reason, x.SnapshotJson, x.CreatedAt, version=x.Version.ToString() }).ToArrayAsync(), total = await q.CountAsync(), page, pageSize = size };
    }
}






