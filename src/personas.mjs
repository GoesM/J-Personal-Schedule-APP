export const personas = [
  ['INTJ', '建筑师'], ['ENTJ', '指挥官'], ['INFJ', '提倡者'], ['ENFJ', '主人公'],
  ['ISTJ', '物流师'], ['ESTJ', '总经理'], ['ISFJ', '守卫者'], ['ESFJ', '执政官'],
];
export function normalizePersona(value) {
  return personas.some(([id]) => id === value) ? value : 'ISTJ';
}
export function applyPersona(value) {
  const id = normalizePersona(value);
  const brand = document.querySelector('.brand-icon');
  const img = document.createElement('img');
  img.src = `personas/${id}/icon-256.png`;
  img.alt = `${id} 日程图标`;
  brand.replaceChildren(img);
}
export function personaPicker(value) {
  const grid = document.createElement('fieldset');
  grid.className = 'persona-picker';
  const legend = document.createElement('legend');
  legend.textContent = '选择你的 J 人形象';
  grid.append(legend);
  for (const [id, name] of personas) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'persona'; radio.value = id;
    radio.checked = id === normalizePersona(value);
    const img = document.createElement('img');
    img.src = `personas/${id}/icon-256.png`; img.alt = ''; img.width = 72; img.height = 72;
    const title = document.createElement('strong'); title.textContent = id;
    const subtitle = document.createElement('span'); subtitle.textContent = name;
    label.append(radio, img, title, subtitle); grid.append(label);
  }
  return grid;
}
