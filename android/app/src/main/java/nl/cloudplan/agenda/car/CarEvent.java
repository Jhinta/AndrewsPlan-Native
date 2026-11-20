package nl.cloudplan.agenda.car;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public final class CarEvent {
    private static final Pattern LAT_LNG_PATTERN =
        Pattern.compile("^(?:geo:)?(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern VIRTUAL_HOST_PATTERN =
        Pattern.compile("(?:zoom\\.us|teams\\.microsoft\\.com|teams\\.live\\.com|meet\\.google\\.com|webex\\.com|gotomeeting\\.com|whereby\\.com|discord\\.gg)", Pattern.CASE_INSENSITIVE);
    private static final Pattern VIRTUAL_ONLY_PATTERN =
        Pattern.compile("^(?:online|remote|virtual|virtueel|zoom|teams|microsoft teams|ms teams|google meet|meet|webex|phone|telefoon|call|tbd|tba|n/a|none|-+)$", Pattern.CASE_INSENSITIVE);

    public final String id;
    public final String summary;
    public final String description;
    public final String location;
    public final String startIso;
    public final String endIso;
    public final long startMs;
    public final long endMs;
    public final boolean allDay;
    public final String calendarTitle;
    public final String organizer;
    public final String phoneDisplay;
    public final String phoneHref;

    public CarEvent(
        String id,
        String summary,
        String description,
        String location,
        String startIso,
        String endIso,
        long startMs,
        long endMs,
        boolean allDay,
        String calendarTitle,
        String organizer,
        String phoneDisplay,
        String phoneHref
    ) {
        this.id = id;
        this.summary = summary;
        this.description = description;
        this.location = location;
        this.startIso = startIso;
        this.endIso = endIso;
        this.startMs = startMs;
        this.endMs = endMs;
        this.allDay = allDay;
        this.calendarTitle = calendarTitle;
        this.organizer = organizer;
        this.phoneDisplay = phoneDisplay;
        this.phoneHref = phoneHref;
    }

    public static CarEvent fromJson(JSONObject obj) {
        String id = obj.optString("id", "");
        String summary = obj.optString("summary", "Untitled Event").trim();
        if (summary.isEmpty()) summary = "Untitled Event";
        String description = obj.optString("description", "").trim();
        String location = obj.optString("location", "").trim();
        String startIso = obj.optString("start", "").trim();
        String endIso = obj.optString("end", "").trim();
        boolean allDay = obj.optBoolean("allDay", false);
        String calendarTitle = obj.optString("calendarTitle", "AndrewsPlan").trim();
        String organizer = obj.optString("organizer", "").trim();
        String phoneDisplay = obj.optString("phoneDisplay", "").trim();
        String phoneHref = obj.optString("phoneHref", "").trim();

        long startMs = parseIsoMillis(startIso);
        long endMs = parseIsoMillis(endIso);
        if (endMs <= 0 && startMs > 0) {
            endMs = startMs + 60 * 60 * 1000L;
        }

        if (phoneHref.isEmpty()) {
            String[] extracted = CarScheduleStore.extractPrimaryPhone(summary, location, description);
            if (extracted != null) {
                phoneDisplay = extracted[0];
                phoneHref = extracted[1];
            }
        }

        return new CarEvent(
            id,
            summary,
            description,
            location,
            startIso,
            endIso,
            startMs,
            endMs,
            allDay,
            calendarTitle,
            organizer,
            phoneDisplay,
            phoneHref
        );
    }

    public boolean hasNavigableLocation() {
        if (location == null || location.isEmpty()) return false;
        if (location.toLowerCase(Locale.ROOT).startsWith("http://") ||
            location.toLowerCase(Locale.ROOT).startsWith("https://")) {
            return false;
        }
        if (VIRTUAL_HOST_PATTERN.matcher(location).find() && !location.contains(",")) {
            return false;
        }
        return !VIRTUAL_ONLY_PATTERN.matcher(location).matches();
    }

    public boolean hasPhone() {
        return phoneHref != null && !phoneHref.isEmpty() && phoneDisplay != null && !phoneDisplay.isEmpty();
    }

    public double[] parseLatLng() {
        if (location == null) return null;
        Matcher m = LAT_LNG_PATTERN.matcher(location.trim());
        if (!m.matches()) return null;
        try {
            double lat = Double.parseDouble(m.group(1));
            double lng = Double.parseDouble(m.group(2));
            if (lat >= -90.0 && lat <= 90.0 && lng >= -180.0 && lng <= 180.0) {
                return new double[] { lat, lng };
            }
        } catch (NumberFormatException ignored) {
            return null;
        }
        return null;
    }

    public boolean overlapsToday(long nowMs) {
        if (startMs <= 0) return false;
        long[] bounds = getDayBounds(nowMs);
        return startMs < bounds[1] && (endMs > bounds[0] || startMs >= bounds[0]);
    }

    public boolean isUpcomingOrToday(long nowMs) {
        if (startMs <= 0) return false;
        long[] bounds = getDayBounds(nowMs);
        return endMs > bounds[0] || startMs >= bounds[0];
    }

    public String formatListTitle(long nowMs) {
        if (allDay) {
            return "All day · " + summary;
        }
        return formatTimeShort(startMs) + " · " + summary;
    }

    public String formatDayLabel(long nowMs) {
        if (startMs <= 0) return "";
        long[] todayBounds = getDayBounds(nowMs);
        if ((startMs >= todayBounds[0] && startMs < todayBounds[1]) ||
            (startMs < todayBounds[0] && endMs > todayBounds[0])) {
            return "Today";
        }
        long tomorrowStart = todayBounds[1];
        long tomorrowEnd = tomorrowStart + 24 * 60 * 60 * 1000L;
        if (startMs >= tomorrowStart && startMs < tomorrowEnd) {
            return "Tomorrow";
        }
        SimpleDateFormat fmt = new SimpleDateFormat("EEE d MMM", Locale.getDefault());
        return fmt.format(new Date(startMs));
    }

    public String formatListSubtitle(long nowMs) {
        StringBuilder sb = new StringBuilder();
        String day = formatDayLabel(nowMs);
        if (!day.isEmpty()) {
            sb.append(day);
        }
        if (hasNavigableLocation()) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(location);
        } else if (!calendarTitle.isEmpty()) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(calendarTitle);
        }
        if (hasPhone()) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(phoneDisplay);
        }
        return sb.toString();
    }

    public String formatTimeAndDuration(long nowMs) {
        String day = formatDayLabel(nowMs);
        if (allDay) {
            return day.isEmpty() ? "All day" : day + " · All day";
        }
        String range = formatTimeShort(startMs) + " – " + formatTimeShort(endMs);
        String duration = formatDuration();
        StringBuilder sb = new StringBuilder();
        if (!day.isEmpty()) sb.append(day).append(" · ");
        sb.append(range);
        if (!duration.isEmpty()) sb.append(" (").append(duration).append(")");
        return sb.toString();
    }

    public String formatDuration() {
        if (allDay || endMs <= startMs) return "";
        long mins = Math.max(1, Math.round((endMs - startMs) / 60000.0));
        if (mins < 60) return mins + "m";
        long hrs = mins / 60;
        long rem = mins % 60;
        return rem == 0 ? hrs + "h" : hrs + "h " + rem + "m";
    }

    private static String formatTimeShort(long ms) {
        if (ms <= 0) return "--:--";
        SimpleDateFormat fmt = new SimpleDateFormat("HH:mm", Locale.getDefault());
        return fmt.format(new Date(ms));
    }

    private static long[] getDayBounds(long nowMs) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(nowMs);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long start = cal.getTimeInMillis();
        cal.add(Calendar.DAY_OF_MONTH, 1);
        long end = cal.getTimeInMillis();
        return new long[] { start, end };
    }

    public static long parseIsoMillis(String iso) {
        if (iso == null || iso.isEmpty()) return 0L;
        String clean = iso.trim();

        // Date-only YYYY-MM-DD
        if (clean.length() == 10 && clean.charAt(4) == '-' && clean.charAt(7) == '-') {
            try {
                SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                Date d = df.parse(clean);
                return d != null ? d.getTime() : 0L;
            } catch (ParseException ignored) {
                return 0L;
            }
        }

        // Normalize fractional seconds (.123) and trailing Z or ±HH:MM offset for API 24 SimpleDateFormat
        String normalized = clean.replaceAll("\\.\\d+", "");
        if (normalized.endsWith("Z")) {
            normalized = normalized.substring(0, normalized.length() - 1) + "+0000";
        } else {
            normalized = normalized.replaceAll("([+-]\\d{2}):(\\d{2})$", "$1$2");
        }

        String[] patterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.US);
                if (!pattern.endsWith("Z")) {
                    sdf.setTimeZone(TimeZone.getDefault());
                }
                Date parsed = sdf.parse(normalized);
                if (parsed != null) return parsed.getTime();
            } catch (ParseException ignored) {
                // Try next pattern
            }
        }
        return 0L;
    }
}
