import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Test-only telemetry and real RN/Expo requests; the packed permission dispatcher stays in charge. */
export function prepareRendererPermissions(renderer: string, sdk: string, owner: 'rn' | 'expo') {
  const permissions = path.join(sdk, 'android/retained/src/main/java/dev/taurinative/react/retained/TauriReactPermissions.kt');
  const source = readFileSync(permissions, 'utf8');
  const callback = '  ) { grants ->'; assert.equal(source.split(callback).length, 2);
  writeFileSync(permissions, source.replace(callback, `${callback}
    android.util.Log.i("TauriRecreation", org.json.JSONObject()
      .put("kind", "renderer-os-result").put("pid", android.os.Process.myPid())
      .put("activity", System.identityHashCode(activity)).put("grants", org.json.JSONObject(grants))
      .put("hasCurrentRequest", current != null).toString())`));
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
    ['Replacement camera result', async () => {
      if (!replacementCamera) throw new Error('Replacement camera request did not start');
      return 'Replacement camera ' + await replacementCamera;
    }],`);
  writeFileSync(entry, text);
  if (owner === 'rn') {
    const file = path.join(renderer, 'fieldnotes.tsx'), original = readFileSync(file, 'utf8');
    const request = 'const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);';
    assert.equal(original.split(request).length, 2);
    writeFileSync(file, original.replace(request, `const results = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
      const result = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];`));
  }
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
