// Generated from TypeScript by scripts/sync-host-files.ts.
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let node_fs = require("node:fs");
let node_module = require("node:module");
let node_path = require("node:path");
let node_path$1 = __toESM(node_path, 1);
node_path = __toESM(node_path);
let node_crypto = require("node:crypto");
let node_child_process = require("node:child_process");
//#region scripts/artifacts.ts
var ArtifactError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "ArtifactError";
		this.code = code;
	}
};
function readArtifacts(directory, platform) {
	try {
		return validate(directory, platform);
	} catch (error) {
		if (error instanceof ArtifactError) throw error;
		throw new ArtifactError(error.code === "ENOENT" ? "artifact_missing" : error instanceof SyntaxError ? "artifact_json" : "artifact_read", `Could not read artifacts at "${directory}": ${error instanceof Error ? error.message : String(error)}`);
	}
}
function validate(directory, platform) {
	const invalid = (code, message) => {
		throw new ArtifactError(code, `Invalid ${platform ?? ""} artifacts at "${directory}": ${message}`);
	};
	if (!(0, node_fs.lstatSync)(directory).isDirectory() || !(0, node_fs.lstatSync)(node_path$1.default.join(directory, "manifest.json")).isFile()) invalid("artifact_symlink", "the artifact root and manifest must not be links");
	const manifest = JSON.parse((0, node_fs.readFileSync)(node_path$1.default.join(directory, "manifest.json"), "utf8"));
	if (!manifest || manifest.formatVersion !== 1) invalid("artifact_format", "unsupported format");
	platform ??= manifest.platform;
	if (platform !== "ios" && platform !== "android" || manifest.platform !== platform) invalid("artifact_platform", "unsupported platform");
	if (![
		0,
		1,
		2
	].includes(manifest.abiVersion)) invalid("artifact_abi", "unsupported ABI");
	if (manifest.generator?.name !== "@tauri-native/cli" || typeof manifest.generator.version !== "string") invalid("artifact_metadata", "invalid artifact generator");
	if (!manifest.source || !Object.keys(manifest.source).length || Object.entries(manifest.source).some(([key, value]) => !/^[a-zA-Z]+Sha256$/.test(key) || !/^[a-f0-9]{64}$/.test(value))) invalid("artifact_metadata", "invalid source fingerprints");
	const generated = manifest.abiVersion !== 0;
	if (manifest.compatibility?.mode !== (generated ? "generated" : "legacy") || manifest.compatibility?.verifiedTauri !== (generated ? "2.11.5" : null) || manifest.compatibility?.verifiedApi !== (generated ? "2.11.1" : null)) invalid("artifact_api", "unsupported API compatibility");
	if (manifest.commands !== (generated ? "commands.json" : null)) invalid("artifact_metadata", "invalid command metadata");
	if (manifest.bindings != null && (!generated || manifest.bindings !== "commands.ts")) invalid("artifact_metadata", "invalid command bindings");
	const assets = platform === "ios" ? "TauriNativeAssets.bundle" : "assets/tauri-native";
	if (manifest.assets !== assets || !Array.isArray(manifest.native) || manifest.native.some((slice) => !slice || typeof slice.path !== "string")) invalid("artifact_layout", "invalid native/assets layout");
	const required = [`${assets}/index.html`, ...generated ? ["commands.json"] : []];
	if (manifest.bindings) required.push(manifest.bindings);
	const headers = [];
	if (platform === "ios") {
		if (manifest.minimumOsVersion !== "13.0") invalid("artifact_api", "invalid iOS minimum OS version");
		if (manifest.integration !== "TauriNativeGenerated.podspec" || manifest.native.length !== 2) invalid("artifact_layout", "invalid iOS layout");
		for (const [variant, architectures] of [["device", "arm64"], ["simulator", "arm64,x86_64"]]) {
			const slices = manifest.native.filter((slice) => slice.variant === variant);
			if (slices.length !== 1 || !Array.isArray(slices[0].architectures) || [...slices[0].architectures].sort().join(",") !== architectures || typeof slices[0].path !== "string" || !slices[0].path.startsWith("TauriNativeCore.xcframework/")) invalid("artifact_slice", `missing ${variant} architectures`);
			headers.push(node_path$1.default.posix.join(node_path$1.default.posix.dirname(slices[0].path), "Headers/tauri_native.h"));
		}
		required.push("TauriNativeCore.xcframework/Info.plist", "TauriNativeGenerated.podspec", ...headers);
	} else if (platform === "android") {
		if (manifest.minimumApiLevel !== 24) invalid("artifact_api", "invalid Android API level");
		if (manifest.pageSize !== 16384) invalid("artifact_alignment", "invalid Android page alignment");
		if (manifest.integration !== null || manifest.header !== (generated ? "include/tauri_native.h" : null) || manifest.native.length !== 4) invalid("artifact_layout", "invalid Android layout");
		for (const abi of [
			"arm64-v8a",
			"armeabi-v7a",
			"x86",
			"x86_64"
		]) if (manifest.native.filter((slice) => slice.abi === abi && slice.path === `jniLibs/${abi}/libtauri_native_core.so`).length !== 1) invalid("artifact_slice", `missing ${abi}`);
		if (generated) {
			headers.push("include/tauri_native.h");
			required.push(...headers);
		}
	}
	required.push(...manifest.native.map((slice) => slice.path));
	if (!Array.isArray(manifest.files)) invalid("artifact_inventory", "missing file inventory");
	const files = /* @__PURE__ */ new Map();
	for (const file of manifest.files) {
		if (!file || typeof file.path !== "string" || !file.path || file.path.includes("\\") || file.path.includes(":") || file.path.includes("\0") || file.path.split("/").some((part) => !part || part === "." || part === "..") || file.path === "manifest.json" || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) invalid("artifact_inventory", "invalid or duplicate file path/checksum");
		files.set(file.path, file);
	}
	let count = 0;
	function visit(prefix = "") {
		for (const entry of (0, node_fs.readdirSync)(node_path$1.default.join(directory, prefix), { withFileTypes: true })) {
			const relative = node_path$1.default.posix.join(prefix, entry.name);
			if (entry.isDirectory()) visit(relative);
			else {
				if (!entry.isFile()) invalid("artifact_symlink", `links are not portable: ${relative}`);
				if (relative === "manifest.json") continue;
				const file = files.get(relative);
				const bytes = (0, node_fs.readFileSync)(node_path$1.default.join(directory, relative));
				if (!file || file.size !== bytes.length || file.sha256 !== (0, node_crypto.createHash)("sha256").update(bytes).digest("hex")) invalid("artifact_checksum", `checksum mismatch or unexpected file: ${relative}`);
				count++;
			}
		}
	}
	visit();
	if (count !== files.size || required.some((file) => !files.has(file))) invalid("artifact_missing_file", "missing required file");
	if (generated) {
		const model = JSON.parse((0, node_fs.readFileSync)(node_path$1.default.join(directory, manifest.commands), "utf8"));
		if (!model || model.schemaVersion !== 1 || model.abiVersion !== manifest.abiVersion || !Array.isArray(model.commands)) invalid("artifact_metadata", "incompatible command metadata");
		for (const header of headers) if (!new RegExp(`^#define TAURI_NATIVE_ABI_VERSION ${manifest.abiVersion}\\b`, "m").test((0, node_fs.readFileSync)(node_path$1.default.join(directory, header), "utf8"))) invalid("artifact_abi", "incompatible ABI header");
	}
	return manifest;
}
//#endregion
//#region scripts/retained-artifacts.ts
const retainedAndroidAbis = {
	aarch64: "arm64-v8a",
	armv7: "armeabi-v7a",
	i686: "x86",
	x86_64: "x86_64"
};
/** Source-free consumer validation. Format 1 hosts deliberately reject this format. */
function readRetainedArtifacts(directory) {
	const fail = (code, message) => {
		throw new ArtifactError(code, `Invalid retained artifact: ${message}`);
	};
	try {
		if (!(0, node_fs.lstatSync)(directory).isDirectory() || !(0, node_fs.lstatSync)(node_path$1.default.join(directory, "manifest.json")).isFile()) fail("artifact_symlink", "root and manifest must be regular paths");
		const manifest = JSON.parse((0, node_fs.readFileSync)(node_path$1.default.join(directory, "manifest.json"), "utf8"));
		if (manifest?.formatVersion !== 2 || manifest.abiVersion !== 3) fail("artifact_format", "requires format 2 / retained ABI 3");
		if (!["android", "ios"].includes(manifest.platform)) fail("artifact_platform", "unsupported retained platform");
		if (manifest.compatibility?.mode !== "retained" || manifest.compatibility.tauri !== "2.11.5" || manifest.compatibility.tauriCli !== "2.11.4" || manifest.compatibility.wry !== "0.55.1" || manifest.compatibility.tauriRuntimeWry !== "2.11.4") fail("artifact_api", "unverified Tauri/Wry runtime version");
		if (manifest.generator?.name !== "@tauri-native/cli" || typeof manifest.generator.version !== "string" || !["debug", "release"].includes(manifest.profile)) fail("artifact_metadata", "invalid generator or build profile");
		if (manifest.bootstrap?.owner !== "tauri" || manifest.bootstrap.project !== manifest.platform) fail("artifact_bootstrap", "requires the original Tauri bootstrap");
		if (manifest.platform === "android" && (manifest.bootstrap.minimumApiLevel !== 24 || !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(manifest.bootstrap.applicationId) || manifest.bootstrap.activity !== `${manifest.bootstrap.applicationId}.MainActivity`)) fail("artifact_bootstrap", "requires the exported Tauri Activity and one Tauri bootstrap");
		if (manifest.platform === "ios" && (!/^[\w.-]+\.xcodeproj$/.test(manifest.bootstrap.xcodeProject) || !/^[\w.-]+$/.test(manifest.bootstrap.target) || !/^[\w-]+(?:\.[\w-]+)+$/.test(manifest.bootstrap.applicationId) || !/^\d+\.\d+(?:\.\d+)?$/.test(manifest.bootstrap.minimumOsVersion))) fail("artifact_bootstrap", "invalid retained iOS bootstrap");
		if (manifest.commands !== "commands.json" || manifest.callers !== "callers.json" || !manifest.source || !Object.keys(manifest.source).length || Object.values(manifest.source).some((value) => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))) fail("artifact_metadata", "invalid command, policy or input fingerprints");
		if (!manifest.plugins || Object.entries(manifest.plugins).some(([name, version]) => !["tauri-plugin-geolocation@2.3.3", "tauri-plugin-deep-link@2.4.10"].includes(`${name}@${version}`))) fail("artifact_plugin", "native plugin needs compatibility evidence");
		if (!Array.isArray(manifest.native) || !manifest.native.length) fail("artifact_slice", "missing native slices");
		if (manifest.platform === "android" && (new Set(manifest.native.map((slice) => slice.abi)).size !== manifest.native.length || manifest.native.some((slice) => !Object.values(retainedAndroidAbis).includes(slice.abi) || !new RegExp(`^android/app/src/main/jniLibs/${slice.abi}/lib[a-zA-Z0-9_]+\\.so$`).test(slice.path)))) fail("artifact_slice", "invalid Android native slices");
		if (manifest.platform === "ios" && (new Set(manifest.native.map((slice) => slice.variant)).size !== manifest.native.length || manifest.native.some((slice) => !["device", "simulator"].includes(slice.variant) || !/^ios\/TauriNativeRuntime\.xcframework\/[\w-]+\/libapp\.a$/.test(slice.path) || !Array.isArray(slice.architectures) || !slice.architectures.length || new Set(slice.architectures).size !== slice.architectures.length || slice.architectures.some((arch) => !["arm64", ...slice.variant === "simulator" ? ["x86_64"] : []].includes(arch))))) fail("artifact_slice", "invalid iOS native slices");
		if (!Array.isArray(manifest.files)) fail("artifact_inventory", "missing file inventory");
		const files = /* @__PURE__ */ new Map();
		for (const file of manifest.files) {
			if (!file || typeof file.path !== "string" || !file.path || /[\\:\0]/.test(file.path) || file.path.split("/").some((part) => !part || part === "." || part === "..") || file.path === "manifest.json" || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) fail("artifact_inventory", "invalid or duplicate file receipt");
			files.set(file.path, file);
		}
		let count = 0;
		function visit(prefix = "") {
			for (const entry of (0, node_fs.readdirSync)(node_path$1.default.join(directory, prefix), { withFileTypes: true })) {
				const relative = node_path$1.default.posix.join(prefix, entry.name);
				if (entry.isDirectory()) visit(relative);
				else {
					if (!entry.isFile()) fail("artifact_symlink", `not portable: ${relative}`);
					if (relative === "manifest.json") continue;
					const bytes = (0, node_fs.readFileSync)(node_path$1.default.join(directory, relative)), receipt = files.get(relative);
					if (!receipt || receipt.size !== bytes.length || receipt.sha256 !== (0, node_crypto.createHash)("sha256").update(bytes).digest("hex")) fail("artifact_checksum", `changed or unexpected file: ${relative}`);
					count++;
				}
			}
		}
		visit();
		const required = [
			"commands.json",
			"callers.json",
			"include/tauri_native_runtime.h",
			...manifest.native.map((slice) => slice.path)
		];
		if (manifest.platform === "android") required.push("android/settings.gradle", "android/tauri.settings.gradle", "android/gradlew", "android/app/build.gradle.kts", "android/app/src/main/AndroidManifest.xml", "android/app/src/main/java/dev/taurinative/runtime/RuntimeSession.java");
		else required.push(`ios/${manifest.bootstrap.xcodeProject}/project.pbxproj`, "ios/TauriNativeRuntime.xcframework/Info.plist", "ios/Sources/TauriNativeRuntime/TNRuntimeSession.h", "ios/Sources/TauriNativeRuntime/TNRuntimeSession.mm", "ios/Sources/TauriNativeRuntime/tauri_native_runtime.h");
		if (count !== files.size || required.some((file) => !files.has(file))) fail("artifact_missing_file", "missing native bootstrap, resources or contract");
		const commands = JSON.parse((0, node_fs.readFileSync)(node_path$1.default.join(directory, manifest.commands), "utf8"));
		if (commands?.schemaVersion !== 1 || commands.abiVersion !== 3 || !Array.isArray(commands.commands)) fail("artifact_abi", "incompatible command metadata");
		const policy = JSON.parse((0, node_fs.readFileSync)(node_path$1.default.join(directory, manifest.callers), "utf8"));
		if (policy?.version !== 1 || !policy.callers || !Object.keys(policy.callers).length) fail("artifact_policy", "missing explicit native caller delegation");
		if ((0, node_crypto.createHash)("sha256").update((0, node_fs.readFileSync)(node_path$1.default.join(directory, "callers.json"))).digest("hex") !== manifest.source.callerPolicySha256) fail("artifact_policy", "caller policy differs from compiled policy receipt");
		if (manifest.source.buildSha256 || manifest.source.buildReceiptSha256) {
			const bytes = (0, node_fs.readFileSync)(node_path$1.default.join(directory, "build.json"));
			const build = JSON.parse(bytes.toString("utf8"));
			if ((0, node_crypto.createHash)("sha256").update(bytes).digest("hex") !== manifest.source.buildReceiptSha256 || (0, node_crypto.createHash)("sha256").update(JSON.stringify(build)).digest("hex") !== manifest.source.buildSha256 || build.schemaVersion !== 1 || build.platform !== manifest.platform || build.profile !== manifest.profile || build.inputsSha256 !== manifest.source.inputsSha256 || build.callerPolicySha256 !== (0, node_crypto.createHash)("sha256").update(JSON.stringify(policy)).digest("hex")) fail("artifact_build", "build inputs differ from the compiled runtime receipt");
		}
		return manifest;
	} catch (error) {
		if (error instanceof ArtifactError) throw error;
		throw new ArtifactError("artifact_read", `Cannot read retained artifacts: ${error instanceof Error ? error.message : error}`);
	}
}
//#endregion
//#region packages/react-native/plugin/retained-expo-template.cts
function fail$1(message) {
	throw new Error(`Retained Expo prebuild: ${message}`);
}
function plist(file) {
	return JSON.parse((0, node_child_process.execFileSync)("/usr/bin/plutil", [
		"-convert",
		"json",
		"-o",
		"-",
		file
	], { encoding: "utf8" }));
}
//#endregion
//#region packages/react-native/plugin/retained-expo-config.cts
function expoTools(root) {
	const local = (0, node_module.createRequire)(node_path.default.join(root, "package.json"));
	const expo = (0, node_module.createRequire)((0, node_fs.realpathSync)(local.resolve("expo/package.json")));
	for (const [name, version] of Object.entries({
		expo: "57.0.19",
		"@expo/cli": "57.0.21",
		"@expo/config": "57.0.9",
		"@expo/config-plugins": "57.0.9",
		"@expo/prebuild-config": "57.0.15"
	})) if (JSON.parse((0, node_fs.readFileSync)(expo.resolve(`${name}/package.json`), "utf8")).version !== version) fail$1(`requires ${name} ${version}`);
	return {
		local,
		expo,
		cli: (0, node_module.createRequire)(expo.resolve("@expo/cli/package.json")),
		plugins: expo("expo/config-plugins")
	};
}
function retainedInput(root, options, platform) {
	if (options.runtime !== "retained" || typeof options.artifactsDir !== "string" || !options.artifactsDir.trim() || !options.bundleFiles || Object.keys(options).some((k) => ![
		"runtime",
		"artifactsDir",
		"bundleFiles"
	].includes(k)) || Object.keys(options.bundleFiles).some((k) => k !== "ios" && k !== "android")) fail$1("set runtime: retained, artifactsDir and per-platform bundleFiles in the config plugin");
	const bundle = options.bundleFiles[platform];
	if (typeof bundle !== "string" || !bundle.trim()) fail$1(`set bundleFiles.${platform} to an offline main AppRegistry bundle`);
	const artifact = (0, node_fs.realpathSync)(node_path.default.resolve(root, options.artifactsDir, platform));
	const manifest = readRetainedArtifacts(artifact);
	if (manifest.platform !== platform) fail$1(`requires the ${platform} retained artifact`);
	return {
		artifact,
		manifest,
		bundle: (0, node_fs.realpathSync)(node_path.default.resolve(root, bundle))
	};
}
function schemes(value) {
	if (value === void 0) return [];
	const list = typeof value === "string" ? [value] : value;
	if (!Array.isArray(list) || list.some((v) => typeof v !== "string" || !/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(v))) fail$1("URL schemes must be explicit valid scheme names");
	return list;
}
/** Defaults are read from immutable exports before Expo applies its ordinary config plugins. */
const withRetainedExpo = (config, options) => {
	if (!options?.bundleFiles || !Object.keys(options.bundleFiles).length || Object.keys(options.bundleFiles).some((k) => k !== "ios" && k !== "android")) fail$1("declare at least one ios or android bundleFiles entry for the retained config plugin");
	const root = config._internal?.projectRoot ?? process.cwd();
	const { plugins } = expoTools(root);
	if ("jsEngine" in config && config.jsEngine !== "hermes") fail$1("the retained Expo host requires Hermes");
	const selected = process.env.TAURI_NATIVE_EXPO_PLATFORM;
	for (const platform of ["ios", "android"]) {
		if (selected && selected !== platform || !options.bundleFiles?.[platform]) continue;
		const { artifact, manifest } = retainedInput(root, options, platform);
		const appId = manifest.bootstrap.applicationId;
		if (platform === "android") {
			if (config.android?.package && config.android.package !== appId) fail$1("android.package conflicts with the original Tauri application");
			if (config.android?.googleServicesFile || config.android?.versionCode !== void 0) fail$1("Google Services and versionCode require verified Kotlin Gradle integration");
			config.android = {
				...config.android,
				package: appId
			};
		} else {
			if (manifest.platform !== "ios") fail$1("requires iOS bootstrap metadata");
			if (config.ios?.bundleIdentifier && config.ios.bundleIdentifier !== appId) fail$1("ios.bundleIdentifier conflicts with the original Tauri application");
			const project = plist(node_path.default.join(artifact, "ios", manifest.bootstrap.xcodeProject, "project.pbxproj"));
			const tablet = Object.values(project.objects).some((o) => String(o.buildSettings?.TARGETED_DEVICE_FAMILY).split(",").includes("2"));
			const infoFiles = [...new Set(Object.values(project.objects).map((o) => o.buildSettings?.INFOPLIST_FILE).filter(Boolean))];
			if (infoFiles.length !== 1) fail$1("CNG requires one original Info.plist");
			const original = plist(node_path.default.join(artifact, "ios", infoFiles[0]));
			const overrides = config.ios?.infoPlist ?? {};
			if (overrides.UIApplicationSceneManifest || overrides.UIApplicationDelegateClassName || overrides.CFBundleExecutable || overrides.CFBundleIdentifier && overrides.CFBundleIdentifier !== original.CFBundleIdentifier) fail$1("Info.plist overrides conflict with the original Tauri startup/identity");
			const originalUrls = original.CFBundleURLTypes ?? [];
			const added = [...schemes(config.scheme), ...schemes(config.ios?.scheme)];
			const urls = [...originalUrls, ...overrides.CFBundleURLTypes ?? []];
			const existing = new Set(urls.flatMap((entry) => entry.CFBundleURLSchemes ?? []));
			const extra = [...new Set(added)].filter((scheme) => !existing.has(scheme));
			if (extra.length) urls.push({ CFBundleURLSchemes: extra });
			const info = {
				...original,
				...overrides,
				...urls.length ? { CFBundleURLTypes: urls } : {}
			};
			if (config.version) info.CFBundleShortVersionString = config.version;
			if (config.ios?.buildNumber) info.CFBundleVersion = config.ios.buildNumber;
			const catalog = node_path.default.join(artifact, "ios/Assets.xcassets/AppIcon.appiconset");
			const icon = JSON.parse((0, node_fs.readFileSync)(node_path.default.join(catalog, "Contents.json"), "utf8")).images.find((entry) => entry.idiom === "ios-marketing" && entry.size === "1024x1024" && entry.scale === "1x")?.filename;
			if (!config.icon && !config.ios?.icon && (typeof icon !== "string" || node_path.default.basename(icon) !== icon)) fail$1("original Tauri app needs a 1024px marketing icon for Expo defaults");
			config.ios = {
				supportsTablet: tablet,
				...config.ios,
				bundleIdentifier: appId,
				infoPlist: info,
				...!config.icon && !config.ios?.icon ? { icon: node_path.default.join(catalog, icon) } : {}
			};
		}
		config = plugins.withDangerousMod(config, [platform, (mod) => {
			const receipt = node_path.default.join(mod.modRequest.platformProjectRoot, "tauri-native-composition.json");
			let value;
			try {
				value = JSON.parse((0, node_fs.readFileSync)(receipt, "utf8"));
			} catch {
				fail$1("run tauri-native-prebuild so Expo receives the retained Tauri template");
			}
			if (value.cng !== 1 || value.renderer !== "react-native" || value.layout !== "native-project") fail$1("run tauri-native-prebuild with an owned retained Tauri template");
			return mod;
		}]);
	}
	return config;
};
//#endregion
//#region packages/react-native/plugin/app.plugin.cts
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const path = require("node:path");
const packageName = "@tauri-native/react-native";
const generatedPodName = "TauriNativeGenerated";
const generatedPodMarker = `  # Generated by ${packageName}`;
const androidAbis = [
	"arm64-v8a",
	"armeabi-v7a",
	"x86",
	"x86_64"
];
const androidCoreLibrary = "libtauri_native_core.so";
function fail(message) {
	return /* @__PURE__ */ new Error(`[${packageName}] ${message}`);
}
function projectRequire(projectRoot) {
	return createRequire(path.join(projectRoot, "package.json"));
}
function resolveArtifacts(projectRoot, options, platform) {
	if (options.artifactsDir && options.tauriDir) throw fail("Choose \"artifactsDir\" or the legacy \"tauriDir\" convenience option, not both.");
	const selected = options.artifactsDir ?? options.tauriDir;
	if (typeof selected !== "string" || selected.trim() === "") throw fail("Set \"artifactsDir\" to a host-owned directory containing the copied ios/ and android/ exports. Example: {\"artifactsDir\":\"./tauri-native\"}");
	const root = path.resolve(projectRoot, selected);
	const directory = path.join(root, ...options.artifactsDir ? [] : ["gen/tauri-native"], platform);
	try {
		readArtifacts(directory, platform);
	} catch (cause) {
		const error = cause;
		throw Object.assign(fail(`${error.message} Supply a complete, matching CLI export before prebuild.`), { code: error.code });
	}
	return directory;
}
function withArtifactCopy(source, platform, apply) {
	const stage = mkdtempSync(path.join(tmpdir(), "tauri-native-host-"));
	try {
		cpSync(source, stage, { recursive: true });
		readArtifacts(stage, platform);
		apply(stage);
	} finally {
		rmSync(stage, {
			recursive: true,
			force: true
		});
	}
}
function generatedPodfile(platformProjectRoot) {
	const podfile = path.join(platformProjectRoot, "Podfile");
	let source;
	try {
		source = readFileSync(podfile, "utf8");
	} catch {
		throw fail(`Could not read the generated iOS Podfile at "${podfile}".`);
	}
	if (source.includes(generatedPodMarker)) return {
		podfile,
		source
	};
	const target = /^target\s+['"][^'"]+['"]\s+do\s*$/m;
	if (!target.test(source)) throw fail(`Could not find an iOS target in "${podfile}".`);
	const dependency = [generatedPodMarker, `  pod '${generatedPodName}', :path => './tauri-native'`].join("\n");
	return {
		podfile,
		source: source.replace(target, (line) => `${line}\n${dependency}`)
	};
}
function copyExportedArtifacts(projectRoot, platformProjectRoot, options) {
	const exportDirectory = resolveArtifacts(projectRoot, options, "ios");
	const pod = generatedPodfile(platformProjectRoot);
	const outputDir = path.join(platformProjectRoot, "tauri-native");
	withArtifactCopy(exportDirectory, "ios", (stage) => {
		rmSync(outputDir, {
			recursive: true,
			force: true
		});
		cpSync(stage, outputDir, { recursive: true });
		writeFileSync(pod.podfile, pod.source);
	});
}
function copyAndroidArtifacts(projectRoot, platformProjectRoot, options) {
	const exportDirectory = resolveArtifacts(projectRoot, options, "android");
	const appSource = path.join(platformProjectRoot, "app/src/main");
	withArtifactCopy(exportDirectory, "android", (stage) => {
		for (const abi of androidAbis) {
			const destinationDirectory = path.join(appSource, "jniLibs", abi);
			mkdirSync(destinationDirectory, { recursive: true });
			cpSync(path.join(stage, "jniLibs", abi, androidCoreLibrary), path.join(destinationDirectory, androidCoreLibrary));
		}
		const destinationAssets = path.join(appSource, "assets/tauri-native");
		rmSync(destinationAssets, {
			recursive: true,
			force: true
		});
		cpSync(path.join(stage, "assets/tauri-native"), destinationAssets, { recursive: true });
	});
}
const withTauriNative = function withTauriNative(config, options = {}) {
	if (options.runtime === "retained") return withRetainedExpo(config, options);
	if (options.runtime !== void 0) throw fail("Unknown runtime; choose retained for ordinary Tauri Mobile exports.");
	const configProjectRoot = config?._internal?.projectRoot ?? process.cwd();
	let withDangerousMod;
	try {
		({withDangerousMod} = projectRequire(configProjectRoot)("expo/config-plugins"));
	} catch {
		throw fail(`Could not load expo/config-plugins from "${configProjectRoot}". Install Expo SDK 57 in the consuming app.`);
	}
	const withIosArtifacts = withDangerousMod(config, ["ios", (modConfig) => {
		copyExportedArtifacts(modConfig.modRequest.projectRoot, modConfig.modRequest.platformProjectRoot, options);
		return modConfig;
	}]);
	return withDangerousMod(withIosArtifacts, ["android", (modConfig) => {
		copyAndroidArtifacts(modConfig.modRequest.projectRoot, modConfig.modRequest.platformProjectRoot, options);
		return modConfig;
	}]);
};
module.exports = withTauriNative;
//#endregion
