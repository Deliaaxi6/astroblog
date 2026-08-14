/* AstroBlog CMS 管理台逻辑 */
var statusEl = document.getElementById('status');

function setStatus(msg, cls) {
  statusEl.className = cls || 'info';
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
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

/* ============ Tab 切换 ============ */
var tabs = document.querySelectorAll('#tabs button');
tabs.forEach(function (btn) {
  btn.addEventListener('click', function () {
    tabs.forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('show'); });
    document.getElementById('panel-' + btn.dataset.tab).classList.add('show');
    statusEl.style.display = 'none';
    if (btn.dataset.tab === 'posts' && !postListLoaded) loadPosts();
    if (btn.dataset.tab === 'moments' && !momentListLoaded) loadMoments();
    if (btn.dataset.tab === 'friends') loadDataTab('friends');
    if (btn.dataset.tab === 'projects') loadDataTab('projects');
    if (btn.dataset.tab === 'albums') loadDataTab('albums');
  });
});

/* ============ 文章 ============ */
var postListLoaded = false;
var editingPostId = null;

function loadPosts() {
  postListLoaded = true;
  api('/api/posts/list').then(function (d) {
    var box = document.getElementById('postList');
    if (!d.success) { box.innerHTML = '<div class="empty">' + esc(d.message) + '</div>'; return; }
    if (!d.posts.length) { box.innerHTML = '<div class="empty">暂无文章，点击右上角新建</div>'; return; }
    box.innerHTML = d.posts.map(function (p) {
      var tags = (p.tags || []).map(function (t) { return '<span class="badge">' + esc(t) + '</span>'; }).join('');
      return '<div class="list-item">' +
        '<div class="list-main"><h4>' + (p.draft ? '<span class="badge draft">草稿</span>' : '') + esc(p.title) + '</h4>' +
        '<p><span class="badge date">' + esc(p.pubDate) + '</span>' + tags + esc(p.id) + ' · ' + p.wordCount + ' 字</p></div>' +
        '<div class="list-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="editPost(\'' + esc(p.id) + '\')">编辑</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deletePost(\'' + esc(p.id) + '\')">删除</button>' +
        '</div></div>';
    }).join('');
  }).catch(function () { document.getElementById('postList').innerHTML = '<div class="empty">后端未运行</div>'; });
}

function newPost() { editPost('new'); }

function editPost(id) {
  editingPostId = id;
  document.getElementById('postListCard').style.display = 'none';
  document.getElementById('postEditorCard').style.display = 'block';
  document.getElementById('postEditorTitle').textContent = id === 'new' ? '新建文章' : '编辑文章';
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
      '<div class="field"><label>正文（Markdown）</label><textarea id="f_content" rows="16">' + esc(fm.content || '') + '</textarea></div>' +
      '<div class="row">' +
      '<button class="btn btn-primary" onclick="savePost()">保存</button>' +
      (id !== 'new' ? '<button class="btn btn-danger" onclick="deletePost(editingPostId)">删除</button>' : '') +
      '<button class="btn btn-ghost" onclick="backToPosts()">取消</button>' +
      '</div>';
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
    if (!d.moments.length) { box.innerHTML = '<div class="empty">暂无说说，点击右上角新建</div>'; return; }
    box.innerHTML = d.moments.map(function (m) {
      var imgs = (m.images || []).length;
      return '<div class="list-item">' +
        '<div class="list-main"><h4>' + esc(m.content.slice(0, 60)) + (m.content.length > 60 ? '…' : '') + '</h4>' +
        '<p><span class="badge date">' + esc(m.date) + '</span>' +
        (m.location ? '<span class="badge">📍 ' + esc(m.location) + '</span>' : '') +
        (imgs ? '<span class="badge">' + imgs + ' 张图</span>' : '') + esc(m.id) + '</p></div>' +
        '<div class="list-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="editMoment(\'' + esc(m.id) + '\')">编辑</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteMoment(\'' + esc(m.id) + '\')">删除</button>' +
        '</div></div>';
    }).join('');
  }).catch(function () { document.getElementById('momentList').innerHTML = '<div class="empty">后端未运行</div>'; });
}

function newMoment() { editMoment('new'); }

function editMoment(id) {
  editingMomentId = id;
  document.getElementById('momentListCard').style.display = 'none';
  document.getElementById('momentEditorCard').style.display = 'block';
  document.getElementById('momentEditorTitle').textContent = id === 'new' ? '新建说说' : '编辑说说';
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
      '<button class="btn btn-primary" onclick="saveMoment()">保存</button>' +
      (id !== 'new' ? '<button class="btn btn-danger" onclick="deleteMoment(editingMomentId)">删除</button>' : '') +
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

/* 初始加载 */
loadPosts();