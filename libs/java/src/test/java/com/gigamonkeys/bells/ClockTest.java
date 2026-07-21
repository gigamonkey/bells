package com.gigamonkeys.bells;

import static com.gigamonkeys.bells.Fixtures.SIMPLE_DATA;
import static com.gigamonkeys.bells.Fixtures.laInstant;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The process-global debug clock (DateTimes.setDebugTime / clearDebugTime / ...). */
class ClockTest {

  // A moment inside Period 1 on Tuesday 2025-08-19 (a normal school day).
  private static final Instant DURING_PERIOD_1 = laInstant("2025-08-19T08:45");

  private static BellSchedule make() {
    return new BellSchedule(CalendarData.parse(SIMPLE_DATA), Options.defaults());
  }

  @AfterEach
  void resetClock() {
    DateTimes.clearDebugTime();
  }

  @Test
  void defaultsToRealClock() {
    assertNull(DateTimes.getDebugOffset());
  }

  @Test
  void setDebugTimeDrivesTimeDefaultingMethods() {
    // Sanity: an explicit instant resolves to Period 1.
    assertEquals("Period 1", make().currentInterval(DURING_PERIOD_1).name());
    DateTimes.setDebugTime(DURING_PERIOD_1);
    // No argument -> uses the debug time.
    assertEquals("Period 1", make().currentInterval().name());
    assertEquals("Period 1", make().periodAt().name());
  }

  @Test
  void clearDebugTimeRestoresRealClock() {
    DateTimes.setDebugTime(DURING_PERIOD_1);
    assertNotNull(DateTimes.getDebugOffset());
    DateTimes.clearDebugTime();
    assertNull(DateTimes.getDebugOffset());
  }

  @Test
  void setDebugOffsetAndSetDebugTimeAgree() {
    DateTimes.setDebugTime(DURING_PERIOD_1);
    String viaTime = make().currentInterval().name();
    Duration offset = DateTimes.getDebugOffset();
    DateTimes.clearDebugTime();
    assertNotNull(offset);
    DateTimes.setDebugOffset(offset);
    assertEquals(viaTime, make().currentInterval().name());
  }

  @Test
  void explicitInstantOverridesDebugOffset() {
    // Pretend it is a summer day with no school...
    DateTimes.setDebugTime(laInstant("2025-07-15T12:00"));
    assertNull(make().currentInterval());
    // ...but an explicit instant still wins.
    assertEquals("Period 1", make().currentInterval(DURING_PERIOD_1).name());
  }

  @Test
  void setDebugOffsetAcceptsDuration() {
    DateTimes.setDebugOffset(Duration.ofHours(-3));
    assertEquals(Duration.ofHours(-3), DateTimes.getDebugOffset());
  }
}
