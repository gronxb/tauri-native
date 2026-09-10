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
let node_fs = require("node:fs");
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
function read$1(root, file) {
	return (0, node_fs.readFileSync)(node_path$1.default.join(root, file), "utf8");
}
function write$1(root, file, bytes) {
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
	return {
		artifact,
		bundle,
		sdk,
		output,
		manifest,
		bundled: (0, node_fs.readFileSync)(bundle),
		renderer,
		fail
	};
}
function inventory(root, fail, prefix = "") {
	const result = {};
	for (const entry of (0, node_fs.readdirSync)(node_path$1.default.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const file = node_path$1.default.posix.join(prefix, entry.name);
		if (entry.isDirectory()) Object.assign(result, inventory(root, fail, file));
		else if (entry.isFile()) result[file] = hash((0, node_fs.readFileSync)(node_path$1.default.join(root, file)));
		else fail(`generated path must be regular: ${file}`);
	}
	return result;
}
function publishComposition(context, metadata, generate) {
	const { artifact, bundle, bundled, output, manifest, renderer, fail } = context;
	const receiptPath = "tauri-native-composition.json";
	let previous;
	if ((0, node_fs.existsSync)(output)) {
		if (!(0, node_fs.lstatSync)(output).isDirectory() || !(0, node_fs.existsSync)(node_path$1.default.join(output, receiptPath)) || !(0, node_fs.lstatSync)(node_path$1.default.join(output, receiptPath)).isFile()) fail("existing output is not an owned composition directory");
		const value = JSON.parse(read$1(output, receiptPath));
		if (value.formatVersion !== 1 || value.renderer !== renderer || (value.platform ?? "android") !== manifest.platform || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) fail("invalid prior composition receipt");
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
	const stage = node_path$1.default.join(work, "next");
	const backup = node_path$1.default.join(work, "previous");
	let published = false;
	try {
		(0, node_fs.mkdirSync)(stage);
		(0, node_fs.cpSync)(node_path$1.default.join(artifact, manifest.platform), node_path$1.default.join(stage, manifest.platform), { recursive: true });
		generate(stage);
		const files = inventory(stage, fail);
		const receipt = JSON.stringify({
			formatVersion: 1,
			renderer,
			artifact: hash((0, node_fs.readFileSync)(node_path$1.default.join(artifact, "manifest.json"))),
			...metadata,
			files
		}, null, 2) + "\n";
		write$1(stage, receiptPath, receipt);
		if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !(0, node_fs.readFileSync)(bundle).equals(bundled)) fail("inputs changed during composition");
		if (previous && read$1(output, receiptPath) === receipt) return false;
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
//#region packages/lynx/plugin/retained-compose.cts
function read(root, file) {
	return (0, node_fs.readFileSync)(node_path.default.join(root, file), "utf8");
}
function write(root, file, bytes) {
	(0, node_fs.mkdirSync)(node_path.default.dirname(node_path.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path.default.join(root, file), bytes);
}
const groovy = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
function composeAndroid(options) {
	const context = prepareComposition(options, "android", "lynx", __dirname);
	const { artifact, sdk, output, manifest, bundled, fail } = context;
	if (manifest.platform !== "android") return fail("requires an Android format 2 artifact");
	const android = node_path.default.join(artifact, "android");
	const appId = manifest.bootstrap.applicationId, activity = `${appId}.TauriNativeActivity`;
	const source = `app/src/main/java/${appId.replaceAll(".", "/")}/MainActivity.kt`;
	const main = read(android, source);
	const standard = `package ${appId} import android.os.Bundle import androidx.activity.enableEdgeToEdge class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }`;
	if (main.replace(/\s+/g, " ").trim() !== standard) fail("custom MainActivity requires verified lifecycle integration; original source was left unchanged");
	const rootGradle = read(android, "build.gradle.kts"), appGradle = read(android, "app/build.gradle.kts");
	const settings = read(android, "settings.gradle"), xml = read(android, "app/src/main/AndroidManifest.xml");
	if (!rootGradle.includes("com.android.tools.build:gradle:8.11.0") || !rootGradle.includes("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25") || !/compileSdk\s*=\s*36\b/.test(appGradle)) fail("requires the verified AGP 8.11.0, Kotlin 1.9.25 and compile SDK 36 build");
	if (/<application\b[^>]*android:name\s*=/.test(xml) || (xml.match(/<activity\b/g) ?? []).length !== 1 || /<activity-alias\b/.test(xml)) fail("custom Application or multiple Activity owners require verified integration");
	if ([
		rootGradle,
		appGradle,
		settings,
		read(android, "gradle.properties"),
		xml
	].some((value) => /tauri-native-(?:react|lynx|runtime-client)|com\.facebook\.react|expo\.modules|org\.lynxsdk/.test(value))) fail("existing renderer configuration conflicts with retained composition");
	if (xml.split("android:name=\".MainActivity\"").length !== 2) fail("unsupported launcher Activity");
	const generated = `app/src/main/java/${appId.replaceAll(".", "/")}/TauriNativeActivity.kt`;
	if ([
		"tauri-native-runtime-client",
		"app/src/main/assets/tauri-native-lynx",
		generated
	].some((file) => (0, node_fs.existsSync)(node_path.default.join(android, file)))) fail("artifact already owns generated Lynx integration");
	const sdkPath = node_path.default.relative(node_path.default.join(output, "android"), node_path.default.join(sdk, "android/retained")).split(node_path.default.sep).join("/");
	const template = read(sdk, "retained/android/TauriNativeActivity.kt.template");
	const changed = publishComposition(context, {
		platform: "android",
		activity
	}, (stage) => {
		write(stage, `android/${source}`, main.replace("class MainActivity", "open class MainActivity"));
		write(stage, `android/${generated}`, template.replaceAll("__APPLICATION_ID__", appId));
		write(stage, "android/app/src/main/AndroidManifest.xml", xml.replace("android:name=\".MainActivity\"", `android:name="${activity}"`));
		write(stage, "android/settings.gradle", settings + `\ninclude ':tauri-native-runtime-client', ':tauri-native-lynx'\nproject(':tauri-native-lynx').projectDir = new File(settingsDir, ${groovy(sdkPath)})\n`);
		write(stage, "android/app/build.gradle.kts", appGradle + `\nandroid { defaultConfig { ndk { abiFilters += listOf(${manifest.native.map((slice) => JSON.stringify(slice.abi)).join(", ")}) } } }\ndependencies { implementation(project(":tauri-native-lynx")); implementation(project(":tauri-native-runtime-client")) }\n`);
		const client = "app/src/main/java/dev/taurinative/runtime/RuntimeSession.java";
		write(stage, "android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java", read(android, client));
		(0, node_fs.rmSync)(node_path.default.join(stage, "android", client));
		write(stage, "android/tauri-native-runtime-client/build.gradle", "plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 35\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n");
		write(stage, "android/app/src/main/assets/tauri-native-lynx/main.lynx.bundle", bundled);
	});
	return {
		project: node_path.default.join(output, "android"),
		activity,
		changed
	};
}
function composeIos(options) {
	const context = prepareComposition(options, "ios", "lynx", __dirname);
	const { sdk, output, bundled } = context;
	const { projectFile, encodedProject, main, originalMain, minimumOsVersion, bootstrap, workspace } = prepareIosProject(context, "14.0");
	const ruby = groovy;
	const relative = (dir) => node_path.default.relative(node_path.default.join(output, "ios"), dir).split(node_path.default.sep).join("/");
	const changed = publishComposition(context, {
		platform: "ios",
		minimumOsVersion,
		target: bootstrap.target
	}, (stage) => {
		write(stage, `ios/${projectFile}`, encodedProject);
		write(stage, `ios/${main}`, "#import <TauriNativeLynxRetained/TNLynxComposition.h>\n" + originalMain.replace("ffi::start_app();", "@autoreleasepool {\n		NSURL *bundle = [NSBundle.mainBundle URLForResource:@\"main.lynx\" withExtension:@\"bundle\" subdirectory:@\"assets/tauri-native-lynx\"];\n		[TNLynxComposition installWithBundle:bundle];\n	}\n	ffi::start_app();"));
		write(stage, "ios/assets/tauri-native-lynx/main.lynx.bundle", bundled);
		write(stage, "ios/Podfile", `source 'https://cdn.cocoapods.org/'
require_relative ${ruby(relative(node_path.default.join(sdk, "ios/retained/pods")))}
composition = TauriNativeLynxRetained.composition_receipt(__dir__)
platform :ios, ${ruby(minimumOsVersion)}
use_modular_headers!
project ${ruby(bootstrap.xcodeProject)}, 'debug' => :debug, 'release' => :release
target ${ruby(bootstrap.target)} do
  pod 'TauriNativeLynxRetained', :path => ${ruby(relative(node_path.default.join(sdk, "ios")))}
end
post_install do |installer|
  TauriNativeLynxRetained.post_install(installer, ${ruby(bootstrap.target)})
end
post_integrate do |installer|
  TauriNativeLynxRetained.finish_composition(__dir__, composition)
end
`);
	});
	return {
		project: node_path.default.join(output, "ios"),
		target: bootstrap.target,
		workspace,
		minimumOsVersion,
		changed
	};
}
//#endregion
exports.composeAndroid = composeAndroid;
exports.composeIos = composeIos;
