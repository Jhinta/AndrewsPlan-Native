package nl.cloudplan.agenda;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import nl.cloudplan.agenda.car.CarScheduleBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CarScheduleBridgePlugin.class);
        registerPlugin(com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth.class);
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            try {
                this.bridge.getWebView().clearCache(true);
            } catch (Exception ignored) {}
        }
        if (this.bridge != null) {
            this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if ("intent".equals(url.getScheme())) {
                        try {
                            Intent parsedIntent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
                            if (Intent.ACTION_VIEW.equals(parsedIntent.getAction()) && parsedIntent.getComponent() == null) {
                                parsedIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                                parsedIntent.setSelector(null);
                                try {
                                    startActivity(parsedIntent);
                                    return true;
                                } catch (ActivityNotFoundException ignored) {
                                    String fallbackUrl = parsedIntent.getStringExtra("browser_fallback_url");
                                    if (fallbackUrl != null && (fallbackUrl.startsWith("https://") || fallbackUrl.startsWith("http://"))) {
                                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)));
                                        return true;
                                    }
                                }
                            }
                        } catch (Exception ignored) {
                            // Fall through to default bridge handling
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
