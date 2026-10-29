(() => {
  const workspace = document.querySelector('.workspace');
  const editor = document.querySelector('.editor');
  const stage = document.querySelector('.stage');
  const artboard = document.querySelector('.artboard');
  const handle = document.createElement('input');
  handle.type = 'range'; handle.min = '20'; handle.max = '75'; handle.value = '48';
  handle.className = 'profile-panel-size';
  handle.setAttribute('aria-label', '미리보기와 컨트롤 패널 높이 조절');
  editor.prepend(handle);
  handle.addEventListener('input', () => workspace.style.setProperty('--preview-height', handle.value + 'dvh'));
  const bar = document.createElement('div');
  bar.className = 'profile-zoom';
  let zoom = 1;
  function apply() {
    artboard.style.width = zoom === 1 ? '' : Math.round((stage.clientWidth - 24) * zoom) + 'px';
    artboard.style.maxWidth = zoom === 1 ? '' : 'none';
  }
  for (const [label, value] of [['−', -0.25], ['맞춤', 0], ['+', 0.25]]) {
    const button = document.createElement('button');
    button.textContent = label; button.type = 'button';
    button.setAttribute('aria-label', label === '+' ? '미리보기 확대' : label === '−' ? '미리보기 축소' : '화면에 맞춤');
    button.onclick = () => { zoom = value ? Math.max(1, Math.min(3, zoom + value)) : 1; apply(); };
    bar.append(button);
  }
  stage.before(bar);
  new ResizeObserver(apply).observe(stage);
})();
