# 开发指引

## 模块职责

| 路径                              | 职责                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| src/model.mjs                     | 本地日期、四色状态、不可变操作物化、时间轴边界、重叠日程分栏  |
| src/store.mjs                     | Native协议、Git文件系统适配、操作日志读写与JSON导入           |
| src/sync.mjs                      | Git提交/拉取/合并/推送、同步锁、凭据回调和HTTP适配            |
| src/app.mjs                       | 日期导航、日程渲染、编辑表单、回收站/冲突/设置/帮助           |
| src/style.css                     | 两段式日期表与响应式样式                                      |
| desktop/main.cjs                  | Electron生命周期、受限文件IO、HTTPS代理、系统加密、文件导出   |
| desktop/preload.cjs               | 唯一受限Native IPC入口；renderer无Node权限                    |
| android/src/.../MainActivity.java | Android WebView宿主、Keystore、文件IO/HTTPS桥接、系统文件选择 |
| scripts/build.cjs                 | 共用前端bundle                                                |
| scripts/android.cjs               | Android资源/Java/dex/zip对齐/签名流程                         |
| tests/*.test.mjs                  | 纯模型测试及真正Git smart-HTTP模拟双设备测试                  |

修改业务规则先修改model并加测试，再改界面。新增Native方法要同时实现Windows/Android分支，严禁返回凭据或允许任意文件路径。界面通过textContent输出用户文本，不拼接用户HTML。WebView只允许本地页面导航，HTTPS请求只允许设置中的仓库主机，不跟随重定向。

## 数据协议 v1

1.2.0：`model.color(item,now)` 使用本地实时时钟，完成状态优先于日期/重要性/旧课程类型；未完成日程按结束时间、无时间TODO按日期判断过期。`planner-view.mjs` 的日程/待办卡片分别由独立勾选按钮与正文编辑按钮组成，禁止嵌套按钮；按日期提供“＋日程”独立行，不覆盖时间格内的晚间安排。

`src/exit.mjs` 是可注入依赖的双端退出状态机。`sync.hasPendingChanges` 不联网、不修改文件；检查Git工作区/索引，再比较HEAD与origin跟踪分支及祖先关系，因此启动时本地提交+pull并不等于已上传。成功push由Git引擎更新origin跟踪引用。退出冻结交互，等待表单重复保存、操作文件写入、导入和同步结束后检查，避免保存中途退出。上传失败可留在程序重试，也可再次确认后直接退出。读取状态失败不会默默假定已同步。

Windows `close` → preload退出事件 → 共享退出控制器 → Native `exit` 授权关闭；Android返回键/工具退出 → 同一控制器 → Activity.finish。`--exit-smoke-test` 仅使用临时目录、隐藏窗口、占位凭据和自动拒绝同步，在真实窗口关闭事件上验证提示与直接退出，绝不打开正式用户数据。系统强制结束进程/后台任务无法保证执行退出钩子，不做后台强制上传。

Android系统栏处理参考：[Android官方边到边布局指南](https://developer.android.com/develop/ui/views/layout/edge-to-edge)。原生容器将systemBars/displayCutout与IME边距分离处理，网页只使用已经避让的可用高度。

1.1.0 界面分层：`src/planner-view.mjs` 负责纯 DOM 视图（十五日日期条、七日/十五日时间表、手机单日卡片、TODO 与统计），`src/app.mjs` 负责选中日期、视图模式及操作回调。760px 以下自动使用单日，手动选择视图时尊重选择。时间表按可用高度分配自适应分段，并确保短日程的共同时间段足够可读，避免卡片重叠。手机的原生 `FrameLayout` 处理系统栏/刘海/键盘 insets，网页不再自行猜测状态栏高度。

界面开发验收：先 `npm run build`，启动 `node scripts/preview.cjs`，再运行 `node_modules/electron/dist/electron.exe scripts/ui-smoke.cjs`。预览仅在127.0.0.1监听，临时示例操作保存在内存，不连接真实仓库或用户目录。离屏 Chromium 检查1320/390/360px宽度、页面溢出、日程卡片、手机弹窗与菜单，截图保存在 `env/ui-1.1.0/`。`tests/ui.test.mjs` 同时检查双端自动布局、视图切换、翻页、TODO快速完成和原有CRUD。

1.0.1 修复说明：`src/item-form.mjs` 统一日程/无时间TODO表单语义；`src/browser-globals.mjs` 通过esbuild inject为Git库提供浏览器Buffer，不开启Electron Node权限。`tests/ui.test.mjs` 用隔离DOM模拟实际前端表单入口与保存分区，`tests/git.test.mjs` 在初始无Buffer的浏览器VM中执行真实构建bundle，避免Node测试环境掩盖浏览器缺少全局变量的问题。

每次编辑创建`repo/ops/<uuid>.json`，结构：`{id,itemId,parents,at,item,deleted}`。item包含title/date/start/end/location/notes/kind/done/important。删除是tombstone，不物理删除日志。parents是本次编辑所基于的所有活跃版本ID。

物化时按itemId分组，被其他操作parents引用的版本不是head。剩一个head是确定版本；多个head是并发冲突。列表选一个确定顺序的临时展示版本，但冲突界面保存所有heads；采用版本时创建新操作，以所有heads为parents。时间戳仅用于展示排序，不作为静默覆盖依据。

不同端写入不同UUID文件，Git通常不产生文本冲突；首次离线记录与已有仓库允许合并无公共祖先的历史。仓库URL和分支配置使用SHA256前24字符隔离本地目录，修改配置复制操作文件，不复制.git。同步锁阻止同步期间新保存/导入。未来如果做日志压缩必须保留因果关系，不能直接删除parents引用历史。

## Git异常

不强制推送、不reset、不自动丢弃冲突。网络、鉴权、push rejected、异常远端内容均向用户报告，保留本机操作。用户重试同步即可获取新的远端状态。Git本身的复杂合并失败交给用户处理，不能用覆盖数据兜底。远端请只用作本应用数据，勿加入与本应用同名日志文件。

## 发布检查

1. npm test：模型/颜色/日期和本地Git实联调。
2. npm run package:android：apksigner验证。
3. npm run package:win：免安装目录与ZIP。
4. `release/win-unpacked/J人小程序.exe --smoke-test`：独立临时数据、隐藏窗口启动、输出SMOKE_REPORT并退出。
5. 远程集成验收：另建专用私有测试仓库，确认双设备推送/拉取、并发修改与冲突解决。不要使用真实个人数据；结束后只清理明确由测试创建的内容。
6. 真机验收：安卓安装、离线新增、退出重开、备份恢复。当前机器未连接手机，此项尚未完成；APK构建和签名检查不等于真机功能验收。

所有依赖许可证随Windows运行时打包。APK同样使用isomorphic-git MIT及其传递依赖；不要删除许可。安卓签名私钥须安全备份并持续沿用。Windows暂未购置签名证书，不提供“已签名可信发布者”保证。
