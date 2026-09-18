<div align="center">

# J人小程序

**把日程和 TODO 放在一起，把同步交给你自己的 Git 仓库。**

Windows · Android · 离线优先 · 无需自建服务器

[下载与使用](docs/USAGE.md) · [最新客户端](https://github.com/GoesM/J-Personal-Schedule-APP/releases/latest) · [开发指南](docs/DEVELOPMENT.md)

</div>

## 简单记录，自主同步

- **双端开箱即用**：Windows 解压运行，Android 安装 APK；客户端内置 Git 引擎，无需安装 Git、Node 或 Java。
- **多设备共享**：任意 Windows / Android 设备填写同一私有仓库和分支，即可同步日程与 TODO。
- **不用搭服务器**：使用支持 HTTPS Git 的托管服务，不需要额外部署应用后端。
- **离线也能用**：先保存在本机，联网后点击“与云端同步”；启动自动拉取，退出检查尚未上传的改动。
- **安排一目了然**：桌面七日视图、手机单日卡片，支持十五日总览、四色状态、快捷勾选、搜索、重复安排、备份与回收站。

## 隐私由你掌控

[查看界面预览（纯 Demo）](release/界面预览/demo/README.md) · [历史版本与回归记录](release/版本管理.md)

源码仓库是公开的，**你的日程应放在自己创建的私有数据仓库**，不要用本仓库同步个人事项。账户和访问令牌只在各设备本地加密保存，不随日程或备份上传；不需要把凭据交给项目作者。

Git 提供可追溯的历史与可控的同步，但**不是端到端加密**：仓库中的日程是明文，仓库管理员和托管服务商可能读取。

适合了解仓库、分支和访问令牌的用户；**需要一定 Git 使用基础，但无需手动敲 Git 命令**。配置与安全注意事项见 [使用教程](docs/USAGE.md)。

## 一起改进

欢迎 [提交 Issue](https://github.com/GoesM/J-Personal-Schedule-APP/issues) 和 PR：修复问题、优化体验、补充文档都很有帮助。贡献前请阅读 [开发指南](docs/DEVELOPMENT.md)；版本变化见 [更新记录](docs/CHANGELOG.md)。

## 支持开发

如果这个小工具帮到了你，欢迎打赏支持。完全自愿，不影响任何功能使用。谢谢！

<div align="center">
  <a href="docs/assets/donate-alipay.jpg"><img src="docs/assets/donate-alipay.jpg" alt="支付宝打赏二维码" width="260" /></a>
  <p><sub>支付宝扫一扫 · 点击图片可查看原图</sub></p>
</div>
