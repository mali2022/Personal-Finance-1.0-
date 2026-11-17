import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ComponentRef,
  CSSProperties,
  ReactNode,
} from 'react';
import { ConfigProvider, DatePicker as AntDatePicker, Input } from 'antd';
import type { DatePickerProps, InputProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import {
  CalendarOutlined,
  CloseOutlined,
  DownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { t, useLocale } from '../i18n';
import { useMobile } from '../hooks/useMobile';
import '../design/mobile-controls.css';

type Precision = 'date' | 'month' | 'year';
type Pair = [Dayjs, Dayjs];
type Preset = { label: ReactNode; value: Pair | (() => Pair) };

// Set day=1 before changing month/year so January 31 never rolls into March.
export function changeDatePart(
  date: Dayjs,
  part: 'year' | 'month' | 'date' | 'hour' | 'minute' | 'second',
  value: number,
) {
  if (part === 'year' || part === 'month') {
    const changed = date.date(1).set(part, value);
    return changed.date(Math.min(date.date(), changed.daysInMonth()));
  }
  return date.set(part, value);
}

function DateFields({
  value,
  onChange,
  label,
  precision,
  time,
  disabled,
  min,
  max,
}: {
  value: Dayjs;
  onChange: (value: Dayjs) => void;
  label: string;
  precision: Precision;
  time?: boolean;
  disabled?: boolean;
  min?: Dayjs;
  max?: Dayjs;
}) {
  const firstYear = min?.year() ?? Math.min(1900, value.year());
  const lastYear = max?.year() ?? Math.max(dayjs().year() + 30, value.year());
  const field = (
    part: 'year' | 'month' | 'date' | 'hour' | 'minute' | 'second',
    title: string,
    start: number,
    end: number,
  ) => (
    <label className="mobile-date-part" key={part}>
      <span>{title}</span>
      <select
        aria-label={`${label} · ${title}`}
        value={value.get(part) + (part === 'month' ? 1 : 0)}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            changeDatePart(
              value,
              part,
              Number(event.target.value) - (part === 'month' ? 1 : 0),
            ),
          )
        }
      >
        {Array.from(
          { length: Math.max(0, end - start + 1) },
          (_, index) => start + index,
        ).map((option) => (
          <option value={option + (part === 'month' ? 1 : 0)} key={option}>
            {part === 'month'
              ? option + 1
              : part === 'year'
                ? option
                : String(option).padStart(2, '0')}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mobile-date-fields">
      <div className={`mobile-date-parts mobile-date-parts-${precision}`}>
        {field('year', t('年'), firstYear, lastYear)}
        {precision !== 'year' && field('month', t('月'), 0, 11)}
        {precision === 'date' && field('date', t('日'), 1, value.daysInMonth())}
      </div>
      {time && (
        <div className="mobile-date-parts mobile-date-parts-time">
          {field('hour', t('时'), 0, 23)}
          {field('minute', t('分'), 0, 59)}
          {field('second', t('秒'), 0, 59)}
        </div>
      )}
    </div>
  );
}

function MobilePicker({
  value,
  onChange,
  range = false,
  precision = 'date',
  time,
  disabled: suppliedDisabled,
  format,
  label,
  id,
  className,
  style,
  placeholder,
  allowClear = true,
  min,
  max,
  disabledDate,
  presets = [],
  onBlur,
  onFocus,
}: {
  value: Dayjs | Pair | null;
  onChange: (value: Dayjs | Pair | null) => void;
  range?: boolean;
  precision?: Precision;
  time?: boolean;
  disabled?: boolean | [boolean, boolean];
  format?: string;
  label?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  allowClear?: boolean;
  min?: Dayjs;
  max?: Dayjs;
  disabledDate?: (date: Dayjs) => boolean;
  presets?: Preset[];
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
}) {
  useLocale();
  const { componentDisabled } = ConfigProvider.useConfig();
  const disabled = suppliedDisabled ?? componentDisabled ?? false;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Pair>(() => [dayjs(), dayjs()]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const allDisabled = Array.isArray(disabled)
    ? disabled.every(Boolean)
    : disabled;
  const pattern =
    format ||
    (precision === 'year'
      ? 'YYYY'
      : precision === 'month'
        ? 'YYYY-MM'
        : time
          ? 'YYYY-MM-DD HH:mm:ss'
          : 'YYYY-MM-DD');
  const text = value
    ? Array.isArray(value)
      ? `${value[0].format(pattern)} → ${value[1].format(pattern)}`
      : value.format(pattern)
    : '';
  const name =
    label || placeholder || (range ? t('选择时间范围') : t('选择日期'));
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector('.mobile-date-choices')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }),
    );
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const valid = (date: Dayjs) =>
    date.isValid() &&
    !(min && date.isBefore(min, precision)) &&
    !(max && date.isAfter(max, precision)) &&
    !disabledDate?.(date);
  const invalidOrder =
    range && draft[1].isBefore(draft[0], time ? 'second' : precision);
  const invalidDate = !valid(draft[0]) || (range && !valid(draft[1]));
  const commit = (next: Dayjs | Pair | null) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };
  const toggle = () => {
    if (!open) {
      let first = Array.isArray(value)
        ? value[0]
        : value ||
          (precision === 'date' && !time ? dayjs().startOf('day') : dayjs());
      if (!value && min && first.isBefore(min)) first = min;
      if (!value && max && first.isAfter(max)) first = max;
      setDraft(Array.isArray(value) ? [...value] : [first, first]);
    }
    setOpen(!open);
  };
  return (
    <div
      ref={root}
      className={`mobile-date-control ${range ? 'mobile-date-range' : ''} ${className || ''}`}
      style={style}
    >
      <div className="mobile-date-trigger-row">
        <button
          id={id}
          ref={trigger}
          type="button"
          className={`mobile-date-trigger ${!value ? 'is-empty' : ''}`}
          aria-label={label}
          aria-expanded={open}
          aria-controls={id ? `${id}-choices` : undefined}
          disabled={allDisabled}
          onClick={toggle}
          onBlur={onBlur}
          onFocus={onFocus}
        >
          <CalendarOutlined aria-hidden />
          <span>{text || name}</span>
          <DownOutlined aria-hidden />
        </button>
        {allowClear && value && !allDisabled && (
          <button
            type="button"
            className="mobile-date-clear"
            aria-label={range ? t('清除时间范围') : t('清除日期')}
            onClick={() => commit(null)}
          >
            <CloseOutlined />
          </button>
        )}
      </div>
      {open && (
        <div
          id={id ? `${id}-choices` : undefined}
          className="mobile-date-choices"
          role="group"
          aria-label={name}
        >
          {presets.length > 0 && (
            <label className="mobile-date-part mobile-date-presets">
              <span>{t('快捷时间范围')}</span>
              <select
                aria-label={t('快捷时间范围')}
                value=""
                onChange={(event) => {
                  const preset = presets[Number(event.target.value)];
                  const pair =
                    typeof preset.value === 'function'
                      ? preset.value()
                      : preset.value;
                  if (pair.every(valid)) commit(pair);
                }}
              >
                <option value="" disabled>
                  {t('选择快捷范围')}
                </option>
                {presets.map((preset, index) => (
                  <option value={index} key={index}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mobile-date-section">
            <strong>
              {range ? t('开始日期') : time ? t('日期时间') : name}
            </strong>
            <DateFields
              label={range ? t('开始日期') : name}
              value={draft[0]}
              precision={precision}
              time={time}
              min={min}
              max={max}
              disabled={Array.isArray(disabled) ? disabled[0] : disabled}
              onChange={(date) => setDraft([date, draft[1]])}
            />
          </div>
          {range && (
            <div className="mobile-date-section">
              <strong>{t('结束日期')}</strong>
              <DateFields
                label={t('结束日期')}
                value={draft[1]}
                precision={precision}
                time={time}
                min={min}
                max={max}
                disabled={Array.isArray(disabled) ? disabled[1] : disabled}
                onChange={(date) => setDraft([draft[0], date])}
              />
            </div>
          )}
          {(invalidOrder || invalidDate) && (
            <p className="mobile-date-error" role="status">
              {invalidOrder ? t('结束时间不能早于开始时间') : t('该日期不可选')}
            </p>
          )}
          <div className="mobile-date-actions">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {t('取消')}
            </button>
            <button
              type="button"
              className="mobile-date-confirm"
              disabled={allDisabled || invalidOrder || invalidDate}
              onClick={() => commit(range ? draft : draft[0])}
            >
              {t('确定')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const AdaptiveDatePicker = forwardRef<
  ComponentRef<typeof AntDatePicker>,
  DatePickerProps
>((props, ref) => {
  const mobile = useMobile();
  const desktopRef = useRef<ComponentRef<typeof AntDatePicker>>(null);
  const root = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState<Dayjs | null>(
    props.defaultValue && !Array.isArray(props.defaultValue)
      ? props.defaultValue
      : null,
  );
  useImperativeHandle(
    ref,
    () =>
      desktopRef.current || {
        nativeElement: root.current!,
        focus: () => root.current?.querySelector('button')?.focus(),
        blur: () => root.current?.querySelector('button')?.blur(),
      },
  );
  if (
    !mobile ||
    props.multiple ||
    (props.picker && !['date', 'month', 'year'].includes(props.picker))
  )
    return <AntDatePicker {...props} ref={desktopRef} />;
  const value = 'value' in props ? props.value : inner;
  const precision = (props.picker || 'date') as Precision;
  const pattern = typeof props.format === 'string' ? props.format : undefined;
  return (
    <div ref={root} className="adaptive-date-wrapper">
      <MobilePicker
        value={value && !Array.isArray(value) ? value : null}
        id={props.id}
        label={props['aria-label']}
        placeholder={props.placeholder}
        className={props.className}
        style={props.style}
        precision={precision}
        format={pattern}
        time={!!props.showTime}
        disabled={props.disabled}
        allowClear={props.allowClear !== false}
        min={props.minDate}
        max={props.maxDate}
        disabledDate={(date) =>
          !!props.disabledDate?.(date, { type: precision })
        }
        onChange={(next) => {
          const date = next as Dayjs | null;
          setInner(date);
          const notify = props.onChange as
            ((date: Dayjs | null, text: string) => void) | undefined;
          notify?.(
            date,
            date?.format(
              pattern ||
                (precision === 'month'
                  ? 'YYYY-MM'
                  : precision === 'year'
                    ? 'YYYY'
                    : props.showTime
                      ? 'YYYY-MM-DD HH:mm:ss'
                      : 'YYYY-MM-DD'),
            ) || '',
          );
        }}
      />
    </div>
  );
});

const AdaptiveRangePicker = forwardRef<
  ComponentRef<typeof AntDatePicker.RangePicker>,
  RangePickerProps
>((props, ref) => {
  const mobile = useMobile();
  const desktopRef =
    useRef<ComponentRef<typeof AntDatePicker.RangePicker>>(null);
  const root = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState<RangePickerProps['value']>(
    props.defaultValue || null,
  );
  useImperativeHandle(
    ref,
    () =>
      desktopRef.current || {
        nativeElement: root.current!,
        focus: () => root.current?.querySelector('button')?.focus(),
        blur: () => root.current?.querySelector('button')?.blur(),
      },
  );
  if (
    !mobile ||
    (props.picker && !['date', 'month', 'year'].includes(props.picker))
  )
    return <AntDatePicker.RangePicker {...props} ref={desktopRef} />;
  const value = 'value' in props ? props.value : inner;
  const pair: Pair | null =
    value?.[0] && value[1] ? [value[0], value[1]] : null;
  const pattern = typeof props.format === 'string' ? props.format : undefined;
  const precision = (props.picker || 'date') as Precision;
  return (
    <div ref={root} className="adaptive-date-wrapper">
      <MobilePicker
        range
        value={pair}
        label={props['aria-label']}
        id={typeof props.id === 'string' ? props.id : undefined}
        className={props.className}
        style={props.style}
        time={!!props.showTime}
        precision={precision}
        format={pattern}
        disabled={props.disabled}
        allowClear={props.allowClear !== false}
        min={props.minDate}
        max={props.maxDate}
        disabledDate={(date) =>
          !!props.disabledDate?.(date, { type: precision })
        }
        presets={props.presets as Preset[]}
        onChange={(next) => {
          const dates = next as Pair | null;
          setInner(dates);
          const fmt =
            pattern || (props.showTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD');
          props.onChange?.(
            dates,
            dates ? [dates[0].format(fmt), dates[1].format(fmt)] : ['', ''],
          );
        }}
      />
    </div>
  );
});

export const DatePicker = Object.assign(AdaptiveDatePicker, {
  RangePicker: AdaptiveRangePicker,
});

// Keep existing string-valued forms/API payloads intact while adapting native date inputs.
export function DateInput(props: InputProps) {
  const mobile = useMobile();
  const [inner, setInner] = useState(String(props.defaultValue || ''));
  if (!mobile) return <Input {...props} />;
  const raw = 'value' in props ? String(props.value || '') : inner;
  const value = raw && dayjs(raw).isValid() ? dayjs(raw) : null;
  const format =
    props.type === 'month'
      ? 'YYYY-MM'
      : props.type === 'datetime-local'
        ? String(props.step) === '1'
          ? 'YYYY-MM-DDTHH:mm:ss'
          : 'YYYY-MM-DDTHH:mm'
        : 'YYYY-MM-DD';
  return (
    <MobilePicker
      value={value}
      id={props.id}
      label={props['aria-label']}
      placeholder={props.placeholder}
      className={props.className}
      style={props.style}
      disabled={props.readOnly ? true : props.disabled}
      time={props.type === 'datetime-local'}
      precision={props.type === 'month' ? 'month' : 'date'}
      min={props.min ? dayjs(String(props.min)) : undefined}
      max={props.max ? dayjs(String(props.max)) : undefined}
      onChange={(next) => {
        const formatted = next ? (next as Dayjs).format(format) : '';
        setInner(formatted);
        const target = Object.assign(document.createElement('input'), {
          type: 'text',
          value: formatted,
          id: props.id || '',
          name: props.name || '',
        });
        props.onChange?.({
          target,
          currentTarget: target,
        } as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}
