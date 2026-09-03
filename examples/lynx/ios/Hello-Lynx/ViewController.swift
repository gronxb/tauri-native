import UIKit

class ViewController: UIViewController {
  private var lynxView: LynxView?

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()

    guard lynxView == nil else { return }

    let safeAreaSize = self.view.safeAreaLayoutGuide.layoutFrame.size
    guard safeAreaSize.width > 0, safeAreaSize.height > 0 else { return }

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
    self.lynxView = lynxView
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
