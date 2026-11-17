using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private async Task<object> ConcertReport(string user, StoredDocument doc)
    {
        var music = (await InterestDocs(user, InterestPurchaseKind)).Select(InterestRead<InterestPurchase>).ToArray(); var c = InterestMerge(doc, music); var costs = ConcertRules.EffectiveCosts(c);
        var documents=await ConcertDocs(user);var sourceScenes=documents.Select(ConcertRead).ToArray();
        var all = documents.Select(d => InterestMerge(d, music)).ToArray();
        var allCosts = all.SelectMany(ConcertRules.EffectiveCosts).ToArray();
        var allRefunds = all.SelectMany(x => x.Refunds).ToArray();
        var ids = costs.Select(x => x.TransactionId).Concat(c.Refunds.Where(x => x.TransactionId != null).Select(x => x.TransactionId!)).Concat(ConcertIncomeLinks([c]).Concat(ConcertReturnLinks([c])).Select(p=>p.TransactionId)).Distinct().ToArray();
        var txs = await db.Transactions.AsNoTracking().Include(x => x.Entries).Where(x => x.UserId == user && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var payableBusinesses=await ConcertPayableBusinesses(user);
        bool ValidCost(ConcertCost x) => txs.TryGetValue(x.TransactionId, out var t) && t.Status == "Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow && t.Currency == c.Currency && (ConcertPersonalSource(t,payableBusinesses) || t.Type == "ReimbursementAdvance")
            && ConcertExpenseUse(t.Id,sourceScenes,music) <= t.Amount
            && (x.EntryId == null || t.Entries.Any(e => e.Id == x.EntryId && e.Kind == "Expense" && allCosts.Where(a => a.EntryId == e.Id && a.TransactionId == t.Id).Sum(a => ConcertRules.Amount(a.Amount)) <= e.Amount));
        var valid = costs.Where(ValidCost).ToArray();
        var warnings = costs.Where(x => !ValidCost(x)).Select(x => "费用 " + x.Id + " 的原交易已撤销、修改或超额，暂不计入，请重新核对分配。").ToList();
        bool ValidRefund(ConcertRefund r) => r.TransactionId != null && valid.Any(x => x.Id == r.CostId && txs.TryGetValue(r.TransactionId, out var t) && t.Type == "Refund" && t.Status == "Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow && t.Currency == c.Currency && t.OriginalTransactionId == x.TransactionId && allRefunds.Where(a => a.TransactionId == t.Id).Sum(a => ConcertRules.Amount(a.ReceivedAmount)) <= t.Amount);
        var refunds = c.Refunds.Where(ValidRefund).ToArray();
        warnings.AddRange(c.Refunds.Where(x => x.TransactionId != null && !ValidRefund(x)).Select(x => "退款 " + x.Id + " 尚未核实，暂不冲减成本。"));
        var companions = new List<object>(); decimal pending = 0, advanceMerchantRefunds = 0, ownLoss = 0;
        var artistMerchantReturns=new Dictionary<string,decimal>();var artistLosses=new Dictionary<string,decimal>();
        foreach (var person in c.Companions) {
            decimal settled = 0, remaining = 0, returned = 0, loss = 0;
            var linked = false;
            if (person.AdvanceId != null) {
                var a = await db.Set<ThirdPartyAdvance>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == person.AdvanceId);
                var cost = valid.SingleOrDefault(x => x.Id == person.CostId);
                if (a?.BusinessId != null && cost != null && txs[cost.TransactionId].BusinessId == a.BusinessId && a.Currency == c.Currency && a.Amount - a.OwnAmount == ConcertRules.Amount(cost.Amount)) {
                    var business = await BusinessEntity(user, a.BusinessId); var totalSettled = await Settled(user, business);
                    var changes = await (from adjustment in db.Set<AdvanceAdjustment>() join t in db.Transactions on adjustment.TransactionId equals t.Id where adjustment.UserId == user && adjustment.AdvanceId == a.Id && t.Status != "Deleted" select adjustment).AsNoTracking().ToArrayAsync();
                    returned = changes.Where(x => x.Action == "MerchantRefund").Sum(x => x.Amount);
                    loss = changes.Where(x => x.Action is "Gift" or "WriteOff").Sum(x => x.Amount);
                    settled = Math.Max(0, totalSettled - returned - loss); remaining = Math.Max(0, business.Principal - totalSettled);
                    pending += remaining; advanceMerchantRefunds += returned; ownLoss += loss; linked = true;
                    artistMerchantReturns[cost.Id]=artistMerchantReturns.GetValueOrDefault(cost.Id)+returned;
                    artistLosses[cost.Id]=artistLosses.GetValueOrDefault(cost.Id)+loss;
                } else warnings.Add("同行代付关联已变化，请核对 " + person.Id);
            }
            companions.Add(new { person.Id, person.Name, person.Holder, person.Payer, person.Bearer, person.Ratio, person.Amount, person.AdvanceId, person.CostId, linked, settled = M(settled), pending = M(remaining), merchantRefund = M(returned), giftOrWriteOff = M(loss) });
        }
        var gross = valid.Sum(x => ConcertRules.Amount(x.Amount));
        var received = refunds.Sum(x => ConcertRules.Amount(x.ReceivedAmount)) + advanceMerchantRefunds;
        var actual = gross - received;
        var personal = valid.Where(x => ConcertPersonalSource(txs[x.TransactionId],payableBusinesses)).Sum(x => ConcertRules.Amount(x.Amount)) - refunds.Sum(x => ConcertRules.Amount(x.ReceivedAmount)) + ownLoss;
        var budget = ConcertRules.Amount(c.TotalBudget); var planned = c.Plans.Where(x => x.State == "Planned").Sum(x => ConcertRules.Amount(x.Amount));
        var byCategory = ConcertRules.Categories.Select(category => {
            var part = valid.Where(x => x.Category == category).Sum(x => ConcertRules.Amount(x.Amount));
            var refund = refunds.Where(x => valid.Any(a => a.Id == x.CostId && a.Category == category)).Sum(x => ConcertRules.Amount(x.ReceivedAmount));
            return new { category, original = M(part), refunds = M(refund), actual = M(part - refund), share = actual > 0 ? decimal.Round((part - refund) / actual * 100, 2) : 0 };
        }).ToArray();
        // Merchant returns use the advance's original category, so category totals reconcile with the scene total.
        var merchantByCategory = new Dictionary<string, decimal>();
        foreach (var person in c.Companions.Where(x => x.AdvanceId != null)) {
            var cost = valid.SingleOrDefault(x => x.Id == person.CostId); if (cost == null) continue;
            var a = await db.Set<ThirdPartyAdvance>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == person.AdvanceId); if (a == null) continue;
            var returned = await (from adj in db.Set<AdvanceAdjustment>() join t in db.Transactions on adj.TransactionId equals t.Id where adj.UserId == user && adj.AdvanceId == a.Id && adj.Action == "MerchantRefund" && t.Status != "Deleted" select (decimal?)adj.Amount).SumAsync() ?? 0;
            merchantByCategory[cost.Category] = merchantByCategory.GetValueOrDefault(cost.Category) + returned;
        }
        var categories = byCategory.Select(x => { var refund = ConcertRules.Amount(x.refunds) + merchantByCategory.GetValueOrDefault(x.category); var net = ConcertRules.Amount(x.original) - refund; return new { x.category, x.original, refunds = M(refund), actual = M(net), share = actual > 0 ? decimal.Round(net / actual * 100, 2) : 0 }; }).ToArray();
        var budgets = ConcertRules.BudgetCategories.Select(category => {
            var limit = c.Budgets.Where(x => x.Category == category).Sum(x => ConcertRules.Amount(x.Amount));
            var used = categories.Where(x => ConcertRules.BudgetCategory(x.category) == category).Sum(x => Money(x.actual));
            var plan = c.Plans.Where(x => x.State == "Planned" && ConcertRules.BudgetCategory(x.Category) == category).Sum(x => ConcertRules.Amount(x.Amount));
            return new { category, budget = M(limit), actual = M(used), planned = M(plan), remaining = M(limit - used), overspent = M(Math.Max(0, used - limit)) };
        }).ToArray();
        var expenseIds = valid.Where(x => ConcertPersonalSource(txs[x.TransactionId],payableBusinesses)).Select(x => x.TransactionId).Distinct().ToArray();
        var payableRows=new List<object>();decimal pendingPayables=0;
        foreach(var businessId in expenseIds.Select(tx=>txs[tx].BusinessId).Where(id=>id!=null).Distinct()) {
            var business=await BusinessEntity(user,businessId!);var settled=await Settled(user,business);var outstanding=Math.Max(0,business.Principal-settled);pendingPayables+=outstanding;
            payableRows.Add(new{business.Id,business.Counterparty,principal=M(business.Principal),settled=M(settled),outstanding=M(outstanding),version=business.Version.ToString()});
        }
        var unmatched = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Type == "Refund" && x.Status == "Confirmed" && expenseIds.Contains(x.OriginalTransactionId!)).ToArrayAsync();
        if (unmatched.Any(t => allRefunds.Where(x => x.TransactionId == t.Id).Sum(x => ConcertRules.Amount(x.ReceivedAmount)) < t.Amount)) warnings.Add("关联消费存在尚未分配的实际退款，请在退款页明确归属金额；未分配部分暂不冲减本场成本。");
        var artistAttribution=await ConcertArtistBreakdown(user,doc.Id,c,valid,refunds,expenseIds.ToHashSet(),artistMerchantReturns,artistLosses,music);
        var adjustmentIds=(await db.Set<AdvanceAdjustment>().AsNoTracking().Where(a=>a.UserId==user && ids.Contains(a.TransactionId)).Select(a=>a.TransactionId).ToArrayAsync()).ToHashSet();
        var ticketTransfers=ConcertTransferReport(c,sourceScenes,music,txs,warnings,adjustmentIds);
        var insuranceRecovery=ConcertInsuranceReport(c,sourceScenes,music,txs,warnings);
        var outcomes=c.Orders.SelectMany(o=>(o.Tickets??[]).Where(t=>t.Outcome?.State=="Unused").Select(t=> {
            var orderCosts=ConcertRules.EffectiveCosts(c with{Orders=[o],Costs=[]});var ownCap=orderCosts.Where(x=>expenseIds.Contains(x.TransactionId)).Sum(x=>Money(x.Amount))+orderCosts.Sum(x=>artistLosses.GetValueOrDefault(x.Id));
            var personalAllocated=(o.Tickets??[]).Where(t=>t.Outcome?.State=="Unused").Sum(t=>Money(t.PersonalShare??t.PaidShare??"0"));
            var verified=orderCosts.All(x=>valid.Any(v=>v.Id==x.Id)) && personalAllocated<=ownCap && !c.Refunds.Any(r=>ConcertRules.OrderCost(r.CostId,o.Id) && r.TransactionId!=null && (r.TicketId==null || !refunds.Any(v=>v.Id==r.Id)));
            var paid=verified?Money(t.PersonalShare??t.PaidShare??"0"):0;var refunded=refunds.Where(r=>r.TicketId==t.Id).Sum(r=>Money(r.ReceivedAmount));
            var transfer=ticketTransfers.Rows.Where(r=>r.TicketId==t.Id).Sum(r=>Money(r.NetRecovery));
            var claim=ConcertInsuranceReport(c with{Insurance=(c.Insurance??[]).Where(i=>i.TicketId==t.Id).ToArray()},sourceScenes,music,txs,[]);
            if(!verified) warnings.Add("未使用门票 "+t.Id+" 的费用/退款来源待核对，暂不计入损失分项。");
            return new {ticketId=t.Id,verified,paid=M(paid),refund=M(refunded),recovery=M(transfer+Money(claim.NetRecovery)),unusedBurden=M(verified?Math.Max(0,paid-refunded-transfer-Money(claim.NetRecovery)):0)};
        })).ToArray();
        var finalPersonal=M(personal-Money(ticketTransfers.NetRecovery)-Money(insuranceRecovery.NetRecovery));
        return new { currency = c.Currency, totalBudget = M(budget), originalCosts = M(gross), confirmedRefunds = M(received), actual = M(actual), personalNetCost = M(personal), planned = M(planned), remaining = M(budget - actual), availableAfterPlans = M(budget - actual - planned), overspent = M(Math.Max(0, actual - budget)), budgetUsage = budget > 0 ? (decimal?)decimal.Round(actual / budget * 100, 2) : null, pendingAdvances = M(pending), pendingPayables=M(pendingPayables), payables=payableRows, categories, budgets, companions, artistAttribution, ticketTransfers, insuranceRecovery, ticketOutcomes=outcomes, unusedBurden=M(outcomes.Sum(o=>Money(o.unusedBurden))), finalPersonalCost=finalPersonal, closingReviewRequired=c.Closing?.State=="Closed" && (warnings.Count>0 || pending>0 || pendingPayables>0), personalAfterTransfers=M(personal-Money(ticketTransfers.NetRecovery)), verifiedRefunds=refunds, costs = valid, warnings };
    }
    public async Task<object> ConcertAnnualReport(string user, int year, string currency)
    {
        await RequireConcerts(user); Require(year is >= 1900 and <= 9900 && CurrencyDefinitions.Supports(currency), "年度或币种无效");
        var selected = (await ConcertDocs(user)).Where(d => ConcertRules.LocalStart(ConcertRead(d)).Year == year && ConcertRead(d).Currency == currency).ToArray();
        var rows = new List<System.Text.Json.JsonElement>();
        foreach (var d in selected) { var c = ConcertRead(d); rows.Add(System.Text.Json.JsonSerializer.SerializeToElement(new { d.Id, c.Title, c.Artist, artistId = c.ArtistLink?.ArtistId, c.City, c.State, startsAt = ConcertRules.LocalStart(c), timeZone = c.TimeZone ?? ConcertRules.DefaultTimeZone, report = await ConcertReport(user, d) }, Json)); }
        decimal Cost(System.Text.Json.JsonElement r) => Money(r.GetProperty("report").GetProperty("personalNetCost").GetString());
        var sum = rows.Sum(Cost);
        var insuranceRecovery=rows.Sum(r=>Money(r.GetProperty("report").GetProperty("insuranceRecovery").GetProperty("netRecovery").GetString()));
        var transferRecovery=rows.Sum(r=>Money(r.GetProperty("report").GetProperty("ticketTransfers").GetProperty("netRecovery").GetString()));
        var categoryTotal = rows.Sum(x => Money(x.GetProperty("report").GetProperty("actual").GetString()));
        var artistNames = (await InterestDocs(user, "MusicTopic")).Where(d => InterestRead<InterestTopic>(d).Kind == "Artist").ToDictionary(d => d.Id, d => InterestRead<InterestTopic>(d).Name);
        return new { year, currency, count = rows.Count, attended = rows.Count(x => x.GetProperty("state").GetString() == "Attended"), totalCost = M(sum), transferRecovery=M(transferRecovery), totalCostAfterTransfers=M(sum-transferRecovery), insuranceRecovery=M(insuranceRecovery), finalPersonalCost=M(sum-transferRecovery-insuranceRecovery), average = M(rows.Count > 0 ? sum / rows.Count : 0), highest = rows.Count > 0 ? (System.Text.Json.JsonElement?)rows.OrderByDescending(Cost).First() : null, artists = ConcertYearArtistSummary(rows,artistNames), cities = rows.GroupBy(x => x.GetProperty("city").GetString()).Select(g => new { name = g.Key, count = g.Count(), cost = M(g.Sum(Cost)) }), months = Enumerable.Range(1, 12).Select(month => new { month, cost = M(rows.Where(x => x.GetProperty("startsAt").GetDateTimeOffset().Month == month).Sum(Cost)) }), categories = ConcertRules.Categories.Select(category => { var cost = rows.Sum(r => r.GetProperty("report").GetProperty("categories").EnumerateArray().Where(x => x.GetProperty("category").GetString() == category).Sum(x => Money(x.GetProperty("actual").GetString()))); return new { category, cost = M(cost), share = categoryTotal > 0 ? decimal.Round(cost / categoryTotal * 100, 2) : 0 }; }), scenes = rows, rule = "按场次当地时区的演出日期归属年度和月份（旧档案默认Asia/Shanghai），按所选原币分别统计；个人净成本仅包含本人正式费用及已确认损失，计划分摊不作为收款；年度分类为全场已发生净费用。联合费用按逐笔费用的明确比例分币，退款按原分币金额冲减；商品沿用商品独立分配。艺人关联场次数可交叉，金额含未分配项且不重复累计。票款回收另列，不当退款、不冲回原预算或艺术家消费排行；回收后净负担=原个人成本-有效净回收，未收约定额不计资产。" };
    }
}


