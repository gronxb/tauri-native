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
let node_crypto = require("node:crypto");
let node_fs = require("node:fs");
let node_path = require("node:path");
node_path = __toESM(node_path, 1);
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
	if (!(0, node_fs.lstatSync)(directory).isDirectory() || !(0, node_fs.lstatSync)(node_path.default.join(directory, "manifest.json")).isFile()) invalid("artifact_symlink", "the artifact root and manifest must not be links");
	const manifest = JSON.parse((0, node_fs.readFileSync)(node_path.default.join(directory, "manifest.json"), "utf8"));
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
			headers.push(node_path.default.posix.join(node_path.default.posix.dirname(slices[0].path), "Headers/tauri_native.h"));
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
		for (const entry of (0, node_fs.readdirSync)(node_path.default.join(directory, prefix), { withFileTypes: true })) {
			const relative = node_path.default.posix.join(prefix, entry.name);
			if (entry.isDirectory()) visit(relative);
			else {
				if (!entry.isFile()) invalid("artifact_symlink", `links are not portable: ${relative}`);
				if (relative === "manifest.json") continue;
				const file = files.get(relative);
				const bytes = (0, node_fs.readFileSync)(node_path.default.join(directory, relative));
				if (!file || file.size !== bytes.length || file.sha256 !== (0, node_crypto.createHash)("sha256").update(bytes).digest("hex")) invalid("artifact_checksum", `checksum mismatch or unexpected file: ${relative}`);
				count++;
			}
		}
	}
	visit();
	if (count !== files.size || required.some((file) => !files.has(file))) invalid("artifact_missing_file", "missing required file");
	if (generated) {
		const model = JSON.parse((0, node_fs.readFileSync)(node_path.default.join(directory, manifest.commands), "utf8"));
		if (!model || model.schemaVersion !== 1 || model.abiVersion !== manifest.abiVersion || !Array.isArray(model.commands)) invalid("artifact_metadata", "incompatible command metadata");
		for (const header of headers) if (!new RegExp(`^#define TAURI_NATIVE_ABI_VERSION ${manifest.abiVersion}\\b`, "m").test((0, node_fs.readFileSync)(node_path.default.join(directory, header), "utf8"))) invalid("artifact_abi", "incompatible ABI header");
	}
	return manifest;
}
//#endregion
exports.ArtifactError = ArtifactError;
exports.readArtifacts = readArtifacts;
