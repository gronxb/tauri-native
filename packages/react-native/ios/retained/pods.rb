require 'json'
require 'fileutils'
require 'open3'
require 'digest'

module TauriNativeReactRetained
  # CocoaPods edits the user project. Check its known state before installation,
  # then record only that tool-owned change after successful integration.
  def self.composition_receipt(ios, project_changes: [])
    root = File.dirname(File.realpath(ios))
    receipt_path = File.join(root, 'tauri-native-composition.json')
    raise 'Expected a regular retained composition receipt' unless File.file?(receipt_path) && !File.symlink?(receipt_path)
    receipt = JSON.parse(File.read(receipt_path))
    unless receipt['formatVersion'] == 1 && receipt['platform'] == 'ios' && receipt['renderer'] == 'react-native' && receipt['files'].is_a?(Hash)
      raise 'Expected an owned retained iOS composition'
    end
    receipt['files'].each do |file, digest|
      parts = file.split('/')
      raise 'Invalid retained composition path' if parts.any? { |part| ['', '.', '..'].include?(part) } || file.match?(/[\\:\x00]/)
      cursor = root
      parts.each do |part|
        cursor = File.join(cursor, part)
        raise "Retained composition path changed: #{file}" if File.symlink?(cursor) || !File.exist?(cursor)
      end
      unless File.file?(cursor) && (project_changes.include?(file) || Digest::SHA256.file(cursor).hexdigest == digest)
        raise "Retained composition file changed: #{file}"
      end
    end
    receipt
  end

  def self.finish_composition(ios, before)
    projects = before.fetch('files').keys.grep(%r{\Aios/[\w.-]+\.xcodeproj/project\.pbxproj\z})
    raise 'Expected one original retained Xcode project' unless projects.length == 1
    raise 'Retained composition receipt changed during pod install' unless composition_receipt(ios, project_changes: projects) == before
    root = File.dirname(File.realpath(ios))
    before['files'][projects.first] = Digest::SHA256.file(File.join(root, projects.first)).hexdigest
    receipt = File.join(root, 'tauri-native-composition.json')
    temporary = receipt + '.pods-next'
    File.open(temporary, 'wx') { |file| file.write(JSON.pretty_generate(before) + "\n") }
    File.rename(temporary, receipt)
  end

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
    frameworks = %w[Accelerate AudioToolbox CoreGraphics ImageIO MobileCoreServices QuartzCore React ReactNativeDependencies UIKit WebKit hermesvm]
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
