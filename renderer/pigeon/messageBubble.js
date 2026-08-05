function showMessageBubble(PIXI, container, { x, y, text, durationMs = 3000 }) {
  const bubble = new PIXI.Container();
  const padding = 8;

  const label = new PIXI.Text(text, { fontSize: 14, fill: 0x222222 });
  label.x = padding;
  label.y = padding;

  const bg = new PIXI.Graphics();
  bg.beginFill(0xffffff, 0.95);
  bg.lineStyle(1, 0x333333, 1);
  bg.drawRoundedRect(0, 0, label.width + padding * 2, label.height + padding * 2, 8);
  bg.endFill();

  bubble.addChild(bg, label);
  bubble.x = x;
  bubble.y = y - bg.height - 12;
  container.addChild(bubble);

  setTimeout(() => {
    container.removeChild(bubble);
    bubble.destroy({ children: true });
  }, durationMs);

  return bubble;
}

module.exports = { showMessageBubble };
