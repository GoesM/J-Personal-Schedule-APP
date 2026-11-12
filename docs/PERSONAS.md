# 个性化图标

工具栏 → 个性化图标 → 选择人物 → 保存。提供 INTJ、ENTJ、INFJ、ENFJ、ISTJ、ESTJ、ISFJ、ESFJ，默认 ISTJ。设置与 Git 仓库、访问令牌、事项备份互相独立，仅保存到本设备。

Windows：应用内及运行窗口图标即时更新。EXE 文件内置图标固定为 ISTJ；保存选择后，可回到此页面创建“J人小程序 · 个性化”桌面快捷方式。以后保存选择会更新这个快捷方式。图标副本保存在用户数据目录，升级后仍可使用；移动或升级解压目录后，重新创建快捷方式以更新启动路径。任务栏已固定的旧快捷方式可能保留缓存，需要取消固定后，从新快捷方式启动并重新固定。

Android：通过八个稳定命名的 activity-alias 切换启动图标，先启用目标再禁用其他入口，始终保留可用启动入口。不同桌面的刷新速度和快捷方式保留行为可能不同。升级请覆盖安装，保留应用数据和相同签名；以后版本不得移除或重命名这些 alias。Android 13 单色主题图标暂未提供。

## 维护

- `assets/personas/`：来自 J人形象设计/app-icons/*/schedule 的 PNG、自适应前景及多尺寸 ICO，附来源说明。
- `src/personas.mjs`：人物清单、表单和应用内图标。
- `desktop/personas.cjs`：appearance.json 持久化、窗口图标及受控桌面快捷方式。
- Android MainActivity：SharedPreferences 与 PackageManager 切换；Manifest 定义固定 alias。
- `scripts/persona-resources.cjs`：构建时生成隔离资源名，避免八套同名资源覆盖；Android 构建用 aapt2 compile/link 打包。

人物图像归属 16Personalities / NERIS Analytics Limited；资源来源和使用说明随程序一同打包。此更新为本地自用交付，不包含对第三方素材的再授权。
