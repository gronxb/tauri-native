require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "TauriNativeReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = "tauri-native contributors"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => package.dig("repository", "url").delete_prefix("git+"), :tag => "v#{s.version}" }

  s.source_files = [
    "cpp/**/*.{h,cpp}",
    "ios/**/*.{h,m,mm,swift}"
  ]
  s.private_header_files = ["cpp/**/*.h", "ios/TNTauriView.h"]
  s.public_header_files = "ios/TNTauriRustBridge.h"
  s.swift_version = "5.0"
  s.frameworks = "WebKit"

  install_modules_dependencies(s)
  s.dependency "TauriNativeGenerated"
end
