// Editors always open inside CHAMBER's shared navigation shell.
(function () {
  "use strict";
  if (window.self !== window.top) return;
  const route = document.currentScript.dataset.route;
  if (!["profile", "excerpt"].includes(route)) return;
  const destination = new URL("./", window.location.href);
  destination.hash = route;
  window.location.replace(destination.href);
})();
