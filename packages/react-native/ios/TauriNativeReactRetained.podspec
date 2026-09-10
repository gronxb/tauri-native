require "json"
package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name = "TauriNativeReactRetained"
  s.version = package["version"]
  s.summary = "React Native rendering in the original Tauri Mobile application"
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = "tauri-native contributors"
  s.source = { :git => package.dig("repository", "url").delete_prefix("git+"), :tag => "v#{s.version}" }
  s.ios.deployment_target = "16.4"
  s.static_framework = true
  s.source_files = ["retained/*.{h,mm}", "retained/generated/**/*.{h,mm,cpp}"]
  s.public_header_files = ["retained/TNReactHost.h", "retained/TNReactComposition.h"]
  s.frameworks = "WebKit"
  s.private_header_files = ["retained/TNReactRuntimeModule.h", "retained/generated/**/*.h"]
  # Format 2 compiles this client once in its original application target.
  s.pod_target_xcconfig = { "HEADER_SEARCH_PATHS" => '$(inherited) "$(PODS_ROOT)/../Sources/TauriNativeRuntime" "$(PODS_TARGET_SRCROOT)/retained/generated/ios/TauriNativeRetainedSpec"' }
  install_modules_dependencies(s)
  s.dependency "React-RCTAppDelegate", "0.86.3"
  s.dependency "React-RCTLinking", "0.86.3"
  s.dependency "ReactAppDependencyProvider"
end
