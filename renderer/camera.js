const video = document.getElementById('webcam');
const status = document.getElementById('status');
const outputCanvas = document.getElementById('output');

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    status.textContent = '카메라 권한이 없어요. 시스템 설정에서 카메라 접근을 허용해주세요.';
    document.getElementById('capture-btn').disabled = true;
  }
}
startWebcam();

document.getElementById('capture-btn').addEventListener('click', async () => {
  const ctx = outputCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 480, 360);

  // Simple pigeon overlay: a colored rounded rect placeholder in the corner,
  // matching the placeholder art used everywhere else until real sprites exist.
  ctx.fillStyle = '#8b7d6b';
  ctx.beginPath();
  ctx.roundRect(380, 260, 80, 80, 8);
  ctx.fill();

  const dataUrl = outputCanvas.toDataURL('image/png');
  const result = await window.pigeonBridge.invoke('save-photo', dataUrl);
  status.textContent = '사진을 저장했어요!';
});
