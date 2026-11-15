/* سیستم بچ لوگو — افزونه‌ی نسخه ۳ (روی index.html نسخه‌ی ۲٫۰٫۰ لود می‌شود)
   ۱) چینش هوشمند با لنگر  ۲) ناحیه‌ی امن گرید ۳:۴  ۳) پردازش کم‌مصرف برای گوشی
   ۴) دانلود ZIP / تکی / اشتراک مستقیم (فقط موبایل)  ۵) UI فشرده‌تر و ریسپانسیو */
(function () {
'use strict';
const UA = navigator.userAgent;
const IOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MOBILE = IOS || /Android/i.test(UA);
const MAXPX = IOS ? 14e6 : 36e6;          // سقف پیکسل canvas (سافاری iOS حدود ۱۶٫۷ میلیون)
const CONF_LABEL = { high: 'دقت بالا', mid: 'دقت متوسط', low: 'دقت کم' };
const r4 = n => Math.round(n * 10000) / 10000;
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------- CSS ----------
const css = document.createElement('style');
css.textContent = `
:root{--radius:13px;--shadow:0 1px 2px rgba(15,31,26,.04),0 4px 14px rgba(15,31,26,.05)}
.panel{padding:14px;margin-bottom:12px}
main.shell{padding:16px 14px 40px}
.appbar-inner{padding:8px 14px}
button{padding:9px 16px;border-radius:10px}
.pcard{padding:10px 8px 9px;gap:6px;border-radius:12px}
.tile{padding:6px;border-radius:11px}
.step{padding:14px}
.issue.info{background:var(--info-bg);color:var(--info-fg);border-color:var(--info-bd)}
.badge.smart{background:var(--info-bg);color:var(--info-fg)}
.badge.smart.low{background:var(--warn-bg);color:var(--warn-fg)}
.tile>button.sm{width:100%}
.dl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px}
.smart-sug{font-size:13px;font-weight:600;margin:6px 0}
@media(max-width:759px){
 main.shell{padding:12px 12px 24px}
 .panel{padding:12px;border-radius:12px}
 .dl-bar,#reviewPanel .panel>.btn-row{position:sticky;bottom:0;z-index:20;background:var(--surface);
  margin:12px -12px -12px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--border-soft);border-radius:0 0 12px 12px}
 .dl-grid{grid-template-columns:1fr}
 .tiles{gap:8px}
}`;
document.head.appendChild(css);

// ---------- ناحیه‌ی امن: UI استوری + بریدگی گرید ۳:۴ ----------
function uiZones(r) {
  return Math.abs(Math.log(r / (9 / 16))) <= RATIO_TOLERANCE ? [{ x: 0, y: 0, w: 1, h: 0.14 }, { x: 0, y: 0.80, w: 1, h: 0.20 }] : [];
}
function gridZones(r) {
  if (r < 0.7 || r > 1.3) return [];
  if (r > 0.75) { const s = (1 - 0.75 / r) / 2; return [{ x: 0, y: 0, w: s, h: 1 }, { x: 1 - s, y: 0, w: s, h: 1 }]; }
  const s = (1 - r / 0.75) / 2;
  return [{ x: 0, y: 0, w: 1, h: s }, { x: 0, y: 1 - s, w: 1, h: s }];
}
window.safeZones = r => uiZones(r).concat(gridZones(r));
function overlapFrac(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / (a.w * a.h);
}
function avoid(x, y, lw, lh, w, h, gap) {
  uiZones(w / h).forEach(z => {
    if (!rectsOverlap({ x: x / w, y: y / h, w: lw / w, h: lh / h }, z)) return;
    if (z.y >= 0.5) y = Math.min(y, z.y * h - lh - gap); else y = Math.max(y, (z.y + z.h) * h + gap);
  });
  return { x, y };
}

// ---------- چینش هوشمند (لنگر) ----------
const SMART_MODES = ['hv', 'short', 'dim'];
const MODE_KEYS = { hv: ['mxS', 'myD'], short: ['mxS', 'myS'], dim: ['mxD', 'myD'] };
function anchorFeatures(o) {
  const ref = 1000, ratio = o.ratio;
  const w = ratio >= 1 ? ref * ratio : ref, h = ratio >= 1 ? ref : ref / ratio, short = Math.min(w, h);
  const lw = short * o.sizePct / 100, lh = lw * logoAspect();
  const x = o.xFrac * w, y = o.yFrac * h;
  const right = (x + lw / 2) > w / 2, bottom = (y + lh / 2) > h / 2;
  const mx = right ? w - (x + lw) : x, my = bottom ? h - (y + lh) : y;
  return { lr: Math.log(ratio), corner: (bottom ? 'b' : 't') + (right ? 'r' : 'l'), size: o.sizePct,
    mxS: mx / short * 100, myS: my / short * 100, mxD: mx / w * 100, myD: my / h * 100,
    tx: o.textOffXPct || 0, ty: o.textOffYPct || 0, rect: { x, y, lw }, w, h, short };
}
function lerpAt(list, lr, get) {
  if (list.length === 1 || lr <= list[0].lr) return get(list[0]);
  if (lr >= list[list.length - 1].lr) return get(list[list.length - 1]);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (lr >= a.lr && lr <= b.lr) { const t = b.lr === a.lr ? 0 : (lr - a.lr) / (b.lr - a.lr); return get(a) + (get(b) - get(a)) * t; }
  }
  return get(list[0]);
}
const unitPx = (key, pct, w, h, short) => key[2] === 'D' ? pct / 100 * (key[1] === 'x' ? w : h) : pct / 100 * short;
function placeFromList(list, w, h, mode, corner) {
  const lr = Math.log(w / h), short = Math.min(w, h), kx = MODE_KEYS[mode][0], ky = MODE_KEYS[mode][1];
  const size = lerpAt(list, lr, f => f.size);
  const mx = unitPx(kx, lerpAt(list, lr, f => f[kx]), w, h, short);
  const my = unitPx(ky, lerpAt(list, lr, f => f[ky]), w, h, short);
  const lw = short * size / 100, lh = lw * logoAspect();
  return { x: corner[1] === 'r' ? w - mx - lw : mx, y: corner[0] === 'b' ? h - my - lh : my, lw,
    tx: lerpAt(list, lr, f => f.tx), ty: lerpAt(list, lr, f => f.ty) };
}
function smartPredict(w, h, overrides) {
  const feats = (overrides || []).filter(o => isFinite(o.ratio) && isFinite(o.xFrac) && isFinite(o.yFrac) && isFinite(o.sizePct)).map(anchorFeatures);
  if (!feats.length) return null;
  const lr = Math.log(w / h);
  let nearest = feats[0];
  feats.forEach(f => { if (Math.abs(f.lr - lr) < Math.abs(nearest.lr - lr)) nearest = f; });
  const corner = nearest.corner;
  const group = feats.filter(f => f.corner === corner).sort((a, b) => a.lr - b.lr);
  let mode = 'hv', loo = 0;
  if (group.length >= 2) {            // leave-one-out برای انتخاب بهترین مدل
    let best = Infinity;
    SMART_MODES.forEach(m => {
      let err = 0;
      group.forEach((a, i) => {
        const p = placeFromList(group.filter((_, j) => j !== i), a.w, a.h, m, corner);
        err += (Math.abs(p.x - a.rect.x) + Math.abs(p.y - a.rect.y) + Math.abs(p.lw - a.rect.lw)) / a.short;
      });
      err /= group.length;
      if (err < best - 1e-9) { best = err; mode = m; }
    });
    loo = best;
  }
  const p = placeFromList(group, w, h, mode, corner);
  const dist = Math.abs(nearest.lr - lr);
  let level = dist <= 0.12 ? 2 : (dist <= 0.35 ? 1 : 0);
  if (group.length >= 3 && loo > 0.08) level = Math.max(0, level - 1);
  return { ...p, mode, loo, dist, conf: ['low', 'mid', 'high'][level], anchors: feats.length };
}
window.resolveConfig = function (w, h, rules) {
  const short = Math.min(w, h), d = rules.def;
  const base = { textScale: d.textScale, vignette: d.vignette };
  const o = nearestOverride(w / h, rules.overrides);
  if (o) return { ...base, logoX: Math.round(o.xFrac * w), logoY: Math.round(o.yFrac * h),
    logoWidth: Math.max(1, Math.round(short * o.sizePct / 100)),
    textOffsetX: Math.round(short * (o.textOffXPct || 0) / 100), textOffsetY: Math.round(short * (o.textOffYPct || 0) / 100), source: 'override' };
  const sp = smartPredict(w, h, rules.overrides);
  if (sp) return { ...base, logoX: Math.round(sp.x), logoY: Math.round(sp.y), logoWidth: Math.max(1, Math.round(sp.lw)),
    textOffsetX: Math.round(short * sp.tx / 100), textOffsetY: Math.round(short * sp.ty / 100), source: 'smart', conf: sp.conf, anchors: sp.anchors };
  const lw = Math.max(1, Math.round(short * d.sizePct / 100)), lh = Math.round(lw * logoAspect());
  const n = avoid(w - Math.round(short * d.marginXPct / 100) - lw, h - Math.round(short * d.marginYPct / 100) - lh, lw, lh, w, h, short * 0.015);
  return { ...base, logoX: Math.round(n.x), logoY: Math.round(n.y), logoWidth: lw, textOffsetX: 0, textOffsetY: 0, source: 'default' };
};

// ---------- کنترل کیفیت (بیرون‌زدگی جزئی مجاز؛ بریدگی گرید فقط اطلاع) ----------
window.runQC = function (item, cfg) {
  const issues = [], w = item.width, h = item.height, short = Math.min(w, h);
  if (cfg.hideLogo) return { issues: [{ lvl: 'warn', msg: 'برای این عکس لوگو حذف شده است (تنظیم دستی).' }], lvl: 'warn' };
  const lh = cfg.logoWidth * logoAspect();
  const vx = Math.max(0, Math.min(w, cfg.logoX + cfg.logoWidth) - Math.max(0, cfg.logoX));
  const vy = Math.max(0, Math.min(h, cfg.logoY + lh) - Math.max(0, cfg.logoY));
  if ((vx * vy) / (cfg.logoWidth * lh) < 0.5) issues.push({ lvl: 'warn', msg: 'بیش از نیمی از لوگو بیرون از قاب عکس افتاده است.' });
  if (short < 720) issues.push({ lvl: 'warn', msg: 'رزولوشن عکس پایین است (ضلع کوتاه‌تر کمتر از ۷۲۰ پیکسل).' });
  if (cfg.logoWidth < 80) issues.push({ lvl: 'warn', msg: 'لوگو روی این عکس خیلی کوچک می‌شود (کمتر از ۸۰ پیکسل عرض).' });
  if (cfg.source === 'default' && !isCommonRatio(w / h)) issues.push({ lvl: 'warn', msg: 'نسبت غیرمعمول است و ادمین برایش چینشی ثبت نکرده؛ چینش پیش‌فرض اعمال شده است.' });
  if (cfg.source === 'smart' && cfg.conf === 'low') issues.push({ lvl: 'warn', msg: 'چینش از روی ابعاد دورتر پیش‌بینی شده و دقتش کم است؛ اگر اشتباه بود «گزارش چینش اشتباه» را بزنید.' });
  const lr = { x: cfg.logoX / w, y: cfg.logoY / h, w: cfg.logoWidth / w, h: lh / h };
  if (uiZones(w / h).some(z => rectsOverlap(lr, z))) issues.push({ lvl: 'warn', msg: 'لوگو روی ناحیه‌ی دکمه‌ها و نوشته‌های استوری/ریلز می‌افتد (تقریبی).' });
  if (gridZones(w / h).some(z => overlapFrac(lr, z) > 0.15)) issues.push({ lvl: 'info', msg: 'روی گرید پروفایل اینستاگرام (۳:۴) بخشی از لوگو بریده می‌شود؛ در خود پست کامل دیده می‌شود.' });
  if (PROFILES[currentProfile].hasText && (batchText.title || batchText.date)) {
    const cw = Math.min(w, 500), c = document.createElement('canvas');
    c.width = cw; c.height = Math.round(cw * h / w);
    const sf = cw / w, m = drawComposite(c, item.img, cfg, sf, batchText);
    if (m) {
      if (m.shrinkFactor < 0.6) issues.push({ lvl: 'error', msg: 'متن برای جای موجود خیلی طولانی است و به‌شدت کوچک شده؛ متن را کوتاه‌تر کنید یا لوگو را کوچک‌تر بگیرید.' });
      else if (m.shrunk) issues.push({ lvl: 'warn', msg: 'متن برای جا شدن کنار لوگو کمی کوچک‌تر شده است.' });
      if (m.fontPx / sf < short * 0.016) issues.push({ lvl: 'warn', msg: 'اندازه‌ی متن نسبت به عکس ریز است و ممکن است خوانا نباشد.' });
    }
  }
  const lvl = issues.some(i => i.lvl === 'error') ? 'error' : (issues.some(i => i.lvl === 'warn') ? 'warn' : 'ok');
  return { issues, lvl };
};
window.issuesHTML = function (qc) {
  const bad = qc.issues.some(i => i.lvl !== 'info');
  return (bad ? '' : '<div class="issue ok">' + icon('check', 18) + '<span>مشکلی برای این عکس پیدا نشد.</span></div>') +
    qc.issues.map(i => '<div class="issue ' + i.lvl + '">' + icon(i.lvl === 'error' ? 'xcircle' : (i.lvl === 'info' ? 'info' : 'alert'), 18) + '<span>' + esc(i.msg) + '</span></div>').join('');
};
const _rs = window.renderSample;
window.renderSample = function () {
  _rs();
  const it = uploadedFiles[0];
  if (it && it.cfg.source === 'smart') $('sampleInfo').lastElementChild.textContent = 'پیش‌بینی هوشمند (' + CONF_LABEL[it.cfg.conf] + ')';
};
const _rm = window.renderModal;
window.renderModal = function () {
  _rm();
  const it = uploadedFiles[modalIdx];
  if (it && it.cfg.source === 'smart') $('mSub').textContent = $('mSub').textContent.replace('چینش پیش‌فرض', 'پیش‌بینی هوشمند');
};

// ---------- بارگذاری کم‌مصرف: پیش‌نمایش کوچک، عکس اصلی فقط موقع خروجی ----------
window.loadImageFromFile = function (file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img._url = url;
    img.onload = async () => { try { if (img.decode) await img.decode(); } catch (e) {} res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('خواندن فایل تصویر ناموفق بود: ' + file.name)); };
    img.src = url;
  });
};
function makePreview(full) {
  const w = full.naturalWidth, h = full.naturalHeight, s = Math.min(1, 1600 / Math.max(w, h));
  if (s >= 1) return Promise.resolve(full);
  return new Promise(res => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, 0, c.width, c.height);
    c.toBlob(b => {
      c.width = c.height = 0;
      if (!b) return res(full);
      const p = new Image(), u = URL.createObjectURL(b);
      p.onload = () => { URL.revokeObjectURL(full._url); res(p); };
      p.onerror = () => res(full);
      p.src = u;
    }, 'image/jpeg', 0.9);
  });
}
let outCache = null, shareIdx = 0;
window.handleFileList = async function (fileList) {
  const files = Array.from(fileList).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  if (!files.length) { toast('فایل تصویری پیدا نشد.'); return; }
  uploadedFiles = []; sampleConfirmed = false; reviewFilter = 'all'; outCache = null;
  const wrap = $('loadWrap'), bar = $('loadBar');
  wrap.style.display = 'block'; bar.style.width = '0%';
  for (let i = 0; i < files.length; i++) {
    try {
      const full = await loadImageFromFile(files[i]);
      const w = full.naturalWidth, h = full.naturalHeight, prev = await makePreview(full);
      uploadedFiles.push({ file: files[i], img: prev, width: w, height: h, tweak: null, ack: false, cfg: null, qc: null });
    } catch (err) { console.error(err); }
    bar.style.width = Math.round((i + 1) / files.length * 100) + '%';
    $('loadLabel').textContent = toFa(i + 1) + ' از ' + toFa(files.length);
    await tick();
  }
  $('fileInput').value = '';
  if (!uploadedFiles.length) { wrap.style.display = 'none'; toast('خواندن عکس‌ها ناموفق بود.'); return; }
  recomputeAll();
  setTimeout(() => { wrap.style.display = 'none'; goStep(2); }, 250);
};

// ---------- خروجی: ZIP / تکی / اشتراک (فقط موبایل) ----------
async function renderOutputs(prog) {
  if (outCache && outCache.length === uploadedFiles.length) return outCache;
  const out = [];
  for (let i = 0; i < uploadedFiles.length; i++) {
    const it = uploadedFiles[i];
    let full = it.img, own = false;
    try { full = await loadImageFromFile(it.file); own = true; } catch (e) {}
    const s = Math.min(1, Math.sqrt(MAXPX / (it.width * it.height)));
    const c = document.createElement('canvas');
    c.width = Math.round(it.width * s); c.height = Math.round(it.height * s);
    c.getContext('2d').imageSmoothingQuality = 'high';
    drawComposite(c, full, it.cfg, s, batchText);
    const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', 0.92));
    c.width = c.height = 0;
    if (own) { URL.revokeObjectURL(full._url); full.src = ''; }
    out.push({ name: 'output_' + (i + 1) + '_' + it.file.name.replace(/\.[^.]+$/, '') + '.jpg', blob });
    if (prog) prog((i + 1) / uploadedFiles.length);
    await tick();
  }
  outCache = out;
  return out;
}
function canShareFiles() {
  try { return MOBILE && navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }); }
  catch (e) { return false; }
}
function logOut() {
  const m = {};
  uploadedFiles.forEach(i => { const k = i.width + 'x' + i.height; m[k] = (m[k] || 0) + 1; });
  logDownload(uploadedFiles.length, m);
}
function guard() {
  const n = uploadedFiles.filter(i => i.qc.lvl === 'error' && !i.ack).length;
  return !n || confirm(toFa(n) + ' عکس هشدار قرمز دارد و بررسی نشده است. با همین وضعیت ادامه می‌دهید؟');
}
function busy(on) { document.querySelectorAll('#dlPanel .dl-grid button').forEach(b => { b.disabled = on; }); }
function setProg(p, phase) {
  $('dlProg').style.display = 'block';
  $('dlBar').style.width = (p * 100) + '%'; $('dlPct').textContent = toFa(Math.round(p * 100)) + '٪';
  if (phase) $('dlPhase').textContent = phase;
}
function doneMsg(txt) {
  $('dlMsg').innerHTML = '<div class="status ok">' + txt + '</div><div class="btn-row"><button onclick="resetBatch()">شروع دسته‌ی جدید</button></div>';
}
async function dlZip() {
  if (!guard()) return;
  busy(true);
  try {
    const out = await renderOutputs(p => setProg(p * 0.8, 'در حال ساخت عکس‌ها...'));
    const zip = new JSZip();
    out.forEach(o => zip.file(o.name, o.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, m => setProg(0.8 + m.percent / 500, 'در حال ساخت ZIP...'));
    saveBlob(blob, 'output.zip');
    setProg(1, 'تمام شد');
    doneMsg(toFa(out.length) + ' عکس ساخته شد.'); logOut();
  } catch (err) { setStatus('dlMsg', 'err', 'خطا: ' + err.message); }
  busy(false);
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
async function dlEach() {
  if (!guard()) return;
  busy(true);
  try {
    const out = await renderOutputs(p => setProg(p * 0.6, 'در حال ساخت عکس‌ها...'));
    for (let i = 0; i < out.length; i++) {
      saveBlob(out[i].blob, out[i].name);
      setProg(0.6 + 0.4 * (i + 1) / out.length, 'در حال دانلود...');
      await new Promise(r => setTimeout(r, 450));
    }
    doneMsg(toFa(out.length) + ' عکس دانلود شد. اگر مرورگر پرسید، دانلود چندفایلی را اجازه بدهید.'); logOut();
  } catch (err) { setStatus('dlMsg', 'err', 'خطا: ' + err.message); }
  busy(false);
}
async function shareNext() {
  if (!guard()) return;
  const btn = $('dlShare'), CH = 10;
  busy(true);
  try {
    const out = await renderOutputs(p => setProg(p, 'در حال آماده‌سازی...'));
    const files = out.slice(shareIdx * CH, shareIdx * CH + CH).map(o => new File([o.blob], o.name, { type: 'image/jpeg' }));
    const parts = Math.ceil(out.length / CH);
    if (!navigator.canShare({ files })) { setStatus('dlMsg', 'warn', 'مرورگر این تعداد/حجم را قبول نکرد. از دانلود تکی یا ZIP استفاده کنید.'); busy(false); return; }
    try {
      await navigator.share({ files });
      shareIdx++;
      if (shareIdx >= parts) { doneMsg('اشتراک‌گذاری انجام شد.'); logOut(); shareIdx = 0; }
      else setStatus('dlMsg', 'info', 'دسته‌ی ' + toFa(shareIdx) + ' از ' + toFa(parts) + ' فرستاده شد؛ برای ادامه دوباره بزنید.');
    } catch (e) {
      if (e.name === 'NotAllowedError') setStatus('dlMsg', 'info', 'عکس‌ها آماده شد؛ یک بار دیگر دکمه‌ی اشتراک را بزنید.');
      else if (e.name !== 'AbortError') setStatus('dlMsg', 'err', 'اشتراک‌گذاری ناموفق بود: ' + e.message);
    }
    btn.textContent = 'اشتراک مستقیم' + (parts > 1 ? ' (' + toFa(Math.min(shareIdx + 1, parts)) + '/' + toFa(parts) + ')' : '');
  } catch (err) { setStatus('dlMsg', 'err', 'خطا: ' + err.message); }
  busy(false);
}
window.renderStep3 = function () {
  outCache = null; shareIdx = 0;
  const items = uploadedFiles, c = { ok: 0, warn: 0, error: 0 };
  items.forEach(i => { c[i.qc.lvl]++; });
  const unack = items.filter(i => i.qc.lvl === 'error' && !i.ack).length;
  $('dlPanel').innerHTML =
    '<h2 class="ptitle">دانلود</h2><p class="psub">خروجی‌ها JPG هستند. روی iOS عکس‌های بسیار بزرگ برای جلوگیری از بسته شدن مرورگر کمی کوچک‌تر می‌شوند.</p>' +
    '<div class="stat-row"><div class="stat">' + statB(items.length) + '<span>تعداد عکس</span></div><div class="stat">' + statB(c.ok) + '<span>بدون مشکل</span></div>' +
    '<div class="stat">' + statB(c.warn) + '<span>هشدار</span></div><div class="stat">' + statB(c.error) + '<span>نیازمند بررسی</span></div></div>' +
    (unack ? '<div class="status err">' + toFa(unack) + ' عکس هشدار قرمز دارد و هنوز تایید نشده است.</div>' : '') +
    '<div id="dlProg" style="display:none;margin-top:14px;"><div class="progress"><i id="dlBar"></i></div><div class="prog-label"><span id="dlPhase"></span><span id="dlPct"></span></div></div>' +
    '<div id="dlMsg"></div>' +
    '<div class="dl-bar btn-row"><div class="dl-grid" style="width:100%;margin:0;">' +
      '<button id="dlZip">' + icon('download', 16) + ' دانلود ZIP</button>' +
      '<button class="secondary" id="dlEach">' + icon('download', 16) + ' دانلود تکی (بدون ZIP)</button>' +
      (canShareFiles() ? '<button class="secondary" id="dlShare">' + icon('upload', 16) + ' اشتراک مستقیم</button>' : '') +
    '</div><button class="secondary block" onclick="goStep(2)">بازگشت به بررسی</button></div>';
  $('dlZip').onclick = dlZip; $('dlEach').onclick = dlEach;
  if ($('dlShare')) $('dlShare').onclick = shareNext;
  animateCounts($('dlPanel'));
};
const _rb = window.resetBatch;
window.resetBatch = function () { outCache = null; _rb(); };

// ---------- ادمین: پنل هوشمند، تایید پیش‌بینی، پیشنهاد اپراتور ----------
function ensureSmartPanel() {
  if ($('smartStep')) return;
  const sec = $('adm-rules'), d = document.createElement('div');
  d.className = 'step'; d.id = 'smartStep';
  d.innerHTML = '<div class="step-head"><span class="step-num">★</span><span class="step-title">چینش هوشمند (یادگیری از ابعاد ثبت‌شده)</span></div>' +
    '<div class="canvas-hint" style="text-align:right;margin:0 0 10px;">دو سه ابعاد اصلی (مثلاً ۱:۱، ۹:۱۶، ۱۶:۹) را ثبت کنید؛ بقیه پیش‌بینی می‌شوند. هر پیش‌بینی را «تایید» کنید تا خودش لنگر شود.</div>' +
    '<div class="chips" id="smartChips"></div><div class="smart-sug" id="smartSuggest"></div>' +
    '<div class="btn-row"><button id="smartConfirmAll">تایید همه‌ی پیش‌بینی‌ها</button></div><div id="smartStatus"></div>';
  sec.insertBefore(d, sec.children[1]);
  $('smartConfirmAll').onclick = confirmAllSmart;
}
function renderSmart() {
  ensureSmartPanel();
  const an = getRules(currentProfile).overrides, rules = adminRules();
  const cov = COMMON_RATIOS.filter(([a, b]) => nearestOverride(a / b, an)).length;
  const sm = adminImages.filter(it => resolveConfig(it.w, it.h, rules).source === 'smart').length;
  $('smartChips').innerHTML = '<span class="chip info">' + toFa(an.length) + ' لنگر</span><span class="chip">پوشش ' + toFa(cov) + ' از ' + toFa(COMMON_RATIOS.length) + '</span><span class="chip warn">' + toFa(sm) + ' پیش‌بینی منتظر تایید</span>';
  let sug = 'ابتدا ۱:۱ و ۹:۱۶ و ۱۶:۹ را ثبت کنید.';
  if (an.length) {
    let best = null, bd = 0.05;
    COMMON_RATIOS.forEach(([a, b]) => {
      if (nearestOverride(a / b, an)) return;
      const d = Math.min(...an.map(o => Math.abs(Math.log(a / b / o.ratio))));
      if (d > bd) { bd = d; best = a / b; }
    });
    sug = best ? 'ثبت بعدیِ مفید: نسبت ' + ratioLabel(best) : 'همه‌ی نسبت‌های رایج پوشش داده شده‌اند.';
  }
  $('smartSuggest').textContent = sug;
  $('smartConfirmAll').disabled = !sm;
}
function anchorOf(it, cfg) {
  const s = Math.min(it.w, it.h);
  return { v: 2, kind: 'ratio', ratio: it.ratio, xFrac: r4(cfg.logoX / it.w), yFrac: r4(cfg.logoY / it.h), sizePct: r4(cfg.logoWidth / s * 100),
    textOffXPct: r4(cfg.textOffsetX / s * 100), textOffYPct: r4(cfg.textOffsetY / s * 100) };
}
const postAnchor = (it, cfg, n) => postToSheet({ action: 'save', id: 'p_' + (Date.now() + n), profile: currentProfile, presetName: it.w + 'x' + it.h, width: it.w, height: it.h, config: anchorOf(it, cfg) });
async function confirmSmart(i) {
  const it = adminImages[i];
  setStatus('smartStatus', 'info', 'در حال ثبت...');
  try {
    const r = await postAnchor(it, resolveConfig(it.w, it.h, adminRules()), 0);
    if (r.success) { await fetchPresets(currentProfile); setStatus('smartStatus', 'ok', 'تایید شد و به لنگرها اضافه شد.'); }
    else setStatus('smartStatus', 'warn', 'خطا: ' + (r.error || ''));
  } catch (e) { setStatus('smartStatus', 'warn', 'خطا: ' + e.message); }
}
async function confirmAllSmart() {
  const rules = adminRules(), seen = {}, jobs = [];
  adminImages.forEach(it => {
    const cfg = resolveConfig(it.w, it.h, rules), k = Math.round(it.ratio * 1000);
    if (cfg.source === 'smart' && !seen[k]) { seen[k] = 1; jobs.push([it, cfg]); }
  });
  if (!jobs.length) return;
  setStatus('smartStatus', 'info', 'در حال ثبت ' + toFa(jobs.length) + ' مورد...');
  try {
    for (let i = 0; i < jobs.length; i++) await postAnchor(jobs[i][0], jobs[i][1], i);
    await fetchPresets(currentProfile);
    setStatus('smartStatus', 'ok', toFa(jobs.length) + ' پیش‌بینی تایید شد.');
  } catch (e) { setStatus('smartStatus', 'warn', 'خطا: ' + e.message); }
}
window.renderAdminGrid = function () {
  const holder = $('adminGrid');
  holder.innerHTML = '';
  if (!adminImages.length) { holder.innerHTML = '<div class="status info">تصویر تستی وجود ندارد.</div>'; return; }
  const rules = adminRules(), safe = $('admSafe').checked, grid = document.createElement('div');
  grid.className = 'tiles';
  adminImages.forEach((it, i) => {
    const cfg = resolveConfig(it.w, it.h, rules), tile = document.createElement('div');
    tile.className = 'tile' + (i === adminSel ? ' sel' : '');
    tile.onclick = () => selectAdmin(i);
    const c = document.createElement('canvas');
    c.width = 220; c.height = Math.round(220 * it.h / it.w);
    drawComposite(c, it.img, cfg, c.width / it.w, DEMO_TEXT);
    if (safe) drawSafeOverlay(c.getContext('2d'), c.width, c.height, it.w / it.h);
    const badge = cfg.source === 'override' ? '<span class="badge ovr">اصلاح‌شده</span>'
      : cfg.source === 'smart' ? '<span class="badge smart ' + (cfg.conf === 'low' ? 'low' : '') + '">هوشمند · ' + CONF_LABEL[cfg.conf] + '</span>' : '<span class="badge">پیش‌فرض</span>';
    const meta = document.createElement('div');
    meta.className = 'tile-meta';
    meta.innerHTML = '<span dir="ltr">' + esc(it.label) + '</span>' + badge;
    tile.appendChild(c); tile.appendChild(meta);
    if (cfg.source === 'smart') {
      const b = document.createElement('button');
      b.className = 'secondary sm'; b.textContent = 'تایید';
      b.onclick = e => { e.stopPropagation(); confirmSmart(i); };
      tile.appendChild(b);
    }
    grid.appendChild(tile);
  });
  holder.appendChild(grid);
};
window.renderAdmin = function () {
  ensureSmartPanel();
  renderAdminGrid();
  if (adminSel >= 0 && ed) redrawEditor();
  renderSmart();
};
window.reportBad = async function (w, h, btn) {
  const it = uploadedFiles[modalIdx], t = it && it.tweak && !it.tweak.noLogo ? it.tweak : null;
  btn.disabled = true; btn.textContent = 'در حال ارسال...';
  const config = { v: 2, kind: 'report', ratio: w / h, w, h };
  if (t) config.proposal = { xFrac: r4(t.xFrac), yFrac: r4(t.yFrac), sizePct: r4(t.sizePct), textOffXPct: r4(t.textOffXPct || 0), textOffYPct: r4(t.textOffYPct || 0) };
  const r = await postQueued({ action: 'save', id: 'p_' + Date.now(), profile: currentProfile, presetName: 'report', width: w, height: h, config });
  if (r === 'ok') btn.innerHTML = icon('check', 16) + (t ? ' گزارش و پیشنهاد ارسال شد' : ' گزارش شد');
  else if (r === 'queued') btn.innerHTML = icon('clock', 16) + ' در صف ارسال';
  else { btn.innerHTML = icon('alert', 16) + ' ارسال نشد'; btn.disabled = false; }
};
window.renderReportsList = function () {
  const holder = $('reportsList'), reports = getRules(currentProfile).reports;
  renderAdminNav();
  if (!reports.length) { holder.innerHTML = '<div class="status ok" style="margin-top:0;">گزارشی برای این پروفایل وجود ندارد.</div>'; return; }
  holder.innerHTML = '';
  const tbl = document.createElement('table'), tb = document.createElement('tbody');
  tbl.className = 'tbl';
  tbl.innerHTML = '<thead><tr><th>ابعاد</th><th>نسبت</th><th>زمان</th><th></th></tr></thead>';
  reports.slice().sort((a, b) => b.ts - a.ts).forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + toFa(r.w) + '×' + toFa(r.h) + (r.proposal ? ' <span class="badge smart">پیشنهاد اپراتور</span>' : '') + '</td><td>' + ratioLabel(r.ratio) + '</td><td>' + (r.ts > 1e12 ? fmtDateTime(r.ts) : '—') + '</td><td></td>';
    const b = document.createElement('button');
    b.className = 'secondary sm'; b.textContent = r.proposal ? 'دیدن پیشنهاد' : 'باز کردن برای اصلاح';
    b.onclick = () => addReportTile(r.w, r.h, r.proposal);
    tr.lastChild.appendChild(b); tb.appendChild(tr);
  });
  tbl.appendChild(tb); holder.appendChild(tbl);
};
window.addReportTile = async function (w, h, p) {
  const it = await makeSyntheticImage(w, h);
  it.label = w + '×' + h; it.synthetic = false;
  adminImages.unshift(it);
  showAdminSection('rules');
  selectAdmin(0);
  if (p && isFinite(p.xFrac) && isFinite(p.yFrac)) {
    ed = { xFrac: p.xFrac, yFrac: p.yFrac, sizePct: p.sizePct, textOffXPct: p.textOffXPct || 0, textOffYPct: p.textOffYPct || 0 };
    $('edSize').value = ed.sizePct; $('edTxtX').value = ed.textOffXPct; $('edTxtY').value = ed.textOffYPct;
    redrawEditor();
    setStatus('edStatus', 'info', 'چینش پیشنهادی اپراتور بارگذاری شد؛ اگر درست است «ثبت» کنید.');
  }
};
window.addEventListener('load', () => { const b = $('mReport'); if (b) b.onclick = () => { const it = uploadedFiles[modalIdx]; if (it) reportBad(it.width, it.height, b); }; });
})();
