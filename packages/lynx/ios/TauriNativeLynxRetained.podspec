require "json"
package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name = "TauriNativeLynxRetained"
  s.version = package["version"]
  s.summary = "Lynx rendering in the original Tauri Mobile application"
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = "tauri-native contributors"
  s.source = { :git => package.dig("repository", "url").delete_prefix("git+"), :tag => "v#{s.version}" }
  s.ios.deployment_target = "14.0"
  s.static_framework = true
  s.source_files = "retained/*.{h,mm}"
  s.public_header_files = ["retained/TNLynxHost.h", "retained/TNLynxComposition.h"]
  s.frameworks = "WebKit"
  s.private_header_files = ["retained/TNLynxRuntimeModule.h", "retained/TNLynxTauriView.h"]
  # Format 2 already compiles this platform client in the original app target.
  s.pod_target_xcconfig = { "HEADER_SEARCH_PATHS" => '$(inherited) "$(PODS_ROOT)/../Sources/TauriNativeRuntime"' }
  s.dependency "Lynx/Framework", "4.0.1"
  s.dependency "PrimJS/quickjs", "4.0.0"
  s.dependency "PrimJS/napi", "4.0.0"
end
