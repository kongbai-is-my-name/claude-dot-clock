# claude-dot-clock

Claude 桌面应用 **Code 标签页**的背景主题：一块蓝色圆点点阵时钟，画在像素风的天空上，天空随所选城市的实时天气变化。

A dot-matrix clock backdrop for the Code tab of the Claude desktop app, over a pixel-art sky that follows the live weather of a chosen city. The plugin is named `dot-glyph`.

## 画面内容

- **大时钟**：主城市的时:分，冒号闪烁，右下角是实时跳动的秒数
- **日期**：星期、日、月
- **两条进度点**：这一分钟过了多少秒、今天过了几个小时
- **天气与气温**：如 `CLOUDY 16C`
- **第二城市**：下方一行小字显示另一个城市的时间
- **天空随天气变化**：

  | 天气 | 画面 |
  | --- | --- |
  | 晴 | 白天像素太阳，夜里月亮和闪烁的星星 |
  | 多云 | 满天的云 |
  | 雨 / 雷暴 | 斜落的雨丝，雷暴时偶有闪电 |
  | 雪 | 缓慢飘落的雪点 |
  | 雾 | 横向漂移的雾带 |

## 安装

需要较新版本的 Claude 桌面应用（内置 Claude Code 2.1.325 或更新）。

**在桌面应用里：** 点输入框旁边的 **+**，选 **Plugins**，**Add marketplace** 填入 `kongbai-is-my-name/claude-dot-clock`，然后 **Add plugin** 添加 `dot-glyph`。

**在终端的 Claude Code 会话里：**

```
/plugin install dot-glyph --marketplace kongbai-is-my-name/claude-dot-clock
```

出现 `Add marketplace?` 时输入 `y`，然后选择安装范围（默认第一项 user 即可）。

**从命令行：**

```bash
claude plugin install dot-glyph --marketplace kongbai-is-my-name/claude-dot-clock
```

安装后，在 Code 标签页新开一个会话并**发送第一条消息**，背景就会出现。之后每个新会话都会自动显示，不需要输入命令。

## 命令

所有命令都在会话的消息输入框里输入（不是终端命令）。

| 命令 | 作用 |
| --- | --- |
| `/dot-glyph` 或 `/dot-glyph on` | 打开主题 |
| `/dot-glyph off` | 关闭主题，并记住关闭状态 |
| `/dot-glyph city <城市>` | 设置大时钟的城市，中文或英文名都可以，如 `合肥`、`tokyo`、`newyork`；会同时显示该城市的天气 |
| `/dot-glyph city local` | 大时钟改用本机时间（不显示天气） |
| `/dot-glyph city <标签> <时区>` | 自定义地点，如 `KYOTO Asia/Tokyo` 或 `HOME UTC+8`（自定义地点没有天气） |
| `/dot-glyph city2 <城市>` | 设置下方第二行的城市，写法同 `city` |
| `/dot-glyph city2 off` | 关闭第二行 |
| `/dot-glyph glass <0-100>` | 面板遮罩强度，数字越小背景越清楚，默认 0 |
| `/dot-glyph motion smooth` | 云和雨雪连续流畅地移动（默认） |
| `/dot-glyph motion light` | 云和雨雪一格一格地移动，更省系统资源 |

输入其他内容会显示用法说明。

**内置城市（23 个）：** 合肥、北京、上海、深圳、广州、杭州、成都、香港、台北、东京、首尔、新加坡、悉尼、伦敦、巴黎、柏林、纽约、多伦多、芝加哥、洛杉矶、旧金山、西雅图、温哥华。英文名不带空格输入，如 `losangeles`、`hongkong`。

**自定义标签**只能使用 A–Z、0–9、空格和 `-`，最多 16 个字符（点阵字库没有中文）。

**默认设置：** 大时钟为合肥，第二行为洛杉矶，遮罩 0，动画流畅。设置保存在本机，所有会话共用。

### 诊断命令

排查动画不播放时使用：

| 命令 | 作用 |
| --- | --- |
| `/dot-glyph probe` | 显示测试画面，A–H 八个方块各测试一种动画写法 |
| `/dot-glyph probe 2` | 同上，额外带“减少动态效果”规则 |
| `/dot-glyph probe scan` | 自动轮播 TEST 1–7，每张 10 秒，逐步减少画面内容，结束后自动回到时钟 |
| `/dot-glyph probe off` | 回到时钟 |

## 说明与限制

- **只在 Code 标签页显示。** Chat 标签页不经过 Claude Code，插件不会运行。终端版和 VS Code 里的 Claude Code 可以使用命令，但看不到背景。
- **新会话要先发一条消息**背景才会出现，这是桌面应用的行为。
- **同一时间只有一个主题生效。** 如果某个项目用其他主题插件（如 theme-examples 的 `/custom-theme`）设置过主题，两者会互相覆盖，在那个项目里关掉其中一个即可。
- **系统开启“减少动态效果”时**，画面静止。
- **背景每 30 分钟刷新一次**（更新日期、校准时间），刷新时会轻微闪一下。

## 网络与隐私

- 天气来自 [open-meteo.com](https://open-meteo.com)，每 15 分钟查询一次，请求中只包含主城市的经纬度。
- 天气响应自带的服务器时间用于校准时钟，不额外发送请求。
- 大时钟设为 `local` 或自定义地点时，不发送任何网络请求。
- 插件只在本机保存你的城市、遮罩和动画设置，不收集也不上传其他任何数据。

## 许可证

MIT
