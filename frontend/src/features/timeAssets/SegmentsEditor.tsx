import { Button, Input, Space } from 'antd';
import { useLocale } from '../../i18n';
export default function SegmentsEditor({
  value = [],
  onChange,
}: {
  value?: { start: string; end: string }[];
  onChange?: (value: { start: string; end: string }[]) => void;
}) {
  const en = useLocale() === 'en';
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {value.map((s, i) => (
        <Space key={i} direction="vertical" style={{ width: '100%' }}>
          <Input
            aria-label={en ? `Segment ${i + 1} start` : `片段${i + 1}开始`}
            placeholder="YYYY-MM-DD HH:mm:ss"
            value={s.start}
            onChange={(e) =>
              onChange?.(
                value.map((v, n) =>
                  n === i ? { ...v, start: e.target.value } : v,
                ),
              )
            }
          />
          <Input
            aria-label={en ? `Segment ${i + 1} end` : `片段${i + 1}结束`}
            placeholder="YYYY-MM-DD HH:mm:ss"
            value={s.end}
            onChange={(e) =>
              onChange?.(
                value.map((v, n) =>
                  n === i ? { ...v, end: e.target.value } : v,
                ),
              )
            }
          />
          <Button
            danger
            disabled={value.length === 1}
            onClick={() => onChange?.(value.filter((_, n) => n !== i))}
          >
            {en ? 'Remove segment' : '移除此片段'}
          </Button>
        </Space>
      ))}
      <Button
        disabled={value.length >= 100}
        onClick={() =>
          onChange?.([
            ...value,
            { start: value.at(-1)?.end ?? '', end: value.at(-1)?.end ?? '' },
          ])
        }
      >
        {en ? 'Add segment' : '新增计时片段'}
      </Button>
    </Space>
  );
}
