Pod::Spec.new do |s|
  s.name = 'RetainedExpoProbe'
  s.version = '1.0.0'
  s.summary = 'Native retained Expo lifecycle acceptance'
  s.homepage = 'https://github.com/gronxb/tauri-native'
  s.license = 'MIT'
  s.author = 'tauri-native'
  s.source = { :git => 'https://github.com/gronxb/tauri-native.git' }
  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'
  s.static_framework = true
  s.source_files = '*.swift'
  s.dependency 'ExpoModulesCore'
end
