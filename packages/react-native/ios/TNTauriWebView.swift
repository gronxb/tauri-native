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
  var onError: ((URL) -> Void)?

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
      onError?(requestURL)
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
  private var documentID: String?
  private var session: UInt64 = 0
  private var suspended = false
  private var ready = false
  private var lastMessageID: String?
  private var currentNavigation: WKNavigation?
  @objc public var onState: (([String: String]) -> Void)?
  @objc public var localPath = "/index.html" {
    didSet { if oldValue != localPath && window != nil { loadFrontend() } }
  }

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
    assetSchemeHandler?.onError = { [weak self] url in
      self?.emitState("error", url: url.absoluteString, code: "asset_missing", message: "Packaged asset could not be loaded")
    }
    webView.navigationDelegate = self
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.scrollView.pinchGestureRecognizer?.isEnabled = false
    addSubview(webView)
  }

  private func loadFrontend() {
    let route = localPath.isEmpty ? "/index.html" : localPath
    guard route.hasPrefix("/"), !route.hasPrefix("//"), !route.contains("\\"),
      !route.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
      let indexURL = URL(string: "tauri-native://app" + route),
      indexURL.scheme == assetScheme, indexURL.host == assetHost,
      !indexURL.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else {
      emitState("error", url: route, code: "invalid_path", message: "Use a local packaged path starting with /")
      return
    }
    ready = false
    closeSession()
    documentID = nil
    webView.evaluateJavaScript("window.__RNTauriSuspend?.();")
    webView.stopLoading()
    if assetSchemeHandler != nil {
      currentNavigation = webView.load(URLRequest(url: indexURL))
    } else {
      emitState("error", code: "assets_missing", message: "The copied frontend bundle is missing")
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
    if session != 0 { TNTauriRustBridge.closeSession(session) }
    webView.configuration.userContentController
      .removeScriptMessageHandler(forName: bridgeName)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    suspended = window == nil
    if suspended {
      ready = false
      closeSession()
      documentID = nil
      webView.evaluateJavaScript("window.__RNTauriSuspend?.();")
    } else {
      loadFrontend()
    }
  }

  private func closeSession() {
    if session != 0 { TNTauriRustBridge.closeSession(session) }
    session = 0
  }

  private func deliver(_ function: String, _ arguments: [Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: arguments),
      let json = String(data: data, encoding: .utf8) else { return }
    webView.evaluateJavaScript("window.\(function)?.apply(null, \(json));")
  }

  private func emitState(_ type: String, url: String? = nil, code: String = "", message: String = "", event: String = "", payload: String = "null") {
    guard window != nil else { return }
    onState?(["type": type, "url": url ?? webView.url?.absoluteString ?? "", "code": code, "message": message, "event": event, "payload": payload])
  }

  @objc public func sendMessage(_ json: String) {
    if json.isEmpty { return }
    guard let data = json.data(using: .utf8),
      let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let id = message["id"] as? String, !id.isEmpty,
      let event = message["event"] as? String else {
      emitState("error", code: "invalid_message", message: "A message needs an id and event name")
      return
    }
    if id == lastMessageID { return }
    lastMessageID = id
    guard ready, let document = documentID, !suspended else {
      emitState("error", code: "not_ready", message: "Send messages after the view is ready")
      return
    }
    let arguments: [Any] = [document, event, message["payload"] ?? NSNull()]
    guard let encoded = try? JSONSerialization.data(withJSONObject: arguments),
      let argumentsJSON = String(data: encoded, encoding: .utf8) else { return }
    webView.evaluateJavaScript("window.__RNTauriHostEvent?.apply(null, \(argumentsJSON));") { [weak self] value, error in
      guard let self, self.documentID == document, !self.suspended else { return }
      if let error { self.emitState("error", code: "event_delivery_failed", message: error.localizedDescription) }
      else if (value as? String) != "" { self.emitState("error", code: "event_delivery_failed", message: value as? String ?? "Bridge unavailable") }
    }
  }

  private static let bridgeSource = """
    (() => {
      let documentId;
      let nextId = 1;
      let active = false;
      let timer;
      let polling = false;
      const pending = new Map();
      const eventCallbacks = new Map();
      const eventListeners = new Map();
      let nextCallback = 1;
      let nextListener = 1;
      let readySent = false;
      const post = (message) => window.webkit.messageHandlers.tauriNative.postMessage(JSON.parse(JSON.stringify(message)));
      const send = (message) => post({ ...message, document: documentId });
      const error = (code) => Object.assign(new Error(code), { code });
      function reportReady() {
        if (!active || readySent) return;
        readySent = true;
        send({ type: 'ready' });
      }
      window.addEventListener('load', reportReady);

      function schedule() {
        if (!active || !pending.size || timer !== undefined || polling) return;
        timer = setTimeout(() => {
          timer = undefined;
          polling = true;
          try { send({ type: 'poll' }); } catch (cause) { failAll(cause); }
        }, 16);
      }

      function finish(id, responseJson, cause) {
        const callbacks = pending.get(id);
        if (!callbacks) return;
        pending.delete(id);
        try {
          if (cause) throw cause;
          const response = JSON.parse(responseJson);
          if (response?.abiVersion === undefined) callbacks.resolve(response);
          else {
            if (![1, 2].includes(response.abiVersion) || typeof response.ok !== 'boolean' || !((response.ok ? 'value' : 'error') in response)) throw error('invalid_response');
            response.ok ? callbacks.resolve(response.value) : callbacks.reject(response.error);
          }
        } catch (cause) { callbacks.reject(cause); }
        if (!pending.size) {
          clearTimeout(timer); timer = undefined; polling = false;
          try { send({ type: 'close' }); } catch {}
        }
      }

      function failAll(cause) {
        for (const id of [...pending.keys()]) finish(id, undefined, cause);
      }

      window.__RNTauriResolve = (document, id, responseJson, failure) => {
        if (active && document === documentId) finish(id, responseJson, failure ? error(failure) : undefined);
      };
      window.__RNTauriDrain = (document, responseJson) => {
        if (!active || document !== documentId) return;
        polling = false;
        try {
          const batch = JSON.parse(responseJson);
          if (!Array.isArray(batch)) throw error(batch?.error ?? 'invalid_response');
          for (const item of batch) finish(item.id, item.response);
        } catch (cause) { failAll(cause); }
        schedule();
      };
      window.__RNTauriSuspend = () => {
        if (!active) return;
        failAll(Object.assign(error('closed_document'), { name: 'AbortError' }));
        try { send({ type: 'close' }); } catch {}
        active = false;
        eventCallbacks.clear();
        eventListeners.clear();
      };
      window.__RNTauriResume = () => {
        if (active) return;
        documentId = String(Date.now()) + ':' + String(Math.random());
        active = true;
        readySent = false;
        send({ type: 'open' });
        if (window.document?.readyState === 'complete') Promise.resolve().then(reportReady);
      };
      window.addEventListener('pagehide', window.__RNTauriSuspend);
      window.addEventListener('pageshow', window.__RNTauriResume);
      window.__RNTauriResume();
      window.__TAURI_NATIVE_HOST__ = "react-native";
      globalThis.isTauri = true;
      const internals = window.__TAURI_INTERNALS__ || {};
      internals.transformCallback = (callback, once = false) => {
        if (!active) throw error('closed_document');
        if (eventCallbacks.size >= 64) throw error('event_listener_limit');
        const id = nextCallback++;
        eventCallbacks.set(id, { callback, once });
        return id;
      };
      internals.unregisterCallback = (id) => eventCallbacks.delete(id);
      const unlisten = (event, id) => {
        const listener = eventListeners.get(id);
        if (listener?.event !== event) return;
        eventCallbacks.delete(listener.handler);
        eventListeners.delete(id);
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: unlisten };
      const validEvent = (event) => {
        if (typeof event !== 'string' || !/^[a-zA-Z0-9/:_-]*$/.test(event)) throw error('unsupported_event_name');
        if (event.startsWith('tauri://')) throw error('unsupported_system_event');
      };
      const validTarget = (target) => {
        if (target?.kind !== 'Webview' || target.label !== 'main') throw error('unsupported_event_target: only Webview main is supported');
      };
      const dispatchEvent = (event, payload) => {
        // Delivery is asynchronous, like Tauri's scheduled WebView evaluation.
        const document = documentId;
        const ids = [...eventListeners].filter(([, listener]) => listener.event === event).map(([id]) => id);
        Promise.resolve().then(() => {
          if (!active || document !== documentId) return;
          for (const id of ids) {
            const listener = eventListeners.get(id);
            const entry = listener && eventCallbacks.get(listener.handler);
            if (!entry) continue;
            if (entry.once) eventCallbacks.delete(listener.handler);
            try { entry.callback({ event, id, payload }); }
            catch (cause) { setTimeout(() => { throw cause; }, 0); }
          }
        });
      };
      window.__RNTauriHostEvent = (document, event, payload) => {
        if (!active || document !== documentId) return 'closed_document';
        try { validEvent(event); dispatchEvent(event, JSON.parse(JSON.stringify(payload ?? null))); return ''; }
        catch (cause) { return cause.message; }
      };
      function invokeEvent(command, payload) {
        try {
          if (!active) throw error('closed_document');
          validEvent(payload.event);
          if (command === 'plugin:event|unlisten') { unlisten(payload.event, payload.eventId); return null; }
          if (command !== 'plugin:event|listen' && command !== 'plugin:event|emit_to') throw error('unsupported_event_operation');
          validTarget(payload.target);
          if (command === 'plugin:event|listen') {
            if (!eventCallbacks.has(payload.handler)) throw error('invalid_event_callback');
            const id = nextListener++;
            eventListeners.set(id, { event: payload.event, handler: payload.handler });
            return id;
          }
          const value = JSON.parse(JSON.stringify(payload.payload ?? null));
          dispatchEvent(payload.event, value);
          send({ type: 'event', event: payload.event, payload: value });
          return null;
        } catch (cause) {
          if (command === 'plugin:event|listen') eventCallbacks.delete(payload.handler);
          throw cause;
        }
      }
      internals.invoke = (command, payload) => new Promise((resolve, reject) => {
        if (!active) { reject(error('closed_document')); return; }
        if (command.startsWith('plugin:event|')) {
          Promise.resolve().then(() => invokeEvent(command, payload ?? {})).then(resolve, reject);
          return;
        }
        if (command.startsWith('plugin:path|') && (command !== 'plugin:path|resolve_directory' || !payload || Object.keys(payload).length !== 1 || payload.directory !== 14)) {
          reject(error('unsupported_path_operation')); return;
        }
        const id = String(nextId++);
        pending.set(id, { resolve, reject });
        try {
          send({ type: 'invoke', id, command, payload: payload ?? {} });
          schedule();
        } catch (cause) { finish(id, undefined, cause); }
      });
      window.__TAURI_INTERNALS__ = internals;
    })();
    """
}

extension TNTauriWebView: WKScriptMessageHandler {
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
    if type == "ready" {
      if !ready { ready = true; emitState("ready") }
      return
    }
    if type == "event", let event = body["event"] as? String,
      let data = try? JSONSerialization.data(withJSONObject: body["payload"] ?? NSNull(), options: [.fragmentsAllowed]),
      let payload = String(data: data, encoding: .utf8) {
      emitState("event", event: event, payload: payload)
      return
    }
    if type == "close" {
      closeSession()
      return
    }
    if type == "poll" {
      deliver("__RNTauriDrain", [document, session == 0 ? "[]" : TNTauriRustBridge.poll(session)])
      return
    }
    guard type == "invoke", let requestID = body["id"] as? String else { return }
    guard let command = body["command"] as? String,
      let payloadData = try? JSONSerialization.data(withJSONObject: body["payload"] ?? [:], options: [.fragmentsAllowed]),
      let payloadJSON = String(data: payloadData, encoding: .utf8) else {
      deliver("__RNTauriResolve", [document, requestID, "", "invalid_argument"])
      return
    }
    if command.hasPrefix("plugin:path|") {
      guard command == "plugin:path|resolve_directory",
        let payload = body["payload"] as? [String: Any], payload.count == 1,
        let directory = payload["directory"] as? Int, directory == 14 else {
        deliver("__RNTauriResolve", [document, requestID, "", "unsupported_path_operation"])
        return
      }
      let value = TNTauriRustBridge.appDataDirectory()
      let encoded = try! JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
      deliver("__RNTauriResolve", [document, requestID, String(data: encoded, encoding: .utf8)!])
      return
    }
    if session == 0 { session = TNTauriRustBridge.createSession() }
    if session == 0 {
      // The explicit ABI 0/1 compatibility route retains its blocking behavior.
      let response = TNTauriRustBridge.invoke(command, payloadJSON: payloadJSON)
      deliver("__RNTauriResolve", [document, requestID, response ?? "", response == nil ? "invalid_response" : ""])
      return
    }
    let acknowledgement = TNTauriRustBridge.start(session, requestID: requestID, command: command, payloadJSON: payloadJSON)
    if !acknowledgement.isEmpty {
      let data = acknowledgement.data(using: .utf8)!
      let failure = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
      deliver("__RNTauriResolve", [document, requestID, "", failure?["error"] ?? "invalid_response"])
    }
  }
}

extension TNTauriWebView: WKNavigationDelegate {
  public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    currentNavigation = navigation
    ready = false
    closeSession()
    documentID = nil
    emitState("loadstart")
  }

  public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    guard navigation === currentNavigation else { return }
    ready = false
    let failure = error as NSError
    let code = failure.domain == NSURLErrorDomain && failure.code == URLError.fileDoesNotExist.rawValue ? "asset_missing" : "navigation_failed"
    emitState("error", code: code, message: error.localizedDescription)
  }

  public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    self.webView(webView, didFail: navigation, withError: error)
  }

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
    if !isBundledDocument { emitState("error", url: url.absoluteString, code: "blocked_navigation", message: "Navigation must stay inside the packaged origin") }
    decisionHandler(isBundledDocument ? .allow : .cancel)
  }
}
