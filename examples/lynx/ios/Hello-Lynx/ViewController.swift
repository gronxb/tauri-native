import UIKit

class ViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()

    let safeAreaSize = self.view.safeAreaLayoutGuide.layoutFrame.size
    let lynxView = LynxView { builder in
      builder.config = LynxConfig(provider: DemoLynxProvider())
      builder.screenSize = safeAreaSize
      builder.fontScale = 1.0
    }

    lynxView.preferredLayoutWidth = safeAreaSize.width
    lynxView.preferredLayoutHeight = safeAreaSize.height
    lynxView.layoutWidthMode = .exact
    lynxView.layoutHeightMode = .exact
    lynxView.translatesAutoresizingMaskIntoConstraints = false
    self.view.addSubview(lynxView)
    NSLayoutConstraint.activate([
      lynxView.topAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.topAnchor),
      lynxView.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
      lynxView.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
      lynxView.bottomAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.bottomAnchor),
    ])

    lynxView.loadTemplate(fromURL: "main.lynx", initData: nil)
  }
}
