const musicInterestPath =
  /^\/concerts\/interests\/(?:batch-link|(?:topics|links|budgets|purchases)(?:\/[a-fA-F0-9-]{36}(?:\/(?:advice|approval))?)?)$/;
const concertP1Path=/^\/concerts\/(?:trips|collections|planning-budgets|experiences\/(?:venues|seats|memories))(?:\/[a-fA-F0-9-]{36})?$/;
const concertPayablePath=/^\/concerts\/payables(?:\/[a-fA-F0-9-]{36}\/refund)?$/;
const festivalPath =
  /^\/festivals(?:\/recipients(?:\/[a-fA-F0-9-]{36})?|\/[a-fA-F0-9-]{36}(?:\/(?:allocations(?:\/[a-fA-F0-9-]{36}\/revoke)?|reviews|repeat|ai-plans(?:\/[a-fA-F0-9-]{36}\/adopt)?|purchases\/[a-fA-F0-9-]{36}\/approval))?)?$/;
const collaborationPath =
  /^\/(?:spaces(?:\/[a-fA-F0-9-]{36}(?:\/(?:members(?:\/[a-fA-F0-9-]{36})?|budget|invitations(?:\/[a-fA-F0-9-]{36}\/revoke)?|settlements(?:\/[a-fA-F0-9-]{36}\/revoke)?))?)?|space-invitations\/[a-fA-F0-9-]{36}\/accept)$/;
export interface PendingOperation {
  key: string;
  fingerprint: string;
  method: string;
  path: string;
  body: unknown;
  version?: string;
  createdAt: string;
}
const accountPath =
  /^\/(?:accounts(?:\/reorder|\/[a-fA-F0-9-]{36}(?:\/(?:archive|unarchive|card))?)?|account-groups(?:\/[a-fA-F0-9-]{36})?)$/;
const fuelPath =
  /^\/fuel\/(?:vehicles|records)(?:\/[a-fA-F0-9-]{36}(?:\/delete)?)?$/;
const smartReconciliationPath =
  /^\/smart-reconciliation\/(?:import|allocations\/confirm|rules(?:\/[a-fA-F0-9-]{36})?|tasks(?:\/[a-fA-F0-9-]{36}\/step)?|batch\/execute|balance\/complete|[a-fA-F0-9-]{36}\/(?:confirm|resolve|correct))$/;
const aiDraftDeletePath =
  /^\/ai\/drafts\/[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const aiAgentRecoverablePath =
  /^\/ai\/agent\/(?:tasks|grants|workflows\/[a-fA-F0-9-]{36}\/run)$/;
export const journalMethodAllowed = (method: string, path: string) =>
  path.startsWith('/ai/')
    ? (method === 'post' && path === '/ai/drafts/confirm-batch') ||
      (method === 'post' && aiAgentRecoverablePath.test(path)) ||
      (method === 'delete' && aiDraftDeletePath.test(path))
    : ['post', 'put'].includes(method) ||
      (method === 'delete' &&
        /^(?:\/accounts|\/account-groups|\/payroll-center\/(?:slips|plans|contributions))\/[a-fA-F0-9-]{36}$/.test(
          path,
        ));
const aiDraftPath = (path: string) =>
  path === '/ai/drafts/confirm-batch' ||
  aiDraftDeletePath.test(path) ||
  aiAgentRecoverablePath.test(path);
let owner: string | undefined;
export const journalEvent = 'finance:operation-journal';
export function setJournalOwner(user?: string) {
  owner = user;
  window.dispatchEvent(new Event(journalEvent));
}
export const journalOwner = () => owner;
const storageKey = (user: string) => `pf.operations.v1:${user}`;
const categoryCsvPath = /^\/categories\/(?:import|batch-delete)$/;
const defaultPricePath = /^\/product-prices\/defaults$/;
const defaultTagPath = /^\/directory\/tags\/defaults$/;
const promotionPath =
  /^\/(?:promotions(?:\/(?:transfer-drafts(?:\/[a-fA-F0-9-]{36}\/(?:confirm|revoke))?|[a-fA-F0-9-]{36}))?|cashbacks(?:\/[a-fA-F0-9-]{36}\/(?:settle|revoke|recover))?|cashback-recoveries\/[a-fA-F0-9-]{36}\/revoke|promotion-usages\/[a-fA-F0-9-]{36}\/return)$/;
const planningPath =
  /^\/(?:memories\/bookmarks|settings\/modules|concerts(?:\/tours(?:\/[a-fA-F0-9-]{36})?|\/[a-fA-F0-9-]{36})?|loan-schedules(?:\/[a-fA-F0-9-]{36})?|debt-plans(?:\/[a-fA-F0-9-]{36}(?:\/allocations(?:\/[a-fA-F0-9-]{36}\/revoke)?)?)?|analysis-attributes|budgets\/copy-apply|budgets\/carryovers\/[a-fA-F0-9-]{36}\/correct|cashflow\/scenarios(?:\/[a-fA-F0-9-]{36}(?:\/(?:changes|calculate))?)?)$/;
const spendingIntelligencePath =
  /^\/spending-value\/(?:optimize|preferences(?:\/reset)?|feedback(?:\/[a-fA-F0-9-]{36}(?:\/revoke)?)?|runs\/[a-fA-F0-9-]{36}\/reevaluate)$/;
const spendingApprovalPath =
  /^\/spending-approvals(?:\/settings|\/[a-fA-F0-9-]{36}(?:\/(?:actions|evaluate|delete|answers|installment|images))?)?$/;
const spendingValuePath = /^\/spending-value(?:\/[a-fA-F0-9-]{36})?$/;
const lifeSimulationPath =
  /^\/life-simulator\/(?:snapshots|runs|monte-carlo|scenarios(?:\/[a-fA-F0-9-]{36}(?:\/delete)?)?)$/;
const assetPath =
  /^\/(?:term-deposits(?:\/[a-fA-F0-9-]{36}(?:\/(?:settle|correct))?)?|physical-categories(?:\/[a-fA-F0-9-]{36}(?:\/remove)?)?|physical-assets(?:\/[a-fA-F0-9-]{36}(?:\/(?:valuations|profile|rules|events|costs(?:\/[a-fA-F0-9-]{36}\/reverse)?))?)?|fx-valuation-rates|assets\/aggregation-policy|reports\/custom(?:\/export|\/[a-fA-F0-9-]{36}(?:\/delete)?)?)$/;
const investmentPath =
  /^\/investments\/(?:boundary-values|assets(?:\/[a-fA-F0-9-]{36}(?:\/project)?)?|(?:trades|reinvestments)(?:\/[a-fA-F0-9-]{36}\/correct)?|valuations(?:\/import)?)$/;
const importCleaningPath =
  /^\/(?:merchant-master\/(?:[a-fA-F0-9-]{36}\/(?:aliases|merge)|aliases\/[a-fA-F0-9-]{36}\/remove)|imports\/[a-fA-F0-9-]{36}\/(?:normalize-merchants|cleaning\/[a-fA-F0-9-]{36}\/undo|suggestions\/[a-fA-F0-9-]{36}\/decision))$/;
const payrollCenterPath =
  /^\/payroll-center\/(?:employers|employments|plans|policies|fund-accounts|fund-events|tax-rules|declarations|contributions|slips|tax-simulations|wage-scenarios|imports)(?:\/(?:[a-fA-F0-9-]{36}|generate|sync))?(?:\/(?:actions|copy|reconcile|unlink|preview|commit))?$/;
const stageGPath =
  /^\/(?:currencies\/(?:CNY|USD|HKD)|payment-instruments(?:\/[a-fA-F0-9-]{36})?|authorized-payments|external-payment-facts|fund-holds(?:\/[a-fA-F0-9-]{36}\/(?:actions|correct))?|prepayments(?:\/[a-fA-F0-9-]{36}\/(?:settle|correct))?|payroll(?:\/[a-fA-F0-9-]{36}(?:\/(?:reconcile|unlink))?)?|social-contributions(?:\/[a-fA-F0-9-]{36})?|housing-fund(?:\/[a-fA-F0-9-]{36})?|product-prices|living-cost\/baskets|advances(?:\/plans(?:\/[a-fA-F0-9-]{36}(?:\/(?:purchase|cancel))?)?|\/groups|\/[a-fA-F0-9-]{36}\/(?:settle|delivery|resolve))?)$/;
const reportCenterPath =
  /^\/reports\/center\/(?:archives(?:\/[a-fA-F0-9-]{36}\/delete)?|preferences)$/;
const timeAssetsPath =
  /^\/time-assets\/(?:activities(?:\/[a-fA-F0-9-]{36})?|batch|timer(?:\/[a-fA-F0-9-]{36}\/(?:pause|resume|stop))?|valuations|(?:budgets|templates|projects)(?:\/[a-fA-F0-9-]{36})?|templates\/[a-fA-F0-9-]{36}\/apply|links|(?:activities|budgets|templates|projects|links)\/[a-fA-F0-9-]{36}\/delete)$/;
const safePath =
  /^\/(?:annual-budgets\/\d{4}(?:\/monthly-apply)?|budgets\/(?:carryover-apply|carryovers\/[a-fA-F0-9-]{36}\/actions)|budget-templates(?:\/[a-fA-F0-9-]{36}(?:\/apply)?)?|budget-alerts\/(?:settings|evaluate|[a-fA-F0-9-]{36}\/dismiss)|savings-goals(?:\/[a-fA-F0-9-]{36}(?:\/(?:allocate|release|transfer))?)?|essential-expense-policies|cashflow\/events(?:\/[a-fA-F0-9-]{36}(?:\/(?:actions|correct))?)?|directory\/(?:merchants|projects)|directory\/(?:merchants|tags|projects)\/batch-delete|transactions\/(?:batch-(?:apply|delete)|[a-fA-F0-9-]{36}\/review)|transactions\/(?:[a-zA-Z0-9-]+\/)?(?:expense|income|transfer|refund|creditcardpayment|assetloss)|business(?:\/[a-zA-Z0-9-]+\/settlements)?|imports\/[a-zA-Z0-9-]+\/commit|reconciliations|exports|recurring-rules(?:\/[a-fA-F0-9-]{36}(?:\/(?:actions|correct))?)?|recurring-occurrences\/[a-fA-F0-9-]{36}\/actions|subscriptions(?:\/[a-fA-F0-9-]{36})?|automation-rules(?:\/(?:[a-fA-F0-9-]{36}|apply))?)$/;
export function pendingOperations(user: string): PendingOperation[] {
  const raw = sessionStorage.getItem(storageKey(user));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (item: unknown) =>
        !item ||
        typeof item !== 'object' ||
        !('key' in item) ||
        typeof item.key !== 'string' ||
        !('fingerprint' in item) ||
        typeof item.fingerprint !== 'string' ||
        !('path' in item) ||
        typeof item.path !== 'string' ||
        !('method' in item) ||
        !journalMethodAllowed(String(item.method), item.path) ||
        !(
          categoryCsvPath.test(item.path) ||
          accountPath.test(item.path) ||
          collaborationPath.test(item.path) ||
          fuelPath.test(item.path) ||
          safePath.test(item.path) ||
          reportCenterPath.test(item.path) ||
          promotionPath.test(item.path) ||
          planningPath.test(item.path) ||
          festivalPath.test(item.path) ||
          musicInterestPath.test(item.path) || concertPayablePath.test(item.path) || concertP1Path.test(item.path) ||
          spendingIntelligencePath.test(item.path) ||
          spendingValuePath.test(item.path) ||
          spendingApprovalPath.test(item.path) ||
          lifeSimulationPath.test(item.path) ||
          investmentPath.test(item.path) ||
          assetPath.test(item.path) ||
          defaultPricePath.test(item.path) ||
          defaultTagPath.test(item.path) ||
          stageGPath.test(item.path) ||
          payrollCenterPath.test(item.path) ||
          timeAssetsPath.test(item.path) ||
          importCleaningPath.test(item.path) ||
          smartReconciliationPath.test(item.path) ||
          aiDraftPath(item.path)
        ) ||
        !('createdAt' in item) ||
        typeof item.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(item.createdAt)),
    )
  )
    throw new Error('待确认请求记录损坏，请先核实提交结果。');
  return parsed as PendingOperation[];
}
function write(user: string, items: PendingOperation[]) {
  sessionStorage.setItem(storageKey(user), JSON.stringify(items));
  window.dispatchEvent(new Event(journalEvent));
}
export function completeOperation(user: string, key: string) {
  write(
    user,
    pendingOperations(user).filter((item) => item.key !== key),
  );
}
export async function prepareOperation(
  user: string,
  input: Omit<PendingOperation, 'fingerprint' | 'createdAt'>,
): Promise<{ operation: PendingOperation; reused: boolean }> {
  if (
    !(
      categoryCsvPath.test(input.path) ||
      accountPath.test(input.path) ||
      collaborationPath.test(input.path) ||
      fuelPath.test(input.path) ||
      safePath.test(input.path) ||
      reportCenterPath.test(input.path) ||
      promotionPath.test(input.path) ||
      planningPath.test(input.path) ||
      festivalPath.test(input.path) ||
      musicInterestPath.test(input.path) || concertPayablePath.test(input.path) || concertP1Path.test(input.path) ||
      spendingIntelligencePath.test(input.path) ||
      spendingValuePath.test(input.path) ||
      spendingApprovalPath.test(input.path) ||
      lifeSimulationPath.test(input.path) ||
      investmentPath.test(input.path) ||
      assetPath.test(input.path) ||
      defaultPricePath.test(input.path) ||
      defaultTagPath.test(input.path) ||
      stageGPath.test(input.path) ||
      payrollCenterPath.test(input.path) ||
      timeAssetsPath.test(input.path) ||
      importCleaningPath.test(input.path) ||
      smartReconciliationPath.test(input.path) ||
      aiDraftPath(input.path)
    ) ||
    !journalMethodAllowed(input.method, input.path)
  )
    throw new Error('请求地址不支持安全恢复。');
  const data = JSON.stringify([
    input.method,
    input.path,
    input.body,
    input.version ?? null,
  ]);
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data),
  );
  const fingerprint = [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Read again after async hashing: parallel submissions must not overwrite each other's journal.
  const items = pendingOperations(user);
  const previous = items.find((item) => item.fingerprint === fingerprint);
  if (previous) return { operation: previous, reused: true };
  if (items.some((item) => item.key === input.key))
    throw new Error('该请求仍待核实，请先查看提交记录，再修改内容。');
  if (items.length >= 30) throw new Error('待核实提交过多，请先处理提交记录。');
  const operation = {
    ...input,
    fingerprint,
    createdAt: new Date().toISOString(),
  };
  write(user, [...items, operation]);
  return { operation, reused: false };
}
