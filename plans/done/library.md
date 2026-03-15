# Library

Write a plan for how to turn the code here into a standalone library we can
publish on npm.

The library should load information about the bell schedule and the calendar
from a file that the user will provide so they don’t have to upgrade the library
when they update the schedule. The library will need to document the format of
this file.

In the plan document the proposed library API which may need to be rationalized
from what the code here provides though most of the functionality we need is
here in some form.

## Main features of the library

- Getting information about what period a given instant is in with convenience
  methods for the current time.

- Getting information about the durations between a given instant and the start
  and end of the current period when the instant is in a period.

- Getting information about the durations between a given instant and the end of
  the previous school day and the start of the next school day.

- Getting information about the durations between a given instant and the start
  and end of the current school day.

- Getting information about the durations between a given instant and the start
  of the next school year. This can error if we don’t yet have calendar info for
  the next year.

- Getting information about the duration between two instants in terms of
  absolute time and “school time” (i.e. only counting time when school is in
  session which can be defined as time between the start and end of each day
  according to both the bell schedule and the calendar. (Holidays and vacations
  don’t count as school time, obviously.)

- Schedule customization. The library should provide a way for creating or
  passing custom schedule that specify what periods we want to consider part of
  the school day with the calendar structure being able to specify two default
  schedules, one for students and one for teachers. But then the can be
  augmented to add, for instance, 0 or 7th period.

- Tool for validating the calendar data file.

## Use Temoporal

All time and date related computation should use the Temporal API.
