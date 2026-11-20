package nl.cloudplan.agenda.car;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CarScheduleBridge")
public class CarScheduleBridgePlugin extends Plugin {

    @PluginMethod
    public void syncSchedule(PluginCall call) {
        String eventsJson = call.getString("eventsJson", "[]");
        String calendarName = call.getString("calendarName", "AndrewsPlan");
        String syncedAt = call.getString("syncedAt", "");
        String username = call.getString("username", "");
        String password = call.getString("password", "");

        CarScheduleStore.saveFromBridge(
            getContext(),
            eventsJson,
            calendarName,
            syncedAt,
            username,
            password
        );
        call.resolve();
    }

    @PluginMethod
    public void clearSchedule(PluginCall call) {
        CarScheduleStore.clear(getContext());
        call.resolve();
    }
}
