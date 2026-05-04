import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import styles from './time-range-selector.module.scss'

export type TimeRangePreset = 'day' | 'week' | 'month' | 'year' | 'custom'

export type TimeRangeValue = {
  preset: TimeRangePreset
  startDate: string
  endDate: string
}

const options: Array<{ preset: TimeRangePreset; label: string }> = [
  { preset: 'day', label: 'Past day' },
  { preset: 'week', label: 'Past week' },
  { preset: 'month', label: 'Past month' },
  { preset: 'year', label: 'Past year' },
  { preset: 'custom', label: 'Custom' },
]

export function TimeRangePicker({
  onChange,
  value,
}: {
  onChange: (value: TimeRangeValue) => void
  value: TimeRangeValue
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={styles.picker} ref={popoverRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        className={styles.trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={15} />
        <span>{formatTimeRangeLabel(value)}</span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className={styles.popover} id={popoverId}>
          <div className={styles.popoverHeader}>
            <strong>Time range</strong>
            <span>Choose the transactions shown in this chart.</span>
          </div>
          <div className={styles.segments} role="group" aria-label="Chart time range">
            {options.map((option) => (
              <button
                className={`${styles.segment} ${value.preset === option.preset ? styles.active : ''}`}
                key={option.preset}
                type="button"
                onClick={() => {
                  onChange(resolvePresetRange(option.preset, value))
                  if (option.preset !== 'custom') {
                    setOpen(false)
                  }
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {value.preset === 'custom' ? (
            <div className={styles.customFields}>
              <label>
                <span>Start</span>
                <input
                  aria-label="Custom range start date"
                  className={styles.dateField}
                  type="date"
                  value={value.startDate}
                  onChange={(event) => onChange(normalizeCustomRange({
                    ...value,
                    startDate: event.target.value,
                  }))}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  aria-label="Custom range end date"
                  className={styles.dateField}
                  type="date"
                  value={value.endDate}
                  onChange={(event) => onChange(normalizeCustomRange({
                    ...value,
                    endDate: event.target.value,
                  }))}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function getDefaultTimeRange(): TimeRangeValue {
  return resolvePresetRange('month')
}

export function getTimeRangeBounds(value: TimeRangeValue) {
  const start = parseInputDate(value.startDate)
  const end = parseInputDate(value.endDate)
  end.setHours(23, 59, 59, 999)

  return {
    startEpoch: Math.floor(start.getTime() / 1000),
    endEpoch: Math.floor(end.getTime() / 1000),
    startDate: toInputDate(start),
    endDate: toInputDate(end),
  }
}

export function formatTimeRangeLabel(value: TimeRangeValue) {
  if (value.preset !== 'custom') {
    return options.find((option) => option.preset === value.preset)?.label ?? 'Selected range'
  }

  return `${formatShortDate(value.startDate)} - ${formatShortDate(value.endDate)}`
}

function resolvePresetRange(preset: TimeRangePreset, current?: TimeRangeValue): TimeRangeValue {
  if (preset === 'custom') {
    return {
      preset,
      startDate: current?.startDate ?? toInputDate(shiftDate(new Date(), -30)),
      endDate: current?.endDate ?? toInputDate(new Date()),
    }
  }

  const end = startOfDay(new Date())
  const start = startOfDay(new Date())
  const daysBackByPreset: Record<Exclude<TimeRangePreset, 'custom'>, number> = {
    day: 0,
    week: 6,
    month: 29,
    year: 364,
  }

  start.setDate(start.getDate() - daysBackByPreset[preset])

  return {
    preset,
    startDate: toInputDate(start),
    endDate: toInputDate(end),
  }
}

function normalizeCustomRange(value: TimeRangeValue): TimeRangeValue {
  if (!value.startDate || !value.endDate) {
    return value
  }

  return value.startDate <= value.endDate
    ? value
    : {
        ...value,
        startDate: value.endDate,
        endDate: value.startDate,
      }
}

function shiftDate(date: Date, days: number) {
  const copy = startOfDay(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseInputDate(value))
}
