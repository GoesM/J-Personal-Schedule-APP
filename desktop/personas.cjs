// Native icon cache. Repository preference operations are managed by the renderer.
const fs = require('node:fs/promises');
const path = require('node:path');
const ids = ['INTJ','ENTJ','INFJ','ENFJ','ISTJ','ESTJ','ISFJ','ESFJ'];
const normalize = id => ids.includes(id) ? id : 'ISTJ';
function createPersonas({root, app, shell, getWindow, executable = process.execPath, syncLinks = true}) {
  const config = path.join(root, 'appearance.json');
  const icon = id => path.join(__dirname, '../dist/personas', normalize(id), process.platform==='linux'?'icon-256.png':'app.ico');
  async function read() {
    try { return { persona: normalize(JSON.parse(await fs.readFile(config, 'utf8')).persona), platform: process.platform==='linux'?'linux':'windows' }; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      return {persona:'ISTJ', platform:process.platform==='linux'?'linux':'windows'}; }
  }
  const shortcutPath = () => path.join(app.getPath('desktop'), 'J人日程APP · 个性化.lnk');
  async function shortcut(create = false) {
    const target = shortcutPath();
    if (!create) {
      try { await fs.access(path.join(root, 'persona-shortcut-owned')); await fs.access(target); }
      catch { return; }
    } else {
      // Never overwrite an unrelated user's shortcut at the chosen name.
      try {
        await fs.access(target);
        await fs.access(path.join(root, 'persona-shortcut-owned'));
      } catch (e) {
        try { await fs.access(target); throw Error('同名快捷方式已存在，请先重命名后重试'); }
        catch (nested) { if (nested.code !== 'ENOENT') throw nested; }
      }
    }
    const {persona} = await read();
    const stable = path.join(root, 'icons', persona + '.ico');
    await fs.mkdir(path.dirname(stable), {recursive:true});
    await fs.copyFile(icon(persona), stable);
    const releaseRoot=path.resolve(path.dirname(executable),'../..');
    const launcher=path.join(releaseRoot,'launch-current.vbs');
    let stableLauncher=false;
    if(app.isPackaged) try { await fs.access(launcher); stableLauncher=true; } catch {}
    if (!shell.writeShortcutLink(target, 'create', {
      target: stableLauncher ? path.join(process.env.WINDIR,'System32/wscript.exe') : executable,
      args: stableLauncher ? '"'+launcher+'"' : app.isPackaged ? '' : '"' + app.getAppPath() + '"',
      cwd: stableLauncher ? releaseRoot : path.dirname(executable), icon: stable, iconIndex: 0,
      description: 'J人日程APP · ' + persona, appUserModelId: 'cn.goesm.jcalendar',
    })) throw Error('桌面快捷方式创建失败');
    await fs.writeFile(path.join(root, 'persona-shortcut-owned'), '1');
    return '已更新桌面快捷方式 · ' + persona;
  }
  async function refresh() {
    const {persona:id}=await read();
    getWindow()?.setIcon(icon(id));
    const warnings=[];
    if(syncLinks) try { await shortcut(); } catch(e) { warnings.push(e.message); }
    if(syncLinks && app.isPackaged && shell.readShortcutLink) {
      // Change IconLocation itself, not bytes behind a shared app.ico path.
      // This gives Explorer a distinct cache key for each MBTI selection.
      const stable=path.join(root,'icons',id+'.ico');
      await fs.mkdir(path.dirname(stable),{recursive:true});
      await fs.copyFile(icon(id),stable);
      const releaseRoot=path.resolve(path.dirname(executable),'../..');
      const launcher=path.join(releaseRoot,'launch-current.vbs');
      const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
      const directories=[app.getPath('desktop')];
      let hasLauncher=false;
      try { await fs.access(launcher); hasLauncher=true; directories.push(releaseRoot); } catch {}
      for(const dir of directories) {
        let names;
        try { names=await fs.readdir(dir); } catch(e) { warnings.push(e.message);continue; }
        for(const name of names.filter(n=>n.toLowerCase().endsWith('.lnk'))) {
          const filename=path.join(dir,name);
          try {
            const link=shell.readShortcutLink(filename);
            const ours=same(link.target,executable) || (hasLauncher &&
              path.basename(link.target).toLowerCase()==='wscript.exe' &&
              link.args?.trim().toLowerCase()===('"'+launcher+'"').toLowerCase());
            if(!ours) continue; // Match destination, never shortcut name alone.
            if(link.icon && same(link.icon,stable) && link.iconIndex===0) continue;
            if(!shell.writeShortcutLink(filename,'update',{icon:stable,iconIndex:0})) throw Error('快捷方式图标更新失败：'+name);
          } catch(e) { warnings.push(e.message); }
        }
      }
    }
    const shortcutWarning=warnings.join('；');
    return {...await read(), shortcutWarning};
  }
  async function save(id) {
    if (!ids.includes(id)) throw Error('未知人物图标');
    await fs.writeFile(config + '.tmp', JSON.stringify({persona:id}));
    await fs.rename(config + '.tmp', config);
    return refresh();
  }
  return {read, save, shortcut, icon, refresh};
}
module.exports = { createPersonas, normalize };
