import ExpoModulesCore

@objc(TNExpoProbeState)
public final class ProbeState: NSObject, @unchecked Sendable {
  @objc public static let shared = ProbeState()
  private let lock = NSLock()
  private var counts: [String: Int] = [:]
  func increment(_ name: String) { lock.lock(); defer { lock.unlock() }; counts[name, default: 0] += 1 }
  @objc public func snapshot() -> [String: Int] { lock.lock(); defer { lock.unlock() }; return counts }
}

public class RetainedExpoProbeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RetainedExpoProbe")
    OnCreate { ProbeState.shared.increment("created") }
    OnDestroy { ProbeState.shared.increment("destroyed") }
    Function("snapshot") { ProbeState.shared.snapshot() }
    AsyncFunction("appCallbacks") { (promise: Promise) in
      MainActor.assumeIsolated {
      let app = UIApplication.shared
      guard let delegate = app.delegate,
        delegate.responds(to: #selector(UIApplicationDelegate.applicationDidReceiveMemoryWarning(_:))),
        delegate.responds(to: #selector(UIApplicationDelegate.application(_:performFetchWithCompletionHandler:))) else {
        promise.reject("missing_callback", "Original Tauri delegate did not expose Expo callbacks")
        return
      }
      delegate.applicationDidReceiveMemoryWarning?(app)
      delegate.application?(app, performFetchWithCompletionHandler: { result in
        ProbeState.shared.increment("fetchCompletions")
        promise.resolve(["result": result.rawValue, "counts": ProbeState.shared.snapshot()])
      })
      }
    }.runOnQueue(.main)
  }
}

public class RetainedExpoProbeSubscriber: ExpoAppDelegateSubscriber {
  public func appDelegateWillBeginInitialization() { ProbeState.shared.increment("applicationCreates") }
  public func application(_ app: UIApplication, willFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    ProbeState.shared.increment("willLaunch"); return true
  }
  public func application(_ app: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    ProbeState.shared.increment("didLaunch"); return true
  }
  public func applicationDidBecomeActive(_ app: UIApplication) { ProbeState.shared.increment("resumes") }
  public func applicationWillResignActive(_ app: UIApplication) { ProbeState.shared.increment("pauses") }
  public func applicationDidEnterBackground(_ app: UIApplication) { ProbeState.shared.increment("backgrounds") }
  public func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    ProbeState.shared.increment("urls"); return false
  }
  public func application(_ app: UIApplication, continue activity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    ProbeState.shared.increment("activities"); return false
  }
  public func customizeRootView(_ rootView: UIView) { ProbeState.shared.increment("customizations") }
  public func applicationDidReceiveMemoryWarning(_ app: UIApplication) { ProbeState.shared.increment("memoryWarnings") }
  public func application(_ app: UIApplication, performFetchWithCompletionHandler completion: @escaping (UIBackgroundFetchResult) -> Void) {
    ProbeState.shared.increment("fetches"); completion(.newData)
  }
}
