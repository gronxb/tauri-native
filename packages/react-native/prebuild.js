// Generated from TypeScript by scripts/sync-host-files.ts.
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
let node_child_process = require("node:child_process");
let node_fs = require("node:fs");
let node_path = require("node:path");
let node_path$1 = __toESM(node_path, 1);
node_path = __toESM(node_path);
let node_stream = require("node:stream");
let node_stream_promises = require("node:stream/promises");
let node_zlib = require("node:zlib");
let node_module = require("node:module");
let node_crypto = require("node:crypto");
//#region scripts/artifacts.ts
var ArtifactError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "ArtifactError";
		this.code = code;
	}
};
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
//#region scripts/retained-composition.ts
const hash = (bytes) => (0, node_crypto.createHash)("sha256").update(bytes).digest("hex");
function read$3(root, file) {
	return (0, node_fs.readFileSync)(node_path$1.default.join(root, file), "utf8");
}
function write$3(root, file, bytes) {
	(0, node_fs.mkdirSync)(node_path$1.default.dirname(node_path$1.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path$1.default.join(root, file), bytes);
}
/** Shared output ownership for independent RN and Lynx packages; no producer mutation. */
function prepareComposition(options, platform, renderer, sdkDirectory) {
	const fail = (message) => {
		throw new Error(`Retained ${renderer === "react-native" ? "RN" : "Lynx"} composition: ${message}`);
	};
	const artifact = (0, node_fs.realpathSync)(options.artifactsDir), bundle = (0, node_fs.realpathSync)(options.bundleFile), sdk = (0, node_fs.realpathSync)(sdkDirectory);
	const requestedOutput = node_path$1.default.resolve(options.outputDir);
	const output = node_path$1.default.join((0, node_fs.realpathSync)(node_path$1.default.dirname(requestedOutput)), node_path$1.default.basename(requestedOutput));
	const overlaps = (a, b) => a === b || a.startsWith(b + node_path$1.default.sep) || b.startsWith(a + node_path$1.default.sep);
	if ([artifact, sdk].some((input) => overlaps(output, input)) || bundle === output || bundle.startsWith(output + node_path$1.default.sep)) fail("output must be separate from the artifact and SDK, and must not contain the renderer or bundle");
	const manifest = readRetainedArtifacts(artifact);
	if (manifest.platform !== platform) fail(`requires an ${platform} format 2 artifact`);
	if (options.layout !== void 0 && options.layout !== "native-project") fail("unsupported output layout");
	const layout = options.layout;
	if (layout && renderer !== "react-native") fail("native-project output requires RN composition");
	return {
		artifact,
		bundle,
		sdk,
		output,
		project: layout ? output : node_path$1.default.join(output, platform),
		layout,
		manifest,
		bundled: (0, node_fs.readFileSync)(bundle),
		renderer,
		fail
	};
}
function inventory$1(root, fail, prefix = "") {
	const result = {};
	for (const entry of (0, node_fs.readdirSync)(node_path$1.default.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const file = node_path$1.default.posix.join(prefix, entry.name);
		if (entry.isDirectory()) Object.assign(result, inventory$1(root, fail, file));
		else if (entry.isFile()) result[file] = hash((0, node_fs.readFileSync)(node_path$1.default.join(root, file)));
		else fail(`generated path must be regular: ${file}`);
	}
	return result;
}
function publishComposition(context, metadata, generate) {
	const { artifact, bundle, bundled, output, layout, manifest, renderer, fail } = context;
	const receiptPath = "tauri-native-composition.json";
	let previous;
	if ((0, node_fs.existsSync)(output)) {
		if (!(0, node_fs.lstatSync)(output).isDirectory() || !(0, node_fs.existsSync)(node_path$1.default.join(output, receiptPath)) || !(0, node_fs.lstatSync)(node_path$1.default.join(output, receiptPath)).isFile()) fail("existing output is not an owned composition directory");
		const value = JSON.parse(read$3(output, receiptPath));
		if (value.cng !== void 0) fail("Expo CNG output must be regenerated with tauri-native-prebuild");
		if (value.formatVersion !== 1 || value.renderer !== renderer || (value.platform ?? "android") !== manifest.platform || value.layout !== layout || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) fail("invalid prior composition receipt");
		previous = value;
		for (const [file, digest] of Object.entries(previous.files)) {
			if (!file || file.split("/").some((part) => !part || part === "." || part === "..") || /[\\:\0]/.test(file) || !/^[a-f0-9]{64}$/.test(digest)) fail("invalid prior composition file receipt");
			const target = node_path$1.default.join(output, file);
			let cursor = output;
			for (const part of file.split("/")) {
				cursor = node_path$1.default.join(cursor, part);
				if (!(0, node_fs.existsSync)(cursor) || (0, node_fs.lstatSync)(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${file}`);
			}
			if (!(0, node_fs.lstatSync)(target).isFile() || hash((0, node_fs.readFileSync)(target)) !== digest) fail(`generated file changed: ${file}; preserve the edit before regenerating`);
		}
	}
	const work = (0, node_fs.mkdtempSync)(node_path$1.default.join(node_path$1.default.dirname(output), renderer === "react-native" ? ".tauri-react-compose-" : ".tauri-lynx-compose-"));
	let stage = node_path$1.default.join(work, "next");
	const backup = node_path$1.default.join(work, "previous");
	let published = false;
	try {
		(0, node_fs.mkdirSync)(stage);
		(0, node_fs.cpSync)(node_path$1.default.join(artifact, manifest.platform), node_path$1.default.join(stage, manifest.platform), { recursive: true });
		generate(stage);
		if (layout) stage = node_path$1.default.join(stage, manifest.platform);
		const files = inventory$1(stage, fail);
		const receipt = JSON.stringify({
			formatVersion: 1,
			renderer,
			artifact: hash((0, node_fs.readFileSync)(node_path$1.default.join(artifact, "manifest.json"))),
			...metadata,
			...layout ? { layout } : {},
			files
		}, null, 2) + "\n";
		write$3(stage, receiptPath, receipt);
		if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !(0, node_fs.readFileSync)(bundle).equals(bundled)) fail("inputs changed during composition");
		if (previous && read$3(output, receiptPath) === receipt) return false;
		if (previous) {
			const merged = node_path$1.default.join(work, "merged");
			(0, node_fs.cpSync)(output, merged, { recursive: true });
			for (const file of Object.keys(previous.files)) (0, node_fs.rmSync)(node_path$1.default.join(merged, file));
			(0, node_fs.rmSync)(node_path$1.default.join(merged, receiptPath));
			for (const file of Object.keys(files)) {
				let cursor = merged;
				for (const part of file.split("/")) {
					cursor = node_path$1.default.join(cursor, part);
					let entry;
					try {
						entry = (0, node_fs.lstatSync)(cursor);
					} catch (error) {
						if (error.code === "ENOENT") break;
						throw error;
					}
					if (entry.isSymbolicLink() || !entry.isDirectory()) fail(`new generated file conflicts with consumer file: ${file}`);
				}
			}
			(0, node_fs.cpSync)(stage, merged, { recursive: true });
			(0, node_fs.rmSync)(stage, { recursive: true });
			(0, node_fs.renameSync)(merged, stage);
			(0, node_fs.renameSync)(output, backup);
			try {
				(0, node_fs.renameSync)(stage, output);
			} catch (error) {
				try {
					(0, node_fs.renameSync)(backup, output);
				} catch (restoreError) {
					throw new AggregateError([error, restoreError], `Composition replacement and rollback failed; previous output preserved at ${backup}`);
				}
				throw error;
			}
		} else (0, node_fs.renameSync)(stage, output);
		published = true;
		return true;
	} finally {
		if (published || !(0, node_fs.existsSync)(backup)) (0, node_fs.rmSync)(work, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
//#region scripts/retained-ios-composition.ts
/** Preserve the original Apple startup owner and native client for both renderers. */
function prepareIosProject(context, rendererMinimum) {
	function fail(message) {
		return context.fail(message);
	}
	if (process.platform !== "darwin") fail("iOS composition requires macOS Apple project tools");
	const { artifact, manifest } = context;
	if (manifest.platform !== "ios") return fail("requires an iOS format 2 artifact");
	function plist(file) {
		const result = (0, node_child_process.spawnSync)("/usr/bin/plutil", [
			"-convert",
			"json",
			"-o",
			"-",
			file
		], { encoding: "utf8" });
		if (result.status !== 0) fail(`cannot read Apple project metadata: ${file}: ${result.error ?? result.stderr}`);
		return JSON.parse(result.stdout);
	}
	function iosVersion(value) {
		if (typeof value !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) fail("iOS deployment targets must be explicit numeric versions");
		return value;
	}
	function greaterVersion(a, b) {
		const left = a.split(".").map(Number), right = b.split(".").map(Number);
		for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0) ? a : b;
		return a;
	}
	const ios = node_path$1.default.join(artifact, "ios"), bootstrap = manifest.bootstrap;
	if ([
		"Podfile",
		"Podfile.lock",
		"Pods",
		".xcode.env",
		".xcode.env.local",
		"assets/tauri-native-react",
		"assets/tauri-native-lynx"
	].some((file) => (0, node_fs.existsSync)(node_path$1.default.join(ios, file)))) fail("existing CocoaPods, Node environment or renderer assets require explicit integration");
	const projectFile = `${bootstrap.xcodeProject}/project.pbxproj`;
	const project = plist(node_path$1.default.join(ios, projectFile));
	const objects = project.objects;
	const targets = Object.values(objects).filter((item) => item.isa === "PBXNativeTarget");
	const target = targets[0];
	if (targets.length !== 1 || target?.name !== bootstrap.target || target.productType !== "com.apple.product-type.application") fail("requires one original Tauri application target");
	if (Object.values(objects).some((item) => item.isa === "PBXShellScriptBuildPhase")) fail("existing native build scripts require explicit integration");
	const rootGroup = objects[project.rootObject]?.mainGroup;
	function sourcePath(id, visited = /* @__PURE__ */ new Set()) {
		const item = objects[id];
		if (!item || visited.has(id)) fail("invalid Xcode source group graph");
		visited.add(id);
		if (id === rootGroup) return "";
		if (item.sourceTree === "SOURCE_ROOT") return item.path ?? "";
		if (item.sourceTree !== "<group>") fail("unsupported Xcode source path");
		const parents = Object.entries(objects).filter(([, parent]) => parent.children?.includes(id));
		if (parents.length !== 1) fail("ambiguous Xcode source group");
		return node_path$1.default.posix.join(sourcePath(parents[0][0], visited), item.path ?? "");
	}
	const sources = [], resources = [];
	for (const phase of target.buildPhases ?? []) {
		const item = objects[phase];
		if (!item || !["PBXSourcesBuildPhase", "PBXResourcesBuildPhase"].includes(item.isa)) continue;
		for (const file of item.files ?? []) {
			const ref = objects[file]?.fileRef;
			if (!ref) fail("invalid original Xcode build input");
			(item.isa === "PBXSourcesBuildPhase" ? sources : resources).push(sourcePath(ref));
		}
	}
	const mains = sources.filter((file) => /^Sources\/[^/]+\/main\.mm$/.test(file));
	if (mains.length !== 1 || sources.filter((file) => file === "Sources/TauriNativeRuntime/TNRuntimeSession.mm").length !== 1 || !resources.includes("assets")) fail("requires the original main, one retained session client and bundled assets folder");
	const main = mains[0];
	const originalMain = (0, node_fs.readFileSync)(node_path$1.default.join(ios, main), "utf8");
	if (originalMain.replace(/\s+/g, " ").trim() !== "#include \"bindings/bindings.h\" int main(int argc, char * argv[]) { ffi::start_app(); return 0; }") fail("custom iOS application entry point requires verified lifecycle integration");
	const configurations = objects[target.buildConfigurationList ?? ""]?.buildConfigurations;
	if (!configurations?.length) fail("missing original Xcode build configurations");
	for (const id of configurations) {
		const infoFile = (objects[id]?.buildSettings)?.INFOPLIST_FILE;
		if (typeof infoFile !== "string" || !/^[\w.-]+\/Info\.plist$/.test(infoFile)) fail("unsupported original Info.plist path");
		const info = plist(node_path$1.default.join(ios, infoFile));
		if (info.UIApplicationSceneManifest || info.UIApplicationDelegateClassName) fail("custom iOS scene/delegate ownership requires verified integration");
	}
	let minimumOsVersion = greaterVersion(iosVersion(rendererMinimum), iosVersion(bootstrap.minimumOsVersion));
	for (const item of Object.values(objects)) {
		const value = item.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET;
		if (value !== void 0) minimumOsVersion = greaterVersion(minimumOsVersion, iosVersion(value));
	}
	for (const item of Object.values(objects)) if (item.isa === "XCBuildConfiguration" && item.buildSettings) item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = minimumOsVersion;
	const encodedProject = (0, node_child_process.spawnSync)("/usr/bin/plutil", [
		"-convert",
		"xml1",
		"-o",
		"-",
		"-"
	], {
		input: JSON.stringify(project),
		encoding: "utf8"
	});
	if (encodedProject.status !== 0) fail(`cannot encode the composed Xcode project: ${encodedProject.stderr}`);
	return {
		projectFile,
		encodedProject: encodedProject.stdout,
		main,
		originalMain,
		minimumOsVersion,
		bootstrap,
		workspace: bootstrap.xcodeProject.replace(/\.xcodeproj$/, ".xcworkspace")
	};
}
//#endregion
//#region packages/react-native/plugin/retained-expo-android.cts
const quote = (s) => JSON.stringify(s).replaceAll("$", "\\$");
const groovy$1 = (s) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const read$2 = (root, file) => (0, node_fs.readFileSync)(node_path.default.join(root, file), "utf8");
function write$2(root, file, value) {
	(0, node_fs.mkdirSync)(node_path.default.dirname(node_path.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path.default.join(root, file), value);
}
function replace$1(value, from, to) {
	if (value.split(from).length !== 2) throw new Error(`Retained Expo composition: expected one ${JSON.stringify(from)}`);
	return value.replace(from, to);
}
/** Configure Expo in the generated Tauri consumer, without replacing its platform startup. */
function prepareExpoAndroid(context) {
	const { sdk, output, project, rendererDirectory: renderer, rn, codegen } = context;
	const appId = context.manifest.bootstrap.applicationId;
	if (!output.startsWith(renderer + node_path.default.sep)) throw new Error("Retained Expo composition: outputDir must be inside rendererDir so Expo Gradle scripts resolve the consuming app");
	const requireRenderer = (0, node_module.createRequire)(node_path.default.join(renderer, "package.json"));
	const expo = (0, node_fs.realpathSync)(requireRenderer.resolve("expo/package.json"));
	const requireExpo = (0, node_module.createRequire)(expo);
	const versions = {
		expo: [expo, "57.0.19"],
		"expo-modules-core": [requireExpo.resolve("expo-modules-core/package.json"), "57.0.15"],
		"expo-modules-autolinking": [requireExpo.resolve("expo-modules-autolinking/package.json"), "57.0.12"]
	};
	for (const [name, [file, version]] of Object.entries(versions)) if (JSON.parse((0, node_fs.readFileSync)(file, "utf8")).version !== version) throw new Error(`Retained Expo composition: requires ${name} ${version}`);
	const { getConfig } = requireExpo("@expo/config");
	const configuredId = getConfig(renderer, { skipPlugins: true }).exp.android?.package;
	if (configuredId && configuredId !== appId) throw new Error(`Retained Expo composition: android.package ${configuredId} conflicts with the original Tauri application ${appId}`);
	const rngp = node_path.default.dirname((0, node_module.createRequire)(node_path.default.join(rn, "package.json")).resolve("@react-native/gradle-plugin/package.json"));
	const expoGradle = node_path.default.join(node_path.default.dirname(requireExpo.resolve("expo-modules-autolinking/package.json")), "android/expo-gradle-plugin");
	const relative = (dir) => node_path.default.relative(project, dir).split(node_path.default.sep).join("/");
	return (stage) => {
		const android = node_path.default.join(stage, "android");
		const source = `app/src/main/java/${appId.replaceAll(".", "/")}/TauriNativeActivity.kt`;
		for (const file of [
			source.replace("TauriNativeActivity.kt", "TauriExpoIntegration.kt"),
			"app/src/main/jni/CMakeLists.txt",
			"app/src/main/jni/OnLoad.cpp"
		]) if ((0, node_fs.existsSync)(node_path.default.join(android, file))) throw new Error(`Retained Expo composition: artifact already owns ${file}`);
		let activity = read$2(android, source);
		activity = replace$1(activity, "open class TauriNativeActivity", "@OptIn(com.facebook.react.common.annotations.UnstableReactNativeAPI::class)\nopen class TauriNativeActivity");
		activity = replace$1(activity, "private var retired = false", "private var retired = false\n  private var expo: TauriExpoIntegration? = null");
		activity = replace$1(activity, "createReactContainer(webView),", "expo!!.createContainer(createReactContainer(webView)),");
		activity = replace$1(activity, "webView, reactPermissions)", "webView, reactPermissions, expo!!.delegate(\"tauri-native-react/index.bundle.js\"), expo!!::prepareHost, expo!!::onBackPressed)");
		activity = replace$1(activity, "reactPermissions = TauriReactPermissions(this)", "expo = TauriExpoIntegration(this)\n    reactPermissions = TauriReactPermissions(this)");
		activity = replace$1(activity, "super.onCreate(savedInstanceState)", "super.onCreate(savedInstanceState)\n    expo!!.onCreate(savedInstanceState)");
		activity = replace$1(activity, "tauriReactHost?.onResume() }", "tauriReactHost?.onResume(); expo?.onResume() }");
		activity = replace$1(activity, "override fun onPause() {", "override fun onPause() { expo?.onPause();");
		activity = replace$1(activity, "super.onNewIntent(intent);", "super.onNewIntent(intent); expo?.onNewIntent(intent);");
		activity = replace$1(activity, "retired = true;", "expo?.onDestroy()\n    retired = true;");
		activity = replace$1(activity, "  override fun onDestroy() {", `  override fun onContentChanged() { super.onContentChanged(); expo?.onContentChanged() }
  override fun onUserLeaveHint() { super.onUserLeaveHint(); expo?.onUserLeaveHint() }
  override fun onKeyDown(code: Int, event: android.view.KeyEvent?): Boolean = expo?.onKeyDown(code, event) == true || super.onKeyDown(code, event)
  override fun onKeyUp(code: Int, event: android.view.KeyEvent): Boolean = expo?.onKeyUp(code, event) == true || super.onKeyUp(code, event)
  override fun onKeyLongPress(code: Int, event: android.view.KeyEvent?): Boolean = expo?.onKeyLongPress(code, event) == true || super.onKeyLongPress(code, event)
  override fun onDestroy() {`);
		write$2(android, source, activity);
		write$2(android, source.replace("TauriNativeActivity.kt", "TauriExpoIntegration.kt"), read$2(sdk, "retained/android/TauriExpoIntegration.kt.template").replaceAll("__APPLICATION_ID__", appId));
		write$2(android, "app/src/main/AndroidManifest.xml", replace$1(read$2(android, "app/src/main/AndroidManifest.xml"), "<application", `<application android:name="${appId}.TauriNativeApplication"`));
		write$2(android, "settings.gradle", `pluginManagement {
  includeBuild(new File(settingsDir, ${groovy$1(relative(rngp))}).canonicalPath)
  includeBuild(new File(settingsDir, ${groovy$1(relative(expoGradle))}).canonicalPath)
}
plugins { id 'com.facebook.react.settings'; id 'expo-autolinking-settings' }
expoAutolinking.projectRoot = new File(settingsDir, ${groovy$1(relative(renderer))}).canonicalFile
expoAutolinking.exclude = ['@tauri-native/react-native']
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand + ['--exclude', '@tauri-native/react-native'], expoAutolinking.projectRoot,
    files(new File(expoAutolinking.projectRoot, 'package.json'), new File(expoAutolinking.projectRoot, 'pnpm-lock.yaml'), new File(expoAutolinking.projectRoot, 'package-lock.json'), new File(expoAutolinking.projectRoot, 'react-native.config.js'), new File(settingsDir, 'settings.gradle')))
}
expoAutolinking.useExpoModules()
expoAutolinking.useExpoVersionCatalog()
${read$2(android, "settings.gradle")}
includeBuild(new File(settingsDir, ${groovy$1(relative(rngp))}))
`);
		let root = read$2(android, "build.gradle.kts");
		root = replace$1(root, "com.android.tools.build:gradle:8.11.0", "com.android.tools.build:gradle:8.12.0");
		root = replace$1(root, "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20\")", "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20\")\n        classpath(\"com.facebook.react:react-native-gradle-plugin\")");
		write$2(android, "build.gradle.kts", root + `
extra["tauriNativeAutolinking"] = true
// Keep original Tauri projects' paired Java/Kotlin targets. RN 0.86 otherwise changes only their Java target to 17.
subprojects {
  if (projectDir.toPath().startsWith(rootProject.file("native-dependencies").toPath())) {
    extra["react.internal.disableJavaVersionAlignment"] = true
  }
}
apply(plugin = "expo-root-project")
apply(plugin = "com.facebook.react.rootproject")
`);
		let app = read$2(android, "app/build.gradle.kts");
		app = replace$1(app, "id(\"org.jetbrains.kotlin.android\")", "id(\"org.jetbrains.kotlin.android\")\n    id(\"com.facebook.react\")");
		app = replace$1(app, "jvmTarget = \"1.8\"", "jvmTarget = \"17\"");
		app += `
react {
  root.set(rootProject.file(${quote(relative(renderer))}))
  reactNativeDir.set(rootProject.file(${quote(relative(rn))}))
  codegenDir.set(rootProject.file(${quote(relative(codegen))}))
  nodeExecutableAndArgs.set(listOf(${quote(process.execPath)}))
  // Composition already copied the caller's offline bundle. This does not change Android debuggability.
  debuggableVariants.set(listOf("debug", "release"))
  autolinkLibrariesWithApp()
}
android {
  ndkVersion = "27.1.12297006"
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  externalNativeBuild { cmake { path = file("src/main/jni/CMakeLists.txt"); version = "3.22.1" } }
  defaultConfig { externalNativeBuild { cmake { arguments += "-DTAURI_RETAINED_CODEGEN=" + project(":tauri-native-react").layout.buildDirectory.dir("generated/retained-codegen").get().asFile.absolutePath } } }
}
tasks.matching { it.name.startsWith("configureCMake") }.configureEach { dependsOn(":tauri-native-react:generateRetainedCode") }
`;
		write$2(android, "app/build.gradle.kts", app);
		write$2(android, "gradle.properties", read$2(android, "gradle.properties") + `\nnewArchEnabled=true\nhermesEnabled=true\nreactNativeArchitectures=${context.manifest.native.map((slice) => slice.abi).join(",")}\n`);
		for (const file of ["CMakeLists.txt", "OnLoad.cpp"]) write$2(android, `app/src/main/jni/${file}`, read$2(sdk, `retained/android/autolinking/${file}`));
	};
}
//#endregion
//#region packages/react-native/plugin/retained-expo-ios.cts
const ruby$1 = (s) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
function prepareExpoIos(context) {
	const { rendererDirectory: renderer, output, project, manifest } = context;
	if (!output.startsWith(renderer + node_path.default.sep)) throw new Error("Retained Expo composition: outputDir must be inside rendererDir so Expo scripts resolve the consuming app");
	const requireRenderer = (0, node_module.createRequire)(node_path.default.join(renderer, "package.json"));
	const expo = (0, node_fs.realpathSync)(requireRenderer.resolve("expo/package.json"));
	const requireExpo = (0, node_module.createRequire)(expo);
	for (const [name, version] of Object.entries({
		expo: "57.0.19",
		"expo-modules-core": "57.0.15",
		"expo-modules-autolinking": "57.0.12",
		"expo-constants": "57.0.17"
	})) {
		const file = name === "expo" ? expo : requireExpo.resolve(`${name}/package.json`);
		if (JSON.parse((0, node_fs.readFileSync)(file, "utf8")).version !== version) throw new Error(`Retained Expo composition: requires ${name} ${version}`);
	}
	const factory = (0, node_fs.readFileSync)(node_path.default.join(node_path.default.dirname(expo), "ios/AppDelegates/ExpoReactNativeFactory.swift"));
	if ((0, node_crypto.createHash)("sha256").update(factory).digest("hex") !== "fff6c0bd8c132272675db99583e1cc990dc776820e12a60dfd4809337f7f6529") throw new Error("Retained Expo composition: factory source changed; verify its renderer teardown before composing");
	const { getConfig } = requireExpo("@expo/config");
	const id = getConfig(renderer, { skipPlugins: true }).exp.ios?.bundleIdentifier;
	if (id && id !== manifest.bootstrap.applicationId) throw new Error(`Retained Expo composition: ios.bundleIdentifier ${id} conflicts with the original Tauri application ${manifest.bootstrap.applicationId}`);
	const relative = (dir) => ruby$1(node_path.default.relative(project, dir).split(node_path.default.sep).join("/"));
	const expoRoot = node_path.default.dirname(expo);
	const constants = node_path.default.dirname(requireExpo.resolve("expo-constants/package.json"));
	return {
		setup: `ENV['TAURI_NATIVE_EXPO'] = '1'\nrequire File.expand_path(${relative(node_path.default.join(expoRoot, "scripts/autolinking.rb"))}, __dir__)\n`,
		target: `  use_expo_modules!(:appRoot => File.expand_path(${relative(renderer)}, __dir__), :projectRoot => File.expand_path(${relative(renderer)}, __dir__), :exclude => ['@tauri-native/react-native'])\n  use_native_modules!([${ruby$1(process.execPath)}, File.join(__dir__, 'tauri-native-autolinking.cjs')])\n`,
		postInstall: `, expo: { root: File.expand_path(${relative(renderer)}, __dir__), node: ${ruby$1(process.execPath)}, constants: File.expand_path(${relative(constants)}, __dir__) }`,
		autolinking: `const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, ${JSON.stringify(node_path.default.relative(project, renderer))});
const local = createRequire(path.join(root, 'package.json'));
const config = JSON.parse(execFileSync(process.execPath, [local.resolve('expo/bin/autolinking'), 'react-native-config', '--json', '--platform', 'ios', '--project-root', root, '--exclude', '@tauri-native/react-native'], { cwd: root, encoding: 'utf8' }));
// RN codegen also reads this output: explicitly disable the format 1 package.
config.dependencies['@tauri-native/react-native'] = { platforms: { ios: null, android: null } };
config.project = { ...config.project, ios: { ...config.project?.ios, sourceDir: __dirname } };
process.stdout.write(JSON.stringify(config));
`
	};
}
//#endregion
//#region packages/react-native/plugin/retained-compose.cts
const kotlin = (value) => JSON.stringify(value).replaceAll("$", "\\$");
const groovy = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
function fail$1(message) {
	throw new Error(`Retained RN composition: ${message}`);
}
function read$1(root, file) {
	return (0, node_fs.readFileSync)(node_path.default.join(root, file), "utf8");
}
function write$1(root, file, bytes) {
	(0, node_fs.mkdirSync)(node_path.default.dirname(node_path.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path.default.join(root, file), bytes);
}
function replaceOnce(value, from, to, description) {
	if (value.split(from).length !== 2) fail$1(`unsupported ${description}; expected one ${JSON.stringify(from)}`);
	return value.replace(from, to);
}
function compositionInputs(options, platform) {
	const context = prepareComposition(options, platform, "react-native", __dirname);
	const renderer = (0, node_fs.realpathSync)(options.rendererDir);
	if (renderer === context.output || renderer.startsWith(context.output + node_path.default.sep)) fail$1("output must be separate from the artifact and SDK, and must not contain the renderer or bundle");
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.moduleName)) fail$1("moduleName must be an AppRegistry identifier");
	const requireRenderer = (0, node_module.createRequire)(node_path.default.join(renderer, "package.json"));
	const rn = (0, node_fs.realpathSync)(node_path.default.dirname(requireRenderer.resolve("react-native/package.json")));
	const codegen = (0, node_fs.realpathSync)(node_path.default.dirname((0, node_module.createRequire)(node_path.default.join(rn, "package.json")).resolve("@react-native/codegen/package.json")));
	if ([rn, codegen].some((dir) => JSON.parse(read$1(dir, "package.json")).version !== "0.86.3")) fail$1("React Native and codegen must both be 0.86.3");
	return {
		...context,
		rendererDirectory: renderer,
		rn,
		codegen
	};
}
/** The output owns generated integration; the original artifact is never modified. */
function composeAndroid(options) {
	const context = compositionInputs(options, "android");
	const { artifact, sdk, manifest, rn, codegen, bundled, project } = context;
	if (manifest.platform !== "android") fail$1("requires an Android format 2 artifact");
	const android = node_path.default.join(artifact, "android");
	const appId = manifest.bootstrap.applicationId, activity = `${appId}.TauriNativeActivity`;
	const source = `app/src/main/java/${appId.replaceAll(".", "/")}/MainActivity.kt`;
	const main = read$1(android, source);
	if (main.replace(/\s+/g, " ").trim() !== `package ${appId} import android.os.Bundle import androidx.activity.enableEdgeToEdge class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }`) fail$1("custom MainActivity requires verified lifecycle integration; original source was left unchanged");
	const rootGradle = read$1(android, "build.gradle.kts");
	if (!rootGradle.includes("com.android.tools.build:gradle:8.11.0")) fail$1("requires the verified AGP 8.11.0 build");
	const updatedRoot = replaceOnce(rootGradle, "org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25", "org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20", "root Kotlin dependency");
	const appGradle = read$1(android, "app/build.gradle.kts");
	const settings = read$1(android, "settings.gradle");
	const properties = read$1(android, "gradle.properties");
	const xml = read$1(android, "app/src/main/AndroidManifest.xml");
	if (/<application\b[^>]*android:name\s*=/.test(xml) || (xml.match(/<activity\b/g) ?? []).length !== 1 || /<activity-alias\b/.test(xml)) fail$1("custom Application or multiple Activity owners require verified integration");
	if ([
		rootGradle,
		appGradle,
		settings,
		properties,
		xml
	].some((value) => /tauri-native-react|tauri-native-runtime-client|tauriNativeReact|com\.facebook\.react|expo\.modules|android\.lint\.useK2Uast/.test(value))) fail$1("existing renderer or lint configuration conflicts with retained composition");
	if ((0, node_fs.existsSync)(node_path.default.join(android, "tauri-native-runtime-client"))) fail$1("artifact already owns the generated runtime client project");
	if (!/compileSdk\s*=\s*36\b/.test(appGradle)) fail$1("requires the verified Android compile SDK 36 build");
	const nativeActivity = replaceOnce(xml, "android:name=\".MainActivity\"", `android:name="${activity}"`, "launcher Activity");
	const relative = (directory) => node_path.default.relative(project, directory).split(node_path.default.sep).join("/");
	const template = read$1(sdk, "retained/android/TauriNativeActivity.kt.template");
	const expo = options.expo ? prepareExpoAndroid({
		...context,
		manifest
	}) : void 0;
	return {
		project,
		activity,
		changed: publishComposition(context, {
			moduleName: options.moduleName,
			activity,
			...expo ? { expo: "57.0.19" } : {}
		}, (stage) => {
			write$1(stage, `android/${source}`, replaceOnce(main, "class MainActivity", "open class MainActivity", "original Activity"));
			const generated = `android/app/src/main/java/${appId.replaceAll(".", "/")}/TauriNativeActivity.kt`;
			if ((0, node_fs.existsSync)(node_path.default.join(stage, generated))) fail$1("artifact already owns TauriNativeActivity");
			write$1(stage, generated, template.replaceAll("__APPLICATION_ID__", appId).replaceAll("__MODULE__", kotlin(options.moduleName)));
			write$1(stage, "android/app/src/main/AndroidManifest.xml", nativeActivity);
			write$1(stage, "android/build.gradle.kts", updatedRoot + `\nextra["tauriNativeReactNativeDir"] = file(${kotlin(relative(rn))}).canonicalPath\nextra["tauriNativeReactCodegenDir"] = file(${kotlin(relative(codegen))}).canonicalPath\nextra["tauriNativeNode"] = ${kotlin(process.execPath)}\nextra["tauriNativeAbis"] = listOf(${manifest.native.map((slice) => kotlin(slice.abi)).join(", ")})\n`);
			write$1(stage, "android/settings.gradle", settings + `\ninclude ':tauri-native-runtime-client', ':tauri-native-react'\nproject(':tauri-native-react').projectDir = new File(settingsDir, ${groovy(relative(node_path.default.join(sdk, "android/retained")))})\n`);
			write$1(stage, "android/gradle.properties", properties + "\nandroid.lint.useK2Uast=false\n");
			write$1(stage, "android/app/build.gradle.kts", appGradle + `\nandroid { packaging { jniLibs.pickFirsts += "**/libc++_shared.so" }; defaultConfig { ndk { abiFilters += listOf(${manifest.native.map((slice) => kotlin(slice.abi)).join(", ")}) } } }\ndependencies { implementation(project(":tauri-native-react")); implementation(project(":tauri-native-runtime-client")) }\n`);
			const client = "app/src/main/java/dev/taurinative/runtime/RuntimeSession.java";
			write$1(stage, "android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java", read$1(android, client));
			(0, node_fs.rmSync)(node_path.default.join(stage, "android", client));
			write$1(stage, "android/tauri-native-runtime-client/build.gradle", "plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 36\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n");
			if ((0, node_fs.existsSync)(node_path.default.join(stage, "android/app/src/main/assets/tauri-native-react"))) fail$1("artifact already owns renderer assets");
			write$1(stage, "android/app/src/main/assets/tauri-native-react/index.bundle.js", bundled);
			expo?.(stage);
		})
	};
}
const ruby = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const shell = (value) => `'${value.replaceAll("'", "'\\''")}'`;
/** Use the original Tauri Xcode app and Apple plist tools; neither export nor build Rust. */
function composeIos(options) {
	if (process.platform !== "darwin") fail$1("iOS composition requires macOS Apple project tools");
	const context = compositionInputs(options, "ios");
	const { sdk, manifest, rn, rendererDirectory: renderer, bundled, project } = context;
	if (manifest.platform !== "ios") fail$1("requires an iOS format 2 artifact");
	const expo = options.expo ? prepareExpoIos({
		...context,
		manifest
	}) : void 0;
	const { projectFile, encodedProject, main, originalMain, minimumOsVersion, bootstrap, workspace } = prepareIosProject(context, "16.4");
	const relative = (dir) => node_path.default.relative(project, dir).split(node_path.default.sep).join("/");
	const changed = publishComposition(context, {
		moduleName: options.moduleName,
		platform: "ios",
		minimumOsVersion,
		target: bootstrap.target,
		...expo ? { expo: "57.0.19" } : {}
	}, (stage) => {
		write$1(stage, `ios/${projectFile}`, encodedProject);
		write$1(stage, `ios/${main}`, "#import <TauriNativeReactRetained/TNReactComposition.h>\n" + (expo ? "#import <TauriNativeReactRetained/TNExpoApplication.h>\n" : "") + originalMain.replace("ffi::start_app();", `@autoreleasepool {\n${expo ? "		TNInstallExpoApplication();\n" : ""}\t\tNSURL *bundle = [NSBundle.mainBundle URLForResource:@"index.bundle" withExtension:@"js" subdirectory:@"assets/tauri-native-react"];\n\t\t[TNReactComposition installWithModule:@${JSON.stringify(options.moduleName)} bundle:bundle];\n\t}\n\tffi::start_app();`));
		if (expo) {
			if ((0, node_fs.existsSync)(node_path.default.join(stage, "ios/tauri-native-autolinking.cjs"))) fail$1("artifact already owns Expo autolinking script");
			write$1(stage, "ios/tauri-native-autolinking.cjs", expo.autolinking);
		}
		write$1(stage, "ios/assets/tauri-native-react/index.bundle.js", bundled);
		write$1(stage, "ios/.xcode.env", `export NODE_BINARY=${shell(process.execPath)}\n`);
		write$1(stage, "ios/.xcode.env.local", `export NODE_BINARY=${shell(process.execPath)}\n`);
		write$1(stage, "ios/Podfile", `ENV['RCT_USE_RN_DEP'] = '1'
ENV['RCT_USE_PREBUILT_RNCORE'] = '1'
rn = File.expand_path(${ruby(relative(rn))}, __dir__)
require_relative ${ruby(relative(node_path.default.join(sdk, "ios/retained/pods")))}
composition = TauriNativeReactRetained.composition_receipt(__dir__)
require File.join(rn, 'scripts/react_native_pods')
${expo?.setup ?? ""}\
platform :ios, ${ruby(minimumOsVersion)}
prepare_react_native_project!
TauriNativeReactRetained.prepare(rn, ${ruby(process.execPath)})
project ${ruby(bootstrap.xcodeProject)}, 'debug' => :debug, 'release' => :release
target ${ruby(bootstrap.target)} do
${expo?.target ?? ""}\
  use_react_native!(:path => rn, :app_path => File.expand_path(${ruby(relative(renderer))}, __dir__))
  pod 'TauriNativeReactRetained', :path => ${ruby(relative(node_path.default.join(sdk, "ios")))}
end
post_install do |installer|
  react_native_post_install(installer, rn, :mac_catalyst_enabled => false)
  TauriNativeReactRetained.post_install(installer, ${ruby(bootstrap.target)}${expo?.postInstall ?? ""})
end
post_integrate do |installer|
  TauriNativeReactRetained.finish_composition(__dir__, composition)
end
`);
	});
	return {
		project,
		target: bootstrap.target,
		workspace,
		minimumOsVersion,
		changed
	};
}
//#endregion
//#region packages/react-native/plugin/retained-expo-template.cts
const digest = (bytes) => (0, node_crypto.createHash)("sha256").update(bytes).digest("hex");
function fail(message) {
	throw new Error(`Retained Expo prebuild: ${message}`);
}
const read = (root, file) => (0, node_fs.readFileSync)(node_path.default.join(root, file), "utf8");
function write(root, file, bytes) {
	(0, node_fs.mkdirSync)(node_path.default.dirname(node_path.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path.default.join(root, file), bytes);
}
function replace(source, from, to) {
	if (source.split(from).length !== 2) fail(`unsupported template; expected one ${JSON.stringify(from)}`);
	return source.replace(from, to);
}
function inventory(root, prefix = "") {
	return Object.fromEntries((0, node_fs.readdirSync)(node_path.default.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
		const file = node_path.default.posix.join(prefix, entry.name);
		if (entry.isDirectory()) return Object.entries(inventory(root, file));
		if (!entry.isFile()) fail(`generated path must be regular: ${file}`);
		return [[file, digest((0, node_fs.readFileSync)(node_path.default.join(root, file)))]];
	}));
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
function writePlist(root, file, value) {
	write(root, file, (0, node_child_process.execFileSync)("/usr/bin/plutil", [
		"-convert",
		"xml1",
		"-o",
		"-",
		"-"
	], { input: JSON.stringify(value) }));
}
/** Adapt generated copies for Expo's public custom-template entry. Tauri still starts the app. */
function prepareAndroidTemplate(project, appId) {
	const source = `app/src/main/java/${appId.replaceAll(".", "/")}`;
	for (const name of ["TauriMainActivity.kt", "MainApplication.kt"]) if ((0, node_fs.existsSync)(node_path.default.join(project, source, name))) fail(`artifact already owns ${name}`);
	const original = read(project, `${source}/MainActivity.kt`);
	write(project, `${source}/TauriMainActivity.kt`, replace(original, "class MainActivity", "class TauriMainActivity"));
	write(project, `${source}/MainActivity.kt`, replace(replace(read(project, `${source}/TauriNativeActivity.kt`), "class TauriNativeActivity", "class MainActivity"), ": MainActivity()", ": TauriMainActivity()").replaceAll("this@TauriNativeActivity", "this@MainActivity"));
	(0, node_fs.rmSync)(node_path.default.join(project, source, "TauriNativeActivity.kt"));
	const integration = read(project, `${source}/TauriExpoIntegration.kt`);
	write(project, `${source}/MainApplication.kt`, integration.replaceAll("TauriNativeApplication", "MainApplication").replaceAll("TauriNativeActivity", "MainActivity"));
	(0, node_fs.rmSync)(node_path.default.join(project, source, "TauriExpoIntegration.kt"));
	const manifest = "app/src/main/AndroidManifest.xml";
	write(project, manifest, replace(replace(read(project, manifest), `android:name="${appId}.TauriNativeApplication"`, "android:name=\".MainApplication\""), `android:name="${appId}.TauriNativeActivity"`, "android:name=\".MainActivity\""));
	return { activity: `${appId}.MainActivity` };
}
function prepareIosTemplate(project, xcodeProject) {
	const file = `${xcodeProject}/project.pbxproj`, value = plist(node_path.default.join(project, file));
	const objects = value.objects;
	const infos = new Set(Object.values(objects).map((o) => o.buildSettings?.INFOPLIST_FILE).filter(Boolean));
	if (infos.size !== 1) fail("CNG requires one original Info.plist");
	const infoFile = [...infos][0], folder = node_path.default.posix.dirname(infoFile);
	const main = Object.values(objects).filter((o) => o.isa === "PBXFileReference" && (o.path === "main.mm" || /^Sources\/[^/]+\/main\.mm$/.test(o.path ?? "")));
	const sources = (0, node_fs.readdirSync)(node_path.default.join(project, "Sources")).filter((name) => (0, node_fs.existsSync)(node_path.default.join(project, "Sources", name, "main.mm")));
	if (main.length !== 1 || sources.length !== 1) fail("CNG requires one generated Tauri executable entry");
	const oldMain = `Sources/${sources[0]}/main.mm`, newMain = `${folder}/AppDelegate.mm`;
	if ((0, node_fs.existsSync)(node_path.default.join(project, newMain))) fail("artifact already owns the Expo startup discovery path");
	write(project, newMain, replace(read(project, oldMain), "#include \"bindings/bindings.h\"", `#include "../Sources/${sources[0]}/bindings/bindings.h"`));
	(0, node_fs.rmSync)(node_path.default.join(project, oldMain));
	Object.assign(main[0], {
		path: newMain,
		sourceTree: "SOURCE_ROOT"
	});
	const catalogs = Object.values(objects).filter((o) => o.isa === "PBXFileReference" && o.path === "Assets.xcassets");
	if (catalogs.length !== 1 || (0, node_fs.existsSync)(node_path.default.join(project, folder, "Images.xcassets"))) fail("CNG requires the original Assets.xcassets catalog");
	(0, node_fs.renameSync)(node_path.default.join(project, "Assets.xcassets"), node_path.default.join(project, folder, "Images.xcassets"));
	Object.assign(catalogs[0], {
		path: `${folder}/Images.xcassets`,
		sourceTree: "SOURCE_ROOT"
	});
	const expoPlist = `${folder}/Supporting/Expo.plist`;
	if ((0, node_fs.existsSync)(node_path.default.join(project, expoPlist))) fail("artifact already owns Expo.plist");
	writePlist(project, expoPlist, {});
	const ref = digest("tauri-native/expo-template/Expo.plist/reference").slice(0, 24).toUpperCase();
	const build = digest("tauri-native/expo-template/Expo.plist/build").slice(0, 24).toUpperCase();
	if (objects[ref] || objects[build]) fail("Expo resource identifier conflicts with the original Xcode project");
	objects[ref] = {
		isa: "PBXFileReference",
		path: expoPlist,
		sourceTree: "SOURCE_ROOT",
		lastKnownFileType: "text.plist.xml"
	};
	objects[build] = {
		isa: "PBXBuildFile",
		fileRef: ref
	};
	objects[objects[value.rootObject].mainGroup].children.push(ref);
	const resources = Object.values(objects).find((o) => o.isa === "PBXNativeTarget")?.buildPhases.map((id) => objects[id]).filter((o) => o.isa === "PBXResourcesBuildPhase");
	if (resources?.length !== 1) fail("CNG requires one original resources phase");
	resources[0].files.push(build);
	for (const o of Object.values(objects)) {
		if (o.isa === "XCBuildConfiguration") o.name = {
			debug: "Debug",
			release: "Release"
		}[o.name] ?? o.name;
		if (o.isa === "XCConfigurationList" && o.defaultConfigurationName) o.defaultConfigurationName = {
			debug: "Debug",
			release: "Release"
		}[o.defaultConfigurationName] ?? o.defaultConfigurationName;
	}
	writePlist(project, file, value);
	(0, node_child_process.execFileSync)("ruby", [
		"-rxcodeproj",
		"-e",
		"Xcodeproj::Project.open(ARGV[0]).save",
		node_path.default.join(project, xcodeProject)
	], { stdio: "pipe" });
	const schemes = `${xcodeProject}/xcshareddata/xcschemes`;
	for (const scheme of (0, node_fs.readdirSync)(node_path.default.join(project, schemes))) if (scheme.endsWith(".xcscheme")) {
		const f = `${schemes}/${scheme}`;
		write(project, f, read(project, f).replaceAll("\"debug\"", "\"Debug\"").replaceAll("\"release\"", "\"Release\""));
	}
	write(project, "Podfile", replace(read(project, "Podfile"), "'debug' => :debug, 'release' => :release", "'Debug' => :debug, 'Release' => :release"));
	write(project, ".gitignore", "Pods/\nbuild/\n");
	return {
		infoFile,
		main: newMain,
		expoPlist,
		iconCatalog: `${folder}/Images.xcassets`
	};
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
	})) if (JSON.parse((0, node_fs.readFileSync)(expo.resolve(`${name}/package.json`), "utf8")).version !== version) fail(`requires ${name} ${version}`);
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
	].includes(k)) || Object.keys(options.bundleFiles).some((k) => k !== "ios" && k !== "android")) fail("set runtime: retained, artifactsDir and per-platform bundleFiles in the config plugin");
	const bundle = options.bundleFiles[platform];
	if (typeof bundle !== "string" || !bundle.trim()) fail(`set bundleFiles.${platform} to an offline main AppRegistry bundle`);
	const artifact = (0, node_fs.realpathSync)(node_path.default.resolve(root, options.artifactsDir, platform));
	const manifest = readRetainedArtifacts(artifact);
	if (manifest.platform !== platform) fail(`requires the ${platform} retained artifact`);
	return {
		artifact,
		manifest,
		bundle: (0, node_fs.realpathSync)(node_path.default.resolve(root, bundle))
	};
}
//#endregion
//#region packages/react-native/plugin/retained-prebuild.cts
const receiptFile = "tauri-native-composition.json";
function previousReceipt(project, platform) {
	if (!(0, node_fs.existsSync)(project)) return;
	if ((0, node_fs.lstatSync)(project).isSymbolicLink() || !(0, node_fs.lstatSync)(project).isDirectory()) fail("native output must be an owned regular directory");
	const file = node_path.default.join(project, receiptFile);
	if (!(0, node_fs.existsSync)(file) || !(0, node_fs.lstatSync)(file).isFile() || (0, node_fs.lstatSync)(file).isSymbolicLink()) fail("native directory has no owned retained composition receipt");
	const r = JSON.parse((0, node_fs.readFileSync)(file, "utf8"));
	if (r.formatVersion !== 1 || r.renderer !== "react-native" || (r.platform ?? "android") !== platform || r.layout !== "native-project" || !r.files || typeof r.files !== "object" || Array.isArray(r.files)) fail("invalid prior composition receipt");
	for (const [name, hash] of Object.entries(r.files)) {
		if (!name || name.split("/").some((part) => !part || part === "." || part === "..") || /[\\:\0]/.test(name) || !/^[a-f0-9]{64}$/.test(hash)) fail("invalid prior file receipt");
		let cursor = project;
		for (const part of name.split("/")) {
			cursor = node_path.default.join(cursor, part);
			if (!(0, node_fs.existsSync)(cursor) || (0, node_fs.lstatSync)(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${name}`);
		}
		if (!(0, node_fs.lstatSync)(cursor).isFile() || digest((0, node_fs.readFileSync)(cursor)) !== hash) fail(`generated file changed: ${name}; preserve the edit before regenerating`);
	}
	return r;
}
function contains(original, actual) {
	if (Array.isArray(original)) return Array.isArray(actual) && original.every((v) => actual.some((candidate) => contains(v, candidate)));
	if (original && typeof original === "object") return actual && typeof actual === "object" && Object.entries(original).every(([k, v]) => contains(v, actual[k]));
	return original === actual;
}
function preserve(original, actual, description) {
	if (!contains(original, actual)) fail(`config plugin removed or changed ${description}`);
}
async function validateNative(template, project, platform, tools) {
	for (const [file, hash] of Object.entries(inventory(template))) {
		if (file === receiptFile) continue;
		if (!(platform === "android" ? file === "app/src/main/AndroidManifest.xml" || file === "gradle.properties" || file.startsWith("app/src/main/res/") : !file.includes(".xcframework/") && (/^[^/]+\/(?:Info\.plist|[^/]+\.entitlements|Supporting\/Expo\.plist)$/.test(file) || /^[^/]+\.xcodeproj\/project\.pbxproj$/.test(file) || file.includes("/Images.xcassets/"))) && (!(0, node_fs.existsSync)(node_path.default.join(project, file)) || digest((0, node_fs.readFileSync)(node_path.default.join(project, file))) !== hash)) fail(`config plugin changed retained native owner/input: ${file}`);
	}
	if (platform === "android") {
		const properties = (root) => Object.fromEntries(read(root, "gradle.properties").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
			const at = line.indexOf("=");
			if (at < 1) fail("unsupported Gradle property syntax");
			return [line.slice(0, at), line.slice(at + 1)];
		}));
		const originalProperties = properties(template), generatedProperties = properties(project);
		preserve(originalProperties, generatedProperties, "original Gradle properties");
		for (const [key, value] of Object.entries(generatedProperties)) if (!(key in originalProperties) && !(key === "expo.inlineModules.watchedDirectories" && value === "[]")) fail(`Gradle property ${key} requires verified retained integration`);
		const manifest = "app/src/main/AndroidManifest.xml";
		const before = (await tools.plugins.AndroidConfig.Manifest.readAndroidManifestAsync(node_path.default.join(template, manifest))).manifest;
		const after = (await tools.plugins.AndroidConfig.Manifest.readAndroidManifestAsync(node_path.default.join(project, manifest))).manifest;
		preserve(before["uses-permission"] ?? [], after["uses-permission"] ?? [], "original Android permissions");
		preserve(before.$, after.$, "original Android manifest identity");
		const oldApp = before.application[0], app = after.application[0];
		preserve({ "android:name": oldApp.$["android:name"] }, app.$, "Tauri Application");
		preserve(oldApp.provider ?? [], app.provider ?? [], "original Android providers");
		preserve(oldApp["meta-data"] ?? [], app["meta-data"] ?? [], "original Android metadata");
		const oldActivity = oldApp.activity[0], activity = app.activity?.find((a) => a.$["android:name"] === ".MainActivity");
		if (!activity) fail("config plugin replaced the retained launcher Activity");
		for (const key of [
			"android:name",
			"android:launchMode",
			"android:exported",
			"android:configChanges"
		]) preserve(oldActivity.$[key], activity.$[key], `original Activity ${key}`);
		preserve(oldActivity["intent-filter"] ?? [], activity["intent-filter"] ?? [], "original Android intent registrations");
	} else {
		const file = (0, node_fs.readdirSync)(template).filter((f) => f.endsWith(".xcodeproj"));
		if (file.length !== 1) fail("expected one Tauri Xcode project");
		const before = plist(node_path.default.join(template, file[0], "project.pbxproj"));
		const after = plist(node_path.default.join(project, file[0], "project.pbxproj"));
		preserve(before.rootObject, after.rootObject, "original Xcode project");
		for (const [id, source] of Object.entries(before.objects)) {
			const expected = structuredClone(source);
			if (expected.isa === "XCBuildConfiguration") {
				for (const field of [
					"PRODUCT_NAME",
					"TARGETED_DEVICE_FAMILY",
					"DEVELOPMENT_TEAM",
					"CURRENT_PROJECT_VERSION",
					"MARKETING_VERSION"
				]) delete expected.buildSettings?.[field];
				if (source.buildSettings?.CODE_SIGN_ENTITLEMENTS) {
					const name = source.buildSettings.CODE_SIGN_ENTITLEMENTS;
					preserve(plist(node_path.default.join(template, name)), plist(node_path.default.join(project, name)), "original entitlements");
				}
				if (source.buildSettings?.INFOPLIST_FILE) {
					const name = source.buildSettings.INFOPLIST_FILE, original = plist(node_path.default.join(template, name)), info = plist(node_path.default.join(project, name));
					if (info.UIApplicationSceneManifest || info.UIApplicationDelegateClassName) fail("config plugin replaced Tauri delegate/scene ownership");
					for (const key of [
						"CFBundleIdentifier",
						"CFBundleExecutable",
						"CFBundleURLTypes",
						"UIRequiredDeviceCapabilities",
						"UIBackgroundModes"
					]) if (original[key] !== void 0) preserve(original[key], info[key], `original ${key}`);
					for (const [key, value] of Object.entries(original)) if (/^NS.*UsageDescription$/.test(key) && value && !info[key]) fail(`config plugin removed original permission purpose ${key}`);
				}
			}
			preserve(expected, after.objects[id], `original Xcode object ${id}`);
		}
		const properties = node_path.default.join(project, "Podfile.properties.json");
		if ((0, node_fs.existsSync)(properties)) {
			const values = JSON.parse((0, node_fs.readFileSync)(properties, "utf8"));
			for (const [key, value] of Object.entries(values)) {
				if (key === "expo.jsEngine" && value === "hermes" || key === "EX_DEV_CLIENT_NETWORK_INSPECTOR" || key === "expo.inlineModules.watchedDirectories" && value === "[]") continue;
				if (key === "expo.inlineModules.xcodeProjectTargets" && typeof value === "string") {
					const inline = JSON.parse(value);
					if (Array.isArray(inline.targets) && inline.targets.length === 0) continue;
				}
				fail(`Podfile property ${key} requires verified retained CocoaPods integration`);
			}
		}
	}
}
async function packTemplate(directory, archive, tools) {
	const tar = tools.cli("multitars");
	if (tools.cli("multitars/package.json").version !== "1.0.2") fail("requires the verified Expo multitars 1.0.2 template codec");
	const files = inventory(directory);
	async function* entries() {
		for (const file of Object.keys(files)) {
			const full = node_path.default.join(directory, file), stat = (0, node_fs.lstatSync)(full);
			const entry = tar.TarFile.from(node_stream.Readable.toWeb((0, node_fs.createReadStream)(full)), `package/${file}`, {
				size: stat.size,
				lastModified: 0
			});
			entry.mode = stat.mode & 511;
			yield entry;
		}
	}
	await (0, node_stream_promises.pipeline)(node_stream.Readable.from(tar.tar(entries())), (0, node_zlib.createGzip)(), (0, node_fs.createWriteStream)(archive));
	const actual = {};
	for await (const entry of tar.untar((0, node_fs.createReadStream)(archive).pipe((0, node_zlib.createGunzip)()))) {
		if (entry.typeflag !== tar.TarTypeFlag.FILE || !entry.name.startsWith("package/")) fail("template archive contains an unexpected entry");
		const file = entry.name.slice(8);
		if (actual[file]) fail(`duplicate template entry: ${file}`);
		actual[file] = digest(Buffer.from(await entry.arrayBuffer()));
	}
	if (JSON.stringify(files) !== JSON.stringify(actual)) fail("template archive did not preserve every generated file");
}
/** Run Expo's actual custom-template prebuild with immutable retained artifacts and rollback. */
async function prebuildRetainedExpo(options) {
	const root = (0, node_fs.realpathSync)(options.projectRoot ?? process.cwd()), platform = options.platform;
	if (platform !== "ios" && platform !== "android") fail("choose platform ios or android");
	const tools = expoTools(root);
	const selected = process.env.TAURI_NATIVE_EXPO_PLATFORM;
	let config;
	try {
		process.env.TAURI_NATIVE_EXPO_PLATFORM = platform;
		config = tools.expo("@expo/config").getConfig(root).exp;
	} finally {
		if (selected === void 0) delete process.env.TAURI_NATIVE_EXPO_PLATFORM;
		else process.env.TAURI_NATIVE_EXPO_PLATFORM = selected;
	}
	const names = [
		"@tauri-native/react-native",
		"@tauri-native/react-native/app.plugin",
		"@tauri-native/react-native/app.plugin.js"
	];
	const entries = (config.plugins ?? []).filter((entry) => names.includes(Array.isArray(entry) ? entry[0] : entry));
	if (entries.length !== 1 || entries[0] !== config.plugins[0] || !Array.isArray(entries[0])) fail("declare the retained @tauri-native/react-native config plugin first, exactly once");
	const input = retainedInput(root, entries[0][1], platform);
	const project = node_path.default.join(root, platform), previous = previousReceipt(project, platform);
	for (const file of [input.artifact, input.bundle]) if (file === project || file.startsWith(project + node_path.default.sep)) fail("artifact and bundle must remain outside the native output");
	const lock = node_path.default.join(root, ".tauri-native-prebuild.lock");
	try {
		(0, node_fs.mkdirSync)(lock);
	} catch (error) {
		if (error.code === "EEXIST") fail("another retained prebuild owns .tauri-native-prebuild.lock");
		throw error;
	}
	let work;
	try {
		work = (0, node_fs.mkdtempSync)(node_path.default.join(root, ".tauri-native-prebuild-"));
	} catch (error) {
		(0, node_fs.rmSync)(lock, { recursive: true });
		throw error;
	}
	const backup = node_path.default.join(work, "previous"), template = node_path.default.join(work, "template");
	const rootFiles = new Map((0, node_fs.readdirSync)(root, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => [e.name, (0, node_fs.readFileSync)(node_path.default.join(root, e.name))]));
	let committed = false, moved = false, generated = false, ranExpo = false;
	try {
		write(lock, "owner.json", JSON.stringify({
			pid: process.pid,
			platform
		}));
		if (previous) {
			previousReceipt(project, platform);
			(0, node_fs.renameSync)(project, backup);
			moved = true;
		}
		const composition = {
			artifactsDir: input.artifact,
			outputDir: project,
			layout: "native-project",
			rendererDir: root,
			moduleName: "main",
			bundleFile: input.bundle,
			expo: true
		};
		const result = platform === "android" ? composeAndroid(composition) : composeIos(composition);
		generated = true;
		const metadata = platform === "android" ? prepareAndroidTemplate(project, input.manifest.bootstrap.applicationId) : prepareIosTemplate(project, input.manifest.bootstrap.xcodeProject);
		const receipt = JSON.parse(read(project, receiptFile));
		Object.assign(receipt, metadata, { cng: 1 });
		receipt.files = inventory(project);
		delete receipt.files[receiptFile];
		write(project, receiptFile, JSON.stringify(receipt, null, 2) + "\n");
		(0, node_fs.cpSync)(project, node_path.default.join(template, platform), { recursive: true });
		write(template, "package.json", JSON.stringify({
			name: "tauri-native-expo-template",
			version: "1.0.0",
			private: true,
			dependencies: JSON.parse(read(root, "package.json")).dependencies ?? {}
		}));
		const archive = node_path.default.join(work, "template.tgz");
		await packTemplate(template, archive, tools);
		ranExpo = true;
		const log = (0, node_child_process.execFileSync)(process.execPath, [
			tools.local.resolve("expo/bin/cli"),
			"prebuild",
			"--clean",
			"--no-install",
			"--platform",
			platform,
			"--template",
			archive,
			"--skip-dependency-update",
			"react-native,react"
		], {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 33554432,
			env: {
				...process.env,
				CI: "1",
				EXPO_NO_GIT_STATUS: "1",
				TAURI_NATIVE_EXPO_PLATFORM: platform
			}
		});
		await validateNative(node_path.default.join(template, platform), project, platform, tools);
		const current = retainedInput(root, entries[0][1], platform);
		if (JSON.stringify(current.manifest) !== JSON.stringify(input.manifest) || digest((0, node_fs.readFileSync)(input.bundle)) !== receipt.files[platform === "ios" ? "assets/tauri-native-react/index.bundle.js" : "app/src/main/assets/tauri-native-react/index.bundle.js"]) fail("artifact or bundle changed during prebuild");
		const files = inventory(project);
		delete files[receiptFile];
		receipt.files = files;
		write(project, receiptFile, JSON.stringify(receipt, null, 2) + "\n");
		if (moved) {
			const restore = (prefix = "") => {
				for (const entry of (0, node_fs.readdirSync)(node_path.default.join(backup, prefix), { withFileTypes: true })) {
					const file = node_path.default.posix.join(prefix, entry.name);
					if (file === receiptFile || Object.hasOwn(previous.files, file)) continue;
					if (options.clean && /^(?:Pods|build|\.gradle|\.cxx|app\/(?:build|\.cxx))(?:\/|$)/.test(file)) continue;
					const destination = node_path.default.join(project, file);
					if (entry.isDirectory()) {
						if ((0, node_fs.existsSync)(destination) && !(0, node_fs.lstatSync)(destination).isDirectory()) fail(`new generated file conflicts with consumer directory: ${file}`);
						(0, node_fs.mkdirSync)(destination, { recursive: true });
						restore(file);
					} else {
						if ((0, node_fs.existsSync)(destination)) fail(`new generated file conflicts with consumer file: ${file}`);
						if (entry.isSymbolicLink()) (0, node_fs.symlinkSync)((0, node_fs.readlinkSync)(node_path.default.join(backup, file)), destination);
						else if (entry.isFile()) (0, node_fs.cpSync)(node_path.default.join(backup, file), destination);
						else fail(`unsupported consumer file: ${file}`);
					}
				}
			};
			restore();
		}
		committed = true;
		return {
			...result,
			...metadata,
			project,
			receipt,
			log
		};
	} catch (error) {
		try {
			if (generated || moved) (0, node_fs.rmSync)(project, {
				recursive: true,
				force: true
			});
			if (moved) (0, node_fs.renameSync)(backup, project);
			if (ranExpo) {
				for (const entry of (0, node_fs.readdirSync)(root, { withFileTypes: true })) if (entry.isFile() && !rootFiles.has(entry.name)) (0, node_fs.rmSync)(node_path.default.join(root, entry.name));
				for (const [file, bytes] of rootFiles) write(root, file, bytes);
			}
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], `Prebuild and rollback failed; inspect the previous consumer at ${(0, node_fs.existsSync)(backup) ? backup : project}`);
		}
		throw error;
	} finally {
		if (committed || !(0, node_fs.existsSync)(backup)) (0, node_fs.rmSync)(work, {
			recursive: true,
			force: true
		});
		(0, node_fs.rmSync)(lock, { recursive: true });
	}
}
//#endregion
exports.prebuildRetainedExpo = prebuildRetainedExpo;
