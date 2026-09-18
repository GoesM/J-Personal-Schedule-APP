package cn.goesm.jcalendar;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.security.keystore.*;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

public class MainActivity extends Activity {

  private WebView web;
  private File root;
  private ExecutorService queue = Executors.newSingleThreadExecutor();
  private ValueCallback<Uri[]> fileCallback;
  private String exportText;
  private String exportId;

  public void onCreate(Bundle state) {
    super.onCreate(state);
    root = new File(getFilesDir(), "data");
    root.mkdirs();
    web = new WebView(this);
    // Own system-bar/cutout insets: Android 15 enforces edge-to-edge for target 35.
    // Applying padding to the native container keeps the WebView and its dialogs safe.
    FrameLayout container = new FrameLayout(this);
    container.setBackgroundColor(Color.rgb(245, 247, 247));
    container.addView(web, new FrameLayout.LayoutParams(-1, -1));
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
    } else {
      getWindow()
        .getDecorView()
        .setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
            View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
    }
    container.setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets bars = insets.getInsets(
          WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
        );
        android.graphics.Insets keyboard = insets.getInsets(
          WindowInsets.Type.ime()
        );
        v.setPadding(
          bars.left,
          bars.top,
          bars.right,
          Math.max(bars.bottom, keyboard.bottom)
        );
        return WindowInsets.CONSUMED;
      }
      v.setPadding(
        insets.getSystemWindowInsetLeft(),
        insets.getSystemWindowInsetTop(),
        insets.getSystemWindowInsetRight(),
        insets.getSystemWindowInsetBottom()
      );
      return insets.consumeSystemWindowInsets();
    });
    setContentView(container);
    container.post(() -> {
      if (Build.VERSION.SDK_INT >= 30) {
        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) controller.setSystemBarsAppearance(
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
    });
    container.requestApplyInsets();
    getWindow().setSoftInputMode(
      WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    );
    getWindow().setStatusBarColor(Color.rgb(245, 247, 247));
    getWindow().setNavigationBarColor(Color.rgb(245, 247, 247));
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setUseWideViewPort(true);
    web.getSettings().setLoadWithOverviewMode(true);
    web.getSettings().setAllowFileAccess(true);
    web.getSettings().setAllowFileAccessFromFileURLs(false);
    web.getSettings().setAllowUniversalAccessFromFileURLs(false);
    web.addJavascriptInterface(new Bridge(), "AndroidNative");
    web.setWebViewClient(
      new WebViewClient() {
        public boolean shouldOverrideUrlLoading(
          WebView v,
          WebResourceRequest r
        ) {
          return !r.getUrl().toString().startsWith("file:///android_asset/");
        }
      }
    );
    web.setWebChromeClient(
      new WebChromeClient() {
        public boolean onJsAlert(WebView v, String u, String m, JsResult r) {
          new AlertDialog.Builder(MainActivity.this)
            .setMessage(m)
            .setPositiveButton("确定", (d, w) -> r.confirm())
            .setOnCancelListener(d -> r.cancel())
            .show();
          return true;
        }

        public boolean onJsConfirm(WebView v, String u, String m, JsResult r) {
          new AlertDialog.Builder(MainActivity.this)
            .setMessage(m)
            .setPositiveButton("确定", (d, w) -> r.confirm())
            .setNegativeButton("取消", (d, w) -> r.cancel())
            .setOnCancelListener(d -> r.cancel())
            .show();
          return true;
        }

        public boolean onShowFileChooser(
          WebView v,
          ValueCallback<Uri[]> cb,
          FileChooserParams p
        ) {
          if (fileCallback != null) fileCallback.onReceiveValue(null);
          fileCallback = cb;
          Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          i.setType("application/json");
          i.addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(i, 2);
          return true;
        }
      }
    );
    web.loadUrl("file:///android_asset/index.html");
  }

  private File profile(JSONObject config) throws Exception {
    String value = config.optString("url");
    String name = "offline";
    if (!value.isEmpty()) {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(
        (value + "\n" + config.optString("branch", "main")).getBytes("UTF-8")
      );
      StringBuilder hex = new StringBuilder();
      for (byte b : digest) hex.append(String.format("%02x", b));
      name = hex.substring(0, 24);
    }
    return new File(root, "profiles/" + name);
  }

  private File file(String p) throws Exception {
    File directory = profile(settings());
    File f = new File(directory, p.replaceFirst("^/", ""));
    if (
      !f
        .getCanonicalPath()
        .startsWith(directory.getCanonicalPath() + File.separator)
    ) throw new IOException("非法路径");
    return f;
  }

  private void saveSettings(JSONObject value) throws Exception {
    File old = profile(settings()),
      next = profile(value);
    File dest = new File(next, "repo/ops");
    dest.mkdirs();
    if (!old.equals(next)) {
      File source = new File(old, "repo/ops");
      File[] files = source.listFiles();
      if (files != null) for (File f : files)
        if (f.getName().endsWith(".json")) {
          File target = new File(dest, f.getName());
          if (!target.exists()) Files.copy(f.toPath(), target.toPath());
        }
    }
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.ENCRYPT_MODE, key());
    JSONObject x = new JSONObject()
      .put("iv", encode(c.getIV()))
      .put("data", encode(c.doFinal(value.toString().getBytes("UTF-8"))));
    Files.write(
      new File(root, "settings.enc").toPath(),
      x.toString().getBytes("UTF-8")
    );
  }

  private byte[] decode(String s) {
    return android.util.Base64.decode(s, android.util.Base64.NO_WRAP);
  }

  private String encode(byte[] b) {
    return android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP);
  }

  private javax.crypto.SecretKey key() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (!ks.containsAlias("JSettings")) {
      KeyGenerator gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
      gen.init(
        new KeyGenParameterSpec.Builder(
          "JSettings",
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .build()
      );
      gen.generateKey();
    }
    return (javax.crypto.SecretKey) ks.getKey("JSettings", null);
  }

  private JSONObject settings() throws Exception {
    File f = new File(root, "settings.enc");
    if (!f.exists()) return new JSONObject();
    JSONObject x = new JSONObject(
      new String(Files.readAllBytes(f.toPath()), "UTF-8")
    );
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(
      Cipher.DECRYPT_MODE,
      key(),
      new GCMParameterSpec(128, decode(x.getString("iv")))
    );
    return new JSONObject(
      new String(c.doFinal(decode(x.getString("data"))), "UTF-8")
    );
  }

  public class Bridge {

    @JavascriptInterface
    public void invoke(String id, String method, String json) {
      queue.execute(() -> {
        try {
          JSONArray a = new JSONArray(json);
          if (method.equals("export")) {
            exportId = id;
            execute(method, a);
            return;
          }
          Object result = execute(method, a);
          JSONArray wrapped = new JSONArray();
          wrapped.put(result == null ? JSONObject.NULL : result);
          String encoded = wrapped.toString();
          String out = encoded.substring(1, encoded.length() - 1);
          runOnUiThread(() ->
            web.evaluateJavascript(
              "window.nativeResult(" +
                JSONObject.quote(id) +
                ",null," +
                out +
                ")",
              null
            )
          );
        } catch (Exception e) {
          String msg = e.getMessage() == null ? e.toString() : e.getMessage();
          runOnUiThread(() ->
            web.evaluateJavascript(
              "window.nativeResult(" +
                JSONObject.quote(id) +
                "," +
                JSONObject.quote(msg) +
                ",null)",
              null
            )
          );
        }
      });
    }
  }

  private Object execute(String m, JSONArray a) throws Exception {
    String p = a.optString(0);
    File f;
    switch (m) {
      case "read":
        f = file(p);
        if (!f.exists()) throw new IOException("ENOENT " + p);
        return encode(Files.readAllBytes(f.toPath()));
      case "write":
        f = file(p);
        f.getParentFile().mkdirs();
        File temp = new File(
          f.getParentFile(),
          f.getName() + ".tmp-" + UUID.randomUUID()
        );
        Files.write(temp.toPath(), decode(a.getString(1)));
        Files.move(
          temp.toPath(),
          f.toPath(),
          StandardCopyOption.REPLACE_EXISTING,
          StandardCopyOption.ATOMIC_MOVE
        );
        return null;
      case "mkdir":
        file(p).mkdirs();
        return null;
      case "list":
        f = file(p);
        if (!f.exists()) throw new IOException("ENOENT " + p);
        return new JSONArray(Arrays.asList(Objects.requireNonNull(f.list())));
      case "unlink":
      case "rmdir":
        if (!file(p).exists()) throw new IOException("ENOENT " + p);
        if (!file(p).delete()) throw new IOException("无法删除 " + p);
        return null;
      case "stat":
        f = file(p);
        if (!f.exists()) throw new IOException("ENOENT " + p);
        return new JSONObject()
          .put("directory", f.isDirectory())
          .put("size", f.length())
          .put("mode", f.isDirectory() ? 16877 : 33188)
          .put("mtimeMs", f.lastModified())
          .put("ctimeMs", f.lastModified())
          .put("ino", 0)
          .put("uid", 0)
          .put("gid", 0);
      case "settings":
        return settings();
      case "saveSettings":
        saveSettings(a.getJSONObject(0));
        return null;
      case "ready":
        return null;
      case "exit":
        runOnUiThread(() -> finish());
        return null;
      case "export":
        exportText = p;
        runOnUiThread(() -> {
          Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          i.setType("application/json");
          i.addCategory(Intent.CATEGORY_OPENABLE);
          i.putExtra(Intent.EXTRA_TITLE, "J人日程备份.json");
          startActivityForResult(i, 3);
        });
        return null;
      case "http":
        JSONObject req = a.getJSONObject(0);
        URL u = new URL(req.getString("url")),
          configured = new URL(settings().getString("url"));
        if (
          !u.getProtocol().equals("https") ||
          !u.getHost().equals(configured.getHost()) ||
          u.getPort() != configured.getPort()
        ) throw new IOException("禁止非仓库地址请求");
        HttpURLConnection h = (HttpURLConnection) u.openConnection();
        h.setInstanceFollowRedirects(false);
        h.setConnectTimeout(30000);
        h.setReadTimeout(60000);
        h.setRequestMethod(req.getString("method"));
        JSONObject headers = req.getJSONObject("headers");
        for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
          String k = it.next();
          h.setRequestProperty(k, headers.getString(k));
        }
        if (req.getString("method").equals("POST")) {
          h.setDoOutput(true);
          try (OutputStream out = h.getOutputStream()) {
            out.write(decode(req.getString("body")));
          }
        }
        int code = h.getResponseCode();
        JSONObject responseHeaders = new JSONObject();
        for (Map.Entry<String, List<String>> entry : h
          .getHeaderFields()
          .entrySet())
          if (entry.getKey() != null) responseHeaders.put(
            entry.getKey().toLowerCase(Locale.ROOT),
            String.join(",", entry.getValue())
          );
        InputStream input =
          code >= 400 ? h.getErrorStream() : h.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (input != null) {
          byte[] buffer = new byte[8192];
          int n;
          while ((n = input.read(buffer)) != -1) out.write(buffer, 0, n);
          input.close();
        }
        JSONObject response = new JSONObject()
          .put("url", u.toString())
          .put("method", req.getString("method"))
          .put("statusCode", code)
          .put("statusMessage", h.getResponseMessage())
          .put("headers", responseHeaders)
          .put("body", encode(out.toByteArray()));
        h.disconnect();
        return response;
      default:
        throw new IOException("未知操作");
    }
  }

  protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == 2 && fileCallback != null) {
      fileCallback.onReceiveValue(
        result == RESULT_OK && data != null
          ? new Uri[] { data.getData() }
          : null
      );
      fileCallback = null;
    }
    if (code == 3) {
      boolean ok = result == RESULT_OK && data != null;
      String error = null;
      if (ok) {
        try (
          OutputStream out = getContentResolver().openOutputStream(
            data.getData()
          )
        ) {
          out.write(exportText.getBytes("UTF-8"));
        } catch (Exception e) {
          error = e.getMessage();
          ok = false;
        }
      }
      web.evaluateJavascript(
        "window.nativeResult(" +
          JSONObject.quote(exportId) +
          "," +
          (error == null ? "null" : JSONObject.quote(error)) +
          "," +
          ok +
          ")",
        null
      );
      exportId = null;
      exportText = null;
    }
  }

  public void onBackPressed() {
    web.evaluateJavascript(
      "(function(){const d=document.getElementById('dialog');if(d&&d.open){d.close();return true;}if(document.body.classList.contains('menu-open')){document.body.classList.remove('menu-open');document.getElementById('menu').setAttribute('aria-expanded','false');return true;}if(window.jExitReady){window.dispatchEvent(new Event('native-exit-request'));return true;}return false;})()",
      value -> {
        if (!"true".equals(value)) new AlertDialog.Builder(MainActivity.this)
          .setMessage(
            "暂时无法检查同步状态。是否直接退出？本地已保存的数据会保留。"
          )
          .setPositiveButton("直接退出", (d, w) -> finish())
          .setNegativeButton("取消退出", null)
          .show();
      }
    );
  }
}
