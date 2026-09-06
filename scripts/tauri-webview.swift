import UIKit
import WebKit

private let bridgeName = "tauriNative"
private let assetScheme = "tauri-native"
private let assetHost = "app"

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
  weak var delegate: WKScriptMessageHandler?

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    delegate?.userContentController(userContentController, didReceive: message)
  }
}

private final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
  private let rootURL: URL

  init(rootURL: URL) {
    self.rootURL = rootURL.standardizedFileURL
  }

  func webView(
    _ webView: WKWebView,
    start urlSchemeTask: WKURLSchemeTask
  ) {
    guard let requestURL = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(URLError(.badURL))
      return
    }

    var relativePath = requestURL.path.removingPercentEncoding ?? requestURL.path
    if relativePath.isEmpty || relativePath == "/" {
      relativePath = "index.html"
    } else if relativePath.hasPrefix("/") {
      relativePath.removeFirst()
    }

    let fileURL = rootURL
      .appendingPathComponent(relativePath)
      .standardizedFileURL
    let rootPath = rootURL.path
    let isInsideRoot = fileURL.path == rootPath ||
      fileURL.path.hasPrefix(rootPath + "/")

    guard isInsideRoot, let data = try? Data(contentsOf: fileURL) else {
      urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
      return
    }

    let response = URLResponse(
      url: requestURL,
      mimeType: Self.mimeType(for: fileURL.pathExtension),
      expectedContentLength: data.count,
      textEncodingName: "utf-8"
    )
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(
    _ webView: WKWebView,
    stop urlSchemeTask: WKURLSchemeTask
  ) {}

  private static func mimeType(for pathExtension: String) -> String {
    switch pathExtension.lowercased() {
    case "css": "text/css"
    case "html": "text/html"
    case "js": "text/javascript"
    case "json": "application/json"
    case "png": "image/png"
    case "svg": "image/svg+xml"
    case "woff2": "font/woff2"
    default: "application/octet-stream"
    }
  }
}

@objc(__TAURI_NATIVE_SWIFT_VIEW__)
public final class __TAURI_NATIVE_SWIFT_VIEW__: UIView {
  private let messageHandler: WeakScriptMessageHandler
  private let assetSchemeHandler: AssetSchemeHandler?
  private let webView: WKWebView
  private var documentID: String?
  private var session: UInt64 = 0
  private var suspended = false

  public override init(frame: CGRect) {
    let controller = WKUserContentController()
    controller.addUserScript(WKUserScript(
      source: Self.bridgeSource,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    ))

    let messageHandler = WeakScriptMessageHandler()
    controller.add(messageHandler, name: bridgeName)

    let configuration = WKWebViewConfiguration()
    configuration.userContentController = controller

    let bundleURL = Bundle.main.url(
      forResource: "TauriNativeAssets",
      withExtension: "bundle"
    )
    let assetRootURL = bundleURL.flatMap { Bundle(url: $0)?.resourceURL }
    let assetSchemeHandler = assetRootURL.map(AssetSchemeHandler.init)
    if let assetSchemeHandler {
      configuration.setURLSchemeHandler(
        assetSchemeHandler,
        forURLScheme: assetScheme
      )
    }

    self.messageHandler = messageHandler
    self.assetSchemeHandler = assetSchemeHandler
    self.webView = WKWebView(frame: frame, configuration: configuration)
    super.init(frame: frame)

    messageHandler.delegate = self
    webView.navigationDelegate = self
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    __TAURI_NATIVE_SCROLL_SETTINGS__
    webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    addSubview(webView)
  }

  private func loadFrontend() {
    if assetSchemeHandler != nil {
      let indexURL = URL(string: "tauri-native://app/index.html")!
      webView.load(URLRequest(url: indexURL))
    } else {
      webView.loadHTMLString(
        "<h2>tauri-native assets are missing</h2>" +
          "<p>Run tauri-native export ios before pod install.</p>",
        baseURL: nil
      )
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    if session != 0 { __TAURI_NATIVE_OBJC_BRIDGE__.closeSession(session) }
    webView.configuration.userContentController
      .removeScriptMessageHandler(forName: bridgeName)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    suspended = window == nil
    if suspended {
      closeSession()
      documentID = nil
      webView.evaluateJavaScript("window.__RNTauriSuspend?.();")
    } else {
      loadFrontend()
    }
  }

  private func closeSession() {
    if session != 0 { __TAURI_NATIVE_OBJC_BRIDGE__.closeSession(session) }
    session = 0
  }

  private func deliver(_ function: String, _ arguments: [Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: arguments),
      let json = String(data: data, encoding: .utf8) else { return }
    webView.evaluateJavaScript("window.\(function)?.apply(null, \(json));")
  }

  private static let bridgeSource = """
__TAURI_NATIVE_WEBVIEW_CLIENT__
    """
}

extension __TAURI_NATIVE_SWIFT_VIEW__: WKScriptMessageHandler {
  public func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard !suspended, message.name == bridgeName, message.frameInfo.isMainFrame,
      let body = message.body as? [String: Any],
      let document = body["document"] as? String,
      let type = body["type"] as? String else { return }
    if type == "open" {
      closeSession()
      documentID = document
      return
    }
    guard document == documentID else { return }
    if type == "close" {
      closeSession()
      return
    }
    if type == "poll" {
      deliver("__RNTauriDrain", [document, session == 0 ? "[]" : __TAURI_NATIVE_OBJC_BRIDGE__.poll(session)])
      return
    }
    guard type == "invoke", let requestID = body["id"] as? String else { return }
    guard let command = body["command"] as? String,
      let payloadData = try? JSONSerialization.data(withJSONObject: body["payload"] ?? [:], options: [.fragmentsAllowed]),
      let payloadJSON = String(data: payloadData, encoding: .utf8) else {
      deliver("__RNTauriResolve", [document, requestID, "", "invalid_argument"])
      return
    }
    if session == 0 { session = __TAURI_NATIVE_OBJC_BRIDGE__.createSession() }
    if session == 0 {
      // The explicit ABI 0/1 compatibility route retains its blocking behavior.
      let response = __TAURI_NATIVE_OBJC_BRIDGE__.invoke(command, payloadJSON: payloadJSON)
      deliver("__RNTauriResolve", [document, requestID, response ?? "", response == nil ? "invalid_response" : ""])
      return
    }
    let acknowledgement = __TAURI_NATIVE_OBJC_BRIDGE__.start(session, requestID: requestID, command: command, payloadJSON: payloadJSON)
    if !acknowledgement.isEmpty {
      let data = acknowledgement.data(using: .utf8)!
      let failure = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
      deliver("__RNTauriResolve", [document, requestID, "", failure?["error"] ?? "invalid_response"])
    }
  }
}

extension __TAURI_NATIVE_SWIFT_VIEW__: WKNavigationDelegate {
  public func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }

    let isBundledDocument = url.absoluteString == "about:blank" ||
      (url.scheme == assetScheme && url.host == assetHost)
    decisionHandler(isBundledDocument ? .allow : .cancel)
  }
}
