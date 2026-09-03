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

@objc(TNTauriWebView)
public final class TNTauriWebView: UIView {
  private let messageHandler: WeakScriptMessageHandler
  private let assetSchemeHandler: AssetSchemeHandler?
  private let webView: WKWebView

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
    webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    addSubview(webView)

    if assetSchemeHandler != nil {
      let indexURL = URL(string: "tauri-native://app/index.html")!
      webView.load(URLRequest(url: indexURL))
    } else {
      webView.loadHTMLString(
        "<h2>tauri-native assets are missing</h2>" +
          "<p>Run tauri-native build ios before pod install.</p>",
        baseURL: nil
      )
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    webView.configuration.userContentController
      .removeScriptMessageHandler(forName: bridgeName)
  }

  private static let bridgeSource = """
    (() => {
      let nextId = 1;
      const pending = new Map();
      window.__RNTauriResolve = (id, response) => {
        const callbacks = pending.get(id);
        if (!callbacks) return;
        pending.delete(id);
        callbacks.resolve(response);
      };
      window.__TAURI_NATIVE_HOST__ = 'react-native';
      globalThis.isTauri = true;
      const internals = window.__TAURI_INTERNALS__ || {};
      internals.invoke = (command, payload) => {
        return new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          window.webkit.messageHandlers.tauriNative.postMessage({
            id,
            command,
            payload
          });
        });
      };
      window.__TAURI_INTERNALS__ = internals;
    })();
    """
}

extension TNTauriWebView: WKScriptMessageHandler {
  public func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == bridgeName,
      let body = message.body as? [String: Any],
      let requestID = body["id"] as? NSNumber,
      let command = body["command"] as? String
    else {
      return
    }

    let payload = body["payload"] ?? [:]
    guard JSONSerialization.isValidJSONObject(payload),
      let payloadData = try? JSONSerialization.data(withJSONObject: payload),
      let payloadJSON = String(data: payloadData, encoding: .utf8),
      let responseJSON = TNTauriRustBridge.invoke(
        command,
        payloadJSON: payloadJSON
      ),
      let responseData = responseJSON.data(using: .utf8),
      let response = try? JSONSerialization.jsonObject(with: responseData),
      let argumentsData = try? JSONSerialization.data(
        withJSONObject: [requestID, response]
      ),
      let arguments = String(data: argumentsData, encoding: .utf8)
    else {
      return
    }

    webView.evaluateJavaScript(
      "window.__RNTauriResolve.apply(null, \(arguments));"
    )
  }
}

extension TNTauriWebView: WKNavigationDelegate {
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
