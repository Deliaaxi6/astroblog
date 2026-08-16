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
        getJson('/api/site-data/all'),
        getJson('/api/music/playlist')
      ]);
      posts = p.posts || [];
      moments = m.moments || [];
      const friends = (fr.friends || []).length;
      const projects = (pr.projects || []).length;
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
      backToPosts();
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }
  async function delPost(id) {
    if (!confirm('确定删除这篇文章？此操作不可恢复。')) return;
    try {
      await postJson('/api/posts/delete', { id });
      addOp('删除文章：' + id);
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
              <h4>${esc(x.text || '(空)')}</h4>
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
    let item = { text: '', date: nowDate(), pinned: false };
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
      <div class="field"><label>内容</label><textarea id="m-text" rows="5">${esc(item.text || '')}</textarea></div>
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
      text: $('#m-text').value.trim(),
      date: $('#m-date').value || nowDate(),
      pinned: $('#m-pinned').checked
    };
    if (!payload.text) { setStatus('请填写内容', 'err'); return; }
    try {
      await postJson('/api/moments/save', payload);
      setStatus('说说已保存', 'ok');
      addOp('保存说说：' + payload.text.slice(0, 20));
      backToMoments();
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
  }
  async function delMoment(id) {
    if (!confirm('确定删除这条说说？')) return;
    try {
      await postJson('/api/moments/delete', { id });
      addOp('删除说说：' + id);
      loadMoments();
    } catch (e) { setStatus('删除失败：' + e.message, 'err'); }
  }
  function backToMoments() { curMomentId = null; loadMoments(); }

  /* ============ 数据类（友链/项目/相册） ============ */
  const DATA_MAP = {
    friends: ['friends', '友链'],
    projects: ['projects', '项目'],
    albums: ['albums', '相册']
  };
  async function loadDataTab(kind) {
    const [key, label] = DATA_MAP[kind];
    const el = $('#' + kind + 'Json');
    el.disabled = true;
    el.value = '读取中…';
    try {
      const j = await getJson('/api/site-data/all');
      const arr = j[key] || [];
      el.value = JSON.stringify(arr, null, 2);
      setStatus(`${label}数据已读取（${arr.length} 条）`, 'ok');
    } catch (e) {
      el.value = '// 读取失败：' + e.message;
      setStatus('读取失败：' + e.message, 'err');
    } finally {
      el.disabled = false;
    }
  }
  async function saveDataTab(kind) {
    const [key, label] = DATA_MAP[kind];
    const el = $('#' + kind + 'Json');
    let arr;
    try {
      arr = JSON.parse(el.value);
      if (!Array.isArray(arr)) throw new Error('必须是数组');
    } catch (e) {
      setStatus('JSON 格式错误：' + e.message, 'err');
      return;
    }
    try {
      await postJson('/api/site-data/sync', { target: key, items: arr });
      setStatus(`${label}已保存（${arr.length} 条）`, 'ok');
      addOp(`更新${label}数据：${arr.length} 条`);
    } catch (e) { setStatus('保存失败：' + e.message, 'err'); }
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

  /* ============ 暴露给 HTML 内联调用 ============ */
  Object.assign(window, {
    goTab, newPost, openPost, backToPosts, delPost, toggleMdView,
    newMoment, openMoment, backToMoments, delMoment,
    loadDataTab, saveDataTab, addMusic, delMusic, saveMusic, loadMusicTab
  });

  /* ============ 初始化 ============ */
  initPicbed();
  goTab('dash');
})();