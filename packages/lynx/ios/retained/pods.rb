# Keep Objective-C category loading scoped to the renderer's libraries. The
# ordinary Tauri archive can contain repeated transitive Swift dependencies;
# CocoaPods' global -ObjC would load both copies instead of resolving once.
module TauriNativeLynxRetained
  def self.post_install(installer, target_name)
    targets = installer.aggregate_targets.select { |target| target.user_targets.any? { |item| item.name == target_name } }
    raise "Expected one retained Tauri CocoaPods target: #{target_name}" unless targets.length == 1
    target = targets.first
    libraries = %w[Lynx LynxBase LynxServiceAPI PrimJS TauriNativeLynxRetained]
    unless target.pod_targets.map(&:pod_name).sort == libraries.sort && target.pod_targets.all?(&:build_as_static_library?)
      raise "Retained Lynx linking currently supports only its pinned static pods; additional pods/frameworks need compatibility evidence"
    end
    target.xcconfigs.each do |configuration, config|
      flags = config.other_linker_flags
      raise "Expected CocoaPods -ObjC for retained Lynx" unless flags[:simple].delete?('-ObjC')
      libraries.each { |name| flags[:force_load].add("\"$(BUILT_PRODUCTS_DIR)/#{name}/lib#{name}.a\"") }
      config.save_as(target.xcconfig_path(configuration))
    end
  end
end
