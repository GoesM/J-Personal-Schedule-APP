const fs = require('node:fs');
const path = require('node:path');
// Explicit walk works on the project's synced Windows folders as well as local disks.
module.exports = function copyTree(source, target) {
  fs.mkdirSync(target, {recursive:true});
  for (const entry of fs.readdirSync(source, {withFileTypes:true})) {
    const from=path.join(source,entry.name), to=path.join(target,entry.name);
    if (entry.isDirectory()) copyTree(from,to);
    else if (entry.isFile()) fs.copyFileSync(from,to);
    else throw Error('Unexpected resource link: ' + from);
  }
};
