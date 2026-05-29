#!/usr/bin/env node

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Helper to parse semver into { major, minor, patch }
function parseSemver(versionString) {
	const clean = versionString.split("-")[0].split("+")[0];
	const parts = clean.split(".").map(Number);
	return {
		major: parts[0] || 0,
		minor: parts[1] || 0,
		patch: parts[2] || 0,
	};
}

// Helper to check if current version is greater than base version
function isVersionBumped(baseVal, newVal) {
	const base = parseSemver(baseVal);
	const current = parseSemver(newVal);

	if (current.major !== base.major) {
		return current.major > base.major;
	}
	if (current.minor !== base.minor) {
		return current.minor > base.minor;
	}
	return current.patch > base.patch;
}

// Helper to get all modified files compared to the base branch
function getModifiedFiles(baseBranch) {
	try {
		// Ensure base branch is fetched first to allow diffing
		try {
			execSync(`git fetch origin ${baseBranch} --depth=1`, { stdio: "ignore" });
		} catch (fetchErr) {
			console.warn(`⚠️ Warning: Could not fetch base branch origin/${baseBranch}: ${fetchErr.message.trim()}`);
		}

		// 1. Get uncommitted files
		const localChanges = execSync("git status --porcelain", { encoding: "utf8" });
		const localFiles = localChanges
			.split("\n")
			.map((line) => {
				const parts = line.trim().split(/\s+/);
				return parts.length >= 2 ? parts.slice(1).join(" ") : "";
			})
			.filter(Boolean);

		// 2. Get committed changes relative to the base branch
		let diffFiles;
		try {
			diffFiles = execSync(`git diff --name-only origin/${baseBranch}...HEAD`, { encoding: "utf8" });
		} catch (diffErr) {
			console.warn(`⚠️ Warning: git diff three-dot comparison failed: ${diffErr.message.trim()}`);
			console.log("📡 Falling back to direct two-dot tree comparison...");
			try {
				diffFiles = execSync(`git diff --name-only origin/${baseBranch} HEAD`, { encoding: "utf8" });
			} catch (fallbackErr) {
				console.warn(`⚠️ Warning: Direct two-dot tree comparison failed: ${fallbackErr.message.trim()}`);
				diffFiles = "";
			}
		}
		const committedFiles = diffFiles
			.split("\n")
			.map((f) => f.trim())
			.filter(Boolean);

		// Combine and return unique files
		return Array.from(new Set([...localFiles, ...committedFiles]));
	} catch (err) {
		console.warn(`⚠️ Warning: Could not retrieve list of modified files: ${err.message}`);
		return [];
	}
}

// Helper to determine if any package-affecting files were modified
function shouldRunReleaseChecks(modifiedFiles) {
	if (modifiedFiles.length === 0) {
		// If we can't determine, play it safe and run the checks
		return true;
	}

	return modifiedFiles.some((file) => {
		const f = file.toLowerCase();
		return (
			f.startsWith("extensions/") ||
			f === "package.json" ||
			f === "readme.md" ||
			f === "changelog.md" ||
			f === "license"
		);
	});
}

function main() {
	const isCi = process.env.CI === "true";
	const eventName = process.env.GITHUB_EVENT_NAME;
	const baseBranch = process.env.GITHUB_BASE_REF || "main";

	console.log("--------------------------------------------------");
	console.log("🔍 Running Release Readiness Checks...");
	console.log("--------------------------------------------------");

	// 1. Determine modified files first
	console.log("📡 Retrieving list of modified files...");
	const modifiedFiles = getModifiedFiles(baseBranch);

	// 2. Run smart bypass check
	if (!shouldRunReleaseChecks(modifiedFiles)) {
		console.log(
			"\nℹ️ Skipping release readiness checks: No package-affecting files (source code, README, CHANGELOG, etc.) were modified.",
		);
		console.log("🎉 All release readiness checks bypassed!");
		process.exit(0);
	}

	let hasError = false;

	// ==================== Check 1: package.json Version Bump ====================
	console.log("\n📦 Check 1: package.json Version Bump");
	console.log("--------------------------------------");

	// Read current version
	let currentPkg;
	try {
		currentPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
	} catch (err) {
		console.error("❌ Error reading current package.json:", err.message);
		process.exit(1);
	}
	const currentVersion = currentPkg.version;

	// Determine base version to compare against
	let baseVersion = null;
	try {
		const basePkgStr = execSync(`git show origin/${baseBranch}:package.json`, { encoding: "utf8" });
		const basePkg = JSON.parse(basePkgStr);
		baseVersion = basePkg.version;
	} catch (err) {
		console.warn(`⚠️ Warning: Could not retrieve package.json from origin/${baseBranch}:`, err.message);

		if (isCi && eventName === "pull_request") {
			console.error("❌ Critical: Could not read package.json of base branch in PR environment.");
			process.exit(1);
		}

		console.log("ℹ️ Skipping version bump validation as base branch package.json is inaccessible.");
	}

	if (baseVersion !== null) {
		console.log(`📌 Base version (origin/${baseBranch}): ${baseVersion}`);
		console.log(`📌 Current version (local):       ${currentVersion}`);

		if (isVersionBumped(baseVersion, currentVersion)) {
			console.log(`✅ Success! Version bumped from ${baseVersion} to ${currentVersion}.`);
		} else {
			console.error("❌ Error: package.json version has not been bumped!");
			console.error(`   Base version:    ${baseVersion}`);
			console.error(`   Current version: ${currentVersion}`);
			console.error("💡 Please run a version bump (e.g. 'npm version patch') before submitting your PR.");
			hasError = true;
		}
	}

	// ==================== Check 2: CHANGELOG Check ====================
	console.log("\n📝 Check 2: CHANGELOG.md Modifications");
	console.log("--------------------------------------");

	const changelogOk = modifiedFiles.some((file) => file.toLowerCase() === "changelog.md");
	if (changelogOk) {
		console.log("✅ Success! CHANGELOG.md has been modified in this branch or locally.");
	} else {
		console.error("❌ Error: CHANGELOG.md has not been updated!");
		console.error("💡 Please document your changes in CHANGELOG.md before submitting your PR.");
		hasError = true;
	}

	console.log("\n--------------------------------------------------");
	if (hasError) {
		console.error("❌ Release checks failed. Please fix the issues listed above.");
		process.exit(1);
	} else {
		console.log("🎉 All release readiness checks passed!");
		process.exit(0);
	}
}

main();
