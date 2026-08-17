(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => d ? `${d.slice(0, 4)}-${d.slice(5, 7)}-${d.slice(8, 10)}` : '—';
  const nowDate = () => new Date().toISOString().slice(0, 10);

  let curTab = 'dash';
  let posts = [];
  let moments = [];
  let musicItems = [];
  let curPostId = null;
  let curMomentId = null;
  let mdTimer = null;

  const setStatus = (msg, type = 'info') => {
    const el = $('#status');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 4000);
  };

  const postJson = async (url, data) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.message || '请求失败');
    return j;
  };

  const getJson = async (url) => {
    const r = await fetch(url);
    const j = await r.json();
    if (!j.success) throw new Error(j.message || '请求失败');
    return j;
  };

  /* ============ 导航 ============ */
  const TABS = {
    dash:    { title: '档案总览',   no: 'FILE / OVERVIEW' },
    posts:   { title: '文章与草稿', no: 'FILE / ARTICLES' },
    moments: { title: '说说',       no: 'FILE / MOMENTS' },
    friends: { title: '友链',       no: 'FILE / FRIENDS' },
    projects:{ title: '项目',       no: 'FILE / PROJECTS' },
    albums:  { title: '相册',       no: 'FILE / ALBUMS' },
    picbed:  { title: '光影图床',   no: 'FILE / PICBED' },
    music:   { title: '歌单',       no: 'FILE / MUSIC' }
  };
  const LOADERS = {
    dash: loadDash, posts: loadPosts, moments: loadMoments,
    friends: () => loadDataTab('friends'), projects: () => loadDataTab('projects'),
    albums: () => loadDataTab('albums'), picbed: null, music: () => loadMusicTab()
  };

  function goTab(name) {
    curTab = name;
    $$('.panel').forEach((p) => p.classList.remove('show'));
    $('#panel-' + name).classList.add('show');
    $$('#drawer button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    const t = TABS[name];
    $('#topbarTitle').innerHTML = `${t.title} <span class="no">${t.no}</span>`;
    if (LOADERS[name]) LOADERS[name]();
  }
  $$('#drawer button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));

  /* ============ 操作箱 ============ */
  let ops = [];
  try { ops = JSON.parse(localStorage.getItem('cms_ops') || '[]'); } catch (e) { ops = []; }

  const saveOps = () => {
    localStorage.setItem('cms_ops', JSON.stringify(ops));
    renderOps();
  };
  const addOp = (label) => {
    ops.unshift({ t: new Date().toLocaleTimeString('zh-CN', { hour12: false }), label });
    if (ops.length > 30) ops.pop();
    saveOps();
  };
  const renderOps = () => {
    const dot = $('#opDot');
    if (ops.length) {
      dot.style.display = 'flex';
      dot.textContent = ops.length;
      dot.classList.add('ping');
    } else {
      dot.style.display = 'none';
    }
    const ul = $('#opList');
    if (!ops.length) {
      ul.innerHTML = '<li class="opbox-empty">暂无待处理操作</li>';
      return;
    }
    ul.innerHTML = ops.map((o, i) =>
      `<li><span>${esc(o.label)}</span><i>${esc(o.t)}</i><button data-i="${i}" title="移除">移除</button></li>`
    ).join('');
    ul.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => { ops.splice(+b.dataset.i, 1); saveOps(); }));
  };
  $('#opBoxBtn').addEventListener('click', () => $('#opBoxDrop').classList.toggle('open'));
  $('#opClear').addEventListener('click', () => { ops = []; saveOps(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.opbox')) $('#opBoxDrop').classList.remove('open');
  });
  $('#deployBtn').addEventListener('click', () =>
    setStatus('本地直写模式：内容已写入仓库，站点构建后即生效。', 'info'));
  renderOps();

  /* ============ 同步中心 ============ */
  const renderSyncOut = (text, type = 'ok') => {
    const el = $('#syncOutput');
    el.textContent = text;
    el.className = 'sync-output ' + type;
  };
  let buildPoll = null;
  const stopBuildPoll = () => {
    if (buildPoll) { clearInterval(buildPoll); buildPoll = null; }
    $('#syncRebuild').textContent = '① 重建博客';
  };
  const pollBuild = () => {
    stopBuildPoll();
    buildPoll = setInterval(async () => {
      try {
        const j = await postJson('/api/sync/status');
        const st = j.status || {};
        if (st.running) {
          $('#syncRebuild').textContent = '构建中…';
          renderSyncOut('构建运行中…\n' + (j.logTail || ''), 'run');
          return;
        }
        stopBuildPoll();
        const ok = st.last_exit === 0;
        setStatus(ok ? '博客重建完成' : '博客重建失败（exit ' + st.last_exit + '）', ok ? 'ok' : 'err');
        addOp('博客重建：' + (ok ? '成功' : '失败'));
        renderSyncOut((ok ? '构建成功 ✓\n' : '构建失败（exit ' + st.last_exit + '）\n') + (j.logTail || ''), ok ? 'ok' : 'err');
      } catch (e) {
        stopBuildPoll();
        renderSyncOut('状态查询失败：' + e.message, 'err');
      }
    }, 1000);
  };
  $('#syncRebuild').addEventListener('click', async () => {
    try {
      const j = await postJson('/api/sync/rebuild');
      if (j.running) renderSyncOut('构建已启动…', 'run');
      pollBuild();
    } catch (e) { renderSyncOut('启动失败：' + e.message, 'err'); }
  });
  $('#syncImages').addEventListener('click', async () => {
    try {
      const j = await postJson('/api/sync/images');
      setStatus(j.message, 'ok');
      addOp('图片资源同步');
      const lines = [
        `复制 ${(j.copied || []).length} 张 → public/images/`,
        `重写引用 ${j.rewritten || 0} 处`,
        `跳过 ${(j.skipped || []).length} 项`,
      ];
      (j.copied || []).forEach((c) => lines.push('  + ' + c));
      (j.skipped || []).forEach((s) => lines.push('  - ' + s));
      (j.errors || []).forEach((e) => lines.push('  ✗ ' + e));
      renderSyncOut(lines.join('\n'), (j.errors || []).length ? 'err' : 'ok');
    } catch (e) { renderSyncOut('图片同步失败：' + e.message, 'err'); }
  });
  $('#syncImport').addEventListener('click', async () => {
    try {
      const j = await postJson('/api/sync/import');
      setStatus(j.message, 'ok');
      addOp('博客导入草稿箱');
      const lines = [
        `导入草稿 ${(j.imported || []).length} 个`,
        `跳过（已有草稿）${(j.skipped || []).length} 个`,
      ];
      (j.imported || []).forEach((i) => lines.push('  + ' + i));
      (j.skipped || []).forEach((s) => lines.push('  - ' + s));
      renderSyncOut(lines.join('\n'), 'ok');
    } catch (e) { renderSyncOut('导入失败：' + e.message, 'err'); }
  });
  $('#syncLink').addEventListener('click', async () => {
    try {
      const j = await postJson('/api/sync/link');
      setStatus(j.message, 'ok');
      addOp('动态关联校验');
      const lines = [`检查动态 ${j.checked || 0} 篇`];
      if ((j.broken || []).length) {
        lines.push('失效引用 ' + j.broken.length + ' 处：');
        (j.broken || []).forEach((b) => lines.push('  ✗ ' + b));
      } else {
        lines.push('所有 /blog/ 引用均有效 ✓');
      }
      renderSyncOut(lines.join('\n'), (j.broken || []).length ? 'err' : 'ok');
    } catch (e) { renderSyncOut('关联校验失败：' + e.message, 'err'); }
  });

  /* ============ 仪表盘 ============ */
  async function loadDash() {
    const grid = $('#statGrid');
    grid.innerHTML = Array(8).fill(0).map((_, i) =>
      `<div class="stat"><div class="num">…</div><div class="lbl">${['文章','说说','友链','项目','相册','歌单','草稿','标签'][i]}</div></div>`
    ).join('');
    $('#recentPosts').innerHTML = '<div class="empty">读取中…</div>';
    try {
      const [p, m, fr, pr, al, mu] = await Promise.all([
        postJson('/api/posts/list'),
        postJson('/api/moments/list'),
        getJson('/api/site-data/all'),
        getJson('/api/site-data/all'),
        getJson('/api/gallery/albums'),
        getJson('/api/music/playlist')
      ]);
      posts = p.posts || [];
      moments = m.moments || [];
      const friends = (((fr.data || {}).friends) || []).length;
      const projects = (((pr.data || {}).projects) || []).length;
      const albums = (al.albums || []).length;
      const draft = posts.filter((x) => !x.draft).length;
      const tags = new Set();
      posts.forEach((x) => (x.tags || []).forEach((t) => tags.add(t)));
      const nums = [posts.length, moments.length, friends, projects, albums, (mu.playlist || []).length, draft, tags.size];
      const labels = ['文章', '说说', '友链', '项目', '相册', '歌单', '草稿', '标签'];
      grid.innerHTML = nums.map((n, i) =>
        `<div class="stat"><div class="num">${n}</div><div class="lbl">${labels[i]}</div></div>`
      ).join('');
      $('#recentPosts').innerHTML = posts.length
        ? posts.slice(0, 5).map((x, i) => recentRow(x, i)).join('')
        : '<div class="empty">还没有文章。<b onclick="goTab(\'posts\');newPost()">写第一篇 →</b></div>';
    } catch (e) {
      grid.innerHTML = '<div class="empty">数据加载失败：' + esc(e.message) + '</div>';
      $('#recentPosts').innerHTML = '';
    }
  }
  const recentRow = (x, i) => `
    <div class="list-item" style="cursor:pointer" onclick="openPost('${esc(x.id)}')">
      <span class="list-idx">NO.${pad(i + 1)}</span>
      <div class="list-main">
        <h4>${x.draft ? '<span class="draft-mark">[草稿]</span>' : ''}${esc(x.title || '(无标题)')}</h4>
        <p>${fmtDate(x.date)}${x.tags && x.tags.length ? ' · ' + x.tags.map((t) => `<span class="badge hi">#${esc(t)}</span>`).join('') : ''}</p>
      </div>
      <span class="badge">${x.draft ? '草稿' : '已发布'}</span>
    </div>`;

  /* ============ 文章 ============ */
  async function loadPosts() {
    $('#postListCard').style.display = '';
    $('#postEditorCard').style.display = 'none';
    $('#postList').innerHTML = '<div class="empty">加载中…</div>';
    try {
      const j = await postJson('/api/posts/list');
      posts = j.posts || [];
      $('#postList').innerHTML = posts.length
        ? posts.map((x, i) => `
          <div class="list-item">
            <span class="list-idx">NO.${pad(i + 1)}</span>
            <div class="list-main">
              <h4>${x.draft ? '<span class="draft-mark">[草稿]</span>' : ''}${esc(x.title || '(无标题)')}</h4>
              <p>${fmtDate(x.date)}${x.tags && x.tags.length ? ' · ' + x.tags.map((t) => `<span class="badge hi">#${esc(t)}</span>`).join('') : ''}</p>
            </div>
            <div class="list-actions">
              ${x.draft ? '' : `<button class="btn btn-ghost btn-sm" onclick="openPreview('/blog/${esc(x.id)}')">预览</button>`}
              <button class="btn btn-ghost btn-sm" onclick="openPost('${esc(x.id)}')">编辑</button>
              <button class="btn btn-seal btn-sm" onclick="delPost('${esc(x.id)}')">删除</button>
            </div>
          </div>`).join('')
        : '<div class="empty">还没有文章。<b onclick="newPost()">写第一篇 →</b></div>';
    } catch (e) {
      $('#postList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }
  function newPost() { openPost(null); }
  async function openPost(id) {
    curPostId = id;
    let post = { title: '', content: '', tags: [], date: nowDate(), description: '', draft: true };
    if (id) {
      try {
        const j = await postJson('/api/posts/get', { id });
        post = j.post || post;
      } catch (e) { setStatus('读取失败：' + e.message, 'err'); }
    }
    $('#postListCard').style.display = 'none';
    $('#postEditorCard').style.display = '';
    $('#postEditorTitle').innerHTML = `${id ? '编辑文章' : '新文章'} <span class="no">FILE / EDIT</span>`;
    $('#postEditor').innerHTML = `
      <div class="edit-flex">
        <div class="edit-main">
          <div class="edit-cap">MARKDOWN / SOURCE</div>
          <input class="field" id="p-title" placeholder="文章标题" value="${esc(post.title || '')}">
          <div class="edit-cap" style="margin-top:12px">CONTENT / 实时预览</div>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="btn btn-ghost btn-sm" onclick="toggleMdView()" id="mdViewBtn">预览开</button>
            <button class="btn btn-ghost btn-sm" id="insImgBtn">插图</button>
          </div>
          <textarea id="p-content" placeholder="# 开始书写…">${esc(post.content || '')}</textarea>
        </div>
        <div class="edit-side">
          <div class="edit-cap">META / 元数据</div>
          <div class="field"><label>ID（留空自动生成）</label><input id="p-id" value="${esc(post.id || '')}" placeholder="slug-${Date.now().toString(36)}"></div>
          <div class="field"><label>日期</label><input id="p-date" type="date" value="${esc(post.date || nowDate())}"></div>
          <div class="field"><label>标签（逗号分隔）</label><input id="p-tags" value="${esc((post.tags || []).join(', '))}" placeholder="随笔, 生活"></div>
          <div class="field"><label>摘要</label><textarea id="p-desc" rows="3" placeholder="文章摘要">${esc(post.description || '')}</textarea></div>
          <div class="field field-check"><input type="checkbox" id="p-draft" ${post.draft ? 'checked' : ''}><label>保存为草稿（不发布）</label></div>
          <div class="row">
            <button class="btn btn-hi" id="savePostBtn">保存</button>
            <button class="btn btn-seal" id="savePostPubBtn">保存并发布</button>
          </div>
        </div>
      </div>`;
    const ta = $('#p-content');
    const pre = document.createElement('div');
    pre.className = 'md-preview';
    ta.parentNode.insertBefore(pre, ta.nextSibling);
    const render = () => { pre.innerHTML = mdToHtml(ta.value); pre.style.display = $('#mdViewBtn').textContent.includes('预览开') ? 'none' : ''; };
    ta.addEventListener('input', () => { clearTimeout(mdTimer); mdTimer = setTimeout(render, 250); });
    render();
    $('#savePostBtn').addEventListener('click', () => savePost(false));
    $('#savePostPubBtn').addEventListener('click', () => savePost(true));
    $('#insImgBtn').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        const btn = $('#insImgBtn');
        btn.disabled = true;
        btn.textContent = '上传中…';
        try {
          const r = await fetch('/api/local-images/upload', { method: 'POST', body: fd });
          const j = await r.json();
          if (!j.success) throw new Error(j.message || '上传失败');
          const ta = $('#p-content');
          const pos = ta.selectionStart ?? ta.value.length;
          const md = `![${file.name.replace(/\.[^.]+$/, '')}](${j.url})\n`;
          ta.value = ta.value.slice(0, pos) + md + ta.value.slice(ta.selectionEnd ?? pos);
          ta.focus();
          ta.selectionStart = ta.selectionEnd = pos + md.length;
          setStatus('图片已插入：' + j.filename, 'ok');
          addOp('插图：' + j.filename);
        } catch (e) {
          setStatus('插图失败：' + e.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '插图';
        }
      };
      input.click();
    });
  }
  function toggleMdView() {
    const b = $('#mdViewBtn');
    const pre = $('#postEditor .md-preview');
    const ta = $('#p-content');
    if (b.textContent.includes('预览开')) {
      b.textContent = '预览关';
      pre.style.display = '';
      ta.style.display = 'none';
    } else {
      b.textContent = '预览开';
      pre.style.display = 'none';
      ta.style.display = '';
    }
  }
  async function savePost(publish) {
    const payload = {
      id: $('#p-id').value.trim() || null,
      title: $('#p-title').value.trim(),
      content: $('#p-content').value,
      tags: $('#p-tags').value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      date: $('#p-date').value || nowDate(),
      description: $('#p-desc').value.trim(),
      draft: !publish && $('#p-draft').checked
    };
    if (!payload.title) { setStatus('请填写标题', 'err'); return; }
    try {
      const j = await postJson('/api/posts/save', payload);
      setStatus(publish ? `已发布：${j.title || payload.title}` : `已保存草稿：${payload.title}`, 'ok');
      addOp(`${publish ? '发布' : '保存'}文章：${payload.title}`);
      if (!payload.draft) triggerRebuild();
      backToPosts();
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }
  async function delPost(id) {
    if (!confirm('确定删除这篇文章？此操作不可恢复。')) return;
    try {
      await postJson('/api/posts/delete', { id });
      addOp('删除文章：' + id);
      triggerRebuild();
      loadPosts();
    } catch (e) { setStatus('删除失败：' + e.message, 'err'); }
  }
  function backToPosts() { curPostId = null; loadPosts(); }

  /* ============ 说说 ============ */
  async function loadMoments() {
    $('#momentListCard').style.display = '';
    $('#momentEditorCard').style.display = 'none';
    $('#momentList').innerHTML = '<div class="empty">加载中…</div>';
    try {
      const j = await postJson('/api/moments/list');
      moments = j.moments || [];
      $('#momentList').innerHTML = moments.length
        ? moments.map((x, i) => `
          <div class="list-item">
            <span class="list-idx">NO.${pad(i + 1)}</span>
            <div class="list-main">
              <h4>${esc(x.content || '(空)')}</h4>
              <p>${fmtDate(x.date)}${x.pinned ? ' <span class="badge seal">置顶</span>' : ''}</p>
            </div>
            <div class="list-actions">
              <button class="btn btn-ghost btn-sm" onclick="openMoment('${esc(x.id)}')">编辑</button>
              <button class="btn btn-seal btn-sm" onclick="delMoment('${esc(x.id)}')">删除</button>
            </div>
          </div>`).join('')
        : '<div class="empty">还没有说说。<b onclick="newMoment()">写第一条 →</b></div>';
    } catch (e) {
      $('#momentList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }
  function newMoment() { openMoment(null); }
  async function openMoment(id) {
    curMomentId = id;
    let item = { content: '', date: nowDate(), pinned: false };
    if (id) {
      try {
        const j = await postJson('/api/moments/list');
        item = (j.moments || []).find((x) => x.id === id) || item;
      } catch (e) { setStatus('读取失败：' + e.message, 'err'); }
    }
    $('#momentListCard').style.display = 'none';
    $('#momentEditorCard').style.display = '';
    $('#momentEditorTitle').innerHTML = `${id ? '编辑说说' : '新说说'} <span class="no">FILE / EDIT</span>`;
    $('#momentEditor').innerHTML = `
      <div class="field"><label>内容</label><textarea id="m-text" rows="5">${esc(item.content || '')}</textarea></div>
      <div class="field-grid">
        <div class="field"><label>日期</label><input id="m-date" type="date" value="${esc(item.date || nowDate())}"></div>
        <div class="field field-check" style="align-self:end;margin-bottom:14px"><input type="checkbox" id="m-pinned" ${item.pinned ? 'checked' : ''}><label>置顶</label></div>
      </div>
      <div class="row">
        <button class="btn btn-hi" id="saveMomentBtn">保存</button>
      </div>`;
    $('#saveMomentBtn').addEventListener('click', saveMoment);
  }
  async function saveMoment() {
    const payload = {
      id: curMomentId || null,
      content: $('#m-text').value.trim(),
      frontmatter: {
        date: $('#m-date').value || nowDate(),
        pinned: $('#m-pinned').checked,
      },
    };
    if (!payload.content) { setStatus('请填写内容', 'err'); return; }
    try {
      await postJson('/api/moments/save', payload);
      setStatus('说说已保存', 'ok');
      addOp('保存说说：' + payload.content.slice(0, 20));
      triggerRebuild();
      backToMoments();
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }
  async function delMoment(id) {
    if (!confirm('确定删除这条说说？')) return;
    try {
      await postJson('/api/moments/delete', { id });
      addOp('删除说说：' + id);
      triggerRebuild();
      loadMoments();
    } catch (e) { setStatus('删除失败：' + e.message, 'err'); }
  }
  function backToMoments() { curMomentId = null; loadMoments(); }

  /* ============ 数据类（友链/项目/相册）表单式管理 ============ */
  const DATA_CFG = {
    friends: {
      label: '友链',
      titleKey: 'name',
      fields: [
        { k: 'id', label: 'ID', ph: 'friend-1' },
        { k: 'name', label: '名称', required: true },
        { k: 'url', label: '链接', ph: 'https://' },
        { k: 'description', label: '描述', type: 'textarea', rows: 2 },
        { k: 'avatar', label: '头像链接' },
        { k: 'themeColor', label: '主题色', ph: '#3b82f6' },
      ],
    },
    projects: {
      label: '项目',
      titleKey: 'name',
      fields: [
        { k: 'id', label: 'ID', ph: 'project-1' },
        { k: 'name', label: '名称', required: true },
        { k: 'description', label: '描述', type: 'textarea', rows: 2 },
        { k: 'icon', label: '图标', ph: 'emoji 或图标名' },
        { k: 'url', label: '链接', ph: 'https://' },
        { k: 'date', label: '日期', ph: '2024-01' },
      ],
    },
    albums: {
      label: '相册',
      titleKey: 'title',
      api: 'gallery',
      fields: [
        { k: 'id', label: 'ID', ph: 'album-1' },
        { k: 'title', label: '标题', required: true },
        { k: 'description', label: '描述', type: 'textarea', rows: 2 },
      ],
    },
  };
  const dataCache = { friends: [], projects: [], albums: [] };
  let curDataKind = null;
  let curDataIdx = null;

  async function loadDataTab(kind) {
    curDataKind = kind;
    const cfg = DATA_CFG[kind];
    const listEl = $('#dataList-' + kind);
    const editorEl = $('#dataEditor-' + kind);
    listEl.style.display = '';
    editorEl.style.display = 'none';
    listEl.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const j = cfg.api === 'gallery'
        ? await getJson('/api/gallery/albums')
        : await getJson('/api/site-data/all');
      dataCache[kind] = (cfg.api === 'gallery' ? (j.albums || []) : (((j.data || {})[kind]) || []));
      renderDataList(kind);
      setStatus(`${cfg.label}数据已读取（${dataCache[kind].length} 条）`, 'ok');
    } catch (e) {
      listEl.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }

  function renderDataList(kind) {
    const cfg = DATA_CFG[kind];
    const arr = dataCache[kind];
    const el = $('#dataList-' + kind);
    el.innerHTML = `
      <div class="sheet-head" style="margin-bottom:10px">
        <h2 style="font-size:15px">${cfg.label}数据 <span class="no">${arr.length} 条</span></h2>
        <button class="btn btn-hi btn-sm" onclick="newDataItem('${kind}')">＋ 新建${cfg.label}</button>
      </div>
      ${arr.length ? arr.map((x, i) => `
        <div class="list-item">
          <span class="list-idx">NO.${pad(i + 1)}</span>
          <div class="list-main">
            <h4>${esc(x[cfg.titleKey] || '(未命名)')}</h4>
            <p>${esc(cfg.api === 'gallery'
              ? (x.description || x.cover || '') + (x.photoCount ? ` · ${x.photoCount} 张照片` : '')
              : String(x.url || x.cover || x.id || '').slice(0, 60))}</p>
          </div>
          <div class="list-actions">
            ${cfg.api === 'gallery' ? `<button class="btn btn-ghost btn-sm" onclick="openPreview('/admin/gallery/${esc(x.id)}')">预览</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openDataItem('${kind}', ${i})">编辑</button>
            <button class="btn btn-seal btn-sm" onclick="delDataItem('${kind}', ${i})">删除</button>
          </div>
        </div>`).join('') : '<div class="empty">还没有' + cfg.label + '数据。</div>'}`;
  }

  function newDataItem(kind) { openDataItem(kind, null); }
  function openDataItem(kind, idx) {
    curDataKind = kind;
    curDataIdx = idx;
    const cfg = DATA_CFG[kind];
    const item = idx === null ? {} : (dataCache[kind][idx] || {});
    $('#dataList-' + kind).style.display = 'none';
    const ed = $('#dataEditor-' + kind);
    ed.style.display = '';
    const rows = cfg.fields.map((f) => {
      const v = item[f.k] ?? '';
      const input = f.type === 'textarea'
        ? `<textarea class="field" id="df-${f.k}" rows="${f.rows || 2}">${esc(v)}</textarea>`
        : `<input class="field" id="df-${f.k}" placeholder="${esc(f.ph || '')}" value="${esc(v)}">`;
      return `<div class="field"><label>${f.label}</label>${input}</div>`;
    }).join('');
    const photos = cfg.photos ? `
      <div class="field">
        <label>${cfg.photos.label}</label>
        <textarea class="field code" id="df-photos" rows="6" placeholder="${esc(cfg.photos.tip)}">${esc((item.photos || []).map((p) => typeof p === 'string' ? p : [p.url, p.caption].filter(Boolean).join(' | ')).join('\n'))}</textarea>
        <p class="sheet-tip">${esc(cfg.photos.tip)}</p>
      </div>` : '';
    const coverBlock = cfg.api === 'gallery'
      ? (idx === null
        ? `<div class="field"><label>封面图片（新建必选）</label><input class="field" type="file" id="df-cover" accept="image/*"></div>`
        : `<div class="field"><label>封面</label><p class="sheet-tip">${esc(item.cover || '(无)')}</p></div>
           <div class="field"><label>照片</label><p class="sheet-tip">${(item.photos || []).length} 张（在画廊页面 /admin/gallery/${esc(item.id || '')} 上传）</p></div>`)
      : '';
    ed.innerHTML = `
      <div class="sheet-head">
        <h2>${idx === null ? '新建' : '编辑'}${cfg.label} <span class="no">FILE / EDIT</span></h2>
        <button class="btn btn-ghost btn-sm" onclick="loadDataTab('${kind}')">← 返回列表</button>
      </div>
      ${rows}${photos}${coverBlock}
      <div class="row"><button class="btn btn-hi" id="saveDataItemBtn">保存</button></div>`;
    $('#saveDataItemBtn').addEventListener('click', saveDataItem);
  }

  async function saveDataItem() {
    const kind = curDataKind;
    const cfg = DATA_CFG[kind];
    if (cfg.api === 'gallery') {
      const title = $('#df-title').value.trim();
      const description = $('#df-description') ? $('#df-description').value.trim() : '';
      if (!title) { setStatus('请填写相册标题', 'err'); return; }
      try {
        const fd = new FormData();
        fd.append('title', title);
        fd.append('description', description);
        if (curDataIdx === null) {
          const cover = $('#df-cover').files && $('#df-cover').files[0];
          if (!cover) { setStatus('请选择封面图片', 'err'); return; }
          fd.append('cover', cover);
          const r = await fetch('/api/gallery/albums', { method: 'POST', body: fd });
          const j = await r.json();
          if (!j.success) throw new Error(j.message || '创建失败');
          addOp(`新建相册：${title}`);
        } else {
          const item = dataCache[kind][curDataIdx];
          if (!item || !item.id) { setStatus('相册 ID 缺失', 'err'); return; }
          const r = await fetch('/api/gallery/albums/' + encodeURIComponent(item.id), { method: 'PUT', body: fd });
          const j = await r.json();
          if (!j.success) throw new Error(j.message || '保存失败');
          addOp(`编辑相册：${title}`);
        }
        setStatus('相册已保存，触发展示端重建', 'ok');
        triggerRebuild();
        loadDataTab(kind);
      } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
      return;
    }
    const item = {};
    cfg.fields.forEach((f) => {
      const el = $('#df-' + f.k);
      if (el) item[f.k] = el.value.trim();
    });
    const missing = cfg.fields.find((f) => f.required && !item[f.k]);
    if (missing) { setStatus('请填写' + missing.label, 'err'); return; }
    if (cfg.photos) {
      item.photos = $('#df-photos').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const parts = l.split('|');
        const url = parts.shift().trim();
        const caption = parts.join('|').trim();
        return caption ? { url, caption } : url;
      });
    }
    if (!item.id) item.id = kind.slice(0, -1) + '_' + Date.now().toString(36);
    const arr = dataCache[kind];
    if (curDataIdx === null) arr.push(item);
    else arr[curDataIdx] = item;
    try {
      await postJson('/api/site-data/sync', { target: kind, items: arr });
      setStatus(`${cfg.label}已保存（${arr.length} 条）`, 'ok');
      addOp(`更新${cfg.label}数据：${arr.length} 条`);
      triggerRebuild();
      loadDataTab(kind);
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }

  async function delDataItem(kind, idx) {
    if (!confirm('确定删除这条记录？')) return;
    const cfg = DATA_CFG[kind];
    if (cfg.api === 'gallery') {
      const item = dataCache[kind][idx];
      if (!item || !item.id) { setStatus('相册 ID 缺失', 'err'); return; }
      try {
        const r = await fetch('/api/gallery/albums/' + encodeURIComponent(item.id), { method: 'DELETE' });
        const j = await r.json();
        if (!j.success) throw new Error(j.message || '删除失败');
        setStatus('相册已删除，触发展示端重建', 'ok');
        addOp(`删除相册：${item.title}`);
        triggerRebuild();
        loadDataTab(kind);
      } catch (e) { setStatus('删除失败：' + e.message, 'err'); }
      return;
    }
    const arr = dataCache[kind];
    arr.splice(idx, 1);
    try {
      await postJson('/api/site-data/sync', { target: kind, items: arr });
      setStatus(`${cfg.label}记录已删除`, 'ok');
      addOp(`删除${cfg.label}记录`);
      triggerRebuild();
      loadDataTab(kind);
    } catch (e) { setStatus('删除失败：' + e.message, 'err'); }
  }

  /* ============ 图床 ============ */
  function initPicbed() {
    const dz = $('#dropZone'), fi = $('#fileInput'), up = $('#uploadBtn'), test = $('#testBtn');
    dz.addEventListener('click', () => fi.click());
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pick(f);
    });
    fi.addEventListener('change', () => { if (fi.files[0]) pick(fi.files[0]); });
    let curFile = null;
    function pick(f) {
      curFile = f;
      up.disabled = false;
      const img = $('#preview');
      img.src = URL.createObjectURL(f);
      $('#result').classList.add('show');
    }
    up.addEventListener('click', async () => {
      if (!curFile) return;
      const fd = new FormData();
      fd.append('file', curFile);
      up.disabled = true;
      up.textContent = '上传中…';
      try {
        const r = await fetch('/api/picbed/upload', { method: 'POST', body: fd });
        const j = await r.json();
        if (!j.success) throw new Error(j.message || '上传失败');
        $('#url').value = j.url;
        $('#url').dataset.copied = '';
        setStatus('上传成功', 'ok');
        addOp('图床上传：' + curFile.name);
      } catch (e) {
        setStatus('上传失败：' + e.message, 'err');
      } finally {
        up.disabled = false;
        up.textContent = '上传图片';
      }
    });
    $('#copyBtn').addEventListener('click', () => {
      const u = $('#url');
      navigator.clipboard.writeText(u.value).then(() => {
        const b = $('#copyBtn');
        b.textContent = '已复制';
        setTimeout(() => (b.textContent = '复制'), 1500);
        setStatus('链接已复制', 'ok');
      });
    });
    test.addEventListener('click', async () => {
      test.disabled = true;
      try {
        const j = await getJson('/api/picbed/test');
        setStatus(j.ok ? `连接正常：${j.bucket || ''}` : '连接失败：' + (j.error || ''), j.ok ? 'ok' : 'err');
      } catch (e) { setStatus('测试失败：' + e.message, 'err'); }
      finally { test.disabled = false; }
    });
  }

  /* ============ 歌单 ============ */
  async function loadMusicTab(force) {
    $('#musicList').innerHTML = '<div class="empty">加载中…</div>';
    try {
      if (force) {
        const j = await getJson('/api/music/playlist');
        musicItems = j.playlist || [];
      } else if (!musicItems.length) {
        const j = await getJson('/api/music/playlist');
        musicItems = j.playlist || [];
      }
      renderMusic();
    } catch (e) {
      $('#musicList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
    }
  }
  function renderMusic() {
    $('#musicList').innerHTML = musicItems.length
      ? musicItems.map((x, i) => `
        <div class="list-item">
          ${x.cover ? `<img class="music-cover" src="${esc(x.cover)}" alt="">` : `<div class="music-cover" style="background:var(--hi-soft);display:flex;align-items:center;justify-content:center">♪</div>`}
          <div class="list-main">
            <h4>${esc(x.name || '(未知歌曲)')}</h4>
            <p>${esc(x.artist || '')} <span class="badge mute">${esc(x.id || '')}</span></p>
          </div>
          <div class="list-actions">
            <button class="btn btn-ghost btn-sm" onclick="delMusic(${i})">移除</button>
          </div>
        </div>`).join('')
      : '<div class="empty">歌单为空，输入歌曲 ID 添加 →</div>';
  }
  async function addMusic() {
    const id = $('#musicIdInput').value.trim();
    if (!id) { setStatus('请先粘贴歌曲 ID', 'err'); return; }
    try {
      const j = await getJson('/api/music?ids=' + encodeURIComponent(id));
      const list = j.music || [];
      if (!list.length) { setStatus('未找到该歌曲', 'err'); return; }
      musicItems = [...musicItems, ...list.filter((n) => !musicItems.some((o) => o.id === n.id))];
      renderMusic();
      setStatus(`已添加：${list[0].name}`, 'ok');
    } catch (e) { setStatus('获取失败：' + e.message, 'err'); }
  }
  function delMusic(i) {
    musicItems.splice(i, 1);
    renderMusic();
  }
  async function saveMusic() {
    try {
      await postJson('/api/music/playlist', { ids: musicItems.map((x) => x.id) });
      setStatus('歌单已保存', 'ok');
      addOp('保存歌单：' + musicItems.length + ' 首');
      triggerRebuild();
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }

  /* ============ Markdown 预览 ============ */
  function mdToHtml(md) {
    const lines = md.replace(/\r/g, '').split('\n');
    let html = '', inCode = false, codeBuf = [];
    const pushCode = () => {
      if (codeBuf.length) {
        html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>\n';
        codeBuf = [];
      }
    };
    for (const raw of lines) {
      if (/^```/.test(raw.trim())) {
        if (inCode) { inCode = false; pushCode(); }
        else { pushCode(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(raw); continue; }
      const t = raw.trim();
      if (!t) { html += '<p><br></p>\n'; continue; }
      let line = esc(raw);
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                 .replace(/\*(.+?)\*/g, '<em>$1</em>')
                 .replace(/`(.+?)`/g, '<code>$1</code>')
                 .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      if (/^###\s/.test(t)) html += '<h3>' + line.replace(/^###\s*/, '') + '</h3>\n';
      else if (/^##\s/.test(t)) html += '<h2>' + line.replace(/^##\s*/, '') + '</h2>\n';
      else if (/^#\s/.test(t)) html += '<h1>' + line.replace(/^#\s*/, '') + '</h1>\n';
      else if (/^-\s/.test(t)) html += '<li>' + line.replace(/^-\s*/, '') + '</li>\n';
      else if (/^\d+\.\s/.test(t)) html += '<li>' + line.replace(/^\d+\.\s*/, '') + '</li>\n';
      else if (/^>\s?/.test(t)) html += '<blockquote>' + line.replace(/^>\s?/, '') + '</blockquote>\n';
      else if (/^---+\s*$/.test(t)) html += '<hr>\n';
      else if (/^!\[(.+?)\]\((.+?)\)/.test(raw)) {
        const m = raw.match(/^!\[(.+?)\]\((.+?)\)/);
        html += `<img src="${m[2]}" alt="${m[1]}">\n`;
      } else html += '<p>' + line + '</p>\n';
    }
    if (inCode) pushCode();
    html = html.replace(/(<li>[\s\S]*?<\/li>)\n/g, (m) => '<ul>' + m.replace(/\n/g, '') + '</ul>');
    return html;
  }

  /* ============ 主题切换 ============ */
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('theme', cur); } catch (e) { /* noop */ }
    const b = $('#themeBtn');
    if (b) b.textContent = cur === 'dark' ? '☾' : '☀';
  }
  (function initThemeBtn() {
    const b = $('#themeBtn');
    if (b) b.textContent = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '☾' : '☀';
  })();

  /* ============ 触发展示端重建（防抖 + 等待进行中的构建） ============ */
  let rebuildQueued = false;
  function triggerRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    const fire = () => {
      fetch('/api/sync/rebuild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      setTimeout(() => (rebuildQueued = false), 5000);
    };
    const status = () => fetch('/api/sync/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json())
      .catch(() => null);
    status().then((j) => {
      if (j && j.status && j.status.running) {
        let guard = 0;
        const poll = setInterval(() => {
          status().then((j2) => {
            if ((j2 && j2.status && !j2.status.running) || ++guard > 40) {
              clearInterval(poll);
              fire();
            }
          });
        }, 3000);
      } else {
        fire();
      }
    }).catch(() => fire());
  }

  /* ============ 预览弹层 ============ */
  function openPreview(path) {
    const url = 'http://localhost:4321' + path;
    const dlg = $('#previewDialog');
    if (!dlg) { window.open(url, '_blank'); return; }
    $('#previewTitle').textContent = path;
    $('#previewFrame').src = url;
    $('#previewOpen').onclick = () => window.open(url, '_blank');
    dlg.showModal();
  }

  /* ============ 暴露给 HTML 内联调用 ============ */
  Object.assign(window, {
    goTab, newPost, openPost, backToPosts, delPost, toggleMdView,
    newMoment, openMoment, backToMoments, delMoment,
    loadDataTab, openDataItem, newDataItem, saveDataItem, delDataItem,
    addMusic, delMusic, saveMusic, loadMusicTab, openPreview, toggleTheme
  });

  /* ============ 初始化 ============ */
  initPicbed();
  goTab('dash');
})();