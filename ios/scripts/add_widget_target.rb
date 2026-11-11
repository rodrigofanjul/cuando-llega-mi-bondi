# frozen_string_literal: true
#
# Agrega la extensión WidgetKit y los archivos nativos al proyecto Xcode que
# genera Capacitor. Idempotente: si el target ya existe, no hace nada.
#
# Uso (macOS):  gem install xcodeproj && ruby ios/scripts/add_widget_target.rb
# Variables:    BONDI_IOS_BUNDLE_ID (default com.bondimdp.app.dev)
#               BONDI_IOS_TEAM_ID   (opcional; firma real sólo en CI con secretos)
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__) # ios/
PROJECT_PATH = File.join(ROOT, 'App', 'App.xcodeproj')
BUNDLE_ID = ENV.fetch('BONDI_IOS_BUNDLE_ID', 'com.bondimdp.app.dev')
APP_GROUP = "group.#{BUNDLE_ID}"
TEAM_ID = ENV['BONDI_IOS_TEAM_ID']
WIDGET_NAME = 'BondiWidgetExtension'
CORE_DIR = '../BondiWidgetCore/Sources/BondiWidgetCore' # relativo a ios/App
CORE_FILES = %w[ArrivalParser.swift WidgetModels.swift WidgetRows.swift].freeze

project = Xcodeproj::Project.open(PROJECT_PATH)
app = project.targets.find { |t| t.name == 'App' } or abort('No se encontró el target App')

if project.targets.any? { |t| t.name == WIDGET_NAME }
  puts "#{WIDGET_NAME} ya existe; nada que hacer."
  exit 0
end

def file_ref(group, path)
  group.files.find { |f| f.path == path } || group.new_reference(path)
end

# --- Núcleo compartido (Swift Package) compilado en ambos targets ----------
core_group = project.main_group.find_subpath('BondiWidgetCore', true)
core_group.set_source_tree('SOURCE_ROOT')
core_refs = CORE_FILES.map { |f| file_ref(core_group, "#{CORE_DIR}/#{f}") }

# --- Target App -------------------------------------------------------------
app_group = project.main_group.find_subpath('App', false) or abort('Grupo App no encontrado')
%w[BondiWidgetPlugin.swift BondiBridgeViewController.swift].each do |f|
  app.add_file_references([file_ref(app_group, f)])
end
# Manifiesto de privacidad (UserDefaults en App Group → 1C8F.1) como recurso del bundle.
app.add_resources([file_ref(app_group, 'PrivacyInfo.xcprivacy')])
app.add_file_references(core_refs)
app.add_system_framework('WidgetKit')
app.build_configurations.each do |c|
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  c.build_settings['BONDI_APP_GROUP'] = APP_GROUP
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  c.build_settings['DEVELOPMENT_TEAM'] = TEAM_ID if TEAM_ID
end

# --- Target extensión WidgetKit --------------------------------------------
widget = project.new_target(:app_extension, WIDGET_NAME, :ios, '17.0')
widget_group = project.main_group.find_subpath(WIDGET_NAME, true)
widget_group.set_source_tree('<group>')
widget_group.set_path(WIDGET_NAME)
widget.add_file_references([file_ref(widget_group, 'BondiWidget.swift')])
file_ref(widget_group, 'Info.plist')
widget.add_resources([file_ref(widget_group, 'PrivacyInfo.xcprivacy')])
file_ref(widget_group, "#{WIDGET_NAME}.entitlements")
widget.add_file_references(core_refs)
%w[WidgetKit SwiftUI AppIntents].each { |fw| widget.add_system_framework(fw) }

widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.widget"
  s['INFOPLIST_FILE'] = "#{WIDGET_NAME}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = "#{WIDGET_NAME}/#{WIDGET_NAME}.entitlements"
  s['BONDI_APP_GROUP'] = APP_GROUP
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['SKIP_INSTALL'] = 'YES'
  s['MARKETING_VERSION'] = '0.1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['DEVELOPMENT_TEAM'] = TEAM_ID if TEAM_ID
end

# --- Embebido de la extensión en la app ------------------------------------
app.add_dependency(widget)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13' # PlugIns
build_file = embed.add_file_reference(widget.product_reference, true)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "Agregado #{WIDGET_NAME} (#{BUNDLE_ID}.widget, App Group #{APP_GROUP})."
