import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Test-only telemetry and real RN/Expo requests; the packed permission dispatcher stays in charge. */
export function prepareRendererPermissions(renderer: string, sdk: string, owner: 'rn' | 'expo', expo = true) {
  const permissions = path.join(sdk, 'android/retained/src/main/java/dev/taurinative/react/retained/TauriReactPermissions.kt');
  const source = readFileSync(permissions, 'utf8');
  const callback = '  ) { grants ->'; assert.equal(source.split(callback).length, 2);
  writeFileSync(permissions, source.replace(callback, `${callback}
    android.util.Log.i("TauriRecreation", org.json.JSONObject()
      .put("kind", "renderer-os-result").put("pid", android.os.Process.myPid())
      .put("activity", System.identityHashCode(activity)).put("grants", org.json.JSONObject(grants))
      .put("hasCurrentRequest", current != null).toString())`));
  if (owner === 'rn') {
    const file = path.join(renderer, expo ? 'fieldnotes.tsx' : 'index.tsx'), original = readFileSync(file, 'utf8');
    const request = 'const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);';
    assert.equal(original.split(request).length, 2);
    writeFileSync(file, original.replace(request, `const results = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
      const result = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];`));
  }
  const cameraAction = `['Replacement camera result', async () => {
      if (!replacementCamera) throw new Error('Replacement camera request did not start');
      return 'Replacement camera ' + await replacementCamera;
    }]`;
  if (!expo) {
    assert.equal(owner, 'rn');
    // Pass only the probe Activity's actual saved-state observation as a normal
    // RN initial prop. Permission registration, routing and lifecycle stay intact.
    const host = path.join(sdk, 'android/retained/src/main/java/dev/taurinative/react/retained/TauriReactHost.kt');
    const source = readFileSync(host, 'utf8'), surface = 'reactHost.createSurface(activity, module, null)';
    assert.equal(source.split(surface).length, 2);
    writeFileSync(host, source.replace(surface, `reactHost.createSurface(activity, module, android.os.Bundle().apply {
    putBoolean("recreated", activity.intent.getBooleanExtra("tauri.recreation.recreated", false))
    android.util.Log.i("TauriRecreation", org.json.JSONObject().put("kind", "renderer-props")
      .put("pid", android.os.Process.myPid()).put("activity", System.identityHashCode(activity))
      .put("recreated", getBoolean("recreated")).toString())
  })`));
    const entry = path.join(renderer, 'index.tsx'), original = readFileSync(entry, 'utf8').replace('AppRegistry, BackHandler', 'AppState, AppRegistry, BackHandler');
    const registration = "AppRegistry.registerComponent('RetainedFieldnotes', () => App);";
    assert.equal(original.split(registration).length, 2);
    writeFileSync(entry, original.replace(registration, `let replacementCamera: Promise<string> | undefined;
function RecreationFieldnotes({ recreated }: { recreated: boolean }) {
  useEffect(() => {
    console.log('Retained recreation initial prop', recreated);
    if (!recreated) return;
    let started = false;
    const request = (state: string | null) => {
      if (state !== 'active' || started) return;
      started = true;
      replacementCamera = PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    };
    const subscription = AppState.addEventListener('change', request);
    request(AppState.currentState);
    return () => subscription.remove();
  }, []);
  return <App extraActions={[${cameraAction}]} />;
}
AppRegistry.registerComponent('RetainedFieldnotes', () => RecreationFieldnotes);`));
    return;
  }
  const nativeProbe = path.join(renderer, 'modules/retained-expo-probe/android/src/main/java/dev/taurinative/expoprobe/RetainedExpoProbeModule.kt');
  const module = readFileSync(nativeProbe, 'utf8');
  const request = '    AsyncFunction("requestLocation")'; assert.equal(module.split(request).length, 2);
  writeFileSync(nativeProbe, module.replace(request, `    AsyncFunction("requestCamera") { promise: Promise ->
      checkNotNull(appContext.permissions).askForPermissions({ result ->
        ProbeState.callbacks.incrementAndGet()
        promise.resolve(result.getValue(Manifest.permission.CAMERA).status.name.lowercase())
      }, Manifest.permission.CAMERA)
    }
${request}`));
  const entry = path.join(renderer, 'index.tsx'); let text = readFileSync(entry, 'utf8');
  text = `import { useEffect } from 'react';\nimport { PermissionsAndroid } from 'react-native';\n${text}`;
  text = text.replace('requestLocation(): Promise<Record<string, string>>;', 'requestLocation(): Promise<Record<string, string>>;\n  requestCamera(): Promise<string>;');
  text = text.replace('function ExpoFieldnotes() {', `let replacementCamera: Promise<string> | undefined;
function ExpoFieldnotes() {
  useEffect(() => {
    if (probe.snapshot().activityCreates > 1) replacementCamera = ${owner === 'rn' ? 'PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)' : 'probe.requestCamera()'};
  }, []);`);
  text = text.replace('const extraActions: FieldnotesAction[] = [', `const extraActions: FieldnotesAction[] = [
    ${cameraAction},`);
  writeFileSync(entry, text);
}

export const rendererPermissionActivity = `
  override fun requestPermissions(permissions: Array<String>, code: Int, listener: com.facebook.react.modules.core.PermissionListener?) {
    fun recordPermission(kind: String, returned: Array<String>, grants: IntArray? = null) {
      android.util.Log.i("TauriRecreation", JSONObject().put("kind", kind).put("pid", android.os.Process.myPid())
        .put("activity", System.identityHashCode(this)).put("code", code).put("focused", hasWindowFocus())
        .put("permissions", org.json.JSONArray(returned.toList()))
        .put("grants", grants?.let { org.json.JSONArray(it.toList()) } ?: JSONObject.NULL).toString())
    }
    recordPermission("renderer-request", permissions)
    super.requestPermissions(permissions, code, com.facebook.react.modules.core.PermissionListener { resultCode, returned, grants ->
      recordPermission("renderer-listener-result", returned, grants)
      listener?.onRequestPermissionsResult(resultCode, returned, grants) ?: true
    })
  }
`;
