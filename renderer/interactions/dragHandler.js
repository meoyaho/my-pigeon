function attachDragHandlers(pigeon) {
  const sprite = pigeon.sprite;
  sprite.eventMode = 'static';
  sprite.cursor = 'grab';

  let dragging = false;

  sprite.on('pointerdown', () => {
    dragging = true;
    pigeon.startDrag();
  });

  sprite.on('globalpointermove', (event) => {
    if (!dragging) return;
    const pos = event.global;
    pigeon.x = pos.x;
    pigeon.y = pos.y;
    sprite.x = pos.x;
    sprite.y = pos.y;
  });

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    pigeon.endDrag();
  };
  sprite.on('pointerup', stopDragging);
  sprite.on('pointerupoutside', stopDragging);
}

module.exports = { attachDragHandlers };
