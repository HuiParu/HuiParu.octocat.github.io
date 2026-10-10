/* ============================================================
   天津中考录取预测系统 · 界面逻辑
   ============================================================ */
(function () {
  'use strict';

  var D = window.ZK_DATA || {};
  var E = window.ZKEngine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var ICONS = {
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5"/>'
  };

  var DOCS = [
    { title: '天津中考规则简介', desc: '考试科目与分值、报名与报考资格、志愿填报、录取投档规则要点速览', file: 'assets/docs/rule.html', icon: 'book' },
    { title: '成绩预测程序说明', desc: '位次法预测模型的完整实现规格、算法流程与验收标准', file: 'assets/docs/spec.html', icon: 'code' },
    { title: '招生学校及可报范围总表', desc: '233 所高中 + 155 所中高职类学校，标注每所学校的可报区域', file: 'assets/docs/schools.html', icon: 'table' },
    { title: '历年一分一档表', desc: '2023–2026 年全市与市内六区累计人数对照表', file: 'assets/docs/rank.html', icon: 'chart' },
    { title: '录取分数线汇编', desc: '市内六区与非市内各区高中 2024–2026 年录取分数线', file: 'assets/docs/lines.html', icon: 'list' },
    { title: '中高职类学校招生计划', desc: '五年制、三二分段、中职等 155 所学校招生类别与专业', file: 'assets/docs/vocational.html', icon: 'cap' }
  ];

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, d) {
    if (v == null || v === '') return d == null ? '—' : d;
    return E.fmt(v);
  }
  function pct(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v < 1 ? v.toFixed(2) : v.toFixed(1)) + '%';
  }
  function scoreFmt(v) {
    if (v == null) return '—';
    return (Math.round(v * 100) / 100).toString();
  }

  /* ---------------- 表单初始化 ---------------- */
  function initSelects() {
    // 所在区
    var groups = {}, order = [];
    (D.districts || []).forEach(function (d) {
      if (!groups[d.group]) { groups[d.group] = []; order.push(d.group); }
      groups[d.group].push(d);
    });
    var html = order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">'
        + groups[g].map(function (d) {
          return '<option value="' + esc(d.key) + '">' + esc(d.label) + '</option>';
        }).join('')
        + '</optgroup>';
    }).join('');
    $('#fDistrict').innerHTML = html;

    // 考生类型
    $('#fType').innerHTML = E.TYPES.map(function (t) {
      return '<option value="' + esc(t.key) + '">' + esc(t.label) + '</option>';
    }).join('');

    // 年份
    var years = (D.rankYears || [2023, 2024, 2025, 2026]).slice().sort(function (a, b) { return b - a; });
    $('#fYear').innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === 2026 ? ' selected' : '') + '>' + y + ' 年中考</option>';
    }).join('');
  }

  function renderSubjects() {
    var subs = (D.meta && D.meta.subjects) || [];
    $('#subjectGrid').innerHTML = subs.map(function (s) {
      return '<div class="subject" data-wrap="' + esc(s.key) + '">'
        + '<div class="subject__top">'
        + '<span class="subject__name">' + esc(s.label) + '</span>'
        + '<span class="subject__full">满分 ' + s.full + '</span>'
        + '</div>'
        + '<div class="subject__input">'
        + '<input type="number" inputmode="decimal" step="0.5" min="0" max="' + s.full + '"'
        + ' placeholder="—" data-subject="' + esc(s.key) + '" aria-label="' + esc(s.label) + '得分">'
        + '<span class="subject__unit">分</span>'
        + '</div>'
        + '<div class="subject__bar"><i></i></div>'
        + '</div>';
    }).join('');

    $('#subjectHint').textContent = subs.map(function (s) {
      return s.label + ' ' + s.full;
    }).join(' · ') + '，合计 800 分' + (subs.some(function (s) { return s.hint; })
      ? '（' + subs.filter(function (s) { return s.hint; }).map(function (s) { return s.label + '：' + s.hint; }).join('；') + '）'
      : '');
  }

  function readScores() {
    var out = {};
    $$('#subjectGrid input[data-subject]').forEach(function (inp) {
      out[inp.getAttribute('data-subject')] = inp.value;
    });
    return out;
  }

  function updateTotal() {
    var subs = (D.meta && D.meta.subjects) || [];
    var total = 0;
    subs.forEach(function (s) {
      var inp = $('#subjectGrid input[data-subject="' + s.key + '"]');
      if (!inp) return;
      var v = parseFloat(inp.value);
      var wrap = $('.subject[data-wrap="' + s.key + '"]');
      var bar = wrap ? wrap.querySelector('.subject__bar i') : null;
      var illegal = isFinite(v) && (v < 0 || v > s.full);
      if (wrap) wrap.classList.toggle('is-error', illegal);
      if (isFinite(v)) {
        var clamped = Math.max(0, Math.min(s.full, v));
        total += clamped;
        if (bar) bar.style.width = (clamped / s.full * 100).toFixed(1) + '%';
      } else {
        if (bar) bar.style.width = '0%';
      }
    });
    total = Math.round(total * 100) / 100;
    $('#liveTotal').textContent = scoreFmt(total);
    $('#totalChip').classList.toggle('is-over', total > 800);
    return total;
  }

  function loadDemo() {
    var demo = { chinese: 105, math: 112, english: 108.5, physics: 88, chemistry: 92, politics: 94, history: 90, pe: 38 };
    $$('#subjectGrid input[data-subject]').forEach(function (inp) {
      var k = inp.getAttribute('data-subject');
      if (demo[k] != null) inp.value = demo[k];
    });
    if (!$('#fName').value) $('#fName').value = '张同学';
    updateTotal();
  }

  function resetForm() {
    $('#predictForm').reset();
    $$('#subjectGrid input[data-subject]').forEach(function (inp) { inp.value = ''; });
    $$('.subject').forEach(function (w) { w.classList.remove('is-error'); });
    $$('.subject__bar i').forEach(function (b) { b.style.width = '0%'; });
    updateTotal();
  }

  /* ---------------- 报告渲染 ---------------- */
  function renderHead(r) {
    var s = r.student;
    var tags = [
      '<span class="tag">' + esc(s.districtLabel) + '</span>',
      '<span class="tag">' + esc(s.typeLabel) + '</span>',
      '<span class="tag">' + esc(s.year) + ' 年中考</span>'
    ];
    if (r.ranks.level) tags.push('<span class="tag">' + esc(r.ranks.level.label) + '</span>');

    return '<div class="report-head">'
      + '<div class="report-head__top">'
      + '<div class="report-head__who">'
      + '<h2>' + esc(s.name) + ' · 升学定位报告</h2>'
      + '<p>基于 ' + esc(s.year) + ' 年一分一档表与录取分数线生成</p>'
      + '<div class="report-head__tags">' + tags.join('') + '</div>'
      + '</div>'
      + '<div class="report-head__score">'
      + '<div><span class="big">' + scoreFmt(s.total) + '</span><span class="unit">/ ' + s.full + '</span></div>'
      + '<div class="rate">得分率 ' + (s.rate * 100).toFixed(1) + '%</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  function renderWarnings(list) {
    if (!list || !list.length) return '';
    return list.map(function (w) {
      var cls = w.kind === 'risk' ? 'notice--risk' : (w.kind === 'warn' ? 'notice--warn' : 'notice--info');
      var icon = w.kind === 'info'
        ? '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/>'
        : '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>';
      return '<div class="notice ' + cls + '">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>'
        + '<div>' + esc(w.text) + '</div></div>';
    }).join('');
  }

  function renderStats(r) {
    var items = [];
    items.push({
      label: '全市位次',
      value: r.ranks.city != null ? num(r.ranks.city) : '—',
      unit: r.ranks.city != null ? '名' : '',
      foot: r.ranks.topPct != null
        ? ('位列全市前 ' + pct(r.ranks.topPct) + '（基数 ' + num(r.ranks.base) + ' 人）')
        : ('按 ' + r.student.year + ' 年一分一档换算'),
      accent: true
    });

    if (r.student.isSixArea) {
      items.push({
        label: '市内六区位次',
        value: r.ranks.six != null ? num(r.ranks.six) : '—',
        unit: r.ranks.six != null ? '名' : '',
        foot: '市内六区考生统一排名'
      });
    } else {
      items.push({
        label: r.student.districtLabel + '位次',
        value: r.ranks.district != null ? num(r.ranks.district) : '—',
        unit: r.ranks.district != null ? '名（估）' : '',
        foot: r.ranks.districtNote || '本区无一分一档表，无法估算',
        accent: r.ranks.district != null
      });
    }

    items.push({
      label: '可报院校池',
      value: num(r.counts.pool),
      unit: '所',
      foot: '按所在区可报范围筛选后的高中数量'
    });

    items.push({
      label: '匹配院校',
      value: num(r.counts.matched),
      unit: '所',
      foot: '冲 ' + r.counts.chong + ' · 稳 ' + r.counts.wen + ' · 保 ' + r.counts.bao
    });

    return '<div class="grid-stats">' + items.map(function (it) {
      return '<div class="stat' + (it.accent ? ' stat--accent' : '') + '">'
        + '<div class="stat__label">' + esc(it.label) + '</div>'
        + '<div class="stat__value">' + it.value + (it.unit ? '<small>' + esc(it.unit) + '</small>' : '') + '</div>'
        + '<div class="stat__foot">' + esc(it.foot) + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function renderVerdict(r) {
    var v = r.verdict;
    return '<div class="verdict">'
      + '<div class="verdict__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div>'
      + '<div class="verdict__body"><h4>' + esc(v.title) + '</h4><p>' + esc(v.body) + '</p></div>'
      + '</div>';
  }

  function renderDiagnosis(r) {
    var subs = r.student.subjects.slice().sort(function (a, b) { return b.value - a.value; });
    var bars = subs.map(function (s) {
      var cls = s.rate < 0.8 ? ' is-low' : (s.rate >= 0.96 ? ' is-high' : '');
      return '<div class="sbar">'
        + '<div class="sbar__name">' + esc(s.label) + '</div>'
        + '<div class="sbar__track"><i class="sbar__fill' + cls + '" style="width:' + (s.rate * 100).toFixed(1) + '%"></i></div>'
        + '<div class="sbar__val">' + scoreFmt(s.value) + '<em>/' + s.full + '</em></div>'
        + '</div>';
    }).join('');

    var notes = [];
    if (r.diagnosis.weakest.length) {
      notes.push('薄弱科目：' + r.diagnosis.weakest.map(function (s) {
        return s.label + '（得分率 ' + (s.rate * 100).toFixed(0) + '%，可提升空间 ' + scoreFmt(s.lost) + ' 分）';
      }).join('、'));
    }
    if (r.diagnosis.strongest.length) {
      notes.push('优势科目：' + r.diagnosis.strongest.map(function (s) {
        return s.label + '（得分率 ' + (s.rate * 100).toFixed(0) + '%）';
      }).join('、'));
    }

    return '<h3 class="block-title">学科诊断</h3>'
      + '<div class="subject-bars">' + bars + '</div>'
      + (notes.length ? '<p class="hint">' + notes.map(esc).join('<br>') + '</p>' : '');
  }

  function renderSchoolItem(sc) {
    var dCls = sc.delta >= 0 ? 'delta--up' : 'delta--near';
    var dTxt = (sc.delta >= 0 ? '+' : '') + scoreFmt(sc.delta);
    var meta = [];
    meta.push('录取线 <b>' + scoreFmt(sc.line) + '</b>' + (sc.lineTag !== String(r0Year) ? '（' + sc.lineTag + '）' : ''));
    if (sc.plan) meta.push('招生 <b>' + Math.round(sc.plan) + '</b> 人');
    if (sc.lineRank) meta.push('对应位次 <b>' + num(sc.lineRank) + '</b>');
    meta.push(esc(sc.scopeText));

    var sub = [];
    if (sc.stay) sub.push('住宿：' + esc(sc.stay));
    if (sc.addr) sub.push(esc(sc.addr));
    if (sc.tel) sub.push('电话：' + esc(sc.tel));

    var trend = [];
    if (sc.s2024 != null) trend.push('2024 ' + scoreFmt(sc.s2024));
    if (sc.s2025 != null) trend.push('2025 ' + scoreFmt(sc.s2025));
    if (sc.s2026 != null) trend.push('2026 ' + scoreFmt(sc.s2026));

    return '<div class="school">'
      + '<div class="school__row">'
      + '<div class="school__name">' + esc(sc.name) + '</div>'
      + '<div class="school__line"><strong>' + scoreFmt(sc.line) + '</strong><span>录取线</span></div>'
      + '</div>'
      + '<div class="school__meta">' + meta.join(' · ') + ' <span class="delta ' + dCls + '">分差 ' + dTxt + '</span></div>'
      + (trend.length > 1 ? '<div class="school__trend">历年录取线：' + trend.join(' → ') + '</div>' : '')
      + (sub.length ? '<div class="school__trend">' + sub.join(' · ') + '</div>' : '')
      + '</div>';
  }

  var r0Year = '2026';

  function renderTiers(r) {
    if (!r.canSenior) return renderVocationalNotice(r);

    var defs = [
      { key: 'chong', title: '冲刺院校', desc: '录取线略高于当前成绩，可作为第一志愿尝试', cls: 'tier--chong' },
      { key: 'wen', title: '稳妥院校', desc: '成绩高于录取线，录取把握较大', cls: 'tier--wen' },
      { key: 'bao', title: '保底院校', desc: '成绩明显高于录取线，用于守住升学底线', cls: 'tier--bao' }
    ];

    var body = defs.map(function (d) {
      var list = r.tiers[d.key] || [];
      if (!list.length) {
        return '<div class="tier ' + d.cls + '">'
          + '<div class="tier__head"><span class="tier__dot"></span>'
          + '<span class="tier__title">' + d.title + '</span>'
          + '<span class="tier__count">0 所</span></div>'
          + '<p class="hint">当前成绩在可报范围内没有匹配到该档位的院校。</p>'
          + '</div>';
      }
      return '<div class="tier ' + d.cls + '">'
        + '<div class="tier__head"><span class="tier__dot"></span>'
        + '<span class="tier__title">' + d.title + '</span>'
        + '<span class="tier__count">' + list.length + ' 所</span>'
        + '<span class="tier__desc">' + esc(d.desc) + '</span></div>'
        + '<div class="school-list">' + list.map(renderSchoolItem).join('') + '</div>'
        + '</div>';
    }).join('');

    return '<h3 class="block-title">可报院校建议</h3>'
      + '<p class="hint" style="margin-bottom:14px">分档依据为「考生总分 − 该校录取线」的差值：'
      + '冲刺 ' + E.thresholds.chongLo + '～' + E.thresholds.chongHi + ' 分 · '
      + '稳妥 ' + E.thresholds.wenLo + '～' + E.thresholds.wenHi + ' 分 · '
      + '保底 ' + E.thresholds.baoLo + '～' + E.thresholds.baoHi + ' 分。'
      + '已按所在区可报范围过滤。</p>'
      + body;
  }

  function renderVocationalNotice(r) {
    var list = (D.vocational || []).slice(0, 60);
    var rows = list.map(function (v) {
      var sec = String(v.section || '').replace(/^.*｜/, '');
      return '<tr><td>' + esc(v.name) + '</td><td>' + esc(sec || '—') + '</td>'
        + '<td>' + (v.majorCount != null ? Math.round(v.majorCount) : '—') + '</td>'
        + '<td>' + esc((v.majors || '').slice(0, 60)) + '</td></tr>';
    }).join('');

    return '<h3 class="block-title">可报考的中高职类学校</h3>'
      + '<p class="hint" style="margin-bottom:12px">共 ' + (D.vocational || []).length
      + ' 所学校（校·类别），以下展示前 60 所。完整名单请到「资料中心」查看。</p>'
      + '<details class="fold"><summary>展开中高职类学校清单（前 60 所）</summary>'
      + '<div class="fold__body"><div class="table-scroll"><table class="mini-table">'
      + '<thead><tr><th>学校名称</th><th>招生类别</th><th>专业数</th><th>主要专业</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div></div></details>';
  }

  function renderReport(r) {
    r0Year = r.student.year;
    var html = '<div class="card">'
      + renderHead(r)
      + '<div class="card__body">'
      + renderWarnings(r.warnings)
      + renderVerdict(r)
      + '<h3 class="block-title">排名定位</h3>'
      + renderStats(r)
      + (r.canSenior
        ? renderDiagnosis(r) + renderTiers(r)
        : renderTiers(r))
      + '<p class="hint" style="margin-top:18px">说明：位次由 ' + esc(r.student.year)
      + ' 年一分一档表换算；院校分档依据该年录取分数线与考生总分之差。'
      + '本报告为升学定位参考，不构成录取承诺。</p>'
      + '</div></div>';

    $('#result').innerHTML = html;
    var el = $('#result');
    if (el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    }
  }

  /* ---------------- 提交 ---------------- */
  function onSubmit(ev) {
    ev.preventDefault();
    var scores = readScores();
    var filled = Object.keys(scores).filter(function (k) { return scores[k] !== '' && scores[k] != null; });
    if (!filled.length) {
      alert('请至少填写一科成绩');
      return;
    }
    var res = E.predict({
      name: $('#fName').value,
      district: $('#fDistrict').value,
      type: $('#fType').value,
      year: $('#fYear').value,
      scores: scores
    });
    renderReport(res);
  }

  /* ---------------- 资料中心 ---------------- */
  function renderDocs() {
    $('#docGrid').innerHTML = DOCS.map(function (d, i) {
      return '<button type="button" class="doc-card" data-doc="' + i + '">'
        + '<span class="doc-card__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[d.icon] || ICONS.book) + '</svg></span>'
        + '<span class="doc-card__body"><h3>' + esc(d.title) + '</h3><p>' + esc(d.desc) + '</p></span>'
        + '<span class="doc-card__go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>'
        + '</button>';
    }).join('');

    $$('#docGrid .doc-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openDoc(DOCS[parseInt(btn.getAttribute('data-doc'), 10)]);
      });
    });
  }

  function renderDataStat() {
    var ranks = D.ranks || {};
    var years = Object.keys(ranks).sort();
    var box = [
      { n: (D.schools || []).length, l: '普通高中（含艺术类）' },
      { n: (D.vocational || []).length, l: '中高职类学校·类别' },
      { n: (D.lines || []).length, l: '录取分数线记录' },
      { n: years.length, l: '一分一档覆盖年份' }
    ];
    if (years.length) {
      var last = ranks[years[years.length - 1]];
      box.push({ n: last.length, l: years[years.length - 1] + ' 年分数档数量' });
      box.push({ n: E.fmt(last[last.length - 1].city), l: '≥' + last[last.length - 1].s + ' 分考生人数（全市）' });
    }
    $('#dataStat').innerHTML = box.map(function (b) {
      return '<div class="stat-box"><div class="stat-box__n">' + b.n + '</div><div class="stat-box__l">' + esc(b.l) + '</div></div>';
    }).join('');
  }

  /* ---------------- 文档弹层 ---------------- */
  var lastFocus = null;
  function openDoc(doc) {
    lastFocus = document.activeElement;
    $('#docModalTitle').textContent = doc.title;
    $('#docFrame').src = doc.file;
    $('#docOpenNew').href = doc.file;
    $('#docModal').hidden = false;
    document.body.style.overflow = 'hidden';
    var c = $('.modal__close');
    if (c) c.focus();
  }
  function closeDoc() {
    $('#docModal').hidden = true;
    $('#docFrame').src = 'about:blank';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------- 视图切换 ---------------- */
  function switchView(name) {
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-view') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.view').forEach(function (v) {
      var on = v.id === 'view-' + name;
      v.hidden = !on;
      v.classList.toggle('is-active', on);
    });
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initSelects();
    renderSubjects();
    updateTotal();
    renderDocs();
    renderDataStat();

    $('#predictForm').addEventListener('submit', onSubmit);
    $('#btnReset').addEventListener('click', resetForm);
    $('#btnDemo').addEventListener('click', loadDemo);
    $('#subjectGrid').addEventListener('input', updateTotal);

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchView(t.getAttribute('data-view')); });
    });

    $$('#docModal [data-close]').forEach(function (el) {
      el.addEventListener('click', closeDoc);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#docModal').hidden) closeDoc();
    });

    var hash = (location.hash || '').replace('#', '');
    if (hash === 'docs' || hash === 'predict') switchView(hash);

    // 演示模式：?demo=1 自动填充示例并生成报告
    if (/[?&]demo=1/.test(location.search)) {
      loadDemo();
      $('#predictForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
