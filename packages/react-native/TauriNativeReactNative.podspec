require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "TauriNativeReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/tauri-native/tauri-native"
  s.license      = package["license"]
  s.authors      = "tauri-native contributors"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/tauri-native/tauri-native.git", :tag => "#{s.version}" }

  s.source_files = [
    "cpp/**/*.{h,cpp}",
    "ios/**/*.{h,m,mm,swift}"
  ]
  s.private_header_files = ["cpp/**/*.h", "ios/TNTauriView.h"]
  s.public_header_files = "ios/TNTauriRustBridge.h"
  s.swift_version = "5.0"
  s.vendored_frameworks = "ios/Generated/TauriNativeCore.xcframework"
  s.resources = "ios/Generated/TauriNativeAssets.bundle"
  s.frameworks = "WebKit"

  install_modules_dependencies(s)
end
