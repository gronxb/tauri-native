import UIKit
import WebKit

final class AssetHandler: NSObject, WKURLSchemeHandler {
  let root: URL
  init(_ root: URL) { self.root = root.standardizedFileURL }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, url.host == "app" else {
      task.didFailWithError(URLError(.badURL)); return
    }
    let file = root.appendingPathComponent(url.path == "/" ? "index.html" : String(url.path.dropFirst())).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
      task.didFailWithError(URLError(.fileDoesNotExist)); return
    }
    let mime = ["html": "text/html", "js": "text/javascript", "css": "text/css"][file.pathExtension] ?? "application/octet-stream"
    task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
    task.didReceive(data); task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

@main
final class ArtifactHost: UIResponder, UIApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
  var window: UIWindow?
  var view: WKWebView!
  var responses = 0
  var frees = 0
  var direct: [Any] = []
  var timer: Timer?

  func call(_ command: String, _ payload: Any) throws -> String {
    let json = String(decoding: try JSONSerialization.data(withJSONObject: payload), as: UTF8.self)
    return command.withCString { command in json.withCString { payload in
      guard let result = tauri_native_invoke(command, payload) else { fatalError("Null ABI response") }
      responses += 1
      defer { tauri_native_string_free(result); frees += 1 }
      return String(cString: result)
    }}
  }

  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    precondition(tauri_native_abi_version() == 2)
    do {
      for (command, payload) in [
        ("describe", ["request": ["displayName": "한글 🦀", "values": [2, 3, 5]]] as [String: Any]),
        ("describe", ["request": ["displayName": "", "values": []]] as [String: Any]),
        ("optional", [:]),
      ] {
        direct.append(try JSONSerialization.jsonObject(with: Data(call(command, payload).utf8)))
      }
    } catch { finish(["fatal": String(describing: error)]) }
    let controller = WKUserContentController()
    controller.addUserScript(WKUserScript(source: """
      (() => {
        let next = 1;
        const pending = new Map();
        window.__artifactResolve = (id, response) => {
          const callbacks = pending.get(id); if (!callbacks) return;
          pending.delete(id);
          response.ok ? callbacks.resolve(response.value) : callbacks.reject(response.error);
        };
        window.__TAURI_INTERNALS__ = { invoke(command, payload = {}) {
          return new Promise((resolve, reject) => {
            const id = next++; pending.set(id, {resolve, reject});
            window.webkit.messageHandlers.invoke.postMessage({id, command, payload});
          });
        }};
      })();
      """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    controller.add(self, name: "invoke")
    let config = WKWebViewConfiguration()
    config.userContentController = controller
    config.setURLSchemeHandler(AssetHandler(Bundle.main.bundleURL.appendingPathComponent("TauriNativeAssets.bundle")), forURLScheme: "artifact")
    view = WKWebView(frame: UIScreen.main.bounds, configuration: config)
    view.navigationDelegate = self
    let root = UIViewController(); root.view = view
    window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = root; window?.makeKeyAndVisible()
    view.load(URLRequest(url: URL(string: "artifact://app/index.html")!))
    Timer.scheduledTimer(withTimeInterval: 40, repeats: false) { [self] _ in finish(["fatal": "Frontend timed out"]) }
    return true
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let id = body["id"] as? Int, let command = body["command"] as? String else { fatalError("Invalid request") }
    do {
      let response = try call(command, body["payload"] ?? [:])
      view.evaluateJavaScript("window.__artifactResolve(\(id), \(response))")
    } catch { finish(["fatal": String(describing: error)]) }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
      view.evaluateJavaScript("document.querySelector('#result').textContent") { [self] value, _ in
        guard let text = value as? String, text.hasPrefix("{") else { return }
        do {
          let frontend = try JSONSerialization.jsonObject(with: Data(text.utf8))
          finish(["abiVersion": tauri_native_abi_version(), "direct": direct, "frontend": frontend, "responses": responses, "frees": frees])
        } catch { finish(["fatal": String(describing: error)]) }
      }
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    finish(["fatal": String(describing: error)])
  }

  func finish(_ result: [String: Any]) -> Never {
    let report = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("report.json")
    try! JSONSerialization.data(withJSONObject: result).write(to: report, options: .atomic)
    exit(result["fatal"] == nil ? 0 : 1)
  }
}
