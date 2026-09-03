import Foundation

class DemoLynxProvider: NSObject, LynxTemplateProvider {
  func loadTemplate(withUrl url: String!, onComplete callback: LynxTemplateLoadBlock!) {
    if let filePath = Bundle.main.path(forResource: url, ofType: "bundle") {
      do {
        let data = try Data(contentsOf: URL(fileURLWithPath: filePath))
        callback(data, nil)
      } catch {
        print("Error reading file: \(error.localizedDescription)")
        callback(nil, error)
      }
    } else {
      let urlError = NSError(
        domain: "dev.tauri-native.lynx-example",
        code: 400,
        userInfo: [NSLocalizedDescriptionKey: "Missing Lynx bundle: \(url ?? "nil")"]
      )
      callback(nil, urlError)
    }
  }
}
