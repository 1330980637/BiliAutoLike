# Bili Auto Like · B站自动点赞

在 B 站看**已关注 UP 主**的视频时自动点赞。基于 AutoX.js（无障碍读取界面、模拟点击），不需要 root、不需要电脑、不需要 ADB。

## 功能

- 打开已关注 UP 的视频页，1 秒内自动点赞（只点一次）
- 点赞后回读按钮状态确认（读 `checked`，不是靠数字猜）
- 同一视频按「BV 号 → UP+标题 → UP+按钮位置」三级去重
- 掉赞后进入 24 小时观察期，期间不补；到期自动解除，再看会重新点赞
- 合作视频：创作团队里出现过你「已关注」的 UP 就点赞
- 单实例锁：重复启动会自动停掉旧实例
- 启动时发一条常驻通知，日志写文件

## 环境

- Android 手机（本项目在华为 BRE-AL80 / Android 12 上开发）
- [AutoX.js](https://github.com/aiselp/AutoX) v7（需开启无障碍、存储权限）
- 手机亮屏 + B 站在前台时才会工作；AutoX 不能被清后台

## 使用

1. 安装 AutoX.js，开启无障碍和存储权限
2. 把 `bili-autolike.js` 放进手机任意英文路径，例如 `/sdcard/Download/DSH-Go/`
3. 在 AutoX 里打开该脚本并运行，看到「自动点赞 v6.6 已启动」和通知即生效
4. 想停：在 AutoX 的运行列表里停止脚本

使用该项目自己的安装包文件

## 可调参数

脚本顶部 `CONFIG`：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `USER_HOLD_MS` | 24 小时 | 掉赞后多久才允许重新点赞 |
| `FAIL_COOLDOWN_MS` | 5 分钟 | 点击后回读失败，该视频冷却多久 |
| `LOOP_FAST_MS` / `LOOP_IDLE_MS` | 400 / 1200 ms | 轮询间隔 |

状态保存在 `bili-autolike-state.json`，删掉即全部重置（含已关注 UP 记忆）。日志在 `bili-autolike.log`。

## 原理

- 点赞按钮：`tv.danmaku.bili:id/frame_like`，已赞时 `checked=true`
- 关注状态：`tv.danmaku.bili:id/follow` 的 desc 为「取消关注，按钮」，或页面出现「已关注」
- UP 名：`tv.danmaku.bili:id/author_name`；合作视频用 `tv.danmaku.bili:id/name`
- 所有节点通过 `classNameMatches(".*")` 一次性扫描取得（AutoX v7 的节点方法必须带 `this` 调用）

## 已知限制

- **BV 号读不到**：B 站界面节点不暴露 BV，AutoX v7 又禁了 Java 反射取 Activity intent，所以去重只能退回标题/坐标
- 标题没加载时去重键会退化成「UP+按钮位置」，同 UP 同版式下可能误判为同一视频
- 合作视频靠「记住的已关注 UP」匹配，没见过的 UP 不认识
- 首页推荐流没有点赞按钮，不会误点
- 用 AutoX 打包成独立 APK 时，在部分华为机型上会报「无效安装包」，建议用桌面快捷方式

## 风险提示

自动化点击违反 B 站用户协议的可能存在，账号有被风控的风险；本项目仅用于学习，请自行评估，账号异常与本项目无关。

PS这AI生成的，我这个傻白瓜只是提议者