package nl.cloudplan.agenda.car;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public final class CarScheduleStore {
    private static final String PREFS_NAME = "andrewsplan_car_prefs";
    private static final String KEY_EVENTS_JSON = "events_json";
    private static final String KEY_CALENDAR_NAME = "calendar_name";
    private static final String KEY_SYNCED_AT = "synced_at";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_PASSWORD = "password";

    private static final String CLOUDPLAN_ICS_URL = "https://cloudplan.nl/ics";

    private static final Pattern PHONE_CANDIDATE_PATTERN =
        Pattern.compile("(?<![A-Za-z0-9])(?:\\+|00)?(?:\\(?\\d{1,4}\\)?[\\s.-]?){2,6}\\d{2,6}(?![A-Za-z0-9])");
    private static final Pattern EXPLICIT_PHONE_CONTEXT =
        Pattern.compile("(?:^|[\\s(\\[{\"'`,;|])(?:tel(?:efoon)?(?:\\s*(?:nummer|nr\\.?))?|phone(?:\\s*(?:no\\.?|number))?|mob(?:iel|ile)?(?:\\s*(?:nr\\.?|nummer))?|gsm|call|bel|cell|whatsapp|fax)\\s*[:.#=\\-\\s]*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_PHONE_CONTEXT =
        Pattern.compile("(?:^|[\\s(\\[{\"'`,;|])(?:contract(?:en|nummer|nummers|nr\\.?|no\\.?|number|id)?|contr\\.?|agreement(?:\\s*(?:no\\.?|number|id))?|dossier(?:nummer|nr\\.?)?|order(?:nummer|nr\\.?|no\\.?|id)?|werkbon(?:nummer|nr\\.?)?|bon(?:nummer|nr\\.?)?|factuur(?:nummer|nr\\.?)?|invoice(?:\\s*(?:no\\.?|number|id))?|polis(?:nummer|nr\\.?)?|referentie(?:nummer|nr\\.?)?|ref\\.?|kenmerk|klant(?:nummer|nr\\.?)?|relatie(?:nummer|nr\\.?)?|zaak(?:nummer|nr\\.?)?|project(?:nummer|nr\\.?)?|object(?:nummer|nr\\.?)?|ticket(?:nummer|nr\\.?)?|serienummer|serial(?:\\s*(?:no\\.?|number))?|po(?:\\s*(?:no\\.?|nr\\.?|number))?|iban|kvk|btw|bsn|klant|client(?:\\s*id)?|account(?:\\s*(?:no\\.?|nr\\.?|number|id))?)\\s*[:.#=\\-\\s]*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GENERIC_ID_CONTEXT =
        Pattern.compile("(?:^|[\\s(\\[{\"'`,;|])(?:nr\\.?|no\\.?|nummer|number|id|code|#)\\s*[:.#=\\-\\s]*$", Pattern.CASE_INSENSITIVE);

    private static final Set<Runnable> LISTENERS = new CopyOnWriteArraySet<>();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static final ExecutorService SYNC_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Object CACHE_LOCK = new Object();
    private static volatile List<CarEvent> cachedEvents = Collections.emptyList();
    private static volatile boolean cacheInitialized = false;
    private static volatile boolean cacheLoading = false;

    public interface SyncCallback {
        void onComplete(boolean success, String message);
    }

    private CarScheduleStore() {}

    public static void addListener(Runnable listener) {
        if (listener != null) LISTENERS.add(listener);
    }

    public static void removeListener(Runnable listener) {
        if (listener != null) LISTENERS.remove(listener);
    }

    private static void notifyListeners() {
        MAIN_HANDLER.post(() -> {
            for (Runnable listener : LISTENERS) {
                try {
                    listener.run();
                } catch (Exception ignored) {
                    // Ignore listener errors
                }
            }
        });
    }

    public static boolean isCacheReady() {
        return cacheInitialized;
    }

    public static List<CarEvent> getCachedEvents() {
        return cachedEvents;
    }

    public static void ensureLoadedAsync(Context context) {
        if (cacheInitialized) return;
        synchronized (CACHE_LOCK) {
            if (cacheInitialized || cacheLoading) return;
            cacheLoading = true;
        }
        final Context appContext = context.getApplicationContext();
        SYNC_EXECUTOR.execute(() -> {
            try {
                SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String raw = prefs.getString(KEY_EVENTS_JSON, "[]");
                List<CarEvent> parsed = parseEventsJson(raw);
                synchronized (CACHE_LOCK) {
                    if (!cacheInitialized) {
                        cachedEvents = parsed;
                        cacheInitialized = true;
                    }
                    cacheLoading = false;
                }
            } catch (Exception ignored) {
                synchronized (CACHE_LOCK) {
                    if (!cacheInitialized) {
                        cachedEvents = Collections.emptyList();
                        cacheInitialized = true;
                    }
                    cacheLoading = false;
                }
            }
            notifyListeners();
        });
    }

    public static void saveFromBridge(
        Context context,
        String eventsJson,
        String calendarName,
        String syncedAt,
        String username,
        String password
    ) {
        String safeJson = eventsJson != null ? eventsJson : "[]";
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(KEY_EVENTS_JSON, safeJson)
            .putString(KEY_CALENDAR_NAME, calendarName != null && !calendarName.isEmpty() ? calendarName : "AndrewsPlan")
            .putString(KEY_SYNCED_AT, syncedAt != null ? syncedAt : "")
            .putString(KEY_USERNAME, username != null ? username : "")
            .putString(KEY_PASSWORD, password != null ? password : "")
            .apply();
        List<CarEvent> parsed = parseEventsJson(safeJson);
        synchronized (CACHE_LOCK) {
            cachedEvents = parsed;
            cacheInitialized = true;
            cacheLoading = false;
        }
        notifyListeners();
    }

    public static void clear(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
        synchronized (CACHE_LOCK) {
            cachedEvents = Collections.emptyList();
            cacheInitialized = true;
            cacheLoading = false;
        }
        notifyListeners();
    }

    public static String getCalendarName(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_CALENDAR_NAME, "AndrewsPlan");
    }

    public static boolean hasCredentials(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String user = prefs.getString(KEY_USERNAME, "");
        String pass = prefs.getString(KEY_PASSWORD, "");
        return !user.isEmpty() && !pass.isEmpty();
    }

    public static List<CarEvent> loadEvents(Context context) {
        if (cacheInitialized) {
            return cachedEvents;
        }
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_EVENTS_JSON, "[]");
        List<CarEvent> parsed = parseEventsJson(raw);
        synchronized (CACHE_LOCK) {
            cachedEvents = parsed;
            cacheInitialized = true;
            cacheLoading = false;
        }
        return parsed;
    }

    private static List<CarEvent> parseEventsJson(String raw) {
        List<CarEvent> result = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj != null) {
                    result.add(CarEvent.fromJson(obj));
                }
            }
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
        Collections.sort(result, new Comparator<CarEvent>() {
            @Override
            public int compare(CarEvent a, CarEvent b) {
                return Long.compare(a.startMs, b.startMs);
            }
        });
        return Collections.unmodifiableList(result);
    }

    private static String parseIcsDateToIso(String dateStr) {
        if (dateStr == null || dateStr.isEmpty()) return "";
        String clean = dateStr.replaceAll("[^0-9TZ]", "");
        if (clean.length() == 8) {
            return clean.substring(0, 4) + "-" + clean.substring(4, 6) + "-" + clean.substring(6, 8) + "T00:00:00.000Z";
        }
        if (clean.length() >= 15) {
            String y = clean.substring(0, 4);
            String m = clean.substring(4, 6);
            String d = clean.substring(6, 8);
            String hh = clean.substring(9, 11);
            String mm = clean.substring(11, 13);
            String ss = clean.substring(13, 15);
            return y + "-" + m + "-" + d + "T" + hh + ":" + mm + ":" + ss + (clean.endsWith("Z") ? "Z" : "");
        }
        return dateStr;
    }

    public static void fetchLiveSync(Context context, SyncCallback callback) {
        final Context appContext = context.getApplicationContext();
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        final String username = prefs.getString(KEY_USERNAME, "");
        final String password = prefs.getString(KEY_PASSWORD, "");

        if (username.isEmpty() || password.isEmpty()) {
            MAIN_HANDLER.post(() -> {
                if (callback != null) {
                    callback.onComplete(false, "Sign in on phone to sync");
                }
            });
            return;
        }

        SYNC_EXECUTOR.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(CLOUDPLAN_ICS_URL);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                String auth = android.util.Base64.encodeToString(
                    (username + ":" + password).getBytes(StandardCharsets.UTF_8),
                    android.util.Base64.NO_WRAP
                );
                conn.setRequestProperty("Authorization", "Basic " + auth);
                conn.setRequestProperty("Accept", "text/calendar, text/plain;q=0.9, */*;q=0.8");
                conn.setRequestProperty("User-Agent", "AndrewsPlan/1.0");

                int status = conn.getResponseCode();
                if (status == 401 || status == 403) {
                    MAIN_HANDLER.post(() -> {
                        if (callback != null) {
                            callback.onComplete(false, "Authentication failed. Sign in on phone.");
                        }
                    });
                    return;
                }
                if (status < 200 || status >= 300) {
                    MAIN_HANDLER.post(() -> {
                        if (callback != null) {
                            callback.onComplete(false, "Sync failed (HTTP " + status + ")");
                        }
                    });
                    return;
                }

                String calendarName = "AndrewsPlan";
                JSONArray eventsArray = new JSONArray();
                long cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;

                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                )) {
                    String rawLine;
                    String currentLine = null;
                    boolean inVEvent = false;
                    String uid = "";
                    String summary = "";
                    String description = "";
                    String location = "";
                    String startIso = "";
                    String endIso = "";
                    boolean allDay = false;
                    String organizer = "";

                    while ((rawLine = reader.readLine()) != null) {
                        if (rawLine.startsWith(" ") || rawLine.startsWith("\t")) {
                            if (currentLine != null) {
                                currentLine += rawLine.substring(1);
                            }
                            continue;
                        }
                        if (currentLine != null) {
                            int colon = currentLine.indexOf(':');
                            if (colon > 0) {
                                String propHeader = currentLine.substring(0, colon).trim();
                                String val = currentLine.substring(colon + 1).trim();
                                int semi = propHeader.indexOf(';');
                                String prop = (semi > 0 ? propHeader.substring(0, semi) : propHeader).toUpperCase();
                                String params = semi > 0 ? propHeader.substring(semi + 1).toUpperCase() : "";

                                if (prop.equals("X-WR-CALNAME") || prop.equals("WR-CALNAME")) {
                                    calendarName = val.replace("\\,", ",").replace("\\;", ";").trim();
                                } else if (prop.equals("BEGIN") && val.equalsIgnoreCase("VEVENT")) {
                                    inVEvent = true;
                                    uid = ""; summary = ""; description = ""; location = "";
                                    startIso = ""; endIso = ""; allDay = false; organizer = "";
                                } else if (prop.equals("END") && val.equalsIgnoreCase("VEVENT")) {
                                    if (inVEvent && !startIso.isEmpty()) {
                                        long startMs = CarEvent.parseIsoMillis(startIso);
                                        long endMs = !endIso.isEmpty() ? CarEvent.parseIsoMillis(endIso) : (startMs + 3600000L);
                                        if (endMs >= cutoff && eventsArray.length() < 150) {
                                            JSONObject evObj = new JSONObject();
                                            evObj.put("id", (uid.isEmpty() ? "ev-" + eventsArray.length() : uid) + "::" + startIso);
                                            evObj.put("summary", summary.isEmpty() ? "Untitled Event" : summary);
                                            evObj.put("description", description);
                                            evObj.put("location", location);
                                            evObj.put("start", startIso);
                                            evObj.put("end", endIso.isEmpty() ? startIso : endIso);
                                            evObj.put("allDay", allDay);
                                            evObj.put("calendarTitle", calendarName);
                                            evObj.put("organizer", organizer);
                                            eventsArray.put(evObj);
                                        }
                                    }
                                    inVEvent = false;
                                } else if (inVEvent) {
                                    if (prop.equals("UID")) uid = val.replace("\\,", ",").replace("\\;", ";").trim();
                                    else if (prop.equals("SUMMARY")) summary = val.replace("\\,", ",").replace("\\;", ";").replace("\\n", "\n").replace("\\N", "\n").trim();
                                    else if (prop.equals("DESCRIPTION")) description = val.replace("\\,", ",").replace("\\;", ";").replace("\\n", "\n").replace("\\N", "\n").trim();
                                    else if (prop.equals("LOCATION")) location = val.replace("\\,", ",").replace("\\;", ";").replace("\\n", "\n").replace("\\N", "\n").trim();
                                    else if (prop.equals("DTSTART")) {
                                        allDay = params.contains("VALUE=DATE");
                                        startIso = parseIcsDateToIso(val);
                                    } else if (prop.equals("DTEND")) {
                                        endIso = parseIcsDateToIso(val);
                                    } else if (prop.equals("ORGANIZER")) {
                                        organizer = val.replace("mailto:", "").trim();
                                    }
                                }
                            }
                        }
                        currentLine = rawLine;
                    }
                }

                String filteredJson = eventsArray.toString();
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                String syncedAt = sdf.format(new Date());
                prefs.edit()
                    .putString(KEY_EVENTS_JSON, filteredJson)
                    .putString(KEY_CALENDAR_NAME, calendarName)
                    .putString(KEY_SYNCED_AT, syncedAt)
                    .apply();

                List<CarEvent> parsed = parseEventsJson(filteredJson);
                synchronized (CACHE_LOCK) {
                    cachedEvents = parsed;
                    cacheInitialized = true;
                    cacheLoading = false;
                }

                notifyListeners();
                MAIN_HANDLER.post(() -> {
                    if (callback != null) {
                        callback.onComplete(true, "Schedule synced");
                    }
                });
            } catch (Exception ex) {
                MAIN_HANDLER.post(() -> {
                    if (callback != null) {
                        callback.onComplete(false, "Unable to sync right now");
                    }
                });
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    public static String[] extractPrimaryPhone(String... texts) {
        if (texts == null) return null;
        for (String text : texts) {
            if (text == null || text.isEmpty()) continue;
            Matcher matcher = PHONE_CANDIDATE_PATTERN.matcher(text);
            while (matcher.find()) {
                String candidate = matcher.group();
                int start = matcher.start();
                int end = matcher.end();

                char prevChar = start > 0 ? text.charAt(start - 1) : '\0';
                char nextChar = end < text.length() ? text.charAt(end) : '\0';
                if (prevChar == ':' || nextChar == ':' || prevChar == '/' || nextChar == '/') {
                    continue;
                }
                if ((prevChar == '-' || prevChar == '_') && start >= 2 && Character.isLetter(text.charAt(start - 2))) {
                    continue;
                }
                if (nextChar == '-' && end + 1 < text.length() && Character.isLetter(text.charAt(end + 1))) {
                    continue;
                }

                String preceding = text.substring(Math.max(0, start - 48), start);
                if (NON_PHONE_CONTEXT.matcher(preceding).find()) {
                    continue;
                }
                boolean hasPhoneContext = EXPLICIT_PHONE_CONTEXT.matcher(preceding).find();
                if (!hasPhoneContext && GENERIC_ID_CONTEXT.matcher(preceding).find()) {
                    continue;
                }

                String trimmed = candidate.trim();
                boolean hasLeadingPlus = trimmed.startsWith("+");
                String digitsOnly = trimmed.replaceAll("\\D", "");
                if (digitsOnly.length() < 8 || digitsOnly.length() > 15) continue;
                if (!hasLeadingPlus && digitsOnly.length() == 8 && digitsOnly.matches("^(?:19|20)\\d{6}$")) {
                    continue;
                }
                if (digitsOnly.matches("^(\\d)\\1{7,}$")) continue;

                boolean likely = false;
                if (hasLeadingPlus) {
                    likely = digitsOnly.matches("^[1-9].*");
                } else if (digitsOnly.startsWith("00")) {
                    likely = digitsOnly.length() >= 10 && digitsOnly.matches("^00[1-9].*");
                } else if (hasPhoneContext) {
                    likely = true;
                } else if (digitsOnly.matches("^0[1-9].*")) {
                    boolean hasSep = trimmed.matches(".*[\\s().-].*");
                    likely = digitsOnly.length() == 10 || (hasSep && digitsOnly.length() >= 8 && digitsOnly.length() <= 11);
                } else if (trimmed.matches("^\\(\\d{2,4}\\)[\\s.-]?\\d{3,4}[\\s.-]?\\d{3,4}$") ||
                           trimmed.matches("^\\d{3}[-.\\s]\\d{3}[-.\\s]\\d{4}$")) {
                    likely = true;
                }

                if (likely) {
                    String normalized = hasLeadingPlus ? "+" + digitsOnly : digitsOnly;
                    return new String[] { trimmed, "tel:" + normalized };
                }
            }
        }
        return null;
    }
}
