require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name = "TauriNativeLynx"
  s.version = package["version"]
  s.summary = package["description"]
  s.homepage = "https://github.com/gronxb/tauri-native"
  s.license = package["license"]
  s.authors = "tauri-native contributors"
  s.source = { :git => "https://github.com/gronxb/tauri-native.git", :tag => s.version.to_s }

  s.ios.deployment_target = "13.0"
  s.swift_version = "5.0"
  s.static_framework = true
  s.source_files = "src/**/*.{h,m,mm,swift}"
  s.public_header_files = "src/TNTauriLynxRustBridge.h"
  s.private_header_files = [
    "src/TauriNative.h",
    "src/TauriViewElement.h",
    "src/generated/*.h"
  ]
  s.vendored_frameworks = "Generated/TauriNativeCore.xcframework"
  s.resources = "Generated/TauriNativeAssets.bundle"
  s.frameworks = "WebKit"

  s.dependency "Lynx", ">= 4.0.0", "< 5.0.0"
end
