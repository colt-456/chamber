"use strict";
function navigate() {
  const route = ["home", "profile", "excerpt"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "home";
  document.getElementById("home").hidden = route !== "home";
  document.body.dataset.route = route;
  if (route !== "excerpt") document.body.classList.remove("mobile-text-editing");
  for (const name of ["profile", "excerpt"]) {
    const view = document.getElementById(`${name}-view`);
    view.hidden = name !== route;
    const frame = view.querySelector("iframe");
    if (name === route && !frame.getAttribute("src"))
      frame.src = frame.dataset.src;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${route === "home" ? "CHAMBER" : route === "profile" ? "SYS.PROFILE" : "TXT.EXTRACT"} · @COLT`;
  window.scrollTo(0, 0);
  updateEditorViewport();
}
// Only the outer window sees the keyboard's visual viewport, not the iframe.
function updateEditorViewport() {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0;
  const height = viewport?.height || window.innerHeight;
  const header = document.querySelector(".topbar").getBoundingClientRect().height;
  document.body.style.setProperty("--visible-top", `${top}px`);
  document.body.style.setProperty("--editor-top", `${top + header}px`);
  document.body.style.setProperty("--editor-height", `${Math.max(1, height - header)}px`);
}
window.addEventListener("message", (event) => {
  const frame = document.querySelector("#excerpt-view iframe");
  if (event.origin !== location.origin || event.source !== frame.contentWindow ||
      event.data?.type !== "chamber:editing" || typeof event.data.active !== "boolean") return;
  document.body.classList.toggle("mobile-text-editing", event.data.active);
  updateEditorViewport();
});
window.visualViewport?.addEventListener("resize", updateEditorViewport);
window.visualViewport?.addEventListener("scroll", updateEditorViewport);
window.addEventListener("resize", updateEditorViewport);
window.addEventListener("hashchange", navigate);
navigate();
