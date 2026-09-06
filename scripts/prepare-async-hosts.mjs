import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [rn, lynx] = process.argv.slice(2).map(value => path.resolve(value));
assert(rn && lynx, 'Usage: node scripts/prepare-async-hosts.mjs RN_BASELINE_HOST LYNX_BASELINE_HOST');
const report = JSON.parse(readFileSync(path.join(root, 'target/async-protocol/export-report.json')));
assert(report.desktopAsyncParity && report.producerDeleted, 'Complete the async export gate first');

function edit(file, update) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('Reload native runtime')) return;
  const result = update(source);
  assert.notEqual(result, source, `Expected the baseline QA template: ${file}`);
  writeFileSync(file, result);
}

for (const [host, sdk] of [[rn, 'react-native'], [lynx, 'lynx']]) {
  const require = createRequire(path.join(host, 'package.json'));
  const { readArtifacts } = require(`@tauri-native/${sdk}/artifacts`);
  for (const platform of ['ios', 'android']) {
    const artifacts = path.join(root, 'target/async-protocol/artifacts', platform);
    readArtifacts(artifacts, platform);
    const output = path.join(host, 'tauri-native', platform);
    rmSync(output, { recursive: true, force: true });
    cpSync(artifacts, output, { recursive: true });
  }
  const source = sdk === 'lynx' ? path.join(host, 'src') : host;
  cpSync(path.join(root, 'packages', sdk, 'test/native-artifacts/AsyncApp.tsx'), path.join(source, 'App.tsx'));
  cpSync(path.join(root, 'scripts/async-contract.ts'), path.join(source, 'async-contract.ts'));
}

// These buttons belong only to the disposable hosts and use public runtime APIs.
edit(path.join(rn, 'ios/TauriArtifactHost/AppDelegate.swift'), source => source.replace('  var window: UIWindow?', '  @objc private func reloadRuntime() { RCTTriggerReloadCommandListeners("tauri-native async QA") }\n  var window: UIWindow?').replace('    return true', `    let reload = UIButton(type: .system)
    reload.setTitle("Reload native runtime", for: .normal)
    reload.backgroundColor = .white
    reload.translatesAutoresizingMaskIntoConstraints = false
    reload.addTarget(self, action: #selector(reloadRuntime), for: .touchUpInside)
    window!.addSubview(reload)
    NSLayoutConstraint.activate([
      reload.bottomAnchor.constraint(equalTo: window!.safeAreaLayoutGuide.bottomAnchor),
      reload.centerXAnchor.constraint(equalTo: window!.centerXAnchor),
      reload.heightAnchor.constraint(equalToConstant: 44),
    ])
    return true`));

edit(path.join(rn, 'android/app/src/main/java/dev/taurinative/rnartifacttest/MainActivity.kt'), source => source.replace('class MainActivity : ReactActivity() {', `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    val reload = android.widget.Button(this).apply {
      text = "Reload native runtime"
      setOnClickListener { reactHost?.reload("tauri-native async QA") }
    }
    addContentView(reload, android.widget.FrameLayout.LayoutParams(
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      android.view.Gravity.BOTTOM or android.view.Gravity.CENTER_HORIZONTAL,
    ))
  }
`));

edit(path.join(lynx, 'ios/Hello-Lynx/ViewController.swift'), source => source
  .replace('  private var lynxView: LynxView?', `  private var lynxView: LynxView?
  private let reload = UIButton(type: .system)

  @objc private func reloadRuntime() {
    lynxView?.clearForDestroy()
    lynxView?.removeFromSuperview()
    lynxView = nil
    view.setNeedsLayout()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    reload.setTitle("Reload native runtime", for: .normal)
    reload.backgroundColor = .white
    reload.translatesAutoresizingMaskIntoConstraints = false
    reload.addTarget(self, action: #selector(reloadRuntime), for: .touchUpInside)
    view.addSubview(reload)
    NSLayoutConstraint.activate([
      reload.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
      reload.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      reload.heightAnchor.constraint(equalToConstant: 44),
    ])
  }`)
  .replace('    self.view.addSubview(lynxView)', '    self.view.addSubview(lynxView)\n    self.view.bringSubviewToFront(reload)'));

edit(path.join(lynx, 'android/app/src/main/java/dev/taurinative/lynxexample/MainActivity.java'), source => source
  .replace('public final class MainActivity extends Activity {', `public final class MainActivity extends Activity {
  private android.widget.FrameLayout container;
  private LynxView lynxView;`)
  .replace('    LynxViewBuilder builder = new LynxViewBuilder();', `    container = new android.widget.FrameLayout(this);
    setContentView(container);
    android.widget.Button reload = new android.widget.Button(this);
    reload.setText("Reload native runtime");
    reload.setOnClickListener(view -> reloadRuntime());
    container.addView(reload, new android.widget.FrameLayout.LayoutParams(
      android.view.ViewGroup.LayoutParams.WRAP_CONTENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
      android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL));
    reloadRuntime();
  }

  private void reloadRuntime() {
    if (lynxView != null) { container.removeView(lynxView); lynxView.destroy(); }
    LynxViewBuilder builder = new LynxViewBuilder();`)
  .replace('    LynxView lynxView = builder.build(this);\n    setContentView(lynxView);', '    lynxView = builder.build(this);\n    container.addView(lynxView, 0, new android.widget.FrameLayout.LayoutParams(-1, -1));'));
console.log('Prepared ABI 2 async screens and public runtime reload controls; rebuild bundles, Pods and both native hosts.');
