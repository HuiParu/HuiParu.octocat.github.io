/* ============================================================
   天津中考录取预测引擎
   位次法（rank-based）：分数 → 位次 → 院校分档
   ============================================================ */
(function (global) {
  'use strict';

  var D = global.ZK_DATA || {};
  var SIX = D.sixCity || [];
  var BINHAI_SUB = ['塘沽', '汉沽', '大港', '泰达', '生态城', '油田', '保税区', '高新区'];
  var BINHAI = D.binhaiAll || BINHAI_SUB.concat(['滨海新区']);

  /* 分档阈值：Δ = 考生总分 − 院校录取线 */
  var T = {
    chongLo: -12, chongHi: 3,
    wenLo: 3, wenHi: 15,
    baoLo: 15, baoHi: 70,
    maxPerTier: 40
  };

  /* 考生类型 */
  var TYPES = [
    { key: 'local', label: '应届毕业生 · 本市户籍/蓝印', canSenior: true },
    { key: 'nonlocal', label: '应届毕业生 · 非本市户籍', canSenior: false },
    { key: 'past', label: '往届初中毕业生', canSenior: false }
  ];

  var FULL = (D.meta && D.meta.totalScore) || 800;

  function isSix(d) { return SIX.indexOf(d) >= 0; }
  function isBin(d) { return BINHAI.indexOf(d) >= 0; }
  function isBinSub(d) { return BINHAI_SUB.indexOf(d) >= 0; }

  /* ---------------- 位次查询（一分一档插值） ---------------- */
  function rankLookup(table, score, key) {
    if (!table || !table.length) return null;
    var n = table.length, top = table[0], bot = table[n - 1];

    // 高于最高档
    if (score >= top.s) {
      var base = top[key] || 0;
      if (score >= FULL) return { rank: 1, extrap: 'top' };
      var span = FULL - top.s;
      if (span <= 0) return { rank: Math.max(1, Math.round(base)), extrap: 'top' };
      return { rank: Math.max(1, Math.round(base * (FULL - score) / span)), extrap: 'top' };
    }
    // 低于最低档
    if (score < bot.s) {
      return { rank: bot[key] || 0, extrap: 'bottom' };
    }
    // 档位命中（分数向上取整到整数档）
    var s = Math.ceil(score);
    for (var i = 0; i < n; i++) {
      if (table[i].s === s) return { rank: table[i][key] || 0, exact: true };
    }
    // 线性插值兜底
    for (var j = 1; j < n; j++) {
      if (table[j].s < s && table[j - 1].s > s) {
        var hi = table[j - 1], lo = table[j];
        var t = (hi.s - s) / (hi.s - lo.s);
        return { rank: Math.round((hi[key] || 0) + ((lo[key] || 0) - (hi[key] || 0)) * t) };
      }
    }
    return { rank: bot[key] || 0 };
  }

  function scoreToRank(score, year) {
    var table = (D.ranks || {})[String(year)];
    if (!table) return null;
    var c = rankLookup(table, score, 'city');
    var s = rankLookup(table, score, 'six');
    var base = table[table.length - 1].city || 0;   // ≥最低档的人数
    return {
      city: c ? c.rank : null,
      six: s ? s.rank : null,
      base: base,
      extrap: c ? c.extrap : null
    };
  }

  /* ---------------- 本区排名估算（基于该区录取线点位） ---------------- */
  var _dptsCache = {};
  function districtRankPoints(district) {
    if (_dptsCache[district]) return _dptsCache[district];
    var pts = [];
    (D.lines || []).forEach(function (ln) {
      var entries = ln.entries || [], ranks = ln.ranks || [];
      entries.forEach(function (e, i) {
        if (e.score == null) return;
        var sc = (e.scope || '').trim();
        var match = false;
        if (sc === district) match = true;
        else if (!sc && !ln.isCity && ln.region === district) match = true;
        if (!match) return;

        var rk = null;
        for (var k = 0; k < ranks.length; k++) {
          if ((ranks[k].scope || '').trim() === sc) { rk = ranks[k]; break; }
        }
        if (!rk && ranks[i]) rk = ranks[i];
        if (!rk && ranks.length === 1) rk = ranks[0];
        if (!rk) return;
        pts.push({ score: e.score, rank: rk.low, name: ln.name });
      });
    });
    pts.sort(function (a, b) { return b.score - a.score; });
    // 清洗：保证位次随分数下降而单调不减
    var last = 0;
    pts.forEach(function (p) {
      if (p.rank < last) p.rank = last;
      last = p.rank;
    });
    // 去重（同分保留位次较大者）
    var out = [];
    pts.forEach(function (p) {
      if (!out.length || out[out.length - 1].score !== p.score) out.push(p);
    });
    _dptsCache[district] = out;
    return out;
  }

  function estimateDistrictRank(district, score) {
    var pts = districtRankPoints(district);
    if (pts.length < 2) return null;
    var top = pts[0], bot = pts[pts.length - 1];
    if (score >= top.score) {
      // 高于该区最高校线：按比例外推到榜首
      var gap = top.score - bot.score;
      var unit = gap > 0 ? (top.rank / (gap / pts.length)) : top.rank;
      var r0 = Math.max(1, Math.round(top.rank * Math.pow(0.62, (score - top.score) / 5)));
      return { rank: r0, extrap: 'top', sample: pts.length };
    }
    if (score <= bot.score) {
      return { rank: bot.rank, extrap: 'bottom', sample: pts.length };
    }
    for (var i = 1; i < pts.length; i++) {
      if (score >= pts[i].score && score <= pts[i - 1].score) {
        var hi = pts[i - 1], lo = pts[i];
        var t = hi.score === lo.score ? 0 : (hi.score - score) / (hi.score - lo.score);
        return {
          rank: Math.round(hi.rank + (lo.rank - hi.rank) * t),
          sample: pts.length
        };
      }
    }
    return { rank: bot.rank, sample: pts.length };
  }

  /* ---------------- 可报范围匹配 ---------------- */
  function scopeLabel(sc, line) {
    var s = (sc || '').trim();
    if (s === '市六区' || s === '市内六区') return '面向市内六区';
    if (s === '全市') return '面向全市';
    if (s === '新区' || s === '滨海新区') return '面向滨海新区';
    if (s === '录满') return '未录满';
    if (s) return '面向' + s;
    if (line.isCity) {
      return line.region === '海河教育园区' ? '面向市内六区及海河教育园区' : '面向市内六区';
    }
    return '面向' + (line.region || '本区');
  }

  function matchEntry(line, district) {
    var entries = line.entries || [];
    if (!entries.length) return null;
    var six = isSix(district), bin = isBin(district);
    var best = null, bestPri = -1;

    entries.forEach(function (e) {
      if (e.score == null && e.scope !== '录满') return;
      var sc = (e.scope || '').trim();
      var pri = -1;

      if (sc === district) pri = 100;                                  // 精确片区
      else if (sc === '市六区' && six) pri = 90;                       // 市内六区
      else if (sc === '市内六区' && six) pri = 90;
      else if (sc === '新区' && bin) pri = 72;                         // 滨海新区
      else if (sc === '滨海新区' && bin) pri = 72;
      else if (isBinSub(sc) && sc === district) pri = 100;
      else if (sc === '全市') pri = 55;                                // 全市招生
      else if (!sc) {                                                   // 无标注 → 按学校属性兜底
        if (line.isCity && six) pri = 85;
        else if (line.isCity && district === '海河教育园区') pri = 85;
        else if (!line.isCity && district === line.region) pri = 88;
      }
      if (pri > bestPri) { bestPri = pri; best = e; }
    });

    return bestPri > 0 ? { entry: best, pri: bestPri } : null;
  }

  /* ---------------- 校名匹配（补充住宿/地址/电话） ---------------- */
  var _nameIdx = null;
  function nameIndex() {
    if (_nameIdx) return _nameIdx;
    var idx = {};
    (D.schools || []).forEach(function (s) {
      var n = (s.name || '').replace(/^[●◆★☆\s]+/, '').trim();
      if (!n) return;
      if (!idx[n]) idx[n] = s;
    });
    _nameIdx = idx;
    return idx;
  }

  function findSchool(name) {
    var idx = nameIndex();
    var n = (name || '').replace(/^[●◆★☆\s]+/, '').trim();
    if (idx[n]) return idx[n];
    // 包含匹配
    var keys = Object.keys(idx), hit = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.length >= 4 && n.length >= 4 && (k.indexOf(n) >= 0 || n.indexOf(k) >= 0)) {
        if (!hit || k.length > hit.length) hit = k;
      }
    }
    return hit ? idx[hit] : null;
  }

  /* ---------------- 主预测 ---------------- */
  function predict(input) {
    var name = (input.name || '').trim();
    var district = input.district;
    var typeKey = input.type || 'local';
    var year = String(input.year || '2026');
    var scores = input.scores || {};

    var typeDef = null;
    TYPES.forEach(function (t) { if (t.key === typeKey) typeDef = t; });
    if (!typeDef) typeDef = TYPES[0];

    // 汇总成绩
    var subjects = (D.meta && D.meta.subjects) || [];
    var total = 0, subjectDetail = [];
    subjects.forEach(function (s) {
      var v = parseFloat(scores[s.key]);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > s.full) v = s.full;
      total += v;
      subjectDetail.push({
        key: s.key, label: s.label, full: s.full,
        value: Math.round(v * 100) / 100,
        rate: s.full ? v / s.full : 0,
        lost: Math.round((s.full - v) * 100) / 100,
        hint: s.hint || ''
      });
    });
    total = Math.round(total * 100) / 100;

    var warnings = [];
    var dLabel = '';
    (D.districts || []).forEach(function (d) { if (d.key === district) dLabel = d.label; });
    if (!dLabel) dLabel = district;

    // 位次
    var rk = scoreToRank(total, year);
    var sixRank = (isSix(district) && rk) ? rk.six : null;
    var distRank = null;
    var distRankNote = '';
    if (!isSix(district)) {
      var est = estimateDistrictRank(district, total);
      if (est) {
        distRank = est.rank;
        distRankNote = year === '2026'
          ? ('基于本区 ' + est.sample + ' 所高中录取线插值估算')
          : ('基于 2026 年本区 ' + est.sample + ' 所高中录取线点位估算，跨年仅供参考');
      }
    }

    var base = rk ? rk.base : 0;
    var pctCity = (rk && rk.city && base) ? (rk.city / base) : null;

    // ---------- 院校推荐 ----------
    var canSenior = typeDef.canSenior;
    var tiers = { chong: [], wen: [], bao: [] };
    var allCount = 0, poolMap = {};

    if (canSenior) {
      (D.lines || []).forEach(function (ln) {
        var m = matchEntry(ln, district);
        if (!m) return;
        var e = m.entry;
        poolMap[ln.name] = 1;

        // 分数线取值
        var lineScore = null, lineTag = '';
        if (year === '2026') {
          lineScore = e.score;
          lineTag = '2026';
        } else if (year === '2025') {
          lineScore = ln.s2025;
          lineTag = '2025';
        } else if (year === '2024') {
          lineScore = ln.s2024;
          lineTag = '2024';
        }
        if (lineScore == null) return;

        var delta = Math.round((total - lineScore) * 100) / 100;
        var tier = null;
        if (delta >= T.chongLo && delta < T.chongHi) tier = 'chong';
        else if (delta >= T.wenLo && delta < T.wenHi) tier = 'wen';
        else if (delta >= T.baoLo && delta <= T.baoHi) tier = 'bao';
        if (!tier) return;

        // 该线对应位次
        var lineRank = null;
        if (year === '2026') {
          var t26 = (D.ranks || {})['2026'];
          if (t26) {
            var lr = rankLookup(t26, lineScore, ln.isCity && isSix(district) ? 'six' : 'city');
            if (lr) lineRank = lr.rank;
          }
        }

        var plan = (m.entry && m.pri >= 55) ? null : null;
        var planN = null;
        var plans = ln.plans || [];
        for (var pi = 0; pi < plans.length; pi++) {
          if ((plans[pi].scope || '').trim() === (e.scope || '').trim()) { planN = plans[pi].n; break; }
        }
        if (planN == null && plans.length) planN = plans[0].n;

        var extra = findSchool(ln.name);

        tiers[tier].push({
          name: ln.name,
          region: ln.region,
          isCity: ln.isCity,
          line: lineScore,
          lineTag: lineTag,
          delta: delta,
          scopeText: scopeLabel(e.scope, ln),
          plan: planN,
          lineRank: lineRank,
          s2025: ln.s2025,
          s2024: ln.s2024,
          s2026: (e.score != null && year !== '2026') ? e.score : null,
          stay: extra ? extra.stay : '',
          addr: extra ? extra.addr : '',
          tel: extra ? extra.tel : '',
          batch: extra ? extra.batch : '',
          scopeType: extra ? extra.scopeType : '',
          matched: !!extra
        });
      });

      Object.keys(tiers).forEach(function (k) {
        // 去重：同一校名保留分差更有利的一条
        var map = {};
        tiers[k].forEach(function (x) {
          var cur = map[x.name];
          if (!cur || x.delta > cur.delta) map[x.name] = x;
        });
        tiers[k] = Object.keys(map).map(function (n) { return map[n]; });
        tiers[k].sort(function (a, b) { return b.line - a.line; });
        allCount += tiers[k].length;
        if (tiers[k].length > T.maxPerTier) tiers[k] = tiers[k].slice(0, T.maxPerTier);
      });
    }
    var poolCount = Object.keys(poolMap).length;

    // ---------- 结论 ----------
    var level = levelOf(rk ? rk.city : null, base, total);
    var verdict = buildVerdict({
      name: name, districtLabel: dLabel, total: total, rk: rk, base: base,
      sixRank: sixRank, distRank: distRank, isSixArea: isSix(district),
      levels: level, tiers: tiers, canSenior: canSenior, typeDef: typeDef
    });

    // ---------- 学科诊断 ----------
    var sorted = subjectDetail.slice().sort(function (a, b) { return a.rate - b.rate; });
    var weakest = sorted.slice(0, 2).filter(function (s) { return s.rate < 0.92; });
    var strongest = sorted.slice(-2).reverse().filter(function (s) { return s.rate >= 0.9; });

    // ---------- 提示 ----------
    if (typeDef.key === 'nonlocal') {
      warnings.push({
        kind: 'risk',
        text: '按天津市政策，不具有本市常住户口和蓝印户口的考生不得填报普通高中学校志愿及中职学校综合高中班志愿，可报考除综合高中班以外的其他中高职类学校。本报告不提供普通高中推荐。'
      });
    }
    if (typeDef.key === 'past') {
      warnings.push({
        kind: 'risk',
        text: '往届初中毕业生不参加统一招生录取，可通过注册入学方式升入中高职类学校。本报告不提供普通高中推荐。'
      });
    }
    if (rk && rk.extrap === 'top') {
      warnings.push({ kind: 'info', text: '考生总分高于一分一档表最高档，位次为按比例外推的估算值。' });
    }
    if (rk && rk.extrap === 'bottom') {
      warnings.push({ kind: 'warn', text: '考生总分低于一分一档表最低统计档（500 分），位次仅能给出下限参考，实际排名可能更靠后。' });
    }
    if (year !== '2026') {
      warnings.push({
        kind: 'info',
        text: '所选年份（' + year + '）的录取分数线未区分招生面向，院校线使用该校整体录取线；位次按 ' + year + ' 年一分一档表计算。'
      });
    }
    if (canSenior && poolCount && !allCount) {
      warnings.push({ kind: 'warn', text: '在可报范围内未找到分数匹配的院校，建议关注中职学校或民办高中补录通道。' });
    }

    return {
      student: {
        name: name || '未填写姓名',
        district: district,
        districtLabel: dLabel,
        typeKey: typeDef.key,
        typeLabel: typeDef.label,
        year: year,
        isSixArea: isSix(district),
        isBinArea: isBin(district),
        subjects: subjectDetail,
        total: total,
        full: FULL,
        rate: total / FULL
      },
      ranks: {
        city: rk ? rk.city : null,
        six: sixRank,
        district: distRank,
        districtNote: distRankNote,
        base: base,
        topPct: pctCity != null ? pctCity * 100 : null,
        level: level
      },
      tiers: tiers,
      counts: { pool: poolCount, matched: allCount, chong: tiers.chong.length, wen: tiers.wen.length, bao: tiers.bao.length },
      diagnosis: { weakest: weakest, strongest: strongest },
      verdict: verdict,
      warnings: warnings,
      canSenior: canSenior
    };
  }

  /* ---------------- 分数段定位 ---------------- */
  function levelOf(cityRank, base, total) {
    if (!cityRank || !base) return null;
    var p = cityRank / base;   // 越小越好
    if (p <= 0.002) return { code: 'S', label: '全市顶尖', desc: '可冲刺全市最好的高中' };
    if (p <= 0.012) return { code: 'A', label: '全市上游', desc: '具备冲刺优质市重点高中的实力' };
    if (p <= 0.035) return { code: 'B', label: '全市中上', desc: '可竞争市重点与优质区重点高中' };
    if (p <= 0.10) return { code: 'C', label: '全市中等偏上', desc: '可报考多数区重点高中与优质民办高中' };
    if (p <= 0.25) return { code: 'D', label: '全市中等', desc: '重点关注一般高中与民办高中' };
    if (p <= 0.50) return { code: 'E', label: '全市中下', desc: '可关注录取线较低的高中与中高职类学校' };
    return { code: 'F', label: '全市后段', desc: '建议重点考虑中高职类学校与注册入学通道' };
  }

  /* ---------------- 结论文案 ---------------- */
  function buildVerdict(o) {
    var lines = [];
    var who = o.name || '该考生';
    if (!o.canSenior) {
      return {
        title: '普通高中志愿受限',
        body: who + '的考生类型（' + o.typeDef.label + '）按政策不能填报普通高中志愿，'
          + '建议转向中高职类学校。可点击「资料中心」查看中高职类学校名单与招生计划。'
      };
    }
    var t = o.total;
    var seg = '备考水平';
    if (o.levels) seg = o.levels.label;

    var rankTxt = '';
    if (o.rk && o.rk.city) rankTxt = '全市约第 ' + fmt(o.rk.city) + ' 名';
    if (o.sixRank) rankTxt += '，市内六区约第 ' + fmt(o.sixRank) + ' 名';
    else if (o.distRank) rankTxt += '，' + o.districtLabel + '约第 ' + fmt(o.distRank) + ' 名';

    var n = o.tiers;
    var body = who + '总分 ' + t + ' 分（满分 800），' + (rankTxt ? rankTxt + '，' : '')
      + '处于' + seg + '。';

    if (n.wen.length || n.bao.length) {
      body += '在可报范围内，稳妥院校 ' + n.wen.length + ' 所、保底院校 ' + n.bao.length + ' 所';
      if (n.chong.length) body += '，另有 ' + n.chong.length + ' 所可以冲刺';
      body += '。';
    } else if (n.chong.length) {
      body += '目前仅匹配到 ' + n.chong.length + ' 所冲刺院校，稳妥与保底院校偏少，建议扩大志愿梯度。';
    }

    return {
      title: (o.levels ? o.levels.label : '成绩定位') + ' · ' + t + ' 分',
      body: body
    };
  }

  function fmt(n) {
    if (n == null) return '—';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  global.ZKEngine = {
    predict: predict,
    scoreToRank: scoreToRank,
    estimateDistrictRank: estimateDistrictRank,
    districtRankPoints: districtRankPoints,
    TYPES: TYPES,
    thresholds: T,
    fmt: fmt,
    isSix: isSix
  };
})(window);
