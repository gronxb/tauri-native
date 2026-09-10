require 'json'
require 'digest'

module __TAURI_NATIVE_COMPOSITION_MODULE__
  def self.composition_root(ios)
    project = File.realpath(ios)
    File.exist?(File.join(project, 'tauri-native-composition.json')) ? project : File.dirname(project)
  end

  # CocoaPods edits the user project. Check its known state before installation,
  # then record only that tool-owned change after successful integration.
  def self.composition_receipt(ios, project_changes: [])
    root = composition_root(ios)
    receipt_path = File.join(root, 'tauri-native-composition.json')
    raise 'Expected a regular retained composition receipt' unless File.file?(receipt_path) && !File.symlink?(receipt_path)
    receipt = JSON.parse(File.read(receipt_path))
    layout = root == File.realpath(ios) ? 'native-project' : nil
    unless receipt['formatVersion'] == 1 && receipt['platform'] == 'ios' && receipt['renderer'] == '__TAURI_NATIVE_RENDERER__' && receipt['layout'] == layout && receipt['files'].is_a?(Hash)
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
    prefix = before['layout'] == 'native-project' ? '' : 'ios/'
    projects = before.fetch('files').keys.grep(/\A#{prefix}[\w.-]+\.xcodeproj\/project\.pbxproj\z/)
    raise 'Expected one original retained Xcode project' unless projects.length == 1
    raise 'Retained composition receipt changed during pod install' unless composition_receipt(ios, project_changes: projects) == before
    root = composition_root(ios)
    before['files'][projects.first] = Digest::SHA256.file(File.join(root, projects.first)).hexdigest
    receipt = File.join(root, 'tauri-native-composition.json')
    temporary = receipt + '.pods-next'
    File.open(temporary, 'wx') { |file| file.write(JSON.pretty_generate(before) + "\n") }
    File.rename(temporary, receipt)
  end

end
