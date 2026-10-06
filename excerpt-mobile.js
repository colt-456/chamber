(function () {
  "use strict";
  const workspace = document.querySelector(".extract-workspace");
  const controls = document.querySelector(".controls");
  const handle = document.querySelector(".panel-resizer");
  const toggle = document.getElementById("panel-size-toggle");
  const mobile = matchMedia("(max-width: 760px)");
  const editable = 'textarea, input:not([type="checkbox"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"])';
  let preferred = 0.42, editing = false, expanded = false, editingHeight = 98, previewMode = false;
  let height = 98, drag = null, revealFrame = 0;
  function limits() {
    return { min: 98, max: Math.max(98, workspace.clientHeight - 230) };
  }
  function notify() {
    if (parent !== window)
      parent.postMessage({ type: "chamber:editing", active: mobile.matches && (editing || previewMode) }, location.origin);
  }
  function reveal() {
    cancelAnimationFrame(revealFrame);
    revealFrame = requestAnimationFrame(() => {
      const input = document.activeElement;
      if (!mobile.matches || !controls.contains(input) || !input.matches(editable)) return;
      const panel = input.closest(".panel");
      if (!panel) return;
      const field = input.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      if (field.top < bounds.top + 8) panel.scrollTop += field.top - bounds.top - 8;
      else if (field.bottom > bounds.bottom - 8)
        panel.scrollTop += Math.min(field.bottom - bounds.bottom + 8, field.top - bounds.top - 8);
    });
  }
  function layout() {
    if (!mobile.matches) {
      workspace.style.removeProperty("--mobile-preview-height");
      workspace.classList.remove("compact-preview", "mobile-editing");
      return;
    }
    const {min, max} = limits();
    height = Math.max(min, Math.min(max, editing ? editingHeight : expanded ? min : workspace.clientHeight * preferred));
    if (previewMode) height = workspace.clientHeight;
    workspace.style.setProperty("--mobile-preview-height", `${height}px`);
    workspace.classList.toggle("compact-preview", height < 140);
    workspace.classList.toggle("mobile-editing", editing);
    const amount = max === min ? 100 : Math.round(100 * (max - height) / (max - min));
    handle.setAttribute("aria-valuenow", amount);
    handle.setAttribute("aria-valuetext", `패널 확장 ${amount}%`);
    toggle.textContent = height <= min + 1 ? "복귀 ↓" : "확장 ↑";
    toggle.setAttribute("aria-label", height <= min + 1 ? "미리보기와 패널 높이 복귀" : "컨트롤 패널 최대 확장");
    reveal();
  }
  function move(next) {
    const {min, max} = limits();
    next = Math.max(min, Math.min(max, next));
    if (editing) editingHeight = next;
    else { expanded = false; preferred = next / workspace.clientHeight; }
    layout();
  }
  handle.addEventListener("pointerdown", (event) => {
    if (!mobile.matches || event.target.closest("button") || event.button !== 0) return;
    event.preventDefault();
    drag = { id: event.pointerId, y: event.clientY, height };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (drag?.id === event.pointerId) move(drag.height + event.clientY - drag.y);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    handle.addEventListener(name, () => { drag = null; });
  handle.addEventListener("keydown", (event) => {
    if (event.target !== handle) return;
    const values = {ArrowUp: height - 40, ArrowDown: height + 40, Home: limits().min, End: limits().max};
    if (!(event.key in values)) return;
    event.preventDefault();
    move(values[event.key]);
  });
  // Keep the input focused while dragging. Only the explicit return button dismisses it.
  toggle.addEventListener("pointerdown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    const restore = height <= limits().min + 1;
    if (restore && controls.contains(document.activeElement)) document.activeElement.blur();
    editing = false;
    expanded = !restore;
    notify();
    layout();
  });
  controls.addEventListener("focusin", (event) => {
    if (!mobile.matches || !event.target.matches(editable)) return;
    editing = true;
    editingHeight = 98;
    notify();
    layout();
  });
  controls.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      if (controls.contains(document.activeElement) && document.activeElement.matches(editable)) return;
      editing = false;
      notify();
      layout();
    });
  });
  mobile.addEventListener("change", () => { notify(); layout(); });
  document.addEventListener("excerpt:preview-edit", event => {
    previewMode = !!event.detail;
    workspace.classList.toggle("preview-direct-edit", previewMode);
    notify(); layout();
  });
  new ResizeObserver(layout).observe(workspace);
  layout();
})();
