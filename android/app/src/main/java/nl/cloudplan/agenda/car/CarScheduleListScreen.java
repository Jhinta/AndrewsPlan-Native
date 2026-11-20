package nl.cloudplan.agenda.car;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.Screen;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.CarIcon;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.core.graphics.drawable.IconCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.util.ArrayList;
import java.util.List;
import nl.cloudplan.agenda.R;

public final class CarScheduleListScreen extends Screen implements DefaultLifecycleObserver {
    private static final String TAG = "AndrewsPlanCar";
    private boolean todayOnly = false;
    private boolean isSyncing = false;
    private boolean hasStoppedOnce = false;
    private final Runnable storeListener = this::invalidate;

    public CarScheduleListScreen(@NonNull CarContext carContext) {
        super(carContext);
        getLifecycle().addObserver(this);
        CarScheduleStore.ensureLoadedAsync(carContext);
    }

    @Override
    public void onStart(@NonNull LifecycleOwner owner) {
        CarScheduleStore.addListener(storeListener);
        if (hasStoppedOnce) {
            hasStoppedOnce = false;
            invalidate();
        }
    }

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        hasStoppedOnce = true;
        CarScheduleStore.removeListener(storeListener);
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        try {
            String filterTitle = todayOnly ? "Upcoming" : "Today";
            Action filterAction = new Action.Builder()
                .setTitle(filterTitle)
                .setOnClickListener(() -> {
                    todayOnly = !todayOnly;
                    invalidate();
                })
                .build();

            CarIcon syncIcon = new CarIcon.Builder(
                IconCompat.createWithResource(getCarContext(), R.drawable.ic_car_sync)
            ).setTint(CarColor.DEFAULT).build();

            Action syncAction = new Action.Builder()
                .setIcon(syncIcon)
                .setOnClickListener(this::triggerLiveSync)
                .build();

            ActionStrip actionStrip = new ActionStrip.Builder()
                .addAction(filterAction)
                .addAction(syncAction)
                .build();

            String title = todayOnly ? "AndrewsPlan · Today" : "AndrewsPlan";

            if (isSyncing || !CarScheduleStore.isCacheReady()) {
                if (!CarScheduleStore.isCacheReady()) {
                    CarScheduleStore.ensureLoadedAsync(getCarContext());
                }
                return new ListTemplate.Builder()
                    .setTitle(title)
                    .setHeaderAction(Action.APP_ICON)
                    .setActionStrip(actionStrip)
                    .setLoading(true)
                    .build();
            }

            long nowMs = System.currentTimeMillis();
            List<CarEvent> allEvents = CarScheduleStore.getCachedEvents();
            List<CarEvent> visibleEvents = new ArrayList<>();
            for (CarEvent ev : allEvents) {
                if (todayOnly ? ev.overlapsToday(nowMs) : ev.isUpcomingOrToday(nowMs)) {
                    visibleEvents.add(ev);
                }
            }

            int maxItems = 6;
            if (getCarContext().getCarAppApiLevel() >= 2) {
                try {
                    ConstraintManager cm = getCarContext().getCarService(ConstraintManager.class);
                    int hostLimit = cm.getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST);
                    if (hostLimit > 0) {
                        maxItems = Math.min(hostLimit, 25);
                    }
                } catch (Exception ignored) {
                    // Fallback to safe Android Auto default limit of 6
                }
            }

            ItemList.Builder listBuilder = new ItemList.Builder();
            if (visibleEvents.isEmpty()) {
                String emptyMsg = allEvents.isEmpty() && !CarScheduleStore.hasCredentials(getCarContext())
                    ? "Open AndrewsPlan on your phone to sign in and sync."
                    : todayOnly
                        ? "No events scheduled for today."
                        : "No upcoming events found.";
                listBuilder.setNoItemsMessage(emptyMsg);
            } else {
                int count = Math.min(visibleEvents.size(), maxItems);
                for (int i = 0; i < count; i++) {
                    final CarEvent event = visibleEvents.get(i);
                    Row.Builder rowBuilder = new Row.Builder()
                        .setTitle(event.formatListTitle(nowMs))
                        .setBrowsable(true)
                        .setOnClickListener(() ->
                            getScreenManager().push(new CarEventDetailScreen(getCarContext(), event))
                        );

                    String subtitle = event.formatListSubtitle(nowMs);
                    if (!subtitle.isEmpty()) {
                        rowBuilder.addText(subtitle);
                    }
                    listBuilder.addItem(rowBuilder.build());
                }
            }

            return new ListTemplate.Builder()
                .setTitle(title)
                .setHeaderAction(Action.APP_ICON)
                .setActionStrip(actionStrip)
                .setSingleList(listBuilder.build())
                .build();
        } catch (Throwable t) {
            Log.e(TAG, "Error building Android Auto schedule template", t);
            return new ListTemplate.Builder()
                .setTitle("AndrewsPlan")
                .setHeaderAction(Action.APP_ICON)
                .setSingleList(
                    new ItemList.Builder()
                        .setNoItemsMessage("Unable to load schedule. Open AndrewsPlan on your phone and sync again.")
                        .build()
                )
                .build();
        }
    }

    private void triggerLiveSync() {
        if (isSyncing) return;
        isSyncing = true;
        invalidate();
        CarScheduleStore.fetchLiveSync(getCarContext(), (success, message) -> {
            isSyncing = false;
            CarToast.makeText(getCarContext(), message, CarToast.LENGTH_SHORT).show();
            invalidate();
        });
    }
}
