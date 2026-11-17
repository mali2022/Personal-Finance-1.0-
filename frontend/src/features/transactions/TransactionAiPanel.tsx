import { useState } from 'react';
import { AiLazyMarkdown as AiMarkdown } from '../../components/ai/AiLazyMarkdown';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Input,
  Select,
  Space,
} from 'antd';
import { workspaceApi } from './workspaceApi';
import type { TransactionFilters } from '../../types';
import { t as tr, useLocale } from '../../i18n';

export function TransactionAiPanel({
  filters,
  ids,
  onApply,
}: {
  filters: TransactionFilters;
  ids: string[];
  onApply: (query: Record<string, string>) => void;
}) {
  useLocale();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('search');
  const [question, setQuestion] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    answer: string;
    query?: Record<string, string>;
  }>();
  return (
    <>
      <Button className="workspace-ai-trigger" onClick={() => setOpen(true)}>
        {tr('DeepSeek 交易助手')}
      </Button>
      <Drawer
        title={tr('DeepSeek 交易助手')}
        width="min(560px,100vw)"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            aria-label={tr('AI功能')}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setResult(undefined);
            }}
            style={{ width: '100%' }}
            options={[
              'search',
              'classify',
              'explain',
              'merchant',
              'summary',
            ].map((value, i) => ({
              value,
              label: tr(
                [
                  '自然语言搜索',
                  '智能分类建议',
                  '异常解释',
                  '商户识别',
                  '交易摘要',
                ][i],
              ),
            }))}
          />
          <Alert
            showIcon
            type="info"
            message={tr(
              'AI仅提供建议；金额和余额以服务端账本为准。分类建议需手动填入批量编辑，预览并确认后才写入。',
            )}
          />
          <Input.TextArea
            aria-label={tr('交易助手提问')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={tr('例如：搜索本月超过200元的餐饮支出')}
          />
          <Checkbox
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          >
            {tr(
              '确认发送本次提问；摘要模式发送筛选汇总，分类、商户和解释模式发送所选交易的金额、商户、商品及分类，不发送备注。',
            )}
          </Checkbox>
          <Button
            type="primary"
            loading={busy}
            disabled={
              !confirmed ||
              !question.trim() ||
              (!['search', 'summary'].includes(mode) && !ids.length)
            }
            onClick={async () => {
              setBusy(true);
              setResult(undefined);
              try {
                setResult(
                  await workspaceApi.ai(filters, {
                    mode,
                    question,
                    confirmTransmission: confirmed,
                    transactionIds: ids,
                  }),
                );
              } catch (e) {
                message.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr('生成建议')}
          </Button>
          {!['search', 'summary'].includes(mode) && (
            <span>{tr('已选择 {0} 笔交易', ids.length)}</span>
          )}
          {result?.query && (
            <>
              <pre className="workspace-ai-output">
                {JSON.stringify(result.query, null, 2)}
              </pre>
              <Button
                onClick={() => {
                  onApply(result.query!);
                  setOpen(false);
                }}
              >
                {tr('应用结构化筛选')}
              </Button>
            </>
          )}
          {result?.answer && (
            <div className="workspace-ai-output"><AiMarkdown text={result.answer} /></div>
          )}
        </Space>
      </Drawer>
    </>
  );
}
