function attachDragHandlers(pigeon) {
  const sprite = pigeon.sprite;
  sprite.eventMode = 'static';
  sprite.cursor = 'grab';

  let dragging = false;

  sprite.on('pointerdown', (event) => {
    if (event.button !== 0) return; // ignore right/middle click, only left starts a drag
    dragging = true;
    pigeon.startDrag();
  });

  sprite.on('globalpointermove', (event) => {
    if (!dragging) return;
    const pos = event.global;
    pigeon.x = pos.x;
    pigeon.y = pos.y;
    pigeon.clampToBounds();
    sprite.x = pigeon.x;
    sprite.y = pigeon.y;
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
