import Expo
import React

// Objective-C++ supplies this class's native module/component methods in TNExpoFactory.mm.
@objc(TNExpoFactoryDelegate)
public final class TNExpoFactoryDelegate: ExpoReactNativeFactoryDelegate {
  // RN resolves modules off main. This immutable reference forwards to the
  // retained Objective-C delegate, which already owns its module synchronization.
  @objc nonisolated(unsafe) public let retained: RCTDefaultReactNativeFactoryDelegate

  @objc public init(retained: RCTDefaultReactNativeFactoryDelegate) {
    self.retained = retained
    super.init()
    dependencyProvider = retained.dependencyProvider
  }

  public override func bundleURL() -> URL? { retained.bundleURL() }
}

@objc(TNExpoFactory)
public final class TNExpoFactory: NSObject {
  // RCTReactNativeFactory holds a weak delegate. Keep this adapter with its engine.
  @objc public let delegate: TNExpoFactoryDelegate
  @objc public let factory: RCTReactNativeFactory

  @objc public init(retained: RCTDefaultReactNativeFactoryDelegate) {
    delegate = TNExpoFactoryDelegate(retained: retained)
    factory = ExpoReactNativeFactory(delegate: delegate)
    super.init()
  }
}
