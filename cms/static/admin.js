/* 纸上拾光 管理台 · 交互逻辑（档案柜版） */
var statusEl = document.getElementById('status');

function setStatus(msg, cls) {
  statusEl.className = 'show ' + (cls || 'info');
  statusEl.textContent = msg;
}

function api(path, payload) {
  var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  opts.body = JSON.stringify(payload || {});
  return fetch(path, opts).then(function (r) { return r.json(); });
}

function getApi(path) {
  return fetch(path).then(function (r) { return r.json(); });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============ 极简 Markdown 渲染（管理台预览用） ============ */
function mdInline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  return s;
}

function renderMd(src) {
  var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  var out = [], inCode = false, codeBuf = [], list = null, i, m;
  function closeList() {
    if (list) { out.push(list === 'ul' ? '</ul>' : '</ol>'); list = null; }
  }
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      closeList();
      out.push('<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>');
      continue;
    }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
    if (/^>\s?/.test(line)) {
      closeList();
      out.push('<blockquote>' + mdInline(line.replace(/^>\s?/, '')) + '</blockquote>');
      continue;
    }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + mdInline(m[1]) + '</li>');
      continue;
    }
    if ((m = /^\d+\.\s+(.*)$/.exec(line))) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + mdInline(m[1]) + '</li>');
      continue;
    }
    closeList();
    if (line.trim() !== '') out.push('<p>' + mdInline(line) + '</p>');
  }
  closeList();
  if (inCode) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
  return out.join('');
}

/* ============ 档案柜导航 ============ */
var tabs = document.querySelectorAll('#drawer button');

function goTab(name) {
  tabs.forEach(function (b) { b.classList.remove('active'); });
  var target = Array.prototype.filter.call(tabs, function (b) { return b.dataset.tab === name; })[0];
  if (target) target.classList.add('active');
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('show'); });
  document.getElementById('panel-' + name).classList.add('show');
  statusEl.className = '';
  if (name === 'posts' && !postListLoaded) loadPosts();
  if (name === 'moments' && !momentListLoaded) loadMoments();
  if (name === 'friends') loadDataTab('friends');
  if (name === 'projects') loadDataTab('projects');
  if (name === 'albums') loadDataTab('albums');
  if (name === 'music' && !musicListLoaded) loadMusicTab();
  if (name === 'dash' && !dashLoaded) loadDash();
}

tabs.forEach(function (btn) {
  btn.addEventListener('click', function () { goTab(btn.dataset.tab); });
});

/* ============ 档案总览（Dashboard） ============ */
var dashLoaded = false;

function loadDash() {
  dashLoaded = true;
  var grid = document.getElementById('statGrid');
  var rec = document.getElementById('recentPosts');
  rec.innerHTML = '<div class="empty">读取中…</div>';
  Promise.all([
    api('/api/posts/list').catch(function () { return {}; }),
    api('/api/moments/list').catch(function () { return {}; }),
    getApi('/api/site-data/all').catch(function () { return {}; }),
    getApi('/api/music/playlist').catch(function () { return {}; })
  ]).then(function (rs) {
    var posts = rs[0].posts || [];
    var moments = rs[1].moments || [];
    var data = rs[2].data || {};
    var songIds = rs[3].ids || [];
    var drafts = posts.filter(function (p) { return p.draft; }).length;
    var tagSet = {};
    posts.forEach(function (p) { (p.tags || []).forEach(function (t) { tagSet[t] = 1; }); });
    var vals = {
      '文章': posts.length, '说说': moments.length, '友链': (data.friends || []).length,
      '项目': (data.projects || []).length, '相册': (data.albums || []).length,
      '歌单': songIds.length, '草稿': drafts, '标签': Object.keys(tagSet).length
    };
    var i = 0;
    grid.querySelectorAll('.stat').forEach(function (s) {
      var num = s.querySelector('.num');
      var lbl = s.querySelector('.lbl');
      var key = lbl.textContent.replace('· ', '').trim();
      if (key in vals) num.textContent = vals[key];
      i++;
    });
    if (!posts.length) {
      rec.innerHTML = '<div class="empty">还没有文章。<br><b onclick="goTab(\'posts\');newPost()">写第一篇 →</b></div>';
      return;
    }
    var recent = posts.slice(0, 5).map(function (p, i) {
      return '<div class="list-item">' +
        '<div class="list-idx">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<div class="list-main"><h4>' + (p.draft ? '<span class="draft-mark">● 草稿</span>' : '') + esc(p.title) + '</h4>' +
        '<p><span class="badge mute">' + esc(p.pubDate) + '</span>' + esc(p.id) + '</p></div>' +
        '<div class="list-actions"><button class="btn btn-ghost btn-sm" onclick="goTab(\'posts\');editPost(\'' + esc(p.id) + '\')">编辑</button></div>' +
        '</div>';
    }).join('');
    rec.innerHTML = recent;
  });
}

/* ============ 音乐歌单 ============ */
var musicListLoaded = false;
var musicCache = [];

function loadMusicTab(force) {
  musicListLoaded = true;
  var box = document.getElementById('musicList');
  box.innerHTML = '<div class="empty">加载中…</div>';
  getApi('/api/music/playlist').then(function (d) {
    if (!d.success) { box.innerHTML = '<div class="empty">' + esc(d.message) + '</div>'; return; }
    if (!d.ids.length) {
      musicCache = [];
      box.innerHTML = '<div class="empty">歌单为空。<br><b onclick="document.getElementById(\'musicIdInput\').focus()">输入歌曲 ID 添加 →</b></div>';
      return;
    }
    getApi('/api/music?ids=' + d.ids.join(',')).then(function (list) {
      musicCache = (list || []).map(function (s) {
        return { id: s.id, name: s.name || '未知歌曲', artist: s.artist || '', cover: s.cover || '' };
      });
      renderMusicList();
    }).catch(function () { box.innerHTML = '<div class="empty">网易云元数据加载失败（网络问题），可稍后重试</div>'; });
  }).catch(function () { box.innerHTML = '<div class="empty">加载失败</div>'; });
}

function renderMusicList() {
  var box = document.getElementById('musicList');
  if (!musicCache.length) { box.innerHTML = '<div class="empty">歌单为空</div>'; return; }
  box.innerHTML = musicCache.map(function (s, i) {
    return '<div class="list-item">' +
      '<div class="list-idx">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<img class="music-cover" src="' + esc(s.cover) + '" alt="">' +
      '<div class="list-main"><h4>' + esc(s.name) + '</h4>' +
      '<p><span class="badge mute">' + esc(s.id) + '</span>' + esc(s.artist) + '</p></div>' +
      '<div class="list-actions"><button class="btn btn-seal btn-sm" onclick="removeMusic(' + i + ')">移除</button></div>' +
      '</div>';
  }).join('');
}

function addMusic() {
  var inp = document.getElementById('musicIdInput');
  var id = (inp.value || '').trim();
  if (!id) { setStatus('请输入歌曲 ID', 'err'); return; }
  getApi('/api/music?ids=' + encodeURIComponent(id)).then(function (list) {
    var s = list && list[0];
    if (!s || s.error) { setStatus('未找到该歌曲（ID 无效或网络异常）', 'err'); return; }
    if (musicCache.some(function (x) { return x.id === s.id; })) { setStatus('该歌曲已在歌单中', 'info'); return; }
    musicCache.push({ id: s.id, name: s.name, artist: s.artist, cover: s.cover });
    inp.value = '';
    renderMusicList();
    setStatus('已添加：' + s.name, 'ok');
  });
}

function removeMusic(i) {
  musicCache.splice(i, 1);
  renderMusicList();
  setStatus('已从歌单移除，点击"保存歌单"生效', 'info');
}

function saveMusic() {
  if (!musicCache.length) { setStatus('歌单为空，至少保留一首', 'err'); return; }
  api('/api/music/playlist', { ids: musicCache.map(function (s) { return s.id; }) }).then(function (d) {
    setStatus(d.success ? d.message : (d.message || '保存失败'), d.success ? 'ok' : 'err');
  });
}

/* ============ 文章 ============ */
var postListLoaded = false;
var editingPostId = null;

function loadPosts() {
  postListLoaded = true;
  api('/api/posts/list').then(function (d) {
    var box = document.getElementById('postList');
    if (!d.success) { box.innerHTML = '<div class="empty">' + esc(d.message) + '</div>'; return; }
    if (!d.posts.length) {
      box.innerHTML = '<div class="empty">还没有文章。<br><b onclick="newPost()">写第一篇 →</b></div>';
      return;
    }
    box.innerHTML = d.posts.map(function (p, i) {
      var tags = (p.tags || []).map(function (t) { return '<span class="badge hi">' + esc(t) + '</span>'; }).join('');
      return '<div class="list-item">' +
        '<div class="list-idx">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<div class="list-main"><h4>' + (p.draft ? '<span class="draft-mark">● 草稿</span>' : '') + esc(p.title) + '</h4>' +
        '<p><span class="badge mute">' + esc(p.pubDate) + '</span>' + tags + esc(p.id) + ' · ' + p.wordCount + ' 字</p></div>' +
        '<div class="list-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="editPost(\'' + esc(p.id) + '\')">编辑</button>' +
        '<button class="btn btn-seal btn-sm" onclick="deletePost(\'' + esc(p.id) + '\')">删除</button>' +
        '</div></div>';
    }).join('');
  }).catch(function () { document.getElementById('postList').innerHTML = '<div class="empty">后端未运行</div>'; });
}

function newPost() { editPost('new'); }

function bindLivePreview(box) {
  var ta = box.querySelector('#f_content');
  var pv = box.querySelector('#f_preview');
  if (!ta || !pv) return;
  var t = null;
  var render = function () { pv.innerHTML = renderMd(ta.value); };
  ta.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 250); });
  render();
}

function editPost(id) {
  editingPostId = id;
  document.getElementById('postListCard').style.display = 'none';
  document.getElementById('postEditorCard').style.display = 'block';
  document.getElementById('postEditorTitle').textContent = id === 'new' ? '写新文章' : '编辑文章';
  var box = document.getElementById('postEditor');
  box.innerHTML = '<div class="empty">加载中…</div>';
  var fill = function (fm) {
    fm = fm || {};
    var tags = (fm.tags || []).join(', ');
    box.innerHTML =
      '<div class="field"><label>ID（文件名，仅字母数字下划线连字符；留空自动生成）</label>' +
      '<input id="f_id" placeholder="如 my-new-post" value="' + esc(id !== 'new' ? id : '') + '"></div>' +
      '<div class="field"><label>标题</label><input id="f_title" value="' + esc(fm.title || '') + '"></div>' +
      '<div class="field-grid">' +
      '<div class="field"><label>日期（YYYY-MM-DD）</label><input id="f_pubDate" value="' + esc(fm.pubDate || '') + '"></div>' +
      '<div class="field"><label>标签（逗号分隔）</label><input id="f_tags" value="' + esc(tags) + '"></div>' +
      '</div>' +
      '<div class="field"><label>描述</label><input id="f_desc" value="' + esc(fm.description || '') + '"></div>' +
      '<div class="field"><label>封面图 URL</label><input id="f_cover" value="' + esc(fm.cover || '') + '"></div>' +
      '<div class="field field-check"><input type="checkbox" id="f_draft" ' + (fm.draft ? 'checked' : '') + '><label for="f_draft">草稿（不发布）</label></div>' +
      '<div class="field"><label>正文（Markdown，左侧书写右侧实时预览）</label></div>' +
      '<div class="pane">' +
      '<div class="pane-col"><div class="pane-cap">WRITE / 草稿纸</div>' +
      '<textarea id="f_content" rows="16">' + esc(fm.content || '') + '</textarea></div>' +
      '<div class="pane-col"><div class="pane-cap">PREVIEW / 成品页</div>' +
      '<div id="f_preview" class="md-preview">渲染中…</div></div>' +
      '</div>' +
      '<div class="row">' +
      '<button class="btn btn-hi" onclick="savePost()">保存更改</button>' +
      (id !== 'new' ? '<button class="btn btn-seal" onclick="deletePost(editingPostId)">删除</button>' : '') +
      '<button class="btn btn-ghost" onclick="backToPosts()">取消</button>' +
      '</div>';
    bindLivePreview(box);
  };
  if (id === 'new') { fill({}); return; }
  api('/api/posts/get', { id: id }).then(function (d) {
    if (!d.success) { box.innerHTML = '<div class="empty">' + esc(d.message) + '</div>'; return; }
    var fm = d.post.frontmatter || {};
    fm.content = d.post.content;
    fill(fm);
  }).catch(function () { box.innerHTML = '<div class="empty">后端未运行</div>'; });
}

function savePost() {
  var id = document.getElementById('f_id').value.trim();
  var fm = {
    title: document.getElementById('f_title').value.trim(),
    description: document.getElementById('f_desc').value.trim(),
    pubDate: document.getElementById('f_pubDate').value.trim(),
    tags: document.getElementById('f_tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
    cover: document.getElementById('f_cover').value.trim(),
    draft: document.getElementById('f_draft').checked
  };
  var content = document.getElementById('f_content').value;
  api('/api/posts/save', { id: id, frontmatter: fm, content: content }).then(function (d) {
    if (d.success) { setStatus(d.message + '（构建后生效）', 'ok'); backToPosts(); }
    else { setStatus(d.message, 'err'); }
  }).catch(function () { setStatus('请求失败，检查后端', 'err'); });
}

function deletePost(id) {
  if (!confirm('确定删除文章「' + id + '」？此操作不可撤销。')) return;
  api('/api/posts/delete', { id: id }).then(function (d) {
    setStatus(d.message, d.success ? 'ok' : 'err');
    backToPosts();
  }).catch(function () { setStatus('请求失败，检查后端', 'err'); });
}

function backToPosts() {
  postListLoaded = false;
  document.getElementById('postListCard').style.display = 'block';
  document.getElementById('postEditorCard').style.display = 'none';
  loadPosts();
}

/* ============ 说说 ============ */
var momentListLoaded = false;
var editingMomentId = null;

function loadMoments() {
  momentListLoaded = true;
  api('/api/moments/list').then(function (d) {
    var box = document.getElementById('momentList');
    if (!d.success) { box.innerHTML = '<div class="empty">' + esc(d.message) + '</div>'; return; }
    if (!d.moments.length) {
      box.innerHTML = '<div class="empty">还没有说说。<br><b onclick="newMoment()">写第一条 →</b></div>';
      return;
    }
    box.innerHTML = d.moments.map(function (m, i) {
      var imgs = (m.images || []).length;
      return '<div class="list-item">' +
        '<div class="list-idx">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<div class="list-main"><h4>' + esc(m.content.slice(0, 60)) + (m.content.length > 60 ? '…' : '') + '</h4>' +
        '<p><span class="badge mute">' + esc(m.date) + '</span>' +
        (m.location ? '<span class="badge seal">📍 ' + esc(m.location) + '</span>' : '') +
        (imgs ? '<span class="badge">' + imgs + ' 张图</span>' : '') + esc(m.id) + '</p></div>' +
        '<div class="list-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="editMoment(\'' + esc(m.id) + '\')">编辑</button>' +
        '<button class="btn btn-seal btn-sm" onclick="deleteMoment(\'' + esc(m.id) + '\')">删除</button>' +
        '</div></div>';
    }).join('');
  }).catch(function () { document.getElementById('momentList').innerHTML = '<div class="empty">后端未运行</div>'; });
}

function newMoment() { editMoment('new'); }

function editMoment(id) {
  editingMomentId = id;
  document.getElementById('momentListCard').style.display = 'none';
  document.getElementById('momentEditorCard').style.display = 'block';
  document.getElementById('momentEditorTitle').textContent = id === 'new' ? '写新说说' : '编辑说说';
  var box = document.getElementById('momentEditor');
  box.innerHTML = '<div class="empty">加载中…</div>';
  var fill = function (fm) {
    fm = fm || {};
    var imgs = (fm.images || []).join('\n');
    box.innerHTML =
      '<div class="field"><label>ID（留空自动生成）</label>' +
      '<input id="m_id" value="' + esc(id !== 'new' ? id : '') + '"></div>' +
      '<div class="field-grid">' +
      '<div class="field"><label>日期时间（YYYY-MM-DD HH:MM:SS）</label><input id="m_date" value="' + esc(fm.date || '') + '"></div>' +
      '<div class="field"><label>地点</label><input id="m_location" value="' + esc(fm.location || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>图片 URL（每行一个）</label><textarea id="m_images" rows="4" class="code">' + esc(imgs) + '</textarea></div>' +
      '<div class="field"><label>内容</label><textarea id="m_content" rows="6">' + esc(fm.content || '') + '</textarea></div>' +
      '<div class="row">' +
      '<button class="btn btn-hi" onclick="saveMoment()">保存更改</button>' +
      (id !== 'new' ? '<button class="btn btn-seal" onclick="deleteMoment(editingMomentId)">删除</button>' : '') +
      '<button class="btn btn-ghost" onclick="backToMoments()">取消</button>' +
      '</div>';
  };
  if (id === 'new') { fill({}); return; }
  api('/api/moments/list').then(function (d) {
    var m = (d.moments || []).filter(function (x) { return x.id === id; })[0];
    if (!m) { box.innerHTML = '<div class="empty">未找到该说说</div>'; return; }
    fill({ date: m.date, location: m.location, images: m.images, content: m.content });
  }).catch(function () { box.innerHTML = '<div class="empty">后端未运行</div>'; });
}

function saveMoment() {
  var id = document.getElementById('m_id').value.trim();
  var fm = {
    date: document.getElementById('m_date').value.trim(),
    location: document.getElementById('m_location').value.trim(),
    images: document.getElementById('m_images').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
  };
  var content = document.getElementById('m_content').value;
  api('/api/moments/save', { id: id, frontmatter: fm, content: content }).then(function (d) {
    if (d.success) { setStatus(d.message + '（构建后生效）', 'ok'); backToMoments(); }
    else { setStatus(d.message, 'err'); }
  }).catch(function () { setStatus('请求失败，检查后端', 'err'); });
}

function deleteMoment(id) {
  if (!confirm('确定删除这条说说？')) return;
  api('/api/moments/delete', { id: id }).then(function (d) {
    setStatus(d.message, d.success ? 'ok' : 'err');
    backToMoments();
  }).catch(function () { setStatus('请求失败，检查后端', 'err'); });
}

function backToMoments() {
  momentListLoaded = false;
  document.getElementById('momentListCard').style.display = 'block';
  document.getElementById('momentEditorCard').style.display = 'none';
  loadMoments();
}

/* ============ 数据 JSON 页（友链/项目/相册） ============ */
function loadDataTab(target) {
  getApi('/api/site-data/all').then(function (d) {
    if (!d.success) { setStatus(d.message, 'err'); return; }
    document.getElementById(target + 'Json').value = JSON.stringify(d.data[target] || [], null, 2);
  }).catch(function () { setStatus('后端未运行', 'err'); });
}

function saveDataTab(target) {
  var items;
  try { items = JSON.parse(document.getElementById(target + 'Json').value); }
  catch (e) { setStatus('JSON 格式错误: ' + e.message, 'err'); return; }
  api('/api/site-data/sync', { target: target, items: items }).then(function (d) {
    setStatus(d.message + '（构建后生效）', d.success ? 'ok' : 'err');
  }).catch(function () { setStatus('请求失败，检查后端', 'err'); });
}

/* ============ 图床（R2） ============ */
var file = null;
var drop = document.getElementById('dropZone');
var input = document.getElementById('fileInput');
var uploadBtn = document.getElementById('uploadBtn');
var resultEl = document.getElementById('result');

function pick(f) {
  if (!f) return;
  if (!/^image\//.test(f.type)) { setStatus('仅支持图片文件', 'err'); return; }
  if (f.size > 10 * 1024 * 1024) { setStatus('图片超过 10MB 限制', 'err'); return; }
  file = f;
  uploadBtn.disabled = false;
  setStatus('已选择: ' + f.name + ' (' + (f.size / 1024).toFixed(0) + ' KB)', 'info');
  resultEl.classList.remove('show');
}
drop.addEventListener('click', function () { input.click(); });
input.addEventListener('change', function () { pick(input.files[0]); });
drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
drop.addEventListener('drop', function (e) {
  e.preventDefault(); drop.classList.remove('drag');
  pick(e.dataTransfer.files[0]);
});

document.getElementById('testBtn').addEventListener('click', function () {
  setStatus('正在测试 R2 连接...', 'info');
  fetch('/api/picbed/test')
    .then(function (r) { return r.json(); })
    .then(function (d) { setStatus(d.message, d.success ? 'ok' : 'err'); })
    .catch(function () { setStatus('网络异常，无法连接后端', 'err'); });
});

uploadBtn.addEventListener('click', function () {
  if (!file) return;
  uploadBtn.disabled = true;
  setStatus('正在上传...', 'info');
  var fd = new FormData();
  fd.append('file', file);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/picbed/upload');
  xhr.onload = function () {
    uploadBtn.disabled = false;
    try {
      var d = JSON.parse(xhr.responseText);
      if (d.success) {
        setStatus('上传成功 ✓', 'ok');
        document.getElementById('preview').src = d.url;
        document.getElementById('url').value = d.url;
        resultEl.classList.add('show');
      } else { setStatus(d.message, 'err'); }
    } catch (e) { setStatus('响应解析失败', 'err'); }
  };
  xhr.onerror = function () {
    uploadBtn.disabled = false;
    setStatus('上传请求失败，检查后端是否运行', 'err');
  };
  xhr.send(fd);
});

document.getElementById('copyBtn').addEventListener('click', function () {
  var u = document.getElementById('url');
  u.select();
  if (navigator.clipboard) navigator.clipboard.writeText(u.value);
  setStatus('链接已复制到剪贴板 ✓', 'ok');
});

/* 初始加载：档案总览 */
loadDash();