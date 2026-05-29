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

// Helper to check if CHANGELOG.md has been modified
function isChangelogModified(baseBranch) {
	try {
		// 1. Check local uncommitted changes
		const localChanges = execSync("git status --porcelain", { encoding: "utf8" });
		const localLines = localChanges.split("\n").map((line) => line.trim());
		const hasUncommittedChanges = localLines.some((line) => {
			// Extract file path from git status (typically starts with M, A, ?? etc.)
			// Format: "XY path/to/file"
			const parts = line.split(/\s+/);
			if (parts.length < 2) return false;
			const filePath = parts.slice(1).join(" ");
			return filePath.toLowerCase() === "changelog.md";
		});

		if (hasUncommittedChanges) {
			return true;
		}

		// 2. Check committed changes relative to the base branch
		// git diff --name-only origin/<baseBranch>...HEAD checks the differences introduced by the PR branch
		let diffFiles;
		try {
			diffFiles = execSync(`git diff --name-only origin/${baseBranch}...HEAD`, { encoding: "utf8" });
		} catch (diffErr) {
			console.warn(`⚠️ Warning: git diff three-dot comparison failed: ${diffErr.message.trim()}`);
			console.log("📡 Falling back to direct two-dot tree comparison...");
			// Fallback: compare trees directly, which works even on shallow clones with no merge base
			diffFiles = execSync(`git diff --name-only origin/${baseBranch} HEAD`, { encoding: "utf8" });
		}
		const changedFiles = diffFiles.split("\n").map((f) => f.trim());
		return changedFiles.some((file) => file.toLowerCase() === "changelog.md");
	} catch (err) {
		console.warn(`⚠️ Warning: Could not check changelog modifications via git: ${err.message}`);
		return false;
	}
}

function main() {
	const isCi = process.env.CI === "true";
	const eventName = process.env.GITHUB_EVENT_NAME;
	const baseBranch = process.env.GITHUB_BASE_REF || "main";

	let hasError = false;

	console.log("--------------------------------------------------");
	console.log("🔍 Running Release Readiness Checks...");
	console.log("--------------------------------------------------");

	// ==================== 1. Package Version Check ====================
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
		// Fetch base branch to compare versions
		console.log(`📡 Fetching origin/${baseBranch} to compare versions...`);
		execSync(`git fetch origin ${baseBranch} --depth=1`, { stdio: "ignore" });

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

	// ==================== 2. CHANGELOG Check ====================
	console.log("\n📝 Check 2: CHANGELOG.md Modifications");
	console.log("--------------------------------------");

	const changelogOk = isChangelogModified(baseBranch);
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
