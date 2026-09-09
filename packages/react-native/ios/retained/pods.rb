require 'json'
require 'fileutils'
require 'open3'

module TauriNativeReactRetained
  def self.run(*command)
    output, error, status = Open3.capture3(*command)
    raise "Retained RN codegen failed: #{output}\n#{error}" unless status.success?
    output.strip
  end

  # Isolated SDK specs do not enter the existing format 1 package's codegen input.
  def self.prepare(react_native_path, node)
    rn = File.realpath(react_native_path)
    codegen = File.dirname(run(node, '-p', "require.resolve('@react-native/codegen/package.json', { paths: [#{rn.to_json}] })"))
    unless [rn, codegen].all? { |dir| JSON.parse(File.read(File.join(dir, 'package.json')))['version'] == '0.86.3' }
      raise 'Retained Tauri RN requires React Native and codegen 0.86.3 to match its native runtime'
    end
    generated = File.join(__dir__, 'generated')
    FileUtils.rm_rf(generated)
    FileUtils.mkdir_p(generated)
    schema = File.join(generated, 'schema.json')
    run(node, File.join(codegen, 'lib/cli/combine/combine-js-to-schema-cli.js'), '--platform', 'ios', schema, File.expand_path('../../retained/specs', __dir__))
    run(node, File.join(rn, 'scripts/generate-specs-cli.js'), '--platform', 'ios', '--schemaPath', schema, '--outputDir', File.join(generated, 'ios'), '--libraryName', 'TauriNativeRetainedSpec', '--libraryType', 'modules')
  end

  # RN's prebuilt frameworks are dynamic. Load its three static libraries
  # explicitly, preserving the ordinary Tauri archive's Swift symbol resolution.
  def self.post_install(installer, target_name)
    targets = installer.aggregate_targets.select { |target| target.user_targets.any? { |item| item.name == target_name } }
    raise "Expected one retained Tauri CocoaPods target: #{target_name}" unless targets.length == 1
    target = targets.first
    libraries = %w[ReactAppDependencyProvider ReactCodegen TauriNativeReactRetained]
    frameworks = %w[Accelerate AudioToolbox CoreGraphics ImageIO MobileCoreServices QuartzCore React ReactNativeDependencies UIKit hermesvm]
    unless ENV['RCT_USE_RN_DEP'] == '1' && ENV['RCT_USE_PREBUILT_RNCORE'] == '1'
      raise 'Retained RN linking requires the pinned prebuilt RN core and dependency frameworks'
    end
    target.xcconfigs.each do |configuration, config|
      flags = config.other_linker_flags
      unless flags[:libraries].to_a.sort == libraries.sort && flags[:frameworks].to_a.sort == frameworks.sort
        raise 'Additional static RN pods or different frameworks require retained Tauri compatibility evidence'
      end
      raise 'Expected CocoaPods -ObjC for retained RN' unless flags[:simple].delete?('-ObjC')
      libraries.each { |name| flags[:force_load].add("\"$(PODS_CONFIGURATION_BUILD_DIR)/#{name}/lib#{name}.a\"") }
      config.save_as(target.xcconfig_path(configuration))
    end
  end
end
