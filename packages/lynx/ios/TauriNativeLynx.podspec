require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name = "TauriNativeLynx"
  s.version = package["version"]
  s.summary = package["description"]
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = "tauri-native contributors"
  s.source = { :git => package.dig("repository", "url").delete_prefix("git+"), :tag => "v#{s.version}" }

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
  s.frameworks = "WebKit"

  s.dependency "Lynx", ">= 4.0.0", "< 5.0.0"
  s.dependency "TauriNativeGenerated"
end
