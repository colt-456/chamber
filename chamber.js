"use strict";
function navigate() {
  const route = ["home", "profile", "excerpt"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "home";
  document.getElementById("home").hidden = route !== "home";
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
}
window.addEventListener("hashchange", navigate);
navigate();
