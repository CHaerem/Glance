/**
 * Time and timezone utility functions
 */

/**
 * Format a build date string for display
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date string
 */
function formatBuildDate(dateStr) {
    if (!dateStr || dateStr === "unknown") return dateStr;
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    let timeZone = "UTC";
    const offsetMatch = dateStr.match(/([+-])(\d{2}):(\d{2})$/);
    if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? "-" : "+";
        const hours = parseInt(offsetMatch[2], 10);
        if (offsetMatch[3] === "00") {
            timeZone = `Etc/GMT${sign}${hours}`;
        }
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
    });
}

/**
 * Get current time in Oslo timezone
 * @returns {{ hour: number, minute: number }}
 */
function getOsloTime() {
    const now = new Date();
    const osloTimeStr = now.toLocaleString('en-US', {
        timeZone: 'Europe/Oslo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const [hour, minute] = osloTimeStr.split(':').map(Number);
    return { hour, minute };
}

/**
 * Get formatted timestamp in Oslo timezone
 * @returns {string} Formatted timestamp (e.g., "2025-10-29 21:30:45")
 */
function getOsloTimestamp() {
    const now = new Date();
    return now.toLocaleString('en-CA', {
        timeZone: 'Europe/Oslo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(',', '');
}

/**
 * Check if current time is within night sleep period
 * @param {Object} settings - Settings object with nightSleepEnabled, nightSleepStartHour, nightSleepEndHour
 * @returns {boolean}
 */
function isInNightSleep(settings) {
    if (!settings.nightSleepEnabled) {
        return false;
    }

    const { hour: currentHour } = getOsloTime();
    const startHour = settings.nightSleepStartHour;
    const endHour = settings.nightSleepEndHour;

    // Handle overnight period (e.g., 23:00 to 05:00)
    if (startHour > endHour) {
        return currentHour >= startHour || currentHour < endHour;
    }
    // Handle same-day period (e.g., 02:00 to 06:00)
    return currentHour >= startHour && currentHour < endHour;
}

/**
 * Calculate duration until night sleep ends (in microseconds)
 * @param {Object} settings - Settings object with nightSleepStartHour, nightSleepEndHour
 * @returns {number} Duration in microseconds
 */
function calculateNightSleepDuration(settings) {
    const { hour: currentHour, minute: currentMinute } = getOsloTime();
    const endHour = settings.nightSleepEndHour;

    let hoursUntilEnd;

    // Handle overnight period
    if (settings.nightSleepStartHour > endHour) {
        if (currentHour >= settings.nightSleepStartHour) {
            hoursUntilEnd = (24 - currentHour) + endHour;
        } else {
            hoursUntilEnd = endHour - currentHour;
        }
    } else {
        hoursUntilEnd = endHour - currentHour;
    }

    // Account for current minutes (sleep until the end hour, 0 minutes)
    const minutesUntilEnd = (hoursUntilEnd * 60) - currentMinute;

    // Convert to microseconds
    return minutesUntilEnd * 60 * 1000000;
}

module.exports = {
    formatBuildDate,
    getOsloTime,
    getOsloTimestamp,
    isInNightSleep,
    calculateNightSleepDuration
};
