const repoOwner = 'meoyaho';
const repoName = 'my-pigeon';
const releasesUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest`;
const latestReleaseApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

const downloadButton = document.querySelector('#download-button');
const downloadStatus = document.querySelector('#download-status');

function setStatus(message) {
  if (downloadStatus) downloadStatus.textContent = message;
}

function getPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const value = `${platform} ${userAgent}`.toLowerCase();

  if (value.includes('win')) return 'windows';
  if (value.includes('mac')) return 'mac';
  if (value.includes('linux')) return 'linux';
  return 'unknown';
}

function findAssetForPlatform(assets, platform) {
  const patterns = {
    windows: [/\.exe$/i, /\.msi$/i, /(win|windows).*\.zip$/i],
    mac: [/\.dmg$/i, /(mac|darwin).*\.zip$/i],
    linux: [/\.appimage$/i, /\.deb$/i, /\.rpm$/i, /(linux).*\.zip$/i],
    unknown: [/\.dmg$/i, /\.exe$/i, /\.msi$/i, /\.appimage$/i, /\.deb$/i, /\.rpm$/i, /\.zip$/i],
  };

  for (const pattern of patterns[platform] || patterns.unknown) {
    const matches = assets.filter((item) => pattern.test(item.name));
    const namedMatch = matches.find((item) => /my[-\s]?pigeon/i.test(item.name));
    if (namedMatch) return namedMatch;
    if (matches[0]) return matches[0];
  }

  return null;
}

async function wireLatestDownload() {
  try {
    const response = await fetch(latestReleaseApiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) throw new Error('No release found');

    const release = await response.json();
    const platform = getPlatform();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = findAssetForPlatform(assets, platform);

    if (!asset) {
      downloadButton.href = release.html_url || releasesUrl;
      downloadButton.removeAttribute('download');
      setStatus('이 기기에 맞는 설치 파일이 없어서 최신 릴리스 페이지로 이동합니다.');
      return;
    }

    downloadButton.href = asset.browser_download_url;
    downloadButton.setAttribute('download', asset.name);
    downloadButton.setAttribute('aria-label', `${asset.name} 다운로드`);
    setStatus(`${release.name || release.tag_name} 설치 파일에 연결되었습니다.`);
  } catch (_error) {
    downloadButton.href = releasesUrl;
    downloadButton.removeAttribute('download');
    setStatus('릴리스가 아직 없으면 GitHub Releases로 이동합니다.');
  }
}

wireLatestDownload();
