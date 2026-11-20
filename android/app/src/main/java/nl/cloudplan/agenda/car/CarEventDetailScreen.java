package nl.cloudplan.agenda.car;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.HostException;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.CarIcon;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.core.graphics.drawable.IconCompat;
import nl.cloudplan.agenda.R;

public final class CarEventDetailScreen extends Screen {
    private final CarEvent event;

    public CarEventDetailScreen(@NonNull CarContext carContext, @NonNull CarEvent event) {
        super(carContext);
        this.event = event;
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        long nowMs = System.currentTimeMillis();
        Pane.Builder paneBuilder = new Pane.Builder();

        // Row 1: Date, Time & Duration
        Row.Builder timeRow = new Row.Builder()
            .setTitle(event.formatTimeAndDuration(nowMs));
        if (!event.calendarTitle.isEmpty()) {
            timeRow.addText(event.calendarTitle);
        }
        paneBuilder.addRow(timeRow.build());

        int rowCount = 1;

        // Row 2: Location
        if (event.hasNavigableLocation() && rowCount < 4) {
            paneBuilder.addRow(
                new Row.Builder()
                    .setTitle("Location")
                    .addText(event.location)
                    .build()
            );
            rowCount++;
        }

        // Row 3: Phone number
        if (event.hasPhone() && rowCount < 4) {
            paneBuilder.addRow(
                new Row.Builder()
                    .setTitle("Phone")
                    .addText(event.phoneDisplay)
                    .build()
            );
            rowCount++;
        }

        // Row 4: Notes / Organizer (concise for driving safety)
        if (rowCount < 4) {
            String notes = event.description != null ? event.description.replaceAll("\\s+", " ").trim() : "";
            if (!notes.isEmpty()) {
                if (notes.length() > 140) {
                    notes = notes.substring(0, 137) + "…";
                }
                paneBuilder.addRow(
                    new Row.Builder()
                        .setTitle("Notes")
                        .addText(notes)
                        .build()
                );
            } else if (!event.organizer.isEmpty()) {
                paneBuilder.addRow(
                    new Row.Builder()
                        .setTitle("Organizer")
                        .addText(event.organizer)
                        .build()
                );
            }
        }

        // Primary Action 1: Navigate on Android Auto display
        if (event.hasNavigableLocation()) {
            CarIcon navIcon = new CarIcon.Builder(
                IconCompat.createWithResource(getCarContext(), R.drawable.ic_car_navigate)
            ).setTint(CarColor.DEFAULT).build();

            paneBuilder.addAction(
                new Action.Builder()
                    .setTitle("Navigate")
                    .setIcon(navIcon)
                    .setBackgroundColor(CarColor.PRIMARY)
                    .setOnClickListener(this::launchNavigation)
                    .build()
            );
        }

        // Primary Action 2: Hands-free Call via Bluetooth
        if (event.hasPhone()) {
            CarIcon callIcon = new CarIcon.Builder(
                IconCompat.createWithResource(getCarContext(), R.drawable.ic_car_call)
            ).setTint(CarColor.DEFAULT).build();

            paneBuilder.addAction(
                new Action.Builder()
                    .setTitle("Call")
                    .setIcon(callIcon)
                    .setOnClickListener(this::launchDialer)
                    .build()
            );
        }

        return new PaneTemplate.Builder(paneBuilder.build())
            .setHeaderAction(Action.BACK)
            .setTitle(event.summary)
            .build();
    }

    private void launchNavigation() {
        double[] coords = event.parseLatLng();
        Uri geoUri;
        if (coords != null) {
            geoUri = Uri.parse("geo:" + coords[0] + "," + coords[1] + "?q=" + coords[0] + "," + coords[1]);
        } else {
            geoUri = Uri.parse("geo:0,0?q=" + Uri.encode(event.location));
        }

        Intent navIntent = new Intent(CarContext.ACTION_NAVIGATE, geoUri);
        try {
            getCarContext().startCarApp(navIntent);
        } catch (HostException ex) {
            CarToast.makeText(getCarContext(), "No car navigation app available", CarToast.LENGTH_LONG).show();
        }
    }

    private void launchDialer() {
        Intent dialIntent = new Intent(Intent.ACTION_DIAL, Uri.parse(event.phoneHref));
        try {
            getCarContext().startCarApp(dialIntent);
        } catch (HostException ex) {
            CarToast.makeText(getCarContext(), "Unable to start call from car", CarToast.LENGTH_LONG).show();
        }
    }
}
