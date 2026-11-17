import { useEffect, useRef, useState } from 'react';
import { App, Button, Space } from 'antd';
import { useLocale } from '../../i18n';
import { smartApi, type Task } from './api';

export function TaskRunControl({
  task,
  disabled,
  onRunningChange,
  onProgress,
  onFinished,
}: {
  task: Task;
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onProgress: (task: Task) => void;
  onFinished: () => Promise<void>;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const { message } = App.useApp();
  const mounted = useRef(true);
  const continuing = useRef(false);
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      continuing.current = false;
    };
  }, []);
  const run = async () => {
    if (busy.current || disabled || task.state === 'Completed') return;
    busy.current = true;
    continuing.current = true;
    setRunning(true);
    onRunningChange(true);
    let current = task;
    try {
      // 10,000 sources / 20 per step, plus one empty completion step.
      for (
        let batch = 0;
        batch < 501 && continuing.current && current.state !== 'Completed';
        batch++
      ) {
        const result = await smartApi.stepTaskCompact(
          current.id,
          current.version,
          crypto.randomUUID(),
        );
        if (
          result.version === current.version ||
          result.processed < current.processed ||
          result.processed - current.processed > 20 ||
          (result.processed === current.processed &&
            result.state !== 'Completed')
        )
          throw new Error(
            t(
              '任务进度异常，请刷新后复核',
              'Unexpected task progress; refresh and review',
            ),
          );
        current = { ...current, ...result };
        if (mounted.current) onProgress(current);
        if (current.state !== 'Completed' && continuing.current)
          await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (mounted.current) {
        if (current.state === 'Completed')
          message.info(
            current.failed > 0
              ? t(
                  '任务已结束，含失败项目，请查看执行历史',
                  'Finished with failures; inspect execution history',
                )
              : t(
                  '建议任务已完成，未执行自动确认',
                  'Suggestions completed; no automatic confirmation',
                ),
          );
        else
          message.info(
            t(
              '已暂停，游标已保存，可继续处理',
              'Paused with saved cursor; processing can resume',
            ),
          );
      }
    } catch (error) {
      if (mounted.current) message.error((error as Error).message);
    } finally {
      continuing.current = false;
      busy.current = false;
      if (mounted.current) {
        setRunning(false);
        setStopping(false);
        onRunningChange(false);
        try {
          await onFinished();
        } catch (error) {
          message.error((error as Error).message);
        }
      }
    }
  };
  return (
    <Space wrap data-task-id={task.id}>
      {running ? (
        <Button
          disabled={stopping}
          onClick={() => {
            continuing.current = false;
            setStopping(true);
          }}
        >
          {stopping
            ? t('当前批次完成后暂停', 'Pausing after current step')
            : t('暂停建议任务', 'Pause suggestions')}
        </Button>
      ) : (
        <Button
          disabled={disabled || task.state === 'Completed'}
          onClick={() => void run()}
        >
          {t('连续生成建议', 'Run suggestion task')}
        </Button>
      )}
    </Space>
  );
}
