/**
 * Time and timezone utility functions
 * All times are handled in Oslo (Europe/Oslo) timezone
 */

/**
 * Oslo time components
 */
export interface OsloTime {
  hour: number;
  minute: number;
}

/**
 * Format a build date string for display
 * @param dateStr - ISO date string (or null/undefined)
 * @returns Formatted date string, or the input if null/undefined/invalid
 */
export function formatBuildDate(
  dateStr: string | null | undefined
): string | null | undefined {
  if (!dateStr || dateStr === 'unknown') return dateStr;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  let timeZone = 'UTC';
  const offsetMatch = dateStr.match(/([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch && offsetMatch[1] && offsetMatch[2] && offsetMatch[3]) {
    const sign = offsetMatch[1] === '+' ? '-' : '+';
    const hours = parseInt(offsetMatch[2], 10);
    if (offsetMatch[3] === '00') {
      timeZone = `Etc/GMT${sign}${hours}`;
    }
  }

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
}

/**
 * Get current time in Oslo timezone
 * @returns Object with hour and minute in Oslo time
 */
export function getOsloTime(): OsloTime {
  const now = new Date();
  const osloTimeStr = now.toLocaleString('en-US', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = osloTimeStr.split(':');
  const hour = parseInt(parts[0] ?? '0', 10);
  const minute = parseInt(parts[1] ?? '0', 10);
  return { hour, minute };
}

/**
 * Get formatted timestamp in Oslo timezone
 * @returns Formatted timestamp (e.g., "2025-10-29 21:30:45")
 */
export function getOsloTimestamp(): string {
  const now = new Date();
  return now
    .toLocaleString('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '');
}

/**
 * Night sleep settings type (subset of ServerSettings)
 */
interface NightSleepSettings {
  nightSleepEnabled: boolean;
  nightSleepStartHour: number;
  nightSleepEndHour: number;
}

/**
 * Check if current time is within night sleep period
 * @param settings - Settings object with night sleep configuration
 * @returns True if currently in night sleep period
 */
export function isInNightSleep(settings: Partial<NightSleepSettings>): boolean {
  if (!settings.nightSleepEnabled) {
    return false;
  }

  const { hour: currentHour } = getOsloTime();
  const startHour = settings.nightSleepStartHour ?? 0;
  const endHour = settings.nightSleepEndHour ?? 0;

  // Handle overnight period (e.g., 23:00 to 05:00)
  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  }
  // Handle same-day period (e.g., 02:00 to 06:00)
  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Calculate duration until night sleep ends (in microseconds)
 * @param settings - Settings object with night sleep configuration
 * @returns Duration in microseconds until sleep period ends
 */
export function calculateNightSleepDuration(
  settings: Partial<NightSleepSettings>
): number {
  const { hour: currentHour, minute: currentMinute } = getOsloTime();
  const startHour = settings.nightSleepStartHour ?? 0;
  const endHour = settings.nightSleepEndHour ?? 0;

  let hoursUntilEnd: number;

  // Handle overnight period
  if (startHour > endHour) {
    if (currentHour >= startHour) {
      hoursUntilEnd = 24 - currentHour + endHour;
    } else {
      hoursUntilEnd = endHour - currentHour;
    }
  } else {
    hoursUntilEnd = endHour - currentHour;
  }

  // Account for current minutes (sleep until the end hour, 0 minutes)
  const minutesUntilEnd = hoursUntilEnd * 60 - currentMinute;

  // Convert to microseconds
  return minutesUntilEnd * 60 * 1000000;
}
