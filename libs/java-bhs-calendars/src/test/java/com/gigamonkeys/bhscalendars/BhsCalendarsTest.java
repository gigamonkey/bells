package com.gigamonkeys.bhscalendars;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.gigamonkeys.bells.BellSchedule;
import com.gigamonkeys.bells.CalendarData;
import com.gigamonkeys.bells.Options;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BhsCalendarsTest {

  @Test
  void loadAllReturnsYears() {
    List<CalendarData> years = BhsCalendars.loadAll();
    assertFalse(years.isEmpty());
    for (CalendarData year : years) {
      assertNotNull(year.id());
      assertNotNull(year.firstDay());
      assertFalse(year.schedules().isEmpty());
    }
  }

  @Test
  void byIdGroupsAndSorts() {
    Map<String, List<CalendarData>> groups = BhsCalendars.byId();
    assertTrue(groups.containsKey("bhs"));

    int total = 0;
    for (List<CalendarData> years : groups.values()) {
      total += years.size();
      // Each group is in chronological order by firstDay.
      for (int i = 1; i < years.size(); i++) {
        assertTrue(years.get(i - 1).firstDay().compareTo(years.get(i).firstDay()) <= 0);
      }
    }
    assertEquals(BhsCalendars.loadAll().size(), total);
  }

  @Test
  void dataBuildsABellSchedule() {
    List<CalendarData> bhs = BhsCalendars.byId().get("bhs");
    BellSchedule schedule = new BellSchedule(bhs, Options.defaults());
    assertNotNull(schedule);
  }
}
