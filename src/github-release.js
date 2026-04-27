// Uploads a file to a GitHub release. Maintains a single "current" release
// that gets re-uploaded to every Monday — gives the shop TV a stable URL.
//
// Auth: GITHUB_TOKEN env var, automatically provided by Actions.

import fs from "fs";
import path from "path";

const RELEASE_TAG = "current";
const RELEASE_NAME = "Current Shop Briefing";
const RELEASE_BODY = "Auto-generated weekly. Download the .pptx below and open it on the shop TV.";

function api(endpoint, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY not set");

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.github.com/repos/${repo}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
}

async function findReleaseByTag(tag) {
  const r = await api(`/releases/tags/${tag}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function createRelease() {
  const r = await api("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: RELEASE_TAG,
      name: RELEASE_NAME,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    }),
  });
  if (!r.ok) throw new Error(`Failed to create release: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function deleteAsset(assetId) {
  const r = await api(`/releases/assets/${assetId}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) {
    throw new Error(`Failed to delete asset ${assetId}: ${r.status} ${await r.text()}`);
  }
}

async function uploadAsset(release, filePath, displayName) {
  const name = displayName || path.basename(filePath);
  const fileBuf = fs.readFileSync(filePath);

  // GitHub uses a separate upload endpoint
  const uploadUrl = release.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(name)}`;
  const r = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Length": String(fileBuf.length),
    },
    body: fileBuf,
  });
  if (!r.ok) throw new Error(`Failed to upload asset: ${r.status} ${await r.text()}`);
  return await r.json();
}

// Updates the release date in the body so it's clear when this was built
async function updateReleaseBody(releaseId, weekHumanLabel) {
  const body = `${RELEASE_BODY}\n\n**Week of ${weekHumanLabel}**\n\nLast built: ${new Date().toISOString()}`;
  const r = await api(`/releases/${releaseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!r.ok) throw new Error(`Failed to update release body: ${r.status} ${await r.text()}`);
}

// Main entry — replace the current release's asset with a fresh upload.
export async function publishToCurrentRelease({ filePath, displayName, weekHumanLabel }) {
  let release = await findReleaseByTag(RELEASE_TAG);
  if (!release) {
    console.log("No 'current' release found — creating it");
    release = await createRelease();
  } else {
    console.log(`Found 'current' release (id ${release.id})`);
  }

  // Delete any existing asset with the same name to avoid duplicates
  const targetName = displayName || path.basename(filePath);
  const existing = (release.assets || []).find(a => a.name === targetName);
  if (existing) {
    console.log(`  Deleting old asset ${targetName} (id ${existing.id})`);
    await deleteAsset(existing.id);
  }

  console.log(`  Uploading ${targetName}...`);
  const asset = await uploadAsset(release, filePath, targetName);

  if (weekHumanLabel) {
    await updateReleaseBody(release.id, weekHumanLabel);
  }

  return {
    downloadUrl: asset.browser_download_url,
    releaseUrl: release.html_url,
  };
}
