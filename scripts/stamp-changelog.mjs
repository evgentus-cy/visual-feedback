#!/usr/bin/env node
/**
 * npm `version` lifecycle hook: moves the "## [Unreleased]" notes under a new
 * "## [X.Y.Z] - YYYY-MM-DD" heading (Keep a Changelog). Fails the release when
 * there is nothing in Unreleased — every release must say what changed.
 * The new version is provided by npm via npm_package_version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const version = process.env.npm_package_version;
if (!version) {
  console.error('stamp-changelog: run via "npm version" (npm_package_version is not set).');
  process.exit(1);
}

const path = 'CHANGELOG.md';
const changelog = readFileSync(path, 'utf8');

const marker = '## [Unreleased]';
const start = changelog.indexOf(marker);
if (start === -1) {
  console.error(`stamp-changelog: no "${marker}" section in ${path} — add one with your notes.`);
  process.exit(1);
}

const rest = changelog.slice(start + marker.length);
const nextHeading = rest.search(/^## \[/m);
const unreleased = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
if (!unreleased) {
  console.error(
    `stamp-changelog: "${marker}" is empty — describe the release in ${path} first, then bump.`,
  );
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(path, changelog.replace(marker, `${marker}\n\n## [${version}] - ${date}`));
process.stdout.write(`stamp-changelog: CHANGELOG.md → [${version}] - ${date}\n`);
