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
  sources = ["retained/*.{h,mm}", "retained/generated/**/*.{h,mm,cpp}"]
  headers = ["retained/TNReactHost.h", "retained/TNReactComposition.h"]
  s.frameworks = "WebKit"
  s.private_header_files = ["retained/TNReactRuntimeModule.h", "retained/TNReactTauriView.h", "retained/generated/**/*.h"]
  # Format 2 compiles this client once in its original application target.
  settings = { "HEADER_SEARCH_PATHS" => '$(inherited) "$(PODS_ROOT)/../Sources/TauriNativeRuntime" "$(PODS_TARGET_SRCROOT)/retained/generated/ios/TauriNativeRetainedSpec" "$(PODS_TARGET_SRCROOT)/retained/generated/ios"' }
  s.dependency "React-RCTAppDelegate", "0.86.3"
  s.dependency "React-RCTLinking", "0.86.3"
  s.dependency "ReactAppDependencyProvider"
  if ENV['TAURI_NATIVE_EXPO'] == '1'
    sources += ['retained/expo/*.{h,mm,swift}']
    headers += ['retained/expo/TNExpoApplication.h']
    s.swift_version = '6.0'
    settings['GCC_PREPROCESSOR_DEFINITIONS'] = '$(inherited) TAURI_NATIVE_EXPO=1'
    settings['HEADER_SEARCH_PATHS'] += ' "${PODS_CONFIGURATION_BUILD_DIR}/Expo/Swift Compatibility Header"'
    s.dependency 'Expo', '57.0.19'
  end
  s.source_files = sources
  s.public_header_files = headers
  s.pod_target_xcconfig = settings
  install_modules_dependencies(s)
end
