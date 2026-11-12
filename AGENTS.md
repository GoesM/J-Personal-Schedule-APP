# 项目维护约定

正式名称为“J人日程APP”，保留原应用ID及 `j-personal-schedule` 数据目录，避免改名丢失原数据。

每次 Windows 发布使用 `npm run package:win`：打包成功后自动更新 `release/J人日程APP.lnk`。若手工打包，必须运行 `scripts/release-shortcut.ps1 -Version <版本>` 并验证目标路径，再交付和清理旧版本。

## 本地 Windows 发行物保留规则（用户要求）

- `release/` 内的 Windows `win-unpacked` 仅保留最新一个已验证可用版本。
- Windows ZIP 仅保留最新两个已验证可用版本，每版本只留一份，统一放在 `release/` 根目录；删除版本子目录内的重复 ZIP。
- 版本顺序按数字版本号比较，不按文件修改时间或字符串排序。
- 先完成新版本打包和验证，再清理旧版本。构建失败或验收未通过时，保留已有可用版本。
- 清理前核对绝对路径和文件内容；重复 ZIP 先核对 SHA256。优先移入回收站。若旧版正在运行或文件被占用，不终止用户程序，说明暂未完成的清理。
- 只清理发行物，不删除用户日程、配置、源码、签名密钥、开发环境或历史说明；不据此清理 Android APK 或远端 Release。
- 清理后更新 `release/SHA256.json` 和 `release/版本管理.md`，避免保留失效的本地下载链接。

当前保留状态以实际发行文件为准，不在此固定版本号。后续每次 Windows 发行维护均遵循本规则。

固定入口维护：release/J人日程APP.lnk 及其桌面副本均指向 release/launch-current.vbs，后者读取 current-version.txt。每次打包自动更新该文件、迁移桌面上属于本安装目录的旧快捷方式。不要恢复为带版本号的直接 EXE 路径；清理旧版时保留启动器、版本指针和 app.ico。

MBTI 选择按仓库＋分支同步，原生 appearance.json 仅为平台图标缓存。不得将令牌等鉴权配置写入 preferences。

快捷方式图标：保存、同步形象及启动时更新 release 和桌面上目标匹配本安装的所有 .lnk（包括改名副本）。按 MBTI 使用独立 ico 路径，不以覆盖同名 app.ico 作为刷新策略。仅更新图标属性，保留固定启动目标和参数；不得凭快捷方式名称覆盖其他程序。冒烟测试必须禁用真实快捷方式更新。
