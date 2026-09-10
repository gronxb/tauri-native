require 'shellwords'
require 'digest'

module TauriNativeReactRetained
  # Load only CocoaPods-owned static products. Global -ObjC also force-loads
  # the original Tauri archive, which contains independently linked Swift objects.
  def self.post_install_expo(installer, target, options)
    raise 'Expo retained linking was not enabled by the generated Podfile' unless ENV['TAURI_NATIVE_EXPO'] == '1'
    { 'Expo' => '57.0.19', 'ExpoModulesCore' => '57.0.15' }.each do |name, version|
      pod = target.pod_targets.find { |item| item.pod_name == name }
      raise "Retained Expo requires #{name} #{version}" unless pod && pod.root_spec.version.to_s == version
    end
    # Expo's application-long factory and ReactDelegate retain each other. Each
    # retained RN engine needs to release that factory and its native modules.
    # Compile a checked, generated copy with a weak forwarding reference; leave
    # the installed Expo source and the original Tauri project untouched.
    expo = installer.target_installation_results.pod_target_installation_results.values.find { |result| result.target.pod_name == 'Expo' }
    sources = expo.native_target.source_build_phase.files.select { |file| File.basename(file.file_ref.path) == 'ExpoReactNativeFactory.swift' }
    raise 'Expected one Expo React Native factory source' unless sources.length == 1
    source = File.read(sources.first.file_ref.real_path)
    unless Digest::SHA256.hexdigest(source) == 'fff6c0bd8c132272675db99583e1cc990dc776820e12a60dfd4809337f7f6529'
      raise 'Retained Expo factory source changed; verify its renderer teardown before composing'
    end
    source = source.sub('reactNativeFactory: self', 'reactNativeFactory: TNRetainedExpoFactoryReference(self)') + <<~SWIFT

      // Generated retained integration: the renderer owns its factory lifetime.
      private final class TNRetainedExpoFactoryReference: ExpoReactNativeFactoryProtocol {
        private weak var factory: ExpoReactNativeFactory?
        init(_ factory: ExpoReactNativeFactory) { self.factory = factory }
        func recreateRootView(withBundleURL: URL?, moduleName: String?, initialProps: [AnyHashable: Any]?, launchOptions: [AnyHashable: Any]?) -> UIView {
          guard let factory else { preconditionFailure("Retained Expo renderer is closed") }
          return factory.recreateRootView(withBundleURL: withBundleURL, moduleName: moduleName, initialProps: initialProps, launchOptions: launchOptions)
        }
      }
    SWIFT
    directory = installer.sandbox.root.join('TauriNativeExpo')
    FileUtils.mkdir_p(directory)
    generated = directory.join('ExpoReactNativeFactory.swift')
    File.write(generated, source)
    group = expo.native_target.project.main_group.find_subpath('TauriNativeExpo', true)
    sources.first.file_ref = group.new_file(generated)
    products = []
    target.pod_targets.each do |pod|
      if pod.should_build? && pod.build_as_static?
        product = "$(PODS_CONFIGURATION_BUILD_DIR)/#{pod.label}/#{pod.product_name}"
        product += "/#{pod.product_module_name}" if pod.build_as_framework?
        products << product
      end
      pod.xcframeworks.values.flatten.each do |framework|
        next unless framework.build_type.static?
        binary = framework.slices.first.path.basename.to_s
        product = "#{Pod::Target::BuildSettings.xcframework_intermediate_dir(framework)}/#{binary}"
        product += "/#{File.basename(binary, '.framework')}" if framework.build_type.framework?
        products << product
      end
      pod.file_accessors.each do |accessor|
        accessor.vendored_static_libraries.each { |file| products << "$(PODS_ROOT)/#{file.relative_path_from(installer.sandbox.root)}" }
        accessor.vendored_static_frameworks.each do |file|
          products << "$(PODS_ROOT)/#{file.relative_path_from(installer.sandbox.root)}/#{file.basename('.framework')}"
        end
      end
    end
    target.xcconfigs.each do |configuration, config|
      flags = config.other_linker_flags
      raise 'Expected CocoaPods -ObjC for retained Expo' unless flags[:simple].delete?('-ObjC')
      products.uniq.each { |product| flags[:force_load].add("\"#{product}\"") }
      config.save_as(target.xcconfig_path(configuration))
    end
    # Expo Constants' pinned shell wrapper leaves PROJECT_DIR unquoted. Use its
    # actual JS config generator with the explicit renderer root, including spaces.
    constants = target.pod_targets.find { |pod| pod.pod_name == 'EXConstants' }
    if constants
      raise 'Retained Expo requires EXConstants 57.0.17' unless constants.root_spec.version.to_s == '57.0.17'
      installed = installer.target_installation_results.pod_target_installation_results.values.find { |result| result.target == constants }
      raise 'Expected installed Expo Constants target' unless installed
      phases = installed.native_target.shell_script_build_phases.select { |phase| phase.name.include?('Generate app.config for prebuilt Constants.manifest') }
      raise 'Expected Expo Constants config generation phase' unless phases.length == 1 && phases.first.shell_script.include?('get-app-config-ios.sh')
      phases.first.shell_script = <<~SH
        set -eu
        case "$BUNDLE_FORMAT" in
          shallow) destination="$CONFIGURATION_BUILD_DIR/EXConstants.bundle" ;;
          deep) destination="$CONFIGURATION_BUILD_DIR/EXConstants.bundle/Contents/Resources" ;;
          *) echo "Unsupported Expo Constants bundle format: $BUNDLE_FORMAT" >&2; exit 1 ;;
        esac
        mkdir -p "$destination"
        #{Shellwords.escape(options.fetch(:node))} #{Shellwords.escape(File.join(options.fetch(:constants), 'scripts/getAppConfig.js'))} #{Shellwords.escape(options.fetch(:root))} "$destination"
      SH
    end
  end
end
