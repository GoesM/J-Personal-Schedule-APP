# 纯 Demo 界面预览

这些图片重新由当前1.2.0界面离屏渲染生成。**所有标题、地点、备注、时间与状态均是虚构演示，不包含作者的真实日程、课程、仓库地址或凭据。**

演示时钟固定为2026-05-18 08:30，操作记录只保存在独立内存文件系统；渲染进程使用临时用户目录。没有读取真实 AppData / Android 数据，也没有连接日程仓库。截图中的“完成”操作仅修改临时 demo。

| 图片                                        | 展示                     |
| ------------------------------------------- | ------------------------ |
| [Windows](Windows.png)                      | 七日视图、侧栏与四色状态 |
| [Android](Android.png)                      | 手机单日卡片与 TODO      |
| [Android已完成日程](Android-已完成日程.png) | 快捷勾选后的完成状态     |
| [Android编辑](Android-编辑.png)             | 底部编辑弹窗             |
| [Android更多](Android-更多.png)             | 手机工具菜单             |

## Windows

![Windows Demo](Windows.png)

## Android

<img src="Android.png" alt="Android Demo" width="320" />

## 重现

在项目根目录运行 `npm run build` 和 `node scripts/preview.cjs`；另一个终端运行 `node_modules/electron/dist/electron.exe scripts/ui-smoke.cjs`。生成截图在 `env/ui-1.2.0/`。只有明确挑选、视觉检查后的 demo 图片复制到本目录；旧截图不会自动提交。

[返回首页](../../../README.md) · [版本管理](../../版本管理.md)
