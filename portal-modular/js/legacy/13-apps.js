(function () {
  'use strict';

  /* Apps fijas del portal. Las apps nuevas se guardan en db.externalApps y se
   * sincronizan como una colección más. El icono se sube al Storage y solo se
   * guarda su URL, nunca el archivo embebido. */
  var BUILTIN_APPS = [
    {
      id: 'vertice',
      name: 'Vértice',
      description: 'Videoconferencias seguras con agenda, salas protegidas por contraseña, lobby de acceso y minutas automáticas con IA.',
      url: 'https://sumitims.base44.app',
      icon: 'fa-video',
      tag: 'Base44',
      note: 'Los anfitriones inician sesión con su cuenta de Base44. Los invitados entran con la liga y la contraseña de la sala, sin crear cuenta.'
    }
  ];

  var ADMIN_ROLES = ['admin', 'gm', 'desarrollador', 'editor'];
  var iconPreviewUrl = '';
  var editingId = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeUrl(raw) {
    var value = String(raw || '').trim();
    if (!value) return '';
    if (/^\/\//.test(value)) value = 'https:' + value;
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
    try {
      var url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch (e) { return ''; }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return String(url || ''); }
  }

  function canManageApps() {
    try {
      var role = String((typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '').toLowerCase();
      return ADMIN_ROLES.indexOf(role) >= 0;
    } catch (e) { return false; }
  }

  function customApps() {
    try {
      if (typeof db === 'undefined' || !db || !Array.isArray(db.externalApps)) return [];
      return db.externalApps;
    } catch (e) { return []; }
  }

  function ensureCustomApps() {
    if (typeof db === 'undefined' || !db) {
      throw new Error('La base de datos todavía no está lista. Recarga la página e inténtalo de nuevo.');
    }
    if (!Array.isArray(db.externalApps)) db.externalApps = [];
    return db.externalApps;
  }

  function getApps() {
    var overrides = {};
    customApps().forEach(function (app) {
      if (app && app.overrideOf) overrides[String(app.overrideOf)] = app;
    });
    var apps = BUILTIN_APPS.map(function (base) {
      var override = overrides[String(base.id)];
      return override && override.description
        ? Object.assign({}, base, { description: override.description })
        : Object.assign({}, base);
    });
    customApps().forEach(function (app) {
      if (!app || app.overrideOf || !app.name || !app.url) return;
      var url = normalizeUrl(app.url);
      if (!url) return;
      apps.push(Object.assign({}, app, { url: url, custom: true }));
    });
    return apps;
  }

  function card(app, manage) {
    var tag = app.tag ? '<span class="apps-tag">' + esc(app.tag) + '</span>' : '';
    var note = app.note ? '<p class="apps-note">' + esc(app.note) + '</p>' : '';
    var description = app.description ? '<p class="apps-description">' + esc(app.description) + '</p>' : '';
    var icon = app.iconUrl
      ? '<span class="apps-icon apps-icon-photo" aria-hidden="true"><img src="' + esc(app.iconUrl) + '" alt="" loading="lazy"></span>'
      : '<span class="apps-icon" aria-hidden="true"><i class="fas ' + esc(app.icon || 'fa-cube') + '"></i></span>';
    var edit = manage
      ? '<button type="button" class="apps-edit" data-apps-edit="' + esc(app.id) + '" aria-label="Editar descripción de ' + esc(app.name) + '"><i class="fas fa-pen" aria-hidden="true"></i> Editar</button>'
      : '';
    return '<article class="apps-card" data-app-id="' + esc(app.id) + '">'
      + '<div class="apps-card-top">' + icon + tag + '</div>'
      + '<h2>' + esc(app.name) + '</h2>'
      + description
      + note
      + '<div class="apps-card-foot"><span class="apps-domain">' + esc(hostOf(app.url)) + '</span>'
      + '<div class="apps-card-actions">' + edit
      + '<a class="apps-open" href="' + esc(normalizeUrl(app.url) || '#') + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir ' + esc(app.name) + ' en otra pestaña">'
      + 'Abrir app <i class="fas fa-up-right-from-square"></i></a></div></div>'
      + '</article>';
  }

  function formHtml() {
    return '<div id="apps-form-wrap" class="apps-form-wrap" hidden>'
      + '<form id="apps-form" class="apps-form" novalidate autocomplete="off">'
      + '<div class="apps-form-head"><div><p class="apps-eyebrow">NUEVA APP</p><h2>Agregar app</h2></div>'
      + '<button type="button" class="apps-btn apps-btn-ghost" data-apps-cancel>Cancelar</button></div>'
      + '<div class="apps-form-grid">'
      + '<label class="apps-field">Nombre<input id="apps-name" type="text" maxlength="60" placeholder="Ej. Portal de proveedores" required></label>'
      + '<label class="apps-field">URL<input id="apps-url" type="url" maxlength="500" placeholder="https://..." required></label>'
      + '</div>'
      + '<label class="apps-field">Descripción<textarea id="apps-description" rows="3" maxlength="240" placeholder="Para qué sirve y quién la usa." required></textarea></label>'
      + '<div class="apps-form-row">'
      + '<label class="apps-field">Etiqueta <span class="apps-optional">opcional</span><input id="apps-tag" type="text" maxlength="20" placeholder="Ej. Finanzas"></label>'
      + '<label class="apps-field">Icono <span class="apps-optional">opcional</span><input id="apps-icon-file" type="file" accept="image/png,image/jpeg,image/webp"><span class="apps-hint">PNG, JPG o WebP · máximo 5 MB</span></label>'
      + '</div>'
      + '<div class="apps-icon-row"><div id="apps-icon-preview" class="apps-icon apps-icon-preview" aria-hidden="true"><i class="fas fa-cube"></i></div>'
      + '<p class="apps-hint">Si no subes una imagen se usa un icono genérico. La imagen se sube al almacenamiento del portal y se guarda solo su URL.</p></div>'
      + '<p id="apps-form-error" class="apps-form-error" role="alert" hidden></p>'
      + '<div class="apps-form-actions"><button type="button" class="apps-btn apps-btn-ghost" data-apps-cancel>Cancelar</button>'
      + '<button id="apps-save" type="submit" class="apps-btn apps-btn-primary">Guardar app</button></div>'
      + '</form></div>';
  }

  function editFormHtml() {
    return '<div id="apps-edit-wrap" class="apps-form-wrap" hidden>'
      + '<form id="apps-edit-form" class="apps-form" novalidate autocomplete="off">'
      + '<div class="apps-form-head"><div><p class="apps-eyebrow">EDITAR APP</p><h2 id="apps-edit-title">Editar descripción</h2></div>'
      + '<button type="button" class="apps-btn apps-btn-ghost" data-apps-edit-cancel>Cancelar</button></div>'
      + '<label class="apps-field">Descripción<textarea id="apps-edit-description" rows="3" maxlength="240" placeholder="Para qué sirve y quién la usa." required></textarea></label>'
      + '<p id="apps-edit-error" class="apps-form-error" role="alert" hidden></p>'
      + '<div class="apps-form-actions"><button type="button" class="apps-btn apps-btn-ghost" data-apps-edit-cancel>Cancelar</button>'
      + '<button id="apps-edit-save" type="submit" class="apps-btn apps-btn-primary">Guardar descripción</button></div>'
      + '</form></div>';
  }

  function setEditError(message) {
    var box = document.getElementById('apps-edit-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function closeEdit() {
    editingId = '';
    setEditError('');
    var wrap = document.getElementById('apps-edit-wrap');
    if (wrap) wrap.hidden = true;
  }

  function findApp(id) {
    return getApps().filter(function (item) { return String(item.id) === String(id); })[0] || null;
  }

  function isBuiltinApp(id) {
    return BUILTIN_APPS.some(function (app) { return String(app.id) === String(id); });
  }

  function openEdit(id) {
    var app = findApp(id);
    if (!app) return;
    editingId = String(app.id);
    var wrap = document.getElementById('apps-edit-wrap');
    var input = document.getElementById('apps-edit-description');
    var title = document.getElementById('apps-edit-title');
    var addWrap = document.getElementById('apps-form-wrap');
    if (addWrap) addWrap.hidden = true;
    if (title) title.textContent = 'Editar descripción · ' + app.name;
    if (input) input.value = app.description || '';
    setEditError('');
    if (wrap) {
      wrap.hidden = false;
      if (input) setTimeout(function () { input.focus(); input.select(); }, 30);
    }
  }

  function setError(message) {
    var box = document.getElementById('apps-form-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setPreview(file) {
    if (iconPreviewUrl) {
      try { URL.revokeObjectURL(iconPreviewUrl); } catch (e) {}
      iconPreviewUrl = '';
    }
    var box = document.getElementById('apps-icon-preview');
    if (!box) return;
    if (!file) {
      box.innerHTML = '<i class="fas fa-cube"></i>';
      return;
    }
    iconPreviewUrl = URL.createObjectURL(file);
    box.innerHTML = '<img src="' + iconPreviewUrl + '" alt="Vista previa del icono">';
  }

  function validateIcon(file) {
    if (!file) return '';
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) return 'Usa una imagen PNG, JPG o WebP.';
    if (file.size > 5 * 1024 * 1024) return 'La imagen no puede pesar más de 5 MB.';
    return '';
  }

  function resetForm() {
    var form = document.getElementById('apps-form');
    if (form) form.reset();
    setPreview(null);
    setError('');
    var wrap = document.getElementById('apps-form-wrap');
    if (wrap) wrap.hidden = true;
    var add = document.getElementById('apps-add');
    if (add) add.setAttribute('aria-expanded', 'false');
  }

  function mount() {
    var add = document.getElementById('apps-add');
    var form = document.getElementById('apps-form');
    var wrap = document.getElementById('apps-form-wrap');
    if (!form || !wrap) return;

    if (add) {
      add.addEventListener('click', function () {
        wrap.hidden = false;
        add.setAttribute('aria-expanded', 'true');
        setError('');
        var name = document.getElementById('apps-name');
        if (name) setTimeout(function () { name.focus(); }, 30);
      });
    }

    form.querySelectorAll('[data-apps-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (saving) return;
        resetForm();
        if (add) add.focus();
      });
    });

    var fileInput = document.getElementById('apps-icon-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        var error = validateIcon(file);
        if (error) {
          fileInput.value = '';
          setPreview(null);
          setError(error);
          return;
        }
        setError('');
        setPreview(file || null);
      });
    }

    form.addEventListener('submit', onSubmit);

    var editForm = document.getElementById('apps-edit-form');
    if (editForm) {
      editForm.addEventListener('submit', onEditSubmit);
      editForm.querySelectorAll('[data-apps-edit-cancel]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (saving) return;
          closeEdit();
        });
      });
    }

    var grid = document.getElementById('apps-grid');
    if (grid) {
      grid.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-apps-edit]') : null;
        if (!btn) return;
        openEdit(btn.getAttribute('data-apps-edit'));
      });
    }
  }

  var saving = false;

  async function onSubmit(event) {
    event.preventDefault();
    if (saving) return;

    var form = event.currentTarget;
    var saveBtn = document.getElementById('apps-save');
    var nameEl = document.getElementById('apps-name');
    var urlEl = document.getElementById('apps-url');
    var descEl = document.getElementById('apps-description');
    var tagEl = document.getElementById('apps-tag');
    var fileInput = document.getElementById('apps-icon-file');
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;

    var name = String(nameEl && nameEl.value || '').trim().replace(/\s+/g, ' ');
    var description = String(descEl && descEl.value || '').trim();
    var tag = String(tagEl && tagEl.value || '').trim();
    var url = normalizeUrl(urlEl && urlEl.value);

    if (!name) return showFormError('Escribe el nombre de la app.');
    if (name.length > 60) return showFormError('El nombre no puede superar 60 caracteres.');
    if (!url) return showFormError('Escribe una URL válida que empiece con http:// o https://.');
    if (!description) return showFormError('Escribe una descripción breve.');
    if (description.length > 240) return showFormError('La descripción no puede superar 240 caracteres.');
    if (tag.length > 20) return showFormError('La etiqueta no puede superar 20 caracteres.');
    var iconError = validateIcon(file);
    if (iconError) return showFormError(iconError);
    if (getApps().some(function (app) { return normalizeUrl(app.url) === url; })) {
      return showFormError('Esa URL ya está en el catálogo.');
    }

    function showFormError(message) {
      setError(message);
      saving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar app'; }
    }

    saving = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = file ? 'Subiendo icono…' : 'Guardando…';
    }
    setError('');

    try {
      var iconUrl = '';
      if (file) {
        if (!window.Media || typeof window.Media.subir !== 'function') {
          throw new Error('La subida de imágenes no está disponible en este navegador.');
        }
        var uploaded = await window.Media.subir(file, { scope: 'externalApps', title: name });
        iconUrl = uploaded && uploaded.url ? String(uploaded.url) : '';
        if (!iconUrl) throw new Error('No se pudo obtener la URL del icono.');
      }

      var user = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
      ensureCustomApps().push({
        id: 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
        name: name,
        description: description,
        url: url,
        tag: tag,
        iconUrl: iconUrl,
        icon: 'fa-cube',
        custom: true,
        createdAt: new Date().toISOString(),
        createdBy: user ? user.id : null,
        createdByName: user ? (user.name || user.username || '') : ''
      });
      if (typeof saveDB === 'function') saveDB();
      else if (typeof window.saveDB === 'function') window.saveDB();
      try {
        if (window.BackendSync && typeof window.BackendSync.pushCollectionsImmediate === 'function') {
          window.BackendSync.pushCollectionsImmediate(['externalApps']);
        }
      } catch (e) { /* el guardado local ya quedó; sync lo reintenta */ }
      if (window.showToast) window.showToast('App agregada al catálogo', 'success');
      resetForm();
      if (typeof navigateTo === 'function') navigateTo('apps');
    } catch (error) {
      showFormError('No se pudo guardar la app: ' + (error && error.message ? error.message : 'error desconocido'));
    } finally {
      saving = false;
      if (saveBtn && form.isConnected) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar app';
      }
    }
  }

  async function onEditSubmit(event) {
    event.preventDefault();
    if (saving || !editingId) return;

    var input = document.getElementById('apps-edit-description');
    var saveBtn = document.getElementById('apps-edit-save');
    var description = String(input && input.value || '').trim().replace(/\s+/g, ' ');

    function fail(message) {
      setEditError(message);
      saving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar descripción'; }
    }

    if (!description) return fail('Escribe una descripción breve.');
    if (description.length > 240) return fail('La descripción no puede superar 240 caracteres.');
    var app = findApp(editingId);
    if (!app) return fail('Esa app ya no está en el catálogo.');

    saving = true;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; }
    setEditError('');

    try {
      var equipo = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
      var store = ensureCustomApps();
      var marca = new Date().toISOString();
      if (isBuiltinApp(app.id)) {
        var override = store.filter(function (item) { return item && String(item.overrideOf) === String(app.id); })[0];
        if (!override) {
          override = { id: 'ov-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), overrideOf: String(app.id), createdAt: marca };
          store.push(override);
        }
        override.description = description;
        override.updatedAt = marca;
        override.updatedBy = equipo ? equipo.id : null;
      } else {
        var target = store.filter(function (item) { return item && !item.overrideOf && String(item.id) === String(app.id); })[0];
        if (!target) throw new Error('No se encontró la app en el catálogo.');
        target.description = description;
        target.updatedAt = marca;
        target.updatedBy = equipo ? equipo.id : null;
      }
      if (typeof saveDB === 'function') saveDB();
      else if (typeof window.saveDB === 'function') window.saveDB();
      try {
        if (window.BackendSync && typeof window.BackendSync.pushCollectionsImmediate === 'function') {
          window.BackendSync.pushCollectionsImmediate(['externalApps']);
        }
      } catch (e) { /* el guardado local ya quedó; sync lo reintenta */ }
      if (window.showToast) window.showToast('Descripción actualizada', 'success');
      closeEdit();
      if (typeof navigateTo === 'function') navigateTo('apps');
    } catch (error) {
      fail('No se pudo guardar la descripción: ' + (error && error.message ? error.message : 'error desconocido'));
    } finally {
      saving = false;
      if (saveBtn && saveBtn.isConnected) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar descripción';
      }
    }
  }

  function renderAppsExternas() {
    var apps = getApps();
    var manage = canManageApps();
    var cards = apps.length
      ? apps.map(function (app) { return card(app, manage); }).join('')
      : '<div class="apps-empty"><i class="fas fa-cubes"></i><strong>Todavía no hay apps</strong><p>Agrega la primera entrada al catálogo.</p></div>';
    return '<div class="apps-shell">'
      + '<div class="apps-head"><div><p class="apps-eyebrow">GADGETS Y APPS</p>'
      + '<h1>Apps del equipo</h1>'
      + '<p class="apps-intro">Aplicaciones externas que usamos a diario. Cada una se abre en su propio sitio y conserva su inicio de sesión.</p></div>'
      + (manage ? '<div class="apps-head-actions"><button id="apps-add" type="button" class="apps-add" aria-expanded="false" aria-controls="apps-form-wrap"><i class="fas fa-plus"></i> Agregar app</button></div>' : '')
      + '</div>'
      + (manage ? formHtml() + editFormHtml() : '')
      + '<div id="apps-grid" class="apps-grid">' + cards + '</div>'
      + '<p class="apps-foot">' + (manage ? 'Las apps nuevas se guardan en el catálogo compartido. Los iconos se suben al almacenamiento del portal.' : 'Para sumar otra app, pide a dirección o al equipo de contenido.') + '</p>'
      + '</div>';
  }

  window.renderAppsExternas = renderAppsExternas;
  window.AppsExternas = { mount: mount, list: getApps };
})();
