// Deterministic resource-name isolation for the eight supplied adaptive icons.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function resources(destination) {
  for (const id of ['INTJ','ENTJ','INFJ','ENFJ','ISTJ','ESTJ','ISFJ','ESFJ']) {
    const name = id.toLowerCase(), source = path.join('assets/personas', id);
    const output = (dir, file, content) => {
      fs.mkdirSync(path.join(destination, dir), {recursive:true});
      fs.writeFileSync(path.join(destination, dir, file), content);
    };
    output('drawable-xxxhdpi', name + '_foreground.png', fs.readFileSync(path.join(source, 'android-foreground.png')));
    output('values', name + '.xml', fs.readFileSync(path.join(source, 'colors.xml'), 'utf8').replaceAll('j_app_background', name + '_background'));
    output('mipmap-anydpi-v26', 'icon_' + name + '.xml',
      '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/' + name + '_background"/><foreground android:drawable="@drawable/' + name + '_foreground"/></adaptive-icon>');
  }
};
