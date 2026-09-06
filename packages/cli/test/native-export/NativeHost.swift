import AppKit
import WebKit

final class NativeCore {
  typealias Invoke = @convention(c) (UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?
  typealias Free = @convention(c) (UnsafeMutablePointer<CChar>?) -> Void
  typealias Version = @convention(c) () -> UInt32
  let handle: UnsafeMutableRawPointer
  let invoke: Invoke
  let free: Free
  var responses = 0
  var frees = 0

  init(_ path: String) {
    guard let handle = dlopen(path, RTLD_NOW | RTLD_LOCAL),
      let invoke = dlsym(handle, "tauri_native_invoke"),
      let free = dlsym(handle, "tauri_native_string_free"),
      let version = dlsym(handle, "tauri_native_abi_version")
    else { fatalError("Cannot load generated native ABI") }
    self.handle = handle
    self.invoke = unsafeBitCast(invoke, to: Invoke.self)
    self.free = unsafeBitCast(free, to: Free.self)
    precondition(unsafeBitCast(version, to: Version.self)() == 1, "Expected ABI 1")
  }

  func call(_ command: String, _ payload: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed])
    let json = String(decoding: data, as: UTF8.self)
    return command.withCString { command in
      json.withCString { payload in
        guard let result = invoke(command, payload) else { fatalError("Null Rust result") }
        responses += 1
        defer { free(result); frees += 1 }
        return String(cString: result)
      }
    }
  }

  deinit { dlclose(handle) }
}

final class AssetHandler: NSObject, WKURLSchemeHandler {
  let root: URL
  init(_ root: URL) { self.root = root.standardizedFileURL }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, url.host == "app" else {
      task.didFailWithError(URLError(.badURL)); return
    }
    let relative = url.path == "/" ? "index.html" : String(url.path.dropFirst())
    let file = root.appendingPathComponent(relative).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
      task.didFailWithError(URLError(.fileDoesNotExist)); return
    }
    let mime = ["html": "text/html", "js": "text/javascript", "css": "text/css"][file.pathExtension] ?? "application/octet-stream"
    task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class FrontendHost: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  let core: NativeCore
  let view: WKWebView
  let direct: [Any]
  var timer: Timer?

  init(core: NativeCore, assets: URL, direct: [Any]) {
    self.core = core
    self.direct = direct
    let controller = WKUserContentController()
    controller.addUserScript(WKUserScript(source: """
      (() => {
        let next = 1;
        const pending = new Map();
        window.__spikeResolve = (id, response) => {
          const callbacks = pending.get(id);
          if (!callbacks) return;
          pending.delete(id);
          response.ok ? callbacks.resolve(response.value) : callbacks.reject(response.error);
        };
        window.__TAURI_INTERNALS__ = { invoke(command, payload = {}) {
          return new Promise((resolve, reject) => {
            const id = next++;
            pending.set(id, {resolve, reject});
            window.webkit.messageHandlers.invoke.postMessage({id, command, payload});
          });
        }};
      })();
      """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let config = WKWebViewConfiguration()
    config.userContentController = controller
    config.setURLSchemeHandler(AssetHandler(assets), forURLScheme: "spike")
    self.view = WKWebView(frame: NSRect(x: 0, y: 0, width: 600, height: 300), configuration: config)
    super.init()
    controller.add(self, name: "invoke")
    view.navigationDelegate = self
    view.load(URLRequest(url: URL(string: "spike://app/index.html")!))
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let id = body["id"] as? Int,
      let command = body["command"] as? String else { fatalError("Malformed bridge request") }
    do {
      let result = try core.call(command, body["payload"] ?? [:])
      view.evaluateJavaScript("window.__spikeResolve(\(id), \(result))")
    } catch { fatalError("Native request failed: \(error)") }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
      view.evaluateJavaScript("document.querySelector('#result').textContent") { value, error in
        guard let text = value as? String, text.hasPrefix("{") else { return }
        do {
          let frontend = try JSONSerialization.jsonObject(with: Data(text.utf8))
          let output = try JSONSerialization.data(withJSONObject: ["direct": self.direct, "frontend": frontend, "responses": self.core.responses, "frees": self.core.frees])
          print(String(decoding: output, as: UTF8.self))
          exit(0)
        } catch { fatalError("Frontend result: \(error)") }
      }
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fatalError("Frontend did not load: \(error)")
  }
}

let args = CommandLine.arguments
guard args.count == 4 else { fatalError("usage: NativeHost <dylib> <assets> <requests.json>") }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let core = NativeCore(args[1])
let requests = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[3]))) as! [[String: Any]]
let direct = try requests.map { request -> Any in
  let response = try core.call(request["command"] as! String, request["payload"] ?? [:])
  return try JSONSerialization.jsonObject(with: Data(response.utf8))
}
for index in 0..<10000 {
  let request = requests[index % requests.count]
  _ = try core.call(request["command"] as! String, request["payload"] ?? [:])
}
let host = FrontendHost(core: core, assets: URL(fileURLWithPath: args[2]), direct: direct)
let timeout = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { _ in
  fputs("Timed out waiting for the ordinary frontend\n", stderr)
  exit(1)
}
app.run()
