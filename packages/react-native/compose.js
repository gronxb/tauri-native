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
let node_crypto = require("node:crypto");
let node_fs = require("node:fs");
let node_module = require("node:module");
let node_path = require("node:path");
let node_path$1 = __toESM(node_path, 1);
node_path = __toESM(node_path);
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
//#region packages/react-native/plugin/retained-compose.cts
const hash = (bytes) => (0, node_crypto.createHash)("sha256").update(bytes).digest("hex");
const kotlin = (value) => JSON.stringify(value).replaceAll("$", "\\$");
const groovy = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
function fail(message) {
	throw new Error(`Retained RN composition: ${message}`);
}
function read(root, file) {
	return (0, node_fs.readFileSync)(node_path.default.join(root, file), "utf8");
}
function write(root, file, bytes) {
	(0, node_fs.mkdirSync)(node_path.default.dirname(node_path.default.join(root, file)), { recursive: true });
	(0, node_fs.writeFileSync)(node_path.default.join(root, file), bytes);
}
function replaceOnce(value, from, to, description) {
	if (value.split(from).length !== 2) fail(`unsupported ${description}; expected one ${JSON.stringify(from)}`);
	return value.replace(from, to);
}
function inventory(root, prefix = "") {
	const result = {};
	for (const entry of (0, node_fs.readdirSync)(node_path.default.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const file = node_path.default.posix.join(prefix, entry.name);
		if (entry.isDirectory()) Object.assign(result, inventory(root, file));
		else if (entry.isFile()) result[file] = hash((0, node_fs.readFileSync)(node_path.default.join(root, file)));
		else fail(`generated path must be regular: ${file}`);
	}
	return result;
}
function compositionInputs(options, platform) {
	const artifact = (0, node_fs.realpathSync)(options.artifactsDir), renderer = (0, node_fs.realpathSync)(options.rendererDir);
	const bundle = (0, node_fs.realpathSync)(options.bundleFile), sdk = (0, node_fs.realpathSync)(__dirname);
	const requestedOutput = node_path.default.resolve(options.outputDir);
	const output = node_path.default.join((0, node_fs.realpathSync)(node_path.default.dirname(requestedOutput)), node_path.default.basename(requestedOutput));
	const overlaps = (a, b) => a === b || a.startsWith(b + node_path.default.sep) || b.startsWith(a + node_path.default.sep);
	if ([artifact, sdk].some((input) => overlaps(output, input)) || [renderer, bundle].some((input) => input === output || input.startsWith(output + node_path.default.sep))) fail("output must be separate from the artifact and SDK, and must not contain the renderer or bundle");
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.moduleName)) fail("moduleName must be an AppRegistry identifier");
	const manifest = readRetainedArtifacts(artifact);
	if (manifest.platform !== platform) fail(`requires an ${platform} format 2 artifact`);
	const requireRenderer = (0, node_module.createRequire)(node_path.default.join(renderer, "package.json"));
	const rn = (0, node_fs.realpathSync)(node_path.default.dirname(requireRenderer.resolve("react-native/package.json")));
	const codegen = (0, node_fs.realpathSync)(node_path.default.dirname((0, node_module.createRequire)(node_path.default.join(rn, "package.json")).resolve("@react-native/codegen/package.json")));
	if ([rn, codegen].some((dir) => JSON.parse(read(dir, "package.json")).version !== "0.86.3")) fail("React Native and codegen must both be 0.86.3");
	return {
		options,
		artifact,
		renderer,
		bundle,
		sdk,
		output,
		manifest,
		rn,
		codegen,
		bundled: (0, node_fs.readFileSync)(bundle)
	};
}
function publishComposition(context, metadata, generate) {
	const { options, artifact, bundle, bundled, output, manifest } = context;
	const receiptPath = "tauri-native-composition.json";
	let previous;
	if ((0, node_fs.existsSync)(output)) {
		if (!(0, node_fs.lstatSync)(output).isDirectory() || !(0, node_fs.existsSync)(node_path.default.join(output, receiptPath)) || !(0, node_fs.lstatSync)(node_path.default.join(output, receiptPath)).isFile()) fail("existing output is not an owned composition directory");
		const value = JSON.parse(read(output, receiptPath));
		if (value.formatVersion !== 1 || value.renderer !== "react-native" || (value.platform ?? "android") !== manifest.platform || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) fail("invalid prior composition receipt");
		previous = value;
		for (const [file, digest] of Object.entries(previous.files)) {
			if (!file || file.split("/").some((part) => !part || part === "." || part === "..") || /[\\:\0]/.test(file) || !/^[a-f0-9]{64}$/.test(digest)) fail("invalid prior composition file receipt");
			const target = node_path.default.join(output, file);
			let cursor = output;
			for (const part of file.split("/")) {
				cursor = node_path.default.join(cursor, part);
				if (!(0, node_fs.existsSync)(cursor) || (0, node_fs.lstatSync)(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${file}`);
			}
			if (!(0, node_fs.lstatSync)(target).isFile() || hash((0, node_fs.readFileSync)(target)) !== digest) fail(`generated file changed: ${file}; preserve the edit before regenerating`);
		}
	}
	const work = (0, node_fs.mkdtempSync)(node_path.default.join(node_path.default.dirname(output), ".tauri-react-compose-"));
	const stage = node_path.default.join(work, "next");
	const backup = node_path.default.join(work, "previous");
	let published = false;
	try {
		(0, node_fs.mkdirSync)(stage);
		(0, node_fs.cpSync)(node_path.default.join(artifact, manifest.platform), node_path.default.join(stage, manifest.platform), { recursive: true });
		generate(stage);
		const files = inventory(stage);
		const receipt = JSON.stringify({
			formatVersion: 1,
			renderer: "react-native",
			artifact: hash((0, node_fs.readFileSync)(node_path.default.join(artifact, "manifest.json"))),
			moduleName: options.moduleName,
			...metadata,
			files
		}, null, 2) + "\n";
		write(stage, receiptPath, receipt);
		if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !(0, node_fs.readFileSync)(bundle).equals(bundled)) fail("inputs changed during composition");
		if (previous && read(output, receiptPath) === receipt) return false;
		if (previous) {
			const merged = node_path.default.join(work, "merged");
			(0, node_fs.cpSync)(output, merged, { recursive: true });
			for (const file of Object.keys(previous.files)) (0, node_fs.rmSync)(node_path.default.join(merged, file));
			(0, node_fs.rmSync)(node_path.default.join(merged, receiptPath));
			for (const file of Object.keys(files)) {
				let cursor = merged;
				for (const part of file.split("/")) {
					cursor = node_path.default.join(cursor, part);
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
/** The output owns generated integration; the original artifact is never modified. */
function composeAndroid(options) {
	const context = compositionInputs(options, "android");
	const { artifact, sdk, output, manifest, rn, codegen, bundled } = context;
	if (manifest.platform !== "android") fail("requires an Android format 2 artifact");
	const android = node_path.default.join(artifact, "android");
	const appId = manifest.bootstrap.applicationId, activity = `${appId}.TauriNativeActivity`;
	const source = `app/src/main/java/${appId.replaceAll(".", "/")}/MainActivity.kt`;
	const main = read(android, source);
	if (main.replace(/\s+/g, " ").trim() !== `package ${appId} import android.os.Bundle import androidx.activity.enableEdgeToEdge class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }`) fail("custom MainActivity requires verified lifecycle integration; original source was left unchanged");
	const rootGradle = read(android, "build.gradle.kts");
	if (!rootGradle.includes("com.android.tools.build:gradle:8.11.0")) fail("requires the verified AGP 8.11.0 build");
	const updatedRoot = replaceOnce(rootGradle, "org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25", "org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20", "root Kotlin dependency");
	const appGradle = read(android, "app/build.gradle.kts");
	const settings = read(android, "settings.gradle");
	const properties = read(android, "gradle.properties");
	const xml = read(android, "app/src/main/AndroidManifest.xml");
	if (/<application\b[^>]*android:name\s*=/.test(xml) || (xml.match(/<activity\b/g) ?? []).length !== 1 || /<activity-alias\b/.test(xml)) fail("custom Application or multiple Activity owners require verified integration");
	if ([
		rootGradle,
		appGradle,
		settings,
		properties,
		xml
	].some((value) => /tauri-native-react|tauri-native-runtime-client|tauriNativeReact|com\.facebook\.react|expo\.modules|android\.lint\.useK2Uast/.test(value))) fail("existing renderer or lint configuration conflicts with retained composition");
	if ((0, node_fs.existsSync)(node_path.default.join(android, "tauri-native-runtime-client"))) fail("artifact already owns the generated runtime client project");
	if (!/compileSdk\s*=\s*36\b/.test(appGradle)) fail("requires the verified Android compile SDK 36 build");
	const nativeActivity = replaceOnce(xml, "android:name=\".MainActivity\"", `android:name="${activity}"`, "launcher Activity");
	const relative = (directory) => node_path.default.relative(node_path.default.join(output, "android"), directory).split(node_path.default.sep).join("/");
	const template = read(sdk, "retained/android/TauriNativeActivity.kt.template");
	const changed = publishComposition(context, { activity }, (stage) => {
		write(stage, `android/${source}`, replaceOnce(main, "class MainActivity", "open class MainActivity", "original Activity"));
		const generated = `android/app/src/main/java/${appId.replaceAll(".", "/")}/TauriNativeActivity.kt`;
		if ((0, node_fs.existsSync)(node_path.default.join(stage, generated))) fail("artifact already owns TauriNativeActivity");
		write(stage, generated, template.replaceAll("__APPLICATION_ID__", appId).replaceAll("__MODULE__", kotlin(options.moduleName)));
		write(stage, "android/app/src/main/AndroidManifest.xml", nativeActivity);
		write(stage, "android/build.gradle.kts", updatedRoot + `\nextra["tauriNativeReactNativeDir"] = file(${kotlin(relative(rn))}).canonicalPath\nextra["tauriNativeReactCodegenDir"] = file(${kotlin(relative(codegen))}).canonicalPath\nextra["tauriNativeNode"] = ${kotlin(process.execPath)}\nextra["tauriNativeAbis"] = listOf(${manifest.native.map((slice) => kotlin(slice.abi)).join(", ")})\n`);
		write(stage, "android/settings.gradle", settings + `\ninclude ':tauri-native-runtime-client', ':tauri-native-react'\nproject(':tauri-native-react').projectDir = new File(settingsDir, ${groovy(relative(node_path.default.join(sdk, "android/retained")))})\n`);
		write(stage, "android/gradle.properties", properties + "\nandroid.lint.useK2Uast=false\n");
		write(stage, "android/app/build.gradle.kts", appGradle + `\nandroid { packaging { jniLibs.pickFirsts += "**/libc++_shared.so" }; defaultConfig { ndk { abiFilters += listOf(${manifest.native.map((slice) => kotlin(slice.abi)).join(", ")}) } } }\ndependencies { implementation(project(":tauri-native-react")); implementation(project(":tauri-native-runtime-client")) }\n`);
		const client = "app/src/main/java/dev/taurinative/runtime/RuntimeSession.java";
		write(stage, "android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java", read(android, client));
		(0, node_fs.rmSync)(node_path.default.join(stage, "android", client));
		write(stage, "android/tauri-native-runtime-client/build.gradle", "plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 36\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n");
		if ((0, node_fs.existsSync)(node_path.default.join(stage, "android/app/src/main/assets/tauri-native-react"))) fail("artifact already owns renderer assets");
		write(stage, "android/app/src/main/assets/tauri-native-react/index.bundle.js", bundled);
	});
	return {
		project: node_path.default.join(output, "android"),
		activity,
		changed
	};
}
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
const ruby = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const shell = (value) => `'${value.replaceAll("'", "'\\''")}'`;
function iosVersion(value) {
	if (typeof value !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) fail("iOS deployment targets must be explicit numeric versions");
	return value;
}
function greaterVersion(a, b) {
	const left = a.split(".").map(Number), right = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0) ? a : b;
	return a;
}
/** Use the original Tauri Xcode app and Apple plist tools; neither export nor build Rust. */
function composeIos(options) {
	if (process.platform !== "darwin") fail("iOS composition requires macOS Apple project tools");
	const context = compositionInputs(options, "ios");
	const { artifact, sdk, output, manifest, rn, renderer, bundled } = context;
	if (manifest.platform !== "ios") fail("requires an iOS format 2 artifact");
	const ios = node_path.default.join(artifact, "ios"), bootstrap = manifest.bootstrap;
	if ([
		"Podfile",
		"Podfile.lock",
		"Pods",
		".xcode.env",
		".xcode.env.local",
		"assets/tauri-native-react"
	].some((file) => (0, node_fs.existsSync)(node_path.default.join(ios, file)))) fail("existing CocoaPods, Node environment or renderer assets require explicit integration");
	const projectFile = `${bootstrap.xcodeProject}/project.pbxproj`;
	const project = plist(node_path.default.join(ios, projectFile));
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
		return node_path.default.posix.join(sourcePath(parents[0][0], visited), item.path ?? "");
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
	const originalMain = read(ios, main);
	if (originalMain.replace(/\s+/g, " ").trim() !== "#include \"bindings/bindings.h\" int main(int argc, char * argv[]) { ffi::start_app(); return 0; }") fail("custom iOS application entry point requires verified lifecycle integration");
	const configurations = objects[target.buildConfigurationList ?? ""]?.buildConfigurations;
	if (!configurations?.length) fail("missing original Xcode build configurations");
	for (const id of configurations) {
		const infoFile = (objects[id]?.buildSettings)?.INFOPLIST_FILE;
		if (typeof infoFile !== "string" || !/^[\w.-]+\/Info\.plist$/.test(infoFile)) fail("unsupported original Info.plist path");
		const info = plist(node_path.default.join(ios, infoFile));
		if (info.UIApplicationSceneManifest || info.UIApplicationDelegateClassName) fail("custom iOS scene/delegate ownership requires verified integration");
	}
	let minimumOsVersion = greaterVersion("16.4", iosVersion(bootstrap.minimumOsVersion));
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
	const relative = (dir) => node_path.default.relative(node_path.default.join(output, "ios"), dir).split(node_path.default.sep).join("/");
	const workspace = bootstrap.xcodeProject.replace(/\.xcodeproj$/, ".xcworkspace");
	const changed = publishComposition(context, {
		platform: "ios",
		minimumOsVersion,
		target: bootstrap.target
	}, (stage) => {
		write(stage, `ios/${projectFile}`, encodedProject.stdout);
		write(stage, `ios/${main}`, "#import <TauriNativeReactRetained/TNReactComposition.h>\n" + originalMain.replace("ffi::start_app();", `@autoreleasepool {\n\t\tNSURL *bundle = [NSBundle.mainBundle URLForResource:@"index.bundle" withExtension:@"js" subdirectory:@"assets/tauri-native-react"];\n\t\t[TNReactComposition installWithModule:@${JSON.stringify(options.moduleName)} bundle:bundle];\n\t}\n\tffi::start_app();`));
		write(stage, "ios/assets/tauri-native-react/index.bundle.js", bundled);
		write(stage, "ios/.xcode.env", `export NODE_BINARY=${shell(process.execPath)}\n`);
		write(stage, "ios/.xcode.env.local", `export NODE_BINARY=${shell(process.execPath)}\n`);
		write(stage, "ios/Podfile", `ENV['RCT_USE_RN_DEP'] = '1'
ENV['RCT_USE_PREBUILT_RNCORE'] = '1'
rn = File.expand_path(${ruby(relative(rn))}, __dir__)
require_relative ${ruby(relative(node_path.default.join(sdk, "ios/retained/pods")))}
composition = TauriNativeReactRetained.composition_receipt(__dir__)
require File.join(rn, 'scripts/react_native_pods')
platform :ios, ${ruby(minimumOsVersion)}
prepare_react_native_project!
TauriNativeReactRetained.prepare(rn, ${ruby(process.execPath)})
project ${ruby(bootstrap.xcodeProject)}, 'debug' => :debug, 'release' => :release
target ${ruby(bootstrap.target)} do
  use_react_native!(:path => rn, :app_path => File.expand_path(${ruby(relative(renderer))}, __dir__))
  pod 'TauriNativeReactRetained', :path => ${ruby(relative(node_path.default.join(sdk, "ios")))}
end
post_install do |installer|
  react_native_post_install(installer, rn, :mac_catalyst_enabled => false)
  TauriNativeReactRetained.post_install(installer, ${ruby(bootstrap.target)})
end
post_integrate do |installer|
  TauriNativeReactRetained.finish_composition(__dir__, composition)
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
