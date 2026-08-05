const repoOwner = 'meoyaho';
const repoName = 'my-pigeon';
const releasesUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest`;
const latestReleaseApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

const preferredAssetPattern = /\.(dmg|zip|exe|appimage)$/i;
const downloadButton = document.querySelector('#download-button');
const downloadStatus = document.querySelector('#download-status');

function setStatus(message) {
  if (downloadStatus) downloadStatus.textContent = message;
}

async function wireLatestDownload() {
  try {
    const response = await fetch(latestReleaseApiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) throw new Error('No release found');

    const release = await response.json();
    const asset = Array.isArray(release.assets)
      ? release.assets.find((item) => preferredAssetPattern.test(item.name))
      : null;

    if (!asset) {
      downloadButton.href = release.html_url || releasesUrl;
      downloadButton.removeAttribute('download');
      setStatus('최신 릴리스 페이지로 이동합니다.');
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
