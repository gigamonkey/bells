/**
 * Public API entry point.
 */

export { parseTime, formatTime } from './abstract-time.js';
export { setDebugTime, setDebugOffset, clearDebugTime, getDebugOffset } from './clock.js';
export type { AbstractTime, BoundTime, DaySpec, TimeAnchor } from './abstract-time.js';
export { BellSchedule } from './bell-schedule.js';
export type { Interval, Period } from './calendar.js';
export type {
  ActiveAnnotation,
  Annotation,
  Annotations,
  AnnotationSource,
  BellScheduleOptions,
  IncludeTags,
  IntervalType,
  NonClassDay,
  PeriodData,
  ResolvedDateAnnotation,
  ResolvedRangeAnnotation,
  ResolvedWeekAnnotation,
  Role,
  ScheduledPeriod,
  SchoolWeek,
  YearData,
} from './types.js';
