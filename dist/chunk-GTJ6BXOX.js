// src/ui/utils/raf_resize_observer.js
function createRafResizeObserver(callback) {
  let scheduled = false;
  let latestEntries = [];
  return new ResizeObserver((entries) => {
    latestEntries = entries;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      callback(latestEntries);
    });
  });
}

export {
  createRafResizeObserver
};
//# sourceMappingURL=chunk-GTJ6BXOX.js.map
