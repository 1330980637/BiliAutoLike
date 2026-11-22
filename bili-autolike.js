// bili-autolike.js v6.2 —— 已关注 UP 的视频：一打开就点赞
//
// 规则（想改就改下面 CONFIG 里的数字）
// 1. 视频页出现（frame_like + UP 已关注 + 当前未赞）→ 立刻点赞
// 2. 点过赞的视频又变未赞（用户取消，或 B 站吞赞）→ 记 USER_HOLD_MS，期间不补
// 3. 记录到期自动删除，之后再打开该视频会重新点赞

const CONFIG = {
    USER_HOLD_MS: 24 * 60 * 60 * 1000,  // 掉赞后记录保留多久才允许重新点
    FAIL_COOLDOWN_MS: 5 * 60 * 1000,    // 点了但回读失败，冷却多久
    LOOP_FAST_MS: 400,
    LOOP_IDLE_MS: 1200
};

const PKG = "tv.danmaku.bili";
const DIR = "/sdcard/Download/DSH-Go/";
const LOG = DIR + "bili-autolike.log";
const STATE = DIR + "bili-autolike-state.json";
const LOCK = DIR + "bili-autolike.lock";

function nowT() { return new Date().toLocaleString(); }
function log(s) { try { files.append(LOG, "[" + nowT() + "] " + s + "\n"); } catch (e) { } }
function ts(t) { return new Date(t).toLocaleString(); }
function val(n, keys) {
    for (var i = 0; i < keys.length; i++) {
        try { var v = n[keys[i]]; if (typeof v === "function") v = v.call(n); if (v !== null && v !== undefined && String(v) !== "") return String(v); } catch (e) { }
    }
    return "";
}
function flag(n, k) { try { var v = n[k]; if (typeof v === "function") v = v.call(n); return !!v; } catch (e) { return false; } }

function loadState() {
    try { let s = files.read(STATE); if (s) return JSON.parse(s); } catch (e) { }
    return { videos: {} };
}
function saveState(st) { try { files.write(STATE, JSON.stringify(st)); } catch (e) { } }

function scan() {
    let r = { like: null, likeDesc: "", checked: false, followed: false, author: "", title: "", bv: "", toast: false, names: [] };
    let ns; try { ns = classNameMatches(".*").find(); } catch (e) { return r; }
    for (let i = 0; i < ns.length; i++) {
        let n = ns[i];
        let idv = val(n, ["id", "getId"]);
        let d = val(n, ["desc", "getDesc", "contentDescription"]);
        let t = val(n, ["text", "getText"]);
        if (!r.like && idv.indexOf("frame_like") >= 0) { r.like = n; r.checked = flag(n, "checked"); r.likeDesc = d; }
        if (d.indexOf("取消关注") >= 0) r.followed = true;
        if (t === "已关注") r.followed = true;
        if (!r.author && idv.indexOf("author_name") >= 0) r.author = t;
        if (idv.indexOf("/name") >= 0 && idv.indexOf("name_layout") < 0 && t.length >= 1 && t.length <= 40) r.names.push(t);
        if (!r.title && idv.indexOf("/title") >= 0 && t.length >= 2) {
            let b = null; try { b = n.bounds(); } catch (e) { }
            if (b && b.top > 800 && b.bottom < 1150) r.title = t;
        }
        if (t.indexOf("取消赞") >= 0) r.toast = true;
        if (!r.bv) {
            let m = (d + " " + t).match(/BV[0-9A-Za-z]{10}/);
            if (m) r.bv = m[0];
        }
        if (!r.title && idv.indexOf("/title") >= 0 && t.length >= 4 &&
            t.indexOf("播放") < 0 && t.indexOf("稍后再看") < 0 && t.indexOf("(") < 0) {
            r.title = t;
        }
    }
    return r;
}

function keyOf(s) {
    if (s.bv) return "BV:" + s.bv;
    if (s.names && s.names.length && s.title) return (s.names.join(",") + " | " + s.title).trim();
    if (s.author && s.title) return (s.author + " | " + s.title).trim();
    // 标题没加载出来时退回「UP 名 + 点赞按钮位置」，保证去重不断
    let geo = "";
    if (s.like) { try { let b = s.like.bounds(); geo = [b.left, b.top, b.right, b.bottom].join(","); } catch (e) { } }
    if (s.author) return "up | " + s.author + " @" + geo;
    return geo ? "geo | " + geo : "";
}

function holdKey(key, rec) {
    let old = rec || state.videos[key] || {};
    rec = { ok: true, last: old.last || Date.now(), relike: old.relike || 0, holdUntil: Date.now() + CONFIG.USER_HOLD_MS };
    state.videos[key] = rec; saveState(state);
    log("记为用户取消，保留到 " + ts(rec.holdUntil) + "：" + key);
}

if (!auto.service) { toast("无障碍没开"); exit(); }

// 停掉别的实例
try {
    let me = engines.myEngine(), meId = String(me.id || "");
    engines.all().forEach(function (e) {
        try {
            if (String(e.id || "") === meId) return;
            if (String(e.getSource() || "").indexOf("bili-autolike") >= 0) e.forceStop();
        } catch (x) { }
    });
} catch (e) { }

try {
    if (files.exists(LOCK)) {
        let hb = parseInt(files.read(LOCK) || "0", 10) || 0;
        if (Date.now() - hb < 8000) { toastLog("已经有自动点赞在运行了"); log("拒绝启动：已有实例"); exit(); }
    }
} catch (e) { }
function beat() { try { files.write(LOCK, String(Date.now())); } catch (e) { } }
beat();

try { files.write(LOG, ""); } catch (e) { }
let state = loadState();

// 清掉过期的「用户取消」记录
let purged = 0;
Object.keys(state.videos).forEach(function (k) {
    let v = state.videos[k];
    if (v && v.holdUntil && Date.now() >= v.holdUntil) { delete state.videos[k]; purged++; }
});
if (purged) saveState(state);

// 启动通知
function notifyStart() {
    try {
        importClass(android.app.NotificationManager);
        importClass(android.app.NotificationChannel);
        importClass(android.app.Notification);
        importClass(android.os.Build);
        let nm = context.getSystemService("notification");
        let chId = "bili_autolike";
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(chId, "B站自动点赞", NotificationManager.IMPORTANCE_LOW));
        }
        let n = new Notification.Builder(context, chId)
            .setContentTitle("B站自动点赞")
            .setContentText("已启动，正在等待视频")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .build();
        nm.notify(1001, n);
        return true;
    } catch (e) { return "ERR " + e; }
}

log("启动 v6.6，记录 " + Object.keys(state.videos).length + " 条，清理过期 " + purged + " 条");
toastLog("自动点赞 v6.6 已启动");
let nr = notifyStart();
log("通知：" + (nr === true ? "OK" : nr));

let lastClickAt = 0;
let lastDbgAt = 0;

while (true) {
    try {
        beat();
        if (currentPackage() != PKG) { sleep(CONFIG.LOOP_IDLE_MS); continue; }

        let s = scan();
        if (!s.like) { sleep(CONFIG.LOOP_FAST_MS); continue; }

        // 记录见过的「已关注」UP 名字（合作视频里靠它判断）
        if (!state.followedUps) state.followedUps = {};
        if (s.followed && s.author && !state.followedUps[s.author]) {
            state.followedUps[s.author] = Date.now(); saveState(state);
            log("记住已关注 UP：" + s.author);
        }
        // 合作视频：创作团队里有已关注的 UP 也算
        if (!s.followed && state.followedUps && s.names.length) {
            for (let i = 0; i < s.names.length; i++) {
                if (state.followedUps[s.names[i]]) { s.followed = true; log("合作视频命中已关注：" + s.names[i]); break; }
            }
        }
        if (!s.followed) {
            if (Date.now() - lastDbgAt > 20000) {
                lastDbgAt = Date.now();
                log("视频页但未判定已关注：author=" + s.author + " names=" + s.names.join("/") + " like=" + s.likeDesc);
            }
            sleep(CONFIG.LOOP_FAST_MS); continue;
        }

        let key = keyOf(s);
        let rec = key ? state.videos[key] : null;

        if (s.checked) {
            if (key && (!rec || !rec.ok || rec.holdUntil)) {
                state.videos[key] = { ok: true, last: (rec && rec.last) || Date.now(), relike: (rec && rec.relike) || 0 };
                saveState(state);
            }
            sleep(CONFIG.LOOP_FAST_MS); continue;
        }

        // 未赞
        if (rec && rec.holdUntil) {
            if (Date.now() < rec.holdUntil) { sleep(CONFIG.LOOP_FAST_MS); continue; }
            delete state.videos[key]; saveState(state); rec = null;   // 过期，允许重新点
            log("记录到期，恢复点赞：" + key);
        }
        if (rec && !rec.ok && Date.now() - (rec.last || 0) < CONFIG.FAIL_COOLDOWN_MS) { sleep(CONFIG.LOOP_FAST_MS); continue; }

        if (rec && rec.ok) {
            holdKey(key, rec);     // 点过赞又变未赞：记观察期，期间不补
            sleep(CONFIG.LOOP_FAST_MS); continue;
        }

        if (Date.now() - lastClickAt < 1200) { sleep(200); continue; }

        let clicked = false;
        try { clicked = s.like.click(); } catch (e) { }
        lastClickAt = Date.now();
        log("点击点赞：" + (key || s.likeDesc));
        sleep(1800);

        let s2 = scan();
        if (!s2.checked) { sleep(1200); s2 = scan(); }

        if (s2.checked) {
            let k2 = keyOf(s2) || key;
            if (k2) {
                state.videos[k2] = { ok: true, last: Date.now(), relike: rec ? rec.relike || 0 : 0 };
                saveState(state);
                log("点赞成功：" + k2);
                toast("已点赞");
            } else {
                log("点赞成功（标题未加载，下一轮补记）");
            }
        } else {
            log("点了但回读未赞，冷却 5 分钟");
            if (key) { state.videos[key] = { ok: false, last: Date.now(), relike: 0 }; saveState(state); }
        }
        sleep(CONFIG.LOOP_FAST_MS);
    } catch (e) {
        log("异常: " + e);
        sleep(1000);
    }
}
