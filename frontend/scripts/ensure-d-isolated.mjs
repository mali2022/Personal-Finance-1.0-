import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export default async function () {
  const base = process.env.FINANCE_TEST_API_BASE;
  assert.equal(
    base,
    'http://127.0.0.1:5082/api',
    'D regression requires the isolated API',
  );
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/integration-credentials.local.json',
      'utf8',
    ),
  );
  const response = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(response.status, 200);
  const token = (await response.json()).data.accessToken;
  const context = await (
    await fetch(base + '/verification-context', {
      headers: { Authorization: 'Bearer ' + token },
    })
  ).json();
  const database = (
    await readFile('../backend/test-results/d/database.txt', 'utf8')
  ).trim();
  assert.equal(context.database, database);
  assert.match(database, /^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$/);
}
